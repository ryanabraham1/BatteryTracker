export type BatteryStatus = "active" | "practice_only" | "retired";
export type BatteryState = "ready" | "in_robot" | "charging" | "needs_attention";
export type EventType =
  | "state_change"
  | "charge"
  | "usage"
  | "beak_test"
  | "cba_test"
  | "incident"
  | "note"
  | "status_change"
  | "load_test";

export const STATES: BatteryState[] = ["ready", "in_robot", "charging", "needs_attention"];
export const STATE_LABEL: Record<BatteryState, string> = {
  ready: "Ready",
  in_robot: "In Robot",
  charging: "Charging",
  needs_attention: "Needs Attention",
};
export const STATE_TONE: Record<BatteryState, "good" | "info" | "warn" | "bad"> = {
  ready: "good",
  in_robot: "info",
  charging: "warn",
  needs_attention: "bad",
};

export const STATUS_LABEL: Record<BatteryStatus, string> = {
  active: "Active",
  practice_only: "Practice only",
  retired: "Retired",
};

export const EVENT_TYPES: EventType[] = [
  "state_change",
  "charge",
  "usage",
  "beak_test",
  "cba_test",
  "incident",
  "note",
  "status_change",
  "load_test",
];
export const EVENT_LABEL: Record<EventType, string> = {
  state_change: "State",
  charge: "Charge",
  usage: "Usage",
  beak_test: "Beak",
  cba_test: "CBA",
  incident: "Incident",
  note: "Note",
  status_change: "Status",
  load_test: "Load",
};

export interface Battery {
  id: string;
  name: string;
  brand_model: string;
  capacity_ah: number;
  purchase_date: string | null;
  status: BatteryStatus;
  retired_reason: string | null;
  notes: string;
  state: BatteryState;
  state_changed_at: string;
  cycle_count: number;
  created_at: string;
  updated_at: string;
}

export type UsageContext = "match" | "practice" | "other";
export type IncidentKind = "brownout" | "died" | "connector" | "swollen" | "other";

export interface StateChangeData { from: BatteryState; to: BatteryState }
export interface ChargeData {
  charger?: string;
  started_at: string;
  ended_at?: string;
  resting_voltage_after?: number;
}
export interface UsageData {
  context: UsageContext;
  match_label?: string;
  voltage_before?: number;
  voltage_after?: number;
  // Pre/post-match Beak readings (Team 180 style) — per-match ΔV / ΔIR
  charge_pct_before?: number;
  charge_pct_after?: number;
  ir_before_mohm?: number;
  ir_after_mohm?: number;
  duration_min?: number;
  driver_rating?: number;
  notes?: string;
}
/** `phase` says when the Beak was read; plain pit checks leave it unset. */
export type BeakPhase = "pre_match" | "post_match";
export type BeakStatus = "Good" | "Fair" | "Bad" | "Charge Battery";
export const BEAK_STATUSES: BeakStatus[] = ["Good", "Fair", "Bad", "Charge Battery"];
export interface BeakTestData {
  /** Open-circuit voltage (the Beak's V0). */
  voltage: number;
  internal_resistance_mohm: number;
  charge_pct?: number;
  /** Voltage under the Beak's 1 A / 18 A loads (V1 / V2), when scanned from the screen. */
  v1?: number;
  v2?: number;
  /** The Beak's own verdict, when scanned from the screen. */
  beak_status?: BeakStatus;
  phase?: BeakPhase;
  match_label?: string;
}
/** 100 A load tester: hold 10 s, pass if the loaded voltage holds without a second drop. */
export interface LoadTestData {
  loaded_voltage: number;
  held_10s: boolean;
  open_voltage?: number;
  notes?: string;
}
/** `measured_wh` is what the CBA actually reports; Ah is what the health thresholds use. */
export interface CbaTestData { measured_ah: number; measured_wh?: number; test_current_a?: number; notes?: string }
export interface IncidentData { kind: IncidentKind; match_label?: string; notes: string }
export interface NoteData { text: string }
export interface StatusChangeData { from: BatteryStatus; to: BatteryStatus; reason?: string }

export type EventData =
  | StateChangeData
  | ChargeData
  | UsageData
  | BeakTestData
  | CbaTestData
  | IncidentData
  | NoteData
  | StatusChangeData
  | LoadTestData;

export interface BatteryEvent {
  id: string;
  battery_id: string;
  type: EventType;
  occurred_at: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Settings {
  id: 1;
  min_rest_after_charge_min: number;
  max_charge_duration_min: number;
  ir_warn_mohm: number;
  ir_fail_mohm: number;
  ir_practice_mohm: number;
  ir_suspect_mohm: number;
  load_test_min_v: number;
  capacity_warn_pct: number;
  capacity_fail_pct: number;
  /** CBA Wh tiers: A ≥ cba_a_wh, B ≥ cba_b_wh, C below. Used when a test recorded Wh. */
  cba_a_wh: number;
  cba_b_wh: number;
  max_cycles_warn: number;
  team_code_hash: string | null;
  updated_at: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  min_rest_after_charge_min: 30,
  max_charge_duration_min: 240,
  ir_warn_mohm: 15,
  ir_fail_mohm: 25,
  ir_practice_mohm: 18,
  ir_suspect_mohm: 23,
  load_test_min_v: 10,
  capacity_warn_pct: 80,
  capacity_fail_pct: 70,
  cba_a_wh: 130,
  cba_b_wh: 120,
  max_cycles_warn: 200,
  team_code_hash: null,
  updated_at: new Date(0).toISOString(),
};

/** IR classification bands, best → worst. */
export type IrTier = "comp" | "reserve" | "practice" | "suspect" | "retire";
export const IR_TIERS: IrTier[] = ["comp", "reserve", "practice", "suspect", "retire"];
export const IR_TIER_LABEL: Record<IrTier, string> = {
  comp: "Comp-ready",
  reserve: "Reserve",
  practice: "Practice only",
  suspect: "Suspect",
  retire: "Retire",
};
export const IR_TIER_TONE: Record<IrTier, "good" | "info" | "warn" | "bad"> = {
  comp: "good",
  reserve: "info",
  practice: "warn",
  suspect: "warn",
  retire: "bad",
};

/** CBA capacity tier. Wh-based when the test recorded Wh, else % of rated Ah. */
export type CbaTier = "a" | "b" | "c";
export const CBA_TIER_LABEL: Record<CbaTier, string> = { a: "A-tier", b: "B-tier", c: "C-tier" };
export const CBA_TIER_TONE: Record<CbaTier, "good" | "warn" | "bad"> = { a: "good", b: "warn", c: "bad" };
