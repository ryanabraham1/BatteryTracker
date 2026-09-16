import {
  IR_TIER_LABEL,
  type Battery,
  type BatteryEvent,
  type BatteryStatus,
  type BeakTestData,
  type CbaTestData,
  type CbaTier,
  type ChargeData,
  type IncidentData,
  type IrTier,
  type LoadTestData,
  type Settings,
  type UsageData,
} from "./types";

export type HealthBadge = "good" | "watch" | "bad";

export interface Warning {
  level: "warn" | "fail";
  text: string;
}

export interface HealthSummary {
  score: number | null; // null when there is no data at all
  badge: HealthBadge | null;
  warnings: Warning[];
  latestBeak: (BeakTestData & { at: string }) | null;
  latestCba: (CbaTestData & { at: string; pct: number; tier: CbaTier }) | null;
  latestLoad: (LoadTestData & { at: string; pass: boolean }) | null;
  /** IR band of the latest Beak reading (null when never tested). */
  irTier: IrTier | null;
  /** Status the IR tier says this battery should have, when it differs from the current one. */
  suggestedStatus: BatteryStatus | null;
  lastVoltage: { v: number; at: string; source: "beak" | "usage" | "charge" } | null;
  avgDriverRating: number | null;
  recentIncidents30d: number;
  restedAt: string | null; // when the battery became rested (state_changed_at + min rest) if ready
  restRemainingMin: number; // >0 means still resting
  chargingTooLong: boolean;
  components: { key: string; label: string; weight: number; score: number | null }[];
}

const DAY = 86_400_000;

/** Classify an IR reading into the tier bands from Settings. */
export function irTierFor(ir: number, s: Settings): IrTier {
  if (ir >= s.ir_fail_mohm) return "retire";
  if (ir >= s.ir_suspect_mohm) return "suspect";
  if (ir >= s.ir_practice_mohm) return "practice";
  if (ir >= s.ir_warn_mohm) return "reserve";
  return "comp";
}

/** CBA tier: Wh cutoffs when the test recorded Wh, otherwise % of rated Ah. */
export function cbaTierFor(d: CbaTestData, pct: number, s: Settings): CbaTier {
  if (typeof d.measured_wh === "number") {
    return d.measured_wh >= s.cba_a_wh ? "a" : d.measured_wh >= s.cba_b_wh ? "b" : "c";
  }
  return pct >= s.capacity_warn_pct ? "a" : pct >= s.capacity_fail_pct ? "b" : "c";
}

/** What status a tier implies; comp/reserve → active, practice/suspect → practice-only, retire → retired. */
export function statusForTier(tier: IrTier): BatteryStatus {
  return tier === "retire" ? "retired" : tier === "practice" || tier === "suspect" ? "practice_only" : "active";
}

/** Sort key: lower is better. Untested sits between reserve and practice. */
export function irTierRank(tier: IrTier | null): number {
  switch (tier) {
    case "comp": return 0;
    case "reserve": return 1;
    case null: return 1.5;
    case "practice": return 2;
    case "suspect": return 3;
    case "retire": return 4;
  }
}

