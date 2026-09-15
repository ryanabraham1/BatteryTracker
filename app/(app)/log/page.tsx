import { getAllEvents, getBatteries } from "@/lib/data";
import { EventRow } from "@/components/event-row";
import { EVENT_LABEL, EVENT_TYPES } from "@/lib/types";
import { MobileCollapse } from "@/components/mobile-collapse";

export const dynamic = "force-dynamic";

export default async function LogPage(props: PageProps<"/log">) {
  const sp = await props.searchParams;
  const type = typeof sp.type === "string" ? sp.type : "";
  const batteryId = typeof sp.battery === "string" ? sp.battery : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";

  const [batteries, events] = await Promise.all([
    getBatteries(),
    getAllEvents({ type: type || undefined, batteryId: batteryId || undefined, from: from || undefined, to: to || undefined }),
  ]);
  const nameById = new Map(batteries.map((b) => [b.id, b.name]));
  const qs = new URLSearchParams();
  if (type) qs.set("type", type);
  if (batteryId) qs.set("battery", batteryId);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const activeFilters = [type, batteryId, from, to].filter(Boolean).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow" style={{ color: "var(--muted)" }}>Activity</p>
          <h1 className="display text-4xl sm:text-5xl">What&apos;s happened</h1>
        </div>
        <a href={`/api/export/events?${qs.toString()}`} className="btn btn-ghost text-sm">Export CSV</a>
      </div>

      {/* On phones the filters fold away behind a toggle row; on md+ they're always open. */}
      <MobileCollapse label="Filters" badge={activeFilters} defaultOpen={activeFilters > 0} className="card mb-4">
      <form className="p-3 pt-0 md:pt-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end" method="get">
        <label className="block">
          <span className="label">Type</span>
          <select name="type" className="input" defaultValue={type}>
            <option value="">All</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Battery</span>
          <select name="battery" className="input" defaultValue={batteryId}>
            <option value="">All</option>
            {batteries.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
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
          <button type="submit" className="btn btn-primary text-sm flex-1">Filter</button>
          <a href="/log" className="btn btn-ghost text-sm">Clear</a>
        </div>
      </form>
      </MobileCollapse>

      <div className="card px-4">
        <ul>
          {events.map((e) => (
            <EventRow key={e.id} event={e} batteryName={nameById.get(e.battery_id) ?? "?"} />
          ))}
          {events.length === 0 && <li className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>Nothing logged yet.</li>}
        </ul>
      </div>
      {events.length >= 500 && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Showing the newest 500. Narrow the filters or export CSV for the full history.</p>
      )}
    </>
  );
}
