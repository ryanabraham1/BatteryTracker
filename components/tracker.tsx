"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addPart, deletePart, importSheet, setPartStatus, updatePart } from "@/app/parts-actions";
import { isStockKind, KIND_LABEL, needed, PART_KINDS, type FabPart, type PartKind } from "@/lib/parts";
import {
  isDone,
  isUrl,
  linearKey,
  priorityLabel,
  PRIORITIES,
  readSheet,
  STATUS_LABEL,
  STATUS_TONE,
  STATUSES,
  SUGGEST,
  TRACKER_LABEL,
  type JobStatus,
  type Tracker,
} from "@/lib/tracker";
import { timeAgo } from "@/lib/format";
import { Sheet } from "./sheet";
import { Empty } from "./ui";
import { ErrorText, Field, SubmitButton, useFabAction } from "./fab-ui";

type Stock = Record<string, { name: string; onHand: string; low: boolean }>;
type FabJob = FabPart;

/** A part's sheet column by the sheet's name. */
function col(j: FabPart, k: string): string {
  switch (k) {
    case "material":
      return j.material_text;
    case "length":
      return j.length_text;
    case "dri":
      return j.assignees.join(", ");
    default:
      return String((j as unknown as Record<string, unknown>)[k] ?? "");
  }
}
type StatusFilter = "open" | "all" | JobStatus;

const byOrder = (list: string[]) => (a: string, b: string) => {
  const i = list.findIndex((x) => x.toLowerCase() === a.toLowerCase());
  const j = list.findIndex((x) => x.toLowerCase() === b.toLowerCase());
  return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b);
};

/** Distinct non-empty values, with the sheet's list first. */
function options(base: string[], jobs: FabJob[], key: string): string[] {
  const seen = new Map<string, string>();
  for (const v of [...base, ...jobs.map((j) => col(j, key).trim())]) if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  return [...seen.values()];
}

