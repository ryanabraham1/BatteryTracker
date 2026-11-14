"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { dateLabel, done, milestoneProgress, progress, today as todayKey, type WorkItem } from "@/lib/work";
import { laneSlots } from "@/lib/work-timeline";
import { Avatar, Empty } from "./collections";
import { Icon, MilestoneIcon, StatusPill } from "./icons";
import { useMilestoneMenu, type MilestoneActions } from "./milestone-menu";
import { useItemMenuShow } from "./item-menu";
import "./work-timeline.css";

const DAY = 86_400_000;
const SIDE = 280;
const ZOOMS = [
  { value: "week", label: "Weeks", px: 28 },
  { value: "month", label: "Months", px: 9 },
  { value: "fit", label: "Whole season", px: 0 },
] as const;
type Zoom = (typeof ZOOMS)[number]["value"];

/** The sticky project column is narrower on phones, so measure it. */
const sideWidth = (el: HTMLElement) => el.querySelector<HTMLElement>(".wtl-corner")?.offsetWidth ?? SIDE;
const utc = (key: string) => Date.parse(`${key.slice(0, 10)}T00:00:00Z`);
const monthName = (t: number, withYear: boolean) =>
  new Date(t).toLocaleDateString("en-US", { month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

/** Project roadmap: one row per project with a progress-filled date bar and its milestones underneath. */
export function Timeline({
  projects,
  items,
  onOpen,
  onPreview,
  milestoneActions,
}: {
  onPreview?: (i: WorkItem) => void;
  projects: WorkItem[];
  items: WorkItem[];
  onOpen: (i: WorkItem) => void;
  milestoneActions: MilestoneActions;
}) {
  const milestoneMenu = useMilestoneMenu(milestoneActions);
  const menuFor = useItemMenuShow();
  const [zoom, setZoom] = useState<Zoom>("month");
  const scroller = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(1100);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const now = todayKey();
  const today = utc(now);
  const milestones = items.filter(
    (i) => i.kind === "milestone" && !i.archived && !i.deleted_at && projects.some((p) => p.id === i.data.project),
  );
  const dates = [...projects.flatMap((p) => [p.data.start, p.data.due]), ...milestones.map((m) => m.data.due)]
    .filter((d): d is string => !!d)
    .map(utc);
  // Whole season plus some breathing room; snap the start to a Monday so week lines line up.
  const rawMin = Math.min(today - 21 * DAY, ...dates) - 7 * DAY;
  const min = rawMin - ((new Date(rawMin).getUTCDay() + 6) % 7) * DAY;
  const max = Math.max(today + 45 * DAY, ...dates) + 14 * DAY;
  const days = (max - min) / DAY;
  const fitPx = Math.max(2, (paneWidth - SIDE - 4) / days);
  const pxPerDay = zoom === "fit" ? fitPx : ZOOMS.find((z) => z.value === zoom)!.px;
  const width = Math.round(days * pxPerDay);
  const x = (t: number) => ((t - min) / DAY) * pxPerDay;

  // Keep today in view when the page opens or the zoom changes.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(today) - (el.clientWidth - sideWidth(el)) / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, projects.length]);

  if (!projects.length) return <Empty title="No projects yet" description="Create a project to start planning your roadmap." icon="timeline" />;

  const months: { t: number; left: number; width: number; label: string }[] = [];
  for (let d = new Date(min); d.getTime() < max; ) {
    const start = Math.max(min, Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const end = Math.min(max, next);
    months.push({ t: start, left: x(start), width: x(end) - x(start), label: monthName(start, months.length === 0 || new Date(start).getUTCMonth() === 0) });
    d = new Date(next);
  }
  const weeks: number[] = [];
  for (let t = min; t < max; t += 7 * DAY) weeks.push(t);
  const showWeekLabels = pxPerDay * 7 >= 36;

  function openProject(p: WorkItem) {
    if (onPreview) onPreview(p);
    else onOpen(p);
  }
  function jumpToday() {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, x(today) - (el.clientWidth - sideWidth(el)) / 3), behavior: "smooth" });
  }

  return (
    <div className="wtl">
      <div className="wtl-toolbar">
        <div className="wtl-zoom" role="group" aria-label="Timeline zoom">
          {ZOOMS.map((z) => (
            <button key={z.value} aria-pressed={zoom === z.value} onClick={() => setZoom(z.value)}>
              {z.label}
            </button>
          ))}
        </div>
        <button className="wtl-today-button" onClick={jumpToday}>
          <Icon name="target" size={16} /> Jump to today
        </button>
        <div className="wtl-legend" aria-label="Milestone key">
          <span><MilestoneIcon complete /> Done</span>
          <span><MilestoneIcon overdue /> Overdue</span>
          <span><MilestoneIcon /> Upcoming</span>
        </div>
      </div>

      <div className="wtl-scroll" ref={scroller}>
        <div className="wtl-grid" style={{ width: SIDE + width }}>
          <div className="wtl-head">
            <div className="wtl-corner">Project</div>
            <div className="wtl-head-track" style={{ width }}>
              <div className="wtl-months">
                {months.map((m, i) => (
                  <span key={m.t} data-alt={i % 2 === 1} style={{ left: m.left, width: m.width }}>
                    {m.width > m.label.length * 8.5 + 20 ? m.label : ""}
                  </span>
                ))}
              </div>
              <div className="wtl-weeks">
                {weeks.map((t) => (
                  <span key={t} style={{ left: x(t) }}>
                    {/* Leave room for the Today pill instead of printing a date under it. */}
                    {showWeekLabels && Math.abs(x(t) + 8 - x(today)) > 40 ? new Date(t).getUTCDate() : ""}
                  </span>
                ))}
              </div>
              <span className="wtl-today-pill" style={{ left: x(today) }}>
                Today
              </span>
            </div>
          </div>

          {projects.map((p) => {
            const stages = milestones.filter((m) => m.data.project === p.id);
            const projectDates = [p.data.start, p.data.due, ...stages.map((m) => m.data.due)].filter((d): d is string => !!d).map(utc);
            const start = p.data.start ? utc(p.data.start) : projectDates.length ? Math.min(...projectDates) : null;
            const end = p.data.due ? utc(p.data.due) : projectDates.length ? Math.max(...projectDates) : null;
            const tasks = items.filter((i) => i.kind === "issue" && !i.archived && !i.deleted_at && i.data.project === p.id);
            const pct = progress(tasks);
            const color = p.data.color || "var(--purple)";
            const slots = laneSlots(stages, x, width);
            const lanesUsed = slots.some((s) => s.width && s.lane === 1) ? 2 : slots.some((s) => s.width) ? 1 : 0;
            const undated = stages.filter((m) => !m.data.due);
            const barLeft = start !== null ? x(start) : 0;
            const barWidth = start !== null && end !== null ? Math.max(28, x(end + DAY) - barLeft) : 0;
            const lead = items.find((i) => i.id === p.data.assignee)?.title;
            const rowHeight = 76 + (stages.some((m) => m.data.due) ? 24 + lanesUsed * 26 : 0) + (undated.length ? 40 : 0);
            return (
              <div className="wtl-row" key={p.id} style={{ minHeight: rowHeight }}>
                <div className="wtl-side">
                  <button className="wtl-project" onContextMenu={menuFor(p)} onClick={() => openProject(p)} onDoubleClick={() => onPreview && onOpen(p)}>
                    <span className="wtl-project-icon" style={{ color }}>
                      <Icon name={p.data.icon || "projects"} size={18} />
                    </span>
                    <span className="wtl-project-text">
                      <b>{p.title}</b>
                      <span>
                        {tasks.length ? `${pct}% · ${tasks.filter(done).length} of ${tasks.length} tasks done` : "No tasks yet"}
                      </span>
                    </span>
                  </button>
                  <div className="wtl-side-meta">
                    <StatusPill status={p.data.status || "Planned"} />
                    {lead && <Avatar small name={lead} />}
                  </div>
                </div>
                <div className="wtl-track" style={{ width }}>
                  <span className="wtl-past" style={{ width: x(today) }} />
                  {months.map((m, i) => i % 2 === 1 && <span key={m.t} className="wtl-band" style={{ left: m.left, width: m.width }} />)}
                  {weeks.map((t) => (
                    <span key={t} className="wtl-guide" style={{ left: x(t) }} />
                  ))}
                  {months.map((m, i) => i > 0 && <span key={m.t} className="wtl-month-line" style={{ left: m.left }} />)}
                  <span className="wtl-today-line" style={{ left: x(today) }} />
                  {start !== null && end !== null ? (
                    <button
                      className="wtl-bar"
                      data-narrow={barWidth < 190}
                      style={{ left: barLeft, width: barWidth, ["--bar" as string]: color }}
                      onClick={() => openProject(p)}
                      onContextMenu={menuFor(p)}
                      onDoubleClick={() => onPreview && onOpen(p)}
                      title={`${p.title}: ${dateLabel(p.data.start) || "?"} – ${dateLabel(p.data.due) || "?"} · ${pct}% done`}
                    >
                      <span className="wtl-bar-fill" style={{ width: `${pct}%` }} />
                      <span className="wtl-bar-label">
                        <b>{p.title}</b>
                        <span>
                          {p.data.start ? dateLabel(p.data.start) : "No start"} – {p.data.due ? dateLabel(p.data.due) : "No end"}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      className="wtl-no-dates"
                      style={{ left: Math.max(8, Math.min(x(today) + 10, width - 290)), ["--bar" as string]: color }}
                      onClick={() => onOpen(p)}
                    >
                      <Icon name="timeline" size={16} />
                      <span>
                        <b>No dates yet</b>
                        <span>Click to set a start and target date</span>
                      </span>
                    </button>
                  )}
                  {slots.map(({ m, left, lane, width: labelWidth }) => {
                    const status = milestoneProgress(m, items);
                    const overdue = !status.complete && m.data.due! < now;
                    const title = `${m.title} · ${dateLabel(m.data.due)} · ${status.completed}/${status.total} tasks done${status.complete ? " · Done" : overdue ? " · Overdue" : ""}`;
                    return (
                      <div key={m.id} className="wtl-milestone">
                        <button
                          className="wtl-marker"
                          style={{ left }}
                          onClick={() => onOpen(m)}
                          onContextMenu={(e) => milestoneMenu.show(m, e)}
                          title={title}
                          aria-label={title}
                        >
                          <MilestoneIcon percent={status.percent} complete={status.complete} overdue={overdue} size={16} />
                        </button>
                        {labelWidth > 0 && (
                          <button
                            className="wtl-milestone-label"
                            data-overdue={overdue}
                            data-done={status.complete}
                            style={{ left: left - 2, top: 98 + lane * 26, width: labelWidth }}
                            onClick={() => onOpen(m)}
                            onContextMenu={(e) => milestoneMenu.show(m, e)}
                            title={title}
                            tabIndex={-1}
                          >
                            <span>{m.title}</span>
                            <small>{dateLabel(m.data.due)}</small>
                          </button>
                        )}
                        {labelWidth > 0 && <span className="wtl-stem" style={{ left, top: 82, height: 16 + lane * 26 }} />}
                      </div>
                    );
                  })}
                  {!!undated.length && (
                    <div className="wtl-undated" style={{ left: Math.max(8, x(today) - 120), top: rowHeight - 44 }}>
                      <span>No date:</span>
                      {undated.map((m) => (
                        <button key={m.id} onClick={() => onOpen(m)} onContextMenu={(e) => milestoneMenu.show(m, e)}>
                          {m.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {milestoneMenu.element}
    </div>
  );
}
