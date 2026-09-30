import { Suspense } from "react";
import { getMaterials, getUnits } from "@/lib/fab-data";
import { getDesigns, getMachines, getPartFiles, getParts, getPartsSettings, getPerson, knownPeople } from "@/lib/parts-data";
import { checkPart } from "@/lib/dfm";
import { sizeLabel } from "@/lib/fab";
import { PartsBoard, type BoardPart } from "@/components/parts-board";
import { PageHead, UnitsToggle } from "@/components/fab-ui";
import { PersonPicker } from "@/components/parts-ui";

export const dynamic = "force-dynamic";

export default async function PartsPage() {
  const [parts, designs, materials, machines, settings, files, units, person] = await Promise.all([
    getParts(),
    getDesigns({ includeArchived: true }),
    getMaterials({ includeArchived: true }),
    getMachines(),
    getPartsSettings(),
    getPartFiles(),
    getUnits(),
    getPerson(),
  ]);
  const matById = new Map(materials.map((m) => [m.id, m]));
  const designById = new Map(designs.map((d) => [d.id, d]));
  const fileCount = new Map<string, number>();
  for (const f of files) fileCount.set(f.part_id, (fileCount.get(f.part_id) ?? 0) + 1);

  const board: BoardPart[] = parts
    .filter((p) => !p.design_id || !designById.get(p.design_id)?.archived)
    .map((p) => {
      const material = p.material_id ? (matById.get(p.material_id) ?? null) : null;
      const dfm = checkPart({ part: p, material, machines, processProp: settings.onshape_process_prop, units });
      const segs = p.geometry?.loops.reduce((n, l) => n + l.segs.length, 0) ?? 0;
      return {
        id: p.id,
        name: p.name,
        part_number: p.part_number,
        kind: p.kind,
        stage: p.stage,
        stage_changed_at: p.stage_changed_at,
        quantity: p.quantity,
        copies: p.design_id ? (designById.get(p.design_id)?.copies ?? 1) : 1,
        cut_qty: p.cut_qty,
        assignees: p.assignees,
        design_id: p.design_id,
        material: material ? `${material.material} ${sizeLabel(material)}` : p.material_text,
        materialId: material?.id ?? null,
        size: [p.size_l_mm, p.size_w_mm, p.size_t_mm],
        // thumbnails only for outlines small enough to ship to every phone
        outline: p.geometry && segs <= 400 ? { loops: p.geometry.loops, width: p.geometry.width, height: p.geometry.height } : null,
        dfm: { level: dfm.level, unchecked: dfm.unchecked, best: dfm.best?.machine.name ?? null },
        files: fileCount.get(p.id) ?? 0,
      };
    });

  return (
    <>
      <PageHead eyebrow="Parts" title="Build board">
        <PersonPicker person={person} people={knownPeople(parts)} />
        <UnitsToggle units={units} />
      </PageHead>
      <Suspense fallback={null}>
        <PartsBoard
          parts={board}
          designs={designs.filter((d) => !d.archived).map((d) => ({ id: d.id, name: d.name }))}
          materials={materials.filter((m) => !m.archived)}
          person={person}
          units={units}
        />
      </Suspense>
    </>
  );
}
