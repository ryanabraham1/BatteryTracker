"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { setCotsStatus, updatePart } from "@/app/parts-actions";
import { COTS_LABEL, COTS_STATUSES, COTS_TONE, KIND_LABEL, PART_KINDS, type CotsStatus } from "@/lib/parts";
import { Empty } from "./ui";
import { Sheet } from "./sheet";
import { ErrorText, Field, SubmitButton, useFabAction } from "./fab-ui";

const money = (n: number | null) => (n === null ? "" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** The team's buy-list columns: Name, Link, Part #, Qty, Unit price, Total. */
function sheetRows(sections: [string, BomLine[]][]): string[][] {
  const out: string[][] = [];
  for (const [, rows] of sections) {
    if (!rows.length) continue;
    if (out.length) out.push(["", "", "", "", "", ""]); // a blank row between parts and hardware, like the sheet
    for (const l of rows) out.push([l.name, l.url, l.part_number, String(l.need), money(l.unit_price), l.unit_price === null ? "" : money(l.unit_price * l.need)]);
  }
  return out;
}

const tsv = (rows: string[][]) => rows.map((r) => r.map((c) => c.replace(/[\t\n\r]+/g, " ")).join("\t")).join("\n");
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");

export interface BomLine {
  id: string;
  name: string;
  part_number: string;
  description: string;
  /** across every robot the design is for, plus spares */
  need: number;
  design: string;
  bot: string;
  vendor: string;
  url: string;
  unit_price: number | null;
  status: CotsStatus;
  hardware: boolean;
  material: string;
}

type Filter = "open" | "all" | CotsStatus;

export function PartsBom({ lines }: { lines: BomLine[] }) {
  const [filter, setFilter] = useState<Filter>("open");
  const [bot, setBot] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<BomLine | null>(null);
  const bulk = useFabAction(setCotsStatus, () => setPicked(new Set()));
  const bots = useMemo(() => [...new Set(lines.map((l) => l.bot).filter(Boolean))].sort(), [lines]);

  const base = lines.filter(
    (l) => (!bot || l.bot === bot) && (!q || `${l.name} ${l.part_number} ${l.vendor} ${l.description}`.toLowerCase().includes(q.toLowerCase())),
  );
  const count = (f: Filter) => base.filter((l) => (f === "all" ? true : f === "open" ? l.status !== "have" : l.status === f)).length;
  const shown = base
    .filter((l) => (filter === "all" ? true : filter === "open" ? l.status !== "have" : l.status === filter))
    .sort((a, b) => COTS_STATUSES.indexOf(a.status) - COTS_STATUSES.indexOf(b.status) || a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));
  const sections: [string, BomLine[]][] = [
    ["Parts", shown.filter((l) => !l.hardware)],
    ["Hardware", shown.filter((l) => l.hardware)],
  ];

  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };
  function copyList() {
    const need = base.filter((l) => l.status === "needed");
    const text = need
      .map((l) => `${l.need} × ${l.name}${l.part_number ? ` (${l.part_number})` : ""}${l.vendor ? ` — ${l.vendor}` : ""}${l.url ? ` ${l.url}` : ""}`)
      .join("\n");
    navigator.clipboard?.writeText(text).then(() => flash("list"));
  }
  /** Tab-separated, so it pastes straight into Google Sheets as columns. */
  function copySheet() {
    navigator.clipboard?.writeText(tsv(sheetRows(sections))).then(() => flash("sheet"));
  }
  function downloadCsv() {
    const header = ["Name", "Link", "Part #", "Qty", "Unit price", "Total"];
    const blob = new Blob([csv([header, ...sheetRows(sections)]) + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cots-bom-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const total = shown.reduce((s, l) => s + (l.unit_price ?? 0) * l.need, 0);
  const unpriced = shown.filter((l) => l.unit_price === null).length;

  if (!lines.length) {
    return (
      <Empty>
        No bought parts yet. Syncing a design from{" "}
        <Link href="/tracker/designs" className="underline" style={{ color: "var(--purple)" }}>
          Onshape
        </Link>{" "}
        puts its COTS parts (motors, belts, gears, bearings) and hardware here.
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Things the robots need that we buy, not make. Quantities are for every robot the design is for. Not right? Move a line to the tracker with <b>We make this</b>.
      </p>

      <div className="hscroll no-scrollbar flex gap-2 -mx-4 px-4">
        {(["open", ...COTS_STATUSES, "all"] as Filter[]).map((f) => (
          <button key={f} type="button" className="tile tile-chip text-sm" data-selected={filter === f} onClick={() => setFilter(f)}>
            {f === "open" ? "Not here yet" : f === "all" ? "All" : COTS_LABEL[f]}{" "}
            <span className="mono" style={{ color: "var(--muted)" }}>
              {count(f)}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {bots.length > 1 && (
          <select className="input w-auto" value={bot} onChange={(e) => setBot(e.target.value)} aria-label="Bot">
            <option value="">All bots</option>
            {bots.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        )}
        <input className="input flex-1 min-w-40" placeholder="Search parts, vendors…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the BOM" />
        <button type="button" className="btn btn-ghost text-sm" onClick={copyList} disabled={!count("needed")}>
          {copied === "list" ? "Copied ✓" : `Copy buy list (${count("needed")})`}
        </button>
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-2 text-sm">
        <span>
          <b className="mono">{money(total)}</b> for what&apos;s shown
          {unpriced > 0 && <span style={{ color: "var(--muted)" }}> · {unpriced} without a price</span>}
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn btn-primary text-sm" onClick={copySheet} disabled={!shown.length} title="Name, Link, Part #, Qty, Unit price, Total — paste into Google Sheets">
            {copied === "sheet" ? "Copied — paste in Sheets ✓" : "Copy for Sheets"}
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={downloadCsv} disabled={!shown.length}>
            Download CSV
          </button>
        </span>
      </div>

      {picked.size > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-2 text-sm" style={{ background: "var(--purple-soft)" }}>
          <span className="font-medium">{picked.size} picked</span>
          {COTS_STATUSES.map((s) => (
            <button key={s} type="button" className="btn btn-ghost text-sm" disabled={bulk.pending} onClick={() => bulk.call({ ids: [...picked].join(","), status: s })}>
              Mark {COTS_LABEL[s].toLowerCase()}
            </button>
          ))}
          <button type="button" className="text-sm underline ml-auto" onClick={() => setPicked(new Set())}>
            clear
          </button>
          <ErrorText error={bulk.error} />
        </div>
      )}

      {shown.length === 0 && <Empty>Nothing here.</Empty>}

      {sections.map(([title, rows]) =>
        rows.length ? (
          <section key={title}>
            <h2 className="eyebrow mb-2" style={{ color: "var(--muted)" }}>
              {title} <span className="mono">{rows.length}</span>
            </h2>
            <ul className="card divide-y" style={{ borderColor: "var(--line)" }}>
              {rows.map((l) => (
                <Row
                  key={l.id}
                  l={l}
                  onEdit={() => setEditing(l)}
                  picked={picked.has(l.id)}
                  onPick={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(l.id)) n.delete(l.id);
                      else n.add(l.id);
                      return n;
                    })
                  }
                />
              ))}
            </ul>
          </section>
        ) : null,
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} eyebrow="COTS" title={editing?.name ?? ""}>
        {editing && <EditLine key={editing.id} l={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function EditLine({ l, onDone }: { l: BomLine; onDone: () => void }) {
  const a = useFabAction(updatePart, onDone);
  return (
    <form className="flex flex-col gap-3" onSubmit={a.submit}>
      <input type="hidden" name="id" value={l.id} />
      <Field label="Name">
        <input name="name" className="input" defaultValue={l.name} required />
      </Field>
      <Field label="Link">
        <input name="url" className="input" defaultValue={l.url} placeholder="https://wcproducts.com/…" inputMode="url" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Part #">
          <input name="part_number" className="input mono" defaultValue={l.part_number} placeholder="WCP-1634" />
        </Field>
        <Field label="Unit price">
          <input name="unit_price" className="input mono" defaultValue={l.unit_price ?? ""} placeholder="13.99" inputMode="decimal" />
        </Field>
      </div>
      <Field label="Vendor">
        <input name="vendor" className="input" defaultValue={l.vendor} placeholder="WCP, AndyMark, REV…" />
      </Field>
      <ErrorText error={a.error} />
      <SubmitButton pending={a.pending} label="Save" />
    </form>
  );
}

function Row({ l, picked, onPick, onEdit }: { l: BomLine; picked: boolean; onPick: () => void; onEdit: () => void }) {
  const status = useFabAction(setCotsStatus);
  const move = useFabAction(updatePart);
  const [shown, setShown] = useState(l.status);
  const cur = status.error ? l.status : shown;
  return (
    <li className="p-3 flex flex-wrap items-start gap-3" style={{ borderColor: "var(--line)", opacity: cur === "have" ? 0.65 : 1 }}>
      <input type="checkbox" className="mt-1.5" checked={picked} onChange={onPick} aria-label={`Pick ${l.name}`} />
      <span className="mono text-lg font-semibold w-10 text-right shrink-0">{l.need}×</span>
      <div className="min-w-0 flex-1">
        <button type="button" className="font-medium break-words text-left hover:underline" onClick={onEdit}>
          {l.name}
        </button>
        <p className="mono text-xs mt-0.5">
          {l.unit_price === null ? (
            <button type="button" className="underline" style={{ color: "var(--muted)" }} onClick={onEdit}>
              add price
            </button>
          ) : (
            <>
              {money(l.unit_price)} ea · <b>{money(l.unit_price * l.need)}</b>
            </>
          )}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {[l.part_number, l.vendor, l.bot || l.design, l.material].filter(Boolean).join(" · ")}
          {l.url && (
            <>
              {" · "}
              <a href={l.url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--purple)" }}>
                buy ↗
              </a>
            </>
          )}
        </p>
        <ErrorText error={status.error ?? move.error} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select
          className={`pill pill-${COTS_TONE[cur]} cursor-pointer`}
          style={{ appearance: "auto", border: 0 }}
          value={cur}
          disabled={status.pending}
          onChange={(e) => {
            const s = e.target.value as CotsStatus;
            setShown(s);
            status.call({ ids: l.id, status: s });
          }}
          aria-label={`Status of ${l.name}`}
        >
          {COTS_STATUSES.map((s) => (
            <option key={s} value={s}>
              {COTS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="input py-1 text-xs w-auto"
          style={{ minHeight: 30 }}
          value=""
          disabled={move.pending}
          onChange={(e) => e.target.value && move.call({ id: l.id, kind: e.target.value, status: "not_started" })}
          aria-label={`Move ${l.name} to the tracker`}
        >
          <option value="">We make this…</option>
          {PART_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
