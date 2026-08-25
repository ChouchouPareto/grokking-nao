import json
import re
import uuid

from .. import schemas
from ..config import is_mock
from . import llm, prompts


class ParseError(Exception):
    """模型输出无法解析为建议数组。"""


def parse_suggestions(text: str) -> list[dict]:
    """宽容解析：剥代码围栏、截取首个 [ 到末 ]，再 json.loads。"""
    if not text:
        raise ParseError("空输出")
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    start = t.find("[")
    end = t.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ParseError("未找到 JSON 数组")
    try:
        data = json.loads(t[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ParseError("JSON 解析失败") from exc
    if not isinstance(data, list):
        raise ParseError("顶层不是数组")
    return data


def clean_suggestions(raw: list[dict], req: schemas.SuggestRequest) -> list[schemas.Suggestion]:
    """校验并清洗：截取最多 3 条、过滤非法类型/空内容、丢弃引用不存在节点的 edge。"""
    node_ids = {n.id for n in req.nodes}
    rejected = set(req.rejected_summary or [])
    out: list[schemas.Suggestion] = []
    for item in raw[:3]:
        if not isinstance(item, dict):
            continue
        stype = item.get("type")
        if stype not in ("node", "edge", "question"):
            continue
        content = str(item.get("content") or "").strip()
        reason = str(item.get("reason") or "").strip()
        if not content:
            continue
        if content in rejected:
            continue
        related = [r for r in (item.get("related_node_ids") or []) if r in node_ids]
        s = schemas.Suggestion(
            id=uuid.uuid4().hex,
            type=stype,
            content=content,
            reason=reason,
            related_node_ids=related,
        )
        if stype == "edge":
            src = item.get("source_node_id")
            tgt = item.get("target_node_id")
            if src not in node_ids or tgt not in node_ids or src == tgt:
                continue
            s.source_node_id = src
            s.target_node_id = tgt
            note = str(item.get("edge_note") or "").strip()
            s.edge_note = note or None
        out.append(s)
    return out


def mock_suggestions(req: schemas.SuggestRequest) -> list[schemas.Suggestion]:
    """无 Key 时的确定性示例，保证全链路可联调。"""
    node_ids = [n.id for n in req.nodes]
    texts = [n.text for n in req.nodes]
    rejected = set(req.rejected_summary or [])
    out: list[schemas.Suggestion] = []

    def add(s: schemas.Suggestion) -> None:
        if s.content not in rejected:
            out.append(s)

    if node_ids:
        joined = " ".join(texts)
        add(
            schemas.Suggestion(
                id=uuid.uuid4().hex,
                type="node",
                content="成本结构" if "成本" not in joined else "目标用户",
                reason="当前网络缺少一个可行性相关视角",
                related_node_ids=[node_ids[0]],
            )
        )

    existing = {(e.source_node_id, e.target_node_id) for e in req.edges}
    existing |= {(e.target_node_id, e.source_node_id) for e in req.edges}
    pair = None
    for i in range(len(node_ids)):
        for j in range(i + 1, len(node_ids)):
            if (node_ids[i], node_ids[j]) not in existing:
                pair = (node_ids[i], node_ids[j], texts[i], texts[j])
                break
        if pair:
            break
    if pair:
        add(
            schemas.Suggestion(
                id=uuid.uuid4().hex,
                type="edge",
                content=f"连接「{pair[2]}」与「{pair[3]}」",
                reason="这两个概念之间可能存在相互影响",
                related_node_ids=[pair[0], pair[1]],
                source_node_id=pair[0],
                target_node_id=pair[1],
                edge_note=None,
            )
        )

    if node_ids:
        add(
            schemas.Suggestion(
                id=uuid.uuid4().hex,
                type="question",
                content=f"换个角度看，「{texts[0]}」背后最大的假设是什么？",
                reason="挑战隐含假设",
                related_node_ids=[node_ids[0]],
            )
        )

    return out[:3]


async def generate_suggestions(req: schemas.SuggestRequest) -> list[schemas.Suggestion]:
    """生成建议：mock 或真实模型。模型失败抛 llm.LLMError，解析失败抛 ParseError。"""
    if is_mock():
        return mock_suggestions(req)

    messages = [
        {"role": "system", "content": prompts.SYSTEM_PROMPT},
        {"role": "user", "content": prompts.build_user_prompt(req)},
    ]
    text = await llm.chat(messages)
    raw = parse_suggestions(text)
    return clean_suggestions(raw, req)
