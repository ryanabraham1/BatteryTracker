import "server-only";
import type { Geometry, Loop, Pt, Seg } from "./geom";
import type { PartSource, ShapeFacts } from "./parts";

/**
 * Onshape REST client using an API key pair (Basic auth), set in
 * ONSHAPE_ACCESS_KEY / ONSHAPE_SECRET_KEY. Onshape bills API calls against a
 * yearly allowance, so everything here reads a whole Part Studio per call
 * rather than one part at a time.
 */

const BASE = () => (process.env.ONSHAPE_BASE_URL || "https://cad.onshape.com").replace(/\/$/, "");

export function onshapeConfigured(): boolean {
  return !!(process.env.ONSHAPE_ACCESS_KEY && process.env.ONSHAPE_SECRET_KEY);
}

function auth(): string {
  const a = process.env.ONSHAPE_ACCESS_KEY;
  const s = process.env.ONSHAPE_SECRET_KEY;
  if (!a || !s) throw new Error("Onshape isn't connected — set ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY");
  return `Basic ${Buffer.from(`${a}:${s}`).toString("base64")}`;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE()}/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: auth(),
      Accept: "application/json;charset=UTF-8; qs=0.09",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) throw new Error("Onshape rejected the API keys (401) — check ONSHAPE_ACCESS_KEY / ONSHAPE_SECRET_KEY");
    if (res.status === 403) throw new Error("The API key can't open that document (403) — share it with the key's Onshape account");
    if (res.status === 404) throw new Error(`Onshape couldn't find that (404): ${path.split("?")[0]}`);
    if (res.status === 429) throw new Error("Onshape rate limit hit (429) — wait a minute and try again");
    throw new Error(`Onshape error ${res.status}: ${body}`);
  }
  return res;
}

const getJson = async <T>(path: string): Promise<T> => (await call(path)).json() as Promise<T>;

// ── URLs ─────────────────────────────────────────────────────────────────────

export interface OnshapeRef {
  did: string;
  wvm: "w" | "v" | "m";
  wvmid: string;
  eid: string;
}

/** https://cad.onshape.com/documents/{did}/w/{wid}/e/{eid} → ids */
export function parseOnshapeUrl(url: string): OnshapeRef | null {
  const m = /documents\/([0-9a-f]{24})\/([wvm])\/([0-9a-f]{24})\/e\/([0-9a-f]{24})/i.exec(url);
  return m ? { did: m[1], wvm: m[2].toLowerCase() as "w" | "v" | "m", wvmid: m[3], eid: m[4] } : null;
}

const refPath = (r: OnshapeRef) => `/d/${r.did}/${r.wvm}/${r.wvmid}/e/${r.eid}`;
const q = (params: Record<string, string | boolean | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

export async function describeElement(r: OnshapeRef): Promise<{ docName: string; elementName: string; type: "assembly" | "partstudio" }> {
  const [doc, els] = await Promise.all([
    getJson<{ name?: string }>(`/documents/${r.did}`),
    getJson<{ id: string; name: string; elementType: string }[]>(`/documents/d/${r.did}/${r.wvm}/${r.wvmid}/elements${q({ elementId: r.eid })}`),
  ]);
  const el = els.find((e) => e.id === r.eid) ?? els[0];
  if (!el) throw new Error("That tab isn't in the document");
  const t = el.elementType.toUpperCase();
  if (t !== "ASSEMBLY" && t !== "PARTSTUDIO") throw new Error(`Link an assembly or a Part Studio tab (that one is a ${el.elementType.toLowerCase()})`);
  return { docName: doc.name ?? "Onshape document", elementName: el.name, type: t === "ASSEMBLY" ? "assembly" : "partstudio" };
}

// ── Values ───────────────────────────────────────────────────────────────────

/** Property values come back as strings, numbers, or objects like {displayName}. */
export function propText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(propText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["displayName", "name", "value", "label", "id"]) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  }
  return "";
}

// ── BOM ──────────────────────────────────────────────────────────────────────

export interface BomLine {
  source: PartSource;
  name: string;
  partNumber: string;
  material: string;
  description: string;
  quantity: number;
  /** every column, by header name */
  props: Record<string, string>;
  standard?: boolean;
}

interface BomInfo {
  headers: { id: string; name: string; propertyName?: string }[];
  rows: {
    headerIdToValue: Record<string, unknown>;
    itemSource?: {
      documentId?: string;
      elementId?: string;
      partId?: string;
      wvmType?: string;
      wvmId?: string;
      configuration?: string;
      fullConfiguration?: string;
      isStandardContent?: boolean;
    };
  }[];
}

