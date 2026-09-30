import { isAuthed } from "@/lib/auth";
import { getLocations, getMaterials, getStockPieces } from "@/lib/fab-data";
import { isSheet, SHAPE_LABEL, sizeLabel, usableArea } from "@/lib/fab";
import { toCsv } from "@/lib/format";
import { MM_PER_IN } from "@/lib/units";

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/** Every piece on the rack, one row each, in both inches and mm. */
export async function GET() {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const [materials, pieces, locations] = await Promise.all([getMaterials({ includeArchived: true }), getStockPieces(), getLocations()]);
  const mat = new Map(materials.map((m) => [m.id, m]));
  const loc = new Map(locations.map((l) => [l.id, l.name]));
  const rows = pieces.flatMap((p) => {
    const m = mat.get(p.material_id);
    if (!m) return [];
    return [
      {
        material: m.material,
        shape: SHAPE_LABEL[m.shape],
        size: sizeLabel(m),
        length_in: r2(p.length_mm / MM_PER_IN),
        width_in: isSheet(m) && p.width_mm ? r2(p.width_mm / MM_PER_IN) : null,
        length_mm: r2(p.length_mm),
        width_mm: isSheet(m) ? r2(p.width_mm) : null,
        has_cutouts: isSheet(m) ? p.has_cutouts : null,
        unusable_zones: isSheet(m) ? p.dead_zones.length : null,
        usable_sq_in: isSheet(m) ? r2(usableArea(p) / MM_PER_IN ** 2) : null,
        location: p.location_id ? (loc.get(p.location_id) ?? "") : "",
        vendor: m.vendor,
        vendor_part: m.vendor_part,
        notes: p.notes,
        added_at: p.created_at,
      },
    ];
  });
  rows.sort((a, b) => `${a.material}${a.shape}${a.size}`.localeCompare(`${b.material}${b.shape}${b.size}`));
  const csv = toCsv(rows, Object.keys(rows[0] ?? { material: "" }));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fab-stock-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
