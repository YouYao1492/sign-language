from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_and_verify():
    password = "test-password"

    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong-password", hashed)


def test_create_and_decode_access_token():
    token = create_access_token(
        user_id=123,
        email="test@example.com",
        role="deaf",
    )

    payload = decode_access_token(token)

    assert payload["sub"] == "123"
    assert payload["email"] == "test@example.com"
    assert payload["role"] == "deaf"
    assert "exp" in payload
