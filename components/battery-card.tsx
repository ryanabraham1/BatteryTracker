"use client";

import type { BatteryWithHealth } from "@/lib/health";
import { durationShort, fmtNum, minutesSince, timeAgo } from "@/lib/format";
import { HealthPill } from "./ui";

export function restRemaining(item: BatteryWithHealth, now: number): number {
  if (item.battery.state !== "ready" || !item.health.restedAt) return 0;
  return Math.max(0, Math.round((new Date(item.health.restedAt).getTime() - now) / 60_000));
}

export function BatteryCard({
  item,
  now,
  grab,
  onClick,
  extra,
}: {
  item: BatteryWithHealth;
  now: number;
  grab?: boolean;
  onClick?: () => void;
  extra?: React.ReactNode;
}) {
  const { battery: b, health: h } = item;
  const rest = restRemaining(item, now);
  const inState = minutesSince(b.state_changed_at, now);
  const lastTest = h.latestBeak?.at ?? h.latestCba?.at ?? null;
  const fails = h.warnings.filter((w) => w.level === "fail").length;
  const warns = h.warnings.length - fails;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className="card p-3.5 flex flex-col gap-2.5 cursor-pointer select-none transition-colors hover:border-[var(--purple)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--purple)]"
      style={grab ? { borderColor: "var(--good)", boxShadow: "inset 0 0 0 1px var(--good)" } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {grab && (
            <span className="eyebrow block mb-1" style={{ color: "var(--good)" }}>
              ★ Grab this
            </span>
          )}
          {rest > 0 && !grab && (
            <span className="eyebrow block mb-1" style={{ color: "var(--warn)" }}>
              Resting
            </span>
          )}
          <h3 className="display text-2xl truncate">{b.name}</h3>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <HealthPill badge={h.badge} score={h.score} />
          {h.lastVoltage && (
            <span className="mono text-sm font-semibold" title={`Last voltage (${h.lastVoltage.source}, ${timeAgo(h.lastVoltage.at, now)})`}>
              {fmtNum(h.lastVoltage.v, 2)} V
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip">{b.cycle_count} cyc</span>
        <span className="chip">{lastTest ? `tested ${timeAgo(lastTest, now)}` : "untested"}</span>
        <span className="chip">{durationShort(inState)} here</span>
        {rest > 0 && (
          <span className="chip" style={{ color: "var(--warn)", borderColor: "var(--warn)", background: "var(--warn-soft)" }}>
            rests {rest}m
          </span>
        )}
        {h.chargingTooLong && (
          <span className="chip" style={{ color: "var(--bad)", borderColor: "var(--bad)", background: "var(--bad-soft)" }}>
            too long
          </span>
        )}
        {(fails > 0 || warns > 0) && (
          <span
            className="chip"
            style={fails ? { color: "var(--bad)", borderColor: "var(--bad)", background: "var(--bad-soft)" } : { color: "var(--warn)" }}
            title={h.warnings.map((w) => w.text).join("\n")}
          >
            {fails ? `${fails} fail` : `${warns} warn`}
          </span>
        )}
        {b.status === "practice_only" && <span className="chip">practice</span>}
      </div>
      {extra}
    </div>
  );
}