/** A load test passes when the voltage held for the full 10 s and stayed above the floor. */
export function loadTestPass(d: LoadTestData, s: Settings): boolean {
  return d.held_10s && d.loaded_voltage >= s.load_test_min_v;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function lerp(x: number, x0: number, y0: number, x1: number, y1: number) {
  if (x1 === x0) return y1;
  const t = (x - x0) / (x1 - x0);
  return y0 + (y1 - y0) * clamp(t, 0, 1);
}

/** Events must be sorted newest-first. */
export function computeHealth(
  battery: Battery,
  events: BatteryEvent[],
  settings: Settings,
  now: Date = new Date(),
): HealthSummary {
  const nowMs = now.getTime();
  const sorted = [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const beak = sorted.find((e) => e.type === "beak_test");
  const cba = sorted.find((e) => e.type === "cba_test");
  const load = sorted.find((e) => e.type === "load_test");
  const usages = sorted.filter((e) => e.type === "usage");
  const incidents = sorted.filter((e) => e.type === "incident");

  const latestBeak = beak
    ? { ...(beak.data as unknown as BeakTestData), at: beak.occurred_at }
    : null;
  const latestCba = cba
    ? (() => {
        const d = cba.data as unknown as CbaTestData;
        const pct = battery.capacity_ah > 0 ? (d.measured_ah / battery.capacity_ah) * 100 : 0;
        return { ...d, at: cba.occurred_at, pct, tier: cbaTierFor(d, pct, settings) };
      })()
    : null;

  const latestLoad = load
    ? (() => {
        const d = load.data as unknown as LoadTestData;
        return { ...d, at: load.occurred_at, pass: loadTestPass(d, settings) };
      })()
    : null;
  const irTier = latestBeak ? irTierFor(latestBeak.internal_resistance_mohm, settings) : null;
  // Only ever suggest moving *down* (active → practice-only → retired); a good
  // reading on a retired battery is a human decision, not an auto-suggestion.
  const RANK: Record<BatteryStatus, number> = { active: 0, practice_only: 1, retired: 2 };
  const implied = irTier ? statusForTier(irTier) : null;
  const suggestedStatus = implied && RANK[implied] > RANK[battery.status] ? implied : null;

  // Last known voltage: whichever of beak / usage-after / charge-resting is newest
  let lastVoltage: HealthSummary["lastVoltage"] = null;
  for (const e of sorted) {
    if (e.type === "beak_test") {
      const d = e.data as unknown as BeakTestData;
      if (typeof d.voltage === "number") {
        lastVoltage = { v: d.voltage, at: e.occurred_at, source: "beak" };
        break;
      }
    } else if (e.type === "usage") {
      const d = e.data as unknown as UsageData;
      if (typeof d.voltage_after === "number") {
        lastVoltage = { v: d.voltage_after, at: e.occurred_at, source: "usage" };
        break;
      }
    } else if (e.type === "charge") {
      const d = e.data as unknown as ChargeData;
      if (typeof d.resting_voltage_after === "number") {
        lastVoltage = { v: d.resting_voltage_after, at: e.occurred_at, source: "charge" };
        break;
      }
    }
  }

  const recentRatings = usages
    .map((e) => (e.data as unknown as UsageData).driver_rating)
    .filter((r): r is number => typeof r === "number")
    .slice(0, 5);
  const avgDriverRating = recentRatings.length
    ? recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length
    : null;

  const recentIncidents30d = incidents.filter(
    (e) => nowMs - new Date(e.occurred_at).getTime() <= 30 * DAY,
  ).length;
  const incidents7d = incidents.filter(
    (e) => nowMs - new Date(e.occurred_at).getTime() <= 7 * DAY,
  );

  // ---- Score components -------------------------------------------------
  const components: HealthSummary["components"] = [
    {
      key: "capacity",
      label: "CBA capacity",
      weight: 40,
      score: latestCba
        ? typeof latestCba.measured_wh === "number"
          // A-tier cutoff scores 100; one tier-width below the B cutoff scores 0
          ? lerp(latestCba.measured_wh, 2 * settings.cba_b_wh - settings.cba_a_wh, 0, settings.cba_a_wh, 100)
          : lerp(latestCba.pct, settings.capacity_fail_pct, 0, 100, 100)
        : null,
    },
    {
      key: "ir",
      label: "Beak IR",
      weight: 30,
      score: latestBeak
        ? lerp(latestBeak.internal_resistance_mohm, 10, 100, settings.ir_fail_mohm, 0)
        : null,
    },
    {
      key: "ratings",
      label: "Driver ratings",
      weight: 15,
      score: avgDriverRating !== null ? clamp(avgDriverRating * 20) : null,
    },
    {
      key: "incidents",
      label: "Incidents (30d)",
      weight: 10,
      score: clamp(100 - recentIncidents30d * 35),
    },
    {
      key: "cycles",
      label: "Cycle count",
      weight: 5,
      score: lerp(battery.cycle_count, 0, 100, settings.max_cycles_warn, 0),
    },
  ];

  // Only count "incidents" and "cycles" if there is at least one real
  // measurement; otherwise a brand-new battery would score 100 from nothing.
  const hasMeasurement = latestBeak || latestCba || avgDriverRating !== null;
  let score: number | null = null;
  if (hasMeasurement) {
    let wsum = 0;
    let acc = 0;
    for (const c of components) {
      if (c.score === null) continue;
      wsum += c.weight;
      acc += c.weight * c.score;
    }
    score = wsum > 0 ? Math.round(acc / wsum) : null;
  }
  // A failed 100 A load test means a bad cell — cap the score into "Bad"
  // regardless of how the other inputs look.
  if (latestLoad && !latestLoad.pass) score = Math.min(score ?? 40, 40);
  const badge: HealthBadge | null =
    score === null ? null : score >= 75 ? "good" : score >= 50 ? "watch" : "bad";

  // ---- Explicit warnings ----------------------------------------------
  const warnings: Warning[] = [];
  if (latestBeak && irTier) {
    const ir = latestBeak.internal_resistance_mohm;
    if (irTier === "retire")
      warnings.push({ level: "fail", text: `IR ${fmt(ir)} mΩ — ${IR_TIER_LABEL.retire} band (≥ ${settings.ir_fail_mohm})` });
    else if (irTier === "suspect")
      warnings.push({ level: "warn", text: `IR ${fmt(ir)} mΩ — ${IR_TIER_LABEL.suspect} (≥ ${settings.ir_suspect_mohm})` });
    else if (irTier === "practice")
      warnings.push({ level: "warn", text: `IR ${fmt(ir)} mΩ — ${IR_TIER_LABEL.practice} band (≥ ${settings.ir_practice_mohm})` });
    else if (irTier === "reserve")
      warnings.push({ level: "warn", text: `IR ${fmt(ir)} mΩ — ${IR_TIER_LABEL.reserve} (≥ ${settings.ir_warn_mohm})` });
  }
  if (latestLoad && !latestLoad.pass) {
    const why = !latestLoad.held_10s ? "voltage dropped again within 10 s (bad cell?)" : `held at ${fmt(latestLoad.loaded_voltage)} V < ${settings.load_test_min_v} V floor`;
    warnings.push({ level: "fail", text: `Failed 100 A load test — ${why}` });
  }
  if (latestCba && typeof latestCba.measured_wh === "number") {
    const wh = fmt(latestCba.measured_wh);
    if (latestCba.tier === "c")
      warnings.push({ level: "fail", text: `CBA ${wh} Wh — C-tier (< ${settings.cba_b_wh} Wh) — refresh cycle or retire` });
    else if (latestCba.tier === "b")
      warnings.push({ level: "warn", text: `CBA ${wh} Wh — B-tier (< ${settings.cba_a_wh} Wh)` });
  } else if (latestCba) {
    if (latestCba.pct < settings.capacity_fail_pct)
      warnings.push({
        level: "fail",
        text: `Capacity ${Math.round(latestCba.pct)}% < fail (${settings.capacity_fail_pct}%) — consider retiring`,
      });
    else if (latestCba.pct < settings.capacity_warn_pct)
      warnings.push({
        level: "warn",
        text: `Capacity ${Math.round(latestCba.pct)}% < warn (${settings.capacity_warn_pct}%)`,
      });
  }
  const consecutiveLow = (() => {
    let n = 0;
    for (const r of usages.map((e) => (e.data as unknown as UsageData).driver_rating)) {
      if (typeof r !== "number") continue;
      if (r <= 2) n++;
      else break;
    }
    return n;
  })();
  if (consecutiveLow >= 3)
    warnings.push({ level: "warn", text: `${consecutiveLow} consecutive driver ratings ≤ 2` });
  if (incidents7d.length) {
    const kinds = incidents7d.map((e) => (e.data as unknown as IncidentData).kind).join(", ");
    warnings.push({ level: "warn", text: `Incident in last 7 days (${kinds})` });
  }
  if (battery.status !== "retired") {
    if (!latestBeak || nowMs - new Date(latestBeak.at).getTime() > 30 * DAY)
      warnings.push({ level: "warn", text: latestBeak ? "No Beak test in 30+ days" : "Never Beak tested" });
    if (!latestCba || nowMs - new Date(latestCba.at).getTime() > 90 * DAY)
      warnings.push({ level: "warn", text: latestCba ? "No CBA test in 90+ days" : "Never CBA tested" });
  }

  const stateMin = (nowMs - new Date(battery.state_changed_at).getTime()) / 60_000;
  const chargingTooLong =
    battery.state === "charging" && stateMin > settings.max_charge_duration_min;
  if (chargingTooLong)
    warnings.push({ level: "warn", text: `Charging for ${Math.round(stateMin)}m (> ${settings.max_charge_duration_min}m)` });

  // Rest window: applies to ready batteries that came from charging.
  let restRemainingMin = 0;
  let restedAt: string | null = null;
  if (battery.state === "ready") {
    const lastState = sorted.find((e) => e.type === "state_change");
    const cameFromCharging = lastState && (lastState.data as { from?: string }).from === "charging";
    const restEnd = new Date(battery.state_changed_at).getTime() + settings.min_rest_after_charge_min * 60_000;
    restedAt = new Date(cameFromCharging ? restEnd : new Date(battery.state_changed_at).getTime()).toISOString();
    if (cameFromCharging) restRemainingMin = Math.max(0, Math.round((restEnd - nowMs) / 60_000));
  }

  return {
    score,
    badge,
    warnings,
    latestBeak,
    latestCba,
    latestLoad,
    irTier,
    suggestedStatus,
    lastVoltage,
    avgDriverRating,
    recentIncidents30d,
    restedAt,
    restRemainingMin,
    chargingTooLong,
    components,
  };
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export interface BatteryWithHealth {
  battery: Battery;
  health: HealthSummary;
}

/** Ready order: rested before resting; then IR tier; then health desc; then longest in state. */
export function sortReady(list: BatteryWithHealth[]): BatteryWithHealth[] {
  return [...list].sort((a, b) => {
    const ar = a.health.restRemainingMin > 0 ? 1 : 0;
    const br = b.health.restRemainingMin > 0 ? 1 : 0;
    if (ar !== br) return ar - br;
    const at = irTierRank(a.health.irTier);
    const bt = irTierRank(b.health.irTier);
    if (at !== bt) return at - bt;
    const as = a.health.score ?? -1;
    const bs = b.health.score ?? -1;
    if (as !== bs) return bs - as;
    return a.battery.state_changed_at.localeCompare(b.battery.state_changed_at);
  });
}

/** Group all events by battery id (newest first within each). */
export function groupEvents(events: BatteryEvent[]): Map<string, BatteryEvent[]> {
  const m = new Map<string, BatteryEvent[]>();
  for (const e of events) {
    const arr = m.get(e.battery_id);
    if (arr) arr.push(e);
    else m.set(e.battery_id, [e]);
  }
  for (const arr of m.values()) arr.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return m;
}
