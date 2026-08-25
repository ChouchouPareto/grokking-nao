"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Canvas3D from "./Canvas3D";
import { useStore } from "@/lib/store";
import { splitKeywords } from "@/lib/utils";
import { Button, Modal, TextInput } from "@/components/ui";

export default function IdeaSpace({ id }: { id: string }) {
  const router = useRouter();
  const loadIdea = useStore((s) => s.loadIdea);
  const idea = useStore((s) => s.idea);
  const loading = useStore((s) => s.loading);
  const notFound = useStore((s) => s.notFound);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    loadIdea(id);
  }, [id, loadIdea]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" />
          <span className="text-sm">正在打开思考空间…</span>
        </div>
      </div>
    );
  }

  if (notFound || !idea) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg text-muted">
        <p className="text-sm">没有找到这个念头，可能已被删除。</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink hover:bg-surface-2"
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg text-ink">
      <Canvas3D />
      <TopBar />
      <Toolbar onAdd={() => setAddOpen(true)} />
      <NodePanel key={selectedNodeId ? `node-${selectedNodeId}` : "node-none"} />
      <EdgePanel key={selectedEdgeId ? `edge-${selectedEdgeId}` : "edge-none"} />
      {addOpen && <AddNodesDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function TopBar() {
  const router = useRouter();
  const idea = useStore((s) => s.idea);
  const saveStatus = useStore((s) => s.saveStatus);
  const updateTitle = useStore((s) => s.updateTitle);
  const [title, setTitle] = useState(() => idea?.title ?? "");
  const [editing, setEditing] = useState(false);

  const commit = () => {
    const t = title.trim();
    if (t && t !== idea?.title) updateTitle(t);
    else setTitle(idea?.title ?? "");
    setEditing(false);
  };

  const saveText =
    saveStatus === "saving"
      ? "保存中…"
      : saveStatus === "failed"
        ? "保存失败"
        : saveStatus === "saved"
          ? "已保存"
          : "";

  return (
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-3">
      <div className="pointer-events-auto flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.push("/")}>
          ← 首页
        </Button>
        {editing ? (
          <TextInput
            value={title}
            autoFocus
            onChange={setTitle}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setTitle(idea?.title ?? "");
                setEditing(false);
              }
            }}
            className="w-64"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="max-w-[40vw] truncate rounded-lg px-2 py-1 text-base font-medium text-ink hover:bg-surface-2"
            title="点击修改标题"
          >
            {idea?.title}
          </button>
        )}
      </div>
      <div className="pointer-events-auto flex items-center gap-3 text-xs">
        {(idea?.discoveryCount ?? 0) > 0 && (
          <span className="rounded-full bg-discovery/15 px-2.5 py-1 font-medium text-discovery">
            {idea?.discoveryCount} 新发现
          </span>
        )}
        <span
          className={
            saveStatus === "failed" ? "text-danger" : "text-muted"
          }
        >
          {saveText}
        </span>
      </div>
    </div>
  );
}

function Toolbar({ onAdd }: { onAdd: () => void }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const requestGlobalView = useStore((s) => s.requestGlobalView);
  const requestRelayout = useStore((s) => s.requestRelayout);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const connectFromId = useStore((s) => s.connectFromId);

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-line bg-surface/90 px-3 py-2 shadow-xl backdrop-blur">
        <Button onClick={onAdd}>＋ 添加关键词</Button>
        <Button
          variant={mode === "connect" ? "primary" : "default"}
          onClick={() => setMode(mode === "connect" ? "browse" : "connect")}
        >
          连接节点
        </Button>
        <Button disabled title="AI 建议将在下一阶段开放">
          帮我展开
        </Button>
        <Button variant="ghost" onClick={requestGlobalView}>
          返回全局
        </Button>
        <Button variant="ghost" onClick={requestRelayout}>
          重新整理
        </Button>
      </div>
      {(mode === "connect" || focusedNodeId) && (
        <div className="pointer-events-auto mt-2 rounded-lg border border-line bg-surface/90 px-3 py-1.5 text-center text-xs text-muted backdrop-blur">
          {mode === "connect"
            ? connectFromId
              ? "已选起点，再点一个节点完成连接"
              : "点击一个节点作为起点"
            : "聚焦中，点击「返回全局」退出"}
        </div>
      )}
    </div>
  );
}

