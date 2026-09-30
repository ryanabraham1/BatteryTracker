/**
 * Manufacturability checks ("can our tools actually make this part?"),
 * SendCutSend style: measure the part once, then hold it up against every
 * machine that could make it. A machine limit nobody has filled in yet is
 * reported as "not checked" — never guessed.
 */
import { fmtLength, type Units } from "./units";
import { arcInfo, asCircle, loopArea, loopPoints, outline, pointInPoly, type Geometry, type Loop, type Pt, type Seg } from "./geom";
import type { FabMaterial } from "./fab";
import {
  KIND_LABEL,
  PROCESS_LABEL,
  processHint,
  thicknessLimit,
  type FabMachine,
  type FabPart,
  type GeomStats,
  type MachineProcess,
  type PartGeometry,
  type PartKind,
} from "./parts";

// ── Measuring an outline ─────────────────────────────────────────────────────

/** Unit tangent leaving a segment's start (t=0) or arriving at its end (t=1). */
function tangent(s: Seg, atEnd: boolean): Pt {
  const arc = arcInfo(s);
  if (!arc) {
    const d = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
    return [(s.b[0] - s.a[0]) / d, (s.b[1] - s.a[1]) / d];
  }
  const p = atEnd ? s.b : s.a;
  // radius vector rotated ±90° by the arc's direction
  const rx = (p[0] - arc.c[0]) / arc.r;
  const ry = (p[1] - arc.c[1]) / arc.r;
  return arc.sweep > 0 ? [-ry, rx] : [ry, -rx];
}

/** Segments of all loops as straight pieces, with an inward (into material) normal. */
interface Edge {
  a: Pt;
  b: Pt;
  loop: number;
}

