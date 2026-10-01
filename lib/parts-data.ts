import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";
import {
  DEFAULT_PARTS_SETTINGS,
  PERSON_COOKIE,
  type FabDesign,
  type FabMachine,
  type FabPart,
  type FabPartEvent,
  type FabPartFile,
  type PartsSettings,
} from "./parts";

const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const FILES_BUCKET = "fab-files";

/** Who this device says it is (for "assign me"); set on the Parts board. */
export async function getPerson(): Promise<string> {
  const v = (await cookies()).get(PERSON_COOKIE)?.value;
  return v ? decodeURIComponent(v).slice(0, 40) : "";
}

export function toPart(r: Record<string, unknown>): FabPart {
  return {
    ...(r as unknown as FabPart),
    size_l_mm: N(r.size_l_mm),
    size_w_mm: N(r.size_w_mm),
    size_t_mm: N(r.size_t_mm),
    unit_price: N(r.unit_price),
    assignees: (r.assignees as string[]) ?? [],
    properties: (r.properties as Record<string, string>) ?? {},
  };
}

export function toMachine(r: Record<string, unknown>): FabMachine {
  return {
    ...(r as unknown as FabMachine),
    bed_w_mm: N(r.bed_w_mm),
    bed_l_mm: N(r.bed_l_mm),
    max_thickness_mm: N(r.max_thickness_mm),
    tool_diameter_mm: N(r.tool_diameter_mm),
    min_hole_mm: N(r.min_hole_mm),
    min_web_mm: N(r.min_web_mm),
    max_length_mm: N(r.max_length_mm),
    max_diameter_mm: N(r.max_diameter_mm),
    thickness_limits: (r.thickness_limits as string) ?? "",
  };
}

export async function getPartsSettings(): Promise<PartsSettings> {
  const { data, error } = await supabaseAdmin().from("fab_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_PARTS_SETTINGS;
  return {
    onshape_process_prop: data.onshape_process_prop ?? DEFAULT_PARTS_SETTINGS.onshape_process_prop,
    onshape_require_prop: data.onshape_require_prop ?? DEFAULT_PARTS_SETTINGS.onshape_require_prop,
    nest_gap_mm: N(data.nest_gap_mm) ?? DEFAULT_PARTS_SETTINGS.nest_gap_mm,
    nest_margin_mm: N(data.nest_margin_mm) ?? DEFAULT_PARTS_SETTINGS.nest_margin_mm,
  };
}

export async function getDesigns(opts: { includeArchived?: boolean } = {}): Promise<FabDesign[]> {
  let q = supabaseAdmin().from("fab_designs").select("*").order("created_at");
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FabDesign[];
}

export async function getParts(opts: { designId?: string; includeMissing?: boolean } = {}): Promise<FabPart[]> {
  let q = supabaseAdmin().from("fab_parts").select("*").order("name");
  if (opts.designId) q = q.eq("design_id", opts.designId);
  if (!opts.includeMissing) q = q.eq("missing", false);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  return (data ?? []).map(toPart);
}

export async function getPart(id: string): Promise<FabPart | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabaseAdmin().from("fab_parts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toPart(data) : null;
}

export async function getPartFiles(partId?: string): Promise<FabPartFile[]> {
  let q = supabaseAdmin().from("fab_part_files").select("*").order("created_at", { ascending: false });
  if (partId) q = q.eq("part_id", partId);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return (data ?? []) as FabPartFile[];
}

export async function getPartEvents(partId: string, limit = 50): Promise<FabPartEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("fab_part_events")
    .select("*")
    .eq("part_id", partId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FabPartEvent[];
}

export async function getMachines(): Promise<FabMachine[]> {
  const { data, error } = await supabaseAdmin().from("fab_machines").select("*").order("sort").order("name");
  if (error) throw error;
  return (data ?? []).map(toMachine);
}

/** Everyone who's been assigned anything, for the name picker. */
export function knownPeople(parts: FabPart[]): string[] {
  const s = new Set<string>();
  for (const p of parts) for (const a of p.assignees) s.add(a);
  return [...s].sort((a, b) => a.localeCompare(b));
}
