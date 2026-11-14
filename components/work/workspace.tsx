"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent } from "react";
import { addWorkComment, markWorkRead } from "@/app/work-actions";
import {
  activeWorkItems,
  dateLabel,
  done,
  filterIssues,
  KIND_NAMES,
  type WorkData,
  type WorkFilter,
  type WorkItem,
  type WorkKind,
} from "@/lib/work";
import { changedData, type WorkChange } from "@/lib/work-store";
import { Avatar, Collection, Empty } from "./collections";
import { Timeline } from "./timeline";
import { ProjectDetail } from "./project-detail";
import { ItemDetail, RichText } from "./detail";
import { Field, ItemEditor, Modal } from "./editor";
import { Icon } from "./icons";
import { AccessPanel } from "./access";
import { HelpGuide } from "./help";
import { WorkHome } from "./home";
import { DEFAULT_ISSUE_VIEW, IssueBrowser, type IssueView } from "./issue-browser";

import "./work.css";
import "./work-refresh.css";
import { PropertyPicker } from "./property-picker";
import { useIssueMenu, type IssueActions } from "./issue-menu";
import { useMilestoneMenu } from "./milestone-menu";
import { ItemMenuProvider, itemRoute, useItemMenu, usePageMenu } from "./item-menu";
import { WorkLink } from "./work-link";
import { useWork } from "./work-provider";
import type { PitProblem } from "@/lib/pit";
import { ReportIssueDialog, RobotIssues } from "./robot-issues";
const NAV = [
  { heading: "", links: [["home", "Home"]] },
  {
    heading: "Personal",
    links: [
      ["my-issues", "My work"],
      ["inbox", "Notifications"],
    ],
  },
  {
    heading: "Workspace",
    links: [
      ["issues", "Tasks"],
      ["robot", "Robot issues"],
      ["projects", "Projects"],
      ["initiatives", "Initiatives"],
      ["updates", "Updates"],
    ],
  },
];
const PAGE_GROUPS = [
  {
    paths: ["my-issues", "inbox"],
    tabs: [
      ["my-issues", "My tasks"],
      ["inbox", "Notifications"],
    ],
  },
  {
    paths: ["issues", "views", "archive"],
    tabs: [
      ["issues", "All tasks"],
      ["views", "Saved views"],
    ],
    more: [
      ["archive", "Archive & trash"],
    ],
  },
];
const SECTIONS: Record<string, { title: string; kind?: WorkKind; blurb?: string }> = {
  home: { title: "Home" },
  issues: {
    title: "Tasks",
    kind: "issue",
    blurb: "Everything the team is working on. Click a task to see details or change its status.",
  },
  "my-issues": {
    title: "My work",
    kind: "issue",
    blurb: "Tasks assigned to you, most urgent first.",
  },
  projects: {
    title: "Projects",
    kind: "project",
    blurb: "Big goals for the season. Each project groups the tasks that get it done.",
  },
  robot: {
    title: "Robot issues",
    blurb: "Anything wrong with the robot, from the shop or the pit. Report it here so a lead can get it fixed.",
  },
  initiatives: {
    title: "Initiatives",
    kind: "initiative",
    blurb: "Season-long goals that group projects together.",
  },
  views: {
    title: "Views",
    kind: "view",
    blurb: "Saved filters you can reuse.",
  },
  // No page of its own any more; kept so project documents still open at /work/documents/<id>.
  documents: {
    title: "Documents",
    kind: "document",
  },
  inbox: { title: "Notifications", blurb: "Mentions and changes on things you follow." },
  updates: {
    title: "Updates",
    blurb: "Progress updates on projects and initiatives. Post one here or from the project itself.",
  },
  archive: {
    title: "Archive & trash",
    blurb: "Restore anything that was archived or deleted.",
  },
  settings: {
    title: "Workspace settings",
    blurb: "People, labels, templates and exports.",
  },
};
const route = itemRoute;
type Toast = { text: string; tone?: "error"; undo?: () => void };
export function WorkWorkspace() {
  const { snapshot, user, access, items, save, saving, refresh, problems } = useWork();
  const router = useRouter();
  // The page to show. Everything Work shows is already in the browser, so a click (or Back) switches
  // pages at once by setting `target`; the router's own navigation catches up behind it.
  const pathname = usePathname();
  const [target, setTarget] = useState<string | null>(null);
  if (target !== null && target === pathname) setTarget(null);
  const path = target ?? pathname;
  const [, , section = "home", entityId] = path.split("/");
  const [posting, startTransition] = useTransition();
  const actor = user.memberId;
  const readOnly = user.role === "viewer";
  const params = useSearchParams();
  // Lives for the whole visit, so filters, layout and grouping survive opening a task and coming back.
  const [view, setView] = useState<IssueView>(() => {
    const saved = items.find((i) => i.id === entityId && i.kind === "view" && !i.deleted_at);
    const status = params.get("status");
    return {
      ...DEFAULT_ISSUE_VIEW,
      filter: status ? { status } : {},
      layout: saved?.data.layout === "board" ? "board" : "list",
      group: saved?.data.group || "status",
    };
  });
  const [projectLayout, setProjectLayout] = useState<"cards" | "timeline">("cards");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editor, setEditor] = useState<{
    kind: WorkKind;
    item?: WorkItem;
    preset?: WorkData;
    /** Starting title for a new item, e.g. a task made from a robot issue. */
    title?: string;
  } | null>(null);
  // A dialog (new item, edit, save view, import) is waiting on its save.
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [dialog, setDialog] = useState<"view" | "import" | "help" | "report" | "update" | null>(null);
  const [viewName, setViewName] = useState("");
  const [importText, setImportText] = useState("");
  const [settingsTab, setSettingsTab] = useState<WorkKind | "access">(
    user.role === "admin" ? "access" : "label",
  );
  const [archiveTab, setArchiveTab] = useState("archive");
  // Notifications marked read here disappear at once; the server catches up in the background.
  const [readNow, setReadNow] = useState<string[]>([]);
  const content = useRef<HTMLDivElement>(null);
  const scrolls = useRef(new Map<string, [number, number]>());
  const cameFrom = useRef(new Map<string, string>());
  const live = useMemo(() => activeWorkItems(items), [items]);
  const byId = useMemo(() => new Map(live.map(i => [i.id, i])), [live]);
  const receiptByEvent = useMemo(() => new Map(snapshot.receipts.map(r => [r.event_id, r])), [snapshot.receipts]);
  const member = live.find((i) => i.id === actor && i.kind === "member");
  const current = entityId
    ? items.find((i) => i.id === entityId && !i.deleted_at)
    : undefined;
  const preview = !entityId && section === "projects" ? live.find(i => i.id === previewId && i.kind === "project") : undefined;
  useEffect(() => {
    if (!preview) return;
    function closePreview(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector("dialog[open], :popover-open")) setPreviewId(null);
    }
    window.addEventListener("keydown", closePreview);
    return () => window.removeEventListener("keydown", closePreview);
  }, [preview]);
  const info = SECTIONS[section];
  const pageGroup = PAGE_GROUPS.find((g) => g.paths.includes(section));
  const navActive = (path: string) =>
    (PAGE_GROUPS.find((g) => g.paths.includes(path))?.paths ?? [path]).includes(
      section,
    );
  const teams = useMemo(() => live.filter((i) => i.kind === "team"), [live]);
  const soleTeamPreset = useMemo<WorkData>(() => (teams.length === 1 ? { team: teams[0].id } : {}), [teams]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo || toast.tone ? 8000 : 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.closest(
        "input,textarea,select,[contenteditable]",
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((c) => !c);
      } else if (
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "c" &&
        !editor &&
        !command &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        if (readOnly) setError("Your account has view-only access.");
        else setEditor({ kind: "issue", preset: soleTeamPreset });
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && !editor && !command && !document.querySelector("dialog[open]")) {
        if (e.key === "/") {
          const box = document.querySelector<HTMLInputElement>(".work-inline-search");
          if (box) {
            e.preventDefault();
            box.focus();
          }
        } else if (e.key === "?") {
          e.preventDefault();
          setDialog("help");
        }
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [editor, command, readOnly, soleTeamPreset]);
  function scrollTo(spot: [number, number] = [0, 0]) {
    window.scrollTo(0, spot[0]);
    content.current?.scrollTo(0, spot[1]);
  }
  useEffect(() => {
    // Back and forward switch just as fast, and land where that page was left.
    function onHistory() {
      const to = window.location.pathname;
      if (to !== "/work" && !to.startsWith("/work/")) return;
      setTarget(to);
      const spot = scrolls.current.get(to);
      if (spot) requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(spot)));
    }
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);
  /** Opens a page inside Work: it shows immediately, and the address bar and history follow. */
  function go(url: string, returning = false) {
    scrolls.current.set(path, [window.scrollY, content.current?.scrollTop ?? 0]);
    if (url === path && !window.location.search) return scrollTo();
    if (!returning) cameFrom.current.set(url, path);
    const spot = returning ? scrolls.current.get(url) : undefined;
    if (!spot) scrolls.current.delete(url);
    setTarget(url);
    router.push(url, { scroll: false });
    requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(spot)));
  }
  function create(kind: WorkKind = info?.kind ?? "issue", preset?: WorkData, title?: string) {
    if (readOnly) {
      setError("Your account has view-only access.");
      return;
    }
    setError("");
    // An unset value in a preset must not blank out a default (the team, most often).
    const given = Object.fromEntries(Object.entries(preset ?? {}).filter(([, v]) => v !== undefined));
    setEditor({
      kind,
      title,
      preset: { ...(kind === "issue" ? soleTeamPreset : {}), ...given },
    });
  }
  function open(item: WorkItem) {
    setPreviewId(null);
    setError("");
    setSidebarOpen(false);
    if (item.kind === "view")
      setView((v) => ({ ...v, filter: {}, layout: item.data.layout === "board" ? "board" : "list", group: item.data.group || "status" }));
    go(route(item));
  }
  function navigate(path: string, filter: WorkFilter = {}) {
    setPreviewId(null);
    setError("");
    setView((v) => ({ ...v, filter }));
    setSidebarOpen(false);
    go(`/work/${path}`);
  }
  /** Saves from a dialog: waits for the server so a refused save keeps the form open. */
  async function change(changes: WorkChange[], success: string) {
    setError("");
    setBusy(true);
    const result = await save(changes);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setToast({ text: success });
    return result.items;
  }
  /** Saves an in-place edit: it shows immediately, and is undone with the reason if the server refuses it. */
  function quick(changes: WorkChange[], notice?: Toast) {
    setError("");
    if (notice) setToast(notice);
    // The server takes at most 200 changes per request.
    for (let n = 0; n < changes.length; n += 200)
      save(changes.slice(n, n + 200), true).then((result) => {
        if (!result.ok) setToast({ text: result.error, tone: "error" });
      });
  }
  /** Removing the item on screen returns to the page it was opened from, scrolled where it was. */
  function leave(item: WorkItem) {
    if (item.id !== entityId) return;
    setPreviewId(null);
    go(cameFrom.current.get(path) ?? `/work/${section}`, true);
  }
  function patch(item: WorkItem, data: WorkData) {
    quick([{ id: item.id, data }]);
  }
  function saveItem(item: WorkItem, changes: { title?: string; data?: WorkData }) {
    quick([{ id: item.id, ...changes }]);
  }
  function trashItem(item: WorkItem) {
    leave(item);
    quick([{ id: item.id, deleted: true }], {
      text: `${KIND_NAMES[item.kind]} moved to trash`,
      undo: () => quick([{ id: item.id, deleted: false }]),
    });
  }
  function archiveItem(item: WorkItem) {
    leave(item);
    quick([{ id: item.id, archived: true }], {
      text: `${KIND_NAMES[item.kind]} archived`,
      undo: () => quick([{ id: item.id, archived: false }]),
    });
  }
  function restoreItem(item: WorkItem) {
    quick([{ id: item.id, archived: false, deleted: false }], { text: `${KIND_NAMES[item.kind]} restored` });
  }
  function bulk(issues: WorkItem[], change: { data?: WorkData; archived?: boolean; deleted?: boolean }) {
    if (!issues.length) return;
    const count = `${issues.length} ${issues.length === 1 ? "task" : "tasks"}`;
    const reverse = change.deleted ? { deleted: false } : change.archived ? { archived: false } : null;
    quick(issues.map((i) => ({ id: i.id, ...change })), {
      text: change.deleted ? `${count} moved to trash` : change.archived ? `${count} archived` : `${count} updated`,
      undo: reverse ? () => quick(issues.map((i) => ({ id: i.id, ...reverse }))) : undefined,
    });
  }
  function comment(item: WorkItem, body: string, type?: string) {
    return new Promise<boolean>((resolve) =>
      startTransition(async () => {
        // The action re-reads the workspace itself, so the new comment arrives with its response.
        const result = await addWorkComment(item.id, body, type ?? (item.kind === "issue" ? "comment" : "update")).catch(() => ({ ok: false, error: undefined }));
        if (!result.ok) setError(result.error ?? "Couldn't post.");
        resolve(result.ok);
      }),
    );
  }
  async function markRead(ids: string[], snoozedUntil: string | null = null) {
    setReadNow((now) => [...now, ...ids]);
    const result = await markWorkRead(ids, snoozedUntil).catch(() => ({ ok: false, error: undefined }));
    if (!result.ok) {
      setReadNow((now) => now.filter((id) => !ids.includes(id)));
      setError(result.error ?? "Couldn't update notifications.");
    }
  }
  const issueActions: IssueActions = { onPatch: patch, onArchive: archiveItem, onTrash: trashItem, onOpen: open, onBulk: bulk, disabled: readOnly };
  const milestoneActions = { onSave: saveItem, onTrash: trashItem, onOpen: open, disabled: readOnly };
  const issueMenu = useIssueMenu(items, issueActions);
  const milestoneMenu = useMilestoneMenu(milestoneActions);
  const itemMenu = useItemMenu(items, {
    actor,
    disabled: readOnly,
    onOpen: open,
    onEdit: (item) => { setError(""); setEditor({ kind: item.kind, item }); },
    onPatch: patch,
    onArchive: archiveItem,
    onRestore: restoreItem,
    onTrash: trashItem,
    onCreate: create,
  });
  const showItem = (item: WorkItem, e: ReactMouseEvent<HTMLElement>) =>
    item.kind === "issue" && !item.archived && !item.deleted_at ? issueMenu.show(item, e)
      : item.kind === "milestone" && !item.archived && !item.deleted_at ? milestoneMenu.show(item, e)
        : itemMenu.show(item, e);
  const pageMenu = usePageMenu({
    disabled: readOnly,
    onCreate: (kind) => create(kind),
    onSearch: () => setCommand(true),
    onHelp: () => setDialog("help"),
    onNavigate: navigate,
    onExport: exportData,
  });
  const inbox = member
    ? snapshot.events.filter((e) => {
        const item = byId.get(e.item_id);
        const receipt = receiptByEvent.get(e.id);
        return (
          item &&
          e.actor_id !== actor &&
          !readNow.includes(e.id) &&
          (item.data.assignee === actor ||
            item.data.subscribers?.includes(actor) ||
            e.body.toLowerCase().includes(`@${member.title.toLowerCase()}`)) &&
          (!receipt ||
            (!!receipt.snoozed_until &&
              Date.parse(receipt.snoozed_until) <= Date.parse(snapshot.now)))
        );
      })
    : [];
  const issueView =
    (!current && ["issues", "my-issues"].includes(section)) ||
    current?.kind === "view";
  const activeIssues = live.filter((i) => i.kind === "issue" && !done(i));
  const openProblems = problems.filter((p) => p.status === "open").length;
  /** A lead turns a robot issue into a task: worse problems start at higher priority, in the matching subsystem label. */
  function makeTask(p: PitProblem) {
    const label = live.find((i) => i.kind === "label" && !!p.area && i.title.toLowerCase() === p.area.toLowerCase());
    const where = p.event_id ? snapshot.pitEvents?.find((e) => e.id === p.event_id)?.name ?? "a competition" : "the shop";
    create(
      "issue",
      {
        problem: p.id,
        status: "Todo",
        priority: ({ critical: 1, major: 2, minor: 3 } as const)[p.severity],
        ...(label ? { labels: [label.id] } : {}),
        description: [p.details, p.follow_up && `To do before next time: ${p.follow_up}`, `Reported by ${p.reported_by || "the team"} at ${where}.`]
          .filter(Boolean)
          .join("\n\n"),
      },
      `Fix: ${p.title}`,
    );
  }
  function exportData() {
    const link = document.createElement("a");
    link.href = "/api/work/export";
    link.download = "warriorborgs-work.json";
    link.click();
  }

  return (
    <ItemMenuProvider value={showItem}>
    <div className="work-shell" onContextMenu={pageMenu}>
      {issueMenu.element}
      {milestoneMenu.element}
      <aside
        className={`work-sidebar ${sidebarOpen ? "work-sidebar-open" : ""}`}
      >
        <div className="work-brand">
          <span className="work-brand-symbol">
            <Icon name="initiatives" size={23} />
          </span>
          <div>
            <b>WarriorBorgs</b>
            <span>Team workspace</span>
          </div>
          <button
            className="work-icon-button work-mobile-only"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <button className="work-search-button" onClick={() => setCommand(true)}>
          <Icon name="search" size={16} />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>
        <button className="work-new-button" onClick={() => create("issue")}>
          <Icon name="plus" size={16} />
          New task<kbd>C</kbd>
        </button>
        <nav aria-label="Work navigation">
          {NAV.map((n) => (
            <div className="work-nav-group" key={n.heading}>
              {n.heading && <p>{n.heading}</p>}
              {n.links.map(([path, title]) => (
                <WorkLink
                  href={`/work/${path}`}
                  key={path}
                  className="work-nav-link"
                  data-active={path === "my-issues" || path === "inbox" ? section === path : navActive(path)}
                  aria-current={(path === "my-issues" || path === "inbox" ? section === path : navActive(path)) ? "page" : undefined}
                  onGo={() => navigate(path)}
                >
                  <Icon name={path === "inbox" ? "bell" : path} size={17} />
                  <span>{title}</span>
                  {path === "issues" && (
                    <span className="work-nav-count">
                      {activeIssues.length}
                    </span>
                  )}
                  {path === "inbox" && inbox.length > 0 && (
                    <span className="work-nav-count">{inbox.length}</span>
                  )}
                  {path === "robot" && openProblems > 0 && (
                    <span className="work-nav-count" data-tone="bad">{openProblems}</span>
                  )}
                </WorkLink>
              ))}
            </div>
          ))}
          {live.some((i) => i.data.favorites?.includes(actor)) && (
            <div className="work-nav-group">
              <p>Favorites</p>
              {live
                .filter((i) => i.data.favorites?.includes(actor))
                .map((i) => (
                  <button
                    className="work-nav-link"
                    key={i.id}
                    onClick={() => open(i)}
                    onContextMenu={(e) => showItem(i, e)}
                  >
                    <Icon name="star" size={15} />
                    <span>{i.title}</span>
                  </button>
                ))}
            </div>
          )}
        </nav>
        <div className="work-sidebar-bottom">
          <button className="work-nav-link" onClick={() => setDialog("help")}>
            <Icon name="help" />
            <span>Help & shortcuts</span>
          </button>
          <WorkLink
            className="work-nav-link"
            href="/work/settings"
            data-active={section === "settings"}
            onGo={() => navigate("settings")}
          >
            <Icon name="settings" />
            <span>Settings</span>
          </WorkLink>
          <div className="work-profile">
            <Avatar name={member?.title} />
            <div className="work-signed-in">
              <b>{user.name}</b>
              <span>{user.role}</span>
            </div>
            <form method="post" action="/auth/work/sign-out">
              <button
                className="work-icon-button"
                aria-label="Sign out"
                title="Sign out"
              >
                <Icon name="arrow" size={16} />
              </button>
            </form>
            <span className="work-online-dot" title="Shared team workspace" />
          </div>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="work-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="work-content" ref={content}>
        <header className="work-topbar">
          <button
            className="work-icon-button work-mobile-only"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <button className="work-breadcrumb" onClick={() => navigate(section)}>
            {info?.title ?? "Work"}
          </button>
          {current && (
            <>
              <span className="work-breadcrumb-divider">/</span>
              <span className="work-breadcrumb-current">{current.title}</span>
            </>
          )}
          <div className="work-topbar-right">
            {saving && <span className="work-saving" role="status">Saving…</span>}
            {!current && section === "projects" && projectLayout === "timeline" && <button className="work-text-button" onClick={() => create("project")} disabled={readOnly}><Icon name="plus" size={15}/> New project</button>}
            <button
              className="work-icon-button"
              aria-label="Open command menu"
              onClick={() => setCommand(true)}
            >
              <Icon name="search" />
            </button>
          </div>
        </header>
        {snapshot.error ? (
          <div className="work-load-error">
            <Empty
              title="Work couldn’t load"
              description={snapshot.error}
              icon="triage"
            />
            <button className="btn btn-ghost" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : !info ? (
          <Empty
            title="Page not found"
            description="Choose a workspace page from the navigation."
          />
        ) : entityId && !current ? (
          <Empty
            title="This item is unavailable"
            description="It may have been moved to trash. You can restore it in Archive & trash."
          />
        ) : (
          <>
            {!current && pageGroup && (
              <nav className="work-page-tabs" aria-label="Workspace section">
                {pageGroup.tabs.map(([path, label]) => (
                  <button
                    key={path}
                    data-active={section === path}
                    onClick={() => navigate(path)}
                  >
                    {label}
                    {path === "inbox" && inbox.length > 0 && (
                      <span>{inbox.length}</span>
                    )}
                  </button>
                ))}
                {pageGroup.more && (
                  <PropertyPicker
                    label="More task pages"
                    value={pageGroup.more.some(([path]) => path === section) ? section : ""}
                    display={pageGroup.more.find(([path]) => path === section)?.[1] ?? "More"}
                    onChange={navigate}
                    options={pageGroup.more.map(([value, label]) => ({ value, label }))}
                  />
                )}
              </nav>
            )}
            {!current && section !== "home" && (
              <div className="work-page-heading">
                <div>
                  <h1>{info.title}</h1>
                  {info.blurb && <p>{info.blurb}</p>}
                </div>
                <div className="work-heading-actions">
                  {info.kind === "issue" && (
                    <button className="btn btn-primary" disabled={readOnly} onClick={() => create("issue")}>
                      <Icon name="plus" size={16} /> New task
                    </button>
                  )}
                  {section === "issues" && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setDialog("import")}
                    >
                      <Icon name="download" size={15} />
                      Import
                    </button>
                  )}
                  {info.kind && info.kind !== "issue" && section !== "views" && (
                    <button
                      className="btn btn-primary"
                      onClick={() => create()}
                    >
                      <Icon name="plus" size={16} />
                      New {KIND_NAMES[info.kind].toLowerCase()}
                    </button>
                  )}
                  {section === "robot" && (
                    <button className="btn btn-primary" disabled={readOnly} onClick={() => setDialog("report")}>
                      <Icon name="plus" size={16} /> Report an issue
                    </button>
                  )}
                  {section === "updates" && (
                    <button className="btn btn-primary" disabled={readOnly} onClick={() => setDialog("update")}>
                      <Icon name="plus" size={16} /> New update
                    </button>
                  )}
                  {section === "views" && (
                    <button
                      className="btn btn-primary"
                      onClick={() => setDialog("view")}
                    >
                      <Icon name="plus" size={16} />
                      New view
                    </button>
                  )}
                </div>
              </div>
            )}
            {error && !editor && (
              <div className="work-error" role="alert">
                {error}
                <button
                  className="work-text-button"
                  onClick={refresh}
                >
                  Reload
                </button>
              </div>
            )}
            {!current && section === "home" ? (
              <WorkHome
                items={items}
                live={live}
                actor={actor}
                name={member?.title ?? user.name}
                events={snapshot.events}
                onOpen={open}
                onNavigate={navigate}
                onCreate={() => create("issue")}
                onHelp={() => setDialog("help")}
                onReport={() => setDialog("report")}
                readOnly={readOnly}
              />
            ) : issueView ? (
              <IssueBrowser
                items={items}
                scope={current?.kind === "view" ? current.data.filter : undefined}
                only={section === "my-issues" ? (i) => !!member && i.data.assignee === actor : undefined}
                view={view}
                onView={(patch) => setView((v) => ({ ...v, ...patch }))}
                actions={issueActions}
                onCreate={(preset) => create("issue", preset)}
                onClear={() => {
                  if (current?.kind === "view") navigate("issues");
                }}
                empty={section === "my-issues" ? { title: "Nothing assigned to you", description: "Tasks assigned to you show up here. Pick something from To do, or ask a lead what to work on." } : undefined}
              />
            ) : current ? (
              <ItemDetail
                key={current.id}
                item={current}
                items={items}
                events={snapshot.events}
                actor={actor}
                readOnly={readOnly}
                posting={posting}
                onOpen={open}
                onCreate={create}
                onEdit={() => {
                  setError("");
                  setEditor({ kind: current.kind, item: current });
                }}
                onPatch={(data) => patch(current, data)}
                milestoneActions={milestoneActions}
                issueActions={issueActions}
                onComment={(body, type) => comment(current, body, type)}
                onArchive={() => (current.archived ? restoreItem(current) : archiveItem(current))}
                onDelete={() => trashItem(current)}
                onNavigate={navigate}
              />
            ) : section === "projects" ? (
              <div className="work-project-browser">
                <div className="work-project-browser-main">
                <div className="work-toolbar">
                  <span className="work-toolbar-count">
                    {(() => { const n = live.filter((i) => i.kind === "project").length; return `${n} ${n === 1 ? "project" : "projects"}`; })()}
                  </span>
                  <div className="work-toolbar-right work-layout-toggle">
                    <button
                      aria-pressed={projectLayout !== "timeline"}
                      onClick={() => setProjectLayout("cards")}
                    >
                      <Icon name="views" size={16} />
                      Cards
                    </button>
                    <button
                      aria-pressed={projectLayout === "timeline"}
                      onClick={() => setProjectLayout("timeline")}
                    >
                      <Icon name="timeline" size={16} />
                      Timeline
                    </button>
                  </div>
                </div>
                {projectLayout === "timeline" ? (
                  <Timeline
                    items={items}
                    projects={live.filter((i) => i.kind === "project")}
                    onOpen={open}
                    onPreview={item => setPreviewId(item.id)}
                    milestoneActions={milestoneActions}
                  />
                ) : (
                  <Collection
                    rows={live.filter((i) => i.kind === "project")}
                    items={items}
                    kind="project"
                    onOpen={open}
                    onPreview={item => setPreviewId(item.id)}
                    onCreate={() => create("project")}
                  />
                )}
                </div>
                {preview && <aside className="work-project-preview" aria-label={`${preview.title} project preview`}>
                  <header className="work-project-preview-header">
                    <h2>{preview.title}</h2>
                    <button className="work-text-button" onClick={() => open(preview)}>Open project <Icon name="arrow" size={15}/></button>
                    <button className="work-icon-button" aria-label="Close project preview" onClick={() => setPreviewId(null)}><Icon name="close" size={17}/></button>
                  </header>
                  <ProjectDetail key={preview.id} preview item={preview} items={items} events={snapshot.events}
                    readOnly={readOnly} posting={posting} onOpen={open} onCreate={create}
                    onEdit={() => setEditor({ kind: "project", item: preview })}
                    onPatch={data => patch(preview, data)} milestoneActions={milestoneActions} issueActions={issueActions}
                    onComment={(body, type) => comment(preview, body, type)}
                    onArchive={() => archiveItem(preview)} onDelete={() => trashItem(preview)} />
                </aside>}
              </div>
            ) : section === "settings" ? (
              <>
                <div className="work-settings-tabs">
                  {user.role === "admin" && (
                    <button
                      className="work-control"
                      data-active={settingsTab === "access"}
                      onClick={() => setSettingsTab("access")}
                    >
                      People
                    </button>
                  )}
                  {(
                    [
                      ...(user.role === "admin" ? ["team" as const] : []),
                      "label",
                      "template",
                      "milestone",
                    ] as WorkKind[]
                  ).map((k) => (
                    <button
                      className="work-control"
                      data-active={settingsTab === k}
                      onClick={() => setSettingsTab(k)}
                      key={k}
                    >
                      {KIND_NAMES[k]}s
                    </button>
                  ))}
                  <button className="work-control" onClick={exportData}>
                    <Icon name="download" size={15} />
                    Export workspace
                  </button>
                </div>
                {settingsTab === "access" ? (
                  <AccessPanel accounts={access} currentEmail={user.email} />
                ) : (
                  <>
                    <div className="work-settings-intro">
                      <button
                        className="btn btn-primary"
                        disabled={readOnly}
                        onClick={() => create(settingsTab)}
                      >
                        <Icon name="plus" size={15} />
                        Add {KIND_NAMES[settingsTab].toLowerCase()}
                      </button>
                    </div>
                    <div className="work-settings-list">
                      {live
                        .filter((i) => i.kind === settingsTab)
                        .map((i) => (
                          <div key={i.id} onContextMenu={(e) => showItem(i, e)}>
                            <span
                              className="work-color-dot"
                              style={{
                                background: i.data.color || "var(--purple)",
                              }}
                            />
                            <b>{i.title}</b>
                            <span className="work-muted">
                              {i.data.group ||
                                i.data.identifier ||
                                i.data.targetKind}
                            </span>
                            <button
                              className="work-text-button"
                              onClick={() => open(i)}
                            >
                              Open
                            </button>
                            <button
                              className="work-text-button"
                              disabled={readOnly}
                              onClick={() =>
                                setEditor({ kind: i.kind, item: i })
                              }
                            >
                              Edit
                            </button>
                            {["label", "template", "milestone"].includes(i.kind) && (
                              <button
                                className="work-text-button"
                                disabled={readOnly}
                                onClick={() => trashItem(i)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </>
            ) : section === "inbox" ? (
              <>
                {inbox.length > 0 && (
                  <div className="work-toolbar">
                    <span className="work-toolbar-count">{inbox.length} unread</span>
                    <button
                      className="work-text-button"
                      onClick={() => markRead(inbox.map((e) => e.id))}
                    >
                      Mark all read
                    </button>
                  </div>
                )}
                {inbox.length ? (
                  <div className="work-inbox">
                    {inbox.map((e) => (
                      <div key={e.id}>
                        <Avatar name={e.actor} />
                        <button
                          onClick={() => {
                            const item = items.find((i) => i.id === e.item_id);
                            if (item) open(item);
                          }}
                        >
                          <b>{items.find((i) => i.id === e.item_id)?.title}</b>
                          <p>
                            {e.actor} · {e.type} · {e.body.slice(0, 100)}
                          </p>
                        </button>
                        <span className="work-muted">
                          {dateLabel(e.created_at)}
                        </span>
                        <button
                          className="work-icon-button"
                          aria-label="Mark read"
                          onClick={() => markRead([e.id])}
                        >
                          <Icon name="check" />
                        </button>
                        <button
                          className="work-text-button"
                          onClick={() => markRead([e.id], new Date(Date.now() + 86400000).toISOString())}
                        >
                          Snooze 1 day
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="No unread notifications"
                    description="You'll hear here when someone assigns you a task, mentions you, or changes something you follow."
                    icon="inbox"
                  />
                )}
              </>
            ) : section === "updates" ? (
              <div className="work-updates">
                {snapshot.events
                  .filter((e) => e.type === "update")
                  .map((e) => (
                    <article key={e.id}>
                      <div className="work-section-title">
                        <Avatar name={e.actor} />
                        <b>{e.actor}</b>
                        <span className="work-muted">
                          {dateLabel(e.created_at)}
                        </span>
                      </div>
                      <button
                        className="work-text-button"
                        onClick={() => {
                          const i = items.find((i) => i.id === e.item_id);
                          if (i) open(i);
                        }}
                      >
                        {items.find((i) => i.id === e.item_id)?.title}
                      </button>
                      <RichText text={e.body} />
                    </article>
                  ))}
                {!snapshot.events.some((e) => e.type === "update") && (
                  <Empty
                    title="No updates"
                    description="Use New update to share how a project or initiative is going. Updates posted from a project show up here too."
                    icon="updates"
                  />
                )}
              </div>
            ) : section === "robot" ? (
              <RobotIssues items={items} readOnly={readOnly} onOpen={open} onReport={() => setDialog("report")} onMakeTask={makeTask} />
            ) : section === "archive" ? (
              <>
                <div className="work-toolbar">
                  <button
                    className="work-control"
                    data-active={archiveTab === "archive"}
                    onClick={() => setArchiveTab("archive")}
                  >
                    Archived
                  </button>
                  <button
                    className="work-control"
                    data-active={archiveTab === "trash"}
                    onClick={() => setArchiveTab("trash")}
                  >
                    Trash
                  </button>
                </div>
                {(() => {
                  const rows = items.filter((i) =>
                    archiveTab === "trash"
                      ? !!i.deleted_at
                      : i.archived && !i.deleted_at,
                  );
                  return rows.length ? (
                <div className="work-settings-list">
                  {rows
                    .map((i) => (
                      <div key={i.id} onContextMenu={(e) => itemMenu.show(i, e)}>
                        <Icon name="archive" />
                        <b>{i.title}</b>
                        <span className="work-muted">{KIND_NAMES[i.kind]}</span>
                        <button
                          className="work-text-button"
                          disabled={readOnly}
                          onClick={() => restoreItem(i)}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                </div>
                  ) : (
                    <Empty
                      title={archiveTab === "trash" ? "Trash is empty" : "Nothing archived"}
                      description={archiveTab === "trash" ? "Things you move to trash show up here until you restore them." : "Archived tasks and projects show up here."}
                      icon="archive"
                    />
                  );
                })()}
              </>
            ) : section === "views" ? (
              <div className="work-collection">
                {live
                  .filter((i) => i.kind === "view")
                  .map((i) => (
                    <button
                      className="work-project-card"
                      key={i.id}
                      onContextMenu={(e) => showItem(i, e)}
                      onClick={() => open(i)}
                    >
                      <Icon name="views" />
                      <h3>{i.title}</h3>
                      <p>
                        {(() => { const n = filterIssues(items, i.data.filter ?? {}).length; return `${n} matching ${n === 1 ? "task" : "tasks"}`; })()}
                      </p>
                      <span className="work-muted">
                        {i.data.layout || "list"} · {i.data.group || "status"}
                      </span>
                    </button>
                  ))}
                {!live.some((i) => i.kind === "view") && (
                  <Empty
                    title="No saved views"
                    description="Save your current filters and layout as a view."
                    onCreate={() => setDialog("view")}
                    action="Create view"
                    icon="views"
                  />
                )}
              </div>
            ) : info.kind ? (
              <>
                <Collection
                  rows={live.filter((i) => i.kind === info.kind)}
                  items={items}
                  kind={info.kind}
                  onOpen={open}
                  onCreate={() => create()}
                />
              </>
            ) : null}
          </>
        )}
      </div>
      {editor && (
        <ItemEditor
          key={
            editor.item?.id ?? `${editor.kind}-${JSON.stringify(editor.preset)}`
          }
          kind={editor.kind}
          item={editor.item}
          preset={editor.preset}
          title={editor.title}
          items={items}
          actor={actor}
          pending={busy || readOnly}
          error={error}
          onClose={() => setEditor(null)}
          onSave={async (title, data, createMore) => {
            const { item, kind } = editor;
            // An edit sends only what the form changed, so it can't undo a teammate's edit to other fields.
            const edits = item ? changedData(data, item.data) : data;
            if (item && title.trim() === item.title && !Object.keys(edits).length) {
              setEditor(null);
              return true;
            }
            const result = await change(
              [item ? { id: item.id, title, data: edits } : { kind, title, data }],
              item ? "Changes saved" : `${KIND_NAMES[kind]} created`,
            );
            if (result && !createMore) setEditor(null);
            return !!result;
          }}
        />
      )}
      {command && (
        <Modal title="Search & commands" onClose={() => setCommand(false)}>
          <div className="work-command">
            <input
              className="input"
              data-autofocus
              aria-label="Search workspace"
              placeholder="Search tasks, projects, documents…"
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
            />
            <div className="work-command-results">
              {!commandQuery && (
                <button
                  onClick={() => {
                    setCommand(false);
                    create("issue");
                  }}
                >
                  <Icon name="plus" />
                  New task<kbd>C</kbd>
                </button>
              )}
              {!commandQuery && (
                <button
                  onClick={() => {
                    setCommand(false);
                    setDialog("help");
                  }}
                >
                  <Icon name="help" />
                  Guide & shortcuts<kbd>?</kbd>
                </button>
              )}
              {NAV.flatMap((n) => n.links)
                .filter(([, title]) =>
                  title.toLowerCase().includes(commandQuery.toLowerCase()),
                )
                .map(([path, title]) => (
                  <button
                    key={path}
                    onClick={() => {
                      setCommand(false);
                      navigate(path);
                    }}
                  >
                    <Icon name={path} />
                    Go to {title}
                  </button>
                ))}
              {live
                .filter((i) =>
                  `${i.title} ${i.data.description || ""}`
                    .toLowerCase()
                    .includes(commandQuery.toLowerCase()),
                )
                .slice(0, 30)
                .map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      setCommand(false);
                      open(i);
                    }}
                  >
                    <Icon name={i.kind + "s"} />
                    <span>{i.title}</span>
                    <span className="work-muted">{i.kind}</span>
                  </button>
                ))}
            </div>
            <p className="work-muted">
              ⌘ / Ctrl K to search · C to create a task · Esc to close
            </p>
          </div>
        </Modal>
      )}
      {dialog === "report" && <ReportIssueDialog items={items} onClose={() => setDialog(null)} />}
      {dialog === "update" && <UpdateComposer items={live} onPost={comment} onClose={() => setDialog(null)} />}
      {dialog === "help" && (
        <Modal title="Guide & shortcuts" onClose={() => setDialog(null)}>
          <HelpGuide />
        </Modal>
      )}
      {dialog === "view" && (
        <Modal title="Save a view" onClose={() => setDialog(null)}>
          <form
            className="work-editor-body"
            onSubmit={async (e) => {
              e.preventDefault();
              const filter = { ...(current?.kind === "view" ? current.data.filter : {}), ...view.filter };
              if (await change([{ kind: "view", title: viewName, data: { filter, layout: view.layout, group: view.group } }], "View saved")) {
                setDialog(null);
                setViewName("");
              }
            }}
          >
            <Field label="View name">
              <input
                className="input"
                data-autofocus
                required
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="High-priority robot work"
              />
            </Field>
            <p className="work-muted mt-3">
              Saves your current issue filters, layout, and grouping for the
              whole team.
            </p>
            {error && <p className="work-error">{error}</p>}
            <button className="btn btn-primary mt-4" disabled={busy}>
              Save view
            </button>
          </form>
        </Modal>
      )}
      {dialog === "import" && (
        <Modal title="Import tasks" onClose={() => setDialog(null)} wide>
          <form
            className="work-editor-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const input = JSON.parse(importText);
                const rows = Array.isArray(input) ? input : input.items;
                if (!Array.isArray(rows))
                  throw new Error(
                    "Paste a JSON array or an exported workspace.",
                  );
                const issues = rows.filter(
                  (r: { kind?: string }) => !r.kind || r.kind === "issue",
                );
                if (!issues.length) throw new Error("No tasks found.");
                if (
                  await change(
                    issues.map((r: { title: string; data?: WorkData }) => ({
                      kind: "issue" as const,
                      title: r.title,
                      data: r.data ?? {},
                    })),
                    `${issues.length} tasks imported`,
                  )
                )
                  setDialog(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Invalid JSON.");
              }
            }}
          >
            <p className="work-muted">
              Import up to 200 issues from JSON. Existing project, label, and
              member IDs can be included in properties. Each imported task gets
              a new identifier.
            </p>
            <textarea
              className="input mt-4"
              data-autofocus
              rows={10}
              aria-label="Task import JSON"
              placeholder={
                '[{"title":"Inspect drivetrain","data":{"status":"Todo","priority":2}}]'
              }
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              required
            />
            {error && <p className="work-error">{error}</p>}
            <button className="btn btn-primary mt-4" disabled={busy}>
              Import issues
            </button>
          </form>
        </Modal>
      )}
      {!readOnly && !editor && !command && !dialog && !current && info?.kind && ["issue", "project", "initiative", "document"].includes(info.kind) && (
        <button className="work-fab" onClick={() => create()}>
          <Icon name="plus" size={20} />
          <span>New {KIND_NAMES[info.kind].toLowerCase()}</span>
        </button>
      )}
      {toast && (
        <div className="work-toast" role={toast.tone === "error" ? "alert" : "status"} data-tone={toast.tone}>
          <span className="work-toast-check">
            <Icon name={toast.tone === "error" ? "triage" : "check"} size={14} />
          </span>
          {toast.text}
          {toast.undo && (
            <button
              className="work-toast-action"
              onClick={() => {
                const undo = toast.undo!;
                setToast(null);
                undo();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
    </ItemMenuProvider>
  );
}
/** Post a progress update from the Updates page; it lands on the chosen project or initiative like one posted there. */
function UpdateComposer({
  items,
  onPost,
  onClose,
}: {
  items: WorkItem[];
  onPost: (item: WorkItem, body: string, type: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const targets = items.filter((i) => i.kind === "project" || i.kind === "initiative").sort((a, b) => a.title.localeCompare(b.title));
  const [target, setTarget] = useState(targets.length === 1 ? targets[0].id : "");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const item = targets.find((i) => i.id === target);
  return (
    <Modal title="New update" onClose={onClose}>
      <form
        className="work-update-composer"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!item) return;
          setPosting(true);
          const ok = await onPost(item, body, "update");
          setPosting(false);
          if (ok) onClose();
        }}
      >
        <Field label="Project or initiative">
          <PropertyPicker
            label="Project or initiative"
            value={target}
            display={item?.title ?? "Choose one…"}
            onChange={setTarget}
            options={targets.map((i) => ({ value: i.id, label: i.title, icon: <Icon name={i.kind === "project" ? i.data.icon || "projects" : "initiatives"} size={15} /> }))}
          />
        </Field>
        {!targets.length && <p className="work-muted">Create a project or initiative first, then post updates on it.</p>}
        <textarea data-autofocus className="input" aria-label="Update" placeholder="Share progress, blockers, and next steps…" rows={8} required value={body} onChange={(e) => setBody(e.target.value)} />
        <div>
          <span className="work-muted">Markdown supported</span>
          <button className="btn btn-primary" disabled={posting || !item || !body.trim()}>{posting ? "Posting…" : "Post update"}</button>
        </div>
      </form>
    </Modal>
  );
}
