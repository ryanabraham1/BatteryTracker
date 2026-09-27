"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthed } from "@/lib/auth";
import { getFabSettings } from "@/lib/fab-data";
import { FAB_SHAPES, isSheet, SHAPE_DIMS, type FabMaterial, type FabPiece, type FabShape, type OrderStatus } from "@/lib/fab";
import { fmtLength, fmtRect, isUnits } from "@/lib/units";

export type FabResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function guard() {
  if (!(await isAuthed())) throw new Error("Not signed in");
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Wrap an action body: auth, error → message, cache refresh. */
async function run<T>(fn: () => Promise<T>): Promise<FabResult<T>> {
  try {
    await guard();
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
    return { ok: false, error: msg };
  }
}

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
function num(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function posNum(fd: FormData, k: string, label: string): number {
  const n = num(fd, k);
  if (n === null || n <= 0) throw new Error(`Enter a ${label}`);
  return n;
}
function int(fd: FormData, k: string, def = 1): number {
  const n = num(fd, k);
  return n === null ? def : Math.max(1, Math.round(n));
}

const db = () => supabaseAdmin();

async function loadMaterial(id: string): Promise<FabMaterial> {
  const { data, error } = await db().from("fab_materials").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Material not found");
  const n = (v: unknown) => (v === null ? null : Number(v));
  return { ...(data as FabMaterial), full_length_mm: n(data.full_length_mm), full_width_mm: n(data.full_width_mm) };
}

async function loadPiece(id: string): Promise<{ piece: FabPiece; material: FabMaterial }> {
  const { data, error } = await db().from("fab_pieces").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Piece not found");
  const piece = { ...(data as FabPiece), length_mm: Number(data.length_mm), width_mm: data.width_mm === null ? null : Number(data.width_mm) };
  if (piece.status !== "stock") throw new Error("That piece is already used up");
  return { piece, material: await loadMaterial(piece.material_id) };
}

async function locationName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await db().from("fab_locations").select("name").eq("id", id).maybeSingle();
  return (data?.name as string) ?? null;
}

async function logEvent(materialId: string, pieceId: string | null, type: string, data: Record<string, unknown>, undo?: Undo) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  const { error } = await db()
    .from("fab_events")
    .insert({ material_id: materialId, piece_id: pieceId, type, data: clean, undo: undo ?? null });
  if (error) throw error;
}

/** Log labels use inches — they're a record, and the log page re-renders structured values anyway. */
const pieceLabel = (m: FabMaterial, p: Pick<FabPiece, "length_mm" | "width_mm">) =>
  isSheet(m) && p.width_mm !== null ? fmtRect(p.width_mm, p.length_mm, "in") : fmtLength(p.length_mm, "in");

/** Sheets are stored width ≤ length so W×L reads the same way everywhere. */
function normRect(a: number, b: number): { w: number; l: number } {
  return a <= b ? { w: a, l: b } : { w: b, l: a };
}

// ── Materials ────────────────────────────────────────────────────────────────

export async function saveMaterial(fd: FormData): Promise<FabResult<string>> {
  return run(async () => {
    const id = str(fd, "id");
    const shape = str(fd, "shape") as FabShape;
    if (!FAB_SHAPES.includes(shape)) throw new Error("Pick a shape");
    const material = str(fd, "material");
    if (!material) throw new Error("Enter the material (e.g. 6061 Al)");
    const system = str(fd, "system");
    const row = {
      material,
      shape,
      system: isUnits(system) ? system : "in",
      dim_a_mm: num(fd, "dim_a_mm"),
      dim_b_mm: num(fd, "dim_b_mm"),
      wall_mm: num(fd, "wall_mm"),
      full_length_mm: num(fd, "full_length_mm"),
      full_width_mm: shape === "sheet" ? num(fd, "full_width_mm") : null,
      vendor: str(fd, "vendor"),
      vendor_part: str(fd, "vendor_part"),
      url: str(fd, "url"),
      unit_cost: num(fd, "unit_cost"),
      min_amount: num(fd, "min_amount"),
      notes: str(fd, "notes"),
    };
    const need = SHAPE_DIMS[shape];
    for (const [key, label] of [
      ["dim_a_mm", need.a],
      ["dim_b_mm", need.b],
      ["wall_mm", need.wall],
    ] as const) {
      if (label && !(row[key] && row[key] > 0)) throw new Error(`Enter the ${label.toLowerCase()}`);
    }
    if (!need.b) row.dim_b_mm = null;
    if (!need.wall) row.wall_mm = null;
    if (row.full_width_mm && row.full_length_mm) {
      const r = normRect(row.full_width_mm, row.full_length_mm);
      row.full_width_mm = r.w;
      row.full_length_mm = r.l;
    }
    if (id) {
      const { error } = await db().from("fab_materials").update(row).eq("id", id);
      if (error) throw error;
      return id;
    }
    const { data, error } = await db().from("fab_materials").insert(row).select("id").single();
    if (error) throw error;
    return data.id as string;
  });
}

