import os

# 測試一律用記憶體 SQLite，不會碰到 Supabase。必須在 import app 之前設定。
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.responses import AppError
from app.core.security import create_access_token
from app.main import app as fastapi_app
from app.models.message import Message
from app.models.session import Session as SessionModel
from app.models.user import User
from app.services import ai_client

AUTH = {"Authorization": "Bearer token-example"}
VIDEO = ("sign.webm", b"fake-video-bytes", "video/webm")


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = override_get_db
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(db_session):
    user = User(
        email="recognize@example.com",
        password_hash="unused",
        role="deaf",
    )
    other_user = User(
        email="other@example.com",
        password_hash="unused",
        role="staff",
    )
    db_session.add_all([user, other_user])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(other_user)

    db_session.add_all(
        [
            SessionModel(
                session_id="session-001",
                user_id=user.id,
                scenario_id="bank",
                language="zh-TW",
                status="active",
            ),
            SessionModel(
                session_id="session-completed",
                user_id=user.id,
                scenario_id="bank",
                language="zh-TW",
                status="completed",
            ),
            SessionModel(
                session_id="session-other",
                user_id=other_user.id,
                scenario_id="bank",
                language="zh-TW",
                status="active",
            ),
        ]
    )
    db_session.commit()

    token = create_access_token(user.id, user.email, user.role)
    return {"Authorization": f"Bearer {token}"}


def post(client, *, headers=AUTH, video=VIDEO, **form):
    data = {"session_id": "session-001", "scenario_id": "bank", "language": "zh-TW"}
    data.update(form)
    files = {"video": video} if video else None
    return client.post("/api/recognize", headers=headers, data=data, files=files)


def error_code(resp):
    body = resp.json()
    assert body["success"] is False and body["data"] is None
    return body["error"]["code"]


def test_success_returns_text_and_saves_message(client, db_session, auth_headers):
    resp = post(client, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "success": True,
        "data": {"text": ai_client.MOCK_TEXT},
        "error": None,
    }

    messages = db_session.scalars(select(Message)).all()
    assert len(messages) == 1
    m = messages[0]
    assert (m.session_id, m.text, m.sender_type, m.message_type) == (
        "session-001",
        ai_client.MOCK_TEXT,
        "deaf",
        "sign_recognition",
    )
    assert m.message_id is not None and m.created_at is not None


def test_no_token_401(client):
    resp = post(client, headers={})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid or expired token"


@pytest.mark.parametrize("missing", ["session_id", "scenario_id", "language"])
def test_missing_form_field_400(client, auth_headers, missing):
    resp = post(client, headers=auth_headers, **{missing: ""})
    assert resp.status_code == 400 and error_code(resp) == "INVALID_REQUEST"


def test_missing_video_400(client, auth_headers):
    resp = post(client, headers=auth_headers, video=None)
    assert resp.status_code == 400 and error_code(resp) == "INVALID_REQUEST"


def test_empty_video_400(client, auth_headers):
    resp = post(client, headers=auth_headers, video=("sign.webm", b"", "video/webm"))
    assert resp.status_code == 400 and error_code(resp) == "INVALID_REQUEST"


def test_session_not_found_404(client, auth_headers):
    resp = post(client, headers=auth_headers, session_id="nope")
    assert resp.status_code == 404 and error_code(resp) == "SESSION_NOT_FOUND"


def test_session_of_other_user_403(client, auth_headers):
    resp = post(client, headers=auth_headers, session_id="session-other")
    assert resp.status_code == 403 and error_code(resp) == "FORBIDDEN"


def test_completed_session_409(client, auth_headers):
    resp = post(client, headers=auth_headers, session_id="session-completed")
    assert resp.status_code == 409 and error_code(resp) == "SESSION_COMPLETED"


def test_scenario_not_found_404(client, auth_headers):
    resp = post(client, headers=auth_headers, scenario_id="unknown")
    assert resp.status_code == 404 and error_code(resp) == "SCENARIO_NOT_FOUND"


def test_ai_error_is_documented_error_and_no_message_saved(
    client, db_session, monkeypatch, auth_headers
):
    async def fake_recognize(**_):
        raise AppError(500, "SERVER_ERROR", "AI recognition timeout")

    monkeypatch.setattr(ai_client, "recognize", fake_recognize)
    resp = post(client, headers=auth_headers)
    assert resp.status_code == 500 and error_code(resp) == "SERVER_ERROR"
    assert resp.json()["error"]["message"] == "AI recognition timeout"
    assert db_session.scalars(select(Message)).all() == []
