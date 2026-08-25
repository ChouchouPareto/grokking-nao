import httpx

from ..config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT


class LLMError(Exception):
    """模型调用失败（网络 / 鉴权 / 超时 / 非 2xx）。"""


async def chat(messages: list[dict]) -> str:
    """调用 OpenAI 兼容的 chat/completions，返回 assistant 文本。"""
    url = f"{LLM_BASE_URL}/chat/completions"
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"}
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": 0.6,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise LLMError(f"模型请求失败：{type(exc).__name__}") from exc

    if resp.status_code != 200:
        # 不把供应商响应原文（可能含敏感信息）直接回显
        raise LLMError(f"模型返回 {resp.status_code}")

    try:
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError) as exc:
        raise LLMError("模型响应格式异常") from exc
