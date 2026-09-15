export type BatteryStatus = "active" | "practice_only" | "retired";
export type BatteryState = "ready" | "in_robot" | "cooling" | "charging" | "needs_attention";
export type EventType =
  | "state_change"
  | "charge"
  | "usage"
  | "beak_test"
  | "cba_test"
  | "incident"
  | "note"
  | "status_change";

export const STATES: BatteryState[] = ["ready", "in_robot", "cooling", "charging", "needs_attention"];
export const STATE_LABEL: Record<BatteryState, string> = {
  ready: "Ready",
  in_robot: "In Robot",
  cooling: "Cooling",
  charging: "Charging",
  needs_attention: "Needs Attention",
};
export const STATE_TONE: Record<BatteryState, "good" | "info" | "warn" | "bad"> = {
  ready: "good",
  in_robot: "info",
  cooling: "warn",
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
  duration_min?: number;
  driver_rating?: number;
}
export interface BeakTestData { voltage: number; internal_resistance_mohm: number; charge_pct?: number }
export interface CbaTestData { measured_ah: number; test_current_a?: number; notes?: string }
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
  | StatusChangeData;

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
  capacity_warn_pct: number;
  capacity_fail_pct: number;
  max_cycles_warn: number;
  team_code_hash: string | null;
  updated_at: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  min_rest_after_charge_min: 30,
  max_charge_duration_min: 240,
  ir_warn_mohm: 15,
  ir_fail_mohm: 20,
  capacity_warn_pct: 80,
  capacity_fail_pct: 70,
  max_cycles_warn: 200,
  team_code_hash: null,
  updated_at: new Date(0).toISOString(),
};
