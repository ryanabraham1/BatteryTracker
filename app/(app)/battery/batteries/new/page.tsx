import { BatteryForm } from "@/components/battery-form";

export default function NewBatteryPage() {
  return (
    <>
      <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>
        Batteries
      </p>
      <h1 className="display text-4xl mb-5">Add a battery</h1>
      <BatteryForm />
    </>
  );
}
