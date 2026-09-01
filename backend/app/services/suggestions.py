import hashlib
import json
import re
import uuid

from .. import schemas
from ..config import is_mock
from . import content_safety, llm, prompts


class ParseError(Exception):
    """模型输出无法解析为约定结构。"""


def _extract_json(text: str):
    if not text:
        raise ParseError("空输出")
    value = text.strip()
    value = re.sub(r"^```(?:json)?\s*", "", value)
    value = re.sub(r"\s*```$", "", value)
    object_start, array_start = value.find("{"), value.find("[")
    if object_start != -1 and (array_start == -1 or object_start < array_start):
        end = value.rfind("}")
        fragment = value[object_start : end + 1]
    elif array_start != -1:
        end = value.rfind("]")
        fragment = value[array_start : end + 1]
    else:
        raise ParseError("未找到 JSON")
    try:
        return json.loads(fragment)
    except json.JSONDecodeError as exc:
        raise ParseError("JSON 解析失败") from exc


def parse_result(text: str) -> tuple[dict | None, list[dict]]:
    data = _extract_json(text)
    if isinstance(data, list):
        return None, data
    if not isinstance(data, dict) or not isinstance(data.get("suggestions", []), list):
        raise ParseError("顶层结构错误")
    refusal = data.get("safety_refusal")
    if isinstance(refusal, dict) and refusal.get("blocked") is True:
        raise content_safety.ContentSafetyError(str(refusal.get("category") or "sensitive_content"))
    profile = data.get("intent_profile")
    return profile if isinstance(profile, dict) else None, data.get("suggestions", [])


def parse_suggestions(text: str) -> list[dict]:
    return parse_result(text)[1]


