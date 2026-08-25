# Grokking恼

以 3D 关键词网络为核心的空间思考工具：从"我有一个念头"开始，把关键词放入空间、建立与发现连接，产生此前没想到的新联系。

当前实现：**第 1 阶段（切片 1）——核心思考闭环（无 AI）**。

## 已实现

- 首页"我有一个念头"自由文本创建 Idea（系统规则化生成标题，可修改）
- 3D 思考空间：关键词节点、力导向自动布局、受控镜头（旋转/缩放/平移）
- 逐个/批量添加关键词（换行/逗号/顿号/分号拆分）
- 手动连接两个节点（可选一句话说明）
- 标记"这是新发现"（可选填原因），计数持久化
- 节点聚焦（一层相邻高亮 + 弱化无关）、一键返回全局、重新整理
- 编辑/删除节点（删除有关联连接时提示连接数）、删除连接
- 本地自动保存（IndexedDB）+ 保存状态反馈 + 刷新恢复

**暂未实现**（后续切片）：AI 建议引擎、语义场景氛围、首页重命名/复制/删除/JSON 导入导出、撤销重做、导出图片。

## 技术栈

Next.js 16（App Router）+ React 19 + TypeScript strict + Tailwind CSS 4 + Three.js + React Three Fiber + d3-force-3d + Zustand + idb（IndexedDB）。

## 启动

```bash
npm install          # 依赖
npm run dev -- -p 3010   # 开发（3000 被占用，故用 3010）
```

打开 http://localhost:3010

> 注意：若全局 npm 缓存损坏（`~/.npm` 里有 root 权限文件导致 EACCES），本仓库已用项目级 `.npmrc` 把缓存指向 `../.npm-cache`。如需恢复全局缓存：`sudo chown -R $(id -u):$(id -g) ~/.npm`。

## 验证

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run build        # 生产构建
npm run e2e          # 端到端冒烟（需本机已装 Google Chrome）
```

## 数据说明

- 所有数据仅保存在浏览器 IndexedDB（数据库 `grokking`），无账号、无云端。
- 清除浏览器数据会导致 Idea 丢失；JSON 备份导出在后续切片提供。
- 标题生成为规则化临时方案（取前 18 字），切片 2 换成 LLM 生成。

## 目录结构

```
frontend/
├── app/            # 首页、/idea/[id] 空间页
├── components/     # ui 基础组件、idea 空间组件（画布/面板/工具栏）
├── lib/            # types / db / store / graph（布局）/ utils
├── scripts/        # e2e-full.cjs 端到端测试
└── types/          # d3-force-3d 的补充类型声明
```
