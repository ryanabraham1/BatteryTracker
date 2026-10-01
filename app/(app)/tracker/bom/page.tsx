import { getDesigns, getParts } from "@/lib/parts-data";
import { PartsBom, type BomLine } from "@/components/parts-bom";
import { PageHead } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

/** The COTS BOM: bought parts and hardware from the designs being built — what to buy and whether it's here. */
export default async function BomPage() {
  const [parts, designs] = await Promise.all([getParts(), getDesigns({ includeArchived: true })]);
  const design = new Map(designs.map((d) => [d.id, d]));
  const lines: BomLine[] = parts
    .filter((p) => p.kind === "cots" && !(p.design_id && design.get(p.design_id)?.archived))
    .map((p) => {
      const d = p.design_id ? design.get(p.design_id) : undefined;
      return {
        id: p.id,
        name: p.name,
        part_number: p.part_number,
        description: p.description,
        need: p.quantity * (d?.copies ?? 1) + p.spare_qty,
        design: d?.name ?? "",
        bot: p.bot || d?.bot || "",
        vendor: p.vendor,
        url: p.url,
        unit_price: p.unit_price,
        status: p.cots_status,
        hardware: p.hardware,
        material: p.material_text,
      };
    });
  return (
    <>
      <PageHead eyebrow="Fab tracker" title="COTS BOM" />
      <PartsBom lines={lines} />
    </>
  );
}
