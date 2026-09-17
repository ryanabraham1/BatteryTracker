import Link from "next/link";
import { fmtDateTime, fmtNum } from "@/lib/format";
import {
  CBA_MODE_LABEL,
  CBA_MODE_SETPOINT,
  EVENT_LABEL,
  STATE_LABEL,
  STATUS_LABEL,
  type BatteryEvent,
  type BatteryState,
  type BatteryStatus,
  type BeakTestData,
  type CbaTestData,
  type ChargeData,
  type IncidentData,
  type LoadTestData,
  type NoteData,
  type StateChangeData,
  type StatusChangeData,
  type UsageData,
} from "@/lib/types";

const TONE: Record<BatteryEvent["type"], string> = {
  state_change: "pill-purple",
  charge: "pill-warn",
  usage: "pill-info",
  beak_test: "pill-good",
  cba_test: "pill-good",
  incident: "pill-bad",
  note: "pill-muted",
  status_change: "pill-muted",
  load_test: "pill-good",
};

const PHASE_LABEL = { pre_match: "pre-match", post_match: "post-match" } as const;

/** 10.92 → "10:55". */
function fmtMinSec(min: number): string {
  const total = Math.round(min * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function describeEvent(e: BatteryEvent): string {
  const d = e.data;
  switch (e.type) {
    case "state_change": {
      const x = d as unknown as StateChangeData;
      return `${STATE_LABEL[x.from as BatteryState] ?? x.from} → ${STATE_LABEL[x.to as BatteryState] ?? x.to}`;
    }
    case "charge": {
      const x = d as unknown as ChargeData;
      const parts = [x.charger ? `on ${x.charger}` : null];
      if (x.ended_at) {
        const min = Math.round((new Date(x.ended_at).getTime() - new Date(x.started_at).getTime()) / 60_000);
        parts.push(`${min} min`);
      } else parts.push("in progress");
      if (typeof x.resting_voltage_after === "number") parts.push(`rest ${fmtNum(x.resting_voltage_after, 2)} V`);
      return parts.filter(Boolean).join(" · ");
    }
    case "usage": {
      const x = d as unknown as UsageData;
      const parts = [x.context + (x.match_label ? ` ${x.match_label}` : "")];
      if (typeof x.driver_rating === "number") parts.push(`rating ${x.driver_rating}/5`);
      const vb = x.voltage_before, va = x.voltage_after;
      if (typeof vb === "number" && typeof va === "number")
        parts.push(`${fmtNum(vb, 2)} → ${fmtNum(va, 2)} V (${va - vb >= 0 ? "+" : "−"}${fmtNum(Math.abs(va - vb), 2)})`);
      else if (typeof vb === "number") parts.push(`${fmtNum(vb, 2)} V before`);
      else if (typeof va === "number") parts.push(`${fmtNum(va, 2)} V after`);
      const ib = x.ir_before_mohm, ia = x.ir_after_mohm;
      if (typeof ib === "number" && typeof ia === "number") parts.push(`IR ${fmtNum(ib)} → ${fmtNum(ia)} mΩ`);
      const pb = x.charge_pct_before, pa = x.charge_pct_after;
      if (typeof pb === "number" && typeof pa === "number") parts.push(`${pb}% → ${pa}%`);
      if (typeof x.duration_min === "number") parts.push(`${x.duration_min} min`);
      if (x.notes) parts.push(x.notes);
      return parts.join(" · ");
    }
    case "beak_test": {
      const x = d as unknown as BeakTestData;
      const parts = [`${fmtNum(x.voltage, 2)} V`, `${fmtNum(x.internal_resistance_mohm)} mΩ`];
      if (typeof x.charge_pct === "number") parts.push(`${x.charge_pct}%`);
      if (typeof x.v2 === "number") parts.push(`${fmtNum(x.v2, 2)} V @ 18 A`);
      if (x.beak_status) parts.push(`Beak: ${x.beak_status}`);
      if (x.phase) parts.push(PHASE_LABEL[x.phase] + (x.match_label ? ` ${x.match_label}` : ""));
      return parts.join(" · ");
    }
    case "cba_test": {
      const x = d as unknown as CbaTestData;
      const parts = [`${fmtNum(x.measured_ah, 2)} Ah`];
      if (typeof x.measured_wh === "number") parts.push(`${fmtNum(x.measured_wh)} Wh`);
      const mode = x.mode ?? (typeof x.test_current_a === "number" ? "cc" : undefined);
      if (mode) {
        const sp = CBA_MODE_SETPOINT[mode];
        const v = x[sp.key];
        parts.push(typeof v === "number" ? `${CBA_MODE_LABEL[mode]} @ ${fmtNum(v, mode === "cr" ? 2 : 1)} ${sp.unit}` : CBA_MODE_LABEL[mode]);
      }
      if (typeof x.cutoff_v === "number") parts.push(`to ${fmtNum(x.cutoff_v, 1)} V`);
      if (typeof x.duration_min === "number") parts.push(fmtMinSec(x.duration_min));
      if (typeof x.ir_mohm === "number") parts.push(`IR ${fmtNum(x.ir_mohm)} mΩ`);
      if (typeof x.temp_internal_c === "number" || typeof x.temp_external_c === "number")
        parts.push(`${[x.temp_internal_c, x.temp_external_c].filter((t) => typeof t === "number").map((t) => `${fmtNum(t as number)}°`).join(" / ")}C`);
      if (x.notes) parts.push(x.notes);
      return parts.join(" · ");
    }
    case "incident": {
      const x = d as unknown as IncidentData;
      return [x.kind, x.match_label, x.notes].filter(Boolean).join(" · ");
    }
    case "note":
      return (d as unknown as NoteData).text;
    case "load_test": {
      const x = d as unknown as LoadTestData;
      const parts = [x.held_10s ? "held 10 s" : "dropped again — FAIL", `${fmtNum(x.loaded_voltage, 2)} V under 100 A`];
      if (typeof x.open_voltage === "number") parts.push(`${fmtNum(x.open_voltage, 2)} V open`);
      if (x.notes) parts.push(x.notes);
      return parts.join(" · ");
    }
    case "status_change": {
      const x = d as unknown as StatusChangeData;
      return `${STATUS_LABEL[x.from as BatteryStatus] ?? x.from} → ${STATUS_LABEL[x.to as BatteryStatus] ?? x.to}${x.reason ? ` · ${x.reason}` : ""}`;
    }
  }
}

export function EventRow({ event, batteryName }: { event: BatteryEvent; batteryName?: string }) {
  return (
    <li className="py-3 sm:py-2.5 sm:flex sm:gap-3" style={{ borderBottom: "1px solid var(--line)" }}>
      {/* Mobile: type + time on one row, description below. Desktop: three columns. */}
      <div className="flex items-center justify-between gap-3 sm:contents">
        <span className={`pill ${TONE[event.type]} shrink-0 sm:self-start sm:mt-0.5`}>{EVENT_LABEL[event.type]}</span>
        <time
          className="mono text-[11px] shrink-0 sm:order-last sm:self-start sm:mt-1"
          style={{ color: "var(--muted)" }}
          dateTime={event.occurred_at}
        >
          {fmtDateTime(event.occurred_at)}
        </time>
      </div>
      <div className="min-w-0 flex-1 mt-1.5 sm:mt-0">
        <p className="text-sm break-words">
          {batteryName && (
            <Link href={`/batteries/${encodeURIComponent(batteryName)}`} className="font-semibold mr-1.5 hover:underline">
              {batteryName}
            </Link>
          )}
          <span className={event.type === "beak_test" || event.type === "cba_test" || event.type === "load_test" ? "mono" : ""}>{describeEvent(event)}</span>
        </p>
      </div>
    </li>
  );
}
