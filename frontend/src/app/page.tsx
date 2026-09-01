"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { DirectionCandidate, Idea, LocationContext, ThinkingMode } from "@/lib/types";
import { deleteIdea, duplicateIdea, listIdeas } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { Button, Modal } from "@/components/ui";
import { fetchDirectionSuggestions } from "@/lib/ai";
import { LocationRequestError, requestCurrentLocation } from "@/lib/location";
import { splitKeywords } from "@/lib/utils";

type AtmosphereStyle = CSSProperties & {
  "--ambient-a": string;
  "--ambient-b": string;
  "--ambient-c": string;
};

const IDEA_EXAMPLES = [
  "我想重新设计社区生鲜的订阅体验",
  "把独居老人的陪伴需求与社区服务连接起来",
  "AI 可以怎样帮助独立创作者找到收入来源？",
  "如果城市闲置空间变成夜间学习站？",
];

function useTypewriterExamples(enabled: boolean) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const fullText = IDEA_EXAMPLES[index];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const staticTimer = window.setTimeout(() => setTyped(fullText), 0);
      return () => window.clearTimeout(staticTimer);
    }

    let delay = deleting ? 32 : 68;
    let update = () => setTyped(deleting ? typed.slice(0, -1) : fullText.slice(0, typed.length + 1));
    if (!deleting && typed === fullText) {
      delay = 1550;
      update = () => setDeleting(true);
    } else if (deleting && typed === "") {
      delay = 320;
      update = () => {
        setDeleting(false);
        setIndex((current) => (current + 1) % IDEA_EXAMPLES.length);
      };
    }
    const timer = window.setTimeout(update, delay);
    return () => window.clearTimeout(timer);
  }, [deleting, enabled, index, typed]);

  return typed;
}

function atmosphereFor(text = ""): AtmosphereStyle {
  if (/生鲜|自然|农业|植物|健康/.test(text)) {
    return { "--ambient-a": "170 226 205", "--ambient-b": "215 234 168", "--ambient-c": "173 218 224" };
  }
  if (/科技|AI|人工智能|未来|数据/.test(text)) {
    return { "--ambient-a": "189 197 246", "--ambient-b": "174 224 246", "--ambient-c": "218 193 246" };
  }
  if (/内容|创作|设计|故事|品牌/.test(text)) {
    return { "--ambient-a": "244 193 218", "--ambient-b": "210 196 246", "--ambient-c": "250 218 181" };
  }
  return { "--ambient-a": "207 199 246", "--ambient-b": "183 225 232", "--ambient-c": "235 207 242" };
}

