"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignPart, deleteFile, deletePart, fetchOnshapeFile, fileUploadUrl, recordFile, setPartStatus, updatePart } from "@/app/parts-actions";
import { KIND_LABEL, needed, PART_KINDS, trackerOf, type FabDesign, type FabPart, type FabPartEvent, type FabPartFile, type PartKind } from "@/lib/parts";
import { isJobStatus, priorityLabel, PRIORITIES, STATUS_LABEL, STATUSES, type JobStatus } from "@/lib/tracker";
import type { DfmResult } from "@/lib/dfm";
import { materialName, type FabMaterial } from "@/lib/fab";
import { fmtArea, fmtLength, type Units } from "@/lib/units";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Sheet } from "./sheet";
import { DfmPill, IssueList, Outline, PersonChip } from "./parts-ui";
import { ErrorText, Field, LengthInput, SubmitButton, UnitsToggle, useFabAction } from "./fab-ui";

const FILE_ICON: Record<string, string> = { dxf: "DXF", step: "STEP", stl: "STL", pdf: "PDF", image: "IMG", other: "FILE" };

export function PartDetail({
  part: p,
  files,
  events,
  materials,
  material,
  dfm,
  design,
  person,
  processProp,
  units,
}: {
  part: FabPart;
  files: FabPartFile[];
  events: FabPartEvent[];
  materials: FabMaterial[];
  material: FabMaterial | null;
  dfm: DfmResult;
  design: FabDesign | null;
  person: string;
  processProp: string;
  units: Units;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [stockNote, setStockNote] = useState<string | null>(null);
  const move = useFabAction(setPartStatus, (n) => setStockNote(n || null));
  const assign = useFabAction(assignPart);
  const del = useFabAction(deletePart, () => router.push("/tracker/board"));
  const setMat = useFabAction(updatePart);
  const stages = STATUSES[trackerOf(p.kind)];
  const copies = design?.copies ?? 1;
  const need = needed(p, copies);
  const mineNow = !!person && p.assignees.some((a) => a.toLowerCase() === person.toLowerCase());
  const g = p.geometry;
  const L = (mm: number | null) => fmtLength(mm, units);
  const process = Object.entries(p.properties).find(([k]) => k.toLowerCase() === processProp.toLowerCase())?.[1];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            <Link href={`/tracker/board?kind=${p.kind}`} className="underline">
              {KIND_LABEL[p.kind]}
            </Link>
            {design && ` · ${design.name}`}
            {p.part_number && ` · ${p.part_number}`}
          </p>
          <h1 className="display text-4xl sm:text-5xl break-words">{p.name}</h1>
          <p className="mono text-sm mt-1" style={{ color: "var(--muted)" }}>
            {p.priority !== null && `${priorityLabel(p.priority)} · `}
            ×{need}
            {copies > 1 && ` (${p.quantity} × ${copies} robots)`}
            {p.spare_qty > 0 && ` incl. ${p.spare_qty} spare`}
            {p.bot && ` · ${p.bot}`}
            {p.subsystem && ` · ${p.subsystem}`}
            {p.cut_qty > 0 && ` · cut ${p.cut_qty}/${need}`}
            {process && ` · ${processProp}: ${process}`}
          </p>
          {p.missing && (
            <p className="text-sm mt-1" style={{ color: "var(--warn)" }}>
              No longer in the design as of the last sync.
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <UnitsToggle units={units} />
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] items-start">
        <div className="flex flex-col gap-4">
          {/* Board position */}
          <section className="card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow" style={{ color: "var(--muted)" }}>
                {STATUS_LABEL[p.status]} · {timeAgo(p.status_changed_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stages.map((st) => (
                <button key={st} type="button" className="tile tile-chip text-sm" data-selected={st === p.status} disabled={move.pending} onClick={() => move.call({ id: p.id, status: st, by: person })}>
                  {STATUS_LABEL[st]}
                </button>
              ))}
            </div>
            <ErrorText error={move.error} />
            {stockNote && (
              <p className="text-sm" role="status" style={{ color: /^Took/.test(stockNote) ? "var(--good)" : "var(--warn)" }}>
                {stockNote}
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              {p.assignees.map((a) => (
                <span key={a} className="tile tile-chip text-sm flex items-center gap-2">
                  <PersonChip name={a} size={20} /> {a}
                  <button type="button" style={{ color: "var(--muted)" }} aria-label={`Take ${a} off`} onClick={() => assign.call({ id: p.id, name: a, mode: "remove" })}>
                    ✕
                  </button>
                </span>
              ))}
              {person && (
                <button type="button" className={`btn ${mineNow ? "btn-ghost" : "btn-primary"} text-sm`} disabled={assign.pending} onClick={() => assign.call({ id: p.id, name: person, mode: mineNow ? "remove" : "add" })}>
                  {mineNow ? "Drop it" : "I'll take it"}
                </button>
              )}
            </div>
            <ErrorText error={assign.error} />
          </section>

          {/* Manufacturability */}
          <section className="card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-xl font-medium tracking-tight">Can we make it?</h2>
              <DfmPill level={dfm.level} unchecked={dfm.unchecked} best={dfm.best?.machine.name} />
            </div>
            <IssueList issues={dfm.notes} />
            {dfm.checks.length > 0 && (
              <div className="flex flex-col gap-3">
                {dfm.checks.map((c, i) => (
                  <details key={c.machine.id} open={i === 0} className="rounded-lg p-3" style={{ background: "var(--paper)" }}>
                    <summary className="flex items-center justify-between gap-2 cursor-pointer">
                      <span className="font-medium">
                        {c.machine.name}
                        {i === 0 && (
                          <span className="chip ml-2" style={{ color: "var(--purple-dark)" }}>
                            best fit
                          </span>
                        )}
                      </span>
                      <DfmPill level={c.level} unchecked={c.issues.filter((x) => x.text.endsWith("not checked")).length} />
                    </summary>
                    <div className="mt-2">
                      {c.issues.length ? <IssueList issues={c.issues} /> : <p className="text-sm" style={{ color: "var(--good)" }}>Everything checks out.</p>}
                    </div>
                  </details>
                ))}
              </div>
            )}
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Checked against <Link href="/tracker/machines" className="underline">Machines</Link>. Blank machine specs show as “not checked”.
            </p>
          </section>

          {/* Outline */}
          {p.kind === "plate" && (
            <section className="card p-4 flex flex-col gap-3">
              <h2 className="text-xl font-medium tracking-tight">Outline</h2>
              {g ? (
                <>
                  <div className="rounded-lg p-3" style={{ background: "var(--paper)" }}>
                    <Outline shape={g} className="w-full max-h-80" />
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <Stat label="Size" value={`${L(Math.min(g.width, g.height))} × ${L(Math.max(g.width, g.height))}`} />
                    <Stat label="Area" value={fmtArea(g.area, units)} />
                    <Stat label="Round holes" value={g.stats.holes.length ? `${g.stats.holes.length} · ${[...new Set(g.stats.holes.map((d) => L(d)))].slice(0, 4).join(", ")}` : "none"} />
                    <Stat label="Sharp inside corners" value={String(g.stats.sharpInside)} />
                    <Stat label="Narrowest slot" value={g.stats.minGap === null ? "—" : L(g.stats.minGap)} />
                    <Stat label="Thinnest web" value={g.stats.minWeb === null ? "—" : L(g.stats.minWeb)} />
                  </dl>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    From {g.from === "onshape" ? "the Onshape model (biggest flat face)" : "an uploaded DXF"}. Uploading a DXF replaces it.
                  </p>
                </>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  No outline yet. Upload the plate&apos;s DXF below{p.source ? ", or re-sync the design" : ""}.
                </p>
              )}
            </section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Material */}
          {(p.kind === "plate" || p.kind === "tube" || p.kind === "shaft") && (
            <section className="card p-4 flex flex-col gap-2">
              <h2 className="text-xl font-medium tracking-tight">Cut from</h2>
              {p.material_text && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Onshape material: {p.material_text}
                </p>
              )}
              <select
                className="input"
                value={p.material_id ?? ""}
                onChange={(e) => setMat.call({ id: p.id, material_id: e.target.value })}
                disabled={setMat.pending}
                aria-label="Stock material"
              >
                <option value="">— not matched —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {materialName(m)}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <span>{p.material_locked ? "Picked by hand — syncs won't change it." : material ? "Matched automatically." : "Nothing on the rack matches."}</span>
                {p.material_locked && (
                  <button type="button" className="underline" onClick={() => setMat.call({ id: p.id, material_id: "auto" })}>
                    Auto-match
                  </button>
                )}
              </div>
              {material && (
                <Link href={`/stock/${material.id}`} className="text-sm underline" style={{ color: "var(--purple)" }}>
                  See it on the rack →
                </Link>
              )}
              <ErrorText error={setMat.error} />
            </section>
          )}

          <Files part={p} files={files} />

          {/* Size */}
          <section className="card p-4">
            <h2 className="text-xl font-medium tracking-tight mb-2">Size</h2>
            <p className="mono text-sm">
              {p.size_l_mm === null ? "Unknown" : [p.size_l_mm, p.size_w_mm, p.size_t_mm].map((d) => L(d)).join(" × ")}
            </p>
            {p.notes && <p className="text-sm mt-2 whitespace-pre-wrap">{p.notes}</p>}
          </section>

          {Object.keys(p.properties).length > 0 && (
            <details className="card p-4">
              <summary className="text-xl font-medium tracking-tight cursor-pointer">Onshape properties</summary>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {Object.entries(p.properties).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt style={{ color: "var(--muted)" }}>{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          <section className="card p-4">
            <h2 className="text-xl font-medium tracking-tight mb-2">History</h2>
            {events.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Nothing yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span>{describePartEvent(e, p.kind)}</span>
                    <span className="mono text-xs shrink-0" style={{ color: "var(--muted)" }} title={fmtDateTime(e.occurred_at)}>
                      {timeAgo(e.occurred_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            type="button"
            className="btn btn-danger text-sm self-start"
            disabled={del.pending}
            onClick={() => {
              if (confirm(`Delete ${p.name} and its files? ${p.source ? "It comes back on the next sync if it's still in the design." : ""}`)) del.call({ id: p.id });
            }}
          >
            Delete part
          </button>
          <ErrorText error={del.error} />
        </div>
      </div>

      <EditSheet open={editing} onClose={() => setEditing(false)} part={p} units={units} need={need} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

/** Status name, including events logged before the board used the sheet's statuses. */
const label = (v: unknown) => (isJobStatus(v) ? STATUS_LABEL[v] : String(v ?? "?"));

function describePartEvent(e: FabPartEvent, kind: PartKind): string {
  void kind;
  const d = e.data as Record<string, string | number | boolean | undefined>;
  switch (e.type) {
    case "import":
      return d.by_hand ? "Added by hand" : `Loaded from ${d.design ?? "Onshape"}`;
    case "stage":
      return `${label(d.from)} → ${label(d.to)}${d.by ? ` · ${d.by}` : ""}`;
    case "assign":
      return d.mode === "remove" ? `${d.name} dropped it` : `${d.name} took it`;
    case "file":
      return d.removed ? `Removed ${d.name}` : `Added ${d.name}${d.from ? ` from ${d.from}` : ""}`;
    case "cut":
      return `Cut ${d.count} from a ${d.from} on the rack (${d.total}/${d.of})${d.moved_to ? ` → ${label(d.moved_to)}` : ""}`;
    case "edit":
      return `Edited ${d.fields ?? ""}`;
  }
}

function Files({ part, files }: { part: FabPart; files: FabPartFile[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [units, setUnits] = useState("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const remove = useFabAction(deleteFile);
  const onshape = useFabAction(fetchOnshapeFile, () => setMsg("Saved from Onshape."));
  const router = useRouter();

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setErr(null);
    setMsg(null);
    const sb = supabaseBrowser();
    if (!sb) {
      setErr("File storage isn't configured");
      return;
    }
    for (const file of Array.from(list)) {
      setBusy(`Uploading ${file.name}…`);
      const fd = new FormData();
      fd.set("part_id", part.id);
      fd.set("name", file.name);
      const u = await fileUploadUrl(fd);
      if (!u.ok || !u.data) {
        setErr(u.ok ? "Upload failed" : u.error);
        break;
      }
      const up = await sb.storage.from("fab-files").uploadToSignedUrl(u.data.path, u.data.token, file);
      if (up.error) {
        setErr(up.error.message);
        break;
      }
      const rec = new FormData();
      rec.set("part_id", part.id);
      rec.set("path", u.data.path);
      rec.set("name", file.name);
      rec.set("size", String(file.size));
      rec.set("units", units);
      const r = await recordFile(rec);
      if (!r.ok) {
        setErr(r.error);
        break;
      }
      if (r.data) setMsg(`Outline updated · ${r.data}`);
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <section className="card p-4 flex flex-col gap-3">
      <h2 className="text-xl font-medium tracking-tight">Files</h2>
      {files.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No files yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <span className="chip shrink-0 w-12 justify-center">{FILE_ICON[f.kind]}</span>
              <a href={`/api/parts/files/${f.id}`} className="min-w-0 flex-1 truncate underline text-sm" style={{ color: "var(--purple)" }}>
                {f.name}
              </a>
              <span className="mono text-xs shrink-0" style={{ color: "var(--muted)" }}>
                {f.source === "onshape" ? "Onshape" : f.size_bytes ? `${Math.max(1, Math.round(f.size_bytes / 1024))} KB` : ""}
              </span>
              {(f.kind === "pdf" || f.kind === "image") && (
                <a href={`/api/parts/files/${f.id}?view=1`} target="_blank" rel="noreferrer" className="text-xs underline shrink-0">
                  View
                </a>
              )}
              <button
                type="button"
                className="text-xs shrink-0"
                style={{ color: "var(--muted)" }}
                aria-label={`Delete ${f.name}`}
                onClick={() => {
                  if (confirm(`Delete ${f.name}?`)) remove.call({ id: f.id });
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} accept=".dxf,.step,.stp,.stl,.3mf,.pdf,.png,.jpg,.jpeg,.gcode,.nc,.tap,.crv,.f3d,image/*" />
        <button type="button" className="btn btn-ghost text-sm" disabled={!!busy} onClick={() => input.current?.click()}>
          Upload files
        </button>
        {part.kind === "plate" && (
          <label className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
            DXF units
            <select className="input py-1 text-xs w-auto" style={{ minHeight: 30 }} value={units} onChange={(e) => setUnits(e.target.value)}>
              <option value="auto">auto</option>
              <option value="in">inch</option>
              <option value="mm">mm</option>
            </select>
          </label>
        )}
        {part.source && (
          <>
            <button type="button" className="btn btn-ghost text-sm" disabled={onshape.pending} onClick={() => onshape.call({ part_id: part.id, format: "STEP" })}>
              {onshape.pending ? "Exporting…" : "STEP from Onshape"}
            </button>
            {part.kind === "print" && (
              <button type="button" className="btn btn-ghost text-sm" disabled={onshape.pending} onClick={() => onshape.call({ part_id: part.id, format: "STL" })}>
                STL from Onshape
              </button>
            )}
          </>
        )}
      </div>
      {busy && <p className="text-sm">{busy}</p>}
      {msg && (
        <p className="text-sm" style={{ color: "var(--good)" }}>
          {msg}
        </p>
      )}
      <ErrorText error={err ?? remove.error ?? onshape.error} />
    </section>
  );
}

function T({ name, label, value, placeholder }: { name: string; label: string; value: string; placeholder?: string }) {
  return (
    <Field label={label}>
      <input name={name} className="input" defaultValue={value} placeholder={placeholder} autoComplete="off" />
    </Field>
  );
}

function EditSheet({ open, onClose, part: p, units, need }: { open: boolean; onClose: () => void; part: FabPart; units: Units; need: number }) {
  const [note, setNote] = useState<string | null>(null);
  const save = useFabAction(updatePart, (n) => (n ? setNote(n) : onClose()));
  const print = p.kind === "print";
  return (
    <Sheet open={open} onClose={onClose} eyebrow="Part" title="Edit">
      <form className="flex flex-col gap-3" onSubmit={save.submit}>
        <input type="hidden" name="id" value={p.id} />
        <T name="name" label="Part # / name" value={p.name} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Status">
            <select name="status" className="input" defaultValue={p.status}>
              {(STATUSES[trackerOf(p.kind)].includes(p.status) ? STATUSES[trackerOf(p.kind)] : [p.status, ...STATUSES[trackerOf(p.kind)]]).map((st: JobStatus) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority" className="input" defaultValue={p.priority ?? ""}>
              <option value="">—</option>
              {PRIORITIES.map((n) => (
                <option key={n} value={n}>
                  #{n}
                  {n === 0 ? " (urgent)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <T name="bot" label="Bot" value={p.bot} />
          <T name="subsystem" label="Subsystem" value={p.subsystem} />
          <Field label="Kind" hint="Its board, DFM checks and stock">
            <select name="kind" className="input" defaultValue={p.kind}>
              {PART_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <T name="dri" label="DRI" value={p.assignees.join(", ")} placeholder="Names, comma-separated" />
          <Field label="Qty per robot">
            <input name="quantity" type="number" min={0} className="input mono" defaultValue={p.quantity} />
          </Field>
          <Field label="Spare qty">
            <input name="spare_qty" type="number" min={0} className="input mono" defaultValue={p.spare_qty} />
          </Field>
        </div>
        {print ? (
          <div className="grid grid-cols-2 gap-2">
            <T name="material" label="Filament" value={p.material_text} />
            <T name="infill" label="Infill" value={p.infill} />
            <T name="designer" label="Designer" value={p.designer} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <T name="material" label="Stock material / type" value={p.material_text} />
            <T name="stock_dims" label="Stock dimensions" value={p.stock_dims} placeholder='1/8" thick' />
            <T name="length" label="Length (as on the sheet)" value={p.length_text} />
            <T name="tapped" label="Tapped?" value={p.tapped} />
            <T name="machine" label="Machine" value={p.machine} />
          </div>
        )}
        <T name="file" label={print ? "STL file" : "Drawing / CAM file"} value={p.file} placeholder="File name or a Drive / Onshape link" />
        <Field label="Already cut" hint={`Of ${need}. Counted automatically when stock comes off the rack.`}>
          <input name="cut_qty" type="number" min={0} className="input mono" defaultValue={p.cut_qty} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <LengthInput name="size_l_mm" label="Length" units={units} defaultMm={p.size_l_mm} />
          <LengthInput name="size_w_mm" label="Width" units={units} defaultMm={p.size_w_mm} />
          <LengthInput name="size_t_mm" label="Thickness" units={units} defaultMm={p.size_t_mm} />
        </div>
        <Field label="Notes">
          <textarea name="notes" className="input" rows={3} defaultValue={p.notes} />
        </Field>
        <ErrorText error={save.error} />
        {note ? (
          <>
            <p className="text-sm" role="status" style={{ color: /^Took/.test(note) ? "var(--good)" : "var(--warn)" }}>
              Saved. {note}
            </p>
            <button type="button" className="btn btn-primary py-3" onClick={onClose}>
              Done <span aria-hidden>→</span>
            </button>
          </>
        ) : (
          <SubmitButton pending={save.pending} label="Save" />
        )}
      </form>
    </Sheet>
  );
}