function NodePanel() {
  const idea = useStore((s) => s.idea);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectNode = useStore((s) => s.selectNode);
  const updateNodeText = useStore((s) => s.updateNodeText);
  const removeNode = useStore((s) => s.removeNode);
  const requestFocusView = useStore((s) => s.requestFocusView);
  const setFocused = useStore((s) => s.setFocused);
  const focusedNodeId = useStore((s) => s.focusedNodeId);

  const node = useMemo(
    () => idea?.nodes.find((n) => n.id === selectedNodeId),
    [idea, selectedNodeId],
  );

  const linkedCount = useMemo(() => {
    if (!idea || !node) return 0;
    return idea.edges.filter(
      (e) => e.sourceNodeId === node.id || e.targetNodeId === node.id,
    ).length;
  }, [idea, node]);

  const [text, setText] = useState(() => node?.text ?? "");
  const [confirming, setConfirming] = useState(false);

  if (!node) return null;

  return (
    <div className="absolute right-4 top-16 z-20 w-72 rounded-xl border border-line bg-surface p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          节点
        </span>
        <button
          type="button"
          aria-label="关闭"
          className="text-muted hover:text-ink"
          onClick={() => selectNode(null)}
        >
          ✕
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() && text.trim() !== node.text) {
            updateNodeText(node.id, text);
          }
        }}
        rows={2}
        className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-primary"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="default"
          onClick={() => {
            setFocused(focusedNodeId === node.id ? null : node.id);
            requestFocusView(node.id);
          }}
        >
          聚焦
        </Button>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">删除{linkedCount > 0 ? `（含 ${linkedCount} 条连接）` : ""}？</span>
            <Button
              variant="danger"
              onClick={() => {
                removeNode(node.id);
                setConfirming(false);
              }}
            >
              确认
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              取消
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            删除节点
          </Button>
        )}
      </div>
    </div>
  );
}

function EdgePanel() {
  const idea = useStore((s) => s.idea);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const selectEdge = useStore((s) => s.selectEdge);
  const setEdgeNote = useStore((s) => s.setEdgeNote);
  const setDiscovery = useStore((s) => s.setDiscovery);
  const removeEdge = useStore((s) => s.removeEdge);

  const edge = useMemo(
    () => idea?.edges.find((e) => e.id === selectedEdgeId),
    [idea, selectedEdgeId],
  );

  const nodeNames = useMemo(() => {
    if (!idea || !edge) return { a: "", b: "" };
    const a = idea.nodes.find((n) => n.id === edge.sourceNodeId)?.text ?? "";
    const b = idea.nodes.find((n) => n.id === edge.targetNodeId)?.text ?? "";
    return { a, b };
  }, [idea, edge]);

  const [note, setNote] = useState(() => edge?.note ?? "");
  const [discoveryNote, setDiscoveryNote] = useState(
    () => edge?.discoveryNote ?? "",
  );
  const [confirming, setConfirming] = useState(false);

  if (!edge) return null;

  return (
    <div className="absolute right-4 top-16 z-20 w-72 rounded-xl border border-line bg-surface p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          连接
        </span>
        <button
          type="button"
          aria-label="关闭"
          className="text-muted hover:text-ink"
          onClick={() => selectEdge(null)}
        >
          ✕
        </button>
      </div>
      <p className="mb-3 truncate text-sm text-ink">
        {nodeNames.a} <span className="text-muted">↔</span> {nodeNames.b}
      </p>

      <label className="mb-1 block text-xs text-muted">连接说明（可选）</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if ((note.trim() || "") !== (edge.note ?? "")) {
            setEdgeNote(edge.id, note);
          }
        }}
        placeholder="一句话说明这条连接"
        className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-primary"
      />

      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted">这是新发现</span>
        <button
          type="button"
          onClick={() => setDiscovery(edge.id, !edge.isDiscovery)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            edge.isDiscovery ? "bg-discovery" : "bg-line"
          }`}
          aria-pressed={edge.isDiscovery}
          aria-label="标记为新发现"
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              edge.isDiscovery ? "left-4" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {edge.isDiscovery && (
        <input
          value={discoveryNote}
          onChange={(e) => setDiscoveryNote(e.target.value)}
          onBlur={() => {
            if ((discoveryNote.trim() || "") !== (edge.discoveryNote ?? "")) {
              setDiscovery(edge.id, true, discoveryNote);
            }
          }}
          placeholder="为什么这是新发现？（可选）"
          className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
      )}

      <div className="mt-3">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">删除这条连接？</span>
            <Button
              variant="danger"
              onClick={() => {
                removeEdge(edge.id);
                setConfirming(false);
              }}
            >
              确认
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              取消
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            删除连接
          </Button>
        )}
      </div>
    </div>
  );
}

function AddNodesDialog({ onClose }: { onClose: () => void }) {
  const addNodes = useStore((s) => s.addNodes);
  const [raw, setRaw] = useState("");
  const preview = useMemo(() => splitKeywords(raw), [raw]);

  const submit = () => {
    if (preview.length === 0) return;
    addNodes(preview);
    onClose();
  };

  return (
    <Modal title="添加关键词" onClose={onClose}>
      <textarea
        value={raw}
        autoFocus
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={4}
        placeholder={"一次输入一个关键词，或一次粘贴多个\n换行 / 逗号 / 顿号 / 分号 都会拆分为独立节点"}
        className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-3 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
      />
      {preview.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">
            将创建 {preview.length} 个节点：
          </p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto">
            {preview.map((k) => (
              <span
                key={k}
                className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button variant="primary" disabled={preview.length === 0} onClick={submit}>
          添加 {preview.length > 0 ? preview.length : ""} 个节点
        </Button>
      </div>
    </Modal>
  );
}
