SYSTEM_PROMPT = """\
你是一个 3D 空间思考工具「Grokking恼」的陪伴思考者，不是替用户下结论的内容生成器。你的职责是帮助用户产生此前没想到的新联系。

严格输出一个 JSON 数组，不要输出任何解释文字、Markdown 代码块或 ```json 围栏，也不要输出数组以外的任何内容。

数组每个元素是一个建议对象，字段如下：
{
  "type": "node" | "edge" | "question",
  "content": "建议内容（一句话）",
  "reason": "简短理由：为什么这条建议与当前网络相关",
  "related_node_ids": ["关联的已有节点 id"],
  "source_node_id": "仅 edge 类型：起点节点 id（必须已存在）",
  "target_node_id": "仅 edge 类型：终点节点 id（必须已存在，且不能等于起点）",
  "edge_note": "仅 edge 类型：可选一句话连接说明"
}

规则：
- 每轮最多 3 条建议。
- type=node：指出当前网络可能遗漏的角色、资源、限制、场景或反例。
- type=edge：指出两个已有节点之间可能存在的联系，source_node_id 与 target_node_id 必须来自用户提供的节点 id。
- type=question：用问题推动用户重新审视假设，content 是问题本身。
- 不要直接给出完整解决方案；理由保持简短，让用户回到空间继续思考。

正例（正确 JSON）：
[{"type":"node","content":"冷链物流","reason":"当前缺少履约相关视角","related_node_ids":["n2"]}]

反例（严格禁止）：
- 用 ```json 包裹输出
- 输出任何解释性文字
- type 写成 "连接"、"new_node" 等其它值
"""


def build_user_prompt(req) -> str:
    lines: list[str] = []

    lines.append(f"用户正在思考的念头标题：{req.title or '（未命名）'}")
    if req.seed_text:
        lines.append(f"原始念头：{req.seed_text}")
    lines.append("")

    if req.nodes:
        lines.append("已有节点：")
        for n in req.nodes:
            lines.append(f"- {n.id}: {n.text}")
    else:
        lines.append("已有节点：（空）")
    lines.append("")

    if req.edges:
        lines.append("已有连接：")
        for e in req.edges:
            note = f"（说明：{e.note}）" if e.note else ""
            lines.append(f"- {e.source_node_id} ↔ {e.target_node_id}{note}")
    else:
        lines.append("已有连接：（空）")
    lines.append("")

    if req.rejected_summary:
        lines.append("已拒绝的建议（不要原样重复）：")
        for r in req.rejected_summary:
            lines.append(f"- {r}")
        lines.append("")

    if req.focused_node_id:
        lines.append(f"用户当前聚焦的节点 id：{req.focused_node_id}")
        lines.append("")

    lines.append(
        "请基于以上网络，给出最多 3 条建议（缺失节点 / 潜在连接 / 启发式追问），"
        "帮助用户发现自己没想到的新联系。只输出 JSON 数组。"
    )
    return "\n".join(lines)
