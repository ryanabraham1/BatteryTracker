import { getLocations, getMaterials, getOrders, getStockPieces, getUnits } from "@/lib/fab-data";
import { FabShopping } from "@/components/fab-shopping";
import { PageHead, UnitsToggle } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const [materials, pieces, orders, locations, units] = await Promise.all([
    getMaterials({ includeArchived: true }),
    getStockPieces(),
    getOrders({ open: true }),
    getLocations(),
    getUnits(),
  ]);
  return (
    <>
      <PageHead eyebrow="Fab stock" title="Shopping list">
        <UnitsToggle units={units} />
      </PageHead>
      <FabShopping
        // archived materials only show up here if they still have an open order
        materials={materials.filter((m) => !m.archived || orders.some((o) => o.material_id === m.id))}
        pieces={pieces}
        orders={orders}
        locations={locations}
        units={units}
      />
    </>
  );
}
