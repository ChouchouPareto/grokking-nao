"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "登录失败，请稍后重试");
        return;
      }
      const next = searchParams.get("next");
      window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError("网络暂时不可用，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="home-atmosphere relative flex min-h-full items-center justify-center overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <span className="ambient-orb ambient-orb-a" />
        <span className="ambient-orb ambient-orb-b" />
        <span className="ambient-orb ambient-orb-c" />
      </div>
      <section className="glass-inset relative z-10 w-full max-w-md rounded-3xl p-7 md:p-9">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary-bright">Spatial thinking workspace</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink">进入 Grokking<span className="text-primary">恼</span></h1>
        <p className="mt-2 text-sm leading-6 text-muted">当前为邀请体验阶段，请输入邀请码进入你的 3D 思考空间。</p>
        <form className="mt-7" onSubmit={submit}>
          <label htmlFor="invite-code" className="text-sm font-medium text-ink">邀请码</label>
          <input
            id="invite-code"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="请输入邀请码"
            className="inset-input mt-3 min-h-12 w-full rounded-2xl px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/50"
          />
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={!code.trim() || submitting}
            className="specular-button mt-5 min-h-12 w-full rounded-2xl bg-primary px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? "正在验证…" : "进入思考空间"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-muted">邀请码仅用于内测访问，请勿公开转发。</p>
      </section>
    </main>
  );
}

function LoginShell() {
  return (
    <main className="home-atmosphere relative flex min-h-full items-center justify-center overflow-hidden px-6 py-12">
      <section className="glass-inset relative z-10 w-full max-w-md rounded-3xl p-9 text-center">
        <p className="text-sm text-muted">正在准备登录空间…</p>
      </section>
    </main>
  );
}
