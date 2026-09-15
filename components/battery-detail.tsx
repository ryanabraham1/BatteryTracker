"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HealthSummary } from "@/lib/health";
import { ageLabel, durationShort, fmtDate, fmtNum, minutesSince, timeAgo } from "@/lib/format";
import { EVENT_LABEL, EVENT_TYPES, STATE_LABEL, type Battery, type BatteryEvent, type EventType, type Settings } from "@/lib/types";
import { BatteryActionSheet, useBatteryActions, type ActionView } from "./battery-actions";
import { BatteryCharts } from "./charts";
import { EventRow } from "./event-row";
import { HealthRing, StatePill, StatusPill } from "./ui";
import { useNow } from "./board";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-3 min-w-0">
      <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="mono text-lg font-semibold leading-tight truncate">{value}</p>
      {sub && <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>{sub}</p>}
    </div>
  );
}

export function BatteryDetail({
  battery,
  events,
  health,
  settings,
}: {
  battery: Battery;
  events: BatteryEvent[];
  health: HealthSummary;
  settings: Settings;
}) {
  const now = useNow();
  const actions = useBatteryActions();
  const [filter, setFilter] = useState<EventType | "all">("all");
  const timeline = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.type === filter)),
    [events, filter],
  );
  const inState = minutesSince(battery.state_changed_at, now);

  const act = (v: ActionView) => actions.open(battery, v);
  const retired = battery.status === "retired";

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <HealthRing score={health.score} badge={health.badge} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <StatusPill status={battery.status} />
            <StatePill state={battery.state} />
            <span className="chip">{durationShort(inState)} in {STATE_LABEL[battery.state].toLowerCase()}</span>
            {health.restRemainingMin > 0 && <span className="chip" style={{ color: "var(--warn)" }}>rests {health.restRemainingMin}m</span>}
          </div>
          <h1 className="display text-5xl sm:text-6xl truncate">{battery.name}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {battery.brand_model || "Unknown model"} · {battery.capacity_ah} Ah
            {battery.purchase_date && <> · bought {fmtDate(battery.purchase_date)}</>}
          </p>
          {retired && battery.retired_reason && (
            <p className="text-sm mt-1" style={{ color: "var(--bad)" }}>Retired: {battery.retired_reason}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/batteries/${encodeURIComponent(battery.name)}/edit`} className="btn btn-ghost text-sm">Edit</Link>
          <button type="button" className={`btn text-sm ${retired ? "btn-primary" : "btn-ghost"}`} onClick={() => act("retire")}>
            {retired ? "Un-retire" : "Retire"}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {health.warnings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {health.warnings.map((w) => (
            <span key={w.text} className={`pill ${w.level === "fail" ? "pill-bad" : "pill-warn"}`} style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)", fontSize: 12 }}>
              {w.level === "fail" ? "✕" : "!"} {w.text}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        <button type="button" className="btn btn-primary py-3 text-sm" onClick={() => act("move")}>Move state</button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("usage")}>Log usage</button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("beak")}>Beak test</button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("cba")}>CBA test</button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("charge")}>Log charge</button>
        <button type="button" className="btn btn-danger py-3 text-sm" onClick={() => act("incident")}>Flag incident</button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("note")}>Add note</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
        <Stat label="Cycles" value={battery.cycle_count} sub={`warn at ${settings.max_cycles_warn}`} />
        <Stat label="Age" value={ageLabel(battery.purchase_date)} sub={battery.purchase_date ? fmtDate(battery.purchase_date) : "no purchase date"} />
        <Stat label="Last Beak V" value={health.latestBeak ? `${fmtNum(health.latestBeak.voltage, 2)} V` : "—"} sub={health.latestBeak ? timeAgo(health.latestBeak.at, now) : "never"} />
        <Stat label="Last Beak IR" value={health.latestBeak ? `${fmtNum(health.latestBeak.internal_resistance_mohm)} mΩ` : "—"} sub={`warn ${settings.ir_warn_mohm} · fail ${settings.ir_fail_mohm}`} />
        <Stat label="Last CBA" value={health.latestCba ? `${fmtNum(health.latestCba.measured_ah, 2)} Ah` : "—"} sub={health.latestCba ? `${Math.round(health.latestCba.pct)}% of rated · ${timeAgo(health.latestCba.at, now)}` : "never"} />
        <Stat label="Driver rating" value={health.avgDriverRating !== null ? `${health.avgDriverRating.toFixed(1)} / 5` : "—"} sub="last 5 usages" />
      </div>

      {/* Score breakdown */}
      {health.score !== null && (
        <div className="card p-4 mb-6">
          <p className="eyebrow mb-3" style={{ color: "var(--muted)" }}>Health breakdown</p>
          <div className="grid gap-2 sm:grid-cols-5">
            {health.components.map((c) => (
              <div key={c.key}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{c.label}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{c.score === null ? "n/a" : `${Math.round(c.score)} · ${c.weight}%`}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--line)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${c.score ?? 0}%`,
                      background: c.score === null ? "transparent" : c.score >= 75 ? "var(--good)" : c.score >= 50 ? "var(--warn)" : "var(--bad)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="mb-6">
        <BatteryCharts events={events} settings={settings} capacityAh={battery.capacity_ah} />
      </div>

      {battery.notes && (
        <div className="card p-4 mb-6">
          <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>Notes</p>
          <p className="text-sm whitespace-pre-wrap">{battery.notes}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <p className="eyebrow mr-2" style={{ color: "var(--muted)" }}>Timeline</p>
        <button type="button" className="tile py-1 px-2.5 text-xs" data-selected={filter === "all"} onClick={() => setFilter("all")}>All</button>
        {EVENT_TYPES.map((t) => (
          <button key={t} type="button" className="tile py-1 px-2.5 text-xs" data-selected={filter === t} onClick={() => setFilter(t)}>
            {EVENT_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="card px-4">
        <ul>
          {timeline.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
          {timeline.length === 0 && <li className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>No events.</li>}
        </ul>
      </div>

      <BatteryActionSheet battery={actions.battery} view={actions.view} onClose={actions.close} onView={actions.setView} />
    </>
  );
}
