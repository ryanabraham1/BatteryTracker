"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthed } from "@/lib/auth";
import { getMaterials } from "@/lib/fab-data";
import { FILES_BUCKET, getPartsSettings, toPart } from "@/lib/parts-data";
import { cutLinear, cutSheet, type FabResult } from "@/app/fab-actions";
import {
  CUT_FLOW,
  firstStage,
  fileKind,
  guessKind,
  isPartKind,
  kindFromProcess,
  MACHINE_PROCESSES,
  matchMaterial,
  STAGES,
  type FabPart,
  type MachineProcess,
  type PartGeometry,
  type PartKind,
  type PartSource,
} from "@/lib/parts";
import { toPartGeometry } from "@/lib/dfm";
import { readDxf, scaleGeom, writeDxf } from "@/lib/geom";
import { MM_PER_IN } from "@/lib/units";
import {
  assemblyBom,
  describeElement,
  exportPart,
  parseOnshapeUrl,
  studioMetadata,
  studioShapes,
  type BodyShape,
  type OnshapeRef,
  type StudioPart,
} from "@/lib/onshape";

async function guard() {
  if (!(await isAuthed())) throw new Error("Not signed in");
}

async function run<T>(fn: () => Promise<T>): Promise<FabResult<T>> {
  try {
    await guard();
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
    return { ok: false, error: msg };
  }
}

const db = () => supabaseAdmin();
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function loadPart(id: string): Promise<FabPart> {
  const { data, error } = await db().from("fab_parts").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Part not found");
  return toPart(data);
}

async function logPart(partId: string, type: string, data: Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== ""));
  const { error } = await db().from("fab_part_events").insert({ part_id: partId, type, data: clean });
  if (error) throw error;
}

// ── Designs + Onshape sync ───────────────────────────────────────────────────

export async function addDesign(fd: FormData): Promise<FabResult<{ id: string; note: string }>> {
  return run(async () => {
    const url = str(fd, "url");
    const copies = Math.max(1, Math.round(num(fd, "copies") ?? 1));
    let name = str(fd, "name");
    if (!url) {
      // a design without Onshape: parts get added by hand
      if (!name) throw new Error("Paste an Onshape link, or name the design to add parts by hand");
      const { data, error } = await db().from("fab_designs").insert({ name, copies }).select("id").single();
      if (error) throw error;
      return { id: data.id as string, note: "" };
    }
    const ref = parseOnshapeUrl(url);
    if (!ref) throw new Error("That doesn't look like an Onshape tab link (…/documents/…/w/…/e/…)");
    const info = await describeElement(ref);
    if (!name) name = info.type === "assembly" ? `${info.docName} · ${info.elementName}` : info.elementName;
    const { data, error } = await db()
      .from("fab_designs")
      .insert({
        name,
        url,
        copies,
        document_id: ref.did,
        wvm: ref.wvm,
        wvm_id: ref.wvmid,
        element_id: ref.eid,
        element_type: info.type,
      })
      .select("id")
      .single();
    if (error) throw error;
    const note = await sync(data.id as string);
    return { id: data.id as string, note };
  });
}

export async function syncDesign(fd: FormData): Promise<FabResult<string>> {
  return run(() => sync(str(fd, "id")));
}

export async function updateDesign(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const patch: Record<string, unknown> = {};
    if (fd.has("name")) {
      const name = str(fd, "name");
      if (!name) throw new Error("Name the design");
      patch.name = name;
    }
    if (fd.has("copies")) patch.copies = Math.max(1, Math.round(num(fd, "copies") ?? 1));
    if (fd.has("archived")) patch.archived = str(fd, "archived") === "1";
    const { error } = await db().from("fab_designs").update(patch).eq("id", str(fd, "id"));
    if (error) throw error;
  });
}

/** Deletes the design, its parts, and their stored files. */
export async function deleteDesign(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const id = str(fd, "id");
    const { data: parts } = await db().from("fab_parts").select("id").eq("design_id", id);
    await removeStoredFiles((parts ?? []).map((p) => p.id as string));
    const { error } = await db().from("fab_designs").delete().eq("id", id);
    if (error) throw error;
  });
}

