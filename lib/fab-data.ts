import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";
import { isUnits, UNITS_COOKIE, type Units } from "./units";
import {
  DEFAULT_FAB_SETTINGS,
  type FabEvent,
  type FabKit,
  type FabKitItem,
  type FabLocation,
  type FabMaterial,
  type FabOrder,
  type FabPiece,
  type FabSettings,
} from "./fab";

/** The viewer's length units (a per-device cookie; inches until they switch). */
export async function getUnits(): Promise<Units> {
  const v = (await cookies()).get(UNITS_COOKIE)?.value;
  return isUnits(v) ? v : "in";
}

// numeric columns come back from PostgREST as numbers already; normalise nulls.
const N = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toMaterial(r: Record<string, unknown>): FabMaterial {
  return {
    ...(r as unknown as FabMaterial),
    dim_a_mm: N(r.dim_a_mm),
    dim_b_mm: N(r.dim_b_mm),
    wall_mm: N(r.wall_mm),
    full_length_mm: N(r.full_length_mm),
    full_width_mm: N(r.full_width_mm),
    unit_cost: N(r.unit_cost),
    min_amount: N(r.min_amount),
  };
}
function toPiece(r: Record<string, unknown>): FabPiece {
  return { ...(r as unknown as FabPiece), length_mm: Number(r.length_mm), width_mm: N(r.width_mm) };
}

export async function getFabSettings(): Promise<FabSettings> {
  const { data, error } = await supabaseAdmin().from("fab_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_FAB_SETTINGS;
  return { kerf_mm: Number(data.kerf_mm), scrap_min_mm: Number(data.scrap_min_mm) };
}

export async function getLocations(): Promise<FabLocation[]> {
  const { data, error } = await supabaseAdmin().from("fab_locations").select("*").order("sort").order("name");
  if (error) throw error;
  return (data ?? []) as FabLocation[];
}

export async function getMaterials(opts: { includeArchived?: boolean } = {}): Promise<FabMaterial[]> {
  let q = supabaseAdmin().from("fab_materials").select("*").order("material").order("shape");
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toMaterial);
}

export async function getMaterial(id: string): Promise<FabMaterial | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabaseAdmin().from("fab_materials").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toMaterial(data) : null;
}

/** Pieces still on the rack (status = stock). */
export async function getStockPieces(materialId?: string): Promise<FabPiece[]> {
  let q = supabaseAdmin().from("fab_pieces").select("*").eq("status", "stock");
  if (materialId) q = q.eq("material_id", materialId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toPiece);
}

export async function getOrders(opts: { open?: boolean; materialId?: string } = {}): Promise<FabOrder[]> {
  let q = supabaseAdmin().from("fab_orders").select("*").order("created_at", { ascending: false });
  if (opts.open) q = q.neq("status", "received");
  if (opts.materialId) q = q.eq("material_id", opts.materialId);
  const { data, error } = await q.limit(300);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...(r as FabOrder), length_mm: N(r.length_mm), width_mm: N(r.width_mm) }));
}

export interface FabEventsFilter {
  type?: string;
  materialId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function getFabEvents(f: FabEventsFilter = {}): Promise<FabEvent[]> {
  let q = supabaseAdmin()
    .from("fab_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(f.limit ?? 500);
  if (f.type) q = q.eq("type", f.type);
  if (f.materialId) q = q.eq("material_id", f.materialId);
  if (f.from) q = q.gte("occurred_at", new Date(f.from).toISOString());
  if (f.to) {
    const end = new Date(f.to);
    end.setDate(end.getDate() + 1);
    q = q.lt("occurred_at", end.toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;
  // The undo snapshot stays on the server; pages only need to know if it's there.
  return (data ?? []).map(({ undo, ...r }) => ({ ...(r as Omit<FabEvent, "undoable">), undoable: !!undo && !r.undone_at }));
}

export async function getKits(): Promise<{ kits: FabKit[]; items: FabKitItem[] }> {
  const [k, i] = await Promise.all([
    supabaseAdmin().from("fab_kits").select("*").order("name"),
    supabaseAdmin().from("fab_kit_items").select("*").order("created_at"),
  ]);
  if (k.error) throw k.error;
  if (i.error) throw i.error;
  return {
    kits: (k.data ?? []) as FabKit[],
    items: (i.data ?? []).map((r) => ({
      ...(r as FabKitItem),
      min_length_mm: N(r.min_length_mm),
      min_width_mm: N(r.min_width_mm),
    })),
  };
}