export async function setMaterialArchived(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { error } = await db().from("fab_materials").update({ archived: str(fd, "archived") === "1" }).eq("id", str(fd, "id"));
    if (error) throw error;
  });
}

// ── Undo snapshots ───────────────────────────────────────────────────────────

const PIECE_FIELDS = ["id", "material_id", "length_mm", "width_mm", "has_cutouts", "location_id", "status", "notes"] as const;
const ORDER_FIELDS = ["id", "material_id", "quantity", "length_mm", "width_mm", "status", "expected_date", "notes", "received_at"] as const;
type Snap = Record<string, unknown>;
/** One row's change: `before` null = this entry created it, `after` null = this entry deleted it. */
interface Change {
  before: Snap | null;
  after: Snap | null;
}
interface Undo {
  pieces?: Change[];
  orders?: Change[];
}

function snap(row: object, fields: readonly string[]): Snap {
  const out: Snap = {};
  for (const f of fields) {
    const v = (row as Record<string, unknown>)[f];
    out[f] = f.endsWith("_mm") && v !== null && v !== undefined ? Number(v) : (v ?? null);
  }
  return out;
}
const pieceSnap = (r: object) => snap(r, PIECE_FIELDS);
const orderSnap = (r: object) => snap(r, ORDER_FIELDS);

/** Does the row still look the way this entry left it? (mm compared to 0.01) */
function sameAs(current: Snap, expected: Snap): boolean {
  return Object.keys(expected).every((k) => {
    const a = current[k];
    const b = expected[k];
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.01;
    if (k === "received_at" && a && b) return new Date(String(a)).getTime() === new Date(String(b)).getTime();
    return (a ?? null) === (b ?? null);
  });
}

// ── Pieces ───────────────────────────────────────────────────────────────────

async function updatePiece(id: string, patch: Record<string, unknown>): Promise<Snap> {
  const { data, error } = await db().from("fab_pieces").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return pieceSnap(data);
}

async function insertPieces(rows: Record<string, unknown>[]): Promise<Snap[]> {
  if (!rows.length) return [];
  const { data, error } = await db().from("fab_pieces").insert(rows).select("*");
  if (error) throw error;
  return (data ?? []).map(pieceSnap);
}

export async function receivePieces(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const m = await loadMaterial(str(fd, "material_id"));
    const count = int(fd, "count");
    if (count > 200) throw new Error("That's a lot of pieces — enter 200 or fewer at a time");
    let length = posNum(fd, "length_mm", "length");
    let width: number | null = null;
    if (isSheet(m)) {
      const r = normRect(posNum(fd, "width_mm", "width"), length);
      width = r.w;
      length = r.l;
    }
    const location_id = str(fd, "location_id") || null;
    const created = await insertPieces(
      Array.from({ length: count }, () => ({
        material_id: m.id,
        length_mm: length,
        width_mm: width,
        location_id,
        notes: str(fd, "notes"),
      })),
    );
    const undo: Undo = { pieces: created.map((after) => ({ before: null, after })) };
    const orderId = str(fd, "order_id");
    if (orderId) {
      const { data: before } = await db().from("fab_orders").select("*").eq("id", orderId).maybeSingle();
      const { data: after, error: oe } = await db()
        .from("fab_orders")
        .update({ status: "received", received_at: new Date().toISOString() })
        .eq("id", orderId)
        .select("*")
        .single();
      if (oe) throw oe;
      if (before) undo.orders = [{ before: orderSnap(before), after: orderSnap(after) }];
    }
    await logEvent(
      m.id,
      null,
      "receive",
      { count, length_mm: length, width_mm: width, location: await locationName(location_id), note: str(fd, "notes") },
      undo,
    );
  });
}

/**
 * Cut `count` pieces of `used_mm` off a stick. Each cut loses a kerf; the
 * leftover stays as the same piece unless it's used up or tossed.
 */
