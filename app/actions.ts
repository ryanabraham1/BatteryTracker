"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { clearSessionCookie, currentCodeHash, hashCode, isAuthed, setSessionCookie } from "@/lib/auth";
import { irTierFor, statusForTier } from "@/lib/health";
import {
  DEFAULT_SETTINGS,
  type Battery,
  type BatteryState,
  type BatteryStatus,
  type BeakTestData,
  type CbaTestData,
  type IncidentData,
  type IrTier,
  type LoadTestData,
  type Settings,
  type UsageData,
} from "@/lib/types";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function guard() {
  if (!(await isAuthed())) throw new Error("Not signed in");
}

function refresh() {
  revalidatePath("/", "layout");
}

async function loadSettings(): Promise<Settings> {
  const { data } = await supabaseAdmin().from("settings").select("*").eq("id", 1).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data as Partial<Settings>) ?? {}) };
}

/** Write a state_change event and update the battery row in one go. */
async function setState(b: Battery, to: BatteryState, now = new Date().toISOString()) {
  if (b.state === to) return;
  await insertEvent(b.id, "state_change", { from: b.state, to }, now);
  const { error } = await supabaseAdmin().from("batteries").update({ state: to, state_changed_at: now }).eq("id", b.id);
  if (error) throw error;
}

/** Off the robot → straight onto the charger: state change + open charge event. */
async function startCharging(b: Battery, now = new Date().toISOString()) {
  if (b.state === "charging") return;
  await setState(b, "charging", now);
  await insertEvent(b.id, "charge", { started_at: now }, now);
}

async function loadBattery(id: string): Promise<Battery> {
  const { data, error } = await supabaseAdmin().from("batteries").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Battery not found");
  return data as Battery;
}

async function insertEvent(batteryId: string, type: string, data: Record<string, unknown>, occurredAt?: string) {
  const { error } = await supabaseAdmin().from("battery_events").insert({
    battery_id: batteryId,
    type,
    data,
    occurred_at: occurredAt ?? new Date().toISOString(),
  });
  if (error) throw error;
}

function num(v: FormDataEntryValue | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function str(v: FormDataEntryValue | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  return fn()
    .then((data) => ({ ok: true as const, data }))
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * Move a battery between live states. Side effects:
 *  - always writes a `state_change` event
 *  - entering `charging` opens a `charge` event
 *  - leaving `charging` closes the open charge event; if the destination is
 *    `ready` the cycle count increments and an optional resting voltage is recorded
 */
export async function moveState(
  batteryId: string,
  to: BatteryState,
  opts: { restingVoltage?: number; charger?: string } = {},
): Promise<Result> {
  return wrap(async () => {
    await guard();
    const b = await loadBattery(batteryId);
    if (b.state === to) return;
    const db = supabaseAdmin();
    const now = new Date().toISOString();
    const patch: Partial<Battery> = { state: to, state_changed_at: now };

    if (b.state === "charging") {
      // close the most recent open charge event
      const { data: open } = await db
        .from("battery_events")
        .select("id, data")
        .eq("battery_id", b.id)
        .eq("type", "charge")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open && !(open.data as { ended_at?: string }).ended_at) {
        const data = { ...(open.data as object), ended_at: now } as Record<string, unknown>;
        if (to === "ready" && typeof opts.restingVoltage === "number")
          data.resting_voltage_after = opts.restingVoltage;
        await db.from("battery_events").update({ data }).eq("id", open.id);
      }
      if (to === "ready") patch.cycle_count = b.cycle_count + 1;
    }

    await insertEvent(b.id, "state_change", { from: b.state, to }, now);
    if (to === "charging") {
      await insertEvent(b.id, "charge", { started_at: now, ...(opts.charger ? { charger: opts.charger } : {}) }, now);
    }
    const { error } = await db.from("batteries").update(patch).eq("id", b.id);
    if (error) throw error;
    refresh();
  });
}

/** FormData flavour of moveState so it can sit in the offline outbox. */
export async function moveStateForm(batteryId: string, form: FormData): Promise<Result> {
  const to = str(form.get("to")) as BatteryState | undefined;
  if (!to) return { ok: false, error: "Missing state" };
  return moveState(batteryId, to, { restingVoltage: num(form.get("resting_voltage")), charger: str(form.get("charger")) });
}

/** FormData flavour of setStatus for the offline outbox. */
export async function setStatusForm(batteryId: string, form: FormData): Promise<Result> {
  const to = str(form.get("to")) as BatteryStatus | undefined;
  if (!to) return { ok: false, error: "Missing status" };
  return setStatus(batteryId, to, str(form.get("reason")));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export async function logUsage(batteryId: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const b = await loadBattery(batteryId);
    const rating = num(form.get("driver_rating"));
    if (!rating || rating < 1 || rating > 5) throw new Error("Driver rating (1–5) is required");
    const data: UsageData = {
      context: (str(form.get("context")) as UsageData["context"]) ?? "practice",
      driver_rating: rating,
    };
    const ml = str(form.get("match_label"));
    if (ml) data.match_label = ml;
    const vb = num(form.get("voltage_before"));
    if (vb !== undefined) data.voltage_before = vb;
    const va = num(form.get("voltage_after"));
    if (va !== undefined) data.voltage_after = va;
    const dm = num(form.get("duration_min"));
    if (dm !== undefined) data.duration_min = dm;
    for (const k of ["charge_pct_before", "charge_pct_after", "ir_before_mohm", "ir_after_mohm"] as const) {
      const v = num(form.get(k));
      if (v !== undefined) data[k] = v;
    }
    await insertEvent(b.id, "usage", data as unknown as Record<string, unknown>);
    // Coming off the robot → charging
    if (b.state === "in_robot" && form.get("stay") !== "1") await startCharging(b);
    refresh();
  });
}

