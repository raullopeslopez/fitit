from fastapi.testclient import TestClient

from app.web import web


def test_health_is_served_under_the_api_prefix():
    client = TestClient(web)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
