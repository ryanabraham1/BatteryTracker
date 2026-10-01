"use client";
import { Fragment, useState } from "react";
import {
  dateLabel,
  today as todayKey,
  done,
  issueCode,
  milestoneProgress,
  PRIORITIES,
  progress,
  STATUSES,
  uniqueStatuses,
  type WorkData,
  type WorkItem,
  type WorkKind,
} from "@/lib/work";
import { useIssueMenu, type IssueActions } from "./issue-menu";
import { useMilestoneMenu, type MilestoneActions } from "./milestone-menu";
import { labelSlots } from "@/lib/work-timeline";
import { MultiPicker, PropertyPicker } from "./property-picker";
import { Icon, MilestoneIcon, StatusIcon } from "./icons";
export function Labels({ item, items }: { item: WorkItem; items: WorkItem[] }) {
  return (
    <span className="work-labels">
      {(item.data.labels ?? []).map((id) => {
        const label = items.find((i) => i.id === id);
        return label ? (
          <span className="work-chip" key={id}>
            <span
              className="work-color-dot"
              style={{ background: label.data.color || "var(--purple)" }}
            />
            {label.title}
          </span>
        ) : null;
      })}
    </span>
  );
}
/** Labels with a small checklist popover to add or remove them in place. */
export function LabelPicker({ item, items, disabled, onChange }: { item: WorkItem; items: WorkItem[]; disabled: boolean; onChange: (labels: string[]) => void }) {
  const all = items.filter(i => i.kind === "label" && !i.archived && !i.deleted_at);
  const valid = (item.data.labels ?? []).filter(id => all.some(l => l.id === id));
  return <span className="work-label-picker">
    <Labels item={item} items={items} />
    <MultiPicker label="Labels" disabled={disabled} values={valid} onChange={onChange} empty="Create labels in Settings → Labels"
      options={all.map(l => ({ value: l.id, label: l.title, color: l.data.color }))}>
      <Icon name="plus" size={14} /> {valid.length ? "Edit" : "Add label"}
    </MultiPicker>
  </span>;
}
export function Avatar({
  name,
  small = false,
}: {
  name?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`work-avatar ${small ? "work-avatar-small" : ""}`}
      title={name || "Unassigned"}
    >
      {name ? (
        name
          .split(/\s+/)
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      ) : (
        <Icon name="member" size={13} />
      )}
    </span>
  );
}
export function Empty({
  title,
  description,
  onCreate,
  action = "Create issue",
  icon = "issues",
}: {
  title: string;
  description: string;
  onCreate?: () => void;
  action?: string;
  icon?: string;
}) {
  return (
    <div className="work-empty">
      <div className="work-empty-art">
        <span />
        <span />
        <span />
        <div>
          <Icon name={icon} size={28} />
        </div>
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {onCreate && (
        <button className="btn btn-primary" onClick={onCreate}>
          <Icon name="plus" size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
export function IssueList({
  rows,
  items,
  selected,
  onSelect,
  onOpen,
  onStatus,
  onPatch,
  issueActions,
  pending,
  group,
}: {
  rows: WorkItem[];
  items: WorkItem[];
  selected: string[];
  onSelect: (id: string) => void;
  onOpen: (item: WorkItem) => void;
  onStatus: (item: WorkItem, status: string) => void;
  onPatch: (item: WorkItem, data: WorkData) => void;
  issueActions: IssueActions;
  pending: boolean;
  group: string;
}) {
  const issueMenu = useIssueMenu(items, issueActions);
  const groups =
    group === "status"
      ? uniqueStatuses([...STATUSES, ...rows.map(i => i.data.status ?? "Backlog")]).map((s) => ({
          key: s,
          title: s,
          rows: rows.filter((i) => (i.data.status ?? "Backlog").toLowerCase() === s.toLowerCase()),
        }))
      : group === "project"
        ? [...new Set(rows.map((i) => i.data.project || ""))].map((id) => ({
            key: id,
            title: items.find((i) => i.id === id)?.title ?? "No project",
            rows: rows.filter((i) => (i.data.project ?? "") === id),
          }))
        : [{ key: "all", title: "All issues", rows }];
  return (
    <div className="work-list">
      {issueMenu.element}
      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <section key={g.key}>
            <div className="work-group-heading">
              <input type="checkbox" className="work-group-select" aria-label={`Select all ${g.title} issues`} checked={g.rows.every(i => selected.includes(i.id))} ref={input => { if(input) input.indeterminate = g.rows.some(i => selected.includes(i.id)) && !g.rows.every(i => selected.includes(i.id)); }} onChange={e => { const checked = e.target.checked; g.rows.filter(i => selected.includes(i.id) !== checked).forEach(i => onSelect(i.id)); }}/>
              {group === "status" && <StatusIcon status={g.title} />}
              <h3>{g.title}</h3>
              <span>{g.rows.length}</span>
            </div>
            {g.rows.map((item) => (
              <div
                className="work-issue-row"
                key={item.id}
                data-selected={selected.includes(item.id)}
                onContextMenu={(e) => issueMenu.show(item, e)}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${item.title}`}
                  checked={selected.includes(item.id)}
                  onChange={() => onSelect(item.id)}
                />
                <div className="work-row-prop"><PropertyPicker label={`Priority for ${item.title}`} value={String(item.data.priority ?? 0)} disabled={pending} onChange={v => onPatch(item, { priority: Number(v) })}
                  display={<span className="work-priority" data-priority={item.data.priority}>{item.data.priority === 1 ? "!" : item.data.priority ? "▥" : "—"}</span>}
                  options={PRIORITIES.map((p, n) => ({ value: String(n), label: p }))} /></div>
                <span className="work-code">{issueCode(item, items)}</span>
                <div className="work-row-status-picker"><PropertyPicker label={`Status for ${item.title}`} value={item.data.status ?? "Backlog"} disabled={pending} onChange={status => onStatus(item,status)} display={<span className="work-sr-only">{item.data.status ?? "Backlog"}</span>} options={uniqueStatuses([item.data.status ?? "Backlog", ...STATUSES, ...rows.map(i => i.data.status ?? "Backlog")]).map(s => ({value:s,label:s,icon:<StatusIcon status={s}/>}))}/></div>
                <button className="work-row-title" onClick={() => onOpen(item)}>
                  {item.title}
                </button>
                <Labels item={item} items={items} />
                <span className="work-row-project">
                  {items.find((i) => i.id === item.data.project)?.title}
                </span>
                <span className="work-row-date">
                  {item.data.due && dateLabel(item.data.due)}
                </span>
                <div className="work-row-prop"><PropertyPicker label={`Assignee for ${item.title}`} value={item.data.assignee ?? ""} disabled={pending} onChange={assignee => onPatch(item, { assignee })}
                  display={<Avatar small name={items.find((i) => i.id === item.data.assignee)?.title} />}
                  options={[{ value: "", label: "Unassigned" }, ...items.filter(i => i.kind === "member" && !i.archived && !i.deleted_at).map(m => ({ value: m.id, label: m.title }))]} /></div>
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}
export function IssueBoard({
  rows,
  items,
  onOpen,
  onStatus,
  onCreate,
  issueActions,
  pending,
}: {
  rows: WorkItem[];
  items: WorkItem[];
  onOpen: (i: WorkItem) => void;
  onStatus: (i: WorkItem, status: string) => void;
  onCreate: (status: string) => void;
  issueActions: IssueActions;
  pending: boolean;
}) {
  const issueMenu = useIssueMenu(items, issueActions);
  const statuses = uniqueStatuses(["Backlog", "Todo", "In progress", "In review", "Done", ...rows.map(i => i.data.status ?? "Backlog")]);
  return (
    <div className="work-board">
      {issueMenu.element}
      {statuses.map((status) => {
        const list = rows.filter(
          (i) => (i.data.status ?? "Backlog").toLowerCase() === status.toLowerCase(),
        );
        return (
          <section
            className="work-board-column"
            key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const item = rows.find(
                (i) => i.id === e.dataTransfer.getData("text/plain"),
              );
              if (item && !pending) onStatus(item, status);
            }}
          >
            <div className="work-group-heading">
              <StatusIcon status={status} />
              <h3>{status}</h3>
              <span>{list.length}</span>
              <button
                className="work-icon-button"
                aria-label={`Add issue to ${status}`}
                onClick={() => onCreate(status)}
              >
                <Icon name="plus" size={15} />
              </button>
            </div>
            <div className="work-board-cards">
              {list.map((item) => (
                <button
                  className="work-issue-card"
                  key={item.id}
                  draggable={!pending}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", item.id)
                  }
                  onClick={() => onOpen(item)}
                  onContextMenu={(e) => issueMenu.show(item, e)}
                >
                  <span className="work-code">{issueCode(item, items)}</span>
                  <h3>{item.title}</h3>
                  <Labels item={item} items={items} />
                  <div className="work-card-foot">
                    <span
                      className="work-priority"
                      data-priority={item.data.priority}
                    >
                      {PRIORITIES[item.data.priority ?? 0]}
                    </span>
                    <span>{item.data.due && dateLabel(item.data.due)}</span>
                    <Avatar
                      small
                      name={
                        items.find((i) => i.id === item.data.assignee)?.title
                      }
                    />
                  </div>
                </button>
              ))}
              <button
                className="work-board-add"
                onClick={() => onCreate(status)}
              >
                <Icon name="plus" size={14} />
                Add issue
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
export function Collection({
  rows,
  items,
  kind,
  onOpen,
  onCreate,
  onPreview,
}: {
  onPreview?: (item: WorkItem) => void;
  rows: WorkItem[];
  items: WorkItem[];
  kind: WorkKind;
  onOpen: (item: WorkItem) => void;
  onCreate: () => void;
}) {
  if (!rows.length)
    return (
      <Empty
        title={`No ${kind === "initiative" ? "initiatives" : kind + "s"}`}
        description=""
        onCreate={onCreate}
        action={`Create ${kind}`}
        icon={kind + "s"}
      />
    );
  return (
    <div className="work-collection">
      {rows.map((item) => {
        const projects = items.filter(
          (i) =>
            i.kind === "project" &&
            i.data.initiative === item.id &&
            !i.deleted_at &&
            !i.archived,
        );
        const children = items.filter(
          (i) =>
            i.kind === "issue" &&
            !i.deleted_at &&
            !i.archived &&
            (kind === "initiative"
              ? projects.some((p) => p.id === i.data.project)
              : kind === "project"
                ? i.data.project === item.id
                : kind === "milestone"
                  ? i.data.milestone === item.id
                  : false),
        );
        const pct = progress(children);
        return (
          <button
            className="work-project-card"
            key={item.id}
            onClick={() => onPreview && item.kind === "project" ? onPreview(item) : onOpen(item)}
            onDoubleClick={() => { if (onPreview && item.kind === "project") onOpen(item); }}
          >
            <div className="work-project-top">
              <span
                className="work-project-icon"
                style={{ color: item.data.color ?? "var(--purple)" }}
              >
                <Icon name={kind === "project" && item.data.icon ? item.data.icon : kind + "s"} size={22} />
              </span>
              <span className="work-chip">
                {item.data.status ||
                  (kind === "document" ? "Document" : "Planned")}
              </span>
              <Icon name="arrow" size={16} />
            </div>
            <h3>{item.title}</h3>
            <p>
              {item.data.description?.replace(/[#*`]/g, "").slice(0, 150) ||
                "Add a description to share the context."}
            </p>
            {[
              "project",
              "initiative",
              "milestone",
            ].includes(kind) && (
              <>
                <div className="work-progress">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="work-card-foot">
                  <span>
                    {children.filter(done).length}/{children.length} issues
                  </span>
                  <b>{pct}%</b>
                </div>
              </>
            )}
            <div className="work-card-foot">
              <span>
                {item.data.health && (
                  <span className="work-health" data-health={item.data.health}>
                    {item.data.health}
                  </span>
                )}
                {item.data.start && `${dateLabel(item.data.start)} – `}
                {item.data.due && dateLabel(item.data.due)}
              </span>
              <Avatar
                small
                name={items.find((i) => i.id === item.data.assignee)?.title}
              />
            </div>
            {kind === "initiative" && (
              <span className="work-muted">{projects.length} projects</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
export function Timeline({ projects, items, onOpen, onPreview, milestoneActions }: { onPreview?: (i: WorkItem) => void; projects: WorkItem[]; items: WorkItem[]; onOpen: (i: WorkItem) => void; milestoneActions: MilestoneActions; }) {
  const milestoneMenu = useMilestoneMenu(milestoneActions);
  const [scale, setScale] = useState("month");
  const [focusToday, setFocusToday] = useState(true);
  const now = todayKey();
  const today = Date.parse(now);
  const day = 86400000;
  const milestones = items.filter(i => i.kind === "milestone" && !i.archived && !i.deleted_at && projects.some(p => p.id === i.data.project));
  const dates = [...projects.flatMap(p => [p.data.start, p.data.due]), ...milestones.map(m => m.data.due)].filter((d): d is string => !!d).map(d => Date.parse(d));
  if (!projects.length) return <Empty title="No projects yet" description="Create a project to start planning your roadmap." icon="timeline" />;
  const min = focusToday ? today - 45 * day : Math.min(today, ...dates) - 7 * day;
  const max = focusToday ? today + 60 * day : Math.max(today + 30 * day, ...dates) + 7 * day;
  const range = max - min;
  const width = Math.max(850, range / day * (scale === "week" ? 28 : scale === "month" ? 12 : 5));
  const x = (date: number) => (date - min) / range * 100;
  const step = scale === "week" ? 7 : scale === "month" ? 14 : Math.max(7, Math.ceil(range / day / 12 / 7) * 7);
  const ticks = Array.from({length: Math.floor(range / day / step) + 1}, (_, n) => min + n * step * day);
  return <div className="work-roadmap">
    <div className="work-roadmap-toolbar"><span><span className="work-milestone-diamond" data-complete="true">◇</span> Completed <span className="work-milestone-diamond" data-overdue="true">◇</span> Overdue <span className="work-milestone-diamond">◇</span> Upcoming</span><div><button className="work-control" data-active={focusToday} onClick={() => setFocusToday(v => !v)}>{focusToday ? "All dates" : "Today"}</button><PropertyPicker label="Timeline scale" value={scale} onChange={setScale} options={[{value:"fit",label:"Fit"},{value:"month",label:"Month"},{value:"week",label:"Week"}]}/></div></div>
    <div className="work-roadmap-scroll"><div className="work-roadmap-grid" style={{minWidth:width + 250}}>
      <div className="work-roadmap-head"><span>Projects</span><div>{ticks.map(t => <time key={t} style={{left:`${x(t)}%`}}>{dateLabel(new Date(t).toISOString())}</time>)}</div></div>
      {projects.map(p => {
        const stages = milestones.filter(m => m.data.project === p.id).sort((a,b) => (a.data.due || "9999").localeCompare(b.data.due || "9999"));
        const projectDates = [p.data.start, p.data.due, ...stages.map(m => m.data.due)].filter((d): d is string => !!d).map(d => Date.parse(d));
        const start = p.data.start ? Date.parse(p.data.start) : projectDates.length ? Math.min(...projectDates) : null;
        const end = p.data.due ? Date.parse(p.data.due) : projectDates.length ? Math.max(...projectDates) : null;
        const positioned = labelSlots(stages, min, max, width - 190);
        const undated = stages.filter(m => !m.data.due);
        return <div className="work-roadmap-row" key={p.id} style={{minHeight:undated.length ? 145 : 102}}>
          <button className="work-roadmap-project" onClick={() => onPreview ? onPreview(p) : onOpen(p)} onDoubleClick={() => { if (onPreview) onOpen(p); }}><Icon name={p.data.icon || "projects"} style={{color:p.data.color || "var(--purple)"}}/><span>{p.title}<small>{p.data.status || "Planned"}</small></span><Avatar small name={items.find(i => i.id === p.data.assignee)?.title}/></button>
          <div className="work-roadmap-track">{ticks.map(t => <span className="work-roadmap-guide" key={t} style={{left:`${x(t)}%`}}/>)}<span className="work-roadmap-today" style={{left:`${x(today)}%`}}><small>Today</small></span>
            {start !== null && end !== null && end >= min && start <= max ? <button className="work-roadmap-bar" style={{left:`${Math.max(0,x(start))}%`,width:`${Math.max(.5,Math.min(100,x(end))-Math.max(0,x(start)))}%`}} onClick={() => onPreview ? onPreview(p) : onOpen(p)} onDoubleClick={() => { if (onPreview) onOpen(p); }} title={`${p.title}: ${dateLabel(p.data.start)} – ${dateLabel(p.data.due)}`}><span>{p.title}</span></button> : <span className="work-roadmap-no-date">Set project dates to plan your timeline</span>}
            {positioned.map(({m,width:labelWidth}) => {
              const status = milestoneProgress(m, items);
              const left = x(Date.parse(m.data.due!));
              const complete = status.complete;
              const diamond = <MilestoneIcon percent={status.percent} complete={complete} overdue={!complete && m.data.due! < now} />;
              const title = `${m.title} · ${dateLabel(m.data.due)} · ${status.percent}% · ${status.completed}/${status.total} done${complete ? " · Completed" : ""}`;
              return <Fragment key={m.id}>
                <button className="work-roadmap-milestone work-roadmap-marker" style={{left:`${left}%`,top:34}} onClick={() => onOpen(m)} onContextMenu={e => milestoneMenu.show(m, e)} title={title} aria-label={title}>{diamond}</button>
                {labelWidth > 0 && <button className="work-roadmap-milestone work-roadmap-name" style={{left:`${left}%`,top:58,width:labelWidth}} onClick={() => onOpen(m)} onContextMenu={e => milestoneMenu.show(m, e)} title={title} tabIndex={-1}><span>{m.title}</span></button>}
              </Fragment>;
            })}
            {!!undated.length && <div className="work-roadmap-undated" style={{top:105}}>{undated.map(m => <button key={m.id} onClick={() => onOpen(m)} onContextMenu={e => milestoneMenu.show(m, e)}>{m.title} · No date · {milestoneProgress(m,items).percent}%</button>)}</div>}
          </div>
        </div>;
      })}
    </div></div>
    {milestoneMenu.element}
  </div>;
}