export function TrackerTable({
  tracker,
  parts: jobs,
  stock,
  copies,
  person,
}: {
  tracker: Tracker;
  parts: FabPart[];
  stock: Stock;
  copies: Record<string, number>;
  person: string;
}) {
  const print = tracker === "print";
  const [status, setStatus] = useState<StatusFilter>("open");
  const [bot, setBot] = useState("");
  const [subsystem, setSubsystem] = useState("");
  const [machine, setMachine] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<FabJob | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const machineKey = print ? "material" : "machine";
  const bots = useMemo(() => options([], jobs, "bot").sort(byOrder(SUGGEST.bot)), [jobs]);
  const subsystems = useMemo(() => options([], jobs, "subsystem").sort(byOrder(SUGGEST.subsystem)), [jobs]);
  const machines = useMemo(() => options([], jobs, machineKey).sort(byOrder(print ? SUGGEST.filament : SUGGEST.machine)), [jobs, machineKey, print]);

  // counts ignore the status filter so the chips say what each one would show
  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (!bot || j.bot.toLowerCase() === bot.toLowerCase()) &&
        (!subsystem || j.subsystem.toLowerCase() === subsystem.toLowerCase()) &&
        (!machine || col(j, machineKey).toLowerCase() === machine.toLowerCase()) &&
        (!needle || [j.name, j.notes, j.material_text, j.file, j.assignees.join(" "), j.designer, j.part_number, linearKey(j.linear_url) ?? ""].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [jobs, bot, subsystem, machine, machineKey, q]);
  const need = (j: FabPart) => needed(j, j.design_id ? (copies[j.design_id] ?? 1) : 1);

  const counts = useMemo(() => {
    const c = new Map<StatusFilter, number>([
      ["open", 0],
      ["all", base.length],
    ]);
    for (const j of base) {
      c.set(j.status, (c.get(j.status) ?? 0) + 1);
      if (!isDone(j.status)) c.set("open", c.get("open")! + 1);
    }
    return c;
  }, [base]);

  const groups = useMemo(() => {
    const shown = base.filter((j) => (status === "all" ? true : status === "open" ? !isDone(j.status) : j.status === status));
    const order = STATUSES[tracker];
    shown.sort(
      (a, b) =>
        (a.priority ?? 9) - (b.priority ?? 9) ||
        order.indexOf(a.status) - order.indexOf(b.status) ||
        a.bot.localeCompare(b.bot) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    const map = new Map<string, FabJob[]>();
    for (const j of shown) {
      const k = j.subsystem.trim() || "No subsystem";
      map.set(k, [...(map.get(k) ?? []), j]);
    }
    return [...map.entries()].sort(([a], [b]) => byOrder(SUGGEST.subsystem)(a, b));
  }, [base, status, tracker]);

  const total = jobs.length;
  const done = jobs.filter((j) => isDone(j.status)).length;
  const filtered = bot || subsystem || machine || q;

  return (
    <>
      {/* progress + actions */}
      <div className="card p-4 mb-3 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="display text-3xl">
              {done}/{total}
            </span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              parts finished
            </span>
          </div>
          <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: "var(--paper)" }}>
            <div className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, background: "var(--good)" }} />
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button type="button" className="btn btn-ghost text-sm flex-1 sm:flex-none" onClick={() => setImporting(true)}>
            Import from sheet
          </button>
          <button type="button" className="btn btn-primary text-sm flex-1 sm:flex-none" onClick={() => setEdit("new")}>
            Add part <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {/* status chips */}
      <div className="hscroll no-scrollbar flex gap-2 mb-3 -mx-4 px-4">
        {(["open", "all", ...STATUSES[tracker]] as StatusFilter[]).map((s) => {
          const n = counts.get(s) ?? 0;
          if (s !== "open" && s !== "all" && !n && status !== s) return null;
          return (
            <button key={s} type="button" className="tile tile-chip text-sm" data-selected={status === s} onClick={() => setStatus(s)}>
              {s === "open" ? "Still to make" : s === "all" ? "All" : STATUS_LABEL[s]} <span className="mono" style={{ color: "var(--muted)" }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <FilterSelect label="Bot" value={bot} onChange={setBot} options={bots} />
        <FilterSelect label="Subsystem" value={subsystem} onChange={setSubsystem} options={subsystems} />
        <FilterSelect label={print ? "Material" : "Machine"} value={machine} onChange={setMachine} options={machines} />
        <input className="input" placeholder="Search parts, notes, WB-…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the tracker" />
      </div>

      {total === 0 ? (
        <Empty>
          Nothing on the {TRACKER_LABEL[tracker].toLowerCase()} tracker yet. Copy the rows (with the header) out of the team sheet and use Import from sheet, add parts one at a time, or{" "}
          <Link href="/tracker/designs" className="underline" style={{ color: "var(--purple)" }}>
            load them from Onshape
          </Link>
          .
        </Empty>
      ) : groups.length === 0 ? (
        <Empty>
          Nothing matches.{" "}
          {(filtered || status !== "all") && (
            <button
              type="button"
              className="underline"
              onClick={() => {
                setBot("");
                setSubsystem("");
                setMachine("");
                setQ("");
                setStatus("all");
              }}
            >
              Clear filters
            </button>
          )}
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([name, rows]) => (
            <section key={name}>
              <h2 className="eyebrow mb-2 flex items-center gap-2" style={{ color: "var(--muted)" }}>
                {name} <span className="mono">{rows.length}</span>
              </h2>
              {/* phones: cards */}
              <ul className="md:hidden flex flex-col gap-2">
                {rows.map((j) => (
                  <li key={j.id} className="card p-3">
                    <JobCard job={j} print={print} stock={stock} need={need(j)} person={person} onOpen={() => setEdit(j)} />
                  </li>
                ))}
              </ul>
              {/* desktop: the sheet's columns */}
              <div className="hidden md:block card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left eyebrow" style={{ color: "var(--muted)" }}>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Pri</th>
                      <th className="px-3 py-2 font-medium">Part</th>
                      <th className="px-3 py-2 font-medium">Bot</th>
                      <th className="px-2 py-2 font-medium text-right">Qty</th>
                      {print ? (
                        <>
                          <th className="px-3 py-2 font-medium">Material</th>
                          <th className="px-3 py-2 font-medium">Infill</th>
                          <th className="px-3 py-2 font-medium">Designer · DRI</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2 font-medium">Kind</th>
                          <th className="px-3 py-2 font-medium">Stock</th>
                          <th className="px-3 py-2 font-medium">Length</th>
                          <th className="px-3 py-2 font-medium">Tapped</th>
                          <th className="px-3 py-2 font-medium">Machine</th>
                        </>
                      )}
                      <th className="px-3 py-2 font-medium">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((j) => (
                      <tr
                        key={j.id}
                        className="border-t cursor-pointer align-top hover:bg-[var(--paper)]"
                        style={{ borderColor: "var(--line)", opacity: isDone(j.status) ? 0.6 : 1 }}
                        onClick={() => setEdit(j)}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <StatusSelect key={`${j.id}-${j.status}`} job={j} person={person} />
                        </td>
                        <td className="px-2 py-2 mono font-semibold" style={{ color: j.priority === 0 ? "var(--bad)" : undefined }}>
                          {priorityLabel(j.priority)}
                        </td>
                        <td className="px-3 py-2 min-w-[200px]">
                          <Link href={`/tracker/${j.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                            {j.name}
                          </Link>
                          {j.linear_url && <LinearLink url={j.linear_url} />}
                          {j.assignees.length > 0 && (
                            <span className="block text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                              DRI {j.assignees.join(", ")}
                            </span>
                          )}
                          {j.notes && (
                            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--muted)" }}>
                              {j.notes}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{j.bot}</td>
                        <td className="px-2 py-2 mono text-right whitespace-nowrap" title={need(j) !== j.quantity + j.spare_qty ? `${need(j)} across all robots` : undefined}>
                          {j.quantity}
                          {j.spare_qty > 0 && <span style={{ color: "var(--muted)" }}> +{j.spare_qty}</span>}
                          {j.cut_qty > 0 && isStockKind(j.kind) && j.cut_qty < need(j) && (
                            <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
                              cut {j.cut_qty}/{need(j)}
                            </span>
                          )}
                        </td>
                        {print ? (
                          <>
                            <td className="px-3 py-2 whitespace-nowrap">{j.material_text}</td>
                            <td className="px-3 py-2">{j.infill}</td>
                            <td className="px-3 py-2">{[j.designer, j.assignees.join(", ")].filter(Boolean).join(" · ")}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 whitespace-nowrap text-xs">{KIND_LABEL[j.kind]}</td>
                            <td className="px-3 py-2 min-w-[160px]">
                              {j.material_text}
                              {j.stock_dims && (
                                <span className="block text-xs mono" style={{ color: "var(--muted)" }}>
                                  {j.stock_dims}
                                </span>
                              )}
                              <StockNote job={j} stock={stock} />
                            </td>
                            <td className="px-3 py-2 mono whitespace-nowrap">{j.length_text}</td>
                            <td className="px-3 py-2">{j.tapped}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{j.machine}</td>
                          </>
                        )}
                        <td className="px-3 py-2 max-w-[220px]" onClick={(e) => isUrl(j.file) && e.stopPropagation()}>
                          <FileCell file={j.file} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet open={edit !== null} onClose={() => setEdit(null)} eyebrow={TRACKER_LABEL[tracker]} title={edit === "new" ? "Add part" : "Edit part"}>
        {edit !== null && (
          <JobForm
            key={edit === "new" ? "new" : edit.id}
            tracker={tracker}
            job={edit === "new" ? null : edit}
            jobs={jobs}
            stock={stock}
            person={person}
            defaults={{ bot, subsystem }}
            onDone={() => setEdit(null)}
          />
        )}
      </Sheet>
      <Sheet open={importing} onClose={() => setImporting(false)} eyebrow={TRACKER_LABEL[tracker]} title="Import from sheet">
        {importing && <ImportForm tracker={tracker} onDone={() => setImporting(false)} />}
      </Sheet>
    </>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ color: value ? undefined : "var(--muted)" }}>
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * Status as a pill you can change in place. Moving a stock part to In
 * Progress / Finished takes its stock off the rack; the note says what.
 */
function StatusSelect({ job, person }: { job: FabJob; person: string }) {
  const [note, setNote] = useState<string | null>(null);
  const a = useFabAction(setPartStatus, (n) => setNote(n || null));
  const [picked, setShown] = useState(job.status);
  // a failed save falls back to what the server has
  const shown = a.error ? job.status : picked;
  const tone = STATUS_TONE[shown];
  const list = STATUSES[job.kind === "print" ? "print" : "machining"];
  const opts = list.includes(job.status) ? list : [job.status, ...list];
  return (
    <span className="inline-flex flex-col gap-0.5">
      <select
        className={`pill pill-${tone} cursor-pointer`}
        style={{ appearance: "auto", border: 0, opacity: a.pending ? 0.6 : 1, maxWidth: 170 }}
        value={shown}
        disabled={a.pending}
        onChange={(e) => {
          const s = e.target.value as JobStatus;
          setShown(s);
          setNote(null);
          a.call({ id: job.id, status: s, by: person });
        }}
        aria-label={`Status of ${job.name}`}
        title={`Since ${timeAgo(job.status_changed_at)}`}
      >
        {opts.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {a.error && (
        <span className="text-xs" style={{ color: "var(--bad)" }}>
          {a.error}
        </span>
      )}
      {note && (
        <span className="text-xs max-w-[200px]" style={{ color: /^Took/.test(note) ? "var(--good)" : "var(--warn)" }} role="status">
          {note}
        </span>
      )}
    </span>
  );
}

function JobCard({ job: j, print, stock, need, person, onOpen }: { job: FabJob; print: boolean; stock: Stock; need: number; person: string; onOpen: () => void }) {
  const dri = j.assignees.join(", ");
  const details = print
    ? [j.material_text, j.infill && `${j.infill} infill`, j.designer, dri && `DRI ${dri}`]
    : [KIND_LABEL[j.kind], j.material_text, j.stock_dims, j.length_text && `L ${j.length_text}`, j.tapped && `tap: ${j.tapped}`, j.machine, dri && `DRI ${dri}`];
  return (
    <div className="flex flex-col gap-2" style={{ opacity: isDone(j.status) ? 0.65 : 1 }}>
      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <span className="font-medium break-words">
            {j.priority !== null && (
              <span className="mono mr-1.5" style={{ color: j.priority === 0 ? "var(--bad)" : "var(--muted)" }}>
                {priorityLabel(j.priority)}
              </span>
            )}
            {j.name}
          </span>
          <span className="block text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {j.bot || "No bot"} · {j.quantity}
            {j.spare_qty > 0 && ` + ${j.spare_qty} spare`}
            {j.cut_qty > 0 && isStockKind(j.kind) && j.cut_qty < need && ` · cut ${j.cut_qty}/${need}`}
          </span>
        </button>
        <StatusSelect key={`${j.id}-${j.status}`} job={j} person={person} />
      </div>
      <button type="button" className="flex flex-wrap gap-1.5 text-left" onClick={onOpen}>
        {details.filter(Boolean).map((d, i) => (
          <span key={i} className="chip">
            {d}
          </span>
        ))}
      </button>
      {!print && <StockNote job={j} stock={stock} />}
      <div className="flex items-center gap-2 text-xs min-w-0">
        <FileCell file={j.file} />
        {j.linear_url && <LinearLink url={j.linear_url} />}
        <Link href={`/tracker/${j.id}`} className="ml-auto underline shrink-0" style={{ color: "var(--purple)" }}>
          Files &amp; checks →
        </Link>
      </div>
      {j.notes && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {j.notes}
        </p>
      )}
    </div>
  );
}

function StockNote({ job, stock }: { job: FabJob; stock: Stock }) {
  const s = job.material_id ? stock[job.material_id] : undefined;
  if (!s) return null;
  return (
    <a href={`/stock/${job.material_id}`} className="block text-xs mt-0.5 underline" style={{ color: s.low ? "var(--warn)" : "var(--good)" }} onClick={(e) => e.stopPropagation()}>
      {s.onHand}
    </a>
  );
}

function FileCell({ file }: { file: string }) {
  if (!file.trim()) return null;
  if (isUrl(file)) {
    const host = file.includes("drive.google") ? "Drive" : file.includes("onshape") ? "Onshape" : "Link";
    return (
      <a href={file} target="_blank" rel="noreferrer" className="chip underline">
        {host} ↗
      </a>
    );
  }
  return (
    <span className="mono text-xs break-all" style={{ color: "var(--muted)" }} title={file}>
      {file}
    </span>
  );
}

function LinearLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="ml-1.5 mono text-xs underline whitespace-nowrap"
      style={{ color: "var(--purple)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {linearKey(url) ?? "Linear"} ↗
    </a>
  );
}

function TextField({ name, label, value, list, placeholder }: { name: string; label: string; value: string; list?: string; placeholder?: string }) {
  return (
    <Field label={label}>
      <input name={name} className="input" defaultValue={value} list={list} placeholder={placeholder} autoComplete="off" />
    </Field>
  );
}

function JobForm({
  tracker,
  job,
  jobs,
  stock,
  person,
  defaults,
  onDone,
}: {
  tracker: Tracker;
  job: FabJob | null;
  jobs: FabJob[];
  stock: Stock;
  person: string;
  defaults: { bot: string; subsystem: string };
  onDone: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const a = useFabAction(job ? updatePart : addPart, (n) => {
    // a status change that took stock says so before closing
    if (job && typeof n === "string" && n) setNote(n);
    else onDone();
  });
  const del = useFabAction(deletePart, onDone);
  const [kind, setKind] = useState<PartKind | "">(job?.kind ?? "");
  const [confirm, setConfirm] = useState(false);
  const print = tracker === "print";
  const j = job;
  const v = (k: string) => (j ? col(j, k) : "");
  const lists = {
    bot: options(SUGGEST.bot, jobs, "bot"),
    subsystem: options(SUGGEST.subsystem, jobs, "subsystem"),
    material: options(print ? SUGGEST.filament : SUGGEST.material, jobs, "material"),
    stock_dims: options(SUGGEST.stock_dims, jobs, "stock_dims"),
    machine: options(SUGGEST.machine, jobs, "machine"),
    tapped: options(SUGGEST.tapped, jobs, "tapped"),
  };
  const stockList = Object.entries(stock).sort(([, x], [, y]) => x.name.localeCompare(y.name));

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={a.submit} className="flex flex-col gap-3">
        {Object.entries(lists).map(([k, opts]) => (
          <datalist key={k} id={`tr-${k}`}>
            {opts.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        ))}
        {j && <input type="hidden" name="id" value={j.id} />}
        <input type="hidden" name="tracker" value={tracker} />
        <input type="hidden" name="by" value={person} />
        <TextField name="name" label="Part # / name" value={v("name")} placeholder="0201_Mounting_Plate" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Status">
            <select name="status" className="input" defaultValue={j?.status ?? "not_started"}>
              {(j && !STATUSES[tracker].includes(j.status) ? [j.status, ...STATUSES[tracker]] : STATUSES[tracker]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority" className="input" defaultValue={j?.priority ?? ""}>
              <option value="">—</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  #{p}
                  {p === 0 ? " (urgent)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <TextField name="bot" label="Bot" value={j ? v("bot") : defaults.bot} list="tr-bot" />
          <TextField name="subsystem" label="Subsystem" value={j ? v("subsystem") : defaults.subsystem} list="tr-subsystem" />
          <Field label="Qty">
            <input name="quantity" type="number" min="0" inputMode="numeric" className="input mono" defaultValue={j?.quantity ?? 1} />
          </Field>
          <Field label="Spare qty">
            <input name="spare_qty" type="number" min="0" inputMode="numeric" className="input mono" defaultValue={j?.spare_qty ?? 0} />
          </Field>
        </div>
        {print ? (
          <div className="grid grid-cols-2 gap-2">
            <TextField name="material" label="Material" value={v("material")} list="tr-material" />
            <TextField name="infill" label="Infill" value={v("infill")} placeholder="40%" />
            <TextField name="designer" label="Designer" value={v("designer")} />
            <TextField name="dri" label="DRI" value={v("dri")} />
          </div>
        ) : (
          <>
            <Field label="Kind" hint="How it's made — picks its board, DFM checks and stock. Blank = from the material.">
              <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as PartKind | "")}>
                {!j && <option value="">From the material</option>}
                {PART_KINDS.filter((k) => k !== "print").map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <TextField name="material" label="Stock material / type" value={v("material")} list="tr-material" />
              <TextField name="stock_dims" label="Stock dimensions" value={v("stock_dims")} list="tr-stock_dims" />
              <TextField name="length" label="Length" value={v("length")} placeholder='18.5"' />
              <TextField name="tapped" label="Tapped?" value={v("tapped")} list="tr-tapped" />
              <TextField name="machine" label="Machine" value={v("machine")} list="tr-machine" />
              <TextField name="dri" label="DRI" value={v("dri")} />
            </div>
            <Field label="Cut from (on the rack)" hint="Matched from the material and dims automatically; pick one to lock it. Stock is taken off the rack when the part goes In Progress / Finished.">
              <select name="material_id" className="input" defaultValue={j?.material_locked ? (j.material_id ?? "") : "auto"}>
                <option value="auto">Auto{j?.material_id && !j.material_locked && stock[j.material_id] ? ` (${stock[j.material_id].name})` : ""}</option>
                <option value="">None</option>
                {stockList.map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.name} — {s.onHand}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <TextField name="file" label={print ? "STL file" : "Drawing / CAM file (STEP)"} value={v("file")} placeholder="File name or a Drive / Onshape link" />
        <TextField name="linear_url" label="Linear issue" value={v("linear_url")} placeholder="https://linear.app/warriorborgs/issue/WB-…" />
        <Field label="Notes">
          <textarea name="notes" className="input" rows={2} defaultValue={v("notes")} />
        </Field>
        {print && <input type="hidden" name="kind" value="print" />}
        <ErrorText error={a.error} />
        {note ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: /^Took/.test(note) ? "var(--good)" : "var(--warn)" }} role="status">
              Saved. {note}
            </p>
            <button type="button" className="btn btn-primary py-3" onClick={onDone}>
              Done <span aria-hidden>→</span>
            </button>
          </div>
        ) : (
          <SubmitButton pending={a.pending} label={j ? "Save" : "Add to tracker"} />
        )}
        {j && (
          <Link href={`/tracker/${j.id}`} className="btn btn-ghost">
            Files, DFM checks &amp; history <span aria-hidden>→</span>
          </Link>
        )}
      </form>
      {j && (
        <div className="pt-4 border-t flex flex-col gap-2" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {STATUS_LABEL[j.status]} since {timeAgo(j.status_changed_at)} · added {timeAgo(j.created_at)}
          </p>
          <ErrorText error={del.error} />
          {confirm ? (
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setConfirm(false)}>
                Keep it
              </button>
              <button type="button" className="btn btn-danger flex-1" disabled={del.pending} onClick={() => del.call({ id: j.id })}>
                {del.pending ? "Deleting…" : "Delete for good"}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
              Delete part
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ImportForm({ tracker, onDone }: { tracker: Tracker; onDone: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null);
  const a = useFabAction(importSheet, (r) => {
    if (r) setResult(r);
  });
  const read = useMemo(() => (text.trim() ? readSheet(text) : null), [text]);

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          Added <b>{result.added}</b> and updated <b>{result.updated}</b> {result.added + result.updated === 1 ? "part" : "parts"}.
        </p>
        <button type="button" className="btn btn-primary py-3" onClick={onDone}>
          Done <span aria-hidden>→</span>
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={a.submit} className="flex flex-col gap-3">
      <input type="hidden" name="tracker" value={tracker} />
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        In the {tracker === "print" ? "3D Printing" : "Machining"} Tracker tab, select from the header row (Status, Bot, …) down to the last part, copy, and paste here. A CSV
        export works too. Parts already here (same bot and name, including ones synced from Onshape) are updated, not doubled.
      </p>
      <textarea
        name="text"
        className="input mono text-xs"
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Status\tBot\tSubsystem\tPart #_Name\tPriority\tQty\t…"}
        spellCheck={false}
      />
      {read?.error && <p className="text-sm" style={{ color: "var(--warn)" }}>{read.error}</p>}
      {read && !read.error && (
        <div className="card p-3 text-sm flex flex-col gap-1" style={{ background: "var(--paper)" }}>
          <p>
            <b>{read.rows.length}</b> parts found{read.skipped ? ` · ${read.skipped} blank / section rows skipped` : ""}
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Columns: {read.columns.join(", ")}
          </p>
          <ul className="text-xs mt-1 flex flex-col gap-0.5">
            {read.rows.slice(0, 4).map((r, i) => (
              <li key={i} className="truncate">
                <span className={`pill pill-${STATUS_TONE[r.status]} mr-1`}>{STATUS_LABEL[r.status]}</span>
                {r.name} {r.bot && <span style={{ color: "var(--muted)" }}>· {r.bot}</span>}
              </li>
            ))}
            {read.rows.length > 4 && <li style={{ color: "var(--muted)" }}>…and {read.rows.length - 4} more</li>}
          </ul>
        </div>
      )}
      <ErrorText error={a.error} />
      <button type="submit" className="btn btn-primary py-3" disabled={a.pending || !read || !!read.error || !read.rows.length}>
        {a.pending ? "Importing…" : read?.rows.length ? `Import ${read.rows.length} parts` : "Import"} <span aria-hidden>→</span>
      </button>
    </form>
  );
}
