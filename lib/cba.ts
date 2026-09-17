import type { Battery, CbaTestData, Settings } from "./types";

/**
 * Numbers a CBA discharge implies but the tester doesn't print. Every field is
 * undefined when the test didn't record enough to compute it.
 */
export interface CbaDerived {
  /** Mean voltage under load = Wh / Ah. Sag shows up here before capacity does. */
  avg_v?: number;
  /** Mean discharge current = Ah / hours (CC tests use the setpoint directly). */
  avg_a?: number;
  /** Mean discharge power = Wh / hours (CP tests use the setpoint directly). */
  avg_w?: number;
  /** Capacity a healthy battery of this rating would give at `avg_a` (Peukert). */
  expected_ah?: number;
  /** measured_ah / expected_ah, as a percentage. */
  pct_of_expected?: number;
}

/** Rated Ah is quoted at the 20-hour rate (SLA convention), so I₂₀ = C / 20. */
const RATING_HOURS = 20;

/**
 * Peukert's law: at a discharge current I, an SLA delivers
 *   C_eff = C_rated · (I₂₀ / I)^(k − 1)
 * with k ≈ 1.1–1.3 for lead-acid and ≈ 1.0–1.05 for lithium. Below the rating
 * current we clamp to rated — the formula would predict *more* than nameplate.
 */
export function peukertCapacity(ratedAh: number, currentA: number, k: number): number {
  if (ratedAh <= 0 || currentA <= 0) return ratedAh;
  const i20 = ratedAh / RATING_HOURS;
  if (currentA <= i20) return ratedAh;
  return ratedAh * Math.pow(i20 / currentA, k - 1);
}

export function cbaDerived(d: CbaTestData, battery: Pick<Battery, "capacity_ah">, s: Settings): CbaDerived {
  const out: CbaDerived = {};
  const hours = typeof d.duration_min === "number" && d.duration_min > 0 ? d.duration_min / 60 : undefined;
  if (typeof d.measured_wh === "number" && d.measured_ah > 0) out.avg_v = d.measured_wh / d.measured_ah;

  if (d.mode === "cc" && typeof d.test_current_a === "number") out.avg_a = d.test_current_a;
  else if (hours) out.avg_a = d.measured_ah / hours;
  // Legacy Ah-only rows recorded a test current without a mode.
  else if (typeof d.test_current_a === "number") out.avg_a = d.test_current_a;

  if (d.mode === "cp" && typeof d.test_power_w === "number") out.avg_w = d.test_power_w;
  else if (hours && typeof d.measured_wh === "number") out.avg_w = d.measured_wh / hours;
  else if (out.avg_a !== undefined && out.avg_v !== undefined) out.avg_w = out.avg_a * out.avg_v;

  // CP test with no time: back out the current from power and mean voltage.
  if (out.avg_a === undefined && out.avg_w !== undefined && out.avg_v !== undefined) out.avg_a = out.avg_w / out.avg_v;

  if (out.avg_a !== undefined && battery.capacity_ah > 0) {
    out.expected_ah = peukertCapacity(battery.capacity_ah, out.avg_a, s.peukert_k);
    out.pct_of_expected = (d.measured_ah / out.expected_ah) * 100;
  }
  return out;
}

/** Capacity used for state-of-health comparisons: Wh when recorded, else Ah. */
export function cbaCapacityMetric(d: CbaTestData): { value: number; unit: "Wh" | "Ah" } {
  return typeof d.measured_wh === "number" ? { value: d.measured_wh, unit: "Wh" } : { value: d.measured_ah, unit: "Ah" };
}
