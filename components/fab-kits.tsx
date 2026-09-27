"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addKit, addKitItem, deleteKit, deleteKitItem } from "@/app/fab-actions";
import {
  fmtPiece,
  kitStatus,
  isSheet,
  sizeLabel,
  type FabKit,
  type FabKitItem,
  type FabLocation,
  type FabMaterial,
  type FabPiece,
  type ItemStatus,
} from "@/lib/fab";
import { fmtLength, fmtRect, type Units } from "@/lib/units";
import { Empty } from "./ui";
import { ErrorText, Field, LengthInput, RectInput, SubmitButton, useFabAction } from "./fab-ui";

export function FabKits({
  kits,
  items,
  materials,
  pieces,
  locations,
  units,
}: {
  kits: FabKit[];
  items: FabKitItem[];
  materials: FabMaterial[];
  pieces: FabPiece[];
  locations: FabLocation[];
  units: Units;
}) {
  const mat = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const pitIds = useMemo(() => new Set(locations.filter((l) => l.kind === "pit").map((l) => l.id)), [locations]);
  const locName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  const add = useFabAction(addKit);
  const pitNames = locations.filter((l) => l.kind === "pit").map((l) => l.name);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        A piece counts as packed when it&apos;s in a pit location ({pitNames.length ? pitNames.join(", ") : "none set up yet — add one in Setup"}). To pack
        something, open its material and <b>Move</b> it there.
      </p>

      {kits.length === 0 && <Empty>No pit kits yet. Make one below — e.g. “Pit fab kit”.</Empty>}

      <div className="grid gap-4 xl:grid-cols-2 items-start">
        {kits.map((k) => (
          <KitCard
            key={k.id}
            kit={k}
            items={items.filter((i) => i.kit_id === k.id)}
            materials={materials}
            status={kitStatus(
              items.filter((i) => i.kit_id === k.id),
              mat,
              pieces,
              pitIds,
            )}
            mat={mat}
            locName={locName}
            units={units}
          />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          add.submit(e);
          e.currentTarget.reset();
        }}
        className="card p-4 flex gap-2 items-end flex-wrap"
      >
        <div className="flex-1 min-w-[200px]">
          <Field label="New kit">
            <input name="name" className="input" placeholder="Pit fab kit" required />
          </Field>
        </div>
        <button type="submit" className="btn btn-primary" disabled={add.pending}>
          Add kit
        </button>
        <div className="w-full">
          <ErrorText error={add.error} />
        </div>
      </form>
    </div>
  );
}

