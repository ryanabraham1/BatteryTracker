import Link from "next/link";
import type { ReactNode } from "react";
import { getAllEvents, getBoardData } from "@/lib/data";
import { getFabEvents, getKits, getLocations, getMaterials, getOrders, getStockPieces, getUnits } from "@/lib/fab-data";
import { sortReady } from "@/lib/health";
import { EVENT_LABEL, STATES, STATE_LABEL, STATE_TONE } from "@/lib/types";
import {
  describeEvent as describeFabEvent,
  FAB_EVENT_LABEL,
  FAB_EVENT_TONE,
  fmtAmount,
  kitStatus,
  sizeLabel,
  summarize,
} from "@/lib/fab";
import { fmtNum, timeAgo } from "@/lib/format";
import { describeEvent as describeBatteryEvent, EVENT_TONE } from "@/components/event-row";
import { getParts } from "@/lib/parts-data";
import { trackerOf } from "@/lib/parts";
import { isDone, priorityLabel, TRACKER_LABEL } from "@/lib/tracker";

export const dynamic = "force-dynamic";

/** 3256 Tools home: one glance at every tool, then a tap into the one you need. */
export default async function Home() {
  const [board, batteryEvents, materials, pieces, orders, locations, { kits, items: kitItems }, fabEvents, units, parts] = await Promise.all([
    getBoardData(),
    getAllEvents({ limit: 8 }),
    getMaterials(),
    getStockPieces(),
    getOrders({ open: true }),
    getLocations(),
    getKits(),
    getFabEvents({ limit: 8 }),
    getUnits(),
    // null until the tracker tables are set up, so the dashboard still loads
    getParts().catch(() => null),
  ]);

  // ── Batteries ──
  const live = board.items.filter((i) => i.battery.status !== "retired");
  const byState = Object.fromEntries(STATES.map((s) => [s, live.filter((i) => i.battery.state === s)]));
  const ready = sortReady(byState.ready);
  const grab = ready.find((i) => i.battery.status === "active" && i.health.restRemainingMin === 0) ?? ready[0];
  const alerts = live
    .flatMap((i) => i.health.warnings.map((w) => ({ name: i.battery.name, ...w })))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "fail" ? -1 : 1));
  const nameById = new Map(board.items.map((i) => [i.battery.id, i.battery.name]));

  // ── Fab stock ──
  const summaries = summarize(materials, pieces, orders);
  const low = summaries.filter((s) => s.low);
  const matById = new Map(materials.map((m) => [m.id, m]));
  const pitIds = new Set(locations.filter((l) => l.kind === "pit").map((l) => l.id));
  const kitNeed = kitItems.reduce((n, i) => n + i.count, 0);
  const kitPacked = [...kitStatus(kitItems, matById, pieces, pitIds).values()].reduce((n, s) => n + s.packed.length, 0);

  // ── Fab tracker ──
  const jobList = parts ?? [];
  const jobsDone = jobList.filter((j) => isDone(j.status)).length;
  const openJobs = jobList.filter((j) => !isDone(j.status));
  const jobsActive = openJobs.filter((j) => j.status === "in_progress").length;
  const unclaimed = openJobs.filter((j) => j.status === "in_progress" && j.assignees.length === 0).length;
  const urgent = openJobs.filter((j) => j.priority !== null && j.priority <= 1).sort((a, b) => a.priority! - b.priority!);

  // ── Recent activity across both tools ──
  const recent = [
    ...batteryEvents.map((e) => ({
      id: `b-${e.id}`,
      at: e.occurred_at,
      app: "Batteries",
      href: `/battery/batteries/${encodeURIComponent(nameById.get(e.battery_id) ?? "")}`,
      who: nameById.get(e.battery_id) ?? "?",
      pill: EVENT_TONE[e.type],
      label: EVENT_LABEL[e.type],
      text: describeBatteryEvent(e),
      undone: false,
    })),
    ...fabEvents.map((e) => {
      const m = matById.get(e.material_id);
      return {
        id: `f-${e.id}`,
        at: e.occurred_at,
        app: "Fab stock",
        href: m ? `/stock/${m.id}` : "/stock/log",
        who: m ? `${m.material} ${sizeLabel(m)}` : "Archived material",
        pill: `pill-${FAB_EVENT_TONE[e.type]}`,
        label: FAB_EVENT_LABEL[e.type],
        text: describeFabEvent(e, m, units),
        undone: !!e.undone_at,
      };
    }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <div className="mb-5">
        <p className="eyebrow" style={{ color: "var(--muted)" }}>
          FRC 3256 · {today}
        </p>
        <h1 className="display text-5xl sm:text-6xl">Team tools</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-stretch">

        {/* Batteries */}
        <ToolCard
          href="/battery"
          name="Batteries"
          tagline="Which one to grab next"
          icon={
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2" y="7" width="17" height="10" rx="2" />
              <path d="M22 10v4M6 11v2M10 11v2" />
            </svg>
          }
          links={[
            ["/battery/log", "Log"],
            ["/battery/batteries", "Roster"],
            ["/battery/comp", "Comp"],
          ]}
          open="Open board"
        >
          <div className="rounded-lg p-4" style={{ background: grab ? "var(--good-soft)" : "var(--paper)" }}>
            <p className="eyebrow" style={{ color: grab ? "var(--good)" : "var(--muted)" }}>
              Grab next
            </p>
            {grab ? (
              <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
                <Link href={`/battery/batteries/${encodeURIComponent(grab.battery.name)}`} className="display text-4xl hover:underline break-all">
                  {grab.battery.name}
                </Link>
                <div className="flex gap-1.5 flex-wrap">
                  {grab.health.score !== null && (
                    <span className={`pill ${grab.health.badge === "good" ? "pill-good" : grab.health.badge === "watch" ? "pill-warn" : "pill-bad"}`}>
                      Health {grab.health.score}
                    </span>
                  )}
                  {grab.health.lastVoltage && <span className="pill pill-muted">{fmtNum(grab.health.lastVoltage.v, 2)} V</span>}
                  {grab.health.restRemainingMin > 0 && <span className="pill pill-warn">Resting {grab.health.restRemainingMin}m</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                Nothing is ready right now.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STATES.map((s) => (
              <Stat key={s} label={s === "needs_attention" ? "Attention" : STATE_LABEL[s]} value={byState[s].length} tone={byState[s].length ? STATE_TONE[s] : undefined} />
            ))}
          </div>

          <AlertList
            empty="No battery warnings."
            rows={alerts.slice(0, 3).map((a) => ({ key: `${a.name}-${a.text}`, strong: a.name, text: a.text, bad: a.level === "fail" }))}
            more={alerts.length - 3}
            moreHref="/battery/batteries"
          />
        </ToolCard>

        {/* Fab stock */}
        <ToolCard
          href="/stock"
          name="Fab stock"
          tagline="Tube, bar, hex and sheet on the rack"
          icon={
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="4" rx="1" />
              <rect x="3" y="10" width="13" height="4" rx="1" />
              <rect x="3" y="16" width="8" height="4" rx="1" />
            </svg>
          }
          links={[
            ["/stock/shopping", "Shopping"],
            ["/stock/kit", "Pit kit"],
            ["/stock/log", "Log"],
          ]}
          open="Open rack"
        >
          <div className="rounded-lg p-4" style={{ background: "var(--purple-soft)" }}>
            <p className="eyebrow" style={{ color: "var(--purple-dark)" }}>
              On the rack
            </p>
            <div className="flex items-baseline gap-3 flex-wrap mt-1">
              <span className="display text-4xl">{pieces.length}</span>
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                {pieces.length === 1 ? "piece" : "pieces"} across {materials.length} {materials.length === 1 ? "material" : "materials"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Low stock" value={low.length} tone={low.length ? "bad" : undefined} />
            <Stat label="On order" value={orders.length} tone={orders.length ? "warn" : undefined} />
            <Stat
              label="Pit kit"
              value={kits.length ? `${kitPacked}/${kitNeed}` : "—"}
              tone={kits.length ? (kitNeed > 0 && kitPacked >= kitNeed ? "good" : "warn") : undefined}
            />
          </div>

          <AlertList
            empty={materials.length ? "Nothing is running low." : "No materials yet — add the first one from the rack."}
            rows={low.slice(0, 3).map((s) => ({
              key: s.material.id,
              strong: `${s.material.material} ${sizeLabel(s.material)}`,
              text: `${fmtAmount(s.material, s.total, units)} left`,
              bad: true,
              href: `/stock/${s.material.id}`,
            }))}
            more={low.length - 3}
            moreHref="/stock/shopping"
          />
        </ToolCard>

        {/* Fab tracker */}
        <ToolCard
          href="/tracker"
          name="Fab tracker"
          tagline="The machining and 3D printing tracker"
          icon={
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 11l2 2 4-4" />
              <path d="M4 6h1M4 12h1M4 18h1M9 18h11M9 6h11" />
            </svg>
          }
          links={[
            ["/tracker/board", "Board"],
            ["/tracker/print", "3D printing"],
            ["/tracker/plan", "Cut plan"],
          ]}
          open="Open tracker"
        >
          <div className="rounded-lg p-4" style={{ background: "var(--good-soft)" }}>
            <p className="eyebrow" style={{ color: "var(--good)" }}>
              Finished
            </p>
            <div className="flex items-baseline gap-3 flex-wrap mt-1">
              <span className="display text-4xl">
                {jobsDone}/{jobList.length}
              </span>
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                {parts === null ? "tracker not set up yet" : "parts made"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Still to make" value={openJobs.length} />
            <Stat label="In progress" value={jobsActive} tone={jobsActive ? "info" : undefined} />
            <Stat label="No one on it" value={unclaimed} tone={unclaimed ? "warn" : undefined} />
          </div>

          <AlertList
            empty={jobList.length ? "Nothing urgent." : "Nothing tracked yet — import the tracker sheet or sync Onshape."}
            rows={urgent.slice(0, 3).map((j) => ({
              key: j.id,
              strong: `${priorityLabel(j.priority)} ${j.name}`,
              text: `${TRACKER_LABEL[trackerOf(j.kind)]}${j.bot ? ` · ${j.bot}` : ""}`,
              bad: j.priority === 0,
              href: `/tracker/${j.id}`,
            }))}
            more={urgent.length - 3}
            moreHref="/tracker"
          />
        </ToolCard>
      </div>

      <div className="card mt-4">
        <div className="px-4 pt-4 pb-1 flex items-center justify-between">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            Recent activity
          </p>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 pb-4 text-sm" style={{ color: "var(--muted)" }}>
            Nothing logged yet.
          </p>
        ) : (
          <ul className="px-4">
            {recent.map((r) => (
              <li key={r.id} className="py-2.5 border-t first:border-t-0 sm:flex sm:gap-3 sm:items-start" style={{ borderColor: "var(--line)" }}>
                {/* Mobile: tags + time on one row, text below. Desktop: one row. */}
                <div className="flex items-center justify-between gap-2 sm:contents">
                  <span className={`pill ${r.undone ? "pill-muted" : r.pill} shrink-0 sm:mt-0.5`}>{r.undone ? "Undone" : r.label}</span>
                  <span className="flex items-center gap-2 shrink-0 sm:order-last sm:mt-0.5">
                    <span className="chip">{r.app}</span>
                    <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
                      {timeAgo(r.at)}
                    </span>
                  </span>
                </div>
                <p className="text-sm min-w-0 flex-1 mt-1.5 sm:mt-0 break-words" style={r.undone ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
                  <Link href={r.href} className="font-semibold hover:underline mr-1.5">
                    {r.who}
                  </Link>
                  {r.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ToolCard({
  href,
  name,
  tagline,
  icon,
  links,
  open,
  children,
}: {
  href: string;
  name: string;
  tagline: string;
  icon: ReactNode;
  links: [string, string][];
  open: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5 flex flex-col gap-4">
      <Link href={href} className="flex items-center gap-3 group">
        <span className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--plum)", color: "var(--plum-text)" }}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-medium tracking-tight leading-tight group-hover:underline">{name}</span>
          <span className="block text-sm" style={{ color: "var(--muted)" }}>
            {tagline}
          </span>
        </span>
      </Link>
      {children}
      <div className="mt-auto flex gap-2 flex-wrap pt-1">
        <Link href={href} className="btn btn-primary text-sm w-full sm:w-auto">
          {open} <span aria-hidden>→</span>
        </Link>
        {links.map(([h, label]) => (
          <Link key={h} href={h} className="btn btn-ghost text-sm flex-1 sm:flex-none">
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg p-2.5 min-w-0" style={{ border: "1px solid var(--line)" }}>
      <p className="mono text-2xl font-semibold leading-none" style={{ color: tone ? `var(--${tone})` : "var(--ink)" }}>
        {value}
      </p>
      <p className="eyebrow mt-1.5 truncate" style={{ color: "var(--muted)", fontSize: 9.5, letterSpacing: "0.12em" }}>
        {label}
      </p>
    </div>
  );
}

function AlertList({
  rows,
  empty,
  more,
  moreHref,
}: {
  rows: { key: string; strong: string; text: string; bad: boolean; href?: string }[];
  empty: string;
  more: number;
  moreHref: string;
}) {
  if (!rows.length) {
    return (
      <p className="text-sm flex items-center gap-2" style={{ color: "var(--good)" }}>
        <span aria-hidden>✓</span> {empty}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="text-sm flex gap-2 items-baseline">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px]" style={{ background: r.bad ? "var(--bad)" : "var(--warn)" }} />
          <span className="min-w-0">
            {r.href ? (
              <Link href={r.href} className="font-semibold hover:underline">
                {r.strong}
              </Link>
            ) : (
              <span className="font-semibold">{r.strong}</span>
            )}{" "}
            <span style={{ color: "var(--muted)" }}>{r.text}</span>
          </span>
        </li>
      ))}
      {more > 0 && (
        <li>
          <Link href={moreHref} className="text-xs underline" style={{ color: "var(--muted)" }}>
            +{more} more
          </Link>
        </li>
      )}
    </ul>
  );
}
