import { Suspense } from "react";
import { getMaterials, getStockPieces, getUnits } from "@/lib/fab-data";
import { fmtAmount, materialName, summarize } from "@/lib/fab";
import { getJobs } from "@/lib/tracker-data";
import { TRACKER_LABEL, type Tracker } from "@/lib/tracker";
import { TrackerTable } from "@/components/tracker";
import { PageHead } from "@/components/fab-ui";

/** Shared by /tracker (machining) and /tracker/print. */
export async function TrackerPage({ tracker }: { tracker: Tracker }) {
  const [jobs, materials, pieces, units] = await Promise.all([getJobs(tracker), getMaterials(), getStockPieces(), getUnits()]);
  // what's on the rack for each material a row is linked to
  const stock = Object.fromEntries(
    summarize(materials, pieces).map((s) => [
      s.material.id,
      { name: materialName(s.material), onHand: s.pieces.length ? `${s.pieces.length} on rack · ${fmtAmount(s.material, s.total, units)}` : "none on rack", low: s.low || !s.pieces.length },
    ]),
  );
  return (
    <>
      <PageHead eyebrow="Fab tracker" title={TRACKER_LABEL[tracker]} />
      <Suspense fallback={null}>
        <TrackerTable tracker={tracker} jobs={jobs} stock={stock} />
      </Suspense>
    </>
  );
}
