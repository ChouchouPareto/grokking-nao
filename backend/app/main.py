import hmac
import os
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import schemas
from .config import is_mock
from .services import content_safety, llm, map_provider, suggestions

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


@app.middleware("http")
async def protect_ai_routes(request: Request, call_next):
    if request.url.path.startswith("/api/v1/ai/"):
        expected = os.getenv("INTERNAL_API_TOKEN", "").strip()
        provided = request.headers.get("x-internal-api-token", "")
        if expected and not hmac.compare_digest(provided, expected):
            return JSONResponse(
                status_code=401,
                content={"error": {"code": "unauthorized", "message": "未授权访问"}},
            )
    return await call_next(request)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "mock": is_mock()}


@app.post("/api/v1/ai/suggestions", response_model=schemas.SuggestResponse)
async def suggest(req: schemas.SuggestRequest):
    request_id = uuid.uuid4().hex
    try:
        items, intent_profile = await suggestions.generate_suggestions(req)
    except content_safety.ContentSafetyError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error": {
                    "code": "content_blocked",
                    "message": content_safety.SAFETY_MESSAGE,
                    "category": exc.category,
                }
            },
        )
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
    return schemas.SuggestResponse(
        request_id=request_id,
        suggestions=items,
        intent_profile=intent_profile,
    )


@app.post("/api/v1/ai/summary", response_model=schemas.SummaryResponse)
async def summarize(req: schemas.SummaryRequest):
    request_id = uuid.uuid4().hex
    try:
        result = await suggestions.generate_summary(req)
    except llm.LLMError:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "ai_failed", "message": "AI 暂时不可用，请稍后重试"}},
        )
    except suggestions.ParseError:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "ai_unparsable", "message": "AI 总结无法解析，请重试"}},
        )
    return schemas.SummaryResponse(request_id=request_id, summary=result)


def _raise_ai_error(exc: Exception) -> None:
    if isinstance(exc, content_safety.ContentSafetyError):
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "content_blocked", "message": content_safety.SAFETY_MESSAGE, "category": exc.category}},
        )
    if isinstance(exc, llm.LLMError):
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "ai_failed", "message": "AI 暂时不可用，请稍后重试"}},
        )
    if isinstance(exc, suggestions.ParseError):
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "ai_unparsable", "message": "AI 返回无法解析，请重试"}},
        )
    raise exc


@app.post("/api/v1/ai/directions", response_model=schemas.DirectionResponse)
async def directions(req: schemas.DirectionRequest):
    request_id = uuid.uuid4().hex
    try:
        items = await suggestions.generate_directions(req)
    except (content_safety.ContentSafetyError, llm.LLMError, suggestions.ParseError) as exc:
        _raise_ai_error(exc)
    return schemas.DirectionResponse(request_id=request_id, candidates=items)


@app.post("/api/v1/ai/business-lens", response_model=schemas.BusinessLensResponse)
async def business_lens(req: schemas.BusinessLensRequest):
    request_id = uuid.uuid4().hex
    try:
        result = await suggestions.generate_business_lens(req)
    except (content_safety.ContentSafetyError, llm.LLMError, suggestions.ParseError) as exc:
        _raise_ai_error(exc)
    return schemas.BusinessLensResponse(request_id=request_id, lens=result)


@app.post("/api/v1/ai/environment", response_model=schemas.EnvironmentResponse)
async def environment(req: schemas.EnvironmentRequest):
    request_id = uuid.uuid4().hex
    try:
        content_safety.ensure_text_safe(req.seed_text, req.direction, req.location_label)
        items, location_mode = await map_provider.build_environment_suggestions(req)
    except content_safety.ContentSafetyError as exc:
        _raise_ai_error(exc)
    return schemas.EnvironmentResponse(request_id=request_id, suggestions=items, location_mode=location_mode)
