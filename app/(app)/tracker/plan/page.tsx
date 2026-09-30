import { getFabSettings, getLocations, getMaterials, getStockPieces, getUnits } from "@/lib/fab-data";
import { getDesigns, getMachines, getParts, getPartsSettings } from "@/lib/parts-data";
import { checkPart } from "@/lib/dfm";
import { BEFORE_CUT, isStockKind, toCut } from "@/lib/parts";
import { PartsPlan, type PlanPart } from "@/components/parts-plan";
import { PageHead, UnitsToggle } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

/**
 * Cut plan: every part still waiting on stock, across all the designs being
 * built, checked for manufacturability and packed onto what's on the rack.
 */
export default async function PlanPage() {
  const [parts, designs, materials, pieces, locations, machines, settings, fab, units] = await Promise.all([
    getParts(),
    getDesigns(),
    getMaterials(),
    getStockPieces(),
    getLocations(),
    getMachines(),
    getPartsSettings(),
    getFabSettings(),
    getUnits(),
  ]);
  const designById = new Map(designs.map((d) => [d.id, d]));
  const matById = new Map(materials.map((m) => [m.id, m]));

  const plan: PlanPart[] = [];
  for (const p of parts) {
    // stock parts not cut yet (SendCutSend / not needed / in progress are out)
    if (!isStockKind(p.kind) || !BEFORE_CUT.includes(p.status)) continue;
    // parts of archived designs are out; parts added by hand without a design are in
    if (p.design_id && !designById.has(p.design_id)) continue;
    const copies = p.design_id ? (designById.get(p.design_id)?.copies ?? 1) : 1;
    const left = toCut(p, copies);
    if (!left) continue;
    const material = p.material_id ? (matById.get(p.material_id) ?? null) : null;
    const dfm = checkPart({ part: p, material, machines, processProp: settings.onshape_process_prop, units });
    plan.push({
      id: p.id,
      name: p.name,
      bot: p.bot,
      kind: p.kind,
      design_id: p.design_id,
      toCut: left,
      material_id: material?.id ?? null,
      material_text: p.material_text,
      length: p.size_l_mm,
      width: p.size_w_mm,
      geometry: p.geometry ? { loops: p.geometry.loops, width: p.geometry.width, height: p.geometry.height } : null,
      dfm: {
        level: dfm.level,
        why: [...dfm.notes, ...(dfm.best?.issues ?? [])].find((i) => i.level === "fail")?.text ?? null,
        warns: (dfm.best?.issues ?? []).filter((i) => i.level === "warn").length,
        machineId: dfm.best?.machine.id ?? null,
      },
    });
  }

  return (
    <>
      <PageHead eyebrow="Fab tracker" title="Cut plan">
        <UnitsToggle units={units} />
      </PageHead>
      <PartsPlan
        parts={plan}
        designs={designs.map((d) => ({ id: d.id, name: d.name, copies: d.copies }))}
        materials={materials}
        pieces={pieces}
        locations={locations}
        machines={machines}
        gap={settings.nest_gap_mm}
        margin={settings.nest_margin_mm}
        kerf={fab.kerf_mm}
        units={units}
      />
    </>
  );
}
