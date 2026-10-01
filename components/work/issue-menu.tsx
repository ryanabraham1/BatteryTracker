"use client";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { PRIORITIES, STATUSES, uniqueStatuses, type WorkData, type WorkItem } from "@/lib/work";
import { Icon, StatusIcon } from "./icons";

export type IssueActions = {
  onPatch: (issue: WorkItem, data: WorkData) => void;
  onArchive: (issue: WorkItem) => void;
  onTrash: (issue: WorkItem) => void;
  onOpen: (issue: WorkItem) => void;
  disabled?: boolean;
};

type Panel = "main" | "status" | "priority" | "assignee" | "labels";

/** Right-click menu for an issue: change status, priority, assignee and labels in place, plus open/archive/delete. */
export function useIssueMenu(items: WorkItem[], actions: IssueActions) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panel, setPanel] = useState<Panel>("main");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);

  // Move focus to the first entry whenever the menu opens or drills into a different panel.
  useEffect(() => {
    if (menu) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu, panel]);

  function show(issue: WorkItem, e: MouseEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPanel("main");
    setMenu({
      id: issue.id,
      x: Math.max(8, Math.min(e.clientX, window.innerWidth - 240)),
      y: Math.max(8, Math.min(e.clientY, window.innerHeight - 340)),
    });
  }

  // Read the live row so optimistic edits show immediately (and a deleted issue closes the menu).
  const issue = menu ? items.find(i => i.id === menu.id && !i.deleted_at && !i.archived) : undefined;
  const readOnly = !!actions.disabled;
  const run = (fn: () => void) => { setMenu(null); fn(); };
  const status = issue?.data.status ?? "Backlog";
  const labels = items.filter(i => i.kind === "label" && !i.archived && !i.deleted_at);
  const members = items.filter(i => i.kind === "member" && !i.archived && !i.deleted_at);
  const current = issue?.data.labels ?? [];

  let body: ReactNode = null;
  if (issue) {
    const back = <>
      <button role="menuitem" onClick={() => setPanel("main")}><Icon name="arrow" size={14} />Back</button>
      <hr />
    </>;
    if (panel === "main") body = <>
      <button role="menuitem" onClick={() => run(() => actions.onOpen(issue))}><Icon name="arrow" size={14} />Open issue</button>
      <hr />
      <button role="menuitem" disabled={readOnly} onClick={() => setPanel("status")}><StatusIcon status={status} />Status…</button>
      <button role="menuitem" disabled={readOnly} onClick={() => setPanel("priority")}><Icon name="filter" size={14} />Priority…</button>
      <button role="menuitem" disabled={readOnly} onClick={() => setPanel("assignee")}><Icon name="member" size={14} />Assignee…</button>
      <button role="menuitem" disabled={readOnly} onClick={() => setPanel("labels")}><Icon name="plus" size={14} />Labels…</button>
      <hr />
      <button role="menuitem" disabled={readOnly} onClick={() => run(() => actions.onArchive(issue))}><Icon name="check" size={14} />Archive</button>
      <button role="menuitem" className="danger" disabled={readOnly} onClick={() => run(() => actions.onTrash(issue))}><Icon name="trash" size={14} />Delete</button>
    </>;
    else if (panel === "status") body = <>{back}
      {uniqueStatuses([status, ...STATUSES]).map(s =>
        <button role="menuitemradio" aria-checked={s === status} key={s} onClick={() => run(() => actions.onPatch(issue, { status: s }))}>
          <StatusIcon status={s} />{s}{s === status && <Icon name="check" size={14} />}
        </button>)}
    </>;
    else if (panel === "priority") body = <>{back}
      {PRIORITIES.map((p, n) =>
        <button role="menuitemradio" aria-checked={n === (issue.data.priority ?? 0)} key={p} onClick={() => run(() => actions.onPatch(issue, { priority: n }))}>
          {p}{n === (issue.data.priority ?? 0) && <Icon name="check" size={14} />}
        </button>)}
    </>;
    else if (panel === "assignee") body = <>{back}
      {[{ id: "", title: "Unassigned" }, ...members].map(m =>
        <button role="menuitemradio" aria-checked={m.id === (issue.data.assignee ?? "")} key={m.id || "none"} onClick={() => run(() => actions.onPatch(issue, { assignee: m.id }))}>
          {m.title}{m.id === (issue.data.assignee ?? "") && <Icon name="check" size={14} />}
        </button>)}
    </>;
    else body = <>{back}
      {labels.map(l => {
        const on = current.includes(l.id);
        // Stays open so several labels can be toggled in one go.
        return <button role="menuitemcheckbox" aria-checked={on} key={l.id}
          onClick={() => actions.onPatch(issue, { labels: on ? current.filter(v => v !== l.id) : [...current, l.id] })}>
          <span className="work-color-dot" style={{ background: l.data.color || "var(--purple)" }} />{l.title}{on && <Icon name="check" size={14} />}
        </button>;
      })}
      {!labels.length && <p className="work-muted" style={{ padding: "8px 10px" }}>Create labels in Settings → Labels</p>}
    </>;
  }

  const element: ReactNode = menu && issue && <div ref={ref} className="work-context-menu" role="menu" aria-label={`${issue.title} actions`}
    style={{ left: menu.x, top: menu.y, maxHeight: "min(420px, calc(100vh - 16px))", overflowY: "auto" }}
    onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}
    onKeyDown={e => {
      if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      const buttons = Array.from(ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(i + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }}>{body}</div>;

  return { show, element };
}
