"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addPart, assignPart, movePart } from "@/app/parts-actions";
import { KIND_HINT, KIND_LABEL, PART_KINDS, STAGES, stageOf, type PartKind } from "@/lib/parts";
import type { Level } from "@/lib/dfm";
import type { Loop } from "@/lib/geom";
import { materialName, type FabMaterial } from "@/lib/fab";
import { fmtLength, type Units } from "@/lib/units";
import { timeAgo } from "@/lib/format";
import { Sheet } from "./sheet";
import { Empty } from "./ui";
import { Assignees, DfmPill, Outline, PersonChip } from "./parts-ui";
import { ErrorText, Field, LengthInput, SubmitButton, useFabAction } from "./fab-ui";

export interface BoardPart {
  id: string;
  name: string;
  part_number: string;
  kind: PartKind;
  stage: string;
  stage_changed_at: string;
  quantity: number;
  copies: number;
  cut_qty: number;
  assignees: string[];
  design_id: string | null;
  material: string;
  materialId: string | null;
  size: (number | null)[];
  outline: { loops: Loop[]; width: number; height: number } | null;
  dfm: { level: Level; unchecked: number; best: string | null };
  files: number;
}

export function PartsBoard({
  parts,
  designs,
  materials,
  person,
  units,
}: {
  parts: BoardPart[];
  designs: { id: string; name: string }[];
  materials: FabMaterial[];
  person: string;
  units: Units;
}) {
  const sp = useSearchParams();
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const router = useRouter();
  const kindParam = sp.get("kind");
  const kind: PartKind = PART_KINDS.includes(kindParam as PartKind) ? (kindParam as PartKind) : "plate";
  const setKind = (k: PartKind) => {
    const next = new URLSearchParams(sp.toString());
    next.set("kind", k);
    router.replace(`/parts?${next.toString()}`, { scroll: false });
  };
  const [design, setDesign] = useState("");
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState<BoardPart | null>(null);
  const [adding, setAdding] = useState(false);
  // moves show at once; the server catches up on refresh
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const stages = STAGES[kind];
  const [tab, setTab] = useState<string>(stages[0].key);
  const tabKey = stages.some((s) => s.key === tab) ? tab : stages[0].key;

  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase();
    return parts
      .map((p) => (moved[p.id] ? { ...p, stage: moved[p.id] } : p))
      .filter((p) => (!design || p.design_id === design) && (!mine || p.assignees.some((a) => norm(a) === norm(person))))
      .filter((p) => !q || norm(`${p.name} ${p.part_number} ${p.material} ${p.assignees.join(" ")}`).includes(q));
  }, [parts, moved, design, mine, person, q]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(PART_KINDS.map((k) => [k, 0])) as Record<PartKind, number>;
    for (const p of filtered) if (p.stage !== "done") c[p.kind]++;
    return c;
  }, [filtered]);

  const columns = useMemo(() => {
    const by: Record<string, BoardPart[]> = Object.fromEntries(stages.map((s) => [s.key, []]));
    for (const p of filtered) if (p.kind === kind) (by[p.stage] ?? by[stages[0].key]).push(p);
    for (const k of Object.keys(by)) by[k].sort((a, b) => a.stage_changed_at.localeCompare(b.stage_changed_at));
    return by;
  }, [filtered, kind, stages]);

  function move(p: BoardPart, stage: string) {
    if (p.stage === stage) return;
    setMoved((m) => ({ ...m, [p.id]: stage }));
    start(async () => {
      const fd = new FormData();
      fd.set("id", p.id);
      fd.set("stage", stage);
      fd.set("by", person);
      const r = await movePart(fd);
      if (!r.ok) {
        setMoved((m) => {
          const { [p.id]: _, ...rest } = m;
          void _;
          return rest;
        });
        alert(r.error);
      }
    });
  }

  const [dragOver, setDragOver] = useState<string | null>(null);
  const onDrop = (e: DragEvent, stage: string) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/part");
    const p = filtered.find((x) => x.id === id);
    if (p) move(p, stage);
  };

  const totalParts = parts.length;

  return (
    <>
      {/* Kind boards */}
      <div className="hscroll no-scrollbar mb-3 pb-1" role="tablist" aria-label="Part kind">
        {PART_KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className="tile tile-chip text-sm flex items-center gap-2" data-selected={kind === k} onClick={() => setKind(k)}>
            <span className="font-medium">{KIND_LABEL[k]}</span>
            <span className="mono text-xs font-semibold" style={{ color: kind === k ? "var(--purple-dark)" : "var(--muted)" }}>
              {counts[k]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className="input w-auto py-1.5 text-sm" style={{ minHeight: 38 }} value={design} onChange={(e) => setDesign(e.target.value)} aria-label="Design">
          <option value="">All designs</option>
          {designs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="button" className="tile tile-chip text-sm" data-selected={mine} onClick={() => setMine(!mine)} disabled={!person} title={person ? "" : "Pick who you are first"}>
          {mine ? "Mine ✓" : "Mine"}
        </button>
        <span className="text-sm hidden sm:inline" style={{ color: "var(--muted)" }}>
          {KIND_HINT[kind]}
        </span>
        <div className="ml-auto flex gap-2">
          <Link href="/parts/plan" className="btn btn-ghost text-sm">
            Cut plan
          </Link>
          <button type="button" className="btn btn-primary text-sm" onClick={() => setAdding(true)}>
            Add part
          </button>
        </div>
      </div>

      {q && (
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Matching “{q}” · <Link href="/parts" className="underline">clear</Link>
        </p>
      )}

      {totalParts === 0 ? (
        <Empty>
          No parts yet.{" "}
          <Link href="/parts/designs" className="underline" style={{ color: "var(--purple)" }}>
            Link an Onshape design
          </Link>{" "}
          to load its parts, or add one by hand.
        </Empty>
      ) : (
        <>
          {/* Phones: one column at a time */}
          <div className="md:hidden hscroll no-scrollbar mb-3 pb-1" role="tablist" aria-label="Column">
            {stages.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={tabKey === s.key} className="tile tile-chip text-sm flex items-center gap-2" data-selected={tabKey === s.key} onClick={() => setTab(s.key)}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${s.tone === "muted" ? "muted" : s.tone})` }} />
                {s.label}
                <span className="mono text-xs font-semibold" style={{ color: "var(--muted)" }}>
                  {columns[s.key].length}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:gap-4" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }} data-cols>
            {stages.map((s) => (
              <section
                key={s.key}
                className={`min-w-0 rounded-xl md:p-2 transition-colors ${tabKey === s.key ? "col-span-full md:col-span-1" : "hidden md:block"}`}
                style={{ background: dragOver === s.key ? "var(--purple-soft)" : "transparent", outline: dragOver === s.key ? "2px dashed var(--purple)" : "none" }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(s.key);
                }}
                onDragLeave={() => setDragOver((d) => (d === s.key ? null : d))}
                onDrop={(e) => onDrop(e, s.key)}
              >
                <header className="hidden md:flex items-center justify-between mb-2 px-0.5">
                  <h2 className="eyebrow flex items-center gap-2" style={{ color: `var(--${s.tone === "muted" ? "muted" : s.tone})` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: `var(--${s.tone === "muted" ? "muted" : s.tone})` }} />
                    {s.label}
                  </h2>
                  <span className="mono text-xs font-semibold" style={{ color: "var(--muted)" }}>
                    {columns[s.key].length}
                  </span>
                </header>
                <div className="flex flex-col gap-2 min-h-16">
                  {columns[s.key].map((p) => (
                    <PartCard key={p.id} p={p} units={units} onOpen={() => setOpen(p)} />
                  ))}
                  {columns[s.key].length === 0 && (
                    <p className="text-xs text-center py-6 rounded-lg" style={{ color: "var(--muted)", border: "1px dashed var(--line)" }}>
                      Nothing here
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <PartSheet part={open ? { ...open, stage: moved[open.id] ?? open.stage } : null} person={person} onClose={() => setOpen(null)} onMove={move} units={units} />
      <AddPartSheet open={adding} onClose={() => setAdding(false)} kind={kind} designs={designs} materials={materials} units={units} />
    </>
  );
}

function sizeText(p: BoardPart, units: Units): string {
  const [l, w, t] = p.size;
  if (l === null) return "";
  if (p.kind === "plate") return `${fmtLength(w, units)} × ${fmtLength(l, units)}${t !== null ? ` · ${fmtLength(t, units)} thk` : ""}`;
  if (p.kind === "tube" || p.kind === "shaft") return `${fmtLength(l, units)} long`;
  return [l, w, t].map((d) => fmtLength(d, units)).join(" × ");
}

function PartCard({ p, units, onOpen }: { p: BoardPart; units: Units; onOpen: () => void }) {
  const need = p.quantity * p.copies;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/part", p.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className="card p-3 text-left flex gap-3 hover:border-[var(--purple)] transition-colors cursor-grab active:cursor-grabbing w-full"
    >
      {p.outline && (
        <span className="w-12 h-12 shrink-0 rounded-md flex items-center justify-center" style={{ background: "var(--paper)" }}>
          <Outline shape={p.outline} className="w-11 h-11" />
        </span>
      )}
      <span className="min-w-0 flex-1 flex flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium leading-tight break-words">{p.name}</span>
          <span className="mono text-sm font-semibold shrink-0">×{need}</span>
        </span>
        {(p.part_number || p.material) && (
          <span className="mono text-xs truncate" style={{ color: "var(--muted)" }}>
            {[p.part_number, p.material].filter(Boolean).join(" · ")}
          </span>
        )}
        {sizeText(p, units) && (
          <span className="mono text-xs" style={{ color: "var(--muted)" }}>
            {sizeText(p, units)}
          </span>
        )}
        <span className="flex items-center gap-1.5 flex-wrap mt-0.5">
          {p.dfm.level !== "ok" && p.dfm.level !== "info" && <DfmPill level={p.dfm.level} compact best={p.dfm.best} />}
          {p.cut_qty > 0 && p.cut_qty < need && <span className="chip">cut {p.cut_qty}/{need}</span>}
          {p.files > 0 && <span className="chip">📎 {p.files}</span>}
          <span className="ml-auto">
            <Assignees names={p.assignees} />
          </span>
        </span>
      </span>
    </button>
  );
}

function PartSheet({
  part,
  person,
  onClose,
  onMove,
  units,
}: {
  part: BoardPart | null;
  person: string;
  onClose: () => void;
  onMove: (p: BoardPart, stage: string) => void;
  units: Units;
}) {
  const assign = useFabAction(assignPart);
  const [other, setOther] = useState("");
  if (!part) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const stages = STAGES[part.kind];
  const i = stages.findIndex((s) => s.key === part.stage);
  const next = stages[i + 1];
  const mineNow = !!person && part.assignees.some((a) => a.toLowerCase() === person.toLowerCase());
  return (
    <Sheet open onClose={onClose} eyebrow={`${KIND_LABEL[part.kind]} · ${stageOf(part.kind, part.stage).label} · ${timeAgo(part.stage_changed_at)}`} title={part.name}>
      <div className="flex flex-col gap-4">
        <p className="mono text-sm" style={{ color: "var(--muted)" }}>
          ×{part.quantity * part.copies}
          {part.copies > 1 && ` (${part.quantity} × ${part.copies} robots)`}
          {part.material && ` · ${part.material}`}
          {sizeText(part, units) && ` · ${sizeText(part, units)}`}
        </p>

        {next && (
          <button
            type="button"
            className="btn btn-primary py-3"
            onClick={() => {
              onMove(part, next.key);
              onClose();
            }}
          >
            Move to {next.label} <span aria-hidden>→</span>
          </button>
        )}

        <div>
          <p className="label">Move to</p>
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <button
                key={s.key}
                type="button"
                className="tile tile-chip text-sm"
                data-selected={s.key === part.stage}
                onClick={() => {
                  onMove(part, s.key);
                  onClose();
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">On it</p>
          <div className="flex flex-wrap gap-2 items-center">
            {part.assignees.map((a) => (
              <span key={a} className="tile tile-chip text-sm flex items-center gap-2">
                <PersonChip name={a} size={20} /> {a}
                <button type="button" className="ml-1" style={{ color: "var(--muted)" }} aria-label={`Take ${a} off`} onClick={() => assign.call({ id: part.id, name: a, mode: "remove" })}>
                  ✕
                </button>
              </span>
            ))}
            {!part.assignees.length && (
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Nobody yet
              </span>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {person ? (
              <button type="button" className={`btn ${mineNow ? "btn-ghost" : "btn-primary"} text-sm`} disabled={assign.pending} onClick={() => assign.call({ id: part.id, name: person, mode: mineNow ? "remove" : "add" })}>
                {mineNow ? "Drop it" : `I'll take it (${person})`}
              </button>
            ) : (
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Set “Who are you?” at the top to take parts.
              </span>
            )}
          </div>
          <form
            className="flex gap-2 mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (other.trim()) {
                assign.call({ id: part.id, name: other.trim(), mode: "add" });
                setOther("");
              }
            }}
          >
            <input className="input text-sm" placeholder="Add someone else…" value={other} onChange={(e) => setOther(e.target.value)} maxLength={40} />
            <button type="submit" className="btn btn-ghost text-sm shrink-0" disabled={!other.trim() || assign.pending}>
              Add
            </button>
          </form>
          <ErrorText error={assign.error} />
        </div>

        <Link href={`/parts/${part.id}`} className="btn btn-ghost py-3">
          Files, checks &amp; details <span aria-hidden>→</span>
        </Link>
      </div>
    </Sheet>
  );
}

