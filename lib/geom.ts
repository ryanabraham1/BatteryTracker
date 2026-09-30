/**
 * 2D part outlines for sheet parts: read from DXF, checked for DFM, nested and
 * written back out as DXF. Everything is millimetres, y up.
 *
 * A loop is a closed chain of segments; each segment is a line (bulge 0) or an
 * arc in DXF "bulge" form (tan of a quarter of the included angle, positive =
 * counter-clockwise), so arcs survive the round trip exactly.
 */

export type Pt = [number, number];
export interface Seg {
  a: Pt;
  b: Pt;
  bulge: number;
}
export interface Loop {
  segs: Seg[];
}
export interface Geometry {
  loops: Loop[];
}
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EPS = 0.02; // mm: endpoints closer than this are the same point

export const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ── Arcs ─────────────────────────────────────────────────────────────────────

/** Centre, radius and signed sweep (rad, + = CCW) of an arc segment. */
export function arcInfo(s: Seg): { c: Pt; r: number; sweep: number; start: number } | null {
  if (!s.bulge) return null;
  const sweep = 4 * Math.atan(s.bulge);
  const chord = dist(s.a, s.b);
  if (chord < 1e-9) return null;
  const r = chord / (2 * Math.abs(Math.sin(sweep / 2)));
  // centre sits on the chord's perpendicular bisector
  const mx = (s.a[0] + s.b[0]) / 2;
  const my = (s.a[1] + s.b[1]) / 2;
  const h = r * Math.cos(sweep / 2); // signed distance mid → centre
  const ux = (s.b[0] - s.a[0]) / chord;
  const uy = (s.b[1] - s.a[1]) / chord;
  // left normal of the chord; a CCW arc (bulge > 0) has its centre to the left
  const c: Pt = [mx - uy * h * Math.sign(s.bulge), my + ux * h * Math.sign(s.bulge)];
  const start = Math.atan2(s.a[1] - c[1], s.a[0] - c[0]);
  return { c, r, sweep, start };
}

/** Bulge for an arc sweeping `sweep` radians. */
const bulgeOf = (sweep: number) => Math.tan(sweep / 4);

/** Points along a segment (excluding its end point), chord error ≈ `tol` mm. */
export function sampleSeg(s: Seg, tol = 0.25): Pt[] {
  const arc = arcInfo(s);
  if (!arc) return [s.a];
  const step = Math.max(0.05, 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / Math.max(arc.r, tol)))));
  const n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / step));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = arc.start + (arc.sweep * i) / n;
    out.push([arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)]);
  }
  return out;
}

export function loopPoints(l: Loop, tol = 0.25): Pt[] {
  return l.segs.flatMap((s) => sampleSeg(s, tol));
}

/** Signed area (+ = counter-clockwise), arcs included exactly. */
export function loopArea(l: Loop): number {
  let a = 0;
  for (const s of l.segs) {
    a += (s.a[0] * s.b[1] - s.b[0] * s.a[1]) / 2;
    const arc = arcInfo(s);
    if (arc) a += (arc.r * arc.r * (arc.sweep - Math.sin(arc.sweep))) / 2;
  }
  return a;
}

export function reverseLoop(l: Loop): Loop {
  return { segs: [...l.segs].reverse().map((s) => ({ a: s.b, b: s.a, bulge: -s.bulge })) };
}

export function bboxOf(pts: Pt[]): BBox {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of pts) {
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  }
  return b;
}

export function geomBBox(g: Geometry): BBox {
  return bboxOf(g.loops.flatMap((l) => loopPoints(l, 0.5)));
}

/** Is this loop a plain circle? Returns its centre + diameter. */
export function asCircle(l: Loop): { c: Pt; d: number } | null {
  if (!l.segs.length || l.segs.some((s) => !s.bulge)) return null;
  const infos = l.segs.map(arcInfo);
  if (infos.some((i) => !i)) return null;
  const first = infos[0]!;
  for (const i of infos) if (Math.abs(i!.r - first.r) > 0.01 || dist(i!.c, first.c) > 0.01) return null;
  return { c: first.c, d: first.r * 2 };
}

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ── Normalising a part ───────────────────────────────────────────────────────

