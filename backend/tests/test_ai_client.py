import asyncio

import pytest

from app.core.responses import AppError
from app.services import ai_client


def test_mock_mode_returns_chinese_without_calling_ai(monkeypatch):
    monkeypatch.setattr(ai_client.settings, "ai_mode", "mock")
    monkeypatch.setattr(ai_client.settings, "ai_api_url", "http://unused")

    text = asyncio.run(
        ai_client.recognize(
            video_bytes=b"video-data",
            filename="sign.webm",
            content_type="video/webm",
            session_id="session-001",
            scenario_id="medical",
            language="zh-TW",
        )
    )

    assert text == ai_client.MOCK_TEXT


def test_real_mode_requires_ai_url(monkeypatch):
    monkeypatch.setattr(ai_client.settings, "ai_mode", "real")
    monkeypatch.setattr(ai_client.settings, "ai_api_url", "")

    with pytest.raises(AppError, match="AI_API_URL is required in real mode"):
        asyncio.run(
            ai_client.recognize(
                video_bytes=b"video-data",
                filename="sign.webm",
                content_type="video/webm",
                session_id="session-001",
                scenario_id="medical",
                language="zh-TW",
            )
        )


def test_real_mode_forwards_video_and_returns_ai_text(monkeypatch):
    requests = []
    monkeypatch.setattr(ai_client.settings, "ai_mode", "real")
    monkeypatch.setattr(ai_client.settings, "ai_api_url", "http://ai.local/")

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, *, files, data):
            requests.append((url, files, data))

            class Response:
                status_code = 200

                @staticmethod
                def json():
                    return {
                        "success": True,
                        "data": {"text": "我要掛號"},
                        "error": None,
                    }

            return Response()

    monkeypatch.setattr(ai_client.httpx, "AsyncClient", lambda **_: MockClient())

    text = asyncio.run(
        ai_client.recognize(
            video_bytes=b"video-data",
            filename="sign.webm",
            content_type="video/webm",
            session_id="session-001",
            scenario_id="medical",
            language="zh-TW",
        )
    )

    assert text == "我要掛號"
    assert requests == [
        (
            "http://ai.local/api/recognize",
            {"video": ("sign.webm", b"video-data", "video/webm")},
            {
                "session_id": "session-001",
                "scenario_id": "medical",
                "language": "zh-TW",
            },
        )
    ]
