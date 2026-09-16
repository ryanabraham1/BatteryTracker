"use client";

import { useState, useTransition, type FormEvent } from "react";
import { changeTeamCode, updateSettings } from "@/app/actions";
import type { Settings } from "@/lib/types";

const FIELDS: { key: keyof Settings; label: string; unit: string; hint: string }[] = [
  { key: "min_rest_after_charge_min", label: "Min rest after charge", unit: "min", hint: "Don't recommend a battery until it has rested this long" },
  { key: "max_charge_duration_min", label: "Max charge duration", unit: "min", hint: "Flag “charging too long” past this" },
  { key: "ir_warn_mohm", label: "IR: reserve from", unit: "mΩ", hint: "Below this is comp-ready; at or above is reserve" },
  { key: "ir_practice_mohm", label: "IR: practice-only from", unit: "mΩ", hint: "At or above → suggest marking practice-only" },
  { key: "ir_suspect_mohm", label: "IR: suspect from", unit: "mΩ", hint: "At or above → suspect (still practice-only)" },
  { key: "ir_fail_mohm", label: "IR: retire from", unit: "mΩ", hint: "At or above → suggest retiring; IR score hits 0 here" },
  { key: "load_test_min_v", label: "Load test floor", unit: "V", hint: "100 A load test fails if the loaded voltage is below this" },
  { key: "capacity_warn_pct", label: "Capacity warn", unit: "%", hint: "CBA measured / rated below this → warn" },
  { key: "capacity_fail_pct", label: "Capacity fail", unit: "%", hint: "Below this → recommend retire" },
  { key: "max_cycles_warn", label: "Max cycles", unit: "cycles", hint: "Age warning; cycle score hits 0 here" },
];

function useAction(action: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setMsg(null);
    start(async () => {
      const r = await action(fd);
      setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
      if (r.ok && form.dataset.reset === "1") form.reset();
    });
  }
  return { pending, msg, submit };
}

export function SettingsForm({ settings, usingEnvCode }: { settings: Settings; usingEnvCode: boolean }) {
  const s = useAction(updateSettings);
  const c = useAction(changeTeamCode);

  return (
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <form onSubmit={s.submit} className="card p-4 sm:p-5 flex flex-col gap-4">
        <p className="eyebrow" style={{ color: "var(--muted)" }}>Thresholds</p>
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="label">{f.label}</span>
            <div className="flex items-center gap-2">
              <input
                name={f.key}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                className="input mono"
                defaultValue={settings[f.key] as number}
              />
              <span className="mono text-xs w-12 shrink-0" style={{ color: "var(--muted)" }}>{f.unit}</span>
            </div>
            <span className="block mt-1 text-xs" style={{ color: "var(--muted)" }}>{f.hint}</span>
          </label>
        ))}
        {s.msg && (
          <p className="text-sm font-medium" style={{ color: s.msg.ok ? "var(--good)" : "var(--bad)" }}>{s.msg.text}</p>
        )}
        <button type="submit" disabled={s.pending} className="btn btn-primary py-3">
          {s.pending ? "Saving…" : "Save thresholds"} <span aria-hidden>→</span>
        </button>
      </form>

      <div className="flex flex-col gap-6">
        <form onSubmit={c.submit} data-reset="1" className="card p-4 sm:p-5 flex flex-col gap-4">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>Team code</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {usingEnvCode
              ? "Currently using the TEAM_CODE environment variable."
              : "Currently using a code set here (overrides the TEAM_CODE env var)."}{" "}
            Changing it signs out every other device.
          </p>
          <label className="block">
            <span className="label">Current code</span>
            <input name="current_code" type="password" required className="input" autoComplete="off" />
          </label>
          <label className="block">
            <span className="label">New code</span>
            <input name="new_code" type="password" required minLength={4} className="input" autoComplete="off" />
          </label>
          <label className="block">
            <span className="label">Confirm new code</span>
            <input name="confirm_code" type="password" required className="input" autoComplete="off" />
          </label>
          {c.msg && (
            <p className="text-sm font-medium" style={{ color: c.msg.ok ? "var(--good)" : "var(--bad)" }}>
              {c.msg.ok ? "Code changed. Everyone else needs to sign in again." : c.msg.text}
            </p>
          )}
          <button type="submit" disabled={c.pending} className="btn btn-ghost py-3">
            {c.pending ? "Changing…" : "Change team code"} <span aria-hidden>→</span>
          </button>
        </form>

        <form action="/api/logout" method="post" className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="eyebrow" style={{ color: "var(--muted)" }}>This device</p>
            <p className="text-sm">Sign out of the tracker on this phone.</p>
          </div>
          <button type="submit" className="btn btn-ghost text-sm shrink-0">Sign out</button>
        </form>
      </div>
    </div>
  );
}
