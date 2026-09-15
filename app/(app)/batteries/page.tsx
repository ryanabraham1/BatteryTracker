import { Suspense } from "react";
import Link from "next/link";
import { getBoardData } from "@/lib/data";
import { BatteriesTable } from "@/components/batteries-table";

export const dynamic = "force-dynamic";

export default async function BatteriesPage() {
  const { items } = await getBoardData();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            Roster
          </p>
          <h1 className="display text-4xl sm:text-5xl">Batteries</h1>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <a href="/api/export/batteries" className="btn btn-ghost text-sm shrink-0">
            Export CSV
          </a>
          <Link href="/batteries/new" className="btn btn-primary text-sm flex-1 sm:flex-none">
            Add battery <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
      <Suspense fallback={null}>
        <BatteriesTable items={items} />
      </Suspense>
    </>
  );
}
