"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setError(j.error ?? "Something went wrong");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="block">
        <span className="eyebrow block mb-2" style={{ color: "var(--plum-text)" }}>
          Shared team code
        </span>
        <input
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="w-full rounded-lg px-4 py-3.5 text-lg outline-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${error ? "var(--bad)" : "rgba(189,168,238,0.35)"}`,
            color: "#fff",
          }}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="••••••••"
          type="password"
        />
      </label>
      {error && (
        <p className="text-sm font-medium" style={{ color: "#ff7d8a" }} role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !code} className="btn btn-plum text-base py-3.5 mt-2">
        {busy ? "Checking…" : "Open tracker"} <span aria-hidden>→</span>
      </button>
    </form>
  );
}
