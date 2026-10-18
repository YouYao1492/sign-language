from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    data = response.json()

    assert response.status_code == 200
    assert data["success"] is True
    assert data["data"]["status"] == "ok"
    assert data["error"] is None
