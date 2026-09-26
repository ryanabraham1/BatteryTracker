"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMaterial, setMaterialArchived } from "@/app/fab-actions";
import { FAB_SHAPES, MATERIAL_SUGGESTIONS, SHAPE_DIMS, SHAPE_LABEL, type FabMaterial, type FabShape } from "@/lib/fab";
import { fmtArea, type Units } from "@/lib/units";
import { ErrorText, Field, LengthInput, RectInput, SubmitButton, useFabAction } from "./fab-ui";

/** Common stock lengths so a new material is one tap away from sensible defaults. */
const DEFAULT_FULL: Record<Units, { stick: number; sheet: [number, number] }> = {
  in: { stick: 72 * 25.4, sheet: [24 * 25.4, 48 * 25.4] },
  mm: { stick: 2000, sheet: [600, 1200] },
};

export function FabMaterialForm({ material, units }: { material?: FabMaterial; units: Units }) {
  const router = useRouter();
  const [shape, setShape] = useState<FabShape>(material?.shape ?? "box_tube");
  const [system, setSystem] = useState<Units>(material?.system ?? units);
  const sheet = shape === "sheet";
  const dims = SHAPE_DIMS[shape];

  // Sheet low-stock line is an area; it's entered as "about a W × L piece".
  const minSide = material?.min_amount && sheet ? Math.sqrt(material.min_amount) : null;
  const [minRect, setMinRect] = useState<{ w: number | null; l: number | null }>({ w: minSide, l: minSide });
  const minArea = minRect.w && minRect.l ? minRect.w * minRect.l : null;

  const save = useFabAction(saveMaterial, (id) => router.push(`/stock/${id}`));
  const archive = useFabAction(setMaterialArchived, () => router.push("/stock"));

  const full = DEFAULT_FULL[system];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
      <form onSubmit={save.submit} className="card p-4 sm:p-5 flex flex-col gap-4">
        {material && <input type="hidden" name="id" value={material.id} />}
        <input type="hidden" name="shape" value={shape} />
        <input type="hidden" name="system" value={system} />

        <div>
          <span className="label">Shape</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FAB_SHAPES.map((s) => (
              <button key={s} type="button" className="tile text-sm font-medium" data-selected={shape === s} onClick={() => setShape(s)}>
                {SHAPE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Material">
          <input
            name="material"
            className="input"
            list="fab-material-suggestions"
            defaultValue={material?.material ?? ""}
            placeholder="6061 Al, Polycarbonate, Delrin…"
            required
          />
          <datalist id="fab-material-suggestions">
            {MATERIAL_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>

        <div>
          <span className="label">Sold in</span>
          <div className="grid grid-cols-2 gap-2">
            {(["in", "mm"] as Units[]).map((u) => (
              <button key={u} type="button" className="tile text-sm" data-selected={system === u} onClick={() => setSystem(u)}>
                <span className="block font-medium">{u === "in" ? "Inch sizes" : "Metric sizes"}</span>
                <span className="block mono text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                  {u === "in" ? `1×1 × 1/16 wall, 1/2" hex` : "20×20 × 1.5, 8 mm hex"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* keyed on shape + system so each field re-reads its default in the right units */}
        <div key={`${shape}-${system}`} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {dims.a && <LengthInput name="dim_a_mm" label={dims.a} units={system} defaultMm={material?.dim_a_mm} />}
          {dims.b && <LengthInput name="dim_b_mm" label={dims.b} units={system} defaultMm={material?.dim_b_mm} />}
          {dims.wall && <LengthInput name="wall_mm" label={dims.wall} units={system} defaultMm={material?.wall_mm} />}
        </div>

        {sheet ? (
          <div key={`full-${system}`}>
            <span className="label">Full sheet size (as bought)</span>
            <RectInput
              units={units}
              prefix="full_"
              defaultW={material?.full_width_mm ?? full.sheet[0]}
              defaultL={material?.full_length_mm ?? full.sheet[1]}
            />
          </div>
        ) : (
          <LengthInput
            key={`full-${system}`}
            name="full_length_mm"
            label="Full stick length (as bought)"
            units={units}
            defaultMm={material?.full_length_mm ?? full.stick}
            hint="New sticks default to this when you receive them"
          />
        )}

        {sheet ? (
          <div>
            <span className="label">Low stock when less than about</span>
            <RectInput units={units} defaultW={minRect.w} defaultL={minRect.l} prefix="min_" labels={["W", "L"]} onChange={(w, l) => setMinRect({ w, l })} />
            <input type="hidden" name="min_amount" value={minArea ?? ""} />
            <span className="block mt-1 text-xs" style={{ color: "var(--muted)" }}>
              {minArea ? `Total area under ${fmtArea(minArea, units)} → shopping list` : "Leave blank for no alert"}
            </span>
          </div>
        ) : (
          <LengthInput
            name="min_amount"
            label="Low stock when total under"
            units={units}
            defaultMm={material?.min_amount}
            hint="e.g. 12' — leave blank for no alert"
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Vendor">
            <input name="vendor" className="input" defaultValue={material?.vendor ?? ""} placeholder="REV, McMaster…" />
          </Field>
          <Field label="Part #">
            <input name="vendor_part" className="input mono" defaultValue={material?.vendor_part ?? ""} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Field label="Link">
            <input name="url" type="url" className="input" defaultValue={material?.url ?? ""} placeholder="https://…" />
          </Field>
          <Field label={sheet ? "$ / sheet" : "$ / stick"}>
            <input name="unit_cost" type="number" step="any" min="0" inputMode="decimal" className="input mono" defaultValue={material?.unit_cost ?? ""} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea name="notes" className="input" defaultValue={material?.notes ?? ""} placeholder="Rounded hex, pre-drilled, colour…" />
        </Field>

        <ErrorText error={save.error} />
        <SubmitButton pending={save.pending} label={material ? "Save material" : "Add material"} />
      </form>

      {material && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            {material.archived ? "Archived" : "Stop tracking"}
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {material.archived
              ? "Archived materials are hidden from the rack. Bring it back to use it again."
              : "Archive hides it from the rack and shopping list. Its pieces and history are kept."}
          </p>
          <ErrorText error={archive.error} />
          <button
            type="button"
            className={`btn ${material.archived ? "btn-ghost" : "btn-danger"}`}
            disabled={archive.pending}
            onClick={() => archive.call({ id: material.id, archived: material.archived ? "0" : "1" })}
          >
            {material.archived ? "Unarchive" : "Archive material"}
          </button>
        </div>
      )}
    </div>
  );
}