export async function cutLinear(fd: FormData): Promise<FabResult<{ leftover_mm: number }>> {
  return run(async () => {
    const { piece, material } = await loadPiece(str(fd, "piece_id"));
    if (isSheet(material)) throw new Error("Use the sheet cut form");
    const used = posNum(fd, "used_mm", "cut length");
    const count = int(fd, "count");
    const { kerf_mm } = await getFabSettings();
    const need = count * used + (count - 1) * kerf_mm;
    if (need > piece.length_mm + 0.5) {
      throw new Error(`Doesn't fit: needs ${fmtLength(need, "in")} (${fmtLength(need, "mm")}) with kerf`);
    }
    const leftover = Math.max(0, piece.length_mm - count * used - count * kerf_mm);
    const scrap = str(fd, "scrap") === "1";
    const tiny = leftover < 1; // under a millimetre is nothing
    const status = tiny ? "used" : scrap ? "scrapped" : "stock";
    const after = await updatePiece(piece.id, status === "stock" ? { length_mm: leftover } : { status });
    await logEvent(
      material.id,
      piece.id,
      "cut",
      {
        before_mm: piece.length_mm,
        used_mm: used,
        count,
        leftover_mm: tiny ? 0 : leftover,
        scrapped: !tiny && scrap ? true : null,
        project: str(fd, "project"),
        note: str(fd, "note"),
      },
      { pieces: [{ before: pieceSnap(piece), after }] },
    );
    return { leftover_mm: status === "stock" ? leftover : 0 };
  });
}

/**
 * Sheets: `whole` uses the piece up; `remaining` replaces it with one or more
 * rectangles (JSON [{w,l}]); `cutouts` keeps the outline but flags it.
 */
export async function cutSheet(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { piece, material } = await loadPiece(str(fd, "piece_id"));
    if (!isSheet(material)) throw new Error("Use the stick cut form");
    const mode = str(fd, "mode");
    const before = { w: piece.width_mm ?? 0, l: piece.length_mm };
    const changes: Change[] = [];
    let remaining: { w: number; l: number }[] = [];
    if (mode === "whole") {
      changes.push({ before: pieceSnap(piece), after: await updatePiece(piece.id, { status: "used" }) });
    } else if (mode === "cutouts") {
      const note = str(fd, "cutout_note");
      const notes = [piece.notes, note].filter(Boolean).join(" · ");
      changes.push({ before: pieceSnap(piece), after: await updatePiece(piece.id, { has_cutouts: true, notes }) });
    } else if (mode === "remaining") {
      try {
        remaining = (JSON.parse(str(fd, "remaining") || "[]") as { w: number; l: number }[])
          .filter((r) => r && Number(r.w) > 0 && Number(r.l) > 0)
          .map((r) => normRect(Number(r.w), Number(r.l)));
      } catch {
        throw new Error("Couldn't read the leftover sizes");
      }
      if (!remaining.length) throw new Error("Enter at least one leftover piece, or pick “Used all of it”");
      for (const r of remaining) {
        if (!(r.w <= before.w + 0.5 && r.l <= before.l + 0.5)) {
          throw new Error(`A ${fmtRect(r.w, r.l, "in")} leftover can't come from a ${fmtRect(before.w, before.l, "in")} sheet`);
        }
      }
      const [first, ...rest] = remaining;
      changes.push({
        before: pieceSnap(piece),
        after: await updatePiece(piece.id, { width_mm: first.w, length_mm: first.l, has_cutouts: false }),
      });
      const created = await insertPieces(
        rest.map((r) => ({ material_id: material.id, width_mm: r.w, length_mm: r.l, location_id: piece.location_id })),
      );
      changes.push(...created.map((after) => ({ before: null, after })));
    } else {
      throw new Error("Pick what's left of the sheet");
    }
    await logEvent(
      material.id,
      piece.id,
      "cut",
      {
        mode,
        before,
        remaining: remaining.length ? remaining : null,
        project: str(fd, "project"),
        note: str(fd, "note") || (mode === "cutouts" ? str(fd, "cutout_note") : ""),
      },
      { pieces: changes },
    );
  });
}

export async function movePiece(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { piece, material } = await loadPiece(str(fd, "piece_id"));
    const to = str(fd, "location_id") || null;
    if (to === piece.location_id) return;
    const after = await updatePiece(piece.id, { location_id: to });
    await logEvent(
      material.id,
      piece.id,
      "move",
      {
        piece: pieceLabel(material, piece),
        length_mm: piece.length_mm,
        width_mm: piece.width_mm,
        from: (await locationName(piece.location_id)) ?? "No location",
        to: (await locationName(to)) ?? "No location",
      },
      { pieces: [{ before: pieceSnap(piece), after }] },
    );
  });
}