async function removeStoredFiles(partIds: string[]) {
  if (!partIds.length) return;
  const { data: files } = await db().from("fab_part_files").select("path").in("part_id", partIds);
  const paths = (files ?? []).map((f) => f.path as string);
  for (let i = 0; i < paths.length; i += 100) await db().storage.from(FILES_BUCKET).remove(paths.slice(i, i + 100));
}

const studioKey = (s: Pick<PartSource, "did" | "wvm" | "wvmid" | "eid" | "configuration">) => `${s.did}/${s.wvm}/${s.wvmid}/${s.eid}/${s.configuration ?? ""}`;

/** Run jobs with at most `n` in flight (Onshape doesn't like bursts). */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function findProp(props: Record<string, string>, name: string): string {
  const k = Object.keys(props).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? props[k] : "";
}

/** Keep stored properties small: strings only, a sensible number of them. */
function trimProps(props: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(props)
      .filter(([k]) => !/^(thumbnail|appearance|configuration|microversion)/i.test(k))
      .slice(0, 60)
      .map(([k, v]) => [k, v.slice(0, 300)]),
  );
}

/**
 * Pull a design's parts from Onshape: BOM (for an assembly) → properties and
 * shapes per Part Studio (2 calls each) → classify, size, match to inventory,
 * outline plates. Updates parts in place; parts that left the design are
 * flagged, not deleted, so their board history stays.
 */
