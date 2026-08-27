from fastapi.testclient import TestClient

from app.main import app
from app.services import content_safety, suggestions


client = TestClient(app)


def test_blocks_political_sensitive_association_before_model_call():
    response = client.post(
        "/api/v1/ai/suggestions",
        json={
            "idea_id": "unsafe-1",
            "title": "国民党打败共产党",
            "nodes": [{"id": "n1", "text": "国民党"}],
            "mode": "deep_expand",
        },
    )
    assert response.status_code == 422
    error = response.json()["detail"]["error"]
    assert error["code"] == "content_blocked"
    assert error["category"] == "political_sensitive"


def test_normalization_blocks_spaced_sensitive_terms():
    assert content_safety.classify_text("共 产 党") == "political_sensitive"


def test_allows_normal_brainstorm_topic():
    assert content_safety.classify_text("如何改善社区生鲜配送体验") is None


def test_blocks_unsafe_model_suggestion_output():
    raw = [{"type": "node", "content": "制作爆炸物", "reason": "进一步展开"}]
    try:
        content_safety.ensure_suggestions_safe(raw)
    except content_safety.ContentSafetyError as exc:
        assert exc.category == "violence_crime"
    else:
        raise AssertionError("unsafe model output should be blocked")


def test_parses_structured_model_safety_refusal_as_block():
    text = '{"safety_refusal":{"blocked":true,"category":"violence_crime"},"intent_profile":null,"suggestions":[]}'
    try:
        suggestions.parse_result(text)
    except content_safety.ContentSafetyError as exc:
        assert exc.category == "violence_crime"
    else:
        raise AssertionError("structured model refusal should stop suggestion generation")


def test_detects_plain_text_model_safety_refusal():
    assert content_safety.looks_like_safety_refusal("抱歉，我不能提供这类违法内容的联想。")