/** Fix a piece to match what's really on the rack (inventory count). */
export async function editPiece(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { piece, material } = await loadPiece(str(fd, "piece_id"));
    let length = posNum(fd, "length_mm", "length");
    let width: number | null = null;
    if (isSheet(material)) {
      const r = normRect(posNum(fd, "width_mm", "width"), length);
      width = r.w;
      length = r.l;
    }
    const next = {
      length_mm: length,
      width_mm: width,
      has_cutouts: isSheet(material) && str(fd, "has_cutouts") === "1",
      notes: str(fd, "notes"),
    };
    const after = await updatePiece(piece.id, next);
    const before = pieceLabel(material, piece);
    const afterLabel = pieceLabel(material, next);
    await logEvent(
      material.id,
      piece.id,
      "edit",
      {
        summary: before === afterLabel ? `${afterLabel} (notes / cutouts)` : `${before} → ${afterLabel}`,
        before: { length_mm: piece.length_mm, width_mm: piece.width_mm },
        after: { length_mm: length, width_mm: width },
      },
      { pieces: [{ before: pieceSnap(piece), after }] },
    );
  });
}

export async function scrapPiece(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { piece, material } = await loadPiece(str(fd, "piece_id"));
    const after = await updatePiece(piece.id, { status: "scrapped" });
    await logEvent(
      material.id,
      piece.id,
      "scrap",
      {
        piece: pieceLabel(material, piece),
        length_mm: piece.length_mm,
        width_mm: piece.width_mm,
        reason: str(fd, "reason"),
      },
      { pieces: [{ before: pieceSnap(piece), after }] },
    );
  });
}

// ── Orders ───────────────────────────────────────────────────────────────────

function orderData(m: FabMaterial, o: Record<string, unknown>, status: string) {
  const length = o.length_mm === null ? null : Number(o.length_mm);
  const width = o.width_mm === null ? null : Number(o.width_mm);
  return {
    status,
    quantity: o.quantity,
    size: length ? pieceLabel(m, { length_mm: length, width_mm: width }) : "",
    length_mm: length,
    width_mm: width,
  };
}

export async function addOrder(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const m = await loadMaterial(str(fd, "material_id"));
    const quantity = int(fd, "quantity");
    let length = num(fd, "length_mm") ?? m.full_length_mm;
    let width = isSheet(m) ? (num(fd, "width_mm") ?? m.full_width_mm) : null;
    if (width && length) {
      const r = normRect(width, length);
      width = r.w;
      length = r.l;
    }
    const { data, error } = await db()
      .from("fab_orders")
      .insert({ material_id: m.id, quantity, length_mm: length, width_mm: width, notes: str(fd, "notes") })
      .select("*")
      .single();
    if (error) throw error;
    await logEvent(m.id, null, "order", orderData(m, data, "needed"), { orders: [{ before: null, after: orderSnap(data) }] });
  });
}

export async function setOrderStatus(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const status = str(fd, "status") as OrderStatus;
    if (!["needed", "ordered"].includes(status)) throw new Error("Bad status");
    const { data: before, error: be } = await db().from("fab_orders").select("*").eq("id", str(fd, "id")).single();
    if (be || !before) throw new Error("Order not found");
    const { data, error } = await db()
      .from("fab_orders")
      .update({ status, expected_date: str(fd, "expected_date") || null })
      .eq("id", before.id)
      .select("*")
      .single();
    if (error) throw error;
    const m = await loadMaterial(data.material_id);
    await logEvent(m.id, null, "order", orderData(m, data, status), { orders: [{ before: orderSnap(before), after: orderSnap(data) }] });
  });
}

export async function deleteOrder(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { data: before, error: be } = await db().from("fab_orders").select("*").eq("id", str(fd, "id")).single();
    if (be || !before) throw new Error("Order not found");
    const { error } = await db().from("fab_orders").delete().eq("id", before.id);
    if (error) throw error;
    const m = await loadMaterial(before.material_id);
    await logEvent(m.id, null, "order", orderData(m, before, "removed"), { orders: [{ before: orderSnap(before), after: null }] });
  });
}

// ── Undo ─────────────────────────────────────────────────────────────────────

