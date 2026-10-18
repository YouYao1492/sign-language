from app.core.security import hash_password
from app.models.session import Session as SessionModel
from app.models.user import User


def create_user(
    db_session,
    email="test@example.com",
    password="password123",
    role="deaf",
):
    user = User(
        email=email,
        password_hash=hash_password(password),
        role=role,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def login_and_get_token(client, email, password="password123"):
    response = client.post(
        "/api/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["data"]["token"]


def create_session_for_user(
    db_session,
    user,
    session_id,
    scenario_id="bank",
    language="zh-TW",
    session_status="active",
):
    session = SessionModel(
        session_id=session_id,
        user_id=user.id,
        scenario_id=scenario_id,
        language=language,
        status=session_status,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_list_sessions_only_returns_current_users_sessions(client, db_session):
    user_a = create_user(db_session, email="a@example.com")
    user_b = create_user(db_session, email="b@example.com")

    create_session_for_user(db_session, user_a, "session-user-a")
    create_session_for_user(db_session, user_b, "session-user-b")

    token_a = login_and_get_token(client, "a@example.com")

    response = client.get(
        "/api/sessions",
        headers=auth_headers(token_a),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True

    returned_ids = {item["session_id"] for item in body["data"]}
    assert returned_ids == {"session-user-a"}
    assert "session-user-b" not in returned_ids


def test_list_sessions_returns_empty_list_when_user_has_none(client, db_session):
    create_user(db_session, email="empty@example.com")
    token = login_and_get_token(client, "empty@example.com")

    response = client.get(
        "/api/sessions",
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_get_own_session_success(client, db_session):
    user = create_user(db_session)
    create_session_for_user(db_session, user, "session-own")
    token = login_and_get_token(client, user.email)

    response = client.get(
        "/api/sessions/session-own",
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    assert response.json()["data"]["session_id"] == "session-own"


def test_get_other_users_session_returns_404(client, db_session):
    user_a = create_user(db_session, email="a@example.com")
    user_b = create_user(db_session, email="b@example.com")
    create_session_for_user(db_session, user_b, "session-user-b")
    token_a = login_and_get_token(client, user_a.email)

    response = client.get(
        "/api/sessions/session-user-b",
        headers=auth_headers(token_a),
    )

    assert response.status_code == 404


def test_update_own_session_success(client, db_session):
    user = create_user(db_session)
    create_session_for_user(db_session, user, "session-own")
    token = login_and_get_token(client, user.email)

    response = client.patch(
        "/api/sessions/session-own",
        headers=auth_headers(token),
        json={"scenario_id": "hospital", "language": "en"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["scenario_id"] == "hospital"
    assert data["language"] == "en"

    db_session.refresh(
        db_session.query(SessionModel).filter_by(session_id="session-own").one()
    )
    saved = db_session.query(SessionModel).filter_by(session_id="session-own").one()
    assert saved.scenario_id == "hospital"
    assert saved.language == "en"


def test_update_other_users_session_returns_404_and_does_not_change_it(
    client, db_session
):
    user_a = create_user(db_session, email="a@example.com")
    user_b = create_user(db_session, email="b@example.com")
    create_session_for_user(
        db_session,
        user_b,
        "session-user-b",
        scenario_id="bank",
    )
    token_a = login_and_get_token(client, user_a.email)

    response = client.patch(
        "/api/sessions/session-user-b",
        headers=auth_headers(token_a),
        json={"scenario_id": "hospital"},
    )

    assert response.status_code == 404

    saved = db_session.query(SessionModel).filter_by(session_id="session-user-b").one()
    assert saved.user_id == user_b.id
    assert saved.scenario_id == "bank"


def test_update_session_rejects_empty_body(client, db_session):
    user = create_user(db_session)
    create_session_for_user(db_session, user, "session-own")
    token = login_and_get_token(client, user.email)

    response = client.patch(
        "/api/sessions/session-own",
        headers=auth_headers(token),
        json={},
    )

    assert response.status_code == 422


def test_delete_own_session_success(client, db_session):
    user = create_user(db_session)
    create_session_for_user(db_session, user, "session-own")
    token = login_and_get_token(client, user.email)

    response = client.delete(
        "/api/sessions/session-own",
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"]["deleted"] is True

    saved = db_session.query(SessionModel).filter_by(session_id="session-own").first()
    assert saved is None


def test_delete_other_users_session_returns_404_and_keeps_it(client, db_session):
    user_a = create_user(db_session, email="a@example.com")
    user_b = create_user(db_session, email="b@example.com")
    create_session_for_user(db_session, user_b, "session-user-b")
    token_a = login_and_get_token(client, user_a.email)

    response = client.delete(
        "/api/sessions/session-user-b",
        headers=auth_headers(token_a),
    )

    assert response.status_code == 404

    saved = (
        db_session.query(SessionModel).filter_by(session_id="session-user-b").first()
    )
    assert saved is not None
    assert saved.user_id == user_b.id


def test_session_endpoints_require_authentication(client):
    assert client.get("/api/sessions").status_code == 401
    assert client.get("/api/sessions/session-x").status_code == 401
    assert (
        client.patch(
            "/api/sessions/session-x",
            json={"status": "completed"},
        ).status_code
        == 401
    )
    assert client.delete("/api/sessions/session-x").status_code == 401
