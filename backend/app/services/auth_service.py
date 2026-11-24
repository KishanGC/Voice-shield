import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.services.history_service import get_connection

PASSWORD_ROUNDS = 310_000
SESSION_HOURS = 12


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_ROUNDS
    )


def _public_user(row) -> dict:
    return {"id": row["id"], "email": row["email"], "full_name": row["full_name"]}


def _new_session(connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = _utcnow()
    connection.execute(
        "INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) "
        "VALUES (?, ?, ?, ?)",
        (
            token_hash,
            user_id,
            (now + timedelta(hours=SESSION_HOURS)).isoformat(),
            now.isoformat(),
        ),
    )
    return token


def register_user(email: str, full_name: str, password: str) -> tuple[str, dict]:
    normalized_email = email.strip().lower()
    clean_name = full_name.strip()
    if len(clean_name) < 2 or len(clean_name) > 80:
        raise HTTPException(status_code=422, detail="Name must be between 2 and 80 characters.")
    if len(password) < 12 or len(password) > 256:
        raise HTTPException(status_code=422, detail="Password must be between 12 and 256 characters.")

    salt = secrets.token_bytes(16)
    digest = _password_hash(password, salt)
    try:
        with get_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO users (email, full_name, password_salt, password_hash, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (normalized_email, clean_name, salt, digest, _utcnow().isoformat()),
            )
            user_id = cursor.lastrowid
            user_count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            # Existing pre-account records belong to the first local workspace owner.
            if user_count == 1:
                connection.execute(
                    "UPDATE analysis_history SET user_id = ? WHERE user_id IS NULL",
                    (user_id,),
                )
            token = _new_session(connection, user_id)
            row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            return token, _public_user(row)
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(status_code=409, detail="An account with this email already exists.") from error
        raise


def login_user(email: str, password: str) -> tuple[str, dict]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
        ).fetchone()
        if row is None or not secrets.compare_digest(
            _password_hash(password, row["password_salt"]), row["password_hash"]
        ):
            raise HTTPException(status_code=401, detail="Email or password is incorrect.")
        return _new_session(connection, row["id"]), _public_user(row)


def user_for_token(token: str) -> dict:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with get_connection() as connection:
        row = connection.execute(
            """SELECT users.id, users.email, users.full_name, auth_sessions.token_hash,
                      auth_sessions.expires_at
               FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id
               WHERE auth_sessions.token_hash = ?""",
            (digest,),
        ).fetchone()
        if row is None or datetime.fromisoformat(row["expires_at"]) <= _utcnow():
            if row is not None:
                connection.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (digest,))
            raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
        return _public_user(row)


def revoke_token(token: str) -> None:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with get_connection() as connection:
        connection.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (digest,))


def change_password(user_id: int, current_password: str, new_password: str) -> str:
    if len(new_password) < 12 or len(new_password) > 256:
        raise HTTPException(status_code=422, detail="New password must be between 12 and 256 characters.")
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None or not secrets.compare_digest(
            _password_hash(current_password, row["password_salt"]), row["password_hash"]
        ):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        salt = secrets.token_bytes(16)
        digest = _password_hash(new_password, salt)
        connection.execute(
            "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
            (salt, digest, user_id),
        )
        connection.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
        return _new_session(connection, user_id)
