import type { Vec3 } from "./types";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 规则化标题（切片 1 临时方案，切片 2 用 LLM 替换）。 */
export function generateTitle(seed: string): string {
  const t = seed.replace(/\s+/g, " ").trim();
  if (!t) return "未命名念头";
  return t.length > 18 ? t.slice(0, 18) + "…" : t;
}

/** 批量粘贴拆分：换行 / 逗号 / 顿号 / 分号均视为分隔符，去空、去重（保持顺序）。 */
export function splitKeywords(text: string): string[] {
  const parts = text
    .split(/[\n,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** 在球壳上取随机初始位置。 */
export function randomPos(radius = 8): Vec3 {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * (0.35 + 0.65 * Math.random());
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta),
    z: r * Math.cos(phi),
  };
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}
