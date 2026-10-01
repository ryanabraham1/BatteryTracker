"use client";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  dateLabel,
  issueCode,
  KIND_NAMES,
  PRIORITIES,
  progress,
  STATUSES,
  type WorkData,
  type WorkEvent,
  type WorkItem,
  type WorkKind,
} from "@/lib/work";
import { Avatar, Labels } from "./collections";
import { EntitySelect, Field } from "./editor";
import { Icon, StatusIcon } from "./icons";
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
}: {
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
            : item.kind === "release"
              ? i.data.release === item.id
              : item.kind === "customer"
                ? i.data.customer === item.id
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
  return (
    <div className="work-detail">
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
        <Labels item={item} items={items} />
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
                          : item.kind === "release"
                            ? { release: item.id, project: item.data.project }
                            : item.kind === "customer"
                              ? { customer: item.id, status: "Triage" }
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
        {item.kind === "project" && (
          <section className="work-detail-section">
            <div className="work-section-title">
              <h2>Milestones & documents</h2>
              <button
                className="work-text-button"
                onClick={() => onCreate("milestone", { project: item.id })}
              >
                Add milestone
              </button>
              <button
                className="work-text-button"
                onClick={() => onCreate("document", { project: item.id })}
              >
                Add document
              </button>
            </div>
            {children
              .filter((i) => ["milestone", "document"].includes(i.kind))
              .map((i) => (
                <button
                  key={i.id}
                  className="work-child"
                  onClick={() => onOpen(i)}
                >
                  <Icon
                    name={i.kind === "document" ? "documents" : "milestone"}
                  />
                  <span>{i.title}</span>
                  <span className="work-muted">{dateLabel(i.data.due)}</span>
                </button>
              ))}
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
            {history.map((e) => (
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
          <select
            className="input"
            disabled={pending}
            value={item.data.status ?? "Planned"}
            onChange={(e) => onPatch({ status: e.target.value })}
          >
            {[
              ...new Set([
                ...(issue
                  ? STATUSES
                  : ["Planned", "In progress", "Done", "Canceled"]),
                item.data.status ?? "Planned",
              ]),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            className="input"
            disabled={pending}
            value={item.data.priority ?? 0}
            onChange={(e) => onPatch({ priority: Number(e.target.value) })}
          >
            {PRIORITIES.map((p, n) => (
              <option key={p} value={n}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label={issue ? "Assignee" : "Lead"}>
          <EntitySelect
            kind="member"
            items={items}
            value={item.data.assignee}
            onChange={(v) => onPatch({ assignee: v })}
            empty="Unassigned"
          />
        </Field>
        {issue && (
          <>
            <Field label="Project">
              <EntitySelect
                kind="project"
                items={items}
                value={item.data.project}
                onChange={(v) => onPatch({ project: v })}
              />
            </Field>
            <Field label="Cycle">
              <EntitySelect
                kind="cycle"
                items={items}
                value={item.data.cycle}
                onChange={(v) => onPatch({ cycle: v })}
              />
            </Field>
            <Field label="Due date">
              <input
                className="input"
                type="date"
                value={item.data.due ?? ""}
                onChange={(e) => onPatch({ due: e.target.value })}
              />
            </Field>
            <Field label="Estimate">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={item.data.estimate ?? 0}
                onChange={(e) => onPatch({ estimate: Number(e.target.value) })}
              />
            </Field>
          </>
        )}
        {!["issue", "document"].includes(item.kind) && (
          <div className="work-detail-progress">
            <div className="work-progress">
              <span
                style={{
                  width: `${progress(children.filter((i) => i.kind === "issue"))}%`,
                }}
              />
            </div>
            <p>
              {progress(children.filter((i) => i.kind === "issue"))}% completed
            </p>
          </div>
        )}
        {(issue || item.kind === "project") && (
          <div className="work-detail-section">
            <h2>Relationships</h2>
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
          </div>
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
