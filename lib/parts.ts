import type { FabMaterial, FabShape } from "./fab";
import type { Geometry } from "./geom";
import type { JobStatus, Tracker } from "./tracker";
import { parseLength } from "./units";

/**
 * Parts the team is making — the fab tracker. One row per part, with the
 * columns of the team's Machining / 3D Printing sheets; the kind says how
 * it's made (and which DFM checks and stock apply).
 */
export type PartKind = "plate" | "tube" | "shaft" | "print" | "machined";
export const PART_KINDS: PartKind[] = ["plate", "tube", "shaft", "print", "machined"];
export const KIND_LABEL: Record<PartKind, string> = {
  plate: "Plate",
  tube: "Tube & bar",
  shaft: "Shaft",
  print: "3D print",
  machined: "Machined",
};
export const KIND_HINT: Record<PartKind, string> = {
  plate: "Router / laser from sheet",
  tube: "Saw to length, then drill / mill",
  shaft: "Hex & round stock, lathe work",
  print: "Printed parts",
  machined: "Mill work from a block",
};

/** Which of the team's two tracker sheets a kind of part belongs to. */
export const trackerOf = (k: PartKind): Tracker => (k === "print" ? "print" : "machining");

/** Parts cut from sheet / stick stock on the rack (the cut plan and stock sync cover these). */
export const STOCK_KINDS: PartKind[] = ["plate", "tube", "shaft"];
export const isStockKind = (k: PartKind) => STOCK_KINDS.includes(k);

/**
 * Statuses where the stock hasn't been cut yet. Moving a stock part out of
 * these (to In Progress / Finished) is when it comes off the rack; the cut
 * plan's "Mark cut" moves it to In Progress.
 */
export const BEFORE_CUT: JobStatus[] = ["not_started", "have_cam", "spares_needed"];
export const AFTER_CUT: JobStatus = "in_progress";
/** Moving from a before-cut status to one of these means the stock got used. */
export const USES_STOCK: JobStatus[] = ["in_progress", "finished", "spares_finished"];

export const isPartKind = (v: unknown): v is PartKind => PART_KINDS.includes(v as PartKind);

export interface PartSource {
  did: string;
  wvm: "w" | "v" | "m";
  wvmid: string;
  eid: string;
  partId: string;
  configuration?: string;
}

/** Plate outline (normalised: outer CCW first, holes CW, origin at the bbox corner) + measurements. */
export interface PartGeometry extends Geometry {
  width: number;
  height: number;
  area: number;
  /** Came from Onshape's model, a DXF upload, or a hand-drawn rectangle. */
  from: "onshape" | "dxf";
  /** Splines/ellipses were approximated with straight segments. */
  approx?: boolean;
  /** Open ends / stray shapes the reader couldn't use. */
  open?: number;
  stray?: number;
  stats: GeomStats;
}

/** Machine-independent measurements, worked out once when the outline is saved. */
export interface GeomStats {
  /** Round hole diameters, mm. */
  holes: number[];
  /** Inside corners with no radius (a router bit leaves its own radius there). */
  sharpInside: number;
  /** Inside arc radii (excluding round holes), mm. */
  insideRadii: number[];
  /** Narrowest gap the tool has to fit through (slot, notch, non-round hole), mm; null = none. */
  minGap: number | null;
  /** Thinnest strip of material, mm. */
  minWeb: number | null;
}

export interface FabDesign {
  id: string;
  name: string;
  url: string;
  document_id: string | null;
  wvm: "w" | "v" | "m" | null;
  wvm_id: string | null;
  element_id: string | null;
  element_type: "assembly" | "partstudio" | null;
  copies: number;
  last_synced_at: string | null;
  sync_note: string;
  archived: boolean;
  /** the bot this design is ("Aimbot"); synced parts get it */
  bot: string;
  created_at: string;
}

