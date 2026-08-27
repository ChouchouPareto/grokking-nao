SYSTEM_PROMPT = """\
你是 3D 空间思考工具「Grokking恼」的陪伴思考者。你不替用户下结论，而是先理解用户正在思考什么、处于哪个阶段，再帮助用户发现此前没想到的视角与连接。

严格输出一个 JSON 对象，不要输出解释文字或 Markdown 围栏：
{
  "safety_refusal": {"blocked": false, "category": ""},
  "intent_profile": {
    "primary_intent": "用户当前主要意图",
    "thinking_stage": "发散|建立结构|寻找关系|验证假设|收敛决策",
    "dimensions_present": ["网络中已有的思考维度"],
    "dimensions_missing": ["值得补充的思考维度"],
    "confidence": 0.0
  },
  "suggestions": [{
    "type": "node|edge|question",
    "content": "一句建议",
    "reason": "为什么与当前网络相关",
    "dimension": "本建议所属思考维度",
    "related_node_ids": ["已有节点 id"],
    "source_node_id": "edge 类型必填，且必须是已有节点 id",
    "target_node_id": "edge 类型必填，且必须是已有节点 id",
    "edge_note": "edge 类型可选连接说明",
    "relation": "edge 类型：两个概念如何发生联系",
    "strength": 0.0
  }]
}

通用规则：
- 内容安全优先：若用户内容涉及政治敏感、违法犯罪、暴力、自残、色情、仇恨或明显违背公序良俗，不得继续联想或扩写。此时只返回 {"safety_refusal":{"blocked":true,"category":"类别"},"intent_profile":null,"suggestions":[]}。
- 不得给出规避监管、实施违法行为或伤害他人的方法；不要用隐喻、改写或虚构包装继续生成被拒绝内容。
- 每轮最多 3 条建议；没有可靠建议时可以少于 3 条或为空。
- 先做意图识别，再选择建议维度；不要把“项目成本、目标客户”作为所有 Idea 的固定模板。
- deep_expand 模式的多条建议至少覆盖两个不同维度，优先考虑核心事实、系统关系、约束与反例、跨领域迁移与反常连接。
- node_brainstorm 模式围绕 focused_node_id 生成 3 个 node 候选，从类比、反转、后果、极端情境、约束、跨领域迁移中选择至少两个方向；只输出短语，不输出完整方案。
- relation_probe 模式只返回 edge，至少一端必须是 trigger_node_ids 中的新节点；不要为了凑数制造牵强连接。
- edge 的起终点必须来自用户提供的节点 id，且不能相同。
- question 只推动思考，不给出完整解决方案。
- 理由简短具体，不要同义改写节点文本。
"""


def build_user_prompt(req) -> str:
    lines: list[str] = [
        f"调用模式：{req.mode}",
        f"念头标题：{req.title or '（未命名）'}",
        f"原始念头：{req.seed_text or '（空）'}",
        "",
    ]
    lines.append("已有节点：")
    lines.extend((f"- {node.id}: {node.text}" for node in req.nodes),)
    if not req.nodes:
        lines.append("- （空）")
    lines.append("")
    lines.append("已有连接：")
    if req.edges:
        for edge in req.edges:
            note = f"（{edge.note}）" if edge.note else ""
            lines.append(f"- {edge.source_node_id} ↔ {edge.target_node_id}{note}")
    else:
        lines.append("- （空）")
    lines.append("")
    if req.trigger_node_ids:
        lines.append(f"本次新增节点 ids：{', '.join(req.trigger_node_ids)}")
    if req.focused_node_id:
        lines.append(f"当前聚焦节点 id：{req.focused_node_id}")
    if req.rejected_summary:
        lines.append("已拒绝建议（不要原样重复）：")
        lines.extend(f"- {item}" for item in req.rejected_summary)
    if req.mode == "intent_profile":
        lines.append("只更新意图画像，suggestions 返回空数组。")
    elif req.mode == "relation_probe":
        lines.append("分析新增节点与所有已有节点的潜在关系，最多返回 3 条可靠 edge。")
    elif req.mode == "node_brainstorm":
        lines.append("围绕当前聚焦节点做头脑风暴，返回 3 个短语型 node 候选，覆盖至少两个不同发散方向。")
    else:
        lines.append("进行深度展开，最多返回 3 条跨至少两个维度的 node、edge 或 question。")
    return "\n".join(lines)


SUMMARY_SYSTEM_PROMPT = """\
你是「Grokking恼」的阶段总结助手。只基于用户已经确认的正式节点和连接整理当前思考，不把猜测写成事实，不替用户下最终结论。
严格输出 JSON 对象：
{"title":"阶段标题","overview":"两三句话概览","themes":["主题"],"key_connections":["关键连接"],"open_questions":["未决问题"],"next_directions":["下一步探索方向"]}
每个数组最多 5 条；文本简洁；没有信息的部分返回空数组。不要输出 Markdown 围栏或额外解释。
"""


def build_summary_prompt(req) -> str:
    lines = [f"项目：{req.title}", f"原始念头：{req.seed_text}", f"范围：{req.scope}", "正式节点："]
    lines.extend(f"- {node.id}: {node.text}" for node in req.nodes)
    lines.append("正式连接：")
    if req.edges:
        lines.extend(
            f"- {edge.source_node_id} ↔ {edge.target_node_id}" + (f"：{edge.note}" if edge.note else "")
            for edge in req.edges
        )
    else:
        lines.append("- 暂无")
    if req.focused_node_id:
        lines.append(f"聚焦节点：{req.focused_node_id}")
    return "\n".join(lines)