async function sync(designId: string): Promise<string> {
  const { data: design, error } = await db().from("fab_designs").select("*").eq("id", designId).single();
  if (error || !design) throw new Error("Design not found");
  if (!design.document_id) throw new Error("This design isn't linked to Onshape");
  const settings = await getPartsSettings();
  const prop = settings.onshape_process_prop;
  const ref: OnshapeRef = { did: design.document_id, wvm: design.wvm, wvmid: design.wvm_id, eid: design.element_id };

  // 1. What's in the design.
  type Line = { source: PartSource; quantity: number; name: string; partNumber: string; material: string; description: string; props: Record<string, string> };
  let lines: Line[] = [];
  let skippedStandard = 0;
  const metaCache = new Map<string, Map<string, StudioPart>>();
  if (design.element_type === "assembly") {
    const bom = await assemblyBom(ref);
    lines = bom.lines;
    skippedStandard = bom.skippedStandard;
  } else {
    const meta = await studioMetadata(ref);
    metaCache.set(studioKey({ ...ref }), new Map(meta.map((m) => [m.partId, m])));
    lines = meta.map((m) => ({ source: { ...ref, partId: m.partId }, quantity: 1, name: m.name, partNumber: m.partNumber, material: m.material, description: m.description, props: m.props }));
  }

  // 2. Properties + shapes per Part Studio.
  const studios = [...new Map(lines.map((l) => [studioKey(l.source), l.source])).values()];
  const shapeCache = new Map<string, Map<string, BodyShape>>();
  const failures: string[] = [];
  await pool(studios, 3, async (s) => {
    const r: OnshapeRef = { did: s.did, wvm: s.wvm, wvmid: s.wvmid, eid: s.eid };
    const key = studioKey(s);
    try {
      if (!metaCache.has(key)) metaCache.set(key, new Map((await studioMetadata(r, s.configuration)).map((m) => [m.partId, m])));
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
    try {
      shapeCache.set(key, await studioShapes(r, s.configuration));
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  });

  // 3. Classify and write.
  const [materials, existingRes] = await Promise.all([getMaterials(), db().from("fab_parts").select("*").eq("design_id", designId)]);
  if (existingRes.error) throw existingRes.error;
  const existing = new Map((existingRes.data ?? []).map((r) => [r.onshape_key as string, toPart(r)]));
  const seen = new Set<string>();
  let added = 0;
  let skippedProcess = 0;
  let noProp = 0;
  const dxfJobs: { partId: string; name: string; geometry: PartGeometry }[] = [];

  // merge duplicate lines (same part used in two sub-assemblies)
  const merged = new Map<string, Line>();
  for (const l of lines) {
    const k = `${studioKey(l.source)}:${l.source.partId}`;
    const m = merged.get(k);
    if (m) m.quantity += l.quantity;
    else merged.set(k, { ...l, props: { ...l.props } });
  }

  await pool([...merged.entries()], 6, async ([key, line]) => {
    const meta = metaCache.get(studioKey(line.source))?.get(line.source.partId);
    const shape = shapeCache.get(studioKey(line.source))?.get(line.source.partId) ?? null;
    const props = trimProps({ ...line.props, ...(meta?.props ?? {}) });
    const name = line.name || meta?.name || shape?.name || "Unnamed part";
    const material = line.material || meta?.material || shape?.material || "";
    const processVal = findProp(props, prop);
    const fromProp = kindFromProcess(processVal);
    if (fromProp === "skip") {
      skippedProcess++;
      return;
    }
    if (!fromProp && settings.onshape_require_prop) {
      noProp++;
      return;
    }
    seen.add(key);
    const old = existing.get(key);
    const oldProcess = old ? findProp(old.properties, prop) : null;
    // a kind someone changed by hand sticks until the Process property itself changes
    const kind: PartKind = old && oldProcess === processVal ? old.kind : (fromProp ?? guessKind(name, material, shape?.facts ?? null));
    const f = shape?.facts;
    const sizes = f ? { size_l_mm: round(f.l), size_w_mm: round(f.w), size_t_mm: round(f.t) } : {};
    let geometry: PartGeometry | null | undefined;
    if (kind === "plate" && shape?.face && old?.geometry?.from !== "dxf") {
      geometry = toPartGeometry(shape.face, "onshape", { approx: shape.approx });
    }
    const row: Record<string, unknown> = {
      design_id: designId,
      onshape_key: key,
      source: line.source,
      name,
      part_number: line.partNumber || meta?.partNumber || "",
      description: line.description || meta?.description || "",
      quantity: line.quantity,
      material_text: material,
      properties: props,
      missing: false,
      kind,
      ...sizes,
      ...(geometry !== undefined ? { geometry } : {}),
    };
    if (!old?.material_locked) {
      row.material_id = matchMaterial({ kind, material_text: material, size_l_mm: f?.l ?? null, size_w_mm: f?.w ?? null, size_t_mm: f?.t ?? null }, materials)?.id ?? null;
    }
    let partId: string;
    if (old) {
      if (old.kind !== kind && !STAGES[kind].some((s) => s.key === old.stage)) {
        row.stage = firstStage(kind);
        row.stage_changed_at = new Date().toISOString();
      }
      const { error: e } = await db().from("fab_parts").update(row).eq("id", old.id);
      if (e) throw e;
      partId = old.id;
    } else {
      row.stage = firstStage(kind);
      const { data: ins, error: e } = await db().from("fab_parts").insert(row).select("id").single();
      if (e) throw e;
      partId = ins.id as string;
      added++;
      await logPart(partId, "import", { design: design.name, kind, quantity: line.quantity });
    }
    if (geometry && JSON.stringify(geometry.loops) !== JSON.stringify(old?.geometry?.loops ?? null)) dxfJobs.push({ partId, name, geometry });
  });

  // 4. Parts that left the design.
  const gone = [...existing.values()].filter((p) => !seen.has(p.onshape_key ?? "") && !p.missing);
  if (gone.length) {
    const { error: e } = await db().from("fab_parts").update({ missing: true }).in("id", gone.map((p) => p.id));
    if (e) throw e;
  }

  // 5. Plate DXFs, straight from the model (no extra API calls).
  await pool(dxfJobs, 4, (j) => storeDxf(j.partId, j.name, j.geometry));

  const parts = [
    `${seen.size} part${seen.size === 1 ? "" : "s"}`,
    added && `${added} new`,
    gone.length && `${gone.length} no longer in the design`,
    skippedProcess && `${skippedProcess} skipped (${prop} says not made here)`,
    noProp && `${noProp} skipped (no ${prop} property)`,
    skippedStandard && `${skippedStandard} standard hardware`,
    failures.length && `${failures.length} Part Studio read${failures.length > 1 ? "s" : ""} failed: ${failures[0]}`,
  ].filter(Boolean);
  let note = parts.join(" · ");
  if (!seen.size && noProp && settings.onshape_require_prop) {
    note += ` — none of the parts had a “${prop}” property. Add it in Onshape, or turn off “only parts with ${prop}” in Machines & settings.`;
  }
  await db().from("fab_designs").update({ last_synced_at: new Date().toISOString(), sync_note: note }).eq("id", designId);
  return note;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Write a part's outline as its DXF file (replacing the last one Onshape made). */
async function storeDxf(partId: string, name: string, g: PartGeometry) {
  const text = writeDxf([
    { name: "OUTLINE", loops: g.loops.slice(0, 1), color: 7 },
    { name: "HOLES", loops: g.loops.slice(1), color: 1 },
  ]);
  const file = `${safeName(name)}.dxf`;
  const path = `parts/${partId}/onshape-${file}`;
  const { error } = await db().storage.from(FILES_BUCKET).upload(path, new Blob([text], { type: "application/dxf" }), { upsert: true, contentType: "application/dxf" });
  if (error) throw error;
  await db().from("fab_part_files").delete().eq("part_id", partId).eq("source", "onshape").eq("kind", "dxf");
  const { error: e } = await db().from("fab_part_files").insert({ part_id: partId, kind: "dxf", name: file, path, size_bytes: text.length, source: "onshape" });
  if (e) throw e;
}

const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "part";

// ── Parts ────────────────────────────────────────────────────────────────────

/** Add a part by hand (a design without Onshape, or something Onshape doesn't have). */
export async function addPart(fd: FormData): Promise<FabResult<string>> {
  return run(async () => {
    const name = str(fd, "name");
    if (!name) throw new Error("Name the part");
    const kind = str(fd, "kind");
    if (!isPartKind(kind)) throw new Error("Pick what kind of part it is");
    const materialId = str(fd, "material_id") || null;
    const { data, error } = await db()
      .from("fab_parts")
      .insert({
        name,
        kind,
        stage: firstStage(kind),
        design_id: str(fd, "design_id") || null,
        quantity: Math.max(1, Math.round(num(fd, "quantity") ?? 1)),
        material_id: materialId,
        material_locked: !!materialId,
        size_l_mm: num(fd, "size_l_mm"),
        size_w_mm: num(fd, "size_w_mm"),
        size_t_mm: num(fd, "size_t_mm"),
        notes: str(fd, "notes"),
      })
      .select("id")
      .single();
    if (error) throw error;
    await logPart(data.id as string, "import", { by_hand: true, kind });
    return data.id as string;
  });
}

export async function updatePart(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const part = await loadPart(str(fd, "id"));
    const patch: Record<string, unknown> = {};
    if (fd.has("name")) {
      const name = str(fd, "name");
      if (!name) throw new Error("Name the part");
      patch.name = name;
    }
    if (fd.has("kind")) {
      const kind = str(fd, "kind");
      if (!isPartKind(kind)) throw new Error("Pick a kind");
      if (kind !== part.kind) {
        patch.kind = kind;
        if (!STAGES[kind].some((s) => s.key === part.stage)) {
          patch.stage = firstStage(kind);
          patch.stage_changed_at = new Date().toISOString();
        }
      }
    }
    if (fd.has("quantity")) patch.quantity = Math.max(1, Math.round(num(fd, "quantity") ?? 1));
    if (fd.has("cut_qty")) patch.cut_qty = Math.max(0, Math.round(num(fd, "cut_qty") ?? 0));
    if (fd.has("material_id")) {
      const m = str(fd, "material_id");
      if (m === "auto") {
        const materials = await getMaterials();
        patch.material_id = matchMaterial({ ...part, kind: (patch.kind as PartKind) ?? part.kind }, materials)?.id ?? null;
        patch.material_locked = false;
      } else {
        patch.material_id = m || null;
        patch.material_locked = true;
      }
    }
    for (const k of ["size_l_mm", "size_w_mm", "size_t_mm"]) if (fd.has(k)) patch[k] = num(fd, k);
    if (fd.has("notes")) patch.notes = str(fd, "notes");
    const { error } = await db().from("fab_parts").update(patch).eq("id", part.id);
    if (error) throw error;
    const changed = Object.keys(patch).filter((k) => !["stage_changed_at", "material_locked"].includes(k));
    if (changed.length) await logPart(part.id, "edit", { fields: changed.join(", ") });
  });
}

export async function movePart(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const part = await loadPart(str(fd, "id"));
    const stage = str(fd, "stage");
    if (!STAGES[part.kind].some((s) => s.key === stage)) throw new Error("That column isn't on this board");
    if (stage === part.stage) return;
    const { error } = await db().from("fab_parts").update({ stage, stage_changed_at: new Date().toISOString() }).eq("id", part.id);
    if (error) throw error;
    await logPart(part.id, "stage", { from: part.stage, to: stage, by: str(fd, "by") });
  });
}