/** Flattened BOM of an assembly: one line per distinct part, quantity summed across sub-assemblies. */
export async function assemblyBom(r: OnshapeRef): Promise<{ lines: BomLine[] }> {
  const bom = await getJson<BomInfo>(
    `/assemblies${refPath(r)}/bom${q({ indented: false, generateIfAbsent: true, onlyVisibleColumns: false, thumbnail: false })}`,
  );
  const header = (prop: string, ...names: string[]) =>
    bom.headers.find((h) => h.propertyName === prop)?.id ?? bom.headers.find((h) => names.includes(h.name.toLowerCase()))?.id;
  const H = {
    name: header("name", "name"),
    qty: header("quantity", "quantity", "qty"),
    pn: header("partNumber", "part number"),
    mat: header("material", "material"),
    desc: header("description", "description"),
  };
  const lines: BomLine[] = [];
  for (const row of bom.rows) {
    const src = row.itemSource;
    if (!src?.partId || !src.documentId || !src.elementId || !src.wvmId) continue; // sub-assemblies, sketches
    const v = row.headerIdToValue;
    const props: Record<string, string> = {};
    for (const h of bom.headers) {
      const t = propText(v[h.id]);
      if (t) props[h.name] = t;
    }
    lines.push({
      source: {
        did: src.documentId,
        wvm: (src.wvmType?.[0]?.toLowerCase() as "w" | "v" | "m") || "w",
        wvmid: src.wvmId,
        eid: src.elementId,
        partId: src.partId,
        configuration: src.fullConfiguration || src.configuration || undefined,
      },
      name: H.name ? propText(v[H.name]) : "",
      partNumber: H.pn ? propText(v[H.pn]) : "",
      material: H.mat ? propText(v[H.mat]) : "",
      description: H.desc ? propText(v[H.desc]) : "",
      quantity: Math.max(1, Math.round(Number(H.qty ? propText(v[H.qty]) : 1) || 1)),
      props,
      // bolts, nuts, washers from Onshape's standard library
      standard: !!src.isStandardContent,
    });
  }
  return { lines };
}

// ── Part Studios ─────────────────────────────────────────────────────────────

export interface StudioPart {
  partId: string;
  name: string;
  material: string;
  partNumber: string;
  description: string;
  props: Record<string, string>;
}

/** Every part's properties (custom ones included) in one call. */
export async function studioMetadata(r: OnshapeRef, configuration?: string): Promise<StudioPart[]> {
  const res = await getJson<{ items?: { partId?: string; properties?: { name: string; value: unknown }[] }[] }>(
    `/metadata${refPath(r)}/p${q({ configuration, includeComputedProperties: false, thumbnail: false })}`,
  );
  return (res.items ?? [])
    .filter((it) => it.partId)
    .map((it) => {
      const props: Record<string, string> = {};
      for (const p of it.properties ?? []) {
        const t = propText(p.value);
        if (t) props[p.name] = t;
      }
      const get = (...names: string[]) => names.map((n) => props[n]).find(Boolean) ?? "";
      return {
        partId: it.partId!,
        name: get("Name"),
        material: get("Material"),
        partNumber: get("Part number", "Part Number"),
        description: get("Description"),
        props,
      };
    });
}

// ── Geometry from body details ───────────────────────────────────────────────