export interface Outline {
  /** The outside edge, counter-clockwise. */
  outer: Loop;
  /** Holes and cutouts, clockwise (so material is always on the left). */
  holes: Loop[];
  /** Loose loops outside the outer edge — probably a second part or stray sketch. */
  stray: Loop[];
  /** Outer bounding box before normalising. */
  bbox: BBox;
  width: number;
  height: number;
  /** Net area (outer − holes), mm². */
  area: number;
}

/**
 * Pick the outer loop (largest area), orient everything so material is on the
 * left, and shift the part so its bounding box starts at the origin.
 */
export function outline(g: Geometry): Outline | null {
  const loops = g.loops.filter((l) => l.segs.length > 0 && Math.abs(loopArea(l)) > 0.01);
  if (!loops.length) return null;
  const sorted = [...loops].sort((a, b) => Math.abs(loopArea(b)) - Math.abs(loopArea(a)));
  let outer = sorted[0];
  if (loopArea(outer) < 0) outer = reverseLoop(outer);
  const outerPts = loopPoints(outer, 0.5);
  const bbox = bboxOf(outerPts);
  const holes: Loop[] = [];
  const stray: Loop[] = [];
  for (const l of sorted.slice(1)) {
    const p = l.segs[0].a;
    if (pointInPoly(p, outerPts)) holes.push(loopArea(l) > 0 ? reverseLoop(l) : l);
    else stray.push(l);
  }
  const shift = (l: Loop): Loop => ({
    segs: l.segs.map((s) => ({ a: [s.a[0] - bbox.minX, s.a[1] - bbox.minY], b: [s.b[0] - bbox.minX, s.b[1] - bbox.minY], bulge: s.bulge })),
  });
  const area = loopArea(outer) + holes.reduce((s, h) => s + loopArea(h), 0);
  return {
    outer: shift(outer),
    holes: holes.map(shift),
    stray: stray.map(shift),
    bbox,
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
    area,
  };
}

// ── Placing ──────────────────────────────────────────────────────────────────

/** Rotate a normalised outline 90° CCW about the origin and shift it back to x ≥ 0. */
function rot90(p: Pt, h: number): Pt {
  return [h - p[1], p[0]];
}

export function transformLoop(l: Loop, rotated: boolean, h: number, dx: number, dy: number): Loop {
  const t = (p: Pt): Pt => {
    const q = rotated ? rot90(p, h) : p;
    return [q[0] + dx, q[1] + dy];
  };
  return { segs: l.segs.map((s) => ({ a: t(s.a), b: t(s.b), bulge: s.bulge })) };
}

// ── SVG ──────────────────────────────────────────────────────────────────────

/** SVG path for loops in y-up space; render it inside `scale(1,-1)`. */
export function svgPath(loops: Loop[]): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  return loops
    .map((l) => {
      if (!l.segs.length) return "";
      let d = `M${f(l.segs[0].a[0])} ${f(l.segs[0].a[1])}`;
      for (const s of l.segs) {
        const arc = arcInfo(s);
        if (!arc) d += `L${f(s.b[0])} ${f(s.b[1])}`;
        else {
          // a full circle as one segment can't be drawn as a single SVG arc; split it
          if (Math.abs(arc.sweep) > Math.PI * 1.999) {
            const mid: Pt = [arc.c[0] + arc.r * Math.cos(arc.start + arc.sweep / 2), arc.c[1] + arc.r * Math.sin(arc.start + arc.sweep / 2)];
            d += `A${f(arc.r)} ${f(arc.r)} 0 0 ${arc.sweep > 0 ? 1 : 0} ${f(mid[0])} ${f(mid[1])}`;
          }
          d += `A${f(arc.r)} ${f(arc.r)} 0 ${Math.abs(arc.sweep) > Math.PI && Math.abs(arc.sweep) < Math.PI * 1.999 ? 1 : 0} ${arc.sweep > 0 ? 1 : 0} ${f(s.b[0])} ${f(s.b[1])}`;
        }
      }
      return d + "Z";
    })
    .join("");
}