export interface FabPart {
  id: string;
  design_id: string | null;
  onshape_key: string | null;
  source: PartSource | null;
  name: string;
  part_number: string;
  description: string;
  kind: PartKind;
  status: JobStatus;
  status_changed_at: string;
  // the tracker sheet's columns
  bot: string;
  subsystem: string;
  /** #0 = most urgent */
  priority: number | null;
  spare_qty: number;
  stock_dims: string;
  length_text: string;
  tapped: string;
  machine: string;
  infill: string;
  designer: string;
  /** a file name or a Drive / Onshape link, as on the sheet */
  file: string;
  linear_url: string;
  quantity: number;
  cut_qty: number;
  material_id: string | null;
  material_locked: boolean;
  material_text: string;
  size_l_mm: number | null;
  size_w_mm: number | null;
  size_t_mm: number | null;
  geometry: PartGeometry | null;
  properties: Record<string, string>;
  assignees: string[];
  notes: string;
  missing: boolean;
  created_at: string;
  updated_at: string;
}

export type PartFileKind = "dxf" | "step" | "stl" | "pdf" | "image" | "other";
export interface FabPartFile {
  id: string;
  part_id: string;
  kind: PartFileKind;
  name: string;
  path: string;
  size_bytes: number | null;
  source: "onshape" | "upload";
  created_at: string;
}

export function fileKind(name: string): PartFileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "dxf") return "dxf";
  if (["step", "stp"].includes(ext)) return "step";
  if (ext === "stl" || ext === "3mf") return "stl";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return "image";
  return "other";
}

export type PartEventType = "import" | "stage" | "assign" | "file" | "cut" | "edit";
export interface FabPartEvent {
  id: string;
  part_id: string;
  type: PartEventType;
  data: Record<string, unknown>;
  occurred_at: string;
}

export type MachineProcess = "router" | "laser" | "waterjet" | "mill" | "lathe" | "saw" | "printer";
export const MACHINE_PROCESSES: MachineProcess[] = ["router", "laser", "waterjet", "mill", "lathe", "saw", "printer"];
export const PROCESS_LABEL: Record<MachineProcess, string> = {
  router: "CNC router",
  laser: "Laser cutter",
  waterjet: "Waterjet",
  mill: "Mill",
  lathe: "Lathe",
  saw: "Saw",
  printer: "3D printer",
};
export interface FabMachine {
  id: string;
  name: string;
  process: MachineProcess;
  bed_w_mm: number | null;
  bed_l_mm: number | null;
  max_thickness_mm: number | null;
  thickness_limits: string;
  tool_diameter_mm: number | null;
  min_hole_mm: number | null;
  min_web_mm: number | null;
  max_length_mm: number | null;
  max_diameter_mm: number | null;
  materials: string;
  active: boolean;
  notes: string;
  sort: number;
}