export async function assignPart(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const part = await loadPart(str(fd, "id"));
    const who = str(fd, "name").slice(0, 40);
    if (!who) throw new Error("Enter a name");
    const add = str(fd, "mode") !== "remove";
    const has = part.assignees.some((a) => a.toLowerCase() === who.toLowerCase());
    if (add === has) return;
    const assignees = add ? [...part.assignees, who] : part.assignees.filter((a) => a.toLowerCase() !== who.toLowerCase());
    const { error } = await db().from("fab_parts").update({ assignees }).eq("id", part.id);
    if (error) throw error;
    await logPart(part.id, "assign", { name: who, mode: add ? "add" : "remove" });
  });
}

export async function deletePart(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const id = str(fd, "id");
    await removeStoredFiles([id]);
    const { error } = await db().from("fab_parts").delete().eq("id", id);
    if (error) throw error;
  });
}

// ── Files ────────────────────────────────────────────────────────────────────

/** A one-time URL the browser uploads straight to storage with (no size limit through the app). */
export async function fileUploadUrl(fd: FormData): Promise<FabResult<{ path: string; token: string }>> {
  return run(async () => {
    const part = await loadPart(str(fd, "part_id"));
    const name = safeName(str(fd, "name"));
    const path = `parts/${part.id}/${Date.now().toString(36)}-${name}`;
    const { data, error } = await db().storage.from(FILES_BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return { path: data.path, token: data.token };
  });
}

/**
 * Record an uploaded file. A DXF also becomes the part's outline (unless
 * `outline` is "0"), with units from the file, the model's size, or the pick.
 */
export async function recordFile(fd: FormData): Promise<FabResult<string>> {
  return run(async () => {
    const part = await loadPart(str(fd, "part_id"));
    const path = str(fd, "path");
    if (!path.startsWith(`parts/${part.id}/`)) throw new Error("Bad file path");
    const name = str(fd, "name") || path.split("/").pop()!;
    const kind = fileKind(name);
    const { error } = await db()
      .from("fab_part_files")
      .insert({ part_id: part.id, kind, name, path, size_bytes: num(fd, "size"), source: "upload" });
    if (error) throw error;
    await logPart(part.id, "file", { name, kind });
    if (kind !== "dxf" || str(fd, "outline") === "0") return "";
    const { data: blob, error: de } = await db().storage.from(FILES_BUCKET).download(path);
    if (de || !blob) throw new Error("Uploaded, but couldn't read the DXF back");
    return applyDxf(part, await blob.text(), str(fd, "units"));
  });
}

async function applyDxf(part: FabPart, text: string, unitsPick: string): Promise<string> {
  const read = readDxf(text);
  if (!read.geometry.loops.length) throw new Error("Saved the file, but found no closed shapes in the DXF to use as the outline");
  let scale = 1;
  let why = "";
  if (unitsPick === "in" || unitsPick === "mm") {
    scale = unitsPick === "in" ? MM_PER_IN : 1;
    why = `units: ${unitsPick} (picked)`;
  } else if (read.units) {
    scale = read.units === "in" ? MM_PER_IN : 1;
    why = `units: ${read.units} (from the file)`;
  } else {
    // no units in the file: whichever reading matches the model's size, else a size guess
    const raw = toPartGeometry(read.geometry, "dxf");
    const big = raw ? Math.max(raw.width, raw.height) : 0;
    const model = part.size_l_mm;
    if (model && big) scale = Math.abs(big * MM_PER_IN - model) < Math.abs(big - model) ? MM_PER_IN : 1;
    else scale = big && big < 60 ? MM_PER_IN : 1;
    why = `units: ${scale === 1 ? "mm" : "in"} (guessed — pick them if that's wrong)`;
  }
  const g = toPartGeometry(scaleGeom(read.geometry, scale), "dxf", { open: read.openChains });
  if (!g) throw new Error("Couldn't find an outline in that DXF");
  const { error } = await db().from("fab_parts").update({ geometry: g }).eq("id", part.id);
  if (error) throw error;
  return why;
}

export async function deleteFile(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { data: f, error } = await db().from("fab_part_files").select("*").eq("id", str(fd, "id")).single();
    if (error || !f) throw new Error("File not found");
    await db().storage.from(FILES_BUCKET).remove([f.path as string]);
    const { error: e } = await db().from("fab_part_files").delete().eq("id", f.id);
    if (e) throw e;
    await logPart(f.part_id as string, "file", { name: f.name, removed: true });
  });
}

