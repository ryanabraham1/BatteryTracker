"use client";

import { useState } from "react";
import { deleteMachine, saveMachine, savePartsSettings } from "@/app/parts-actions";
import { MACHINE_FIELD_LABEL, MACHINE_PROCESSES, PROCESS_FIELDS, PROCESS_LABEL, type FabMachine, type MachineProcess, type PartsSettings } from "@/lib/parts";
import { fmtLength, type Units } from "@/lib/units";
import { Sheet } from "./sheet";
import { ErrorText, Field, LengthInput, SubmitButton, useFabAction } from "./fab-ui";

const HINT: Partial<Record<keyof FabMachine, string>> = {
  tool_diameter_mm: "Router: the end mill you cut plate with. Sets the smallest inside radius and narrowest slot.",
  min_hole_mm: "Smaller holes get flagged (router: defaults to the bit).",
  min_web_mm: "Thinner strips of material get flagged.",
};

export function PartsMachines({ machines, settings, units }: { machines: FabMachine[]; settings: PartsSettings; units: Units }) {
  const [edit, setEdit] = useState<FabMachine | "new" | null>(null);
  const [saved, setSaved] = useState(false);
  const saveSettings = useFabAction(savePartsSettings, () => setSaved(true));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px] items-start">
      <div className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          The “can we make it?” checks hold every part up against these. A spec left blank isn&apos;t guessed — the check just says “not checked” until
          someone measures it.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {machines.map((m) => {
            const fields = PROCESS_FIELDS[m.process];
            const blank = fields.filter((f) => m[f] === null).length;
            return (
              <button key={m.id} type="button" onClick={() => setEdit(m)} className="card p-4 text-left flex flex-col gap-2 hover:border-[var(--purple)] transition-colors" style={{ opacity: m.active ? 1 : 0.55 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="eyebrow" style={{ color: "var(--muted)" }}>
                      {PROCESS_LABEL[m.process]}
                      {!m.active && " · off"}
                    </p>
                    <p className="text-xl font-medium tracking-tight leading-tight">{m.name}</p>
                  </div>
                  {blank > 0 && <span className="pill pill-warn shrink-0">{blank} blank</span>}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mono">
                  {fields.map((f) => (
                    <div key={f} className="contents">
                      <dt style={{ color: "var(--muted)" }}>{MACHINE_FIELD_LABEL[f]?.(m.process)}</dt>
                      <dd>{m[f] === null ? "—" : fmtLength(m[f] as number, units)}</dd>
                    </div>
                  ))}
                  {m.thickness_limits && (
                    <div className="contents">
                      <dt style={{ color: "var(--muted)" }}>By material</dt>
                      <dd>{m.thickness_limits}</dd>
                    </div>
                  )}
                </dl>
                {m.notes && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {m.notes}
                  </p>
                )}
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-ghost self-start" onClick={() => setEdit("new")}>
          Add a machine
        </button>
      </div>

      <form
        className="card p-4 flex flex-col gap-3"
        onSubmit={(e) => {
          setSaved(false);
          saveSettings.submit(e);
        }}
      >
        <h2 className="text-xl font-medium tracking-tight">Onshape &amp; cut plan</h2>
        <Field label="Process property" hint="Optional. An Onshape custom property on a part that overrides the guess of how it's made — see the Onshape tab for how to add one.">
          <input name="onshape_process_prop" className="input" defaultValue={settings.onshape_process_prop} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="onshape_require_prop" value="1" defaultChecked={settings.onshape_require_prop} className="mt-1" />
          <span>Only parts with it go on the tracker (the rest go on the COTS BOM). Off — the usual — part-numbered (0201_…) and printed parts go on the tracker too.</span>
        </label>
        <LengthInput name="nest_gap_mm" label="Gap between nested parts" units={units} defaultMm={settings.nest_gap_mm} hint="On top of the bit / kerf" />
        <LengthInput name="nest_margin_mm" label="Sheet edge margin" units={units} defaultMm={settings.nest_margin_mm} hint="Keep parts this far from the edge (clamps, tabs)" />
        <ErrorText error={saveSettings.error} />
        {saved && (
          <p className="text-sm" style={{ color: "var(--good)" }}>
            Saved.
          </p>
        )}
        <SubmitButton pending={saveSettings.pending} label="Save" />
      </form>

      <MachineSheet key={edit === "new" ? "new" : (edit?.id ?? "none")} machine={edit} onClose={() => setEdit(null)} units={units} />
    </div>
  );
}

function MachineSheet({ machine, onClose, units }: { machine: FabMachine | "new" | null; onClose: () => void; units: Units }) {
  const m = machine === "new" ? null : machine;
  const [process, setProcess] = useState<MachineProcess>(m?.process ?? "router");
  const save = useFabAction(saveMachine, () => onClose());
  const del = useFabAction(deleteMachine, () => onClose());
  const fields = PROCESS_FIELDS[process];
  const sheetish = process === "router" || process === "laser" || process === "waterjet";
  return (
    <Sheet open={machine !== null} onClose={onClose} eyebrow={m ? PROCESS_LABEL[m.process] : "New"} title={m ? m.name : "Add a machine"}>
      <form className="flex flex-col gap-3" onSubmit={save.submit}>
        {m && <input type="hidden" name="id" value={m.id} />}
        <Field label="Name">
          <input name="name" className="input" defaultValue={m?.name ?? ""} required />
        </Field>
        <Field label="Does">
          <select name="process" className="input" value={process} onChange={(e) => setProcess(e.target.value as MachineProcess)}>
            {MACHINE_PROCESSES.map((p) => (
              <option key={p} value={p}>
                {PROCESS_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {fields.map((f) => (
            <LengthInput key={`${process}-${f}`} name={f} label={MACHINE_FIELD_LABEL[f]?.(process) ?? f} units={units} defaultMm={m ? (m[f] as number | null) : null} hint={HINT[f] ?? "Blank = not checked"} />
          ))}
        </div>
        {sheetish && (
          <Field label="Thickness by material" hint='mm, first match wins: "stainless: 5, aluminum: 4". Beats “Thickest sheet”.'>
            <input name="thickness_limits" className="input mono text-sm" defaultValue={m?.thickness_limits ?? ""} />
          </Field>
        )}
        <Field label="Materials it can cut" hint="Comma-separated words matched against the part's material. Blank = anything.">
          <textarea name="materials" className="input text-sm" rows={2} defaultValue={m?.materials ?? ""} />
        </Field>
        <Field label="Notes">
          <input name="notes" className="input" defaultValue={m?.notes ?? ""} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="active" value="0" />
          <input type="checkbox" name="active" value="1" defaultChecked={m?.active ?? true} /> In use (off = ignored by the checks)
        </label>
        <ErrorText error={save.error ?? del.error} />
        <SubmitButton pending={save.pending} label="Save machine" />
        {m && (
          <button
            type="button"
            className="btn btn-danger text-sm"
            onClick={() => {
              if (confirm(`Delete ${m.name}?`)) del.call({ id: m.id });
            }}
          >
            Delete machine
          </button>
        )}
      </form>
    </Sheet>
  );
}
