
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parents[2]
DATABASE_PATH = BASE_DIR / "voiceshield_history.db"


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS analysis_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                classification TEXT NOT NULL,
                spoof_probability REAL NOT NULL,
                risk_level TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                threshold_used REAL NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                full_name TEXT NOT NULL,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        # Add new columns without deleting existing history.
        existing_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(analysis_history)"
            ).fetchall()
        }

        new_columns = {
            "transcript": "TEXT",
            "language_code": "TEXT",
            "risk_score": "REAL",
            "security_action": "TEXT",
            "assessment_basis": "TEXT",
        }

        for column_name, column_type in new_columns.items():
            if column_name not in existing_columns:
                connection.execute(
                    f"ALTER TABLE analysis_history "
                    f"ADD COLUMN {column_name} {column_type}"
                )

        if "user_id" not in existing_columns:
            connection.execute(
                "ALTER TABLE analysis_history ADD COLUMN user_id INTEGER"
            )


def save_analysis(
    filename: str,
    analysis: dict,
    transcription: dict | None = None,
    user_id: int | None = None,
):
    created_at = datetime.now(timezone.utc).isoformat()

    transcription = transcription or {}

    with get_connection() as connection:
        cursor = connection.execute("""
            INSERT INTO analysis_history (
                filename,
                classification,
                spoof_probability,
                risk_level,
                recommendation,
                threshold_used,
                created_at,
                transcript,
                language_code,
                risk_score,
                security_action,
                assessment_basis
                , user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            filename,
            analysis["classification"],
            analysis["spoof_probability"],
            analysis["risk_level"],
            analysis["recommendation"],
            analysis["threshold_used"],
            created_at,
            transcription.get("transcript"),
            transcription.get("language_code"),
            analysis.get("risk_score"),
            analysis.get("security_action"),
            analysis.get("assessment_basis"),
            user_id
        ))

        return cursor.lastrowid


def get_history(user_id: int | None = None):
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, filename, classification, spoof_probability, risk_level,
                   recommendation, threshold_used, created_at, transcript,
                   language_code, risk_score, security_action, assessment_basis
            FROM analysis_history
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,),
        ).fetchall()

        return [dict(row) for row in rows]


def get_history_record(history_id: int, user_id: int | None = None):
    with get_connection() as connection:
        row = connection.execute("""
            SELECT id, filename, classification, spoof_probability, risk_level,
                   recommendation, threshold_used, created_at, transcript,
                   language_code, risk_score, security_action, assessment_basis
            FROM analysis_history
            WHERE id = ? AND user_id = ?
        """, (history_id, user_id)).fetchone()

        return dict(row) if row else None
