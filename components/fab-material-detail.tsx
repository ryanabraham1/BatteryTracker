"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addOrder, cutLinear, cutSheet, editPiece, movePiece, receivePieces, scrapPiece } from "@/app/fab-actions";
import {
  bestFits,
  describeEvent,
  FAB_EVENT_LABEL,
  FAB_EVENT_TONE,
  fmtAmount,
  fmtPiece,
  isFullPiece,
  isSheet,
  SHAPE_LABEL,
  sizeLabel,
  summarize,
  type FabEvent,
  type FabLocation,
  type FabMaterial,
  type FabOrder,
  type FabPiece,
  type FabSettings,
} from "@/lib/fab";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { fmtLength, fmtRect, type Units } from "@/lib/units";
import { Sheet } from "./sheet";
import { Empty } from "./ui";
import { UndoButton } from "./fab-undo";
import { ErrorText, Field, LengthInput, RectInput, SubmitButton, UnitsToggle, useFabAction } from "./fab-ui";

type Open =
  | { kind: "receive"; order?: FabOrder }
  | { kind: "order" }
  | { kind: "cut" | "move" | "edit"; piece: FabPiece }
  | null;

export function FabMaterialDetail({
  material: m,
  pieces,
  locations,
  orders,
  events,
  settings,
  units,
}: {
  material: FabMaterial;
  pieces: FabPiece[];
  locations: FabLocation[];
  orders: FabOrder[];
  events: FabEvent[];
  settings: FabSettings;
  units: Units;
}) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const sheet = isSheet(m);
  const [s] = summarize([m], pieces, orders);
  const locName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  // Find a piece: shortest stick / smallest sheet that fits the need.
  const [needL, setNeedL] = useState<number | null>(null);
  const [needW, setNeedW] = useState<number | null>(null);
  const hasNeed = needL !== null && (!sheet || needW !== null);
  const fits = useMemo(() => (hasNeed ? bestFits(m, s.pieces, needL!, needW ?? undefined) : []), [hasNeed, m, s.pieces, needL, needW]);
  const best = fits[0]?.id;
  const fitIds = new Set(fits.map((p) => p.id));
  const shown = hasNeed ? [...fits, ...s.pieces.filter((p) => !fitIds.has(p.id))] : s.pieces;

  const openOrders = orders.filter((o) => o.status !== "received");

  return (
    <>
      <div className="mb-4">
        <Link href="/stock" className="eyebrow" style={{ color: "var(--muted)" }}>
          ← Rack
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            {m.material} · {SHAPE_LABEL[m.shape]}
            {m.archived && " · archived"}
          </p>
          <h1 className="display text-4xl sm:text-5xl break-words">{sizeLabel(m)}</h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {s.low && <span className="pill pill-bad">Low stock</span>}
            {openOrders.length > 0 && <span className="pill pill-warn">On order</span>}
            {m.vendor && <span className="chip">{m.vendor}{m.vendor_part && ` · ${m.vendor_part}`}</span>}
            {m.url && (
              <a href={m.url} target="_blank" rel="noreferrer" className="chip underline">
                Vendor page ↗
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <UnitsToggle units={units} />
          <Link href={`/stock/${m.id}/edit`} className="btn btn-ghost text-sm">
            Edit
          </Link>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen({ kind: "order" })}>
            Need more
          </button>
          <button type="button" className="btn btn-primary text-sm flex-1 sm:flex-none" onClick={() => setOpen({ kind: "receive" })}>
            Receive <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Stat label="On hand" value={s.pieces.length ? fmtAmount(m, s.total, units) : "—"} tone={s.low ? "bad" : undefined} />
        <Stat label="Pieces" value={String(s.pieces.length)} />
        <Stat label={sheet ? "Full sheets" : "Full sticks"} value={String(s.fullCount)} sub={m.full_length_mm ? `of ${fmtPiece(m, { length_mm: m.full_length_mm, width_mm: m.full_width_mm }, units)}` : undefined} />
        <Stat label="Low under" value={m.min_amount ? fmtAmount(m, m.min_amount, units) : "—"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Find a piece */}
          <div className="card p-4">
            <p className="eyebrow mb-2" style={{ color: "var(--muted)" }}>
              Find a piece
            </p>
            {sheet ? (
              <RectInput
                units={units}
                prefix="need_"
                labels={["Need W", "Need L"]}
                onChange={(w, l) => {
                  setNeedW(w);
                  setNeedL(l);
                }}
              />
            ) : (
              <LengthInput name="need_mm" label="I need" units={units} onChange={setNeedL} hint="Suggests the shortest piece that fits, so offcuts go first" />
            )}
            {hasNeed && (
              <p className="mt-2 text-sm font-medium" style={{ color: fits.length ? "var(--good)" : "var(--bad)" }}>
                {fits.length
                  ? `Use ${fmtPiece(m, fits[0], units)}${fits[0].location_id ? ` from ${locName.get(fits[0].location_id)}` : ""} · ${fits.length} ${fits.length === 1 ? "piece fits" : "pieces fit"}`
                  : "Nothing on hand is big enough — add it to the shopping list."}
              </p>
            )}
          </div>

          {/* Pieces */}
          {shown.length === 0 ? (
            <Empty>No pieces on hand. Tap Receive when stock arrives.</Empty>
          ) : (
            <ul className="card divide-y" style={{ borderColor: "var(--line)" }}>
              {shown.map((p) => {
                const full = isFullPiece(m, p);
                const dim = hasNeed && !fitIds.has(p.id);
                return (
                  <li key={p.id} className="p-3 sm:p-4 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--line)", opacity: dim ? 0.5 : 1 }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="mono text-lg font-semibold">{fmtPiece(m, p, units)}</span>
                        {p.id === best && <span className="pill pill-good">Best fit</span>}
                        <span className={`pill ${full ? "pill-purple" : "pill-muted"}`}>{full ? "Full" : "Offcut"}</span>
                        {p.has_cutouts && <span className="pill pill-warn">Cutouts</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="chip">{p.location_id ? (locName.get(p.location_id) ?? "—") : "No location"}</span>
                        {p.notes && (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            {p.notes}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" className="btn btn-primary text-sm px-4" onClick={() => setOpen({ kind: "cut", piece: p })}>
                        Cut
                      </button>
                      <button type="button" className="btn btn-ghost text-sm px-3" onClick={() => setOpen({ kind: "move", piece: p })}>
                        Move
                      </button>
                      <button type="button" className="btn btn-ghost text-sm px-3" onClick={() => setOpen({ kind: "edit", piece: p })} aria-label="Edit piece">
                        Edit
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {openOrders.length > 0 && (
            <div className="card p-4">
              <p className="eyebrow mb-2" style={{ color: "var(--muted)" }}>
                On the shopping list
              </p>
              <ul className="flex flex-col gap-2">
                {openOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <p className="mono text-sm font-semibold">
                        {o.quantity} × {o.length_mm ? fmtPiece(m, { length_mm: o.length_mm, width_mm: o.width_mm }, units) : "—"}
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        {o.status === "ordered" ? `Ordered${o.expected_date ? ` · due ${fmtDate(o.expected_date)}` : ""}` : "Needed"}
                      </p>
                    </div>
                    <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen({ kind: "receive", order: o })}>
                      Arrived
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="eyebrow" style={{ color: "var(--muted)" }}>
                History
              </p>
              <Link href={`/stock/log?material=${m.id}`} className="eyebrow" style={{ color: "var(--purple)" }}>
                All →
              </Link>
            </div>
            {events.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Nothing yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {events.slice(0, 15).map((e) => (
                  <li key={e.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`pill ${e.undone_at ? "pill-muted" : `pill-${FAB_EVENT_TONE[e.type]}`}`}>
                        {e.undone_at ? "Undone" : FAB_EVENT_LABEL[e.type]}
                      </span>
                      <span className="mono text-xs" style={{ color: "var(--muted)" }}>
                        {fmtDateTime(e.occurred_at)}
                      </span>
                      {e.undoable && (
                        <span className="ml-auto">
                          <UndoButton id={e.id} />
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5" style={e.undone_at ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
                      {describeEvent(e, m, units)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {m.notes && (
            <div className="card p-4">
              <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>
                Notes
              </p>
              <p className="text-sm whitespace-pre-wrap">{m.notes}</p>
            </div>
          )}
        </div>
      </div>

      <Sheet open={open?.kind === "receive"} onClose={close} eyebrow={sizeLabel(m)} title="Receive stock">
        {open?.kind === "receive" && <ReceiveForm m={m} locations={locations} units={units} order={open.order} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === "order"} onClose={close} eyebrow={sizeLabel(m)} title="Need more">
        {open?.kind === "order" && <OrderForm m={m} units={units} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === "cut"} onClose={close} eyebrow={open && "piece" in open ? fmtPiece(m, open.piece, units) : ""} title={sheet ? "Cut from sheet" : "Cut"}>
        {open?.kind === "cut" &&
          (sheet ? (
            <CutSheetForm m={m} piece={open.piece} units={units} onDone={close} />
          ) : (
            <CutLinearForm piece={open.piece} settings={settings} units={units} onDone={close} />
          ))}
      </Sheet>
      <Sheet open={open?.kind === "move"} onClose={close} eyebrow={open && "piece" in open ? fmtPiece(m, open.piece, units) : ""} title="Move to">
        {open?.kind === "move" && <MoveForm piece={open.piece} locations={locations} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === "edit"} onClose={close} eyebrow={open && "piece" in open ? fmtPiece(m, open.piece, units) : ""} title="Edit piece">
        {open?.kind === "edit" && <EditForm m={m} piece={open.piece} units={units} onDone={close} />}
      </Sheet>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" }) {
  return (
    <div className="card p-3">
      <p className="eyebrow" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="mono text-xl font-semibold mt-1" style={{ color: tone ? `var(--${tone})` : undefined }}>
        {value}
      </p>
      {sub && (
        <p className="mono text-xs" style={{ color: "var(--muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function LocationSelect({ locations, defaultValue, name = "location_id" }: { locations: FabLocation[]; defaultValue?: string | null; name?: string }) {
  return (
    <Field label="Location">
      <select name={name} className="input" defaultValue={defaultValue ?? locations[0]?.id ?? ""}>
        <option value="">No location</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
            {l.kind === "pit" ? " (pit)" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ReceiveForm({ m, locations, units, order, onDone }: { m: FabMaterial; locations: FabLocation[]; units: Units; order?: FabOrder; onDone: () => void }) {
  const a = useFabAction(receivePieces, onDone);
  const len = order?.length_mm ?? m.full_length_mm;
  const wid = order?.width_mm ?? m.full_width_mm;
  // Sheets default to the sheet cart, sticks to the tube rack, when those exist.
  const defLoc = locations.find((l) => (isSheet(m) ? /sheet/i : /tube|rack/i).test(l.name))?.id;
  return (
    <form onSubmit={a.submit} className="flex flex-col gap-4">
      <input type="hidden" name="material_id" value={m.id} />
      {order && <input type="hidden" name="order_id" value={order.id} />}
      <Field label={isSheet(m) ? "How many sheets" : "How many sticks"}>
        <input name="count" type="number" min="1" max="200" inputMode="numeric" className="input mono" defaultValue={order?.quantity ?? 1} />
      </Field>
      {isSheet(m) ? <RectInput units={units} defaultW={wid} defaultL={len} /> : <LengthInput name="length_mm" label="Length each" units={units} defaultMm={len} />}
      <LocationSelect locations={locations} defaultValue={defLoc} />
      <Field label="Note (optional)">
        <input name="notes" className="input" placeholder="Donated by…, PO #…" />
      </Field>
      <ErrorText error={a.error} />
      <SubmitButton pending={a.pending} label={order ? "Mark arrived & add" : "Add to rack"} />
    </form>
  );
}

export function OrderForm({ m, units, onDone }: { m: FabMaterial; units: Units; onDone: () => void }) {
  const a = useFabAction(addOrder, onDone);
  return (
    <form onSubmit={a.submit} className="flex flex-col gap-4">
      <input type="hidden" name="material_id" value={m.id} />
      <Field label="Quantity">
        <input name="quantity" type="number" min="1" inputMode="numeric" className="input mono" defaultValue={1} />
      </Field>
      {isSheet(m) ? (
        <RectInput units={units} defaultW={m.full_width_mm} defaultL={m.full_length_mm} />
      ) : (
        <LengthInput name="length_mm" label="Length each" units={units} defaultMm={m.full_length_mm} />
      )}
      <Field label="Note (optional)">
        <input name="notes" className="input" placeholder="For the climber rebuild…" />
      </Field>
      <ErrorText error={a.error} />
      <SubmitButton pending={a.pending} label="Add to shopping list" />
    </form>
  );
}

function ProjectFields() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="For (optional)">
        <input name="project" className="input" placeholder="Intake v2" />
      </Field>
      <Field label="Note (optional)">
        <input name="note" className="input" />
      </Field>
    </div>
  );
}

function CutLinearForm({ piece, settings, units, onDone }: { piece: FabPiece; settings: FabSettings; units: Units; onDone: () => void }) {
  const [used, setUsed] = useState<number | null>(null);
  const [count, setCount] = useState(1);
  const [tossTouched, setTossTouched] = useState<boolean | null>(null);
  const a = useFabAction(cutLinear, onDone);

  const need = used ? count * used + (count - 1) * settings.kerf_mm : 0;
  const fits = !used || need <= piece.length_mm + 0.5;
  const leftover = used && fits ? Math.max(0, piece.length_mm - count * used - count * settings.kerf_mm) : null;
  const short = leftover !== null && leftover >= 1 && leftover < settings.scrap_min_mm;
  const toss = tossTouched ?? short;

  return (
    <form onSubmit={a.submit} className="flex flex-col gap-4">
      <input type="hidden" name="piece_id" value={piece.id} />
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <LengthInput name="used_mm" label="Cut length" units={units} onChange={setUsed} autoFocus />
        <Field label="Pieces">
          <input
            name="count"
            type="number"
            min="1"
            inputMode="numeric"
            className="input mono"
            value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      </div>
      <div className="card p-3" style={{ background: "var(--paper)" }}>
        {!used ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Blade takes {fmtLength(settings.kerf_mm, units)} per cut.
          </p>
        ) : !fits ? (
          <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
            Doesn&apos;t fit — needs {fmtLength(need, units)} with kerf.
          </p>
        ) : (
          <p className="text-sm">
            Leftover: <span className="mono font-semibold">{leftover! < 1 ? "nothing" : fmtLength(leftover, units)}</span>
            {short && (
              <span style={{ color: "var(--warn)" }}> · shorter than {fmtLength(settings.scrap_min_mm, units)}</span>
            )}
          </p>
        )}
      </div>
      {leftover !== null && leftover >= 1 && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={toss} onChange={(e) => setTossTouched(e.target.checked)} />
          Toss the leftover instead of keeping it
          <input type="hidden" name="scrap" value={toss ? "1" : "0"} />
        </label>
      )}
      <ProjectFields />
      <ErrorText error={a.error} />
      <SubmitButton pending={a.pending} label="Log cut" />
    </form>
  );
}

function CutSheetForm({ m, piece, units, onDone }: { m: FabMaterial; piece: FabPiece; units: Units; onDone: () => void }) {
  const [mode, setMode] = useState<"remaining" | "cutouts" | "whole">("remaining");
  const [rects, setRects] = useState<{ key: number; w: number | null; l: number | null }[]>([{ key: 0, w: piece.width_mm, l: null }]);
  const a = useFabAction(cutSheet, onDone);
  const valid = rects.filter((r) => r.w && r.l).map((r) => ({ w: r.w, l: r.l }));

  return (
    <form onSubmit={a.submit} className="flex flex-col gap-4">
      <input type="hidden" name="piece_id" value={piece.id} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="remaining" value={JSON.stringify(valid)} />
      <div>
        <span className="label">What&apos;s left?</span>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["remaining", "Smaller piece(s)", "measure what's left"],
              ["cutouts", "Same, with holes", "parts cut out of it"],
              ["whole", "Nothing", "used all of it"],
            ] as const
          ).map(([v, label, sub]) => (
            <button key={v} type="button" className="tile text-sm" data-selected={mode === v} onClick={() => setMode(v)}>
              <span className="block font-medium leading-tight">{label}</span>
              <span className="block mono text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                {sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      {mode === "remaining" && (
        <div className="flex flex-col gap-3">
          {rects.map((r, i) => (
            <div key={r.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="eyebrow" style={{ color: "var(--muted)" }}>
                  Leftover {i + 1}
                </span>
                {rects.length > 1 && (
                  <button type="button" className="text-xs underline" style={{ color: "var(--muted)" }} onClick={() => setRects(rects.filter((x) => x.key !== r.key))}>
                    remove
                  </button>
                )}
              </div>
              <RectInput
                units={units}
                prefix={`r${r.key}_`}
                defaultW={r.w}
                defaultL={r.l}
                onChange={(w, l) => setRects((rs) => rs.map((x) => (x.key === r.key ? { ...x, w, l } : x)))}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => setRects([...rects, { key: Math.max(...rects.map((x) => x.key)) + 1, w: null, l: null }])}
          >
            + Another leftover piece
          </button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Was {fmtRect(piece.width_mm ?? 0, piece.length_mm, units)}. The first leftover keeps this piece&apos;s spot; extra ones are added next to it.
          </p>
        </div>
      )}
      {mode === "cutouts" && (
        <Field label="What was cut (optional)" hint="Keeps the outline, marks it as having cutouts so it's not mistaken for a clean sheet.">
          <input name="cutout_note" className="input" placeholder="4 gussets from one corner" />
        </Field>
      )}
      <ProjectFields />
      <ErrorText error={a.error} />
      <SubmitButton pending={a.pending} label={mode === "whole" ? `Use up this ${isSheet(m) ? "sheet" : "piece"}` : "Log cut"} />
    </form>
  );
}

function MoveForm({ piece, locations, onDone }: { piece: FabPiece; locations: FabLocation[]; onDone: () => void }) {
  const a = useFabAction(movePiece, onDone);
  return (
    <div className="flex flex-col gap-2">
      {locations.map((l) => (
        <button
          key={l.id}
          type="button"
          className="tile flex items-center justify-between"
          data-selected={piece.location_id === l.id}
          disabled={a.pending}
          onClick={() => a.call({ piece_id: piece.id, location_id: l.id })}
        >
          <span className="font-medium">{l.name}</span>
          {l.kind === "pit" && <span className="pill pill-purple">Pit</span>}
        </button>
      ))}
      <ErrorText error={a.error} />
    </div>
  );
}

function EditForm({ m, piece, units, onDone }: { m: FabMaterial; piece: FabPiece; units: Units; onDone: () => void }) {
  const a = useFabAction(editPiece, onDone);
  const scrap = useFabAction(scrapPiece, onDone);
  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={a.submit} className="flex flex-col gap-4">
        <input type="hidden" name="piece_id" value={piece.id} />
        {isSheet(m) ? (
          <>
            <RectInput units={units} defaultW={piece.width_mm} defaultL={piece.length_mm} />
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="has_cutouts" value="1" defaultChecked={piece.has_cutouts} />
              Has cutouts (not a clean rectangle)
            </label>
          </>
        ) : (
          <LengthInput name="length_mm" label="Actual length" units={units} defaultMm={piece.length_mm} hint="Measured it and it's different? Fix it here." />
        )}
        <Field label="Notes">
          <input name="notes" className="input" defaultValue={piece.notes} placeholder="Bent at one end, pre-drilled…" />
        </Field>
        <ErrorText error={a.error} />
        <SubmitButton pending={a.pending} label="Save piece" />
      </form>
      <form onSubmit={scrap.submit} className="flex flex-col gap-3 pt-4 border-t" style={{ borderColor: "var(--line)" }}>
        <input type="hidden" name="piece_id" value={piece.id} />
        <Field label="Scrap / remove this piece">
          <input name="reason" className="input" placeholder="Bent, lost, gave to 1234, entered by mistake…" />
        </Field>
        <ErrorText error={scrap.error} />
        <SubmitButton pending={scrap.pending} label="Scrap piece" danger />
      </form>
    </div>
  );
}
