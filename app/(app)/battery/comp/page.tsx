import { getBoardData } from "@/lib/data";
import { CompPanel } from "@/components/comp";

export const dynamic = "force-dynamic";

export default async function CompPage() {
  const { items, settings } = await getBoardData();
  return (
    <>
      <p className="eyebrow" style={{ color: "var(--muted)" }}>Competition</p>
      <h1 className="display text-4xl sm:text-5xl mb-5">Match day</h1>
      <CompPanel items={items} settings={settings} />
    </>
  );
}