export default function Home() {
  const router = useRouter();
  const [seed, setSeed] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [creating, setCreating] = useState(false);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("business");
  const [direction, setDirection] = useState("");
  const [directionSource, setDirectionSource] = useState<"user" | "ai">("user");
  const [directionCandidates, setDirectionCandidates] = useState<DirectionCandidate[]>([]);
  const [directionLoading, setDirectionLoading] = useState(false);
  const [directionMessage, setDirectionMessage] = useState("");
  const [location, setLocation] = useState<LocationContext>({ permission: "idle", label: "" });
  const [menuIdeaId, setMenuIdeaId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Idea | null>(null);
  const animatedExample = useTypewriterExamples(seed.length === 0);
  const createIdea = useStore((s) => s.createIdea);
  const keywordPreview = useMemo(() => splitKeywords(seed), [seed]);

  useEffect(() => {
    listIdeas().then(setIdeas);
  }, []);

  const onSubmit = async () => {
    const text = seed.trim();
    if (!text || creating) return;
    setCreating(true);
    const id = await createIdea(text, {
      thinkingMode,
      directionText: direction,
      directionSource,
      locationContext: location,
    });
    router.push(`/idea/${id}`);
  };

  const suggestDirections = async () => {
    const text = seed.trim();
    if (!text || directionLoading) {
      setDirectionMessage("先写下你正在思考的主题");
      return;
    }
    setDirectionLoading(true);
    setDirectionMessage("");
    try {
      const response = await fetchDirectionSuggestions({
        seed_text: text,
        thinking_mode: thinkingMode,
        location_label: location.label || undefined,
      });
      setDirectionCandidates(response.candidates.slice(0, 3));
    } catch (error) {
      setDirectionMessage(error instanceof Error ? error.message : "暂时无法生成方向建议");
    } finally {
      setDirectionLoading(false);
    }
  };

  const authorizeLocation = async () => {
    setLocation({ permission: "requesting", label: "正在获取位置…" });
    try {
      setLocation(await requestCurrentLocation());
    } catch (error) {
      if (error instanceof LocationRequestError) {
        setLocation({ permission: error.permission, label: error.message });
      } else {
        setLocation({ permission: "unavailable", label: "暂时无法获取位置" });
      }
    }
  };

  const atmosphere = atmosphereFor(ideas[0]?.seedText);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <main className="home-atmosphere relative min-h-full overflow-hidden px-6 py-10 md:px-10" style={atmosphere}>
      <AtmosphereBackground />
      <div className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary-bright">Spatial thinking workspace</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">Grokking<span className="text-primary">恼</span></h1>
            <p className="mt-2 text-sm text-muted">从一个念头出发，看见商业链路与意外连接。</p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="glass-chip rounded-full px-3 py-1.5 text-xs text-muted">本地保存 · {ideas.length} 个项目</span>
            <button type="button" onClick={logout} className="glass-chip rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink">退出</button>
          </div>
        </header>

        <section className="glass-inset rounded-3xl p-5 md:p-8" aria-label="开始新的思考">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary-bright">Start with a thought</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">你现在想看透什么？</h2>
              <p className="mt-1 text-sm text-muted">先给主题，再决定是拆商业链路，还是自由发散。</p>
            </div>
            <div className="thinking-mode-switch" aria-label="思考模式">
              <button type="button" aria-pressed={thinkingMode === "business"} onClick={() => setThinkingMode("business")} className={thinkingMode === "business" ? "is-active" : ""}>
                <span>商业深思</span><small>横向业态 · 纵向链路</small>
              </button>
              <button type="button" aria-pressed={thinkingMode === "daily"} onClick={() => setThinkingMode("daily")} className={thinkingMode === "daily" ? "is-active" : ""}>
                <span>日常发散</span><small>联想 · 涌现 · 记录</small>
              </button>
            </div>
          </div>

          <div className="relative mt-6">
            {!seed && (
              <span className="typewriter-hint pointer-events-none absolute left-5 top-5 z-10 max-w-[calc(100%-2.5rem)] text-sm leading-7 text-muted md:left-6" aria-hidden="true">
                <span className="mr-2 opacity-70">例如</span>{animatedExample}<i />
              </span>
            )}
            <textarea id="seed" aria-label="思考主题" value={seed} onChange={(e) => { setSeed(e.target.value); setDirectionCandidates([]); }} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }} rows={3} className="inset-input min-h-28 w-full resize-none rounded-2xl px-5 py-5 text-base leading-7 text-ink outline-none focus:ring-2 focus:ring-primary/50 md:px-6" />
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-[11px] leading-5 text-muted">多个关键词可用换行、逗号、顿号或分号隔开，进入画布后会自动拆成独立节点。</p>
            {keywordPreview.length > 1 && (
              <div className="flex max-w-full flex-wrap justify-start gap-1.5 sm:max-w-[58%] sm:justify-end" aria-live="polite" aria-label={`将创建 ${keywordPreview.length} 个节点`}>
                {keywordPreview.slice(0, 8).map((keyword) => (
                  <span key={keyword} className="keyword-preview-chip">{keyword}</span>
                ))}
                {keywordPreview.length > 8 && <span className="keyword-preview-chip">+{keywordPreview.length - 8}</span>}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="direction-field">
              <label htmlFor="direction" className="text-xs font-medium text-muted">这次想往什么方向想？ <span className="font-normal">（可以留空）</span></label>
              <input id="direction" value={direction} onChange={(event) => { setDirection(event.target.value); setDirectionSource("user"); }} placeholder={thinkingMode === "business" ? "例如：先看供应链里最容易被忽略的利润点" : "例如：找一个完全反常识的连接"} className="mt-2 min-h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/70" />
            </div>
            <Button className="min-h-14 self-end lg:min-w-32" disabled={!seed.trim() || directionLoading} onClick={() => void suggestDirections()}>{directionLoading ? "正在思考…" : "AI 建议方向"}</Button>
          </div>

          {directionCandidates.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-3" aria-label="AI方向候选">
              {directionCandidates.map((candidate) => (
                <button key={candidate.id} type="button" onClick={() => { setDirection(candidate.text); setDirectionSource("ai"); }} className={`direction-candidate ${direction === candidate.text ? "is-selected" : ""}`}>
                  <span>{candidate.text}</span><small>{candidate.reason}</small>
                </button>
              ))}
            </div>
          )}
          {directionMessage && <p className="mt-3 text-xs text-danger" role="status">{directionMessage}</p>}

          <div className="mt-5 flex flex-col gap-3 border-t border-white/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void authorizeLocation()} className="location-consent text-left" disabled={location.permission === "requesting"}>
              <span aria-hidden="true">⌖</span>
              <span><strong>{location.permission === "granted" ? "已启用环境启发" : "用当前位置获得环境启发"}</strong><small>{location.label || "只在你主动点击时获取，可随时跳过"}</small></span>
            </button>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-xs text-muted">⌘/Ctrl + Enter</span>
              <Button variant="primary" className="min-h-12 px-5" disabled={!seed.trim() || creating} onClick={onSubmit}>{creating ? "正在创建…" : "进入思维空间"}</Button>
            </div>
          </div>
        </section>

        <section className="mt-10" aria-label="项目列表">
          <div className="mb-4 flex items-center justify-end">
            <span className="text-xs text-muted">点击项目直接进入 3D 视图</span>
          </div>
        {ideas.length === 0 ? (
          <div className="glass-inset rounded-3xl px-6 py-14 text-center">
            <p className="text-sm text-ink">还没有项目</p>
            <p className="mt-2 text-xs text-muted">从下面写下第一个念头。</p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <article
                  style={atmosphereFor(idea.seedText)}
                  className="project-glass-card group relative flex min-h-40 w-full cursor-pointer flex-col justify-between overflow-hidden rounded-3xl p-5 text-left transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <button type="button" aria-label={`打开项目：${idea.title}`} onClick={() => router.push(`/idea/${idea.id}`)} className="absolute inset-0 z-10 cursor-pointer rounded-3xl focus-visible:ring-2 focus-visible:ring-primary"><span className="sr-only">打开项目</span></button>
                  <span className="project-card-glow" aria-hidden="true" />
                  <span className="project-card-tiles" aria-hidden="true"><i /><i /><i /><i /></span>
                  <div className="pointer-events-none flex w-full items-start justify-between gap-3">
                    <div className="relative z-10 truncate text-base font-medium text-ink">{idea.title}</div>
                    <span className="pointer-events-auto relative z-20">
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`管理项目：${idea.title}`}
                        aria-expanded={menuIdeaId === idea.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuIdeaId(menuIdeaId === idea.id ? null : idea.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            setMenuIdeaId(menuIdeaId === idea.id ? null : idea.id);
                          }
                        }}
                        className="project-menu-trigger flex h-9 w-9 items-center justify-center rounded-full text-lg text-muted"
                      >
                        ···
                      </span>
                      {menuIdeaId === idea.id && (
                        <span className="project-menu absolute right-0 top-11 flex w-32 flex-col rounded-2xl p-1.5" onClick={(event) => event.stopPropagation()}>
                          <span
                            role="button"
                            tabIndex={0}
                            className="rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-white/60"
                            onClick={async () => {
                              const copy = await duplicateIdea(idea);
                              setIdeas((current) => [copy, ...current]);
                              setMenuIdeaId(null);
                            }}
                            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.click()}
                          >复制项目</span>
                          <span
                            role="button"
                            tabIndex={0}
                            className="rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-red-50/70"
                            onClick={() => { setDeleteTarget(idea); setMenuIdeaId(null); }}
                            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.click()}
                          >删除项目</span>
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="pointer-events-none relative z-20 flex w-full items-center justify-between text-xs text-muted">
                    <span>{idea.nodes.length} 节点 · {idea.edges.length} 连接</span>
                    <span>{formatTime(idea.updatedAt)}</span>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
        </section>

      </div>
      {deleteTarget && (
        <Modal title="删除这个项目？" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm leading-6 text-muted">“{deleteTarget.title}”及其中的节点、连接和总结都会从本地删除，此操作无法撤销。</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger" onClick={async () => {
              await deleteIdea(deleteTarget.id);
              setIdeas((current) => current.filter((item) => item.id !== deleteTarget.id));
              setDeleteTarget(null);
            }}>确认删除</Button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function AtmosphereBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <span className="ambient-orb ambient-orb-a" />
      <span className="ambient-orb ambient-orb-b" />
      <span className="ambient-orb ambient-orb-c" />
      <div className="ambient-grid">
        {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
      </div>
      <span className="ambient-vignette" />
    </div>
  );
}
