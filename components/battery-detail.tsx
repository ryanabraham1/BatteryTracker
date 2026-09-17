"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HealthSummary } from "@/lib/health";
import { ageLabel, durationShort, fmtDate, fmtNum, minutesSince, timeAgo } from "@/lib/format";
import {
  CBA_TIER_LABEL,
  CBA_TIER_TONE,
  EVENT_LABEL,
  EVENT_TYPES,
  IR_TIER_LABEL,
  IR_TIER_TONE,
  STATE_LABEL,
  STATUS_LABEL,
  type Battery,
  type BatteryEvent,
  type EventType,
  type Settings,
} from "@/lib/types";
import { BatteryActionSheet, useBatteryActions, type ActionView } from "./battery-actions";
import { BatteryCharts } from "./charts";
import { EventRow } from "./event-row";
import { HealthRing, StatePill, StatusPill } from "./ui";
import { useNow } from "./board";

/** What the last CBA discharge implies, beyond the raw numbers the tester printed. */
function CbaAnalysis({ health, ratedAh, peukertK }: { health: HealthSummary; ratedAh: number; peukertK: number }) {
  const c = health.latestCba;
  if (!c) return null;
  const d = c.derived;
  const tone = (pct: number) => (pct >= 90 ? "var(--good)" : pct >= 80 ? "var(--warn)" : "var(--bad)");
  const cells: { label: string; value: React.ReactNode; sub: string }[] = [];
  if (d.expected_ah !== undefined && d.avg_a !== undefined && d.pct_of_expected !== undefined)
    cells.push({
      label: c.rateCorrected ? "vs expected @ rate" : "vs expected @ rate (info)",
      value: <span style={{ color: tone(d.pct_of_expected) }}>{Math.round(d.pct_of_expected)}%</span>,
      sub: `${fmtNum(d.expected_ah, 1)} Ah expected from ${ratedAh} Ah at ${fmtNum(d.avg_a, 1)} A (k=${peukertK})`,
    });
  if (d.avg_v !== undefined)
    cells.push({
      label: "Mean V under load",
      value: `${fmtNum(d.avg_v, 2)} V`,
      sub: d.avg_w !== undefined ? `≈ ${fmtNum(d.avg_w)} W · ${fmtNum(d.avg_a ?? 0, 1)} A average` : "Wh ÷ Ah",
    });
  if (health.cbaSoh)
    cells.push({
      label: "State of health",
      value: <span style={{ color: tone(health.cbaSoh.pct) }}>{Math.round(health.cbaSoh.pct)}%</span>,
      sub: `of first CBA test (${health.cbaSoh.unit}, ${fmtDate(health.cbaSoh.firstAt)})`,
    });
  if (health.cbaIrRise)
    cells.push({
      label: "CBA IR drift",
      value: (
        <span style={{ color: health.cbaIrRise.pct >= 100 ? "var(--bad)" : health.cbaIrRise.pct >= 30 ? "var(--warn)" : "var(--good)" }}>
          {health.cbaIrRise.pct >= 0 ? "+" : ""}
          {Math.round(health.cbaIrRise.pct)}%
        </span>
      ),
      sub: `${fmtNum(health.cbaIrRise.latest)} mΩ now · best ${fmtNum(health.cbaIrRise.best)} mΩ`,
    });
  else if (typeof c.ir_mohm === "number")
    cells.push({ label: "CBA IR", value: `${fmtNum(c.ir_mohm)} mΩ`, sub: "drift shows after a second test" });
  if (typeof c.temp_external_c === "number")
    cells.push({
      label: "Battery temp",
      value: `${fmtNum(c.temp_external_c)} °C`,
      sub: typeof c.temp_internal_c === "number" ? `tester ${fmtNum(c.temp_internal_c)} °C` : "external probe",
    });
  if (!cells.length) return null;
  return (
    <div className="card p-4 mb-6">
      <p className="eyebrow mb-3" style={{ color: "var(--muted)" }}>
        CBA analysis
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {cells.map((x) => (
          <Stat key={x.label} label={x.label} value={x.value} sub={x.sub} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-3 min-w-0">
      <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="mono text-lg font-semibold leading-tight truncate">{value}</p>
      {sub && (
        <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
          {sub}
        </p>
      )}
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
  const timeline = useMemo(() => (filter === "all" ? events : events.filter((e) => e.type === filter)), [events, filter]);
  const inState = minutesSince(battery.state_changed_at, now);

  const act = (v: ActionView) => actions.open(battery, v);
  const retired = battery.status === "retired";

  return (
    <>
      {/* Header */}
      <Link
        href="/batteries"
        className="md:hidden inline-flex items-center gap-1 text-sm mb-3 min-h-[36px]"
        style={{ color: "var(--muted)" }}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Batteries
      </Link>
      <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-5">
        <HealthRing score={health.score} badge={health.badge} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
            {battery.status !== "active" && <StatusPill status={battery.status} />}
            <StatePill state={battery.state} />
            <span className="chip">
              {durationShort(inState)} in {STATE_LABEL[battery.state].toLowerCase()}
            </span>
            {health.restRemainingMin > 0 && (
              <span className="chip" style={{ color: "var(--warn)" }}>
                rests {health.restRemainingMin}m
              </span>
            )}
          </div>
          <h1 className="display text-4xl sm:text-6xl break-words">{battery.name}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {battery.brand_model || "Unknown model"} · {battery.capacity_ah} Ah
            {battery.manufacture_date && <> · made {fmtDate(battery.manufacture_date)}</>}
            {battery.purchase_date && <> · bought {fmtDate(battery.purchase_date)}</>}
          </p>
          {retired && battery.retired_reason && (
            <p className="text-sm mt-1" style={{ color: "var(--bad)" }}>
              Retired: {battery.retired_reason}
            </p>
          )}
        </div>
        <div className="hidden sm:flex gap-2 shrink-0">
          <a href={`/api/export/full?battery=${battery.id}`} className="btn btn-ghost text-sm">
            Export CSV
          </a>
          <Link href={`/batteries/${encodeURIComponent(battery.name)}/edit`} className="btn btn-ghost text-sm">
            Edit
          </Link>
          <button type="button" className={`btn text-sm ${retired ? "btn-primary" : "btn-ghost"}`} onClick={() => act("retire")}>
            {retired ? "Un-retire" : "Retire"}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {health.warnings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {health.warnings.map((w) => (
            <span
              key={w.text}
              className={`pill ${w.level === "fail" ? "pill-bad" : "pill-warn"}`}
              style={{
                textTransform: "none",
                letterSpacing: 0,
                fontFamily: "var(--font-sans)",
                fontSize: 12,
              }}
            >
              {w.level === "fail" ? "✕" : "!"} {w.text}
            </span>
          ))}
        </div>
      )}

      {/* IR tier says this battery should be demoted — one tap to do it */}
      {health.suggestedStatus && health.irTier && (
        <div
          className="rounded-[10px] p-3.5 mb-5 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{
            background: `var(--${IR_TIER_TONE[health.irTier]}-soft)`,
            border: `1px solid var(--${IR_TIER_TONE[health.irTier]})`,
          }}
        >
          <p className="text-sm flex-1">
            Last Beak IR is in the <b>{IR_TIER_LABEL[health.irTier].toLowerCase()}</b> band — suggest marking{" "}
            <b>{STATUS_LABEL[health.suggestedStatus].toLowerCase()}</b>.
          </p>
          <button
            type="button"
            className={`btn text-sm shrink-0 ${health.suggestedStatus === "retired" ? "btn-danger" : "btn-primary"}`}
            onClick={() => act("retire")}
          >
            {health.suggestedStatus === "retired" ? "Retire" : "Mark practice-only"} <span aria-hidden>→</span>
          </button>
        </div>
      )}

      {/* Actions — pre/post-match first, then the rest */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 mb-3 sm:mb-6">
        {battery.state === "in_robot" ? (
          <button type="button" className="btn btn-primary py-3.5 sm:py-3 text-sm col-span-2 sm:col-span-1" onClick={() => act("post")}>
            Post-match check
          </button>
        ) : (
          <button type="button" className="btn btn-primary py-3.5 sm:py-3 text-sm col-span-2 sm:col-span-1" onClick={() => act("pre")}>
            Pre-match check
          </button>
        )}
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("move")}>
          Move state
        </button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("usage")}>
          Log usage
        </button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("beak")}>
          Beak test
        </button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("load")}>
          Load test
        </button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("cba")}>
          CBA test
        </button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("charge")}>
          Log charge
        </button>
        <button type="button" className="btn btn-danger py-3 text-sm" onClick={() => act("incident")}>
          Flag incident
        </button>
        <button type="button" className="btn btn-ghost py-3 text-sm" onClick={() => act("note")}>
          Add note
        </button>
      </div>
      <div className="sm:hidden grid grid-cols-2 gap-2 mb-6">
        <Link href={`/batteries/${encodeURIComponent(battery.name)}/edit`} className="btn btn-ghost text-sm">
          Edit
        </Link>
        <button type="button" className={`btn text-sm ${retired ? "btn-primary" : "btn-ghost"}`} onClick={() => act("retire")}>
          {retired ? "Un-retire" : "Retire"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 mb-6">
        <Stat label="Cycles" value={battery.cycle_count} sub={`warn at ${settings.max_cycles_warn}`} />
        <Stat
          label="Age"
          value={ageLabel(battery.purchase_date)}
          sub={battery.purchase_date ? fmtDate(battery.purchase_date) : "no purchase date"}
        />
        <Stat
          label="Last Beak V"
          value={health.latestBeak ? `${fmtNum(health.latestBeak.voltage, 2)} V` : "—"}
          sub={health.latestBeak ? timeAgo(health.latestBeak.at, now) : "never"}
        />
        <Stat
          label="Last Beak IR"
          value={health.latestBeak ? `${fmtNum(health.latestBeak.internal_resistance_mohm)} mΩ` : "—"}
          sub={health.irTier ? IR_TIER_LABEL[health.irTier] : `comp < ${settings.ir_warn_mohm} · retire ≥ ${settings.ir_fail_mohm}`}
        />
        <Stat
          label="Load test"
          value={
            health.latestLoad ? (
              <span
                style={{
                  color: health.latestLoad.pass ? "var(--good)" : "var(--bad)",
                }}
              >
                {health.latestLoad.pass ? "PASS" : "FAIL"}
              </span>
            ) : (
              "—"
            )
          }
          sub={
            health.latestLoad ? `${fmtNum(health.latestLoad.loaded_voltage, 2)} V @100 A · ${timeAgo(health.latestLoad.at, now)}` : "never"
          }
        />
        <Stat
          label="Last CBA"
          value={
            health.latestCba ? (
              <span style={{ color: `var(--${CBA_TIER_TONE[health.latestCba.tier]})` }}>
                {typeof health.latestCba.measured_wh === "number"
                  ? `${fmtNum(health.latestCba.measured_wh)} Wh`
                  : `${fmtNum(health.latestCba.measured_ah, 2)} Ah`}
              </span>
            ) : (
              "—"
            )
          }
          sub={
            health.latestCba
              ? `${CBA_TIER_LABEL[health.latestCba.tier]} · ${fmtNum(health.latestCba.measured_ah, 2)} Ah · ${Math.round(health.latestCba.pct)}% of ${health.latestCba.rateCorrected ? "expected" : "rated"} · ${timeAgo(health.latestCba.at, now)}`
              : "never"
          }
        />
        <Stat
          label="Driver rating"
          value={health.avgDriverRating !== null ? `${health.avgDriverRating.toFixed(1)} / 5` : "—"}
          sub="last 5 usages"
        />
      </div>

      {/* Score breakdown */}
      {health.score !== null && (
        <div className="card p-4 mb-6">
          <p className="eyebrow mb-3" style={{ color: "var(--muted)" }}>
            Health breakdown
          </p>
          <div className="grid gap-2 sm:grid-cols-5">
            {health.components.map((c) => (
              <div key={c.key}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{c.label}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>
                    {c.score === null ? "n/a" : `${Math.round(c.score)} · ${c.weight}%`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--line)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${c.score ?? 0}%`,
                      background:
                        c.score === null ? "transparent" : c.score >= 75 ? "var(--good)" : c.score >= 50 ? "var(--warn)" : "var(--bad)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CBA-derived models: rate-corrected capacity, load voltage, fade, IR drift */}
      {health.latestCba && <CbaAnalysis health={health} ratedAh={battery.capacity_ah} peukertK={settings.peukert_k} />}

      {/* Charts */}
      <div className="mb-6">
        <BatteryCharts events={events} settings={settings} capacityAh={battery.capacity_ah} />
      </div>

      {battery.notes && (
        <div className="card p-4 mb-6">
          <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>
            Notes
          </p>
          <p className="text-sm whitespace-pre-wrap">{battery.notes}</p>
        </div>
      )}

      {/* Timeline */}
      <p className="eyebrow mb-2" style={{ color: "var(--muted)" }}>
        Timeline
      </p>
      <div className="hscroll no-scrollbar md:flex-wrap md:mx-0 md:px-0 mb-2">
        <button type="button" className="tile tile-chip text-sm" data-selected={filter === "all"} onClick={() => setFilter("all")}>
          All
        </button>
        {EVENT_TYPES.map((t) => (
          <button key={t} type="button" className="tile tile-chip text-sm" data-selected={filter === t} onClick={() => setFilter(t)}>
            {EVENT_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="card px-4">
        <ul>
          {timeline.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
          {timeline.length === 0 && (
            <li className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              No events.
            </li>
          )}
        </ul>
      </div>

      <BatteryActionSheet
        battery={actions.battery}
        view={actions.view}
        onClose={actions.close}
        onView={actions.setView}
        settings={settings}
      />
    </>
  );
}