/** Export a part from Onshape (STEP by default) and keep it with the part. */
export async function fetchOnshapeFile(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const part = await loadPart(str(fd, "part_id"));
    if (!part.source) throw new Error("This part isn't from Onshape");
    const format = str(fd, "format") === "STL" ? "STL" : "STEP";
    const bytes = await exportPart(part.source, format);
    const ext = format === "STL" ? "stl" : "step";
    const file = `${safeName(part.name)}.${ext}`;
    const path = `parts/${part.id}/onshape-${file}`;
    const { error } = await db()
      .storage.from(FILES_BUCKET)
      .upload(path, new Blob([bytes as BlobPart]), { upsert: true, contentType: "application/octet-stream" });
    if (error) throw error;
    await db().from("fab_part_files").delete().eq("part_id", part.id).eq("source", "onshape").eq("kind", fileKind(file));
    const { error: e } = await db().from("fab_part_files").insert({ part_id: part.id, kind: fileKind(file), name: file, path, size_bytes: bytes.byteLength, source: "onshape" });
    if (e) throw e;
    await logPart(part.id, "file", { name: file, kind: ext, from: "Onshape" });
  });
}

// ── Committing a cut plan ────────────────────────────────────────────────────

interface CommitCount {
  partId: string;
  count: number;
}