def infer_intent(req: schemas.SuggestRequest) -> schemas.IntentProfile:
    text = " ".join([req.title, req.seed_text, *(node.text for node in req.nodes)])
    if any(word in text for word in ("选择", "比较", "决定", "要不要")):
        intent = "比较选项并形成判断"
        pool = ["判断标准", "机会成本", "可逆性", "长期影响", "未知风险", "第三种路径"]
    elif any(word in text for word in ("为什么", "问题", "解决", "困难", "改善")):
        intent = "理解并解决一个问题"
        pool = ["根因", "影响对象", "反馈回路", "边界条件", "反例", "可验证假设"]
    elif any(word in text for word in ("创作", "故事", "内容", "设计")):
        intent = "发展一个创作方向"
        pool = ["情绪张力", "叙事视角", "感官线索", "受众共鸣", "形式突破", "文化隐喻"]
    elif any(word in text for word in ("项目", "产品", "创业", "服务", "商业")):
        intent = "探索并构建一个新项目"
        pool = ["使用情境", "价值流动", "交付生态", "关键约束", "替代路径", "反常机会"]
    else:
        intent = "探索并理解一个主题"
        pool = ["核心概念", "参与者", "因果关系", "时间演化", "系统边界", "跨域类比"]
    edge_count, node_count = len(req.edges), len(req.nodes)
    if node_count < 4:
        stage = "发散"
    elif edge_count < max(1, node_count // 2):
        stage = "寻找关系"
    elif edge_count < node_count:
        stage = "建立结构"
    else:
        stage = "验证假设"
    present = pool[: min(2, max(1, edge_count))]
    missing = [item for item in pool if item not in present][:4]
    return schemas.IntentProfile(
        primary_intent=intent,
        thinking_stage=stage,
        dimensions_present=present,
        dimensions_missing=missing,
        confidence=0.68 if node_count >= 3 else 0.48,
    )


def clean_intent_profile(raw: dict | None, req: schemas.SuggestRequest) -> schemas.IntentProfile:
    fallback = infer_intent(req)
    if not raw:
        return fallback
    try:
        return schemas.IntentProfile(
            primary_intent=str(raw.get("primary_intent") or fallback.primary_intent).strip(),
            thinking_stage=str(raw.get("thinking_stage") or fallback.thinking_stage).strip(),
            dimensions_present=[str(x).strip() for x in raw.get("dimensions_present", []) if str(x).strip()][:6],
            dimensions_missing=[str(x).strip() for x in raw.get("dimensions_missing", []) if str(x).strip()][:6],
            confidence=float(raw.get("confidence", fallback.confidence)),
        )
    except (TypeError, ValueError):
        return fallback


def clean_suggestions(raw: list[dict], req: schemas.SuggestRequest) -> list[schemas.Suggestion]:
    content_safety.ensure_suggestions_safe(raw)
    node_ids = {node.id for node in req.nodes}
    trigger_ids = set(req.trigger_node_ids)
    rejected = set(req.rejected_summary or [])
    out: list[schemas.Suggestion] = []
    for item in raw:
        if len(out) >= 3:
            break
        if not isinstance(item, dict):
            continue
        suggestion_type = item.get("type")
        if suggestion_type not in ("node", "edge", "question"):
            continue
        if req.mode == "relation_probe" and suggestion_type != "edge":
            continue
        if req.mode == "node_brainstorm" and suggestion_type != "node":
            continue
        content = str(item.get("content") or "").strip()
        reason = str(item.get("reason") or "").strip()
        dimension = str(item.get("dimension") or "跨维联系").strip()
        if not content or content in rejected:
            continue
        related = [value for value in (item.get("related_node_ids") or []) if value in node_ids]
        suggestion = schemas.Suggestion(
            id=uuid.uuid4().hex,
            type=suggestion_type,
            content=content,
            reason=reason,
            dimension=dimension,
            related_node_ids=related,
        )
        if suggestion_type == "edge":
            source, target = item.get("source_node_id"), item.get("target_node_id")
            if source not in node_ids or target not in node_ids or source == target:
                continue
            if req.mode == "relation_probe" and trigger_ids and source not in trigger_ids and target not in trigger_ids:
                continue
            suggestion.source_node_id = source
            suggestion.target_node_id = target
            suggestion.edge_note = str(item.get("edge_note") or "").strip() or None
            suggestion.relation = str(item.get("relation") or suggestion.edge_note or "潜在关联").strip()
            try:
                suggestion.strength = max(0, min(1, float(item.get("strength", 0.6))))
            except (TypeError, ValueError):
                suggestion.strength = 0.6
        out.append(suggestion)
    return out


def _stable_pick(values: list[str], seed: str, index: int) -> str:
    if not values:
        return "跨维联系"
    digest = hashlib.sha256(f"{seed}:{index}".encode()).digest()
    return values[int.from_bytes(digest[:2], "big") % len(values)]


def _unconnected_pairs(req: schemas.SuggestRequest, trigger_only: bool = False):
    existing = {(edge.source_node_id, edge.target_node_id) for edge in req.edges}
    existing |= {(b, a) for a, b in existing}
    trigger_ids = set(req.trigger_node_ids)
    pairs = []
    for index, first in enumerate(req.nodes):
        for second in req.nodes[index + 1 :]:
            if (first.id, second.id) in existing:
                continue
            if trigger_only and trigger_ids and first.id not in trigger_ids and second.id not in trigger_ids:
                continue
            pairs.append((first, second))
    return pairs


def mock_suggestions(req: schemas.SuggestRequest) -> tuple[list[schemas.Suggestion], schemas.IntentProfile]:
    profile = infer_intent(req)
    if req.mode == "intent_profile":
        return [], profile
    rejected = set(req.rejected_summary or [])
    result: list[schemas.Suggestion] = []
    dimensions = profile.dimensions_missing or ["跨维联系", "反例"]
    if req.mode == "node_brainstorm":
        anchor = next((node for node in req.nodes if node.id == req.focused_node_id), None)
        if not anchor:
            return [], profile
        lenses = ["反向假设", "跨域类比", "连锁后果"]
        return [
            schemas.Suggestion(
                id=uuid.uuid4().hex,
                type="node",
                content=f"{lens}：{anchor.text}",
                reason=f"从“{lens}”方向继续发散",
                dimension=lens,
                related_node_ids=[anchor.id],
            )
            for lens in lenses
        ], profile
    pairs = _unconnected_pairs(req, trigger_only=req.mode == "relation_probe")
    if pairs:
        first, second = pairs[0]
        dimension = _stable_pick(dimensions, req.seed_text, 0)
        content = f"连接「{first.text}」与「{second.text}」"
        if content not in rejected:
            result.append(
                schemas.Suggestion(
                    id=uuid.uuid4().hex,
                    type="edge",
                    content=content,
                    reason=f"从“{dimension}”看，两者可能互相改变成立条件",
                    dimension=dimension,
                    related_node_ids=[first.id, second.id],
                    source_node_id=first.id,
                    target_node_id=second.id,
                    edge_note=f"{first.text}如何影响{second.text}？",
                    relation="条件影响",
                    strength=0.62,
                )
            )
    if req.mode == "relation_probe":
        return result[:3], profile
    if req.nodes:
        anchor = req.nodes[0]
        dimension = _stable_pick(dimensions, req.seed_text, 1)
        content = f"从{dimension}重新看「{anchor.text}」"
        if content not in rejected:
            result.append(
                schemas.Suggestion(
                    id=uuid.uuid4().hex,
                    type="node",
                    content=content,
                    reason=f"当前网络在“{dimension}”上的信息较少",
                    dimension=dimension,
                    related_node_ids=[anchor.id],
                )
            )
        question_dimension = _stable_pick(dimensions, req.seed_text, 2)
        question = f"如果“{anchor.text}”的核心假设不成立，会出现什么新路径？"
        if question not in rejected:
            result.append(
                schemas.Suggestion(
                    id=uuid.uuid4().hex,
                    type="question",
                    content=question,
                    reason="用反事实检验当前网络的隐含前提",
                    dimension=question_dimension,
                    related_node_ids=[anchor.id],
                )
            )
    return result[:3], profile


async def generate_suggestions(
    req: schemas.SuggestRequest,
) -> tuple[list[schemas.Suggestion], schemas.IntentProfile]:
    content_safety.ensure_request_safe(req)
    if is_mock():
        return mock_suggestions(req)
    messages = [
        {"role": "system", "content": prompts.SYSTEM_PROMPT},
        {"role": "user", "content": prompts.build_user_prompt(req)},
    ]
    text = await llm.chat(messages)
    try:
        raw_profile, raw_suggestions = parse_result(text)
    except ParseError:
        if content_safety.looks_like_safety_refusal(text):
            raise content_safety.ContentSafetyError()
        repair_messages = [
            *messages,
            {"role": "assistant", "content": text},
            {"role": "user", "content": "上一次输出无法解析。请严格按约定只返回一个完整 JSON 对象，不要解释，不要 Markdown。"},
        ]
        try:
            repaired_text = await llm.chat(repair_messages)
            raw_profile, raw_suggestions = parse_result(repaired_text)
        except ParseError:
            if content_safety.looks_like_safety_refusal(repaired_text):
                raise content_safety.ContentSafetyError()
            # 连续无法解析时不再用本地模板扩写，避免绕过模型主动拒绝。
            return [], infer_intent(req)
    return clean_suggestions(raw_suggestions, req), clean_intent_profile(raw_profile, req)


def mock_summary(req: schemas.SummaryRequest) -> schemas.SummaryContent:
    node_names = [node.text for node in req.nodes]
    connection_count = len(req.edges)
    return schemas.SummaryContent(
        title=f"{req.title or '当前想法'} · 阶段总结",
        overview=f"当前围绕 {len(node_names)} 个关键词展开，已经形成 {connection_count} 条明确连接。",
        themes=node_names[:3],
        key_connections=[
            f"{edge.source_node_id} 与 {edge.target_node_id}" + (f"：{edge.note}" if edge.note else "")
            for edge in req.edges[:3]
        ],
        open_questions=["哪些假设仍需要现实信息验证？"],
        next_directions=["选择一个关键节点继续发散", "寻找跨分支的新连接"],
    )


async def generate_summary(req: schemas.SummaryRequest) -> schemas.SummaryContent:
    if is_mock():
        return mock_summary(req)
    messages = [
        {"role": "system", "content": prompts.SUMMARY_SYSTEM_PROMPT},
        {"role": "user", "content": prompts.build_summary_prompt(req)},
    ]
    text = await llm.chat(messages)
    try:
        raw = _extract_json(text)
    except ParseError:
        repair_messages = [
            *messages,
            {"role": "assistant", "content": text},
            {"role": "user", "content": "请只返回完整 JSON 对象，不要解释或 Markdown。"},
        ]
        try:
            raw = _extract_json(await llm.chat(repair_messages))
        except ParseError:
            return mock_summary(req)
    if not isinstance(raw, dict):
        raise ParseError("总结顶层结构错误")
    try:
        return schemas.SummaryContent(
            title=str(raw.get("title") or f"{req.title} · 阶段总结").strip(),
            overview=str(raw.get("overview") or "").strip(),
            themes=[str(item).strip() for item in raw.get("themes", []) if str(item).strip()][:5],
            key_connections=[str(item).strip() for item in raw.get("key_connections", []) if str(item).strip()][:5],
            open_questions=[str(item).strip() for item in raw.get("open_questions", []) if str(item).strip()][:5],
            next_directions=[str(item).strip() for item in raw.get("next_directions", []) if str(item).strip()][:5],
        )
    except (TypeError, ValueError) as exc:
        raise ParseError("总结字段错误") from exc


def _check_refusal(data: dict) -> None:
    refusal = data.get("safety_refusal")
    if isinstance(refusal, dict) and refusal.get("blocked") is True:
        raise content_safety.ContentSafetyError(str(refusal.get("category") or "sensitive_content"))


def _clean_short(value, limit: int = 120) -> str:
    return str(value or "").strip()[:limit]


def mock_directions(req: schemas.DirectionRequest) -> list[schemas.DirectionCandidate]:
    if req.thinking_mode == "business":
        values = [
            ("沿价值流寻找被忽略的获利环节", "把主题放进完整交易与交付链路中观察"),
            ("寻找共享客群但不同场景的相邻业态", "跨场景连接更容易出现组合机会"),
            ("从最脆弱的供应环节反推新方案", "约束常比功能更能暴露真实机会"),
        ]
    else:
        values = [
            ("把最自然的答案完全反过来", "用反转打破已有路径依赖"),
            ("借用一个毫不相关领域的规则", "跨域类比可能带来意外连接"),
            ("换成局外人的视角重新描述", "视角变化会改变问题边界"),
        ]
    return [schemas.DirectionCandidate(id=uuid.uuid4().hex, text=text, reason=reason) for text, reason in values]


def clean_directions(raw: object) -> list[schemas.DirectionCandidate]:
    if not isinstance(raw, list):
        raise ParseError("方向候选结构错误")
    items: list[schemas.DirectionCandidate] = []
    for item in raw:
        if len(items) >= 3:
            break
        if not isinstance(item, dict):
            continue
        text = _clean_short(item.get("text"), 80)
        reason = _clean_short(item.get("reason"), 120)
        if text and reason and text not in {candidate.text for candidate in items}:
            items.append(schemas.DirectionCandidate(id=uuid.uuid4().hex, text=text, reason=reason))
    content_safety.ensure_text_safe(*(f"{item.text} {item.reason}" for item in items))
    return items


async def generate_directions(req: schemas.DirectionRequest) -> list[schemas.DirectionCandidate]:
    content_safety.ensure_text_safe(req.seed_text, req.location_label)
    if is_mock():
        return mock_directions(req)
    text = await llm.chat([
        {"role": "system", "content": prompts.DIRECTION_SYSTEM_PROMPT},
        {"role": "user", "content": prompts.build_direction_prompt(req)},
    ])
    data = _extract_json(text)
    if not isinstance(data, dict):
        raise ParseError("方向顶层结构错误")
    _check_refusal(data)
    return clean_directions(data.get("candidates", []))


def mock_business_lens(req: schemas.BusinessLensRequest) -> schemas.BusinessLensContent:
    theme = req.seed_text.strip()[:40]
    horizontal = [
        ("相邻消费场景", "共享客群"),
        ("互补服务", "互补"),
        ("替代解决方案", "替代"),
        ("内容与体验", "跨界组合"),
        ("社区渠道", "共享渠道"),
    ]
    vertical = [
        ("原料与供给", "upstream"), ("筛选与采购", "upstream"),
        ("产品与体验设计", "core"), ("生产交付", "core"),
        ("渠道触达", "downstream"), ("复购与口碑", "downstream"),
        ("数据与工具", "support"),
    ]
    return schemas.BusinessLensContent(
        horizontal=[schemas.HorizontalOpportunity(id=uuid.uuid4().hex, label=label, relation=relation, reason=f"观察‘{theme}’与{label}之间的价值迁移") for label, relation in horizontal],
        vertical=[schemas.VerticalChainNode(id=uuid.uuid4().hex, label=label, stage=stage, reason=f"{label}可能改变‘{theme}’的成立条件") for label, stage in vertical],
        insights=[f"‘{theme}’的机会可能不只在产品本身，而在相邻场景与链路断点的组合。"],
    )


def clean_business_lens(data: dict) -> schemas.BusinessLensContent:
    horizontal: list[schemas.HorizontalOpportunity] = []
    for item in data.get("horizontal", []):
        if len(horizontal) >= 5 or not isinstance(item, dict):
            continue
        label = _clean_short(item.get("label"), 80)
        relation = _clean_short(item.get("relation"), 30)
        reason = _clean_short(item.get("reason"), 140)
        if label and reason:
            horizontal.append(schemas.HorizontalOpportunity(id=uuid.uuid4().hex, label=label, relation=relation or "跨界组合", reason=reason))
    vertical: list[schemas.VerticalChainNode] = []
    for item in data.get("vertical", []):
        if len(vertical) >= 10 or not isinstance(item, dict):
            continue
        label = _clean_short(item.get("label"), 80)
        stage = item.get("stage")
        reason = _clean_short(item.get("reason"), 140)
        if label and reason and stage in ("upstream", "core", "downstream", "support"):
            vertical.append(schemas.VerticalChainNode(id=uuid.uuid4().hex, label=label, stage=stage, reason=reason))
    insights = [_clean_short(item, 180) for item in data.get("insights", []) if _clean_short(item, 180)][:2]
    content_safety.ensure_text_safe(
        *(f"{item.label} {item.relation} {item.reason}" for item in horizontal),
        *(f"{item.label} {item.reason}" for item in vertical),
        *insights,
    )
    if len(horizontal) < 3 or len(vertical) < 5 or not insights:
        raise ParseError("商业透视内容不足")
    return schemas.BusinessLensContent(horizontal=horizontal, vertical=vertical, insights=insights)


async def generate_business_lens(req: schemas.BusinessLensRequest) -> schemas.BusinessLensContent:
    content_safety.ensure_text_safe(req.seed_text, req.direction, req.location_label, *req.rejected_summary)
    if is_mock():
        return mock_business_lens(req)
    text = await llm.chat([
        {"role": "system", "content": prompts.BUSINESS_LENS_SYSTEM_PROMPT},
        {"role": "user", "content": prompts.build_business_lens_prompt(req)},
    ])
    data = _extract_json(text)
    if not isinstance(data, dict):
        raise ParseError("商业透视顶层结构错误")
    _check_refusal(data)
    return clean_business_lens(data)
