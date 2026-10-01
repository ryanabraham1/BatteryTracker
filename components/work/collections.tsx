"use client";
import {
  dateLabel,
  done,
  issueCode,
  PRIORITIES,
  progress,
  STATUSES,
  type WorkItem,
  type WorkKind,
} from "@/lib/work";
import { Icon, StatusIcon } from "./icons";
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
  pending,
  group,
}: {
  rows: WorkItem[];
  items: WorkItem[];
  selected: string[];
  onSelect: (id: string) => void;
  onOpen: (item: WorkItem) => void;
  onStatus: (item: WorkItem, status: string) => void;
  pending: boolean;
  group: string;
}) {
  const groups =
    group === "status"
      ? [
          ...new Set([
            ...STATUSES,
            ...rows.map((i) => i.data.status ?? "Backlog"),
          ]),
        ].map((s) => ({
          key: s,
          title: s,
          rows: rows.filter((i) => (i.data.status ?? "Backlog") === s),
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
      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <section key={g.key}>
            <div className="work-group-heading">
              {group === "status" && <StatusIcon status={g.title} />}
              <h3>{g.title}</h3>
              <span>{g.rows.length}</span>
            </div>
            {g.rows.map((item) => (
              <div
                className="work-issue-row"
                key={item.id}
                data-selected={selected.includes(item.id)}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${item.title}`}
                  checked={selected.includes(item.id)}
                  onChange={() => onSelect(item.id)}
                />
                <span
                  className="work-priority"
                  data-priority={item.data.priority}
                  title={PRIORITIES[item.data.priority ?? 0]}
                >
                  {item.data.priority === 1
                    ? "!"
                    : item.data.priority
                      ? "▥"
                      : "—"}
                </span>
                <span className="work-code">{issueCode(item, items)}</span>
                <select
                  className="work-inline-status"
                  aria-label={`Status for ${item.title}`}
                  disabled={pending}
                  value={item.data.status ?? "Backlog"}
                  onChange={(e) => onStatus(item, e.target.value)}
                >
                  {[
                    ...new Set([
                      ...STATUSES,
                      ...rows.map((i) => i.data.status ?? "Backlog"),
                    ]),
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
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
                <Avatar
                  small
                  name={items.find((i) => i.id === item.data.assignee)?.title}
                />
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
  pending,
}: {
  rows: WorkItem[];
  items: WorkItem[];
  onOpen: (i: WorkItem) => void;
  onStatus: (i: WorkItem, status: string) => void;
  onCreate: (status: string) => void;
  pending: boolean;
}) {
  const statuses = [
    ...new Set([
      "Backlog",
      "Todo",
      "In progress",
      "In review",
      "Done",
      ...rows.map((i) => i.data.status ?? "Backlog"),
    ]),
  ];
  return (
    <div className="work-board">
      {statuses.map((status) => {
        const list = rows.filter(
          (i) => (i.data.status ?? "Backlog") === status,
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
}: {
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
                : kind === "cycle"
                  ? i.data.cycle === item.id
                  : kind === "release"
                    ? i.data.release === item.id
                    : kind === "customer"
                      ? i.data.customer === item.id
                      : kind === "milestone"
                        ? i.data.milestone === item.id
                        : false),
        );
        const pct = progress(children);
        return (
          <button
            className="work-project-card"
            key={item.id}
            onClick={() => onOpen(item)}
          >
            <div className="work-project-top">
              <span
                className="work-project-icon"
                style={{ color: item.data.color ?? "var(--purple)" }}
              >
                <Icon name={kind + "s"} size={22} />
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
              "cycle",
              "release",
              "customer",
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
export function Timeline({
  projects,
  onOpen,
}: {
  projects: WorkItem[];
  onOpen: (i: WorkItem) => void;
}) {
  const dated = projects.filter((p) => p.data.start || p.data.due);
  if (!dated.length)
    return (
      <Empty
        title="Give your projects a timeline"
        description="Set a start date and target date on a project to see your roadmap here."
        icon="timeline"
      />
    );
  const now = new Date().toISOString().slice(0, 10);
  const dates = dated
    .flatMap((p) => [
      p.data.start || p.data.due || now,
      p.data.due || p.data.start || now,
    ])
    .sort();
  const min = Date.parse(dates[0]) - 7 * 86400000,
    max = Math.max(
      Date.parse(dates[dates.length - 1]) + 7 * 86400000,
      min + 30 * 86400000,
    ),
    range = max - min;
  return (
    <div className="work-timeline">
      <div className="work-timeline-head">
        <span>Project</span>
        <div>
          {Array.from({ length: 5 }, (_, n) => (
            <span key={n}>
              {new Date(min + (range * n) / 4).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          ))}
        </div>
      </div>
      {dated.map((p) => {
        const start = Date.parse(p.data.start || p.data.due || now),
          end = Date.parse(p.data.due || p.data.start || now);
        return (
          <div className="work-timeline-row" key={p.id}>
            <button onClick={() => onOpen(p)}>{p.title}</button>
            <div>
              <button
                className="work-timeline-bar"
                style={{
                  left: `${(100 * (start - min)) / range}%`,
                  width: `${Math.max(3, (100 * (end - start)) / range)}%`,
                  background: p.data.color || "var(--purple)",
                }}
                onClick={() => onOpen(p)}
                title={`${p.title}: ${dateLabel(p.data.start)} – ${dateLabel(p.data.due)}`}
              >
                {p.title}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
