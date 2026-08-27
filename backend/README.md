# Grokking恼 · AI 代理后端

FastAPI 无状态 AI 代理：安全持有模型 Key，支持意图画像、动态维度展开、新节点关系扫描、围绕节点的头脑风暴和阶段总结。

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
| POST | `/api/v1/ai/suggestions` | `deep_expand` 全局发散、`relation_probe` 关系扫描或 `node_brainstorm` 节点头脑风暴 |
| POST | `/api/v1/ai/summary` | 基于正式节点和连接生成结构化阶段总结 |

### 内容安全

联想接口在调用模型前检查项目标题、原始念头、节点、连接说明和历史拒绝内容；命中政治敏感、暴力犯罪、色情或违背公序良俗的内容时返回 `422 content_blocked`，且不会调用模型。模型返回的候选还会再次检查；模型也可通过结构化 `safety_refusal` 主动拒绝。

## 测试

```bash
.venv/bin/python -m pytest tests/ -q
```

- 23 个测试覆盖：新旧响应兼容解析、意图识别、节点头脑风暴、阶段总结、动态维度、非法建议过滤、关系扫描约束、拒绝去重及内容安全输入/输出拦截。
- **真实模型冒烟待提供 Key**：填 `LLM_API_KEY` 后，用 curl POST 真实请求验证。
