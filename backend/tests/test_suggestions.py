import pytest

from app import schemas
from app.services import suggestions


def _req(nodes=("n1", "生鲜"), edges=()):
    return schemas.SuggestRequest(
        idea_id="idea1",
        seed_text="做一个生鲜订阅服务",
        title="生鲜订阅服务",
        nodes=[schemas.NodeIn(id=i, text=t) for i, t in [nodes]],
        edges=[schemas.EdgeIn(source_node_id=s, target_node_id=t) for s, t in edges],
    )


class TestParse:
    def test_plain_json_array(self):
        text = '[{"type":"node","content":"冷链","reason":"缺履约","related_node_ids":["n1"]}]'
        data = suggestions.parse_suggestions(text)
        assert data[0]["content"] == "冷链"

    def test_strips_code_fence(self):
        text = '```json\n[{"type":"question","content":"谁收货？","reason":"假设"}]\n```'
        data = suggestions.parse_suggestions(text)
        assert data[0]["type"] == "question"

    def test_strips_surrounding_text(self):
        text = '以下是建议：[{"type":"node","content":"冷链","reason":"r"}] 以上。'
        data = suggestions.parse_suggestions(text)
        assert len(data) == 1

    def test_invalid_json_raises(self):
        with pytest.raises(suggestions.ParseError):
            suggestions.parse_suggestions("不是 JSON")

    def test_empty_raises(self):
        with pytest.raises(suggestions.ParseError):
            suggestions.parse_suggestions("")


class TestClean:
    def test_truncates_to_three(self):
        req = _req()
        raw = [
            {"type": "node", "content": f"x{i}", "reason": "r", "related_node_ids": []}
            for i in range(5)
        ]
        out = suggestions.clean_suggestions(raw, req)
        assert len(out) == 3

    def test_drops_invalid_type(self):
        req = _req()
        raw = [{"type": "connection", "content": "x", "reason": "r"}]
        assert suggestions.clean_suggestions(raw, req) == []

    def test_drops_edge_referencing_missing_node(self):
        req = _req()
        raw = [
            {
                "type": "edge",
                "content": "连接",
                "reason": "r",
                "source_node_id": "n1",
                "target_node_id": "n99",
            }
        ]
        assert suggestions.clean_suggestions(raw, req) == []

    def test_keeps_valid_edge(self):
        req = _req(nodes=("n1", "生鲜"), edges=())
        req.nodes.append(schemas.NodeIn(id="n2", text="价格"))
        raw = [
            {
                "type": "edge",
                "content": "连接",
                "reason": "r",
                "source_node_id": "n1",
                "target_node_id": "n2",
                "edge_note": "损耗",
            }
        ]
        out = suggestions.clean_suggestions(raw, req)
        assert len(out) == 1
        assert out[0].source_node_id == "n1"
        assert out[0].edge_note == "损耗"

    def test_skips_rejected_content(self):
        req = _req()
        req.rejected_summary = ["冷链"]
        raw = [{"type": "node", "content": "冷链", "reason": "r"}]
        assert suggestions.clean_suggestions(raw, req) == []


class TestMock:
    def test_mock_returns_structure(self):
        req = _req(nodes=("n1", "生鲜"))
        req.nodes.append(schemas.NodeIn(id="n2", text="价格"))
        req.nodes.append(schemas.NodeIn(id="n3", text="配送"))
        out = suggestions.mock_suggestions(req)
        assert 0 < len(out) <= 3
        assert all(s.type in ("node", "edge", "question") for s in out)

    def test_mock_skips_rejected(self):
        req = _req(nodes=("n1", "生鲜"))
        req.nodes.append(schemas.NodeIn(id="n2", text="价格"))
        req.nodes.append(schemas.NodeIn(id="n3", text="配送"))
        first = suggestions.mock_suggestions(req)
        req.rejected_summary = [s.content for s in first]
        second = suggestions.mock_suggestions(req)
        assert not set(s.content for s in second) & set(s.content for s in first)
