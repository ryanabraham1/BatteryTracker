import { notFound } from "next/navigation";
import { getMaterials, getUnits } from "@/lib/fab-data";
import { getDesigns, getMachines, getPart, getPartEvents, getPartFiles, getPartsSettings, getPerson } from "@/lib/parts-data";
import { checkPart } from "@/lib/dfm";
import { PartDetail } from "@/components/part-detail";

export const dynamic = "force-dynamic";
// Onshape exports wait on Onshape's translation service
export const maxDuration = 120;

export default async function PartPage(props: PageProps<"/parts/[id]">) {
  const { id } = await props.params;
  const part = await getPart(id);
  if (!part) notFound();
  const [files, events, materials, machines, settings, designs, units, person] = await Promise.all([
    getPartFiles(id),
    getPartEvents(id),
    getMaterials(),
    getMachines(),
    getPartsSettings(),
    getDesigns({ includeArchived: true }),
    getUnits(),
    getPerson(),
  ]);
  const material = part.material_id ? (materials.find((m) => m.id === part.material_id) ?? null) : null;
  const dfm = checkPart({ part, material, machines, processProp: settings.onshape_process_prop, units });
  const design = part.design_id ? (designs.find((d) => d.id === part.design_id) ?? null) : null;
  return (
    <PartDetail
      part={part}
      files={files}
      events={events}
      materials={materials}
      material={material}
      dfm={dfm}
      design={design}
      person={person}
      processProp={settings.onshape_process_prop}
      units={units}
    />
  );
}