export interface BeakResult {
  tier: IrTier;
  /** Status the reading implies, when it's a step down from the current one. */
  suggestedStatus: BatteryStatus | null;
}

function beakFromForm(form: FormData): BeakTestData {
  const v = num(form.get("voltage"));
  const ir = num(form.get("internal_resistance_mohm"));
  if (v === undefined || ir === undefined) throw new Error("Voltage and IR are required");
  const data: BeakTestData = { voltage: v, internal_resistance_mohm: ir };
  const pct = num(form.get("charge_pct"));
  if (pct !== undefined) data.charge_pct = pct;
  return data;
}

async function beakResult(b: Battery, data: BeakTestData): Promise<BeakResult> {
  const settings = await loadSettings();
  const tier = irTierFor(data.internal_resistance_mohm, settings);
  const implied = statusForTier(tier);
  const RANK: Record<BatteryStatus, number> = { active: 0, practice_only: 1, retired: 2 };
  return { tier, suggestedStatus: RANK[implied] > RANK[b.status] ? implied : null };
}

/**
 * Pre-match check: Beak reading tagged with the match, then (by default) the
 * battery goes into the robot. One sheet instead of Beak → Move.
 */
export async function logPreMatch(batteryId: string, form: FormData): Promise<Result<BeakResult>> {
  return wrap(async () => {
    await guard();
    const b = await loadBattery(batteryId);
    const data = beakFromForm(form);
    data.phase = "pre_match";
    const ml = str(form.get("match_label"));
    if (ml) data.match_label = ml;
    // Same timestamp for the reading and the state change so the post-match
    // lookup (readings since the battery went in) always finds this one.
    const now = new Date().toISOString();
    await insertEvent(b.id, "beak_test", data as unknown as Record<string, unknown>, now);
    if (form.get("move") !== "0") await setState(b, "in_robot", now);
    refresh();
    return beakResult(b, data);
  });
}

/**
 * Post-match check: Beak reading + driver rating in one sheet. Writes the
 * post-match `beak_test`, then a `usage` event whose "before" numbers come from
 * the most recent pre-match Beak (since the battery went into the robot), and
 * moves the battery to Charging.
 */
export async function logPostMatch(batteryId: string, form: FormData): Promise<Result<BeakResult>> {
  return wrap(async () => {
    await guard();
    const b = await loadBattery(batteryId);
    const rating = num(form.get("driver_rating"));
    if (!rating || rating < 1 || rating > 5) throw new Error("Driver rating (1–5) is required");
    const beak = beakFromForm(form);
    beak.phase = "post_match";
    const ml = str(form.get("match_label"));
    if (ml) beak.match_label = ml;

    // Latest pre-match reading since this battery went into the robot.
    const { data: pre } = await supabaseAdmin()
      .from("battery_events")
      .select("data, occurred_at")
      .eq("battery_id", b.id)
      .eq("type", "beak_test")
      .eq("data->>phase", "pre_match")
      // A minute of slack: the pre-match reading may have been logged just before the move.
      .gte("occurred_at", b.state === "in_robot" ? new Date(Date.parse(b.state_changed_at) - 60_000).toISOString() : new Date(0).toISOString())
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const preData = pre ? (pre.data as unknown as BeakTestData) : null;

    const now = new Date().toISOString();
    await insertEvent(b.id, "beak_test", beak as unknown as Record<string, unknown>, now);
    const usage: UsageData = {
      context: (str(form.get("context")) as UsageData["context"]) ?? "match",
      driver_rating: rating,
      voltage_after: beak.voltage,
      ir_after_mohm: beak.internal_resistance_mohm,
    };
    if (ml) usage.match_label = ml;
    if (beak.charge_pct !== undefined) usage.charge_pct_after = beak.charge_pct;
    if (preData) {
      usage.voltage_before = preData.voltage;
      usage.ir_before_mohm = preData.internal_resistance_mohm;
      if (preData.charge_pct !== undefined) usage.charge_pct_before = preData.charge_pct;
      if (pre?.occurred_at) usage.duration_min = Math.max(1, Math.round((Date.parse(now) - Date.parse(pre.occurred_at)) / 60_000));
    }
    await insertEvent(b.id, "usage", usage as unknown as Record<string, unknown>, now);
    if (b.state === "in_robot" || b.state === "ready") await startCharging(b, now);
    refresh();
    return beakResult(b, beak);
  });
}

