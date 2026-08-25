"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Idea } from "@/lib/types";
import { listIdeas } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";
import { Button } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [seed, setSeed] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [creating, setCreating] = useState(false);
  const createIdea = useStore((s) => s.createIdea);

  useEffect(() => {
    listIdeas().then(setIdeas);
  }, []);

  const onSubmit = async () => {
    const text = seed.trim();
    if (!text || creating) return;
    setCreating(true);
    const id = await createIdea(text);
    router.push(`/idea/${id}`);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-14">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Grokking<span className="text-primary">恼</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          把脑中的关键词放入空间，建立与发现连接。
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <label htmlFor="seed" className="mb-3 block text-sm text-muted">
          我有一个念头
        </label>
        <textarea
          id="seed"
          value={seed}
          autoFocus
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
          }}
          rows={3}
          placeholder="写下一点正在想的东西…"
          className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-3 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted">⌘/Ctrl + Enter 快速开始</span>
          <Button
            variant="primary"
            disabled={!seed.trim() || creating}
            onClick={onSubmit}
          >
            {creating ? "正在创建…" : "进入空间"}
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-muted">最近的思考</h2>
        {ideas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            还没有念头。写下第一个吧。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/idea/${idea.id}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-primary"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">
                      {idea.title}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {idea.nodes.length} 个节点 · 更新于 {formatTime(idea.updatedAt)}
                    </div>
                  </div>
                  {idea.discoveryCount > 0 && (
                    <span className="ml-3 shrink-0 rounded-full bg-discovery/15 px-2.5 py-1 text-xs font-medium text-discovery">
                      {idea.discoveryCount} 新发现
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
