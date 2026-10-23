
from app.models.user import User
from app.core.security import verify_password


def test_register_success(client, db_session):
    response = client.post(
        "/api/register",
        json={
            "email": "newuser@example.com",
            "password": "secure-password-123",
        },
    )

    assert response.status_code == 201

    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["email"] == "newuser@example.com"
    assert body["data"]["role"] == "deaf"
    assert isinstance(body["data"]["user_id"], int)

    user = (
        db_session.query(User)
        .filter_by(email="newuser@example.com")
        .one()
    )

    assert user.password_hash != "secure-password-123"
    assert verify_password(
        "secure-password-123",
        user.password_hash,
    )


def test_register_duplicate_email_returns_409(client, db_session):
    payload = {
        "email": "duplicate@example.com",
        "password": "secure-password-123",
    }

    first = client.post("/api/register", json=payload)
    second = client.post("/api/register", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409

    error = second.json()["error"]
    assert error["code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_email_is_case_insensitive(client):
    first = client.post(
        "/api/register",
        json={
            "email": "Person@example.com",
            "password": "secure-password-123",
        },
    )

    second = client.post(
        "/api/register",
        json={
            "email": "person@example.com",
            "password": "another-password-123",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 409


def test_register_invalid_email_returns_400(client):
    response = client.post(
        "/api/register",
        json={
            "email": "not-an-email",
            "password": "secure-password-123",
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_register_rejects_short_password(client):
    response = client.post(
        "/api/register",
        json={
            "email": "short@example.com",
            "password": "1234567",
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_register_rejects_staff_role_from_request(client, db_session):
    response = client.post(
        "/api/register",
        json={
            "email": "staff@example.com",
            "password": "secure-password-123",
            "role": "staff",
        },
    )

    assert response.status_code == 400

    user = (
        db_session.query(User)
        .filter_by(email="staff@example.com")
        .first()
    )
    assert user is None


def test_register_does_not_store_plaintext_password(client, db_session):
    password = "secure-password-123"

    response = client.post(
        "/api/register",
        json={
            "email": "hash@example.com",
            "password": password,
        },
    )

    assert response.status_code == 201

    user = (
        db_session.query(User)
        .filter_by(email="hash@example.com")
        .one()
    )

    assert user.password_hash != password
    assert verify_password(password, user.password_hash)
