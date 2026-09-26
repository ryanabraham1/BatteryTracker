import { getFabSettings, getLocations, getMaterials, getStockPieces, getUnits } from "@/lib/fab-data";
import { FabSetup } from "@/components/fab-setup";
import { PageHead, UnitsToggle } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function StockSetupPage() {
  const [settings, locations, materials, pieces, units] = await Promise.all([
    getFabSettings(),
    getLocations(),
    getMaterials({ includeArchived: true }),
    getStockPieces(),
    getUnits(),
  ]);
  const counts: Record<string, number> = {};
  for (const p of pieces) if (p.location_id) counts[p.location_id] = (counts[p.location_id] ?? 0) + 1;
  return (
    <>
      <PageHead eyebrow="Fab stock" title="Setup">
        <UnitsToggle units={units} />
      </PageHead>
      <FabSetup settings={settings} locations={locations} archived={materials.filter((m) => m.archived)} counts={counts} units={units} />
    </>
  );
}
