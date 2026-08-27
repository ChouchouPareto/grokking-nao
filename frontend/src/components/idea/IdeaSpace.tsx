"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Canvas3D from "./Canvas3D";
import { useStore } from "@/lib/store";
import { splitKeywords } from "@/lib/utils";
import type { AISuggestion } from "@/lib/types";
import { Button, Modal, TextInput } from "@/components/ui";

export default function IdeaSpace({ id }: { id: string }) {
  const router = useRouter();
  const loadIdea = useStore((s) => s.loadIdea);
  const idea = useStore((s) => s.idea);
  const loading = useStore((s) => s.loading);
  const notFound = useStore((s) => s.notFound);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const aiStatus = useStore((s) => s.aiStatus);
  const [addOpen, setAddOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [leftPinned, setLeftPinned] = useState(false);
  const [rightPinned, setRightPinned] = useState(false);
  const leftCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealLeft = () => {
    if (leftCloseTimer.current) clearTimeout(leftCloseTimer.current);
    setLeftOpen(true);
  };
  const revealRight = () => {
    if (rightCloseTimer.current) clearTimeout(rightCloseTimer.current);
    setRightOpen(true);
  };
  const scheduleLeftClose = () => {
    if (leftPinned) return;
    if (leftCloseTimer.current) clearTimeout(leftCloseTimer.current);
    leftCloseTimer.current = setTimeout(() => setLeftOpen(false), 280);
  };
  const scheduleRightClose = () => {
    if (rightPinned) return;
    if (rightCloseTimer.current) clearTimeout(rightCloseTimer.current);
    rightCloseTimer.current = setTimeout(() => setRightOpen(false), 280);
  };

  const toggleLeftPinned = () => {
    if (leftOpen) {
      setLeftPinned(false);
      setLeftOpen(false);
      return;
    }
    setRightPinned(false);
    setRightOpen(false);
    setLeftPinned(true);
    revealLeft();
  };

  const toggleRightPinned = () => {
    if (rightOpen) {
      setRightPinned(false);
      setRightOpen(false);
      return;
    }
    setLeftPinned(false);
    setLeftOpen(false);
    setRightPinned(true);
    revealRight();
  };

  const closeMobilePanel = () => {
    setLeftPinned(false);
    setRightPinned(false);
    setLeftOpen(false);
    setRightOpen(false);
  };

  useEffect(() => {
    loadIdea(id);
  }, [id, loadIdea]);

  useEffect(() => () => {
    if (leftCloseTimer.current) clearTimeout(leftCloseTimer.current);
    if (rightCloseTimer.current) clearTimeout(rightCloseTimer.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = Boolean(
        target?.matches("input, textarea, select") || target?.isContentEditable,
      );
      if (event.key === "Escape") useStore.getState().setMode("browse");
      if (
        event.key.toLowerCase() === "c" &&
        !isEditing &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        const state = useStore.getState();
        if (state.mode === "connect") {
          state.setMode("browse");
        } else {
          const selectedNodeId = state.selectedNodeId;
          state.setMode("connect");
          if (selectedNodeId) state.setConnectFrom(selectedNodeId);
        }
      }
      if (event.key === "Delete" && !isEditing) {
        const state = useStore.getState();
        if (state.selectedNodeId) {
          event.preventDefault();
          state.removeNode(state.selectedNodeId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const rightVisible = rightOpen || aiStatus === "blocked";

  return (
    <div className="idea-workspace relative h-screen w-screen overflow-hidden bg-bg text-ink">
      <WorkspaceAtmosphere />
      <Canvas3D leftOpen={leftOpen} rightOpen={rightVisible} />
      <TopBar />
      {(leftOpen || rightVisible) && <button type="button" className="mobile-panel-backdrop" aria-label="关闭侧栏" onClick={closeMobilePanel} />}
      <div className="edge-hover-zone edge-hover-zone-left" onMouseEnter={revealLeft} onMouseLeave={scheduleLeftClose} aria-hidden="true" />
      <div className="edge-hover-zone edge-hover-zone-right" onMouseEnter={revealRight} onMouseLeave={scheduleRightClose} aria-hidden="true" />
      <LeftToolbar visible={leftOpen} onMouseEnter={revealLeft} onMouseLeave={scheduleLeftClose} onAdd={() => setAddOpen(true)} />
      <RightWorkspace
        visible={rightVisible}
        onMouseEnter={revealRight}
        onMouseLeave={scheduleRightClose}
        nodeKey={selectedNodeId ? `node-${selectedNodeId}` : "node-none"}
        edgeKey={selectedEdgeId ? `edge-${selectedEdgeId}` : "edge-none"}
      />
      <button type="button" aria-label={leftOpen ? "关闭画布工具" : "显示画布工具"} aria-pressed={leftOpen} onClick={toggleLeftPinned} className={`panel-toggle left-panel-toggle ${leftOpen ? "panel-open" : ""} ${leftOpen || rightVisible ? "mobile-panel-suppressed" : ""}`}>
        <svg className="panel-toggle-icon-desktop" aria-hidden="true" viewBox="0 0 20 20"><path d={leftOpen ? "M12 5 7 10l5 5" : "m8 5 5 5-5 5"} /></svg>
        <svg className="panel-toggle-icon-mobile" aria-hidden="true" viewBox="0 0 20 20"><path d="m5 12 5-5 5 5" /></svg>
        <span className="panel-toggle-label">工具</span>
      </button>
      <button type="button" aria-label={rightVisible ? "关闭何与论" : "显示何与论"} aria-pressed={rightVisible} onClick={toggleRightPinned} className={`panel-toggle right-panel-toggle ${rightVisible ? "panel-open" : ""} ${leftOpen || rightVisible ? "mobile-panel-suppressed" : ""}`}>
        <svg className="panel-toggle-icon-desktop" aria-hidden="true" viewBox="0 0 20 20"><path d={rightVisible ? "m8 5 5 5-5 5" : "M12 5 7 10l5 5"} /></svg>
        <svg className="panel-toggle-icon-mobile" aria-hidden="true" viewBox="0 0 20 20"><path d="m5 12 5-5 5 5" /></svg>
        <span className="panel-toggle-label">何 · 论</span>
      </button>
      {(leftOpen || rightVisible) && <button type="button" className="mobile-panel-close" aria-label="关闭侧栏" onClick={closeMobilePanel}>✕</button>}
      {addOpen && <AddNodesDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function WorkspaceAtmosphere() {
  return (
    <div className="workspace-atmosphere" aria-hidden="true">
      <span className="liquid-ether liquid-ether-a" />
      <span className="liquid-ether liquid-ether-b" />
      <span className="liquid-ether liquid-ether-c" />
      <svg className="workspace-strands" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <path d="M-80 650 C 250 350, 430 820, 760 480 S 1180 220, 1520 500" />
        <path d="M-100 260 C 240 520, 520 120, 810 360 S 1190 710, 1530 330" />
        <path d="M180 960 C 380 570, 760 720, 910 360 S 1190 40, 1370 -80" />
      </svg>
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
    <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 py-3">
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

function LeftToolbar({ onAdd, visible, onMouseEnter, onMouseLeave }: { onAdd: () => void; visible: boolean; onMouseEnter: () => void; onMouseLeave: () => void }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const requestGlobalView = useStore((s) => s.requestGlobalView);
  const requestRelayout = useStore((s) => s.requestRelayout);
  const requestSuggestions = useStore((s) => s.requestSuggestions);
  const aiStatus = useStore((s) => s.aiStatus);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const connectFromId = useStore((s) => s.connectFromId);

  return (
    <aside onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={`workspace-panel workspace-panel-left absolute bottom-3 left-2 top-16 z-20 flex w-[min(86vw,320px)] flex-col justify-between rounded-3xl p-2 lg:bottom-5 lg:left-4 lg:w-36 ${visible ? "is-visible" : "is-hidden"}`}>
      <div>
        <p className="px-2 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">画布工具</p>
        <div className="space-y-1">
          <ToolButton active={mode === "browse"} label="视图" hint="V" onClick={() => setMode("browse")} />
          <ToolButton label="添加节点" hint="N" onClick={onAdd} />
          <ToolButton active={mode === "connect"} label="连接" hint="C" onClick={() => setMode(mode === "connect" ? "browse" : "connect")} />
        </div>
        <div className="my-3 h-px bg-line" />
        <div className="space-y-1">
          <ToolButton label="全局视图" onClick={requestGlobalView} />
          <ToolButton label="重新整理" onClick={requestRelayout} />
          <ToolButton
            label={aiStatus === "loading" ? "正在发散…" : "全局发散"}
            disabled={aiStatus === "loading"}
            onClick={() => void requestSuggestions("deep_expand")}
          />
        </div>
      </div>
      <p className="rounded-xl bg-bg/60 px-2 py-2 text-[11px] leading-4 text-muted">WASD / 方向键 游走<br />Q / E 左右转向 · Shift 加速<br />Delete 删除 · Esc 返回</p>
      {(mode === "connect" || focusedNodeId) && (
        <div className="absolute bottom-0 left-40 w-56 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs text-muted shadow-xl">
          {mode === "connect"
            ? connectFromId
              ? "已选起点，再点一个节点完成连接"
              : "点击一个节点作为起点"
            : "聚焦中，点击「返回全局」退出"}
        </div>
      )}
    </aside>
  );
}

function ToolButton({
  label,
  hint,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
        active ? "bg-primary text-white" : "text-ink hover:bg-surface-2"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span>{label}</span>
      {hint && <kbd className="text-[10px] opacity-55">{hint}</kbd>}
    </button>
  );
}

function RightWorkspace({ nodeKey, edgeKey, visible, onMouseEnter, onMouseLeave }: { nodeKey: string; edgeKey: string; visible: boolean; onMouseEnter: () => void; onMouseLeave: () => void }) {
  const [tab, setTab] = useState<"context" | "summary">("context");
  const hasContext = useStore(
    (s) => Boolean(s.selectedNodeId || s.selectedEdgeId || s.aiStatus !== "idle"),
  );
  return (
    <aside onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={`workspace-panel workspace-panel-right absolute bottom-3 right-2 top-16 z-20 flex w-[min(90vw,360px)] flex-col overflow-hidden rounded-3xl lg:bottom-5 lg:right-4 lg:w-[340px] ${visible ? "is-visible" : "is-hidden"}`}>
      <div className="grid grid-cols-2 border-b border-line p-1.5">
        <button type="button" onClick={() => setTab("context")} className={`workspace-tab min-h-12 rounded-xl focus-visible:ring-2 focus-visible:ring-primary ${tab === "context" ? "bg-surface-2 text-ink" : "text-muted"}`}>
          <span className="text-lg font-medium">何</span><span className="ml-2 text-[10px] uppercase tracking-[0.16em] opacity-60">Context</span>
        </button>
        <button type="button" onClick={() => setTab("summary")} className={`workspace-tab min-h-12 rounded-xl focus-visible:ring-2 focus-visible:ring-primary ${tab === "summary" ? "bg-surface-2 text-ink" : "text-muted"}`}>
          <span className="text-lg font-medium">论</span><span className="ml-2 text-[10px] uppercase tracking-[0.16em] opacity-60">Synthesis</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "summary" ? (
          <SummaryPanel />
        ) : hasContext ? (
          <div className="space-y-4">
            <NodePanel key={nodeKey} />
            <EdgePanel key={edgeKey} />
            <SuggestionPanel />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm text-ink">选择一个节点开始思考</p>
            <p className="mt-2 text-xs leading-5 text-muted">节点详情、AI 联想解释和候选确认都会出现在这里。</p>
          </div>
        )}
      </div>
    </aside>
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
  const requestSuggestions = useStore((s) => s.requestSuggestions);
  const aiStatus = useStore((s) => s.aiStatus);

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
    <section className="rounded-xl border border-line bg-bg/35 p-4">
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
          variant="primary"
          disabled={aiStatus === "loading"}
          onClick={() => void requestSuggestions("node_brainstorm", [node.id])}
        >
          围绕它联想
        </Button>
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
    </section>
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
    <section className="rounded-xl border border-line bg-bg/35 p-4">
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
    </section>
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

const TYPE_LABEL: Record<AISuggestion["type"], string> = {
  node: "节点",
  edge: "连接",
  question: "追问",
};

function SuggestionPanel() {
  const suggestions = useStore((s) => s.suggestions);
  const aiStatus = useStore((s) => s.aiStatus);
  const aiMessage = useStore((s) => s.aiMessage);
  const requestSuggestions = useStore((s) => s.requestSuggestions);
  const clearSuggestions = useStore((s) => s.clearSuggestions);
  const aiMode = useStore((s) => s.aiMode);
  const aiTriggerNodeIds = useStore((s) => s.aiTriggerNodeIds);
  const intentProfile = useStore((s) => s.idea?.intentProfile);
  const selectedSuggestionId = useStore((s) => s.selectedSuggestionId);

  if (aiStatus === "idle") return null;

  return (
    <section className="rounded-xl border border-line bg-bg/35 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          {aiStatus === "blocked"
            ? "内容安全提醒"
            : aiMode === "relation_probe"
            ? "可能的联系"
            : aiMode === "node_brainstorm"
              ? "节点联想"
              : "AI 建议"}
        </span>
        <button
          type="button"
          aria-label="关闭"
          className="text-muted hover:text-ink"
          onClick={clearSuggestions}
        >
          ✕
        </button>
      </div>

      {aiStatus === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary" />
          {aiMode === "relation_probe" ? "正在寻找新节点的联系…" : "正在理解并展开…"}
        </div>
      )}

      {intentProfile && aiMode === "deep_expand" && aiStatus !== "loading" && (
        <div className="mb-3 rounded-lg border border-line bg-bg/60 p-2.5">
          <p className="text-xs text-primary-bright">{intentProfile.primaryIntent}</p>
          <p className="mt-1 text-[11px] text-muted">
            当前阶段：{intentProfile.thinkingStage}
          </p>
        </div>
      )}

      {aiStatus === "error" && (
        <div>
          <p className="text-sm text-danger">{aiMessage}</p>
          <Button
            variant="primary"
            className="mt-2"
            onClick={() => void requestSuggestions(aiMode, aiTriggerNodeIds)}
          >
            重试
          </Button>
        </div>
      )}

      {aiStatus === "blocked" && (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger/5 p-3">
          <p className="text-sm font-medium text-danger">AI 已停止本次联想</p>
          <p className="mt-1 text-xs leading-5 text-muted">{aiMessage}</p>
          <p className="mt-2 text-xs text-muted">请删除或修改相关关键词后，再重新发起联想。</p>
        </div>
      )}

      {aiStatus === "success" && suggestions.length === 0 && (
        <p className="text-sm text-muted">{aiMessage || "本轮没有建议"}</p>
      )}

      {aiMode === "node_brainstorm" && suggestions.length > 0 && !selectedSuggestionId && (
        <p className="mb-3 text-xs leading-5 text-muted">候选已经围绕节点出现。点击一个虚化节点，在这里判断是否采用。</p>
      )}

      {suggestions.filter((s) => !selectedSuggestionId || s.id === selectedSuggestionId).map((s) => (
        <SuggestionCard key={s.id} suggestion={s} />
      ))}
    </section>
  );
}

function SummaryPanel() {
  const idea = useStore((s) => s.idea);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const status = useStore((s) => s.summaryStatus);
  const message = useStore((s) => s.summaryMessage);
  const draft = useStore((s) => s.summaryDraft);
  const generateSummary = useStore((s) => s.generateSummary);
  const saveSummary = useStore((s) => s.saveSummary);
  const summaries = idea?.summaries ?? [];

  return (
    <div>
      <p className="text-sm font-medium text-ink">把这一轮思考收拢下来</p>
      <p className="mt-1 text-xs leading-5 text-muted">总结只使用正式节点和连接，不会把虚化候选当作你的结论。</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="primary" disabled={(idea?.nodes.length ?? 0) < 2 || status === "loading"} onClick={() => void generateSummary("all")}>总结全部</Button>
        <Button disabled={!focusedNodeId || status === "loading"} onClick={() => void generateSummary("focused")}>总结聚焦区</Button>
      </div>
      {status === "loading" && <p className="mt-4 text-sm text-muted">正在整理主题、连接和未决问题…</p>}
      {status === "error" && <p className="mt-4 text-sm text-danger">{message}</p>}
      {draft && (
        <article className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4" data-testid="summary-draft">
          <h3 className="font-medium text-ink">{draft.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{draft.overview}</p>
          <SummaryList title="关键主题" items={draft.themes} />
          <SummaryList title="关键连接" items={draft.keyConnections} />
          <SummaryList title="未决问题" items={draft.openQuestions} />
          <SummaryList title="下一步" items={draft.nextDirections} />
          <Button className="mt-4 w-full" variant="primary" onClick={saveSummary}>保存阶段总结</Button>
          {message && <p className="mt-2 text-center text-xs text-muted">{message}</p>}
        </article>
      )}
      {summaries.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">历史总结</p>
          {summaries.slice(0, 5).map((summary) => (
            <div key={summary.id} className="mb-2 rounded-lg bg-bg/60 p-3">
              <p className="text-sm text-ink">{summary.title}</p>
              <p className="mt-1 text-xs text-muted">{new Date(summary.createdAt).toLocaleString("zh-CN")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-primary-bright">{title}</p>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-muted">
        {items.map((item) => <li key={item}>· {item}</li>)}
      </ul>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AISuggestion }) {
  const acceptSuggestion = useStore((s) => s.acceptSuggestion);
  const rejectSuggestion = useStore((s) => s.rejectSuggestion);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => suggestion.content);

  return (
    <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary-bright">
            {TYPE_LABEL[suggestion.type]}
          </span>
          <span
            data-testid="suggestion-dimension"
            className="rounded bg-bg px-1.5 py-0.5 text-[11px] text-muted"
          >
            {suggestion.dimension}
          </span>
        </div>
        <span className="text-xs text-muted">候选态</span>
      </div>

      {editing ? (
        <textarea
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink outline-none focus:border-primary"
        />
      ) : (
        <p className="text-sm text-ink">{suggestion.content}</p>
      )}
      <p className="mt-1 text-xs text-muted">{suggestion.reason}</p>
      {suggestion.type === "edge" && suggestion.edgeNote && (
        <p className="mt-1 text-xs text-muted">说明：{suggestion.edgeNote}</p>
      )}
      {suggestion.type === "edge" && suggestion.relation && (
        <p className="mt-1 text-[11px] text-muted">
          关系：{suggestion.relation}
          {typeof suggestion.strength === "number"
            ? ` · 强度 ${Math.round(suggestion.strength * 100)}%`
            : ""}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {suggestion.type === "node" &&
          (editing ? (
            <Button
              variant="primary"
              onClick={() => {
                acceptSuggestion(suggestion.id, text);
                setEditing(false);
              }}
            >
              确认接受
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => acceptSuggestion(suggestion.id)}>
                接受
              </Button>
              <Button variant="default" onClick={() => setEditing(true)}>
                编辑
              </Button>
            </>
          ))}
        {suggestion.type === "edge" && (
          <Button variant="primary" onClick={() => acceptSuggestion(suggestion.id)}>
            接受
          </Button>
        )}
        {editing && (
          <Button variant="ghost" onClick={() => setEditing(false)}>
            取消
          </Button>
        )}
        {suggestion.type === "question" ? (
          <Button variant="ghost" onClick={() => rejectSuggestion(suggestion.id)}>
            忽略
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => rejectSuggestion(suggestion.id)}>
            拒绝
          </Button>
        )}
      </div>
    </div>
  );
}
