"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { FabResult } from "@/app/fab-actions";
import { fmtLength, lengthInputValue, parseLength, UNITS_COOKIE, type Units } from "@/lib/units";

/** Run a fab server action from a form (or a field map), with pending + error state. */
export function useFabAction<T>(action: (fd: FormData) => Promise<FabResult<T>>, onOk?: (data: T | undefined) => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send(fd: FormData) {
    setError(null);
    start(async () => {
      const r = await action(fd);
      if (!r.ok) setError(r.error);
      else onOk?.(r.data);
    });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(new FormData(e.currentTarget));
  }

  function call(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    send(fd);
  }

  return { pending, error, submit, call, setError };
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="text-sm font-medium" style={{ color: "var(--bad)" }} role="alert">
      {error}
    </p>
  );
}

export function SubmitButton({ pending, label, danger }: { pending: boolean; label: string; danger?: boolean }) {
  return (
    <button type="submit" disabled={pending} className={`btn ${danger ? "btn-danger" : "btn-primary"} py-3`}>
      {pending ? "Saving…" : label} <span aria-hidden>→</span>
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && (
        <span className="block mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/**
 * Length field that takes shop notation — `27 1/2`, `2' 3"`, `700mm` — in the
 * viewer's units, shows the conversion, and submits millimetres in `name`.
 */
export function LengthInput({
  name,
  label,
  units,
  defaultMm,
  hint,
  required,
  onChange,
  autoFocus,
}: {
  name: string;
  label: string;
  units: Units;
  defaultMm?: number | null;
  hint?: ReactNode;
  required?: boolean;
  onChange?: (mm: number | null) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(() => lengthInputValue(defaultMm ?? null, units));
  const mm = parseLength(text, units);
  const other: Units = units === "in" ? "mm" : "in";
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative">
        <input
          className="input mono pr-12"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange?.(parseLength(e.target.value, units));
          }}
          placeholder={units === "in" ? "e.g. 27 1/2" : "e.g. 700"}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required={required}
          autoFocus={autoFocus}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 mono text-sm pointer-events-none" style={{ color: "var(--muted)" }}>
          {units}
        </span>
      </div>
      <input type="hidden" name={name} value={mm ?? ""} />
      <span className="block mt-1 text-xs mono" style={{ color: text && mm === null ? "var(--bad)" : "var(--muted)" }}>
        {text ? (mm === null ? `Can't read that — try ${units === "in" ? `27 1/2, 2' 3", or 700mm` : `700, 70cm, or 27.5"`}` : `= ${fmtLength(mm, other)}`) : hint}
      </span>
    </label>
  );
}

/** Two length fields side by side for sheet sizes. */
export function RectInput({
  prefix = "",
  units,
  defaultW,
  defaultL,
  onChange,
  labels = ["Width", "Length"],
}: {
  prefix?: string;
  units: Units;
  defaultW?: number | null;
  defaultL?: number | null;
  onChange?: (w: number | null, l: number | null) => void;
  labels?: [string, string];
}) {
  const [w, setW] = useState<number | null>(defaultW ?? null);
  const [l, setL] = useState<number | null>(defaultL ?? null);
  return (
    <div className="grid grid-cols-2 gap-2">
      <LengthInput
        name={`${prefix}width_mm`}
        label={labels[0]}
        units={units}
        defaultMm={defaultW}
        onChange={(v) => {
          setW(v);
          onChange?.(v, l);
        }}
      />
      <LengthInput
        name={`${prefix}length_mm`}
        label={labels[1]}
        units={units}
        defaultMm={defaultL}
        onChange={(v) => {
          setL(v);
          onChange?.(w, v);
        }}
      />
    </div>
  );
}

function writeUnitsCookie(u: Units) {
  document.cookie = `${UNITS_COOKIE}=${u}; path=/; max-age=31536000; samesite=lax`;
}

/** in / mm switch. Stored per device in a cookie so server-rendered pages use it too. */
export function UnitsToggle({ units }: { units: Units }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function set(u: Units) {
    if (u === units) return;
    writeUnitsCookie(u);
    start(() => router.refresh());
  }
  return (
    <div
      className="inline-flex rounded-lg p-0.5 shrink-0"
      style={{ background: "var(--paper)", border: "1px solid var(--line)", opacity: pending ? 0.6 : 1 }}
      role="group"
      aria-label="Units"
    >
      {(["in", "mm"] as Units[]).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => set(u)}
          aria-pressed={u === units}
          className="mono text-xs font-semibold rounded-md px-3"
          style={{
            minHeight: 36,
            background: u === units ? "var(--purple)" : "transparent",
            color: u === units ? "#fff" : "var(--muted)",
          }}
        >
          {u === "in" ? "inch" : "mm"}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow" style={{ color: "var(--muted)" }}>
          {eyebrow}
        </p>
        <h1 className="display text-4xl sm:text-5xl break-words">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">{children}</div>}
    </div>
  );
}
