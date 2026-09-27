import { Suspense } from "react";
import { getBoardData } from "@/lib/data";
import { Board } from "@/components/board";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const { items, settings } = await getBoardData();
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            Live board
          </p>
          <h1 className="display text-4xl sm:text-5xl">Which one next?</h1>
        </div>
      </div>
      <Suspense fallback={null}>
        <Board items={items} settings={settings} />
      </Suspense>
    </>
  );
}
