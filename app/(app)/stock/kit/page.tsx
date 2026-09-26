import { getKits, getLocations, getMaterials, getStockPieces, getUnits } from "@/lib/fab-data";
import { FabKits } from "@/components/fab-kits";
import { PageHead, UnitsToggle } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function KitPage() {
  const [{ kits, items }, materials, pieces, locations, units] = await Promise.all([
    getKits(),
    getMaterials(),
    getStockPieces(),
    getLocations(),
    getUnits(),
  ]);
  return (
    <>
      <PageHead eyebrow="Competition" title="Pit kit">
        <UnitsToggle units={units} />
      </PageHead>
      <FabKits kits={kits} items={items} materials={materials} pieces={pieces} locations={locations} units={units} />
    </>
  );
}
