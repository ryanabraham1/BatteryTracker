import type { HealthBadge } from "@/lib/health";
import { STATE_LABEL, STATE_TONE, STATUS_LABEL, type BatteryState, type BatteryStatus } from "@/lib/types";

export function HealthPill({ badge, score }: { badge: HealthBadge | null; score: number | null }) {
  if (badge === null || score === null) return <span className="pill pill-muted">No data</span>;
  const cls = badge === "good" ? "pill-good" : badge === "watch" ? "pill-warn" : "pill-bad";
  const label = badge === "good" ? "Good" : badge === "watch" ? "Watch" : "Bad";
  return (
    <span className={`pill ${cls}`}>
      {label} <span style={{ opacity: 0.75 }}>{score}</span>
    </span>
  );
}

export function StatePill({ state }: { state: BatteryState }) {
  return <span className={`pill pill-${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>;
}

export function StatusPill({ status }: { status: BatteryStatus }) {
  const cls = status === "active" ? "pill-good" : status === "practice_only" ? "pill-info" : "pill-muted";
  return <span className={`pill ${cls}`}>{STATUS_LABEL[status]}</span>;
}

/** Health score ring for the detail page header. */
export function HealthRing({ score, badge, size = 84 }: { score: number | null; badge: HealthBadge | null; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  const color =
    badge === "good" ? "var(--good)" : badge === "watch" ? "var(--warn)" : badge === "bad" ? "var(--bad)" : "var(--line)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono font-semibold text-xl leading-none">{score ?? "—"}</span>
        <span className="eyebrow" style={{ fontSize: 9, color: "var(--muted)" }}>
          health
        </span>
      </div>
    </div>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`eyebrow ${className}`} style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-6 text-center text-sm" style={{ color: "var(--muted)", borderStyle: "dashed" }}>
      {children}
    </div>
  );
}
