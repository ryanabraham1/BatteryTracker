import Link from "next/link";
import { fmtDateTime, fmtNum } from "@/lib/format";
import {
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
};

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
      if (typeof x.voltage_before === "number") parts.push(`${fmtNum(x.voltage_before, 2)} V before`);
      if (typeof x.voltage_after === "number") parts.push(`${fmtNum(x.voltage_after, 2)} V after`);
      if (typeof x.duration_min === "number") parts.push(`${x.duration_min} min`);
      return parts.join(" · ");
    }
    case "beak_test": {
      const x = d as unknown as BeakTestData;
      const parts = [`${fmtNum(x.voltage, 2)} V`, `${fmtNum(x.internal_resistance_mohm)} mΩ`];
      if (typeof x.charge_pct === "number") parts.push(`${x.charge_pct}%`);
      return parts.join(" · ");
    }
    case "cba_test": {
      const x = d as unknown as CbaTestData;
      const parts = [`${fmtNum(x.measured_ah, 2)} Ah`];
      if (typeof x.test_current_a === "number") parts.push(`@ ${fmtNum(x.test_current_a)} A`);
      if (x.notes) parts.push(x.notes);
      return parts.join(" · ");
    }
    case "incident": {
      const x = d as unknown as IncidentData;
      return [x.kind, x.match_label, x.notes].filter(Boolean).join(" · ");
    }
    case "note":
      return (d as unknown as NoteData).text;
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
          <span className={event.type === "beak_test" || event.type === "cba_test" ? "mono" : ""}>{describeEvent(event)}</span>
        </p>
      </div>
    </li>
  );
}
