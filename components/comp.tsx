"use client";

import Link from "next/link";
import { useMemo } from "react";
import { sortReady, type BatteryWithHealth } from "@/lib/health";
import type { Settings } from "@/lib/types";
import { restRemaining } from "./battery-card";
import { useNow } from "./board";
import { useCompMode } from "./comp-mode";
import { HealthPill } from "./ui";

/** Next-match label helper: "Q12" → "Q13"; anything else stays blank. */
function bump(label: string, n: number): string {
  const m = label.match(/^([A-Za-z-]*?)(\d+)$/);
  if (!m) return n === 0 ? label : "";
  return `${m[1]}${Number(m[2]) + n}`;
}

export function CompPanel({ items, settings, matches = 6 }: { items: BatteryWithHealth[]; settings: Settings; matches?: number }) {
  const now = useNow(15_000);
  const { compMode, setCompMode, matchLabel, setMatchLabel } = useCompMode();

  const plan = useMemo(() => {
    const active = items.filter((i) => i.battery.status === "active");
    const ready = sortReady(
      active
        .filter((i) => i.battery.state === "ready")
        .map((i) => ({ ...i, health: { ...i.health, restRemainingMin: restRemaining(i, now) } })),
    );
    // Batteries that will become usable soon (charging), by health.
    // They're appended after the ready pool so the plan degrades gracefully.
    const soon = active
      .filter((i) => i.battery.state === "charging")
      .sort((a, b) => (b.health.score ?? -1) - (a.health.score ?? -1));
    const pool = [...ready, ...soon];
    const rows: { match: string; item: BatteryWithHealth | null; note: string }[] = [];
    for (let n = 0; n < matches; n++) {
      const item = pool[n] ?? null;
      let note = "";
      if (item) {
        if (item.battery.state === "ready") {
          const r = restRemaining(item, now);
          note = r > 0 ? `rests ${r}m` : "ready";
        } else note = "still charging";
      }
      rows.push({ match: bump(matchLabel, n), item, note });
    }
    return rows;
  }, [items, matchLabel, matches, now]);

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-4 flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
        <div>
          <p className="label">Competition mode</p>
          <button
            type="button"
            className="tile py-3 px-4 font-medium w-full sm:w-auto"
            data-selected={compMode}
            onClick={() => setCompMode(!compMode)}
            aria-pressed={compMode}
          >
            {compMode ? "On — brownout buttons live" : "Off — tap to turn on"}
          </button>
        </div>
        <label className="block flex-1 sm:min-w-40">
          <span className="label">Current match label</span>
          <input
            className="input mono text-lg"
            placeholder="Q12, SF1-2…"
            value={matchLabel}
            onChange={(e) => setMatchLabel(e.target.value)}
          />
        </label>
        <p className="text-xs basis-full" style={{ color: "var(--muted)" }}>
          The match label pre-fills usage and incident logs. When comp mode is on, In-Robot cards on the board get a one-tap ⚡ Brownout button.
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>Rotation plan · next {matches}</p>
          <span className="text-xs" style={{ color: "var(--muted)" }}>rest rule {settings.min_rest_after_charge_min}m</span>
        </div>
        <ol className="card divide-y" style={{ borderColor: "var(--line)" }}>
          {plan.map((row, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 min-h-[60px]" style={{ borderColor: "var(--line)" }}>
              <span className="mono text-xs w-10 sm:w-14 shrink-0" style={{ color: "var(--muted)" }}>
                {row.match || `+${i + 1}`}
              </span>
              {row.item ? (
                <>
                  <div className="flex-1 min-w-0">
                    <Link href={`/batteries/${encodeURIComponent(row.item.battery.name)}`} className="display text-2xl block truncate">
                      {row.item.battery.name}
                    </Link>
                    <span className="block sm:hidden mt-1">
                      <span className="chip" style={row.note !== "ready" ? { color: "var(--warn)" } : undefined}>{row.note}</span>
                    </span>
                  </div>
                  <span className="hidden sm:block">
                    <span className="chip" style={row.note !== "ready" ? { color: "var(--warn)" } : undefined}>{row.note}</span>
                  </span>
                  <HealthPill badge={row.item.health.badge} score={row.item.health.score} />
                </>
              ) : (
                <span className="text-sm flex-1" style={{ color: "var(--muted)" }}>No battery available — get one charging.</span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Derived from Ready order (health, then longest rested), then charging batteries by health. Recalculates live as states change.
        </p>
      </div>
    </div>
  );
}