function KitCard({
  kit,
  items,
  materials,
  status,
  mat,
  locName,
  units,
}: {
  kit: FabKit;
  items: FabKitItem[];
  materials: FabMaterial[];
  status: Map<string, ItemStatus>;
  mat: Map<string, FabMaterial>;
  locName: Map<string, string>;
  units: Units;
}) {
  const del = useFabAction(deleteKit);
  const delItem = useFabAction(deleteKitItem);
  const [adding, setAdding] = useState(false);
  const total = items.reduce((s, i) => s + i.count, 0);
  const packed = items.reduce((s, i) => s + (status.get(i.id)?.packed.length ?? 0), 0);
  const done = total > 0 && packed >= total;

  const req = (i: FabKitItem, m: FabMaterial) =>
    isSheet(m)
      ? i.min_length_mm && i.min_width_mm
        ? `≥ ${fmtRect(i.min_width_mm, i.min_length_mm, units)}`
        : "any size"
      : i.min_length_mm
        ? `≥ ${fmtLength(i.min_length_mm, units)}`
        : "any length";

  return (
    <div className="card">
      <div className="p-4 flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            Pit kit
          </p>
          <h2 className="text-2xl font-medium tracking-tight">{kit.name}</h2>
        </div>
        <span className={`pill ${done ? "pill-good" : total ? "pill-warn" : "pill-muted"}`}>
          {packed}/{total} packed
        </span>
      </div>
      {total > 0 && (
        <div className="mx-4 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
          <div className="h-full" style={{ width: `${(packed / total) * 100}%`, background: done ? "var(--good)" : "var(--purple)" }} />
        </div>
      )}
      <ul className="mt-2">
        {items.map((i) => {
          const m = mat.get(i.material_id);
          const s = status.get(i.id);
          if (!m || !s) return null;
          const ok = s.packed.length >= i.count;
          return (
            <li key={i.id} className="px-4 py-3 border-t flex gap-3 items-start" style={{ borderColor: "var(--line)" }}>
              <span
                className="mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: ok ? "var(--good-soft)" : "var(--bad-soft)", color: ok ? "var(--good)" : "var(--bad)" }}
                aria-label={ok ? "Packed" : "Short"}
              >
                {ok ? "✓" : "!"}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/stock/${m.id}`} className="font-medium hover:underline">
                  {i.count} × {m.material} {sizeLabel(m)}
                </Link>
                <p className="mono text-xs" style={{ color: "var(--muted)" }}>
                  {req(i, m)} · {s.packed.length}/{i.count} in pit
                  {s.packed.length > 0 && ` (${s.packed.map((p) => fmtPiece(m, p, units)).join(", ")})`}
                </p>
                {!ok && (
                  <p className="text-xs mt-1" style={{ color: "var(--warn)" }}>
                    {s.suggest.length
                      ? `Grab: ${s.suggest.map((p) => `${fmtPiece(m, p, units)} from ${p.location_id ? (locName.get(p.location_id) ?? "?") : "no location"}`).join("; ")}`
                      : "Nothing in the shop fits — add it to the shopping list."}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="text-xs underline shrink-0 mt-1"
                style={{ color: "var(--muted)" }}
                disabled={delItem.pending}
                onClick={() => delItem.call({ id: i.id })}
              >
                remove
              </button>
            </li>
          );
        })}
      </ul>
      <div className="p-4 border-t flex flex-col gap-3" style={{ borderColor: "var(--line)" }}>
        {adding ? (
          <AddItemForm kitId={kit.id} materials={materials} units={units} onDone={() => setAdding(false)} />
        ) : (
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost text-sm flex-1" onClick={() => setAdding(true)} disabled={materials.length === 0}>
              + Add item
            </button>
            <button
              type="button"
              className="btn btn-danger text-sm"
              disabled={del.pending}
              onClick={() => {
                if (confirm(`Delete the “${kit.name}” kit? The stock itself isn't touched.`)) del.call({ id: kit.id });
              }}
            >
              Delete kit
            </button>
          </div>
        )}
        <ErrorText error={del.error ?? delItem.error} />
      </div>
    </div>
  );
}

function AddItemForm({ kitId, materials, units, onDone }: { kitId: string; materials: FabMaterial[]; units: Units; onDone: () => void }) {
  const [materialId, setMaterialId] = useState("");
  const m = materials.find((x) => x.id === materialId);
  const a = useFabAction(addKitItem, onDone);
  return (
    <form onSubmit={a.submit} className="flex flex-col gap-3">
      <input type="hidden" name="kit_id" value={kitId} />
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <Field label="Material">
          <select name="material_id" className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
            <option value="">Pick…</option>
            {materials.map((x) => (
              <option key={x.id} value={x.id}>
                {x.material} {sizeLabel(x)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Count">
          <input name="count" type="number" min="1" inputMode="numeric" className="input mono" defaultValue={1} />
        </Field>
      </div>
      {m &&
        (isSheet(m) ? (
          <div>
            <span className="label">At least (optional)</span>
            <RectInput key={m.id} units={units} prefix="min_" labels={["W", "L"]} />
          </div>
        ) : (
          <LengthInput key={m.id} name="min_length_mm" label="At least (optional)" units={units} hint="e.g. 24 — leave blank for any length" />
        ))}
      <ErrorText error={a.error} />
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <div className="flex-1 flex flex-col">
          <SubmitButton pending={a.pending} label="Add to kit" />
        </div>
      </div>
    </form>
  );
}
