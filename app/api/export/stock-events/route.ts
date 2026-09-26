import type { NextRequest } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getFabEvents, getMaterials } from "@/lib/fab-data";
import { describeEvent, sizeLabel } from "@/lib/fab";
import { toCsv } from "@/lib/format";

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const [materials, events] = await Promise.all([
    getMaterials({ includeArchived: true }),
    getFabEvents({
      type: sp.get("type") || undefined,
      materialId: sp.get("material") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      limit: 20000,
    }),
  ]);
  const mat = new Map(materials.map((m) => [m.id, m]));
  const rows = events.map((e) => {
    const m = mat.get(e.material_id);
    return {
      occurred_at: e.occurred_at,
      type: e.type,
      material: m ? `${m.material} ${sizeLabel(m)}` : "",
      description_in: describeEvent(e, m, "in"),
      description_mm: describeEvent(e, m, "mm"),
      data: e.data,
    };
  });
  const csv = toCsv(rows, ["occurred_at", "type", "material", "description_in", "description_mm", "data"]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fab-stock-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
