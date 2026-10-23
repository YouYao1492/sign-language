from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User


def create_user(db_session):
    user = User(
        email="test@example.com",
        password_hash=hash_password("password123"),
        role="deaf",
    )

    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    return user


def test_login_success(client, db_session):
    user = create_user(db_session)

    response = client.post(
        "/api/login",
        json={
            "email": user.email,
            "password": "password123",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert data["error"] is None

    assert data["data"]["user_id"] == user.id
    assert data["data"]["name"] == user.name
    assert data["data"]["email"] == user.email
    assert data["data"]["role"] == user.role

    assert data["data"]["token"]


def test_login_wrong_password(client, db_session):
    user = create_user(db_session)

    response = client.post(
        "/api/login",
        json={
            "email": user.email,
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_unknown_email(client):
    response = client.post(
        "/api/login",
        json={
            "email": "unknown@example.com",
            "password": "password123",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_login_invalid_email_format(client):
    response = client.post(
        "/api/login",
        json={
            "email": "not-an-email",
            "password": "password123",
        },
    )

    assert response.status_code == 400


def test_me_without_token(client, db_session):
    create_user(db_session)

    response = client.get("/api/me")

    assert response.status_code == 401


def test_me_with_invalid_token(client, db_session):
    create_user(db_session)

    response = client.get(
        "/api/me",
        headers={
            "Authorization": "Bearer invalid-token",
        },
    )

    assert response.status_code == 401


def test_me_with_valid_token(client, db_session):
    user = create_user(db_session)

    login_response = client.post(
        "/api/login",
        json={
            "email": user.email,
            "password": "password123",
        },
    )

    token = login_response.json()["data"]["token"]

    response = client.get(
        "/api/me",
        headers={
            "Authorization": f"Bearer {token}",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == user.id
    assert data["email"] == user.email
    assert data["role"] == user.role


def test_me_with_expired_token(client, db_session):
    user = create_user(db_session)

    expired_token = jwt.encode(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(
        "/api/me",
        headers={
            "Authorization": f"Bearer {expired_token}",
        },
    )

    assert response.status_code == 401


def test_me_when_user_does_not_exist(client):
    token = jwt.encode(
        {
            "sub": "999999",
            "email": "deleted@example.com",
            "role": "deaf",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(
        "/api/me",
        headers={
            "Authorization": f"Bearer {token}",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


def test_me_with_tampered_token(client, db_session):
    user = create_user(db_session)

    login_response = client.post(
        "/api/login",
        json={
            "email": user.email,
            "password": "password123",
        },
    )

    token = login_response.json()["data"]["token"]

    parts = token.split(".")
    tampered_token = ".".join(
        [
            parts[0],
            parts[1],
            "tampered-signature",
        ]
    )

    response = client.get(
        "/api/me",
        headers={
            "Authorization": f"Bearer {tampered_token}",
        },
    )

    assert response.status_code == 401