/** After cutting: bump each part's cut count, and move it on once every copy is cut. */
async function markCut(counts: CommitCount[], what: string) {
  const byPart = new Map<string, number>();
  for (const c of counts) byPart.set(c.partId, (byPart.get(c.partId) ?? 0) + c.count);
  for (const [partId, n] of byPart) {
    const part = await loadPart(partId);
    const { data: d } = part.design_id ? await db().from("fab_designs").select("copies").eq("id", part.design_id).maybeSingle() : { data: null };
    const need = part.quantity * ((d?.copies as number) ?? 1);
    const cut_qty = part.cut_qty + n;
    const flow = CUT_FLOW[part.kind];
    const patch: Record<string, unknown> = { cut_qty };
    if (flow && cut_qty >= need && flow.before.includes(part.stage)) {
      patch.stage = flow.after;
      patch.stage_changed_at = new Date().toISOString();
    }
    const { error } = await db().from("fab_parts").update(patch).eq("id", partId);
    if (error) throw error;
    await logPart(partId, "cut", { count: n, from: what, total: cut_qty, of: need, moved_to: patch.stage });
  }
}

/** Cut a planned sheet: the rack piece becomes its leftovers, the parts count as cut. */
export async function commitSheet(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const plan = JSON.parse(str(fd, "plan") || "{}") as {
      pieceId: string;
      w: number;
      l: number;
      remaining: { w: number; l: number }[];
      counts: CommitCount[];
      project: string;
    };
    if (!plan.pieceId) throw new Error("Receive that sheet into stock before cutting it");
    const { data: piece } = await db().from("fab_pieces").select("*").eq("id", plan.pieceId).maybeSingle();
    if (!piece || piece.status !== "stock") throw new Error("That sheet isn't on the rack any more — refresh the plan");
    if (Math.abs(Number(piece.width_mm) - plan.w) > 0.5 || Math.abs(Number(piece.length_mm) - plan.l) > 0.5 || piece.has_cutouts)
      throw new Error("That sheet has changed since the plan was made — refresh the plan");
    const cut = new FormData();
    cut.set("piece_id", plan.pieceId);
    cut.set("mode", plan.remaining.length ? "remaining" : "whole");
    cut.set("remaining", JSON.stringify(plan.remaining));
    cut.set("project", plan.project);
    cut.set("note", "Cut plan");
    const r = await cutSheet(cut);
    if (!r.ok) throw new Error(r.error);
    await markCut(plan.counts, "sheet");
  });
}

