import { notFound } from "next/navigation";
import { getBatteryByName } from "@/lib/data";
import { BatteryForm } from "@/components/battery-form";

export const dynamic = "force-dynamic";

export default async function EditBatteryPage(props: PageProps<"/batteries/[name]/edit">) {
  const { name } = await props.params;
  const battery = await getBatteryByName(decodeURIComponent(name));
  if (!battery) notFound();
  return (
    <>
      <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>
        Edit
      </p>
      <h1 className="display text-4xl mb-5">{battery.name}</h1>
      <BatteryForm battery={battery} />
    </>
  );
}
