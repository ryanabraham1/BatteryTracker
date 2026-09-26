import Link from "next/link";
import { notFound } from "next/navigation";
import { getMaterial, getUnits } from "@/lib/fab-data";
import { sizeLabel } from "@/lib/fab";
import { FabMaterialForm } from "@/components/fab-material-form";
import { PageHead } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function EditMaterialPage(props: PageProps<"/stock/[id]/edit">) {
  const { id } = await props.params;
  const [material, units] = await Promise.all([getMaterial(id), getUnits()]);
  if (!material) notFound();
  return (
    <>
      <div className="mb-4">
        <Link href={`/stock/${id}`} className="eyebrow" style={{ color: "var(--muted)" }}>
          ← {sizeLabel(material)}
        </Link>
      </div>
      <PageHead eyebrow={`${material.material} · edit`} title={sizeLabel(material)} />
      <FabMaterialForm material={material} units={units} />
    </>
  );
}
