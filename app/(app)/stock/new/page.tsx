import { getUnits } from "@/lib/fab-data";
import { FabMaterialForm } from "@/components/fab-material-form";
import { PageHead } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function NewMaterialPage() {
  const units = await getUnits();
  return (
    <>
      <PageHead eyebrow="Fab stock" title="Add material" />
      <FabMaterialForm units={units} />
    </>
  );
}