// ── DXF read ─────────────────────────────────────────────────────────────────

export interface DxfRead {
  geometry: Geometry;
  /** $INSUNITS: "in" / "mm" when the file says, else null. */
  units: "in" | "mm" | null;
  /** Open chains left over after joining (not closed shapes). */
  openChains: number;
  /** Entity types we skipped (TEXT, DIMENSION, …). */
  skipped: string[];
}

type Pair = [number, string];

function pairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) {
      i -= 1; // resync on stray blank lines
      continue;
    }
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

const INSUNITS: Record<string, "in" | "mm"> = { "1": "in", "4": "mm" };

/** Parse the geometry out of an ASCII DXF: LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE, SPLINE, ELLIPSE. */
export function readDxf(text: string): DxfRead {
  const p = pairs(text);
  let units: "in" | "mm" | null = null;
  for (let i = 0; i < p.length - 1; i++) {
    if (p[i][0] === 9 && p[i][1] === "$INSUNITS") {
      units = INSUNITS[p[i + 1][1]] ?? null;
      break;
    }
  }
  // entities section (blocks are ignored — Onshape exports flat geometry)
  let i = p.findIndex((x, k) => x[0] === 2 && x[1] === "ENTITIES" && p[k - 1]?.[1] === "SECTION");
  if (i < 0) i = 0;
  const segs: Seg[] = [];
  const closed: Loop[] = [];
  const skipped = new Set<string>();

  // group the section into entities
  const ents: Pair[][] = [];
  for (let k = i + 1; k < p.length; k++) {
    if (p[k][0] === 0) {
      if (p[k][1] === "ENDSEC") break;
      ents.push([p[k]]);
    } else ents.at(-1)?.push(p[k]);
  }

  const num = (e: Pair[], code: number, def = 0) => {
    const f = e.find((x) => x[0] === code);
    return f ? parseFloat(f[1]) : def;
  };
  const deg = (d: number) => (d * Math.PI) / 180;

  for (let k = 0; k < ents.length; k++) {
    const e = ents[k];
    const type = e[0][1];
    switch (type) {
      case "LINE": {
        const a: Pt = [num(e, 10), num(e, 20)];
        const b: Pt = [num(e, 11), num(e, 21)];
        if (dist(a, b) > 1e-6) segs.push({ a, b, bulge: 0 });
        break;
      }
      case "ARC": {
        const c: Pt = [num(e, 10), num(e, 20)];
        const r = num(e, 40);
        const a0 = deg(num(e, 50));
        const a1 = deg(num(e, 51));
        let sweep = a1 - a0;
        while (sweep <= 0) sweep += Math.PI * 2;
        // extrusion (0,0,-1): the arc's own x axis points the other way, which mirrors it
        const mx = num(e, 230, 1) < 0 ? -1 : 1;
        segs.push({
          a: [mx * (c[0] + r * Math.cos(a0)), c[1] + r * Math.sin(a0)],
          b: [mx * (c[0] + r * Math.cos(a1)), c[1] + r * Math.sin(a1)],
          bulge: mx * bulgeOf(sweep),
        });
        break;
      }
      case "CIRCLE": {
        const mirror = num(e, 230, 1) < 0;
        const c: Pt = [(mirror ? -1 : 1) * num(e, 10), num(e, 20)];
        const r = num(e, 40);
        closed.push({
          segs: [
            { a: [c[0] + r, c[1]], b: [c[0] - r, c[1]], bulge: 1 },
            { a: [c[0] - r, c[1]], b: [c[0] + r, c[1]], bulge: 1 },
          ],
        });
        break;
      }
      case "LWPOLYLINE": {
        const flags = num(e, 70);
        const verts: { p: Pt; bulge: number }[] = [];
        for (const [code, val] of e) {
          if (code === 10) verts.push({ p: [parseFloat(val), 0], bulge: 0 });
          else if (code === 20 && verts.length) verts.at(-1)!.p[1] = parseFloat(val);
          else if (code === 42 && verts.length) verts.at(-1)!.bulge = parseFloat(val);
        }
        pushPoly(verts, (flags & 1) === 1);
        break;
      }
      case "POLYLINE": {
        const flags = num(e, 70);
        const verts: { p: Pt; bulge: number }[] = [];
        while (k + 1 < ents.length && ents[k + 1][0][1] === "VERTEX") {
          k++;
          const v = ents[k];
          verts.push({ p: [num(v, 10), num(v, 20)], bulge: num(v, 42) });
        }
        if (ents[k + 1]?.[0][1] === "SEQEND") k++;
        pushPoly(verts, (flags & 1) === 1);
        break;
      }
      case "SPLINE": {
        // fit points if present, else control points: fine for outlines at shop tolerances
        const fit: Pt[] = [];
        const ctrl: Pt[] = [];
        for (let j = 0; j < e.length; j++) {
          if (e[j][0] === 11) fit.push([parseFloat(e[j][1]), 0]);
          else if (e[j][0] === 21 && fit.length) fit.at(-1)![1] = parseFloat(e[j][1]);
          else if (e[j][0] === 10) ctrl.push([parseFloat(e[j][1]), 0]);
          else if (e[j][0] === 20 && ctrl.length) ctrl.at(-1)![1] = parseFloat(e[j][1]);
        }
        const pts = fit.length >= 2 ? fit : ctrl;
        const isClosed = (num(e, 70) & 1) === 1;
        pushPoly(
          pts.map((q) => ({ p: q, bulge: 0 })),
          isClosed,
        );
        break;
      }
      case "ELLIPSE": {
        const c: Pt = [num(e, 10), num(e, 20)];
        const maj: Pt = [num(e, 11), num(e, 21)];
        const ratio = num(e, 40, 1);
        const t0 = num(e, 41, 0);
        let t1 = num(e, 42, Math.PI * 2);
        if (t1 <= t0) t1 += Math.PI * 2;
        const n = Math.max(12, Math.ceil(((t1 - t0) / (Math.PI * 2)) * 72));
        const minor: Pt = [-maj[1] * ratio, maj[0] * ratio];
        const pts: Pt[] = [];
        for (let j = 0; j <= n; j++) {
          const t = t0 + ((t1 - t0) * j) / n;
          pts.push([c[0] + maj[0] * Math.cos(t) + minor[0] * Math.sin(t), c[1] + maj[1] * Math.cos(t) + minor[1] * Math.sin(t)]);
        }
        const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
        if (full) pts.pop();
        pushPoly(
          pts.map((q) => ({ p: q, bulge: 0 })),
          full,
        );
        break;
      }
      case "VERTEX":
      case "SEQEND":
        break;
      default:
        skipped.add(type);
    }
  }

  function pushPoly(verts: { p: Pt; bulge: number }[], isClosed: boolean) {
    const out: Seg[] = [];
    for (let j = 0; j < verts.length - 1; j++) {
      if (dist(verts[j].p, verts[j + 1].p) > 1e-6) out.push({ a: verts[j].p, b: verts[j + 1].p, bulge: verts[j].bulge });
    }
    if (isClosed && verts.length >= 2 && dist(verts.at(-1)!.p, verts[0].p) > 1e-6) {
      out.push({ a: verts.at(-1)!.p, b: verts[0].p, bulge: verts.at(-1)!.bulge });
    }
    if (isClosed && out.length) closed.push({ segs: out });
    else segs.push(...out);
  }

  const { loops, open } = chain(segs);
  return { geometry: { loops: [...closed, ...loops] }, units, openChains: open, skipped: [...skipped] };
}

