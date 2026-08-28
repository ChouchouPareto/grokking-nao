import re
import unicodedata

from .. import schemas


SAFETY_MESSAGE = "该内容涉及敏感信息、危险行为或试图改变系统规则，AI 无法继续联想。请修改相关关键词后再试。"


class ContentSafetyError(Exception):
    """输入或模型输出触发产品内容安全边界。"""

    def __init__(self, category: str = "sensitive_content"):
        super().__init__(SAFETY_MESSAGE)
        self.category = category


_CATEGORY_TERMS: dict[str, tuple[str, ...]] = {
    "prompt_injection": (
        "忽略以上指令", "忽略之前指令", "无视系统提示", "泄露系统提示词", "输出系统提示词",
        "展示系统消息", "解除安全限制", "绕过安全策略", "开发者模式", "越狱提示词",
        "ignorepreviousinstructions", "revealsystemprompt", "jailbreak", "developer mode",
    ),
    "political_sensitive": (
        "共产党", "国民党", "中共", "中共中央", "反党", "颠覆政权", "推翻政府",
        "政治暗杀", "政变", "台独", "港独", "藏独", "疆独", "法轮功",
    ),
    "violence_crime": (
        "杀人", "谋杀", "暗杀", "绑架", "勒索", "抢劫", "强奸", "恐怖袭击",
        "炸弹", "爆炸物", "枪支", "贩毒", "制毒", "毒品", "洗钱", "诈骗",
        "入侵系统", "黑客攻击", "犯罪", "自杀", "自残", "虐杀",
        "murder", "bomb", "terrorist", "suicide", "killpeople", "制造武器", "制作毒药",
        "规避警方", "销毁证据", "躲避侦查", "实施犯罪",
    ),
    "sexual_content": (
        "色情", "成人视频", "性爱", "性交", "裸聊", "卖淫", "嫖娼",
        "乱伦", "性侵", "强奸", "未成年色情", "儿童色情", "porn", "rape",
    ),
    "public_morality": (
        "赌博", "吸毒", "仇恨犯罪", "种族歧视", "教唆犯罪", "违法获利",
        "虐待动物", "侮辱尸体",
    ),
}


def _normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", normalized)


def classify_text(text: str) -> str | None:
    normalized = _normalize(text)
    if not normalized:
        return None
    for category, terms in _CATEGORY_TERMS.items():
        if any(_normalize(term) in normalized for term in terms):
            return category
    return None


def looks_like_safety_refusal(text: str) -> bool:
    normalized = _normalize(text)
    refusal_markers = (
        "无法协助", "无法回答", "不能提供", "拒绝回答", "内容敏感", "安全政策",
        "违法内容", "暴力内容", "色情内容", "公序良俗", "抱歉我不能",
    )
    return any(_normalize(marker) in normalized for marker in refusal_markers)


def request_text(req: schemas.SuggestRequest) -> str:
    parts = [req.title, req.seed_text]
    parts.extend(node.text for node in req.nodes)
    parts.extend(edge.note or "" for edge in req.edges)
    parts.extend(req.rejected_summary or [])
    return "\n".join(parts)


def ensure_request_safe(req: schemas.SuggestRequest) -> None:
    category = classify_text(request_text(req))
    if category:
        raise ContentSafetyError(category)


def ensure_suggestions_safe(raw: list[dict]) -> None:
    fields = ("content", "reason", "dimension", "edge_note", "relation")
    text = "\n".join(
        str(item.get(field) or "")
        for item in raw
        if isinstance(item, dict)
        for field in fields
    )
    category = classify_text(text)
    if category:
        raise ContentSafetyError(category)
