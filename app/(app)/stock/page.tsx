import { Suspense } from "react";
import Link from "next/link";
import { getLocations, getMaterials, getOrders, getStockPieces, getUnits } from "@/lib/fab-data";
import { FabRack } from "@/components/fab-rack";
import { PageHead, UnitsToggle } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const [materials, pieces, orders, locations, units] = await Promise.all([
    getMaterials(),
    getStockPieces(),
    getOrders({ open: true }),
    getLocations(),
    getUnits(),
  ]);
  return (
    <>
      <PageHead eyebrow="Rack" title="Fab stock">
        <UnitsToggle units={units} />
        <a href="/api/export/stock" className="btn btn-ghost text-sm shrink-0">
          Export CSV
        </a>
        <Link href="/stock/new" className="btn btn-primary text-sm flex-1 sm:flex-none whitespace-nowrap">
          Add material <span aria-hidden>→</span>
        </Link>
      </PageHead>
      <Suspense fallback={null}>
        <FabRack materials={materials} pieces={pieces} orders={orders} locations={locations} units={units} />
      </Suspense>
    </>
  );
}
