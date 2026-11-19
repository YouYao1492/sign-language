from fastapi.testclient import TestClient

from ai_model.main import MOCK_TEXT, app

client = TestClient(app)
FORM = {"session_id": "session-001", "scenario_id": "medical", "language": "zh-TW"}


def test_recognize_returns_contract_compatible_chinese_text():
    response = client.post(
        "/api/recognize",
        data=FORM,
        files={"video": ("sign.webm", b"video-data", "video/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"text": MOCK_TEXT},
        "error": None,
    }


def test_recognize_rejects_empty_video():
    response = client.post(
        "/api/recognize",
        data=FORM,
        files={"video": ("sign.webm", b"", "video/webm")},
    )

    assert response.status_code == 400
    assert response.json() == {
        "success": False,
        "data": None,
        "error": {"code": "VIDEO_INVALID", "message": "Invalid video"},
    }


def test_recognize_requires_all_form_fields():
    response = client.post(
        "/api/recognize",
        data={**FORM, "language": ""},
        files={"video": ("sign.webm", b"video-data", "video/webm")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
