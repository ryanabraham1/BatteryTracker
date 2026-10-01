"use client";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  dateLabel,
  issueCode,
  milestoneProgress,
  KIND_NAMES,
  PRIORITIES,
  progress,
  STATUSES,
  uniqueStatuses,
  type WorkData,
  type WorkEvent,
  type WorkItem,
  type WorkKind,
} from "@/lib/work";
import { Avatar, Labels } from "./collections";
import { CommitInput, EntitySelect, Field } from "./editor";
import { Icon, StatusIcon } from "./icons";
import type { MilestoneActions } from "./milestone-menu";
import { ProjectDetail } from "./project-detail";
import { PropertyPicker } from "./property-picker";
export function RichText({ text }: { text: string }) {
  return (
    <div className="work-rich-text">
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}
export function ItemDetail({
  item,
  items,
  events,
  actor,
  pending,
  onEdit,
  onPatch,
  onComment,
  onOpen,
  onCreate,
  onArchive,
  onDelete,
  milestoneActions,
}: {
  milestoneActions: MilestoneActions;
  item: WorkItem;
  items: WorkItem[];
  events: WorkEvent[];
  actor: string;
  pending: boolean;
  onEdit: () => void;
  onPatch: (data: WorkData) => void;
  onComment: (body: string, type?: string) => Promise<boolean>;
  onOpen: (item: WorkItem) => void;
  onCreate: (kind: WorkKind, preset?: WorkData) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [comment, setComment] = useState("");
  const [relationId, setRelationId] = useState("");
  const [relationType, setRelationType] = useState<
    "blocks" | "blocked by" | "related" | "duplicate of"
  >("related");
  const issue = item.kind === "issue";
  const projects = items.filter(
    (i) =>
      i.kind === "project" && i.data.initiative === item.id && !i.deleted_at,
  );
  const children = items.filter(
    (i) =>
      !i.deleted_at &&
      !i.archived &&
      (issue
        ? i.data.parent === item.id
        : item.kind === "initiative"
          ? projects.some((p) => i.data.project === p.id)
          : item.kind === "cycle"
            ? i.data.cycle === item.id
            : item.kind === "milestone"
              ? i.data.milestone === item.id
              : i.data.project === item.id),
  );
  const inverse = items.flatMap((i) =>
    (i.data.relations ?? [])
      .filter((r) => r.id === item.id && !i.deleted_at)
      .map((r) => ({
        id: i.id,
        type:
          r.type === "blocks"
            ? "blocked by"
            : r.type === "blocked by"
              ? "blocks"
              : r.type === "duplicate of"
                ? "has duplicate"
                : "related",
      })),
  );
  const history = events
    .filter((e) => e.item_id === item.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (item.kind === "project") return <ProjectDetail key={item.id} {...{item, items, events, pending, onEdit, onPatch, onComment, onOpen, onCreate, onArchive, onDelete, milestoneActions}} />;
  return (
    <div className="work-detail" data-kind={item.kind}>
      <div className="work-detail-main">
        <div className="work-detail-kicker">
          <span className="work-code">
            {issue ? issueCode(item, items) : KIND_NAMES[item.kind]}
          </span>
          <div className="work-detail-actions">
            <button
              className="work-icon-button"
              aria-label="Favorite"
              aria-pressed={!!actor && !!item.data.favorites?.includes(actor)}
              disabled={!actor || pending}
              onClick={() =>
                onPatch({
                  favorites: item.data.favorites?.includes(actor)
                    ? item.data.favorites.filter((v) => v !== actor)
                    : [...(item.data.favorites ?? []), actor],
                })
              }
            >
              <Icon name="star" />
            </button>
            <button
              className="work-icon-button"
              aria-label="Copy link"
              onClick={() =>
                navigator.clipboard.writeText(window.location.href)
              }
            >
              <Icon name="link" />
            </button>
            <button className="btn btn-ghost" onClick={onEdit}>
              Edit
            </button>
          </div>
        </div>
        <h1>{item.title}</h1>
        {issue && item.data.parent && <button className="work-issue-parent" onClick={() => { const parent = items.find(i => i.id === item.data.parent); if (parent) onOpen(parent); }}><span>Sub-issue of</span><StatusIcon status={items.find(i => i.id === item.data.parent)?.data.status}/>{items.find(i => i.id === item.data.parent)?.title}</button>}
        {!issue && <Labels item={item} items={items} />}
        {item.data.description ? (
          <RichText text={item.data.description} />
        ) : (
          <button className="work-description-placeholder" onClick={onEdit}>
            Add a description…
          </button>
        )}
        {!!item.data.attachments?.length && (
          <div className="work-import-attachments">
            {item.data.attachments.map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                <Icon name="link" size={14} />
                {a.title}
              </a>
            ))}
          </div>
        )}
        {item.data.url && (
          <a
            className="work-reference"
            href={item.data.url}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="link" size={15} />
            {item.data.url}
          </a>
        )}
        {item.kind === "initiative" && (
          <section className="work-detail-section">
            <div className="work-section-title">
              <h2>Projects</h2>
              <button
                className="work-text-button"
                onClick={() => onCreate("project", { initiative: item.id })}
              >
                <Icon name="plus" size={14} />
                Add project
              </button>
            </div>
            {projects.map((p) => (
              <button
                key={p.id}
                className="work-child"
                onClick={() => onOpen(p)}
              >
                <Icon name="projects" />
                <span>{p.title}</span>
                <span className="work-muted">{p.data.status}</span>
              </button>
            ))}
          </section>
        )}
        {!["document", "template", "label", "team", "member", "view"].includes(
          item.kind,
        ) && (
          <section className="work-detail-section">
            <div className="work-section-title">
              <h2>
                {issue ? "Sub-issues" : "Issues"}
                <span>{children.filter((i) => i.kind === "issue").length}</span>
              </h2>
              <button
                className="work-text-button"
                onClick={() =>
                  onCreate(
                    "issue",
                    issue
                      ? {
                          parent: item.id,
                          team: item.data.team,
                          project: item.data.project,
                        }
                      : item.kind === "cycle"
                        ? { cycle: item.id, team: item.data.team }
                        : item.kind === "milestone"
                          ? { milestone: item.id, project: item.data.project }
                          : { project: item.id },
                  )
                }
              >
                <Icon name="plus" size={14} />
                Add issue
              </button>
            </div>
            {children
              .filter((i) => i.kind === "issue")
              .map((i) => (
                <button
                  key={i.id}
                  className="work-child"
                  onClick={() => onOpen(i)}
                >
                  <StatusIcon status={i.data.status} />
                  <span className="work-code">{issueCode(i, items)}</span>
                  <span>{i.title}</span>
                  <Avatar
                    small
                    name={items.find((m) => m.id === i.data.assignee)?.title}
                  />
                </button>
              ))}
            {!children.some((i) => i.kind === "issue") && (
              <p className="work-muted">
                Break the work into issues your team can pick up.
              </p>
            )}
          </section>
        )}
        <section className="work-detail-section">
          <div className="work-section-title">
            <h2>Activity</h2>
            <button
              className="work-text-button"
              disabled={!actor || pending}
              onClick={() =>
                onPatch({
                  subscribers: item.data.subscribers?.includes(actor)
                    ? item.data.subscribers.filter((v) => v !== actor)
                    : [...(item.data.subscribers ?? []), actor],
                })
              }
            >
              <Icon name="bell" size={14} />
              {item.data.subscribers?.includes(actor)
                ? "Subscribed"
                : "Subscribe"}
            </button>
          </div>
          <div className="work-activity">
            {history.length > 12 && <button className="work-text-button" onClick={() => setShowAllHistory(v => !v)}>{showAllHistory ? "Show recent activity" : `Show ${history.length - 12} earlier events`}</button>}
            {(showAllHistory ? history : history.slice(-12)).map((e) => (
              <div
                className={`work-activity-item ${["comment", "update"].includes(e.type) ? "work-comment" : ""}`}
                key={e.id}
              >
                <Avatar small name={e.actor} />
                <div>
                  <div className="work-activity-meta">
                    <b>{e.actor}</b>
                    <span>
                      {new Date(e.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {["comment", "update", "reaction"].includes(e.type) ? (
                    <>
                      <RichText text={e.body} />
                      {e.type !== "reaction" && (
                        <button
                          className="work-text-button"
                          disabled={pending}
                          onClick={() =>
                            onComment(`👍 ${e.actor}'s ${e.type}`, "reaction")
                          }
                        >
                          👍 React
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="work-muted">
                      {e.type === "status"
                        ? `Status → ${e.body}`
                        : `${e.type} this ${item.kind}`}
                      {e.type === "updated" &&
                        (() => {
                          const before = (e.data.before as WorkItem | undefined)
                              ?.data,
                            after = (e.data.after as WorkItem | undefined)
                              ?.data;
                          return before?.status !== after?.status
                            ? ` · ${before?.status ?? "None"} → ${after?.status ?? "None"}`
                            : "";
                        })()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form
            className="work-comment-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onComment(comment, issue ? "comment" : "update"))
                setComment("");
            }}
          >
            <textarea
              className="input"
              aria-label="Comment"
              placeholder={
                issue
                  ? "Leave a comment… Use @name to mention someone."
                  : "Share a progress update…"
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              required
            />
            <div>
              <span className="work-muted">Markdown supported</span>
              <button
                className="btn btn-primary"
                disabled={pending || !comment.trim()}
              >
                {pending ? "Posting…" : issue ? "Comment" : "Post update"}
              </button>
            </div>
          </form>
        </section>
      </div>
      <aside className="work-properties">
        <h2>Properties</h2>
        <Field label="Status">
          <PropertyPicker label="Status" value={item.data.status ?? "Planned"} disabled={pending} onChange={status => onPatch({status})}
            options={uniqueStatuses([item.data.status ?? "Planned", ...(issue ? STATUSES : ["Planned", "In progress", "Done", "Canceled"])]).map(s => ({value:s,label:s,icon:<StatusIcon status={s}/>}))}/>
        </Field>
        <Field label="Priority">
          <PropertyPicker label="Priority" value={String(item.data.priority ?? 0)} disabled={pending} onChange={v => onPatch({priority:Number(v)})} icon={<Icon name="insights" size={15}/>} options={PRIORITIES.map((p,n) => ({value:String(n),label:p}))}/>
        </Field>
        <Field label={issue ? "Assignee" : "Lead"}>
          <EntitySelect
                disabled={pending}
            kind="member"
            items={items}
            value={item.data.assignee}
            onChange={(v) => onPatch({ assignee: v })}
            empty="Unassigned"
          />
        </Field>
        {issue && <section className="work-detail-labels"><h2>Labels</h2><Labels item={item} items={items}/><button className="work-text-button" onClick={onEdit} disabled={pending}><Icon name="plus" size={14}/> Add label</button></section>}
        {issue && (
          <>
            <Field label="Project">
              <EntitySelect
                disabled={pending}
                kind="project"
                items={items}
                value={item.data.project}
                onChange={(v) => onPatch({ project: v, milestone: "" })}
              />
            </Field>
            <Field label="Milestone">
              <EntitySelect disabled={pending} kind="milestone" items={items.filter(i => i.kind !== "milestone" || i.data.project === item.data.project)} value={item.data.milestone} onChange={milestone => onPatch({milestone})}/>
            </Field>
            <Field label="Cycle">
              <EntitySelect
                disabled={pending}
                kind="cycle"
                items={items}
                value={item.data.cycle}
                onChange={(v) => onPatch({ cycle: v })}
              />
            </Field>
            <Field label="Due date">
              <CommitInput
                className="input"
                type="date"
                aria-label="Due date"
                disabled={pending}
                value={item.data.due ?? ""}
                onCommit={(due) => onPatch({ due })}
              />
            </Field>
            <Field label="Estimate">
              <CommitInput
                className="input"
                type="number"
                min={0}
                max={100}
                step={1}
                aria-label="Estimate"
                disabled={pending}
                value={String(item.data.estimate ?? 0)}
                onCommit={(v) => onPatch({ estimate: Math.min(100, Math.max(0, Math.round(Number(v) || 0))) })}
              />
            </Field>
          </>
        )}
        {item.kind === "milestone" && <><Field label="Project"><EntitySelect disabled={pending} kind="project" items={items} value={item.data.project} onChange={project => onPatch({project})}/></Field><Field label="Target date"><CommitInput className="input" type="date" aria-label="Milestone target date" disabled={pending} value={item.data.due || ""} onCommit={due => onPatch({due})}/></Field></>}
        {!["issue", "document"].includes(item.kind) && (
          <div className="work-detail-progress">
            <div className="work-progress">
              <span
                style={{
                  width: `${item.kind === "milestone" ? milestoneProgress(item, items).percent : progress(children.filter((i) => i.kind === "issue"))}%`,
                }}
              />
            </div>
            <p>
              {item.kind === "milestone" ? milestoneProgress(item, items).percent : progress(children.filter((i) => i.kind === "issue"))}% progress
            </p>
          </div>
        )}
        {issue && (
          <details className="work-detail-section work-issue-relations">
            <summary>Relationships</summary>
            {(item.data.relations ?? []).map((r, n) => {
              const other = items.find((i) => i.id === r.id);
              return (
                <div className="work-relation" key={`${r.id}-${r.type}`}>
                  <span>{r.type}</span>
                  <button onClick={() => other && onOpen(other)}>
                    {other?.title ?? "Unavailable issue"}
                  </button>
                  <button
                    className="work-icon-button"
                    aria-label="Remove relationship"
                    disabled={pending}
                    onClick={() =>
                      onPatch({
                        relations: item.data.relations?.filter(
                          (_, index) => index !== n,
                        ),
                      })
                    }
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              );
            })}
            {inverse.map((r) => (
              <div className="work-relation" key={r.id}>
                <span>{r.type}</span>
                <button
                  onClick={() => {
                    const i = items.find((i) => i.id === r.id);
                    if (i) onOpen(i);
                  }}
                >
                  {items.find((i) => i.id === r.id)?.title}
                </button>
              </div>
            ))}
            <select
              className="input"
              aria-label="Relationship type"
              value={relationType}
              onChange={(e) =>
                setRelationType(e.target.value as typeof relationType)
              }
            >
              {(issue
                ? ["related", "blocks", "blocked by", "duplicate of"]
                : ["related", "blocks", "blocked by"]
              ).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <EntitySelect
                disabled={pending}
              kind={issue ? "issue" : "project"}
              items={items}
              value={relationId}
              onChange={setRelationId}
              exclude={item.id}
              empty="Choose an issue"
            />
            <button
              className="work-text-button"
              disabled={!relationId || pending}
              onClick={() => {
                onPatch({
                  relations: [
                    ...(item.data.relations ?? []),
                    { id: relationId, type: relationType },
                  ],
                  ...(relationType === "duplicate of"
                    ? { status: "Duplicate" }
                    : {}),
                });
                setRelationId("");
              }}
            >
              Add relationship
            </button>
          </details>
        )}
        <div className="work-detail-section work-danger-zone">
          <button
            className="work-text-button"
            disabled={pending}
            onClick={onArchive}
          >
            <Icon name="archive" size={15} />
            {item.archived ? "Restore from archive" : "Archive"}
          </button>
          <button
            className="work-text-button"
            disabled={pending}
            onClick={onDelete}
          >
            Move to trash
          </button>
        </div>
        {item.kind === "initiative" && (
          <button
            className="work-text-button"
            onClick={() =>
              onCreate("initiative", { parentInitiative: item.id })
            }
          >
            Add sub-initiative
          </button>
        )}
        <p className="work-muted work-created">
          Created {dateLabel(item.created_at)}
        </p>
      </aside>
    </div>
  );
}
