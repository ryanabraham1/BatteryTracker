"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { svgPath, type Loop } from "@/lib/geom";
import { initials, personHue, PERSON_COOKIE } from "@/lib/parts";
import { LEVEL_LABEL, LEVEL_TONE, type Level } from "@/lib/dfm";
import { Sheet } from "./sheet";

/** Save "who am I" for this device (a cookie, so server pages know it too). */
export function writePerson(name: string) {
  document.cookie = `${PERSON_COOKIE}=${encodeURIComponent(name.trim())}; path=/; max-age=31536000; samesite=lax`;
}

export function PersonChip({ name, size = 26, title }: { name: string; size?: number; title?: string }) {
  const h = personHue(name);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full mono font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${h} 70% 90%)`, color: `hsl(${h} 55% 28%)`, border: `1px solid hsl(${h} 50% 78%)` }}
      title={title ?? name}
      aria-label={title ?? name}
    >
      {initials(name)}
    </span>
  );
}

export function Assignees({ names, max = 3 }: { names: string[]; max?: number }) {
  if (!names.length) return null;
  return (
    <span className="inline-flex -space-x-1.5">
      {names.slice(0, max).map((n) => (
        <PersonChip key={n} name={n} size={24} />
      ))}
      {names.length > max && (
        <span className="chip" style={{ marginLeft: 4 }}>
          +{names.length - max}
        </span>
      )}
    </span>
  );
}

/** "You are …" button + sheet. Used to assign yourself to parts. */
export function PersonPicker({ person, people }: { person: string; people: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(person);
  const [pending, start] = useTransition();
  function save(n: string) {
    writePerson(n);
    setOpen(false);
    start(() => router.refresh());
  }
  return (
    <>
      <button type="button" className="btn btn-ghost text-sm shrink-0 gap-2" onClick={() => setOpen(true)} style={{ opacity: pending ? 0.6 : 1 }}>
        {person ? (
          <>
            <PersonChip name={person} size={22} /> {person}
          </>
        ) : (
          "Who are you?"
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} eyebrow="This device" title="Who are you?">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save(name);
          }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your name goes on parts you take. It&apos;s remembered on this device only.
          </p>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" autoFocus maxLength={40} />
          {people.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <button key={p} type="button" className="tile tile-chip text-sm flex items-center gap-2" data-selected={p === person} onClick={() => save(p)}>
                  <PersonChip name={p} size={20} /> {p}
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary py-3" disabled={!name.trim()}>
            That&apos;s me <span aria-hidden>→</span>
          </button>
        </form>
      </Sheet>
    </>
  );
}

/** A plate's outline, drawn to fit its box. */
export function Outline({ shape, className = "", stroke = "var(--purple)" }: { shape: { loops: Loop[]; width: number; height: number }; className?: string; stroke?: string }) {
  if (!shape.loops.length) return null;
  const { width: w, height: h } = shape;
  const pad = Math.max(w, h) * 0.04;
  return (
    <svg viewBox={`${-pad} ${-h - pad} ${w + 2 * pad} ${h + 2 * pad}`} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g transform="scale(1,-1)">
        <path d={svgPath(shape.loops)} fill="var(--purple-soft)" fillRule="evenodd" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

export function DfmPill({ level, unchecked = 0, best, compact }: { level: Level; unchecked?: number; best?: string | null; compact?: boolean }) {
  const tone = LEVEL_TONE[level];
  const label = level === "info" && unchecked ? "Partly checked" : LEVEL_LABEL[level];
  return (
    <span className={`pill pill-${tone}`} title={`${label}${best ? ` · best: ${best}` : ""}`}>
      {compact ? (level === "fail" ? "✕ Can't make" : level === "warn" ? "! Check" : "✓") : label}
    </span>
  );
}

export function IssueList({ issues }: { issues: { level: string; text: string }[] }) {
  if (!issues.length) return null;
  const color = (l: string) => (l === "fail" ? "var(--bad)" : l === "warn" ? "var(--warn)" : l === "ok" ? "var(--good)" : "var(--muted)");
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {issues.map((i, k) => (
        <li key={k} className="flex gap-2">
          <span className="mono font-bold shrink-0 w-3 text-center" style={{ color: color(i.level) }} aria-hidden>
            {i.level === "fail" ? "✕" : i.level === "warn" ? "!" : "·"}
          </span>
          <span style={{ color: i.level === "info" ? "var(--muted)" : undefined }}>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}