/** "stainless: 5, aluminum: 4" → the first limit whose name appears in the material. */
export function thicknessLimit(m: Pick<FabMachine, "max_thickness_mm" | "thickness_limits">, material: string): { mm: number | null; for: string | null } {
  const mat = material.toLowerCase();
  for (const part of m.thickness_limits.split(",")) {
    const [k, v] = part.split(":").map((x) => x.trim());
    const mm = Number(v);
    if (k && Number.isFinite(mm) && mm > 0 && new RegExp(`\\b${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(mat)) return { mm, for: k };
  }
  return { mm: m.max_thickness_mm, for: null };
}

/** Which machine fields matter for each process (drives the Machines form and the checks). */
export const PROCESS_FIELDS: Record<MachineProcess, (keyof FabMachine)[]> = {
  router: ["bed_w_mm", "bed_l_mm", "max_thickness_mm", "tool_diameter_mm", "min_hole_mm", "min_web_mm"],
  laser: ["bed_w_mm", "bed_l_mm", "max_thickness_mm", "tool_diameter_mm", "min_hole_mm", "min_web_mm"],
  waterjet: ["bed_w_mm", "bed_l_mm", "max_thickness_mm", "tool_diameter_mm", "min_hole_mm", "min_web_mm"],
  mill: ["bed_w_mm", "bed_l_mm", "max_thickness_mm"],
  lathe: ["max_length_mm", "max_diameter_mm"],
  saw: ["max_length_mm"],
  printer: ["bed_w_mm", "bed_l_mm", "max_thickness_mm"],
};
export const MACHINE_FIELD_LABEL: Partial<Record<keyof FabMachine, (p: MachineProcess) => string>> = {
  bed_w_mm: (p) => (p === "mill" ? "Y travel" : p === "printer" ? "Bed X" : "Bed width"),
  bed_l_mm: (p) => (p === "mill" ? "X travel" : p === "printer" ? "Bed Y" : "Bed length"),
  max_thickness_mm: (p) => (p === "printer" ? "Max height (Z)" : p === "mill" ? "Z clearance" : "Thickest sheet"),
  tool_diameter_mm: (p) => (p === "router" ? "Bit diameter" : "Kerf"),
  min_hole_mm: () => "Smallest hole",
  min_web_mm: () => "Thinnest web",
  max_length_mm: (p) => (p === "lathe" ? "Between centres" : "Longest stock"),
  max_diameter_mm: () => "Swing (max diameter)",
};

export interface PartsSettings {
  onshape_process_prop: string;
  onshape_require_prop: boolean;
  nest_gap_mm: number;
  nest_margin_mm: number;
}
export const DEFAULT_PARTS_SETTINGS: PartsSettings = {
  onshape_process_prop: "Process",
  onshape_require_prop: true,
  nest_gap_mm: 3.175,
  nest_margin_mm: 12.7,
};

// ── Classifying an Onshape part ──────────────────────────────────────────────

/** What a Process property value says, or null if it doesn't say anything we know. */
export function kindFromProcess(value: string): PartKind | "skip" | null {
  const v = value.toLowerCase();
  if (!v.trim()) return null;
  const has = (...w: string[]) => w.some((x) => v.includes(x));
  if (has("cots", "purchas", "buy", "bought", "vendor", "hardware", "off the shelf", "off-the-shelf", "n/a", "none", "skip", "don't make", "dont make", "do not make", "reference"))
    return "skip";
  if (has("print", "3d", "fdm", "additive", "sla")) return "print";
  if (has("mill")) return "machined";
  if (has("lathe", "shaft", "hex", "rod", "axle", "turn")) return "shaft";
  if (has("tube", "tubing", "saw", "angle", "channel", "extrusion", "bar")) return "tube";
  if (has("router", "cnc", "plate", "sheet", "laser", "xtool", "waterjet", "sendcutsend", "scs")) return "plate";
  if (has("machin", "drill", "manual")) return "machined";
  return null;
}

/**
 * Reference geometry that lives in a CAD model but never gets made: the
 * origin cube teams mate everything to, datums, envelopes, keep-outs.
 */
export function isReferenceBody(name: string): boolean {
  return /\borigin\b|\bdatum|\breference\b|placeholder|keep[- ]?out|\benvelope\b|mock[- ]?up|\bdummy\b/i.test(name);
}

/**
 * The team numbers every part it makes ("0201_Mounting_Plate": subsystem 02,
 * part 01); bought parts keep their vendor names ("Kraken X44", "40t Spur
 * Gear"). Without a Process property, that number is what says "we make this".
 */
export const hasPartNumber = (name: string) => /^\d{3,5}[_\-. ]/.test(name.trim());

/** Laser vs router etc. when the Process property names one. */
export function processHint(value: string | undefined): MachineProcess | null {
  const v = (value ?? "").toLowerCase();
  if (/laser|xtool/.test(v)) return "laser";
  if (/waterjet|sendcutsend|scs/.test(v)) return "waterjet";
  if (/router|cnc/.test(v)) return "router";
  return null;
}

const FILAMENT = /\b(pla|petg|abs|asa|tpu|onyx|pa\d*|pa-?cf|nylon\s*(x|12|cf|filament)|filament|resin|pc-?cf|cf-?nylon)\b|3d[\s-]*print|\bprinted\b/i;

/** Onshape material that means "we print this" ("3D Printed", "PLA", "PETG-CF"). */
export const isPrintedMaterial = (material: string) => FILAMENT.test(material);

export interface ShapeFacts {
  /** sorted bounding dims, mm: l ≥ w ≥ t */
  l: number;
  w: number;
  t: number;
  /** a flat part: two big parallel faces `t` apart */
  flat: boolean;
  /** cross-section of a long part, when the end face was found */
  profile?: "round" | "hex" | "rect" | "other";
  hollow?: boolean;
}

/** Best guess at a part's kind when there's no Process property. */
export function guessKind(name: string, material: string, s: ShapeFacts | null): PartKind {
  const n = name.toLowerCase();
  if (FILAMENT.test(material)) return "print";
  if (/\b(tube|tubing|rail|extrusion)\b/.test(n)) return "tube";
  if (/\b(shaft|axle|hex|standoff)\b/.test(n)) return "shaft";
  if (/\b(plate|gusset|bracket|panel|sheet)\b/.test(n) && (!s || s.t <= 25.4)) return "plate";
  if (!s) return "machined";
  if (s.flat && s.t <= 25.4 && s.w >= 3 * s.t) return "plate";
  if (s.l >= 4 * s.w) {
    if (s.profile === "round" || s.profile === "hex") return s.hollow && s.profile === "round" ? "tube" : "shaft";
    return "tube";
  }
  return "machined";
}

// ── Matching to inventory ────────────────────────────────────────────────────

const SYN: [RegExp, string][] = [
  [/\b(aluminum|aluminium|alu|al)\b/g, "aluminum"],
  [/\b(polycarbonate|polycarb|lexan|pc)\b/g, "polycarbonate"],
  [/\b(delrin|acetal|pom)\b/g, "acetal"],
  [/\b(uhmw|uhmw-?pe)\b/g, "uhmw"],
  [/\b(stainless|ss|304|316)\b/g, "stainless"],
  [/\b(carbon\s*fiber|carbon\s*fibre|cf)\b/g, "carbonfiber"],
  [/\b(plywood|ply|birch)\b/g, "plywood"],
  [/\b(garolite|g-?10|fr-?4)\b/g, "garolite"],
];
const GRADE = /\b(6061|7075|6063|5052|2024|1018|4140|1045)\b/;

function tokens(s: string): Set<string> {
  let t = s.toLowerCase().replace(/[-_/,()]/g, " ");
  for (const [re, to] of SYN) t = t.replace(re, ` ${to} `);
  return new Set(t.split(/\s+/).filter((w) => w.length > 1 && !["mm", "in", "t", "stock"].includes(w)));
}

/** 0 = different stuff, higher = better. Grades (6061 vs 7075) must agree when both say one. */
export function materialScore(onshape: string, ours: string): number {
  if (!onshape.trim()) return 0;
  const ga = GRADE.exec(onshape)?.[1];
  const gb = GRADE.exec(ours)?.[1];
  if (ga && gb && ga !== gb) return 0;
  const a = tokens(onshape);
  const b = tokens(ours);
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  // "Aluminum - 6061" vs "6061 Al": the base metal is what really matters
  return n;
}

const near = (a: number | null | undefined, b: number, tol: number) => a !== null && a !== undefined && Math.abs(a - b) <= tol;

/** Which of our shapes a kind of part is cut from. */
const KIND_SHAPES: Partial<Record<PartKind, FabShape[]>> = {
  plate: ["sheet"],
  tube: ["box_tube", "round_tube", "flat_bar", "angle", "channel"],
  shaft: ["hex_shaft", "round_rod"],
};

/**
 * The inventory material a part is cut from: same stuff (by name), right shape
 * for the kind, and the right size — sheet thickness, tube profile, or the
 * smallest rod/hex that covers the part.
 */
export function matchMaterial(
  part: Pick<FabPart, "kind" | "material_text" | "size_l_mm" | "size_w_mm" | "size_t_mm">,
  materials: FabMaterial[],
): FabMaterial | null {
  const shapes = KIND_SHAPES[part.kind];
  if (!shapes) return null;
  const w = part.size_w_mm;
  const t = part.size_t_mm;
  let best: { m: FabMaterial; score: number; slack: number } | null = null;
  for (const m of materials) {
    if (m.archived || !shapes.includes(m.shape)) continue;
    const score = materialScore(part.material_text, m.material);
    if (part.material_text && score === 0) continue;
    let slack: number | null = null;
    switch (m.shape) {
      case "sheet":
        if (t !== null && near(m.wall_mm, t, Math.max(0.2, t * 0.05))) slack = Math.abs((m.wall_mm ?? 0) - t);
        break;
      case "box_tube":
      case "channel":
      case "angle":
        if (w !== null && t !== null) {
          const a = m.dim_a_mm ?? 0;
          const b = m.dim_b_mm ?? 0;
          if ((near(a, w, 0.6) && near(b, t, 0.6)) || (near(a, t, 0.6) && near(b, w, 0.6))) slack = Math.abs(a + b - w - t);
        }
        break;
      case "flat_bar":
        if (w !== null && t !== null && near(m.dim_a_mm, w, 0.6) && near(m.wall_mm, t, 0.3)) slack = 0;
        break;
      case "round_tube":
        if (w !== null && near(m.dim_a_mm, w, 0.6)) slack = 0;
        break;
      case "round_rod":
      case "hex_shaft":
        // lathe work starts from stock at least as big as the part's cross-section
        if (t !== null && (m.dim_a_mm ?? 0) >= t - 0.3) slack = (m.dim_a_mm ?? 0) - t;
        break;
    }
    if (slack === null) continue;
    if (!best || score > best.score || (score === best.score && slack < best.slack)) best = { m, score, slack };
  }
  return best?.m ?? null;
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Everything to make: per-robot quantity × robots, plus spares. */
export function needed(p: Pick<FabPart, "quantity" | "spare_qty">, copies = 1): number {
  return p.quantity * copies + (p.spare_qty ?? 0);
}

/** How many copies are still to be cut. */
export function toCut(p: Pick<FabPart, "quantity" | "spare_qty" | "cut_qty">, copies = 1): number {
  return Math.max(0, needed(p, copies) - p.cut_qty);
}

// ── Reading the sheet's text columns ─────────────────────────────────────────

/** Kind from the sheet's "Stock Material/Type" (and which tracker it was on). */
export function kindFromMaterial(material: string, tracker: Tracker = "machining"): PartKind {
  if (tracker === "print") return "print";
  const m = material.toLowerCase();
  if (/sheet|plate|birch|plywood|srpp|\bcf\b|carbon/.test(m)) return "plate";
  if (/rod|hex|shaft|spline/.test(m)) return "shaft";
  if (/tube|maxtube|bracket|angle|channel|nutstrip|\bbar\b/.test(m)) return "tube";
  return "machined";
}

/**
 * Sizes a sheet row implies, in mm: thickness from '1/8" thick', a diameter
 * from '1/2 diam shaft', a profile from "Box Tube 2x1", length from the
 * Length column. Blank where the text doesn't say.
 */
export function sizesFromText(material: string, stockDims: string, lengthText: string): { l: number | null; w: number | null; t: number | null } {
  const inch = (s: string) => parseLength(s.replace(/["”]/g, "").trim(), "in");
  let w: number | null = null;
  let t: number | null = null;
  const thick = /([\d./\s-]+)\s*(?:"|in|mm)?\s*(?:thick|thk)/i.exec(stockDims);
  if (thick) t = inch(thick[1]);
  const dia = /([\d./\s-]+)\s*(?:"|in)?\s*(?:diam|dia|od)\b/i.exec(stockDims);
  if (dia) w = t = inch(dia[1]);
  const prof = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(material) ?? /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(stockDims);
  if (prof && !thick) {
    const a = Number(prof[1]) * 25.4;
    const b = Number(prof[2]) * 25.4;
    w = Math.max(a, b);
    t = Math.min(a, b);
  }
  const l = lengthText.trim() ? parseLength(lengthText.replace(/[”]/g, '"').trim(), "in") : null;
  return { l, w, t };
}

/** Initials for an assignee chip. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts.at(-1)![0]).toUpperCase();
}

/** A stable colour per person so the same name reads the same everywhere. */
export function personHue(name: string): number {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export const PERSON_COOKIE = "fab_person";
