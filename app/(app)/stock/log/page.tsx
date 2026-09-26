import Link from "next/link";
import { getFabEvents, getMaterials, getUnits } from "@/lib/fab-data";
import { describeEvent, FAB_EVENT_LABEL, FAB_EVENT_TONE, FAB_EVENT_TYPES, sizeLabel } from "@/lib/fab";
import { fmtDateTime } from "@/lib/format";
import { MobileCollapse } from "@/components/mobile-collapse";
import { PageHead, UnitsToggle } from "@/components/fab-ui";

export const dynamic = "force-dynamic";

export default async function StockLogPage(props: PageProps<"/stock/log">) {
  const sp = await props.searchParams;
  const type = typeof sp.type === "string" ? sp.type : "";
  const materialId = typeof sp.material === "string" ? sp.material : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";

  const [materials, events, units] = await Promise.all([
    getMaterials({ includeArchived: true }),
    getFabEvents({ type: type || undefined, materialId: materialId || undefined, from: from || undefined, to: to || undefined }),
    getUnits(),
  ]);
  const byId = new Map(materials.map((m) => [m.id, m]));
  const qs = new URLSearchParams();
  if (type) qs.set("type", type);
  if (materialId) qs.set("material", materialId);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const activeFilters = [type, materialId, from, to].filter(Boolean).length;

  return (
    <>
      <PageHead eyebrow="Fab stock activity" title="What's been cut">
        <UnitsToggle units={units} />
        <a href={`/api/export/stock-events?${qs.toString()}`} className="btn btn-ghost text-sm">
          Export CSV
        </a>
      </PageHead>

      <MobileCollapse label="Filters" badge={activeFilters} defaultOpen={activeFilters > 0} className="card mb-4">
        <form className="p-3 pt-0 md:pt-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end" method="get">
          <label className="block">
            <span className="label">Type</span>
            <select name="type" className="input" defaultValue={type}>
              <option value="">All</option>
              {FAB_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FAB_EVENT_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Material</span>
            <select name="material" className="input" defaultValue={materialId}>
              <option value="">All</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.material} {sizeLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">From</span>
            <input name="from" type="date" className="input mono" defaultValue={from} />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input name="to" type="date" className="input mono" defaultValue={to} />
          </label>
          <div className="flex gap-2 col-span-2 md:col-span-1">
            <button type="submit" className="btn btn-primary text-sm flex-1">
              Filter
            </button>
            <Link href="/stock/log" className="btn btn-ghost text-sm">
              Clear
            </Link>
          </div>
        </form>
      </MobileCollapse>

      <div className="card px-4">
        <ul>
          {events.map((e) => {
            const m = byId.get(e.material_id);
            return (
              <li key={e.id} className="py-3 border-b last:border-b-0 flex gap-3 items-start" style={{ borderColor: "var(--line)" }}>
                <span className={`pill pill-${FAB_EVENT_TONE[e.type]} mt-0.5 shrink-0`}>{FAB_EVENT_LABEL[e.type]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {m ? (
                      <Link href={`/stock/${m.id}`} className="font-medium hover:underline">
                        {m.material} {sizeLabel(m)}
                      </Link>
                    ) : (
                      <span className="font-medium">Deleted material</span>
                    )}
                  </p>
                  <p className="text-sm mt-0.5">{describeEvent(e, m, units)}</p>
                </div>
                <span className="mono text-xs shrink-0 mt-0.5" style={{ color: "var(--muted)" }}>
                  {fmtDateTime(e.occurred_at)}
                </span>
              </li>
            );
          })}
          {events.length === 0 && (
            <li className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              Nothing logged yet.
            </li>
          )}
        </ul>
      </div>
      {events.length >= 500 && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Showing the newest 500. Narrow the filters or export CSV for the full history.
        </p>
      )}
    </>
  );
}