/**
 * Put back what a log entry changed. Refuses (without touching anything) if a
 * row it touched has changed since, so a later change is never silently lost.
 */
export async function undoEvent(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { data: ev, error } = await db().from("fab_events").select("*").eq("id", str(fd, "id")).single();
    if (error || !ev) throw new Error("Log entry not found");
    if (ev.undone_at) throw new Error("Already undone");
    const undo = ev.undo as Undo | null;
    if (!undo) throw new Error("This entry can't be undone");

    const tables = [
      ["fab_pieces", undo.pieces ?? [], pieceSnap, "piece"],
      ["fab_orders", undo.orders ?? [], orderSnap, "shopping list line"],
    ] as const;

    // 1. Check everything first.
    for (const [table, changes, toSnap, noun] of tables) {
      for (const c of changes) {
        const id = String((c.after ?? c.before)!.id);
        const { data: cur } = await db().from(table).select("*").eq("id", id).maybeSingle();
        if (c.after === null) {
          if (cur) throw new Error(`That ${noun} is back already`);
        } else if (!cur || !sameAs(toSnap(cur), c.after)) {
          throw new Error(`That ${noun} has changed since — undo the newer entries first`);
        }
      }
    }

    // 2. Restore.
    for (const [table, changes] of tables) {
      for (const c of changes) {
        if (c.before === null) {
          const { error: e } = await db().from(table).delete().eq("id", String(c.after!.id));
          if (e) throw e;
        } else if (c.after === null) {
          const { error: e } = await db().from(table).insert(c.before);
          if (e) throw e;
        } else {
          const { id, ...rest } = c.before;
          const { error: e } = await db().from(table).update(rest).eq("id", String(id));
          if (e) throw e;
        }
      }
    }

    const { error: ue } = await db().from("fab_events").update({ undone_at: new Date().toISOString() }).eq("id", ev.id);
    if (ue) throw ue;
  });
}

// ── Pit kits ─────────────────────────────────────────────────────────────────

export async function addKit(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const name = str(fd, "name");
    if (!name) throw new Error("Name the kit");
    const { error } = await db().from("fab_kits").insert({ name });
    if (error) throw error.code === "23505" ? new Error("There's already a kit with that name") : error;
  });
}

export async function deleteKit(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { error } = await db().from("fab_kits").delete().eq("id", str(fd, "id"));
    if (error) throw error;
  });
}

export async function addKitItem(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const materialId = str(fd, "material_id");
    if (!materialId) throw new Error("Pick a material");
    const m = await loadMaterial(materialId);
    let length = num(fd, "min_length_mm");
    let width = isSheet(m) ? num(fd, "min_width_mm") : null;
    if (width && length) {
      const r = normRect(width, length);
      width = r.w;
      length = r.l;
    }
    const { error } = await db().from("fab_kit_items").insert({
      kit_id: str(fd, "kit_id"),
      material_id: materialId,
      count: int(fd, "count"),
      min_length_mm: length,
      min_width_mm: width,
    });
    if (error) throw error;
  });
}

export async function deleteKitItem(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { error } = await db().from("fab_kit_items").delete().eq("id", str(fd, "id"));
    if (error) throw error;
  });
}

// ── Setup ────────────────────────────────────────────────────────────────────

export async function saveFabSettings(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const kerf = num(fd, "kerf_mm");
    const scrap = num(fd, "scrap_min_mm");
    if (kerf === null || kerf < 0 || kerf > 20) throw new Error("Kerf should be between 0 and 20 mm");
    if (scrap === null || scrap < 0) throw new Error("Enter a scrap length");
    const { error } = await db().from("fab_settings").upsert({ id: 1, kerf_mm: kerf, scrap_min_mm: scrap });
    if (error) throw error;
  });
}

export async function saveLocation(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const id = str(fd, "id");
    const name = str(fd, "name");
    if (!name) throw new Error("Name the location");
    const kind = str(fd, "kind") === "pit" ? "pit" : "shop";
    const sort = num(fd, "sort") ?? 0;
    const { error } = id
      ? await db().from("fab_locations").update({ name, kind, sort }).eq("id", id)
      : await db().from("fab_locations").insert({ name, kind, sort });
    if (error) throw error.code === "23505" ? new Error("There's already a location with that name") : error;
  });
}

export async function deleteLocation(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { error } = await db().from("fab_locations").delete().eq("id", str(fd, "id"));
    if (error) throw error;
  });
}
