import { isAuthed } from "@/lib/auth";
import { getMaterials, getOrders } from "@/lib/fab-data";
import { SHAPE_LABEL, sizeLabel } from "@/lib/fab";
import { toCsv } from "@/lib/format";
import { MM_PER_IN } from "@/lib/units";

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/** Open shopping list rows (needed + ordered), for whoever places the order. */
export async function GET() {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const [materials, orders] = await Promise.all([getMaterials({ includeArchived: true }), getOrders({ open: true })]);
  const mat = new Map(materials.map((m) => [m.id, m]));
  const rows = orders.flatMap((o) => {
    const m = mat.get(o.material_id);
    if (!m) return [];
    return [
      {
        vendor: m.vendor,
        vendor_part: m.vendor_part,
        material: m.material,
        shape: SHAPE_LABEL[m.shape],
        size: sizeLabel(m),
        quantity: o.quantity,
        length_in: o.length_mm ? r2(o.length_mm / MM_PER_IN) : null,
        width_in: o.width_mm ? r2(o.width_mm / MM_PER_IN) : null,
        length_mm: r2(o.length_mm),
        width_mm: r2(o.width_mm),
        unit_cost: m.unit_cost,
        est_total: m.unit_cost !== null ? r2(m.unit_cost * o.quantity) : null,
        status: o.status,
        expected_date: o.expected_date,
        link: m.url,
        notes: o.notes,
      },
    ];
  });
  rows.sort((a, b) => a.vendor.localeCompare(b.vendor));
  const csv = toCsv(rows, Object.keys(rows[0] ?? { vendor: "" }));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fab-shopping-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