/** Join loose segments end-to-end into closed loops. */
export function chain(segs: Seg[]): { loops: Loop[]; open: number } {
  const left = [...segs];
  const loops: Loop[] = [];
  let open = 0;
  while (left.length) {
    const cur: Seg[] = [left.pop()!];
    let grew = true;
    while (grew && dist(cur[0].a, cur.at(-1)!.b) > EPS) {
      grew = false;
      const end = cur.at(-1)!.b;
      for (let j = 0; j < left.length; j++) {
        const s = left[j];
        if (dist(s.a, end) <= EPS) {
          cur.push(s);
        } else if (dist(s.b, end) <= EPS) {
          cur.push({ a: s.b, b: s.a, bulge: -s.bulge });
        } else continue;
        left.splice(j, 1);
        grew = true;
        break;
      }
    }
    if (cur.length && dist(cur[0].a, cur.at(-1)!.b) <= EPS && (cur.length > 1 || cur[0].bulge)) {
      // snap the tiny closing gap
      cur.at(-1)!.b = cur[0].a;
      loops.push({ segs: cur });
    } else open++;
  }
  return { loops, open };
}

/** Scale geometry (e.g. inches → mm). */
export function scaleGeom(g: Geometry, k: number): Geometry {
  if (k === 1) return g;
  return {
    loops: g.loops.map((l) => ({ segs: l.segs.map((s) => ({ a: [s.a[0] * k, s.a[1] * k], b: [s.b[0] * k, s.b[1] * k], bulge: s.bulge })) })),
  };
}

