import "server-only";
import { supabaseAdmin } from "./supabase";
import { getMaterials } from "./fab-data";
import { toPart } from "./parts-data";
import { matchMaterial, sizesFromText, STOCK_KINDS, type FabPart } from "./parts";

export interface RematchResult {
  /** parts looked at: unlocked, not yet cut, cut from stock */
  checked: number;
  /** of those, how many got a different stock material */
  changed: number;
  /** how many have a match now */
  matched: number;
  /** nothing on the rack fits */
  unmatched: number;
  /** left alone: stock picked by hand, or already cut from the rack */
  skipped: number;
}

/**
 * Point every part's "cut from" at the best-fitting stock material on the
 * rack. Parts whose stock was picked by hand, or that already came off the
 * rack, are left alone. Run after stock materials change, or on demand.
 */
export async function rematchParts(): Promise<RematchResult> {
  const db = supabaseAdmin();
  const [{ data, error }, materials] = await Promise.all([
    db.from("fab_parts").select("*").in("kind", STOCK_KINDS).eq("missing", false),
    getMaterials(),
  ]);
  if (error) throw error;
  const all = (data ?? []).map(toPart);
  const todo = all.filter((p) => !p.material_locked && p.cut_qty === 0);
  const updates: { id: string; material_id: string | null }[] = [];
  let matched = 0;
  for (const p of todo) {
    // parts typed in by hand have sizes only in their text columns
    const t = p.source ? null : sizesFromText(p.material_text, p.stock_dims, p.length_text);
    const sized: FabPart = { ...p, size_l_mm: p.size_l_mm ?? t?.l ?? null, size_w_mm: p.size_w_mm ?? t?.w ?? null, size_t_mm: p.size_t_mm ?? t?.t ?? null };
    const id = matchMaterial(sized, materials)?.id ?? null;
    if (id) matched++;
    if (id !== p.material_id) updates.push({ id: p.id, material_id: id });
  }
  for (let i = 0; i < updates.length; i += 10) {
    const results = await Promise.all(updates.slice(i, i + 10).map((u) => db.from("fab_parts").update({ material_id: u.material_id }).eq("id", u.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }
  return { checked: todo.length, changed: updates.length, matched, unmatched: todo.length - matched, skipped: all.length - todo.length };
}

/** Best effort, for after a stock change: the stock edit itself already succeeded. */
export async function rematchQuietly(): Promise<void> {
  try {
    await rematchParts();
  } catch {
    // the "Auto-match" button on the tracker retries and shows the error
  }
}
