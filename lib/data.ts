import "server-only";
import { supabaseAdmin } from "./supabase";
import { DEFAULT_SETTINGS, type Battery, type BatteryEvent, type Settings } from "./types";
import { computeHealth, groupEvents, type BatteryWithHealth } from "./health";

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabaseAdmin().from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  // Spread over defaults so a column added in a later migration has a value
  // even before that migration has been applied.
  return { ...DEFAULT_SETTINGS, ...((data as Partial<Settings>) ?? {}) };
}

export async function getBatteries(): Promise<Battery[]> {
  const { data, error } = await supabaseAdmin().from("batteries").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Battery[];
}

export async function getBatteryByName(name: string): Promise<Battery | null> {
  const { data, error } = await supabaseAdmin()
    .from("batteries")
    .select("*")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return (data as Battery) ?? null;
}

export async function getEventsForBattery(batteryId: string): Promise<BatteryEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("battery_events")
    .select("*")
    .eq("battery_id", batteryId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BatteryEvent[];
}

/** Newest N events across all batteries (enough history for health scoring). */
export async function getRecentEvents(limit = 5000): Promise<BatteryEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("battery_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BatteryEvent[];
}

export interface AllEventsFilter {
  type?: string;
  batteryId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function getAllEvents(f: AllEventsFilter = {}): Promise<BatteryEvent[]> {
  let q = supabaseAdmin()
    .from("battery_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(f.limit ?? 500);
  if (f.type) q = q.eq("type", f.type);
  if (f.batteryId) q = q.eq("battery_id", f.batteryId);
  if (f.from) q = q.gte("occurred_at", new Date(f.from).toISOString());
  if (f.to) {
    const end = new Date(f.to);
    end.setDate(end.getDate() + 1);
    q = q.lt("occurred_at", end.toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BatteryEvent[];
}

export interface BoardData {
  settings: Settings;
  items: BatteryWithHealth[];
}

/** Everything the board / batteries list needs, with health computed. */
export async function getBoardData(): Promise<BoardData> {
  const [settings, batteries, events] = await Promise.all([
    getSettings(),
    getBatteries(),
    getRecentEvents(),
  ]);
  const byBattery = groupEvents(events);
  const now = new Date();
  const items = batteries.map((battery) => ({
    battery,
    health: computeHealth(battery, byBattery.get(battery.id) ?? [], settings, now),
  }));
  return { settings, items };
}
