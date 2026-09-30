import { fmtArea, fmtLength, fmtNominal, fmtRect, type Units } from "./units";

export type FabShape = "box_tube" | "round_tube" | "flat_bar" | "angle" | "channel" | "round_rod" | "hex_shaft" | "sheet";
export const FAB_SHAPES: FabShape[] = ["box_tube", "round_tube", "flat_bar", "angle", "channel", "round_rod", "hex_shaft", "sheet"];
export const SHAPE_LABEL: Record<FabShape, string> = {
  box_tube: "Box tube",
  round_tube: "Round tube",
  flat_bar: "Flat bar",
  angle: "Angle",
  channel: "Channel",
  round_rod: "Round rod",
  hex_shaft: "Hex shaft",
  sheet: "Sheet / plate",
};

/** Filter groups on the rack. */
export type ShapeGroup = "tube" | "bar" | "shaft" | "sheet";
export const SHAPE_GROUP: Record<FabShape, ShapeGroup> = {
  box_tube: "tube",
  round_tube: "tube",
  flat_bar: "bar",
  angle: "bar",
  channel: "bar",
  round_rod: "shaft",
  hex_shaft: "shaft",
  sheet: "sheet",
};
export const GROUP_LABEL: Record<ShapeGroup, string> = {
  tube: "Tube",
  bar: "Bar · angle · channel",
  shaft: "Rod · hex",
  sheet: "Sheet",
};

/** Which dimension fields a shape uses, and what they're called. */
export const SHAPE_DIMS: Record<FabShape, { a?: string; b?: string; wall?: string }> = {
  box_tube: { a: "Width", b: "Height", wall: "Wall" },
  round_tube: { a: "OD", wall: "Wall" },
  flat_bar: { a: "Width", wall: "Thickness" },
  angle: { a: "Leg A", b: "Leg B", wall: "Thickness" },
  channel: { a: "Width", b: "Height", wall: "Thickness" },
  round_rod: { a: "Diameter" },
  hex_shaft: { a: "Across flats" },
  sheet: { wall: "Thickness" },
};

export const MATERIAL_SUGGESTIONS = [
  "6061 Al",
  "7075 Al",
  "Steel",
  "Stainless",
  "Polycarbonate",
  "HDPE",
  "Delrin",
  "UHMW",
  "Nylon",
  "Plywood",
  "Carbon fiber",
];

export type LocationKind = "shop" | "pit";
export interface FabLocation {
  id: string;
  name: string;
  kind: LocationKind;
  sort: number;
}

