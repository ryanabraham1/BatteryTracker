"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteLocation, saveFabSettings, saveLocation } from "@/app/fab-actions";
import { sizeLabel, type FabLocation, type FabMaterial, type FabSettings } from "@/lib/fab";
import type { Units } from "@/lib/units";
import { ErrorText, Field, LengthInput, SubmitButton, useFabAction } from "./fab-ui";
import { ConfirmButton } from "./confirm-button";

export function FabSetup({
  settings,
  locations,
  archived,
  counts,
  units,
}: {
  settings: FabSettings;
  locations: FabLocation[];
  archived: FabMaterial[];
  counts: Record<string, number>;
  units: Units;
}) {
  const [saved, setSaved] = useState(false);
  const s = useFabAction(saveFabSettings, () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  });
  const add = useFabAction(saveLocation);

  return (
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <div className="flex flex-col gap-6">
        <form onSubmit={s.submit} className="card p-4 sm:p-5 flex flex-col gap-4">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            Cutting
          </p>
          <LengthInput name="kerf_mm" label="Blade kerf" units={units} defaultMm={settings.kerf_mm} hint="Lost per cut; subtracted when you log a cut" />
          <LengthInput
            name="scrap_min_mm"
            label="Offer to toss leftovers under"
            units={units}
            defaultMm={settings.scrap_min_mm}
            hint="Shorter leftovers default to “toss” on the cut form"
          />
          <ErrorText error={s.error} />
          <SubmitButton pending={s.pending} label={saved ? "Saved ✓" : "Save"} />
        </form>

        {archived.length > 0 && (
          <div className="card p-4 sm:p-5">
            <p className="eyebrow mb-3" style={{ color: "var(--muted)" }}>
              Archived materials
            </p>
            <ul className="flex flex-col gap-2">
              {archived.map((m) => (
                <li key={m.id}>
                  <Link href={`/stock/${m.id}/edit`} className="text-sm underline">
                    {m.material} {sizeLabel(m)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-5 flex flex-col gap-3">
        <p className="eyebrow" style={{ color: "var(--muted)" }}>
          Locations
        </p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Pit locations travel to events: they drive the pit kit and the “Pit only” view in comp mode.
        </p>
        <ul className="flex flex-col gap-2">
          {locations.map((l) => (
            <LocationRow key={l.id} l={l} count={counts[l.id] ?? 0} />
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            add.submit(e);
            e.currentTarget.reset();
          }}
          className="flex gap-2 items-end pt-3 border-t"
          style={{ borderColor: "var(--line)" }}
        >
          <input type="hidden" name="sort" value={locations.length + 1} />
          <div className="flex-1">
            <Field label="Add location">
              <input name="name" className="input" placeholder="Drawer 3, Pit bin B…" required />
            </Field>
          </div>
          <select name="kind" className="input w-24" defaultValue="shop" aria-label="Kind">
            <option value="shop">Shop</option>
            <option value="pit">Pit</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={add.pending}>
            Add
          </button>
        </form>
        <ErrorText error={add.error} />
      </div>
    </div>
  );
}

function LocationRow({ l, count }: { l: FabLocation; count: number }) {
  const save = useFabAction(saveLocation);
  const del = useFabAction(deleteLocation);
  const [name, setName] = useState(l.name);
  const dirty = name.trim() !== l.name;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex gap-2 items-center">
        <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Location name" />
        <button
          type="button"
          className={`pill ${l.kind === "pit" ? "pill-purple" : "pill-muted"} shrink-0`}
          style={{ minHeight: 36, padding: "0 0.8rem" }}
          title="Tap to switch shop / pit"
          disabled={save.pending}
          onClick={() => save.call({ id: l.id, name: l.name, kind: l.kind === "pit" ? "shop" : "pit", sort: String(l.sort) })}
        >
          {l.kind === "pit" ? "Pit" : "Shop"}
        </button>
        {dirty ? (
          <button type="button" className="btn btn-primary text-sm" disabled={save.pending} onClick={() => save.call({ id: l.id, name, kind: l.kind, sort: String(l.sort) })}>
            Save
          </button>
        ) : (
          <ConfirmButton
            className="btn btn-ghost text-sm"
            link
            danger
            pending={del.pending}
            label={<span aria-label={`Delete ${l.name}`}>✕</span>}
            confirmLabel="Delete location"
            message={count ? `${count} piece(s) are in ${l.name}; they'll become “No location”.` : `Delete ${l.name}?`}
            onConfirm={() => del.call({ id: l.id })}
          />
        )}
      </div>
      <span className="mono text-xs" style={{ color: "var(--muted)" }}>
        {count} {count === 1 ? "piece" : "pieces"}
      </span>
      <ErrorText error={save.error ?? del.error} />
    </li>
  );
}
