import { notFound } from "next/navigation";
import { getBatteryByName, getEventsForBattery, getSettings } from "@/lib/data";
import { computeHealth } from "@/lib/health";
import { BatteryDetail } from "@/components/battery-detail";

export const dynamic = "force-dynamic";

export default async function BatteryPage(props: PageProps<"/batteries/[name]">) {
  const { name } = await props.params;
  const battery = await getBatteryByName(decodeURIComponent(name));
  if (!battery) notFound();
  const [events, settings] = await Promise.all([getEventsForBattery(battery.id), getSettings()]);
  const health = computeHealth(battery, events, settings);
  return <BatteryDetail battery={battery} events={events} health={health} settings={settings} />;
}
