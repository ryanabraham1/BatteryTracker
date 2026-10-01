"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  KIND_NAMES,
  PRIORITIES,
  STATUSES,
  type WorkData,
  type WorkItem,
  type WorkKind,
} from "@/lib/work";
import { Icon } from "./icons";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`work-dialog ${wide ? "work-dialog-wide" : ""} ${className}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="work-dialog-head">
        <span>{title}</span>
        <button
          className="work-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`work-field ${wide ? "work-field-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function EntitySelect({
  items,
  kind,
  value,
  onChange,
  empty = "None",
  exclude,
}: {
  items: WorkItem[];
  kind: WorkKind;
  value?: string;
  onChange: (v: string) => void;
  empty?: string;
  exclude?: string;
}) {
  return (
    <select
      className="input"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{empty}</option>
      {items
        .filter(
          (i) =>
            i.kind === kind && !i.deleted_at && !i.archived && i.id !== exclude,
        )
        .map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
          </option>
        ))}
    </select>
  );
}
function IssueComposer({
  preset,
  items,
  pending,
  error,
  onClose,
  onSave,
}: {
  preset?: WorkData;
  items: WorkItem[];
  pending: boolean;
  error: string;
  onClose: () => void;
  onSave: (
    title: string,
    data: WorkData,
    createMore?: boolean,
  ) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [data, setData] = useState<WorkData>({
    status: "Todo",
    priority: 0,
    team: items.find((i) => i.kind === "team" && !i.archived && !i.deleted_at)
      ?.id,
    ...preset,
  });
  const [createMore, setCreateMore] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const statuses = [
    ...new Set([
      ...STATUSES,
      ...(items.find((i) => i.id === data.team)?.data.workflow ?? []),
    ]),
  ];
  const labels = items.filter(
    (i) =>
      i.kind === "label" &&
      !i.archived &&
      !i.deleted_at &&
      (!i.data.team || i.data.team === data.team),
  );
  const templates = items.filter(
    (i) =>
      i.kind === "template" &&
      !i.archived &&
      !i.deleted_at &&
      (!i.data.targetKind || i.data.targetKind === "issue"),
  );
  function patch<K extends keyof WorkData>(key: K, value: WorkData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }
  function choice(
    label: string,
    icon: string,
    kind: WorkKind,
    key: "team" | "assignee" | "project",
    empty: string,
  ) {
    return (
      <label className="work-compose-chip">
        <Icon name={icon} size={15} />
        <select
          aria-label={label}
          value={data[key] ?? ""}
          onChange={(e) => patch(key, e.target.value)}
        >
          <option value="">{empty}</option>
          {items
            .filter((i) => i.kind === kind && !i.archived && !i.deleted_at)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {kind === "team" ? i.data.identifier || i.title : i.title}
              </option>
            ))}
        </select>
      </label>
    );
  }
  return (
    <Modal title="New issue" onClose={onClose} className="work-issue-composer">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onSave(title, data, createMore)) {
            if (createMore) {
              setTitle("");
              setData((d) => ({ ...d, description: "" }));
              titleRef.current?.focus();
            }
          }
        }}
      >
        <div className="work-compose-top">
          {choice("Team", "team", "team", "team", "Team")}
          {templates.length > 0 && (
            <label className="work-compose-chip">
              <Icon name="template" size={15} />
              <select
                aria-label="Template"
                defaultValue=""
                onChange={(e) => {
                  const template = templates.find(
                    (t) => t.id === e.target.value,
                  );
                  if (template) {
                    setData((d) => ({
                      ...d,
                      ...template.data,
                      targetKind: undefined,
                    }));
                    setTitle(template.data.templateTitle ?? "");
                  }
                }}
              >
                <option value="">Template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="work-compose-writing">
          <input
            ref={titleRef}
            autoFocus
            required
            maxLength={300}
            className="work-title-input"
            aria-label="Title"
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="work-description-input"
            rows={3}
            aria-label="Description"
            placeholder="Add description…"
            value={data.description ?? ""}
            onChange={(e) => patch("description", e.target.value)}
          />
        </div>
        <div className="work-compose-properties">
          <label className="work-compose-chip">
            <Icon name="my-issues" size={15} />
            <select
              aria-label="Status"
              value={data.status}
              onChange={(e) => patch("status", e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="work-compose-chip">
            <Icon name="filter" size={15} />
            <select
              aria-label="Priority"
              value={data.priority ?? 0}
              onChange={(e) => patch("priority", Number(e.target.value))}
            >
              {PRIORITIES.map((p, i) => (
                <option key={p} value={i}>
                  {i === 0 ? "Priority" : p}
                </option>
              ))}
            </select>
          </label>
          {choice("Assignee", "member", "member", "assignee", "Assignee")}
          {choice("Project", "projects", "project", "project", "Project")}
          <label className="work-compose-chip work-compose-estimate">
            <Icon name="triage" size={15} />
            <input
              aria-label="Estimate (points)"
              type="number"
              min={0}
              max={100}
              placeholder="Estimate"
              value={data.estimate ?? ""}
              onChange={(e) =>
                patch(
                  "estimate",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
          <details className="work-compose-labels">
            <summary className="work-compose-chip">
              <Icon name="label" size={15} />
              Labels{data.labels?.length ? ` (${data.labels.length})` : ""}
            </summary>
            <div className="work-compose-label-options">
              {labels.map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    checked={data.labels?.includes(i.id) ?? false}
                    onChange={(e) =>
                      patch(
                        "labels",
                        e.target.checked
                          ? [...(data.labels ?? []), i.id]
                          : (data.labels ?? []).filter((id) => id !== i.id),
                      )
                    }
                  />
                  <span
                    className="work-color-dot"
                    style={{ background: i.data.color }}
                  />
                  {i.title}
                </label>
              ))}
              {labels.length === 0 && <p>No labels</p>}
            </div>
          </details>
        </div>
        <details className="work-compose-more">
          <summary>More properties</summary>
          <div className="work-form-grid">
            <Field label="Cycle">
              <EntitySelect
                items={items}
                kind="cycle"
                value={data.cycle}
                onChange={(v) => patch("cycle", v)}
              />
            </Field>
            <Field label="Milestone">
              <EntitySelect
                items={items.filter(
                  (i) =>
                    !data.project ||
                    i.kind !== "milestone" ||
                    i.data.project === data.project,
                )}
                kind="milestone"
                value={data.milestone}
                onChange={(v) => patch("milestone", v)}
              />
            </Field>
            <Field label="Parent issue">
              <EntitySelect
                items={items}
                kind="issue"
                value={data.parent}
                onChange={(v) => patch("parent", v)}
              />
            </Field>
            <Field label="Due date">
              <input
                className="input"
                type="date"
                value={data.due ?? ""}
                onChange={(e) => patch("due", e.target.value)}
              />
            </Field>
            <Field label="Requester / customer">
              <EntitySelect
                items={items}
                kind="customer"
                value={data.customer}
                onChange={(v) => patch("customer", v)}
              />
            </Field>
            <Field label="Release">
              <EntitySelect
                items={items}
                kind="release"
                value={data.release}
                onChange={(v) => patch("release", v)}
              />
            </Field>
            <Field label="Repeats">
              <select
                className="input"
                value={data.recurrence ?? ""}
                onChange={(e) =>
                  patch("recurrence", e.target.value as WorkData["recurrence"])
                }
              >
                <option value="">Does not repeat</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Reference link">
              <input
                className="input"
                type="url"
                placeholder="https://…"
                value={data.url ?? ""}
                onChange={(e) => patch("url", e.target.value)}
              />
            </Field>
          </div>
        </details>
        {error && (
          <p role="alert" className="work-error">
            {error}
          </p>
        )}
        <div className="work-compose-foot">
          <label className="work-compose-repeat">
            <input
              type="checkbox"
              checked={createMore}
              onChange={(e) => setCreateMore(e.target.checked)}
            />
            Create more
          </label>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Creating…" : "Create issue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ItemEditor({
  kind,
  item,
  preset,
  items,
  pending,
  error,
  onClose,
  onSave,
}: {
  kind: WorkKind;
  item?: WorkItem;
  preset?: WorkData;
  items: WorkItem[];
  pending: boolean;
  error: string;
  onClose: () => void;
  onSave: (
    title: string,
    data: WorkData,
    createMore?: boolean,
  ) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [data, setData] = useState<WorkData>(
    item?.data ?? {
      status: kind === "issue" ? "Backlog" : "Planned",
      priority: 0,
      ...preset,
    },
  );
  function patch<K extends keyof WorkData>(key: K, value: WorkData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }
  const issue = kind === "issue",
    plan = ["project", "initiative", "cycle", "milestone", "release"].includes(
      kind,
    );
  const statuses = issue
    ? [
        ...new Set([
          ...STATUSES,
          ...items
            .filter((i) => i.kind === "team" && i.id === data.team)
            .flatMap((i) => i.data.workflow ?? []),
        ]),
      ]
    : ["Planned", "In progress", "Done", "Canceled"];
  if (issue && !item)
    return (
      <IssueComposer
        preset={preset}
        items={items}
        pending={pending}
        error={error}
        onClose={onClose}
        onSave={onSave}
      />
    );
  return (
    <Modal
      title={`${item ? "Edit" : "New"} ${KIND_NAMES[kind].toLowerCase()}`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(title, data);
        }}
      >
        <div className="work-editor-body">
          {issue && !item && items.some((i) => i.kind === "template") && (
            <Field label="Start from a template">
              <select
                className="input"
                defaultValue=""
                onChange={(e) => {
                  const template = items.find((i) => i.id === e.target.value);
                  if (template)
                    setData({ ...template.data, targetKind: undefined });
                }}
              >
                <option value="">Blank issue</option>
                {items
                  .filter(
                    (i) =>
                      i.kind === "template" &&
                      !i.deleted_at &&
                      !i.archived &&
                      (!i.data.targetKind || i.data.targetKind === "issue"),
                  )
                  .map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.title}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <input
            autoFocus
            className="work-title-input"
            aria-label="Title"
            placeholder={
              issue ? "What needs to get done?" : `${KIND_NAMES[kind]} name`
            }
            required
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="work-description-input"
            aria-label="Description"
            placeholder={
              kind === "document"
                ? "Write your document… Markdown supported."
                : "Add a description… Markdown supported."
            }
            value={data.description ?? ""}
            onChange={(e) => patch("description", e.target.value)}
            rows={kind === "document" ? 12 : 5}
          />
          <div className="work-form-grid">
            {(issue || plan) && (
              <>
                <Field label="Status">
                  <select
                    className="input"
                    value={data.status ?? (issue ? "Backlog" : "Planned")}
                    onChange={(e) => patch("status", e.target.value)}
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority">
                  <select
                    className="input"
                    value={data.priority ?? 0}
                    onChange={(e) => patch("priority", Number(e.target.value))}
                  >
                    {PRIORITIES.map((s, i) => (
                      <option key={s} value={i}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {!["member", "team", "label", "customer", "view"].includes(
              kind,
            ) && (
              <Field label="Team">
                <EntitySelect
                  items={items}
                  kind="team"
                  value={data.team}
                  onChange={(v) => patch("team", v)}
                  empty="Workspace"
                />
              </Field>
            )}
            {(issue || plan) && (
              <Field label={issue ? "Assignee" : "Lead"}>
                <EntitySelect
                  items={items}
                  kind="member"
                  value={data.assignee}
                  onChange={(v) => patch("assignee", v)}
                  empty="Unassigned"
                />
              </Field>
            )}
            {["issue", "document", "milestone", "release"].includes(kind) && (
              <Field label="Project">
                <EntitySelect
                  items={items}
                  kind="project"
                  value={data.project}
                  onChange={(v) => patch("project", v)}
                />
              </Field>
            )}
            {kind === "initiative" && (
              <Field label="Parent initiative">
                <EntitySelect
                  items={items}
                  kind="initiative"
                  value={data.parentInitiative}
                  onChange={(v) => patch("parentInitiative", v)}
                  exclude={item?.id}
                />
              </Field>
            )}
            {kind === "team" && (
              <Field label="Parent team">
                <EntitySelect
                  items={items}
                  kind="team"
                  value={data.parentTeam}
                  onChange={(v) => patch("parentTeam", v)}
                  exclude={item?.id}
                />
              </Field>
            )}
            {kind === "project" && (
              <Field label="Initiative">
                <EntitySelect
                  items={items}
                  kind="initiative"
                  value={data.initiative}
                  onChange={(v) => patch("initiative", v)}
                />
              </Field>
            )}
            {issue && (
              <details className="work-advanced-properties">
                <summary>More properties</summary>
                <div className="work-form-grid">
                  <Field label="Cycle">
                    <EntitySelect
                      items={items}
                      kind="cycle"
                      value={data.cycle}
                      onChange={(v) => patch("cycle", v)}
                    />
                  </Field>
                  <Field label="Milestone">
                    <EntitySelect
                      items={items.filter(
                        (i) =>
                          !data.project ||
                          i.kind !== "milestone" ||
                          i.data.project === data.project,
                      )}
                      kind="milestone"
                      value={data.milestone}
                      onChange={(v) => patch("milestone", v)}
                    />
                  </Field>
                  <Field label="Parent issue">
                    <EntitySelect
                      items={items}
                      kind="issue"
                      value={data.parent}
                      onChange={(v) => patch("parent", v)}
                      exclude={item?.id}
                    />
                  </Field>
                  <Field label="Estimate (points)">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      value={data.estimate ?? 0}
                      onChange={(e) =>
                        patch("estimate", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Requester / customer">
                    <EntitySelect
                      items={items}
                      kind="customer"
                      value={data.customer}
                      onChange={(v) => patch("customer", v)}
                    />
                  </Field>
                  <Field label="Release">
                    <EntitySelect
                      items={items}
                      kind="release"
                      value={data.release}
                      onChange={(v) => patch("release", v)}
                    />
                  </Field>
                </div>
              </details>
            )}
            {(issue || plan) && (
              <>
                {plan && (
                  <Field label="Start date">
                    <input
                      className="input"
                      type="date"
                      value={data.start ?? ""}
                      onChange={(e) => patch("start", e.target.value)}
                    />
                  </Field>
                )}
                <Field label={issue ? "Due date" : "Target date"}>
                  <input
                    className="input"
                    type="date"
                    value={data.due ?? ""}
                    onChange={(e) => patch("due", e.target.value)}
                  />
                </Field>
              </>
            )}
            {kind === "project" && (
              <Field label="Health">
                <select
                  className="input"
                  value={data.health ?? "On track"}
                  onChange={(e) => patch("health", e.target.value)}
                >
                  {["On track", "At risk", "Off track"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            )}
            {issue && (
              <Field label="Repeats">
                <select
                  className="input"
                  value={data.recurrence ?? ""}
                  onChange={(e) =>
                    patch(
                      "recurrence",
                      e.target.value as WorkData["recurrence"],
                    )
                  }
                >
                  <option value="">Does not repeat</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
            )}
            {["label", "team", "member", "project", "initiative"].includes(
              kind,
            ) && (
              <Field label="Color">
                <input
                  className="input"
                  type="color"
                  value={data.color ?? "#6b3fd4"}
                  onChange={(e) => patch("color", e.target.value)}
                />
              </Field>
            )}
            {kind === "team" && (
              <Field label="Issue identifier">
                <input
                  className="input"
                  placeholder="MECH"
                  maxLength={10}
                  value={data.identifier ?? ""}
                  onChange={(e) =>
                    patch(
                      "identifier",
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                />
              </Field>
            )}
            {kind === "label" && (
              <Field label="Label group">
                <input
                  className="input"
                  placeholder="Type, Subsystem, Robot…"
                  value={data.group ?? ""}
                  onChange={(e) => patch("group", e.target.value)}
                />
              </Field>
            )}
            {kind === "template" && (
              <>
                <Field label="Template for">
                  <select
                    className="input"
                    value={data.targetKind ?? "issue"}
                    onChange={(e) =>
                      patch("targetKind", e.target.value as WorkKind)
                    }
                  >
                    {["issue", "project", "document"].map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Default issue status">
                  <select
                    className="input"
                    value={data.status ?? "Backlog"}
                    onChange={(e) => patch("status", e.target.value)}
                  >
                    {STATUSES.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field label="Reference link" wide>
              <input
                className="input"
                type="url"
                placeholder="https://…"
                value={data.url ?? ""}
                onChange={(e) => patch("url", e.target.value)}
              />
            </Field>
          </div>
          {(issue || plan || kind === "template") && (
            <div className="work-field mt-4">
              <span>Labels</span>
              <div className="work-label-picker">
                {items
                  .filter(
                    (i) => i.kind === "label" && !i.deleted_at && !i.archived,
                  )
                  .map((i) => (
                    <label key={i.id} className="work-chip">
                      <input
                        type="checkbox"
                        checked={data.labels?.includes(i.id) ?? false}
                        onChange={(e) =>
                          patch(
                            "labels",
                            e.target.checked
                              ? [...(data.labels ?? []), i.id]
                              : (data.labels ?? []).filter((id) => id !== i.id),
                          )
                        }
                      />
                      <span
                        className="work-color-dot"
                        style={{ background: i.data.color ?? "var(--purple)" }}
                      />
                      {i.title}
                    </label>
                  ))}
                {!items.some((i) => i.kind === "label") && (
                  <p className="work-muted">
                    Create labels in Settings to organize your work.
                  </p>
                )}
              </div>
            </div>
          )}
          {kind === "team" && (
            <Field label="Workflow statuses (one per line)">
              <textarea
                className="input"
                rows={4}
                value={(data.workflow ?? STATUSES).join("\n")}
                onChange={(e) =>
                  patch("workflow", e.target.value.split("\n").filter(Boolean))
                }
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="work-error mt-3">
              {error}
            </p>
          )}
        </div>
        <div className="work-dialog-foot">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending
              ? "Saving…"
              : item
                ? "Save changes"
                : `Create ${KIND_NAMES[kind].toLowerCase()}`}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
