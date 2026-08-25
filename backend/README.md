# Grokking恼 · AI 代理后端

切片 2 的 FastAPI 后端：无状态 AI 代理，安全持有模型 Key，把"帮我展开"请求转成 ≤3 条建议（缺失节点 / 潜在连接 / 启发式追问）。

**数据说明**：后端不存业务数据；Idea/节点/连接仍在前端浏览器 IndexedDB。后端只在内存处理单次请求。

## 环境

- Python 3.12（项目用 `~/.local/bin/python3.12`）

```bash
cd backend
~/.local/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## 配置

```bash
cp .env.example .env   # 填入 LLM_API_KEY
```

- `LLM_API_KEY`：**留空即进入 mock 模式**（返回确定性示例建议，便于联调）。
- `LLM_BASE_URL`：默认 `https://api.deepseek.com`（OpenAI 兼容，可换）。
- `LLM_MODEL`：默认 `deepseek-chat`。

## 启动

```bash
.venv/bin/uvicorn app.main:app --port 8010
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/health` | 健康检查，返回 `{status, mock}` |
| POST | `/api/v1/ai/suggestions` | 生成 ≤3 条建议，请求/响应契约见 `docs/第2阶段技术开发文档.md` |

## 测试

```bash
.venv/bin/python -m pytest tests/ -q
```

- 12 个 mock 测试覆盖：解析器（宽容解析、剥围栏、截取数组）、校验（截取 3 条、过滤非法类型、丢弃引用不存在节点的 edge）、mock 生成与拒绝去重。
- **真实模型冒烟待提供 Key**：填 `LLM_API_KEY` 后，用 curl POST 真实请求验证。
