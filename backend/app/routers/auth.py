
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.responses import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
)

router = APIRouter(
    prefix="/api",
    tags=["auth"],
)


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    normalized_email = str(request.email).lower()

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )

    if existing_user is not None:
        raise AppError(
            status_code=409,
            code="EMAIL_ALREADY_REGISTERED",
            message="Email is already registered",
        )

    user = User(
        name=request.name.strip(),
        email=normalized_email,
        password_hash=hash_password(request.password),
        role="deaf",
    )

    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(
            status_code=409,
            code="EMAIL_ALREADY_REGISTERED",
            message="Email is already registered",
        )

    db.refresh(user)

    return RegisterResponse(
        success=True,
        data={
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
        },
        error=None,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    normalized_email = str(request.email).lower()

    user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )

    if user is None or not verify_password(
        request.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )

    return LoginResponse(
        success=True,
        data={
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "token": token,
        },
        error=None,
    )


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
    }
