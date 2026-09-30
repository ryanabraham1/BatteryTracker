import { getUnits } from "@/lib/fab-data";
import { getMachines, getPartsSettings } from "@/lib/parts-data";
import { PartsMachines } from "@/components/parts-machines";
import { PageHead, UnitsToggle } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function MachinesPage() {
  const [machines, settings, units] = await Promise.all([getMachines(), getPartsSettings(), getUnits()]);
  return (
    <>
      <PageHead eyebrow="Parts" title="Machines">
        <UnitsToggle units={units} />
      </PageHead>
      <PartsMachines machines={machines} settings={settings} units={units} />
    </>
  );
}
