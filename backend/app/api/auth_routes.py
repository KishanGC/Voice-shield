import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.services.auth_service import (
    login_user,
    change_password,
    register_user,
    revoke_token,
    user_for_token,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    full_name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=12, max_length=256)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


def validate_email(email: str) -> str:
    normalized = email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return normalized


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return user_for_token(credentials.credentials)


@router.post("/register")
def register(payload: RegisterRequest):
    token, user = register_user(
        validate_email(payload.email), payload.full_name, payload.password
    )
    return {"success": True, "token": token, "user": user}


@router.post("/login")
def login(payload: LoginRequest):
    token, user = login_user(validate_email(payload.email), payload.password)
    return {"success": True, "token": token, "user": user}


@router.get("/me")
def current_user(user: dict = Depends(get_current_user)):
    return {"success": True, "user": user}


@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    user: dict = Depends(get_current_user),
):
    del user
    revoke_token(credentials.credentials)
    return {"success": True, "message": "Signed out successfully."}


@router.patch("/password")
def update_password(
    payload: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
):
    token = change_password(user["id"], payload.current_password, payload.new_password)
    return {"success": True, "token": token, "message": "Password updated. Other sessions have been signed out."}