/** 100 A load tester: loaded voltage + whether it held for 10 s. */
export async function logLoadTest(batteryId: string, form: FormData): Promise<Result<{ pass: boolean }>> {
  return wrap(async () => {
    await guard();
    const lv = num(form.get("loaded_voltage"));
    if (lv === undefined) throw new Error("Loaded voltage is required");
    const held = form.get("held_10s") === "1";
    const data: LoadTestData = { loaded_voltage: lv, held_10s: held };
    const ov = num(form.get("open_voltage"));
    if (ov !== undefined) data.open_voltage = ov;
    const n = str(form.get("notes"));
    if (n) data.notes = n;
    await insertEvent(batteryId, "load_test", data as unknown as Record<string, unknown>);
    const settings = await loadSettings();
    refresh();
    return { pass: held && lv >= settings.load_test_min_v };
  });
}

export async function logBeak(batteryId: string, form: FormData): Promise<Result<BeakResult>> {
  return wrap(async () => {
    await guard();
    const b = await loadBattery(batteryId);
    const data = beakFromForm(form);
    await insertEvent(b.id, "beak_test", data as unknown as Record<string, unknown>);
    refresh();
    return beakResult(b, data);
  });
}

export async function logCba(batteryId: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const ah = num(form.get("measured_ah"));
    if (ah === undefined) throw new Error("Measured Ah is required");
    const data: CbaTestData = { measured_ah: ah };
    const wh = num(form.get("measured_wh"));
    if (wh !== undefined) data.measured_wh = wh;
    const a = num(form.get("test_current_a"));
    if (a !== undefined) data.test_current_a = a;
    const n = str(form.get("notes"));
    if (n) data.notes = n;
    await insertEvent(batteryId, "cba_test", data as unknown as Record<string, unknown>);
    refresh();
  });
}

export async function logIncident(batteryId: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const b = await loadBattery(batteryId);
    const data: IncidentData = {
      kind: (str(form.get("kind")) as IncidentData["kind"]) ?? "other",
      notes: str(form.get("notes")) ?? "",
    };
    const ml = str(form.get("match_label"));
    if (ml) data.match_label = ml;
    await insertEvent(b.id, "incident", data as unknown as Record<string, unknown>);
    if (form.get("flag") !== "0") await setState(b, "needs_attention");
    refresh();
  });
}

export async function addNote(batteryId: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const text = str(form.get("text"));
    if (!text) throw new Error("Note is empty");
    await insertEvent(batteryId, "note", { text });
    refresh();
  });
}

/** Manual charge log (e.g. charged on a charger not tracked via state). */
export async function logCharge(batteryId: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const started = str(form.get("started_at"));
    const ended = str(form.get("ended_at"));
    if (!started) throw new Error("Start time is required");
    const data: Record<string, unknown> = { started_at: new Date(started).toISOString() };
    if (ended) data.ended_at = new Date(ended).toISOString();
    const c = str(form.get("charger"));
    if (c) data.charger = c;
    const rv = num(form.get("resting_voltage_after"));
    if (rv !== undefined) data.resting_voltage_after = rv;
    await insertEvent(batteryId, "charge", data, data.started_at as string);
    if (ended && form.get("count_cycle") === "1") {
      const b = await loadBattery(batteryId);
      await supabaseAdmin().from("batteries").update({ cycle_count: b.cycle_count + 1 }).eq("id", b.id);
    }
    refresh();
  });
}

// ---------------------------------------------------------------------------
// Batteries CRUD
// ---------------------------------------------------------------------------