type V3 = { x: number; y: number; z: number };
interface BodyDetails {
  bodies?: {
    id: string;
    properties?: { name?: string; material?: { name?: string; displayName?: string } };
    vertices?: { id: string; point: V3 }[];
    edges?: {
      id: string;
      curve?: { type?: string; origin?: V3; radius?: number; normal?: V3 };
      geometry?: { startPoint?: V3; endPoint?: V3; midPoint?: V3; quarterPoint?: V3; length?: number };
    }[];
    faces?: {
      id: string;
      area?: number;
      surface?: { type?: string; origin?: V3; normal?: V3 };
      loops?: { isOuter?: boolean; coedges?: { edgeId: string; orientation?: boolean }[] }[];
    }[];
  }[];
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const crossV = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3): V3 => {
  const l = len3(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

export interface BodyShape {
  partId: string;
  name: string;
  material: string;
  facts: ShapeFacts;
  /** The biggest flat face as a 2D outline (mm) — the plate's DXF. */
  face: Geometry | null;
  approx: boolean;
}

/**
 * Sizes, flatness, profile and the biggest flat face's outline for every part
 * in a Part Studio, from one body-details call. Onshape answers in metres.
 */
export async function studioShapes(r: OnshapeRef, configuration?: string): Promise<Map<string, BodyShape>> {
  const res = await getJson<BodyDetails>(`/partstudios${refPath(r)}/bodydetails${q({ configuration, includeGeometricData: true })}`);
  const out = new Map<string, BodyShape>();
  for (const b of res.bodies ?? []) {
    try {
      const shape = bodyShape(b);
      if (shape) out.set(b.id, shape);
    } catch {
      // one odd body shouldn't sink the sync
    }
  }
  return out;
}

type Body = NonNullable<BodyDetails["bodies"]>[number];

function bodyShape(b: Body): BodyShape | null {
  const pts: V3[] = [];
  for (const v of b.vertices ?? []) pts.push(v.point);
  const edges = new Map((b.edges ?? []).map((e) => [e.id, e]));
  for (const e of b.edges ?? []) {
    const g = e.geometry;
    for (const p of [g?.startPoint, g?.midPoint, g?.quarterPoint, g?.endPoint]) if (p) pts.push(p);
  }
  const planes = (b.faces ?? []).filter((f) => f.surface?.type === "PLANE" && f.surface.normal && f.surface.origin);
  if (!pts.length) return null;
  const big = [...planes].sort((a, c) => (c.area ?? 0) - (a.area ?? 0))[0];

  // Frame: the biggest flat face's normal, and its longest straight edge.
  const n: V3 = big?.surface?.normal ? norm(big.surface.normal) : { x: 0, y: 0, z: 1 };
  let u: V3 | null = null;
  let longest = 0;
  for (const l of big?.loops ?? []) {
    for (const ce of l.coedges ?? []) {
      const e = edges.get(ce.edgeId);
      if (e?.curve?.type !== "LINE" || !e.geometry?.startPoint || !e.geometry.endPoint) continue;
      const d = sub(e.geometry.endPoint, e.geometry.startPoint);
      if (len3(d) > longest) {
        longest = len3(d);
        u = norm(d);
      }
    }
  }
  if (!u) {
    // no straight edge (a disc): any direction in the face
    const trial = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    u = norm(crossV(n, trial));
    u = norm(crossV(u, n));
  }
  const v = norm(crossV(n, u));
  const O = big?.surface?.origin ?? { x: 0, y: 0, z: 0 };
  const ext = (axis: V3) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      const d = dot(sub(p, O), axis);
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    // circles only give a few sample points; widen by their radius off-axis
    for (const e of b.edges ?? []) {
      if (e.curve?.type === "CIRCLE" && e.curve.origin && e.curve.radius && e.curve.normal) {
        const cn = norm(e.curve.normal);
        const off = e.curve.radius * Math.sqrt(Math.max(0, 1 - dot(cn, axis) ** 2));
        const d = dot(sub(e.curve.origin, O), axis);
        lo = Math.min(lo, d - off);
        hi = Math.max(hi, d + off);
      }
    }
    return (hi - lo) * 1000;
  };
  const du = ext(u);
  const dv = ext(v);
  const dn = ext(n);
  const [l, w, t] = [du, dv, dn].sort((a, c) => c - a);
  // flat = the thin direction is the biggest face's normal, and there's a matching face on the far side
  const flat =
    !!big &&
    Math.abs(dn - t) < 0.01 &&
    planes.some((f) => f !== big && Math.abs(dot(norm(f.surface!.normal!), n)) > 0.999 && Math.abs(Math.abs(dot(sub(f.surface!.origin!, O), n)) * 1000 - dn) < 0.05);

  // Profile of a long part: the flat face whose normal runs along the length.
  let profile: ShapeFacts["profile"];
  let hollow: boolean | undefined;
  if (l >= 3 * w) {
    const axis = du >= dv && du >= dn ? u : dv >= dn ? v : n;
    const end = planes.find((f) => Math.abs(dot(norm(f.surface!.normal!), axis)) > 0.999);
    const circleEnd = (b.edges ?? []).some((e) => e.curve?.type === "CIRCLE" && e.curve.normal && Math.abs(dot(norm(e.curve.normal), axis)) > 0.999 && Math.abs(e.curve.radius! * 2000 - w) < 0.5);
    if (end) {
      const outer = end.loops?.find((lp) => lp.isOuter) ?? end.loops?.[0];
      const kinds = (outer?.coedges ?? []).map((ce) => edges.get(ce.edgeId)?.curve?.type);
      hollow = (end.loops?.length ?? 0) > 1;
      profile = kinds.length && kinds.every((k) => k === "CIRCLE") ? "round" : kinds.length === 6 && kinds.every((k) => k === "LINE") ? "hex" : kinds.every((k) => k === "LINE") && kinds.length === 4 ? "rect" : "other";
    } else if (circleEnd) profile = "round";
  }

  // The plate outline: the biggest face's loops, flattened into (u, v).
  let face: Geometry | null = null;
  let approx = false;
  if (big && flat) {
    const to2 = (p: V3): Pt => [dot(sub(p, O), u!) * 1000, dot(sub(p, O), v) * 1000];
    const loops: Loop[] = [];
    for (const lp of big.loops ?? []) {
      const segs: Seg[] = [];
      for (const ce of lp.coedges ?? []) {
        const e = edges.get(ce.edgeId);
        const g = e?.geometry;
        if (!e || !g?.startPoint || !g.endPoint) continue;
        const fwd = ce.orientation !== false;
        const s = to2(fwd ? g.startPoint : g.endPoint);
        const t2 = to2(fwd ? g.endPoint : g.startPoint);
        const type = e.curve?.type;
        if (type === "LINE") segs.push({ a: s, b: t2, bulge: 0 });
        else if (type === "CIRCLE" && g.midPoint) {
          const mid = to2(g.midPoint);
          if (Math.hypot(s[0] - t2[0], s[1] - t2[1]) < 1e-6) {
            // full circle: two halves through the far point
            const c = e.curve?.origin ? to2(e.curve.origin) : ([(s[0] + mid[0]) / 2, (s[1] + mid[1]) / 2] as Pt);
            const far: Pt = [2 * c[0] - s[0], 2 * c[1] - s[1]];
            const quarter = g.quarterPoint ? to2(g.quarterPoint) : mid;
            const ccw = cross2(s, quarter, far) > 0 === fwd;
            segs.push({ a: s, b: far, bulge: ccw ? 1 : -1 }, { a: far, b: s, bulge: ccw ? 1 : -1 });
          } else segs.push({ a: s, b: t2, bulge: bulge3(s, mid, t2) });
        } else {
          // spline / ellipse: straight pieces through the points we have
          approx = true;
          const through = [g.quarterPoint, g.midPoint].filter(Boolean).map((p) => to2(p!));
          const chain = [s, ...(fwd ? through : through.reverse()), t2];
          for (let i = 0; i < chain.length - 1; i++) segs.push({ a: chain[i], b: chain[i + 1], bulge: 0 });
        }
      }
      if (segs.length) loops.push({ segs });
    }
    face = { loops };
  }

  return {
    partId: b.id,
    name: b.properties?.name ?? "",
    material: b.properties?.material?.displayName ?? b.properties?.material?.name ?? "",
    facts: { l, w, t, flat, profile, hollow },
    face,
    approx,
  };
}

const cross2 = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Bulge of the arc from a through m to b. */
function bulge3(a: Pt, m: Pt, b: Pt): number {
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (chord < 1e-9) return 0;
  // sagitta: distance of the mid point from the chord
  const s = cross2(a, b, m) / chord; // + when m is left of a→b
  // bulge = 2·sagitta / chord, sign: CCW arcs have their middle to the right of the chord
  return (-2 * s) / chord;
}

// ── File export ──────────────────────────────────────────────────────────────

/**
 * Export one part to STEP (or another format) through Onshape's translation
 * service, waiting for it to finish. Uses 3+ API calls, so it's on demand.
 */
export async function exportPart(src: PartSource, formatName: "STEP" | "STL" | "PARASOLID"): Promise<Uint8Array> {
  if (src.wvm === "m") throw new Error("Can't export from a microversion link — use a workspace or version link");
  const r: OnshapeRef = { did: src.did, wvm: src.wvm, wvmid: src.wvmid, eid: src.eid };
  const start = (await (
    await call(`/partstudios${refPath(r)}/translations`, {
      method: "POST",
      body: JSON.stringify({
        formatName,
        partIds: src.partId,
        configuration: src.configuration || undefined,
        storeInDocument: false,
        ...(formatName === "STL" ? { resolution: "fine", units: "millimeter" } : {}),
      }),
    })
  ).json()) as { id: string };
  let tr: { requestState?: string; resultExternalDataIds?: string[]; resultDocumentId?: string; failureReason?: string } = {};
  for (let i = 0, wait = 1000; i < 20; i++, wait = Math.min(wait * 1.5, 5000)) {
    await new Promise((res) => setTimeout(res, wait));
    tr = await getJson(`/translations/${start.id}`);
    if (tr.requestState !== "ACTIVE") break;
  }
  if (tr.requestState !== "DONE") throw new Error(tr.failureReason ? `Onshape export failed: ${tr.failureReason}` : "Onshape export timed out — try again");
  const fid = tr.resultExternalDataIds?.[0];
  if (!fid) throw new Error("Onshape export finished with no file");
  const res = await call(`/documents/d/${tr.resultDocumentId || src.did}/externaldata/${fid}`, { headers: { Accept: "application/octet-stream" } });
  return new Uint8Array(await res.arrayBuffer());
}
