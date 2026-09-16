import { isAuthed } from "@/lib/auth";
import { getBoardData } from "@/lib/data";
import { toCsv } from "@/lib/format";

export async function GET() {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const { items } = await getBoardData();
  const rows = items.map(({ battery: b, health: h }) => ({
    name: b.name,
    brand_model: b.brand_model,
    capacity_ah: b.capacity_ah,
    purchase_date: b.purchase_date,
    status: b.status,
    retired_reason: b.retired_reason,
    state: b.state,
    state_changed_at: b.state_changed_at,
    cycle_count: b.cycle_count,
    health_score: h.score,
    health_badge: h.badge,
    last_beak_at: h.latestBeak?.at ?? null,
    last_beak_voltage: h.latestBeak?.voltage ?? null,
    last_beak_ir_mohm: h.latestBeak?.internal_resistance_mohm ?? null,
    last_cba_at: h.latestCba?.at ?? null,
    last_cba_ah: h.latestCba?.measured_ah ?? null,
    last_cba_wh: h.latestCba?.measured_wh ?? null,
    last_cba_pct: h.latestCba ? Math.round(h.latestCba.pct) : null,
    avg_driver_rating: h.avgDriverRating,
    warnings: h.warnings.map((w) => w.text).join("; "),
    notes: b.notes,
  }));
  const csv = toCsv(rows, Object.keys(rows[0] ?? { name: "" }));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="batteries-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