export async function createBattery(form: FormData): Promise<Result<{ name: string }>> {
  return wrap(async () => {
    await guard();
    const name = str(form.get("name"));
    if (!name) throw new Error("Name is required");
    const row = {
      name,
      brand_model: str(form.get("brand_model")) ?? "",
      capacity_ah: num(form.get("capacity_ah")) ?? 18,
      purchase_date: str(form.get("purchase_date")) ?? null,
      notes: str(form.get("notes")) ?? "",
      status: (str(form.get("status")) as BatteryStatus) ?? "active",
      state: (str(form.get("state")) as BatteryState) ?? "ready",
      cycle_count: num(form.get("cycle_count")) ?? 0,
    };
    const { data, error } = await supabaseAdmin().from("batteries").insert(row).select("id, name").single();
    if (error) {
      if (error.code === "23505") throw new Error(`A battery named "${name}" already exists`);
      throw error;
    }
    await insertEvent(data.id, "note", { text: "Battery added" });
    refresh();
    return { name: data.name as string };
  });
}

export async function updateBattery(batteryId: string, form: FormData): Promise<Result<{ name: string }>> {
  return wrap(async () => {
    await guard();
    const name = str(form.get("name"));
    if (!name) throw new Error("Name is required");
    const patch = {
      name,
      brand_model: str(form.get("brand_model")) ?? "",
      capacity_ah: num(form.get("capacity_ah")) ?? 18,
      purchase_date: str(form.get("purchase_date")) ?? null,
      notes: str(form.get("notes")) ?? "",
      cycle_count: num(form.get("cycle_count")) ?? 0,
    };
    const { error } = await supabaseAdmin().from("batteries").update(patch).eq("id", batteryId);
    if (error) {
      if (error.code === "23505") throw new Error(`A battery named "${name}" already exists`);
      throw error;
    }
    refresh();
    return { name };
  });
}

export async function setStatus(batteryId: string, to: BatteryStatus, reason?: string): Promise<Result> {
  return wrap(async () => {
    await guard();
    const b = await loadBattery(batteryId);
    if (b.status === to) return;
    const data: Record<string, unknown> = { from: b.status, to };
    if (reason) data.reason = reason;
    await insertEvent(b.id, "status_change", data);
    const { error } = await supabaseAdmin()
      .from("batteries")
      .update({ status: to, retired_reason: to === "retired" ? reason ?? null : null })
      .eq("id", b.id);
    if (error) throw error;
    refresh();
  });
}

export async function deleteBattery(batteryId: string): Promise<Result> {
  return wrap(async () => {
    await guard();
    const { error } = await supabaseAdmin().from("batteries").delete().eq("id", batteryId);
    if (error) throw error;
    refresh();
  });
}

// ---------------------------------------------------------------------------
// Settings / auth
// ---------------------------------------------------------------------------

export async function updateSettings(form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const keys: (keyof Settings)[] = [
      "min_rest_after_charge_min",
      "max_charge_duration_min",
      "ir_warn_mohm",
      "ir_practice_mohm",
      "ir_suspect_mohm",
      "ir_fail_mohm",
      "load_test_min_v",
      "capacity_warn_pct",
      "capacity_fail_pct",
      "cba_a_wh",
      "cba_b_wh",
      "max_cycles_warn",
    ];
    const patch: Record<string, number> = {};
    for (const k of keys) {
      const v = num(form.get(k));
      if (v === undefined || v < 0) throw new Error(`Invalid value for ${k}`);
      patch[k] = v;
    }
    if (!(patch.ir_warn_mohm <= patch.ir_practice_mohm && patch.ir_practice_mohm <= patch.ir_suspect_mohm && patch.ir_suspect_mohm <= patch.ir_fail_mohm))
      throw new Error("IR tiers must be in order: comp-ready ≤ practice ≤ suspect ≤ retire");
    if (patch.cba_b_wh > patch.cba_a_wh) throw new Error("CBA B-tier cutoff must be ≤ A-tier cutoff");
    const { error } = await supabaseAdmin().from("settings").update(patch).eq("id", 1);
    if (error) throw error;
    refresh();
  });
}

export async function changeTeamCode(form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const current = str(form.get("current_code"));
    const next = str(form.get("new_code"));
    const confirm = str(form.get("confirm_code"));
    if (!current || !next) throw new Error("All fields are required");
    if (next.length < 4) throw new Error("New code must be at least 4 characters");
    if (next !== confirm) throw new Error("New codes don't match");
    if (hashCode(current) !== (await currentCodeHash())) throw new Error("Current code is wrong");
    const newHash = hashCode(next);
    const { error } = await supabaseAdmin().from("settings").update({ team_code_hash: newHash }).eq("id", 1);
    if (error) throw error;
    // keep this device signed in with the new code; everyone else is logged out
    await setSessionCookie(newHash);
    refresh();
  });
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}
