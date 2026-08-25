# Grokking恼

以 3D 关键词网络为核心的空间思考工具：从"我有一个念头"开始，把关键词放入空间、建立与发现连接，产生此前没想到的新联系。

当前实现：**第 1 阶段（切片 1 核心思考闭环）+ 第 2 阶段（切片 2 AI 建议引擎）**。

## 已实现

- 首页"我有一个念头"自由文本创建 Idea（系统规则化生成标题，可修改）
- 3D 思考空间：关键词节点、力导向自动布局、受控镜头（旋转/缩放/平移）
- 逐个/批量添加关键词（换行/逗号/顿号/分号拆分）
- 手动连接两个节点（可选一句话说明）
- 标记"这是新发现"（可选填原因），计数持久化
- 节点聚焦（一层相邻高亮 + 弱化无关）、一键返回全局、重新整理
- 编辑/删除节点（删除有关联连接时提示连接数）、删除连接
- 本地自动保存（IndexedDB）+ 保存状态反馈 + 刷新恢复
- **AI 建议**：点"帮我展开"→ 缺失节点/潜在连接/启发式追问三类建议，半透明候选态，接受/编辑后接受/拒绝

**暂未实现**（后续切片）：语义场景氛围、首页重命名/复制/删除/JSON 导入导出、撤销重做、导出图片。

## 技术栈

前端：Next.js 16（App Router）+ React 19 + TypeScript strict + Tailwind CSS 4 + Three.js + React Three Fiber + d3-force-3d + Zustand + idb（IndexedDB）。

后端（`../backend`）：FastAPI + Pydantic + httpx（DeepSeek OpenAI 兼容，可换）。无 Key 时进入 mock 模式。

## 启动

```bash
# 后端（AI 代理，端口 8010）
cd ../backend
~/.local/bin/python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # 可选：填 LLM_API_KEY；留空=mock 模式
.venv/bin/uvicorn app.main:app --port 8010

# 前端（端口 3010）
cd ../frontend
npm install
npm run dev -- -p 3010
```

打开 http://localhost:3010

> 前端通过 `NEXT_PUBLIC_API_BASE_URL`（默认 `http://localhost:8010`）访问后端，见 `.env.example`。
> 注意：若全局 npm 缓存损坏（`~/.npm` 里有 root 权限文件导致 EACCES），本仓库已用项目级 `.npmrc` 把缓存指向 `../.npm-cache`。

## 验证

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run build        # 生产构建
npm run e2e          # 切片1 核心闭环端到端（需本机 Chrome + 后端可选）
npm run e2e:ai       # 切片2 AI 建议端到端（需后端已启动）
```

## 数据说明

- 所有数据仅保存在浏览器 IndexedDB（数据库 `grokking`），无账号、无云端。
- 清除浏览器数据会导致 Idea 丢失；JSON 备份导出在后续切片提供。
- 标题生成为规则化临时方案（取前 18 字），后续可换 LLM。
- AI 请求只发送当前 Idea 的文本/节点/连接与已拒绝摘要，不发送其他本地数据。

## 目录结构

```
frontend/
├── app/            # 首页、/idea/[id] 空间页
├── components/     # ui 基础组件、idea 空间组件（画布/面板/工具栏/AI建议面板）
├── lib/            # types / db / store / graph（布局）/ ai（AI客户端）/ utils
├── scripts/        # e2e-full.cjs、e2e-ai.cjs 端到端测试
└── types/          # d3-force-3d 的补充类型声明
```
