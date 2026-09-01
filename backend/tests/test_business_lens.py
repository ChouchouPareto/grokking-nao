from fastapi.testclient import TestClient

from app import schemas
from app.main import app
from app.services import suggestions


client = TestClient(app)


def test_mock_directions_are_distinct_and_bounded():
    result = suggestions.mock_directions(schemas.DirectionRequest(seed_text="四川菜", thinking_mode="business"))
    assert 2 <= len(result) <= 3
    assert len({item.text for item in result}) == len(result)


def test_mock_business_lens_has_horizontal_vertical_and_insight():
    result = suggestions.mock_business_lens(schemas.BusinessLensRequest(idea_id="idea-1", seed_text="四川菜"))
    assert len(result.horizontal) == 5
    assert 5 <= len(result.vertical) <= 10
    assert 1 <= len(result.insights) <= 2
    assert {item.stage for item in result.vertical} >= {"upstream", "core", "downstream"}


def test_business_lens_rejects_sensitive_input():
    response = client.post("/api/v1/ai/business-lens", json={"idea_id": "idea-1", "seed_text": "如何实施犯罪"})
    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "content_blocked"


def test_clean_business_lens_rejects_short_invalid_output():
    try:
        suggestions.clean_business_lens({"horizontal": [], "vertical": [], "insights": []})
    except suggestions.ParseError:
        pass
    else:
        raise AssertionError("invalid lens output should be rejected")