// ── DXF write ────────────────────────────────────────────────────────────────

export interface DxfLayer {
  name: string;
  loops: Loop[];
  /** AutoCAD colour index */
  color?: number;
}

/**
 * Minimal R12 DXF in millimetres: one closed POLYLINE per loop (arcs kept as
 * bulges), a layer per group. Opens in Fusion, VCarve, LightBurn, SheetCAM.
 */
export function writeDxf(layers: DxfLayer[]): string {
  const f = (n: number) => (Math.round(n * 10000) / 10000).toString();
  const out: string[] = [];
  const put = (code: number, v: string | number) => out.push(String(code), String(v));
  put(0, "SECTION");
  put(2, "HEADER");
  put(9, "$ACADVER");
  put(1, "AC1009");
  put(9, "$INSUNITS");
  put(70, 4);
  put(0, "ENDSEC");
  put(0, "SECTION");
  put(2, "TABLES");
  put(0, "TABLE");
  put(2, "LAYER");
  put(70, layers.length);
  for (const l of layers) {
    put(0, "LAYER");
    put(2, l.name);
    put(70, 0);
    put(62, l.color ?? 7);
    put(6, "CONTINUOUS");
  }
  put(0, "ENDTAB");
  put(0, "ENDSEC");
  put(0, "SECTION");
  put(2, "ENTITIES");
  for (const layer of layers) {
    for (const loop of layer.loops) {
      put(0, "POLYLINE");
      put(8, layer.name);
      put(66, 1);
      put(10, 0);
      put(20, 0);
      put(30, 0);
      put(70, 1);
      for (const s of loop.segs) {
        put(0, "VERTEX");
        put(8, layer.name);
        put(10, f(s.a[0]));
        put(20, f(s.a[1]));
        put(30, 0);
        if (s.bulge) put(42, f(s.bulge));
      }
      put(0, "SEQEND");
      put(8, layer.name);
    }
  }
  put(0, "ENDSEC");
  put(0, "EOF");
  return out.join("\n") + "\n";
}

/** Layer-safe name: DXF layer names can't hold <>/\":;?*|=' */
export const layerName = (s: string) => s.replace(/[<>/\\":;?*|=',]/g, "_").slice(0, 60) || "PART";