/** Cut a planned stick, one cut at a time (each is its own undoable log entry). */
export async function commitStick(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const plan = JSON.parse(str(fd, "plan") || "{}") as { pieceId: string; len: number; cuts: { partId: string; len: number }[]; project: string };
    if (!plan.pieceId) throw new Error("Receive that stick into stock before cutting it");
    const { data: piece } = await db().from("fab_pieces").select("*").eq("id", plan.pieceId).maybeSingle();
    if (!piece || piece.status !== "stock" || Math.abs(Number(piece.length_mm) - plan.len) > 0.5)
      throw new Error("That stick has changed since the plan was made — refresh the plan");
    const done: CommitCount[] = [];
    try {
      for (const c of plan.cuts) {
        const cut = new FormData();
        cut.set("piece_id", plan.pieceId);
        cut.set("used_mm", String(c.len));
        cut.set("count", "1");
        cut.set("project", plan.project);
        const r = await cutLinear(cut);
        if (!r.ok) throw new Error(r.error);
        done.push({ partId: c.partId, count: 1 });
      }
    } finally {
      if (done.length) await markCut(done, "stick");
    }
  });
}

// ── Machines + settings ──────────────────────────────────────────────────────

export async function saveMachine(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const id = str(fd, "id");
    const name = str(fd, "name");
    if (!name) throw new Error("Name the machine");
    const process = str(fd, "process") as MachineProcess;
    if (!MACHINE_PROCESSES.includes(process)) throw new Error("Pick what the machine does");
    const pos = (k: string) => {
      const n = num(fd, k);
      return n !== null && n > 0 ? n : null;
    };
    const row = {
      name,
      process,
      bed_w_mm: pos("bed_w_mm"),
      bed_l_mm: pos("bed_l_mm"),
      max_thickness_mm: pos("max_thickness_mm"),
      thickness_limits: str(fd, "thickness_limits"),
      tool_diameter_mm: pos("tool_diameter_mm"),
      min_hole_mm: pos("min_hole_mm"),
      min_web_mm: pos("min_web_mm"),
      max_length_mm: pos("max_length_mm"),
      max_diameter_mm: pos("max_diameter_mm"),
      materials: str(fd, "materials"),
      notes: str(fd, "notes"),
      // the form sends a hidden "0" plus the checkbox's "1" when ticked
      active: fd.getAll("active").includes("1") || !fd.has("active"),
    };
    // bed stored short side first
    if (row.bed_w_mm && row.bed_l_mm && row.bed_w_mm > row.bed_l_mm) [row.bed_w_mm, row.bed_l_mm] = [row.bed_l_mm, row.bed_w_mm];
    const { error } = id ? await db().from("fab_machines").update(row).eq("id", id) : await db().from("fab_machines").insert(row);
    if (error) throw error;
  });
}

export async function deleteMachine(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { error } = await db().from("fab_machines").delete().eq("id", str(fd, "id"));
    if (error) throw error;
  });
}

export async function savePartsSettings(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const prop = str(fd, "onshape_process_prop");
    if (!prop) throw new Error("Enter the Onshape property name");
    const gap = num(fd, "nest_gap_mm");
    const margin = num(fd, "nest_margin_mm");
    if (gap === null || gap < 0 || gap > 50) throw new Error("Gap should be 0–50 mm");
    if (margin === null || margin < 0 || margin > 200) throw new Error("Edge margin should be 0–200 mm");
    const { error } = await db()
      .from("fab_settings")
      .update({ onshape_process_prop: prop, onshape_require_prop: str(fd, "onshape_require_prop") === "1", nest_gap_mm: gap, nest_margin_mm: margin })
      .eq("id", 1);
    if (error) throw error;
  });
}
