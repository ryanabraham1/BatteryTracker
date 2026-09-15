"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { clearSessionCookie, currentCodeHash, hashCode, isAuthed, setSessionCookie } from "@/lib/auth";
import type {
  Battery,
  BatteryState,
  BatteryStatus,
  BeakTestData,
  CbaTestData,
  IncidentData,
  Settings,
  UsageData,
} from "@/lib/types";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function guard() {
  if (!(await isAuthed())) throw new Error("Not signed in");
}

function refresh() {
  revalidatePath("/", "layout");
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
    await insertEvent(b.id, "usage", data as unknown as Record<string, unknown>);
    // Coming off the robot → cooling
    if (b.state === "in_robot" && form.get("stay") !== "1") {
      const now = new Date().toISOString();
      await insertEvent(b.id, "state_change", { from: b.state, to: "cooling" }, now);
      await supabaseAdmin().from("batteries").update({ state: "cooling", state_changed_at: now }).eq("id", b.id);
    }
    refresh();
  });
}

export async function logBeak(batteryId: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const v = num(form.get("voltage"));
    const ir = num(form.get("internal_resistance_mohm"));
    if (v === undefined || ir === undefined) throw new Error("Voltage and IR are required");
    const data: BeakTestData = { voltage: v, internal_resistance_mohm: ir };
    const pct = num(form.get("charge_pct"));
    if (pct !== undefined) data.charge_pct = pct;
    await insertEvent(batteryId, "beak_test", data as unknown as Record<string, unknown>);
    refresh();
  });
}

export async function logCba(batteryId: string, form: FormData): Promise<Result> {
  return wrap(async () => {
    await guard();
    const ah = num(form.get("measured_ah"));
    if (ah === undefined) throw new Error("Measured Ah is required");
    const data: CbaTestData = { measured_ah: ah };
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
    if (form.get("flag") !== "0" && b.state !== "needs_attention") {
      const now = new Date().toISOString();
      await insertEvent(b.id, "state_change", { from: b.state, to: "needs_attention" }, now);
      await supabaseAdmin()
        .from("batteries")
        .update({ state: "needs_attention", state_changed_at: now })
        .eq("id", b.id);
    }
    refresh();
  });
}

/** One-tap brownout from competition mode. */
export async function brownout(batteryId: string, matchLabel?: string): Promise<Result> {
  const fd = new FormData();
  fd.set("kind", "brownout");
  fd.set("notes", "Brownout (one-tap)");
  if (matchLabel) fd.set("match_label", matchLabel);
  return logIncident(batteryId, fd);
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
      "ir_fail_mohm",
      "capacity_warn_pct",
      "capacity_fail_pct",
      "max_cycles_warn",
    ];
    const patch: Record<string, number> = {};
    for (const k of keys) {
      const v = num(form.get(k));
      if (v === undefined || v < 0) throw new Error(`Invalid value for ${k}`);
      patch[k] = v;
    }
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
