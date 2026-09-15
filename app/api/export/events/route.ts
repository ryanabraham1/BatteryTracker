import { isAuthed } from "@/lib/auth";
import { getAllEvents, getBatteries } from "@/lib/data";
import { toCsv } from "@/lib/format";
import { describeEvent } from "@/components/event-row";

export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const [batteries, events] = await Promise.all([
    getBatteries(),
    getAllEvents({
      type: sp.get("type") || undefined,
      batteryId: sp.get("battery") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      limit: 50_000,
    }),
  ]);
  const nameById = new Map(batteries.map((b) => [b.id, b.name]));
  const rows = events.map((e) => ({
    occurred_at: e.occurred_at,
    battery: nameById.get(e.battery_id) ?? e.battery_id,
    type: e.type,
    summary: describeEvent(e),
    data: e.data,
  }));
  const csv = toCsv(rows, ["occurred_at", "battery", "type", "summary", "data"]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="battery-events-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