export interface FabMaterial {
  id: string;
  material: string;
  shape: FabShape;
  system: Units;
  dim_a_mm: number | null;
  dim_b_mm: number | null;
  wall_mm: number | null;
  full_length_mm: number | null;
  full_width_mm: number | null;
  vendor: string;
  vendor_part: string;
  url: string;
  unit_cost: number | null;
  min_amount: number | null;
  notes: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type PieceStatus = "stock" | "used" | "scrapped";

/**
 * A part of a sheet that can't be used, mm from the sheet's corner: x along
 * the length, y across the width.
 */
export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FabPiece {
  id: string;
  material_id: string;
  length_mm: number;
  width_mm: number | null;
  has_cutouts: boolean;
  /** Unusable areas of a sheet (empty for sticks and clean sheets). */
  dead_zones: Zone[];
  location_id: string | null;
  status: PieceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type FabEventType = "receive" | "cut" | "move" | "edit" | "scrap" | "order";
export const FAB_EVENT_TYPES: FabEventType[] = ["receive", "cut", "move", "edit", "scrap", "order"];
export const FAB_EVENT_LABEL: Record<FabEventType, string> = {
  receive: "Receive",
  cut: "Cut",
  move: "Move",
  edit: "Edit",
  scrap: "Scrap",
  order: "Order",
};
export const FAB_EVENT_TONE: Record<FabEventType, "good" | "info" | "warn" | "bad" | "purple" | "muted"> = {
  receive: "good",
  cut: "purple",
  move: "info",
  edit: "muted",
  scrap: "bad",
  order: "warn",
};
export interface FabEvent {
  id: string;
  material_id: string;
  piece_id: string | null;
  type: FabEventType;
  data: Record<string, unknown>;
  occurred_at: string;
  /** Has an undo snapshot and hasn't been undone. */
  undoable: boolean;
  undone_at: string | null;
}

export type OrderStatus = "needed" | "ordered" | "received";
export interface FabOrder {
  id: string;
  material_id: string;
  quantity: number;
  length_mm: number | null;
  width_mm: number | null;
  status: OrderStatus;
  expected_date: string | null;
  notes: string;
  received_at: string | null;
  created_at: string;
}

export interface FabKit {
  id: string;
  name: string;
}
export interface FabKitItem {
  id: string;
  kit_id: string;
  material_id: string;
  count: number;
  min_length_mm: number | null;
  min_width_mm: number | null;
}

export interface FabSettings {
  kerf_mm: number;
  scrap_min_mm: number;
}
export const DEFAULT_FAB_SETTINGS: FabSettings = { kerf_mm: 3.175, scrap_min_mm: 152.4 };

export const isSheet = (m: Pick<FabMaterial, "shape">) => m.shape === "sheet";

/** Size the way it's sold, in the material's own system: `2×1 × 1/16 wall`, `1/2 hex`, `1/4 thick`. */
export function sizeLabel(m: FabMaterial): string {
  const n = (v: number | null) => (v === null ? "?" : fmtNominal(v, m.system));
  const u = m.system === "in" ? '"' : " mm";
  switch (m.shape) {
    case "box_tube":
      return `${n(m.dim_a_mm)}×${n(m.dim_b_mm)}${u} × ${n(m.wall_mm)} wall`;
    case "round_tube":
      return `${n(m.dim_a_mm)}${u} OD × ${n(m.wall_mm)} wall`;
    case "flat_bar":
      return `${n(m.dim_a_mm)} × ${n(m.wall_mm)}${u}`;
    case "angle":
    case "channel":
      return `${n(m.dim_a_mm)}×${n(m.dim_b_mm)}${u} × ${n(m.wall_mm)}`;
    case "round_rod":
      return `${n(m.dim_a_mm)}${u} dia`;
    case "hex_shaft":
      return `${n(m.dim_a_mm)}${u} hex`;
    case "sheet":
      return `${n(m.wall_mm)}${u} thick`;
  }
}

/** `6061 Al box tube · 2×1" × 1/16 wall` */
export function materialName(m: FabMaterial): string {
  return `${m.material} ${SHAPE_LABEL[m.shape].toLowerCase()} · ${sizeLabel(m)}`;
}

export function pieceArea(p: Pick<FabPiece, "length_mm" | "width_mm">): number {
  return p.length_mm * (p.width_mm ?? 0);
}

/** Zones as stored (jsonb), cleaned up; anything unreadable is dropped. */
export function toZones(v: unknown): Zone[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((z) => ({ x: Number(z?.x), y: Number(z?.y), w: Number(z?.w), h: Number(z?.h) }))
    .filter((z) => [z.x, z.y, z.w, z.h].every(Number.isFinite) && z.w > 0 && z.h > 0);
}

type SheetLike = Pick<FabPiece, "length_mm" | "width_mm"> & { dead_zones?: Zone[] };

/** Zones clipped to the sheet, dropping any that end up empty. */
export function clipZones(zones: Zone[] | undefined, l: number, w: number): Zone[] {
  const out: Zone[] = [];
  for (const z of zones ?? []) {
    const x0 = Math.max(0, z.x);
    const y0 = Math.max(0, z.y);
    const x1 = Math.min(l, z.x + z.w);
    const y1 = Math.min(w, z.y + z.h);
    if (x1 - x0 > 0.5 && y1 - y0 > 0.5) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

/** Sorted unique edges of the sheet and its zones along one axis. */
function edges(zones: Zone[], size: number, lo: "x" | "y", len: "w" | "h"): number[] {
  const s = new Set([0, size]);
  for (const z of zones) {
    s.add(z[lo]);
    s.add(z[lo] + z[len]);
  }
  return [...s].sort((a, b) => a - b);
}

/** Area the zones cover (overlaps counted once), mm². */
export function deadArea(p: SheetLike): number {
  const w = p.width_mm ?? 0;
  const zones = clipZones(p.dead_zones, p.length_mm, w);
  if (!zones.length) return 0;
  const xs = edges(zones, p.length_mm, "x", "w");
  const ys = edges(zones, w, "y", "h");
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (zones.some((z) => cx > z.x && cx < z.x + z.w && cy > z.y && cy < z.y + z.h)) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  }
  return area;
}

/** Sheet area minus the unusable zones, mm². */
export function usableArea(p: SheetLike): number {
  return pieceArea(p) - deadArea(p);
}

/**
 * The biggest clean rectangles on a sheet that dodge every zone (maximal
 * rectangles, biggest first). A clean sheet is one rectangle: itself.
 */
export function freeRects(p: SheetLike): Zone[] {
  const W = p.width_mm ?? 0;
  const L = p.length_mm;
  const zones = clipZones(p.dead_zones, L, W);
  if (!zones.length) return [{ x: 0, y: 0, w: L, h: W }];
  const xs = edges(zones, L, "x", "w");
  const ys = edges(zones, W, "y", "h");
  const hits = (x0: number, y0: number, x1: number, y1: number) =>
    zones.some((z) => z.x < x1 - 1e-6 && z.x + z.w > x0 + 1e-6 && z.y < y1 - 1e-6 && z.y + z.h > y0 + 1e-6);
  const found: Zone[] = [];
  for (let a = 0; a < xs.length; a++) {
    for (let b = 0; b < ys.length; b++) {
      // grow right as far as possible for each height, keeping only rectangles
      // that can't grow in any direction
      for (let d = ys.length - 1; d > b; d--) {
        let c = a;
        while (c + 1 < xs.length && !hits(xs[a], ys[b], xs[c + 1], ys[d])) c++;
        if (c === a) continue;
        const r = { x: xs[a], y: ys[b], w: xs[c] - xs[a], h: ys[d] - ys[b] };
        const blocked = (x0: number, y0: number, x1: number, y1: number) => x0 < 0 || y0 < 0 || x1 > L || y1 > W || hits(x0, y0, x1, y1);
        const left = a === 0 || blocked(xs[a - 1], r.y, r.x + r.w, r.y + r.h);
        const down = b === 0 || blocked(r.x, ys[b - 1], r.x + r.w, r.y + r.h);
        const up = d === ys.length - 1 || blocked(r.x, r.y, r.x + r.w, ys[d + 1]);
        if (left && down && up) found.push(r);
      }
    }
  }
  const uniq = new Map(found.map((r) => [`${r.x}:${r.y}:${r.w}:${r.h}`, r]));
  return [...uniq.values()].sort((a, b) => b.w * b.h - a.w * a.h);
}

/** Amount of one piece: mm for linear stock, usable mm² for sheet. */
export function pieceAmount(m: FabMaterial, p: FabPiece): number {
  return isSheet(m) ? usableArea(p) : p.length_mm;
}

/** A piece counts as "full" when it's (within 1 mm of) the size it's bought at. */
export function isFullPiece(m: FabMaterial, p: FabPiece): boolean {
  if (!m.full_length_mm) return false;
  const lenOk = p.length_mm >= m.full_length_mm - 1;
  if (!isSheet(m)) return lenOk;
  if (!m.full_width_mm || p.width_mm === null) return false;
  return lenOk && p.width_mm >= m.full_width_mm - 1 && !p.has_cutouts && !p.dead_zones.length;
}

export function fmtPiece(m: FabMaterial, p: Pick<FabPiece, "length_mm" | "width_mm">, units: Units): string {
  return isSheet(m) && p.width_mm !== null ? fmtRect(p.width_mm, p.length_mm, units) : fmtLength(p.length_mm, units);
}

export function fmtAmount(m: FabMaterial, amount: number, units: Units): string {
  return isSheet(m) ? fmtArea(amount, units) : fmtLength(amount, units);
}

/** Does a W×L need fit in a sheet piece, either way round, clear of its unusable zones? */
export function rectFits(needW: number, needL: number, p: SheetLike): boolean {
  return freeRects(p).some((r) => (needW <= r.h && needL <= r.w) || (needW <= r.w && needL <= r.h));
}

/**
 * Pieces that fit a need, best first: for linear stock the shortest that's
 * long enough; for sheet the smallest area that fits (clean sheets before ones
 * with cutouts). Uses offcuts before cutting into a full stick.
 */
export function bestFits(m: FabMaterial, pieces: FabPiece[], needL: number, needW?: number): FabPiece[] {
  if (isSheet(m)) {
    const w = needW ?? 0;
    return pieces
      .filter((p) => rectFits(w, needL, p))
      .sort((a, b) => Number(a.has_cutouts || a.dead_zones.length > 0) - Number(b.has_cutouts || b.dead_zones.length > 0) || usableArea(a) - usableArea(b));
  }
  return pieces.filter((p) => p.length_mm >= needL).sort((a, b) => a.length_mm - b.length_mm);
}

export interface MaterialSummary {
  material: FabMaterial;
  pieces: FabPiece[];
  total: number;
  fullCount: number;
  low: boolean;
  openOrders: number;
}

export function summarize(
  materials: FabMaterial[],
  pieces: FabPiece[],
  orders: Pick<FabOrder, "material_id" | "status">[] = [],
): MaterialSummary[] {
  const byMat = new Map<string, FabPiece[]>();
  for (const p of pieces) {
    if (p.status !== "stock") continue;
    const list = byMat.get(p.material_id) ?? [];
    list.push(p);
    byMat.set(p.material_id, list);
  }
  return materials.map((m) => {
    const ps = (byMat.get(m.id) ?? []).sort((a, b) => pieceAmount(m, b) - pieceAmount(m, a));
    const total = ps.reduce((s, p) => s + pieceAmount(m, p), 0);
    return {
      material: m,
      pieces: ps,
      total,
      fullCount: ps.filter((p) => isFullPiece(m, p)).length,
      low: m.min_amount !== null && m.min_amount > 0 && total < m.min_amount,
      openOrders: orders.filter((o) => o.material_id === m.id && o.status !== "received").length,
    };
  });
}

export interface ItemStatus {
  item: FabKitItem;
  packed: FabPiece[];
  /** Best pieces still in the shop that would cover the shortfall. */
  suggest: FabPiece[];
}

/**
 * A kit item is packed when enough pieces that meet its minimum size sit in a
 * pit location. Pieces are handed out smallest-that-fits so two items for the
 * same material don't both claim one stick.
 */
export function kitStatus(items: FabKitItem[], mat: Map<string, FabMaterial>, pieces: FabPiece[], pitIds: Set<string>): Map<string, ItemStatus> {
  const out = new Map<string, ItemStatus>();
  const taken = new Set<string>();
  const need = (i: FabKitItem) => (i.min_length_mm ?? 0) * Math.max(1, i.min_width_mm ?? 1);
  for (const item of [...items].sort((a, b) => need(b) - need(a))) {
    const m = mat.get(item.material_id);
    if (!m) continue;
    const mine = pieces.filter((p) => p.material_id === m.id && !taken.has(p.id));
    const fits = bestFits(m, mine, item.min_length_mm ?? 0, isSheet(m) ? (item.min_width_mm ?? 0) : undefined);
    const packed = fits.filter((p) => p.location_id && pitIds.has(p.location_id)).slice(0, item.count);
    packed.forEach((p) => taken.add(p.id));
    const short = item.count - packed.length;
    const suggest = short > 0 ? fits.filter((p) => !(p.location_id && pitIds.has(p.location_id)) && !taken.has(p.id)).slice(0, short) : [];
    out.set(item.id, { item, packed, suggest });
  }
  return out;
}

/** One-line description of a log entry. */
export function describeEvent(e: FabEvent, m: FabMaterial | undefined, units: Units): string {
  const d = e.data as Record<string, unknown>;
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  const len = (k: string) => fmtLength(num(k), units);
  const rect = (v: unknown) => {
    const r = v as { w?: number; l?: number } | undefined;
    return r && typeof r.w === "number" && typeof r.l === "number" ? fmtRect(r.w, r.l, units) : "?";
  };
  const sheet = m ? isSheet(m) : false;
  /** A piece size from structured mm fields, falling back to the label saved at the time. */
  const size = (v: unknown, fallback: unknown) => {
    const r = (v ?? {}) as { length_mm?: number | null; width_mm?: number | null };
    if (typeof r.length_mm !== "number") return typeof fallback === "string" ? fallback : "piece";
    return sheet && typeof r.width_mm === "number" ? fmtRect(r.width_mm, r.length_mm, units) : fmtLength(r.length_mm, units);
  };
  const tail = [d.project ? `for ${d.project}` : "", d.note ? `— ${d.note}` : ""].filter(Boolean).join(" ");
  switch (e.type) {
    case "receive": {
      const size = sheet ? fmtRect(num("width_mm") ?? 0, num("length_mm") ?? 0, units) : len("length_mm");
      return `Received ${num("count") ?? 1} × ${size}${d.location ? ` → ${d.location}` : ""} ${tail}`.trim();
    }
    case "cut": {
      if (sheet) {
        const mode = d.mode as string;
        const from = rect(d.before);
        if (mode === "whole") return `Used all of ${from} ${tail}`.trim();
        if (mode === "cutouts") {
          const n = Array.isArray(d.zones) ? d.zones.length : 0;
          return n
            ? `Cut ${n === 1 ? "an area" : `${n} areas`} out of ${from} (marked unusable) ${tail}`.trim()
            : `Cut parts out of ${from} (kept, has cutouts) ${tail}`.trim();
        }
        const rem = Array.isArray(d.remaining) ? (d.remaining as unknown[]).map(rect).join(", ") : "";
        return `Cut ${from} → left ${rem || "nothing"} ${tail}`.trim();
      }
      const count = num("count") ?? 1;
      const used = `${count > 1 ? `${count} × ` : ""}${len("used_mm")}`;
      const left = num("leftover_mm") ? `${len("leftover_mm")} left${d.scrapped ? " (tossed)" : ""}` : "none left";
      return `Cut ${used} from ${len("before_mm")} · ${left} ${tail}`.trim();
    }
    case "move":
      return `Moved ${size(d, d.piece)} ${d.from ?? "—"} → ${d.to ?? "—"}`;
    case "edit": {
      if (!d.before || !d.after) return `Edited ${d.summary ?? "piece"}`;
      const before = size(d.before, null);
      const after = size(d.after, null);
      const zones = typeof d.zones === "number" ? ` · ${d.zones ? `${d.zones} unusable ${d.zones === 1 ? "area" : "areas"}` : "cleared unusable areas"}` : "";
      return before === after ? `Edited ${after}${zones || " (notes / cutouts)"}` : `Edited ${before} → ${after}${zones}`;
    }
    case "scrap":
      return `Scrapped ${size(d, d.piece)}${d.reason ? ` — ${d.reason}` : ""}`;
    case "order":
      return `${d.status === "ordered" ? "Marked ordered" : d.status === "removed" ? "Removed from shopping list" : "Added to shopping list"}: ${d.quantity ?? 1} × ${size(d, d.size)}`;
  }
}
