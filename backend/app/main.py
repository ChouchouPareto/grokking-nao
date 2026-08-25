import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import schemas
from .config import is_mock
from .services import llm, suggestions

app = FastAPI(title="Grokking恼 AI 代理", version="0.1.0")

# 开发期跨域：前端 dev server 在 3010；生产改为同源 rewrites 代理。
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3010",
        "http://127.0.0.1:3010",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "mock": is_mock()}


@app.post("/api/v1/ai/suggestions", response_model=schemas.SuggestResponse)
async def suggest(req: schemas.SuggestRequest):
    request_id = uuid.uuid4().hex
    try:
        items = await suggestions.generate_suggestions(req)
    except llm.LLMError:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "ai_failed", "message": "AI 暂时不可用，请稍后重试"}},
        )
    except suggestions.ParseError:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "ai_unparsable", "message": "AI 返回无法解析，请重试"}},
        )
    return schemas.SuggestResponse(request_id=request_id, suggestions=items)