function edgesOf(loops: Loop[], tol: number): Edge[] {
  const out: Edge[] = [];
  loops.forEach((l, li) => {
    const pts = loopPoints(l, tol);
    for (let i = 0; i < pts.length; i++) out.push({ a: pts[i], b: pts[(i + 1) % pts.length], loop: li });
  });
  return out;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Distance along ray p + t·d to the first edge hit (t > eps), or null. */
function castRay(p: Pt, d: Pt, edges: Edge[], skip: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < edges.length; i++) {
    if (i === skip) continue;
    const e = edges[i];
    const ex = e.b[0] - e.a[0];
    const ey = e.b[1] - e.a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = e.a[0] - p[0];
    const wy = e.a[1] - p[1];
    const t = (wx * ey - wy * ex) / den;
    const u = (wx * d[1] - wy * d[0]) / den;
    if (t > 0.01 && u >= -1e-9 && u <= 1 + 1e-9 && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * Holes, inside corners, and the narrowest slot / thinnest web. Slots and
 * webs are found by casting a ray from each edge sample straight out of (gap)
 * and into (web) the material and seeing how soon it hits another edge.
 */
export function measure(outer: Loop, holes: Loop[]): GeomStats {
  const loops = [outer, ...holes];
  const circles = holes.map(asCircle);
  const holeDia = circles.filter((c) => c !== null).map((c) => c!.d);

  let sharpInside = 0;
  const insideRadii: number[] = [];
  const sharpPts: Pt[] = [];
  loops.forEach((l, li) => {
    if (li > 0 && circles[li - 1]) return; // round holes are judged as holes
    const n = l.segs.length;
    for (let i = 0; i < n; i++) {
      const s = l.segs[i];
      // material on the left: a clockwise arc wraps around empty space → an inside radius
      const arc = arcInfo(s);
      if (arc && arc.sweep < 0) insideRadii.push(arc.r);
      const next = l.segs[(i + 1) % n];
      const t1 = tangent(s, true);
      const t2 = tangent(next, false);
      const cross = t1[0] * t2[1] - t1[1] * t2[0];
      const dot = t1[0] * t2[0] + t1[1] * t2[1];
      // a right turn of more than ~10° with material on the left is a sharp inside corner
      if (cross < 0 && Math.atan2(-cross, dot) > (10 * Math.PI) / 180) {
        sharpInside++;
        sharpPts.push(s.b);
      }
    }
  });

  // Sample edges, capped so a detailed part stays quick to check.
  const perim = loops.reduce((s, l) => s + loopPoints(l, 0.5).reduce((acc, p, i, arr) => acc + Math.hypot(arr[(i + 1) % arr.length][0] - p[0], arr[(i + 1) % arr.length][1] - p[1]), 0), 0);
  const tol = Math.max(0.1, Math.min(2, perim / 3000));
  const edges = edgesOf(
    loops.filter((_, li) => li === 0 || !circles[li - 1]).concat(holes.filter((_, i) => circles[i])),
    tol,
  );
  const circleLoop = new Set<number>();
  // loops after the non-round ones are the round holes (appended last)
  const nonRound = 1 + holes.filter((_, i) => !circles[i]).length;
  for (let li = nonRound; li < loops.length; li++) circleLoop.add(li);

  const step = Math.max(1, Math.floor(edges.length / 1200));
  let minGap: number | null = null;
  let minWeb: number | null = null;
  const nearSharp = (p: Pt) => sharpPts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 3);
  for (let i = 0; i < edges.length; i += step) {
    const e = edges[i];
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (len < 1e-6) continue;
    const mid: Pt = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    // left normal points into material
    const nIn: Pt = [-(e.b[1] - e.a[1]) / len, (e.b[0] - e.a[0]) / len];
    const web = castRay(mid, nIn, edges, i);
    if (web !== null && (minWeb === null || web < minWeb)) minWeb = web;
    if (circleLoop.has(e.loop) || nearSharp(mid)) continue;
    const gap = castRay(mid, [-nIn[0], -nIn[1]], edges, i);
    if (gap !== null && (minGap === null || gap < minGap)) minGap = gap;
  }
  // Round holes: the web to every other edge is exact from the centre.
  const round = holes.map(asCircle).filter((c) => c !== null);
  round.forEach((c, k) => {
    const own = nonRound + k;
    for (const e of edges) {
      if (e.loop === own) continue;
      const web = segDist(c!.c, e.a, e.b) - c!.d / 2;
      if (web > 0 && (minWeb === null || web < minWeb)) minWeb = web;
    }
  });
  return { holes: holeDia, sharpInside, insideRadii, minGap, minWeb };
}

/** Normalise raw geometry (from DXF or Onshape) into what a part stores. */
export function toPartGeometry(g: Geometry, from: PartGeometry["from"], extra: { approx?: boolean; open?: number } = {}): PartGeometry | null {
  const o = outline(g);
  if (!o) return null;
  return {
    loops: [o.outer, ...o.holes],
    width: o.width,
    height: o.height,
    area: o.area,
    from,
    approx: extra.approx || undefined,
    open: extra.open || undefined,
    stray: o.stray.length || undefined,
    stats: measure(o.outer, o.holes),
  };
}

/** The part's outline area check helper for callers that only have loops. */
export const netArea = (loops: Loop[]) => loops.reduce((s, l) => s + loopArea(l), 0);
export { pointInPoly };

// ── Checking against machines ────────────────────────────────────────────────

export type Level = "ok" | "info" | "warn" | "fail";
export interface Issue {
  level: Level;
  text: string;
}
export interface MachineCheck {
  machine: FabMachine;
  level: Level;
  issues: Issue[];
}
export interface DfmResult {
  /** Overall: ok if at least one machine can make it with no warnings. */
  level: Level;
  /** Machine-independent notes (missing outline, stray shapes…). */
  notes: Issue[];
  checks: MachineCheck[];
  /** The machine to use (fewest problems; the one the Process property names wins ties). */
  best: MachineCheck | null;
  /** Limits that weren't filled in, so weren't checked. */
  unchecked: number;
}

const RANK: Record<Level, number> = { ok: 0, info: 1, warn: 2, fail: 3 };
const worst = (issues: Issue[]): Level => issues.reduce<Level>((w, i) => (RANK[i.level] > RANK[w] ? i.level : w), "ok");

const KIND_PROCESSES: Record<PartKind, MachineProcess[]> = {
  plate: ["router", "laser", "waterjet"],
  tube: ["saw"],
  shaft: ["lathe"],
  print: ["printer"],
  machined: ["mill"],
};

/** Materials a laser must never be pointed at, whatever the machine's list says. */
const LASER_NO: [RegExp, string][] = [
  [/\b(pvc|vinyl)\b/i, "PVC/vinyl gives off chlorine gas under a laser — never laser it"],
  [/\bpolycarb|lexan\b/i, "Polycarbonate melts and burns under a laser instead of cutting — route it"],
  [/\b(hdpe|uhmw|polyethylene)\b/i, "HDPE/UHMW melts and catches fire under a laser — route it"],
];

function materialOk(machine: FabMachine, material: string): Issue | null {
  if (!material.trim()) return { level: "info", text: "No material set — couldn't check it's allowed" };
  if (machine.process === "laser") {
    for (const [re, text] of LASER_NO) if (re.test(material)) return { level: "fail", text };
  }
  const allowed = machine.materials
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return null;
  const m = material.toLowerCase();
  return allowed.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(m))
    ? null
    : { level: "fail", text: `${machine.name} isn't set up for ${material}` };
}

function fitsRect(w: number, l: number, bw: number, bl: number): boolean {
  return (w <= bw + 0.01 && l <= bl + 0.01) || (w <= bl + 0.01 && l <= bw + 0.01);
}

export interface DfmInput {
  part: Pick<FabPart, "kind" | "material_text" | "size_l_mm" | "size_w_mm" | "size_t_mm" | "geometry" | "properties">;
  material: FabMaterial | null;
  machines: FabMachine[];
  processProp: string;
  units: Units;
}

export function checkPart({ part, material, machines, processProp, units }: DfmInput): DfmResult {
  const L = (mm: number) => fmtLength(mm, units);
  const notes: Issue[] = [];
  const g = part.geometry;
  const matName = [part.material_text, material?.material].filter(Boolean).join(" ");
  // sheet thickness: what we'd cut it from beats the model's bounding box
  const thick = material?.shape === "sheet" && material.wall_mm ? material.wall_mm : part.size_t_mm;

  if (part.kind === "plate") {
    if (!g) notes.push({ level: "warn", text: "No outline yet — upload a DXF (or sync from Onshape) to check holes, corners and slots" });
    else {
      if (g.approx) notes.push({ level: "info", text: "Curves were approximated with straight segments" });
      if (g.open) notes.push({ level: "warn", text: `${g.open} open end${g.open > 1 ? "s" : ""} in the drawing were ignored — check the DXF is closed` });
      if (g.stray) notes.push({ level: "warn", text: `${g.stray} shape${g.stray > 1 ? "s" : ""} outside the outline were ignored` });
    }
    if (thick === null) notes.push({ level: "info", text: "Thickness unknown" });
  }

  const hint = processHint(part.properties?.[processProp]);
  const procs = KIND_PROCESSES[part.kind];
  const candidates = machines.filter((m) => m.active && procs.includes(m.process));
  let unchecked = 0;
  const unset = (issues: Issue[], what: string) => {
    unchecked++;
    issues.push({ level: "info", text: `${what} not set on this machine — not checked` });
  };

  const checks: MachineCheck[] = candidates.map((m) => {
    const issues: Issue[] = [];
    const mat = materialOk(m, matName);
    if (mat) issues.push(mat);

    switch (m.process) {
      case "router":
      case "laser":
      case "waterjet": {
        const router = m.process === "router";
        const lim = thicknessLimit(m, matName);
        if (lim.mm === null) unset(issues, "Thickest sheet");
        else if (thick !== null && thick > lim.mm + 0.01)
          issues.push({ level: "fail", text: `${L(thick)} is thicker than ${m.name} cuts${lim.for ? ` in ${lim.for}` : ""} (${L(lim.mm)})` });
        const w = g?.width ?? part.size_w_mm;
        const l = g?.height ?? part.size_l_mm;
        if (m.bed_w_mm === null || m.bed_l_mm === null) unset(issues, "Bed size");
        else if (w !== null && l !== null && !fitsRect(w, l, m.bed_w_mm, m.bed_l_mm))
          issues.push({ level: "fail", text: `${L(Math.min(w, l))} × ${L(Math.max(w, l))} doesn't fit the ${L(m.bed_w_mm)} × ${L(m.bed_l_mm)} bed` });
        if (!g) break;
        const s = g.stats;
        const tool = m.tool_diameter_mm;
        const minHole = m.min_hole_mm ?? (router ? tool : null);
        if (minHole === null) unset(issues, router ? "Bit diameter" : "Smallest hole");
        else {
          const tiny = s.holes.filter((d) => d < minHole - 0.01);
          if (tiny.length) {
            const small = Math.min(...tiny);
            issues.push(
              router
                ? { level: "warn", text: `${tiny.length} hole${tiny.length > 1 ? "s" : ""} smaller than the bit (${L(small)} < ${L(minHole)}) — spot them and drill by hand` }
                : { level: "fail", text: `${tiny.length} hole${tiny.length > 1 ? "s" : ""} under ${L(minHole)} (smallest ${L(small)})` },
            );
          }
          // laser/waterjet rule of thumb: holes under half the thickness don't come out clean
          if (!router && thick !== null) {
            const thin = s.holes.filter((d) => d >= minHole && d < thick * 0.5);
            if (thin.length) issues.push({ level: "warn", text: `${thin.length} hole${thin.length > 1 ? "s" : ""} smaller than half the thickness — may not cut clean` });
          }
        }
        if (router) {
          if (tool === null) unset(issues, "Bit diameter");
          else {
            const r = tool / 2;
            if (s.sharpInside)
              issues.push({ level: "warn", text: `${s.sharpInside} sharp inside corner${s.sharpInside > 1 ? "s" : ""} will come out with a ${L(r)} radius — add dogbones or fillets where something square fits` });
            const tight = s.insideRadii.filter((x) => x < r - 0.01);
            if (tight.length)
              issues.push({ level: "warn", text: `${tight.length} inside radi${tight.length > 1 ? "i" : "us"} tighter than the bit (${L(Math.min(...tight))} < ${L(r)})` });
            if (s.minGap !== null && s.minGap < tool - 0.01)
              issues.push({ level: "fail", text: `A slot/gap is ${L(s.minGap)} wide — the ${L(tool)} bit can't fit in it` });
          }
        } else if (tool !== null && s.minGap !== null && s.minGap < tool * 2) {
          issues.push({ level: "warn", text: `A slot/gap is only ${L(s.minGap)} — close to the ${L(tool)} kerf` });
        }
        if (m.min_web_mm === null) unset(issues, "Thinnest web");
        else if (s.minWeb !== null && s.minWeb < m.min_web_mm - 0.01)
          issues.push({ level: s.minWeb < m.min_web_mm / 2 ? "fail" : "warn", text: `Thinnest strip of material is ${L(s.minWeb)} (machine minimum ${L(m.min_web_mm)})` });
        if (router && tool !== null && w !== null && l !== null && Math.min(w, l) < Math.max(25.4, tool * 6))
          issues.push({ level: "info", text: "Small part — tab it or it can fly loose at the end of the cut" });
        break;
      }
      case "saw": {
        const len = part.size_l_mm;
        if (m.max_length_mm === null) unset(issues, "Longest stock");
        else if (len !== null && len > m.max_length_mm) issues.push({ level: "fail", text: `${L(len)} is longer than ${m.name} takes (${L(m.max_length_mm)})` });
        if (!material) issues.push({ level: "warn", text: "No tube/bar in inventory matches this profile" });
        break;
      }
      case "lathe": {
        const len = part.size_l_mm;
        const dia = material?.dim_a_mm ?? part.size_w_mm;
        if (m.max_length_mm === null) unset(issues, "Length between centres");
        else if (len !== null && len > m.max_length_mm) issues.push({ level: "fail", text: `${L(len)} is longer than fits between centres (${L(m.max_length_mm)})` });
        if (m.max_diameter_mm === null) unset(issues, "Swing");
        else if (dia !== null && dia > m.max_diameter_mm) issues.push({ level: "fail", text: `${L(dia)} stock is bigger than the swing (${L(m.max_diameter_mm)})` });
        if (!material) issues.push({ level: "warn", text: "No rod/hex in inventory is big enough" });
        break;
      }
      case "mill":
      case "printer": {
        const dims = [part.size_l_mm, part.size_w_mm, part.size_t_mm];
        if (dims.some((d) => d === null)) {
          issues.push({ level: "info", text: "Part size unknown" });
          break;
        }
        const [l, w, t] = dims as number[];
        if (m.bed_w_mm === null || m.bed_l_mm === null) unset(issues, m.process === "mill" ? "X/Y travel" : "Bed size");
        else if (!fitsRect(w, l, m.bed_w_mm, m.bed_l_mm) && !(m.max_thickness_mm !== null && (fitsRect(t, l, m.bed_w_mm, m.bed_l_mm) && w <= m.max_thickness_mm)))
          issues.push({ level: "fail", text: `${L(l)} × ${L(w)} doesn't fit the ${L(m.bed_w_mm)} × ${L(m.bed_l_mm)} ${m.process === "mill" ? "travel" : "bed"}` });
        if (m.max_thickness_mm === null) unset(issues, m.process === "mill" ? "Z clearance" : "Max height");
        else if (t > m.max_thickness_mm) issues.push({ level: "fail", text: `${L(t)} tall is more than ${L(m.max_thickness_mm)}` });
        break;
      }
    }
    return { machine: m, level: worst(issues), issues };
  });

  if (!candidates.length) {
    const names = procs.map((p) => PROCESS_LABEL[p].toLowerCase()).join(" or ");
    notes.push({ level: "fail", text: `No ${names} set up for ${KIND_LABEL[part.kind].toLowerCase()} parts — add one in Machines` });
  }

  const sorted = [...checks].sort(
    (a, b) =>
      RANK[a.level] - RANK[b.level] ||
      Number(b.machine.process === hint) - Number(a.machine.process === hint) ||
      a.issues.filter((i) => i.level !== "ok").length - b.issues.filter((i) => i.level !== "ok").length,
  );
  const best = sorted[0] ?? null;
  const level = worst([...notes, ...(best ? [{ level: best.level, text: "" }] : [])]);
  return { level, notes, checks: sorted, best, unchecked: best ? best.issues.filter((i) => i.text.endsWith("not checked")).length : unchecked };
}

export const LEVEL_TONE: Record<Level, "good" | "muted" | "warn" | "bad"> = { ok: "good", info: "muted", warn: "warn", fail: "bad" };
export const LEVEL_LABEL: Record<Level, string> = { ok: "Makeable", info: "Makeable", warn: "Check", fail: "Can't make" };
