import { isAuthed } from "@/lib/auth";
import { getAllEvents, getBatteries } from "@/lib/data";
import { toCsv } from "@/lib/format";
import { describeEvent } from "@/components/event-row";

/**
 * Full-history export: one row per event per battery, with every reading in its
 * own column (no averaging). Batteries with no events still get a single row so
 * nothing on the roster is missing. Optional `?battery=<id>` narrows to one.
 */
const BATTERY_COLUMNS = [
  "battery",
  "brand_model",
  "capacity_ah",
  "purchase_date",
  "manufacture_date",
  "status",
  "retired_reason",
  "current_state",
  "cycle_count",
  "battery_notes",
] as const;

const EVENT_COLUMNS = [
  "occurred_at",
  "event_type",
  "summary",
  // state_change / status_change
  "from",
  "to",
  "reason",
  // usage / beak / incident
  "context",
  "match_label",
  "phase",
  // voltages
  "voltage",
  "voltage_before",
  "voltage_after",
  "open_voltage",
  "loaded_voltage",
  "resting_voltage_after",
  // Beak under-load readings + verdict (from screen scans)
  "v1",
  "v2",
  "beak_status",
  // internal resistance
  "internal_resistance_mohm",
  "ir_before_mohm",
  "ir_after_mohm",
  // charge %
  "charge_pct",
  "charge_pct_before",
  "charge_pct_after",
  // CBA
  "measured_ah",
  "measured_wh",
  "test_current_a",
  // load test
  "held_10s",
  // charge
  "charger",
  "started_at",
  "ended_at",
  // usage
  "duration_min",
  "driver_rating",
  // incident / note
  "kind",
  "text",
  "notes",
] as const;

export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const batteryId = sp.get("battery") || undefined;
  const [allBatteries, events] = await Promise.all([
    getBatteries(),
    getAllEvents({ batteryId, limit: 100_000 }),
  ]);
  const batteries = batteryId ? allBatteries.filter((b) => b.id === batteryId) : allBatteries;

  const byBattery = new Map<string, typeof events>();
  for (const e of events) {
    const list = byBattery.get(e.battery_id) ?? [];
    list.push(e);
    byBattery.set(e.battery_id, list);
  }

  const rows: Record<string, unknown>[] = [];
  for (const b of batteries) {
    const base: Record<string, unknown> = {
      battery: b.name,
      brand_model: b.brand_model,
      capacity_ah: b.capacity_ah,
      purchase_date: b.purchase_date,
      manufacture_date: b.manufacture_date,
      status: b.status,
      retired_reason: b.retired_reason,
      current_state: b.state,
      cycle_count: b.cycle_count,
      battery_notes: b.notes,
    };
    // getAllEvents returns newest first; export oldest → newest so charts line up.
    const list = (byBattery.get(b.id) ?? []).slice().sort((a, c) => a.occurred_at.localeCompare(c.occurred_at));
    if (list.length === 0) {
      rows.push(base);
      continue;
    }
    for (const e of list) {
      const row: Record<string, unknown> = { ...base, occurred_at: e.occurred_at, event_type: e.type, summary: describeEvent(e) };
      for (const c of EVENT_COLUMNS) {
        if (c in e.data) row[c] = e.data[c];
      }
      rows.push(row);
    }
  }

  const csv = toCsv(rows, [...BATTERY_COLUMNS, ...EVENT_COLUMNS]);
  const suffix = batteryId ? `-${batteries[0]?.name ?? batteryId}` : "";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="battery-full-history${suffix}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