function AddPartSheet({
  open,
  onClose,
  kind,
  designs,
  materials,
  units,
}: {
  open: boolean;
  onClose: () => void;
  kind: PartKind;
  designs: { id: string; name: string }[];
  materials: FabMaterial[];
  units: Units;
}) {
  const add = useFabAction(addPart, () => onClose());
  const [k, setK] = useState<PartKind>(kind);
  return (
    <Sheet open={open} onClose={onClose} eyebrow="By hand" title="Add a part">
      <form className="flex flex-col gap-3" onSubmit={add.submit}>
        <Field label="Name">
          <input name="name" className="input" required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Kind">
            <select name="kind" className="input" value={k} onChange={(e) => setK(e.target.value as PartKind)}>
              {PART_KINDS.map((x) => (
                <option key={x} value={x}>
                  {KIND_LABEL[x]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input name="quantity" type="number" min={1} defaultValue={1} className="input mono" />
          </Field>
        </div>
        <Field label="Design">
          <select name="design_id" className="input" defaultValue="">
            <option value="">None</option>
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cut from" hint="Used by the cut planner. Upload a DXF on the part's page for plates.">
          <select name="material_id" className="input" defaultValue="">
            <option value="">—</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {materialName(m)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <LengthInput name="size_l_mm" label="Length" units={units} />
          <LengthInput name="size_w_mm" label="Width" units={units} />
          <LengthInput name="size_t_mm" label={k === "plate" ? "Thickness" : "Height"} units={units} />
        </div>
        <ErrorText error={add.error} />
        <SubmitButton pending={add.pending} label="Add part" />
      </form>
    </Sheet>
  );
}
