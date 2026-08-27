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

    def test_parses_new_object_contract(self):
        text = '{"intent_profile":{"primary_intent":"探索项目"},"suggestions":[{"type":"question","content":"如果反过来呢？","reason":"反事实","dimension":"反例"}]}'
        profile, items = suggestions.parse_result(text)
        assert profile["primary_intent"] == "探索项目"
        assert items[0]["dimension"] == "反例"


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
        out, profile = suggestions.mock_suggestions(req)
        assert 0 < len(out) <= 3
        assert all(s.type in ("node", "edge", "question") for s in out)
        assert profile.primary_intent
        assert all(s.content not in ("成本结构", "目标用户") for s in out)

    def test_mock_skips_rejected(self):
        req = _req(nodes=("n1", "生鲜"))
        req.nodes.append(schemas.NodeIn(id="n2", text="价格"))
        req.nodes.append(schemas.NodeIn(id="n3", text="配送"))
        first, _ = suggestions.mock_suggestions(req)
        req.rejected_summary = [s.content for s in first]
        second, _ = suggestions.mock_suggestions(req)
        assert not set(s.content for s in second) & set(s.content for s in first)

    def test_relation_probe_only_returns_edges_touching_trigger(self):
        req = _req(nodes=("n1", "生鲜"))
        req.nodes.append(schemas.NodeIn(id="n2", text="配送"))
        req.nodes.append(schemas.NodeIn(id="n3", text="社区"))
        req.mode = "relation_probe"
        req.trigger_node_ids = ["n3"]
        out, _ = suggestions.mock_suggestions(req)
        assert out
        assert all(s.type == "edge" for s in out)
        assert all("n3" in (s.source_node_id, s.target_node_id) for s in out)

    def test_intent_profile_changes_with_idea_type(self):
        project = _req(nodes=("n1", "产品"))
        project.title = "做一个创作工具"
        choice = _req(nodes=("n1", "留学"))
        choice.title = "要不要选择留学"
        assert suggestions.infer_intent(project).primary_intent != suggestions.infer_intent(choice).primary_intent

    def test_node_brainstorm_returns_three_nodes_around_focus(self):
        req = _req(nodes=("n1", "社区团长"))
        req.nodes.append(schemas.NodeIn(id="n2", text="冷链"))
        req.mode = "node_brainstorm"
        req.focused_node_id = "n1"
        out, _ = suggestions.mock_suggestions(req)
        assert len(out) == 3
        assert all(item.type == "node" for item in out)
        assert all(item.related_node_ids == ["n1"] for item in out)

    def test_summary_only_uses_supplied_graph(self):
        req = schemas.SummaryRequest(
            idea_id="i1",
            title="生鲜项目",
            nodes=[schemas.NodeIn(id="n1", text="社区团长"), schemas.NodeIn(id="n2", text="冷链")],
            edges=[schemas.EdgeIn(source_node_id="n1", target_node_id="n2", note="履约")],
        )
        result = suggestions.mock_summary(req)
        assert result.title.startswith("生鲜项目")
        assert result.themes == ["社区团长", "冷链"]
        assert "履约" in result.key_connections[0]
