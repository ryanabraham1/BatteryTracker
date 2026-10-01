"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { addWorkComment, markWorkRead, mutateWork } from "@/app/work-actions";
import {
  dateLabel,
  done,
  filterIssues,
  KIND_NAMES,
  PRIORITIES,
  progress,
  type WorkData,
  type WorkFilter,
  type WorkItem,
  type WorkKind,
} from "@/lib/work";
import {
  Avatar,
  Collection,
  Empty,
  IssueBoard,
  IssueList,
  Timeline,
} from "./collections";
import { ItemDetail, RichText } from "./detail";
import { EntitySelect, Field, ItemEditor, Modal } from "./editor";
import { Icon } from "./icons";
import { AccessPanel } from "./access";
import { GettingStarted, HelpGuide } from "./help";

import "./work.css";
import { PropertyPicker } from "./property-picker";
import { useWork } from "./work-provider";
const NAV = [
  {
    heading: "",
    links: [
      ["my-issues", "My work"],
      ["issues", "Issues"],
      ["projects", "Projects"],
      ["initiatives", "Initiatives"],
      ["updates", "Team"],
    ],
  },
];
const PAGE_GROUPS = [
  {
    paths: ["my-issues", "inbox"],
    tabs: [
      ["my-issues", "My issues"],
      ["inbox", "Inbox"],
    ],
  },
  {
    paths: ["issues", "views", "archive"],
    tabs: [
      ["issues", "All issues"],
      ["views", "Saved views"],
    ],
    more: [
      ["archive", "Archive & trash"],
    ],
  },
  {
    paths: ["updates", "documents", "insights"],
    tabs: [
      ["updates", "Updates"],
      ["documents", "Documents"],
      ["insights", "Insights"],
    ],
  },
];
const SECTIONS: Record<string, { title: string; kind?: WorkKind; blurb?: string }> = {
  issues: {
    title: "Issues",
    kind: "issue",
    blurb: "Every task the team is working on. Click one to open it.",
  },
  "my-issues": {
    title: "My work",
    kind: "issue",
    blurb: "Issues assigned to you.",
  },
  projects: {
    title: "Projects",
    kind: "project",
    blurb: "Bigger goals made of many issues.",
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
  documents: {
    title: "Team",
    kind: "document",
  },
  inbox: { title: "Inbox", blurb: "Mentions and changes on things you follow." },
  updates: {
    title: "Team",
    blurb: "Progress updates posted by the team.",
  },
  insights: {
    title: "Team",
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
function route(item: WorkItem) {
  return `/work/${({ issue: "issues", project: "projects", milestone: "projects", initiative: "initiatives", document: "documents", view: "views" } as Record<string, string>)[item.kind] ?? "settings"}/${item.id}`;
}
export function WorkWorkspace({ section, entityId }: { section: string; entityId?: string; }) {
  const {snapshot, user, access} = useWork();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const actor = user.memberId;
  const readOnly = user.role === "viewer";
  const [filter, setFilter] = useState<WorkFilter>({});
  const [layout, setLayout] = useState("list");
  const [group, setGroup] = useState("status");
  const [sort, setSort] = useState("priority");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editor, setEditor] = useState<{
    kind: WorkKind;
    item?: WorkItem;
    preset?: WorkData;
  } | null>(null);
  const [command, setCommand] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<"view" | "import" | "help" | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [viewName, setViewName] = useState("");
  const [importText, setImportText] = useState("");
  const [settingsTab, setSettingsTab] = useState<WorkKind | "access">(
    user.role === "admin" ? "access" : "label",
  );
  const [archiveTab, setArchiveTab] = useState("archive");
  // Show edits instantly; the server action's revalidation swaps in the saved rows.
  const [items, applyOptimistic] = useOptimistic(
    snapshot.items,
    (current, changes: { id: string; title?: string; data?: WorkData; archived?: boolean; deleted?: boolean }[]) =>
      current.map((i) => {
        const c = changes.find((x) => x.id === i.id);
        return c
          ? {
              ...i,
              ...(c.title !== undefined ? { title: c.title } : {}),
              data: { ...i.data, ...c.data },
              ...(c.deleted ? { deleted_at: snapshot.now } : {}),
              ...(c.archived !== undefined ? { archived: c.archived } : {}),
            }
          : i;
      }),
  );
  const live = useMemo(() => items.filter((i) => !i.archived && !i.deleted_at), [items]);
  const byId = useMemo(() => new Map(live.map(i => [i.id, i])), [live]);
  const receiptByEvent = useMemo(() => new Map(snapshot.receipts.map(r => [r.event_id, r])), [snapshot.receipts]);
  const member = live.find((i) => i.id === actor && i.kind === "member");
  const current = entityId
    ? items.find((i) => i.id === entityId && !i.deleted_at)
    : undefined;
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
    const id = setTimeout(() => setToast(""), 4500);
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
  function create(kind: WorkKind = info?.kind ?? "issue", preset?: WorkData) {
    if (readOnly) {
      setError("Your account has view-only access.");
      return;
    }
    setError("");
    setEditor({
      kind,
      preset: { ...(kind === "issue" ? soleTeamPreset : {}), ...preset },
    });
  }
  function quickAdd(preset: WorkData) {
    const title = quickTitle.trim();
    if (!title) return;
    if (readOnly) {
      setError("Your account has view-only access.");
      return;
    }
    startTransition(async () => {
      const result = await change(
        [{ kind: "issue", title, data: { status: "Todo", ...soleTeamPreset, ...preset } }],
        "Issue added",
      );
      if (result) setQuickTitle("");
    });
  }
  function open(item: WorkItem) {
    setError("");
    setSelected([]);
    setSidebarOpen(false);
    router.push(route(item));
  }
  function navigate(path: string) {
    setError("");
    setFilter({});
    setSelected([]);
    setSidebarOpen(false);
    router.push(`/work/${path}`);
  }
  function updateFilter(patch: WorkFilter) {
    setFilter((f) => ({ ...f, ...patch }));
    setSelected([]);
  }
  async function change(
    changes: Parameters<typeof mutateWork>[0],
    success = "Saved",
  ) {
    setError("");
    const result = await mutateWork(changes);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setToast(success);
    return result.items;
  }
  // Menus and dialogs hold the item they opened on, so always save against the latest revision.
  const latest = (item: WorkItem) => items.find((i) => i.id === item.id) ?? item;
  function patch(item: WorkItem, data: WorkData) {
    startTransition(async () => {
      applyOptimistic([{ id: item.id, data }]);
      await change([{ id: item.id, revision: latest(item).revision, data }]);
    });
  }
  function saveItem(item: WorkItem, changes: { title?: string; data?: WorkData }) {
    startTransition(async () => {
      applyOptimistic([{ id: item.id, ...changes }]);
      await change([{ id: item.id, revision: latest(item).revision, ...changes }]);
    });
  }
  function trashItem(item: WorkItem) {
    startTransition(async () => {
      applyOptimistic([{ id: item.id, deleted: true }]);
      await change([{ id: item.id, revision: latest(item).revision, deleted: true }], "Moved to trash");
    });
  }
  const milestoneActions = { onSave: saveItem, onTrash: trashItem, onOpen: open, disabled: pending || readOnly };
  const activeFilter =
    current?.kind === "view" ? { ...current.data.filter, ...filter } : filter;
  let issues = filterIssues(items, activeFilter);
  if (section === "my-issues")
    issues = member ? issues.filter((i) => i.data.assignee === actor) : [];
  issues = [...issues].sort((a, b) =>
    sort === "priority"
      ? (a.data.priority || 5) - (b.data.priority || 5)
      : sort === "due"
        ? (a.data.due || "9999").localeCompare(b.data.due || "9999")
        : sort === "title"
          ? a.title.localeCompare(b.title)
          : b.created_at.localeCompare(a.created_at),
  );
  const inbox = member
    ? snapshot.events.filter((e) => {
        const item = byId.get(e.item_id);
        const receipt = receiptByEvent.get(e.id);
        return (
          item &&
          e.actor_id !== actor &&
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
  const filtersActive = Object.values(activeFilter).some(Boolean);
  function bulk(data?: WorkData, archived?: boolean) {
    startTransition(async () => {
      const chosen = items.filter((i) => selected.includes(i.id));
      applyOptimistic(chosen.map((i) => ({ id: i.id, data, archived })));
      if (
        await change(
          chosen.map((i) => ({
            id: i.id,
            revision: i.revision,
            ...(data ? { data } : {}),
            ...(archived !== undefined ? { archived } : {}),
          })),
          `${chosen.length} issues updated`,
        )
      )
        setSelected([]);
    });
  }
  function exportData() {
    const link = document.createElement("a");
    link.href = "/api/work/export";
    link.download = "warriorborgs-work.json";
    link.click();
  }

  return (
    <div className="work-shell">
      <aside
        className={`work-sidebar ${sidebarOpen ? "work-sidebar-open" : ""}`}
      >
        <div className="work-brand">
          <span className="work-brand-symbol">
            <Icon name="initiatives" size={23} />
          </span>
          <div>
            <b>WarriorBorgs</b>
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
          Create issue<kbd>C</kbd>
        </button>
        <nav aria-label="Work navigation">
          {NAV.map((n) => (
            <div className="work-nav-group" key={n.heading}>
              {n.heading && <p>{n.heading}</p>}
              {n.links.map(([path, title]) => (
                <Link
                  href={`/work/${path}`}
                  key={path}
                  className="work-nav-link"
                  data-active={navActive(path)}
                  aria-current={navActive(path) ? "page" : undefined}
                  onClick={() => {
                    setFilter({});
                    setSelected([]);
                    setSidebarOpen(false);
                  }}
                >
                  <Icon name={path === "updates" ? "team" : path} size={17} />
                  <span>{title}</span>
                  {path === "issues" && (
                    <span className="work-nav-count">
                      {activeIssues.length}
                    </span>
                  )}
                  {path === "inbox" && inbox.length > 0 && (
                    <span className="work-nav-count">{inbox.length}</span>
                  )}
                </Link>
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
          <Link
            className="work-nav-link"
            href="/work/settings"
            data-active={section === "settings"}
          >
            <Icon name="settings" />
            <span>Settings</span>
          </Link>
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
      <div className="work-content">
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
            {!current && section === "projects" && layout === "timeline" && <button className="work-text-button" onClick={() => create("project")} disabled={pending || readOnly}><Icon name="plus" size={15}/> New project</button>}
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
            <button className="btn btn-ghost" onClick={() => router.refresh()}>
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
                  <select
                    aria-label="More issue pages"
                    value={
                      pageGroup.more.some(([path]) => path === section)
                        ? section
                        : ""
                    }
                    onChange={(e) => navigate(e.target.value)}
                  >
                    <option value="" disabled>
                      More
                    </option>
                    {pageGroup.more.map(([path, label]) => (
                      <option key={path} value={path}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </nav>
            )}
            {!current && (
              <div className="work-page-heading">
                <div>
                  <h1>{info.title}</h1>
                  {info.blurb && <p>{info.blurb}</p>}
                </div>
                <div className="work-heading-actions">
                  {section === "issues" && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setDialog("import")}
                    >
                      <Icon name="download" size={15} />
                      Import
                    </button>
                  )}
                  {info.kind && section !== "views" && (
                    <button
                      className="btn btn-primary"
                      onClick={() => create()}
                    >
                      <Icon name="plus" size={16} />
                      New {KIND_NAMES[info.kind].toLowerCase()}
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
                  onClick={() => router.refresh()}
                >
                  Reload
                </button>
              </div>
            )}
            {issueView ? (
              <>
                <div className="work-toolbar">
                  <button
                    className="work-control"
                    data-active={filterOpen || filtersActive}
                    onClick={() => setFilterOpen((v) => !v)}
                  >
                    <Icon name="filter" size={15} />
                    Filter
                    {filtersActive && <span className="work-online-dot" />}
                  </button>
                  <input
                    className="work-inline-search"
                    aria-label="Search issues"
                    placeholder="Search issues…"
                    value={filter.query ?? ""}
                    onChange={(e) => updateFilter({ query: e.target.value })}
                  />
                  {filtersActive && (
                    <button
                      className="work-text-button"
                      onClick={() => {
                        setFilter({});
                        if (current?.kind === "view") navigate("issues");
                      }}
                    >
                      Clear
                    </button>
                  )}
                  <span className="work-toolbar-count">
                    {issues.length} {issues.length === 1 ? "issue" : "issues"}
                  </span>
                  <div className="work-toolbar-right">
                    <PropertyPicker label="Sort by" value={sort} onChange={setSort} icon={<Icon name="filter" size={14}/>} display={<>Sort: {({priority:"Priority",created:"Newest",due:"Due date",title:"Title"} as Record<string,string>)[sort]}</>} options={[{value:"priority",label:"Priority"},{value:"created",label:"Newest"},{value:"due",label:"Due date"},{value:"title",label:"Title"}]}/>
                    <PropertyPicker label="Group by" value={group} onChange={setGroup} display={<>Group: {({status:"Status",project:"Project",none:"None"} as Record<string,string>)[group]}</>} options={[{value:"status",label:"Status"},{value:"project",label:"Project"},{value:"none",label:"No grouping"}]}/>
                    <div className="work-layout-toggle">
                      <button
                        aria-label="List layout"
                        aria-pressed={layout === "list"}
                        onClick={() => setLayout("list")}
                      >
                        <Icon name="issues" size={16} />
                      </button>
                      <button
                        aria-label="Board layout"
                        aria-pressed={layout === "board"}
                        onClick={() => setLayout("board")}
                      >
                        <Icon name="board" size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                {filterOpen && (
                  <div className="work-filter-panel">
                    <Field label="Team">
                      <EntitySelect
                        items={items}
                        kind="team"
                        value={activeFilter.team}
                        onChange={(v) => updateFilter({ team: v })}
                        empty="All teams"
                      />
                    </Field>
                    <Field label="Assignee">
                      <EntitySelect
                        items={items}
                        kind="member"
                        value={activeFilter.assignee}
                        onChange={(v) => updateFilter({ assignee: v })}
                        empty="Everyone"
                      />
                    </Field>
                    <Field label="Project">
                      <EntitySelect
                        items={items}
                        kind="project"
                        value={activeFilter.project}
                        onChange={(v) => updateFilter({ project: v })}
                        empty="All projects"
                      />
                    </Field>
                    <Field label="Label">
                      <EntitySelect
                        items={items}
                        kind="label"
                        value={activeFilter.label}
                        onChange={(v) => updateFilter({ label: v })}
                        empty="All labels"
                      />
                    </Field>
                    <Field label="Priority">
                      <select
                        className="input"
                        value={activeFilter.priority ?? ""}
                        onChange={(e) =>
                          updateFilter({ priority: e.target.value })
                        }
                      >
                        <option value="">All priorities</option>
                        {PRIORITIES.map((p, n) => (
                          <option key={p} value={n}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      className="work-text-button"
                      onClick={() => {
                        setFilter({});
                        if (current?.kind === "view") navigate("issues");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                {selected.length > 0 && (
                  <div className="work-bulk">
                    <b>{selected.length} selected</b>
                    <select
                      className="work-control"
                      aria-label="Bulk change status"
                      defaultValue=""
                      disabled={pending}
                      onChange={(e) => {
                        bulk({ status: e.target.value });
                        e.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        Change status…
                      </option>
                      {[
                        "Backlog",
                        "Todo",
                        "In progress",
                        "In review",
                        "Done",
                        "Canceled",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      className="work-text-button"
                      disabled={pending}
                      onClick={() => bulk(undefined, true)}
                    >
                      Archive selected
                    </button>
                    <button
                      className="work-text-button"
                      onClick={() => setSelected([])}
                    >
                      Clear selection
                    </button>
                  </div>
                )}
                {!readOnly && !current && (
                  <form
                    className="work-quick-add"
                    onSubmit={(e) => {
                      e.preventDefault();
                      quickAdd({
                        ...(section === "my-issues" ? { assignee: actor } : {}),
                        ...(activeFilter.project ? { project: activeFilter.project } : {}),
                        ...(activeFilter.team ? { team: activeFilter.team } : {}),
                      });
                    }}
                  >
                    <Icon name="plus" size={16} />
                    <input
                      aria-label="Quick add an issue"
                      placeholder="Add an issue — type a title and press Enter"
                      maxLength={300}
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                    />
                    {quickTitle.trim() && (
                      <button className="btn btn-primary" disabled={pending}>
                        Add
                      </button>
                    )}
                  </form>
                )}
                {!current && <GettingStarted onHelp={() => setDialog("help")} />}
                {!issues.length ? (
                  <Empty
                    title={
                      filtersActive
                        ? "No matching issues"
                        : "No issues"
                    }
                    description={
                      filtersActive
                        ? "Try adjusting your filters or search."
                        : "Create an issue to get started."
                    }
                    onCreate={() => create("issue")}
                  />
                ) : layout === "board" ? (
                  <IssueBoard
                    rows={issues}
                    items={items}
                    onOpen={open}
                    onStatus={(i, status) => patch(i, { status })}
                    onCreate={(status) =>
                      create("issue", {
                        status,
                        team: activeFilter.team,
                        project: activeFilter.project,
                      })
                    }
                    pending={pending || readOnly}
                  />
                ) : (
                  <IssueList
                    rows={issues}
                    items={items}
                    selected={selected}
                    onSelect={(id) =>
                      setSelected((s) =>
                        s.includes(id) ? s.filter((v) => v !== id) : [...s, id],
                      )
                    }
                    onOpen={open}
                    onStatus={(i, status) => patch(i, { status })}
                    onPatch={patch}
                    pending={pending || readOnly}
                    group={group}
                  />
                )}
              </>
            ) : current ? (
              <ItemDetail
                key={current.id}
                item={current}
                items={items}
                events={snapshot.events}
                actor={actor}
                pending={pending || readOnly}
                onOpen={open}
                onCreate={create}
                onEdit={() => {
                  setError("");
                  setEditor({ kind: current.kind, item: current });
                }}
                onPatch={(data) => patch(current, data)}
                milestoneActions={milestoneActions}
                onComment={(body, type) =>
                  new Promise((resolve) =>
                    startTransition(async () => {
                      const result = await addWorkComment(
                        current.id,
                        body,
                        type ??
                          (current.kind === "issue" ? "comment" : "update"),
                      );
                      if (!result.ok) {
                        setError(result.error ?? "Couldn't post.");
                        resolve(false);
                      } else {
                        router.refresh();
                        resolve(true);
                      }
                    }),
                  )
                }
                onArchive={() =>
                  startTransition(async () => {
                    if (
                      await change(
                        [
                          {
                            id: current.id,
                            revision: current.revision,
                            archived: !current.archived,
                          },
                        ],
                        current.archived ? "Restored" : "Archived",
                      )
                    )
                      navigate(section);
                  })
                }
                onDelete={() =>
                  startTransition(async () => {
                    if (
                      await change(
                        [
                          {
                            id: current.id,
                            revision: current.revision,
                            deleted: true,
                          },
                        ],
                        "Moved to trash",
                      )
                    )
                      navigate(section);
                  })
                }
              />
            ) : section === "projects" ? (
              <>
                <div className="work-toolbar">
                  <span className="work-toolbar-count">
                    {live.filter((i) => i.kind === "project").length} projects
                  </span>
                  <div className="work-toolbar-right work-layout-toggle">
                    <button
                      aria-pressed={layout !== "timeline"}
                      onClick={() => setLayout("list")}
                    >
                      <Icon name="views" size={16} />
                      Cards
                    </button>
                    <button
                      aria-pressed={layout === "timeline"}
                      onClick={() => setLayout("timeline")}
                    >
                      <Icon name="timeline" size={16} />
                      Timeline
                    </button>
                  </div>
                </div>
                {layout === "timeline" ? (
                  <Timeline
                    items={items}
                    projects={live.filter((i) => i.kind === "project")}
                    onOpen={open}
                    milestoneActions={milestoneActions}
                  />
                ) : (
                  <Collection
                    rows={live.filter((i) => i.kind === "project")}
                    items={items}
                    kind="project"
                    onOpen={open}
                    onCreate={() => create("project")}
                  />
                )}
              </>
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
                          <div key={i.id}>
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
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </>
            ) : section === "inbox" ? (
              <>
                <div className="work-toolbar">
                  <span>{inbox.length} unread</span>
                  <button
                    className="work-text-button"
                    disabled={pending || !inbox.length}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await markWorkRead(inbox.map((e) => e.id));
                        if (!r.ok) setError(r.error ?? "Couldn't mark read.");
                        router.refresh();
                      })
                    }
                  >
                    Mark all read
                  </button>
                </div>
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
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const r = await markWorkRead([e.id]);
                              if (!r.ok)
                                setError(r.error ?? "Couldn't mark read.");
                              router.refresh();
                            })
                          }
                        >
                          <Icon name="check" />
                        </button>
                        <button
                          className="work-text-button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const r = await markWorkRead(
                                [e.id],
                                new Date(Date.now() + 86400000).toISOString(),
                              );
                              if (!r.ok)
                                setError(r.error ?? "Couldn't snooze.");
                              router.refresh();
                            })
                          }
                        >
                          Snooze 1 day
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={"No unread notifications"}
                    description=""
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
                    description="Post progress updates from a project or initiative. They’ll come together here."
                    icon="updates"
                  />
                )}
              </div>
            ) : section === "insights" ? (
              <Insights items={live} now={snapshot.now} />
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
                <div className="work-settings-list">
                  {items
                    .filter((i) =>
                      archiveTab === "trash"
                        ? !!i.deleted_at
                        : i.archived && !i.deleted_at,
                    )
                    .map((i) => (
                      <div key={i.id}>
                        <Icon name="archive" />
                        <b>{i.title}</b>
                        <span className="work-muted">{i.kind}</span>
                        <button
                          className="work-text-button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await change(
                                [
                                  {
                                    id: i.id,
                                    revision: i.revision,
                                    archived: false,
                                    deleted: false,
                                  },
                                ],
                                "Restored",
                              );
                            })
                          }
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                </div>
              </>
            ) : section === "views" ? (
              <div className="work-collection">
                {live
                  .filter((i) => i.kind === "view")
                  .map((i) => (
                    <button
                      className="work-project-card"
                      key={i.id}
                      onClick={() => {
                        setFilter({});
                        setLayout(i.data.layout || "list");
                        setGroup(i.data.group || "status");
                        open(i);
                      }}
                    >
                      <Icon name="views" />
                      <h3>{i.title}</h3>
                      <p>
                        {filterIssues(items, i.data.filter ?? {}).length}{" "}
                        matching issues
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
          items={items}
          pending={pending || readOnly}
          error={error}
          onClose={() => setEditor(null)}
          onSave={(title, data, createMore) =>
            new Promise<boolean>((resolve) =>
              startTransition(async () => {
                const result = await change(
                  [
                    {
                      ...(editor.item
                        ? { id: editor.item.id, revision: editor.item.revision }
                        : { kind: editor.kind }),
                      title,
                      data,
                    },
                  ],
                  editor.item
                    ? "Changes saved"
                    : `${KIND_NAMES[editor.kind]} created`,
                );
                if (result && !createMore) setEditor(null);
                resolve(!!result);
              }),
            )
          }
        />
      )}
      {command && (
        <Modal title="Search & commands" onClose={() => setCommand(false)}>
          <div className="work-command">
            <input
              className="input"
              autoFocus
              aria-label="Search workspace"
              placeholder="Search issues, projects, documents…"
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
                  Create issue<kbd>C</kbd>
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
              ⌘ / Ctrl K to search · C to create an issue · Esc to close
            </p>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="Guide & shortcuts" onClose={() => setDialog(null)}>
          <HelpGuide />
        </Modal>
      )}
      {dialog === "view" && (
        <Modal title="Save a view" onClose={() => setDialog(null)}>
          <form
            className="work-editor-body"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                if (
                  await change(
                    [
                      {
                        kind: "view",
                        title: viewName,
                        data: { filter: activeFilter, layout, group },
                      },
                    ],
                    "View saved",
                  )
                ) {
                  setDialog(null);
                  setViewName("");
                }
              });
            }}
          >
            <Field label="View name">
              <input
                className="input"
                autoFocus
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
            <button className="btn btn-primary mt-4" disabled={pending}>
              Save view
            </button>
          </form>
        </Modal>
      )}
      {dialog === "import" && (
        <Modal title="Import issues" onClose={() => setDialog(null)} wide>
          <form
            className="work-editor-body"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
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
                  if (!issues.length) throw new Error("No issues found.");
                  if (
                    await change(
                      issues.map((r: { title: string; data?: WorkData }) => ({
                        kind: "issue",
                        title: r.title,
                        data: r.data ?? {},
                      })),
                      `${issues.length} issues imported`,
                    )
                  )
                    setDialog(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Invalid JSON.");
                }
              });
            }}
          >
            <p className="work-muted">
              Import up to 200 issues from JSON. Existing project, label, and
              member IDs can be included in properties. Each imported issue gets
              a new identifier.
            </p>
            <textarea
              className="input mt-4"
              autoFocus
              rows={10}
              aria-label="Issue import JSON"
              placeholder={
                '[{"title":"Inspect drivetrain","data":{"status":"Todo","priority":2}}]'
              }
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              required
            />
            {error && <p className="work-error">{error}</p>}
            <button className="btn btn-primary mt-4" disabled={pending}>
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
        <div className="work-toast" role="status">
          <span className="work-toast-check">
            <Icon name="check" size={14} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
function Insights({
  items,
  now: timestamp,
}: {
  items: WorkItem[];
  now: string;
}) {
  const issues = items.filter((i) => i.kind === "issue");
  const finished = issues.filter(done);
  const now = new Date(timestamp).toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
  const overdue = issues.filter(
    (i) => !done(i) && i.data.due && i.data.due < now,
  );
  const totalPoints = issues.reduce(
    (sum, i) => sum + (i.data.estimate || 0),
    0,
  );
  return (
    <div className="work-insights">
      <div className="work-insight-stats">
        {[
          ["Total issues", issues.length],
          ["Completed", finished.length],
          ["Overdue", overdue.length],
          ["Estimated points", totalPoints],
        ].map(([label, value]) => (
          <div key={label}>
            <p>{label}</p>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <div className="work-chart-grid">
        <section>
          <h2>Work by status</h2>

          {[...new Set(issues.map((i) => i.data.status || "Backlog"))].map(
            (s) => {
              const n = issues.filter(
                (i) => (i.data.status || "Backlog") === s,
              ).length;
              return (
                <div className="work-chart-row" key={s}>
                  <span>{s}</span>
                  <div className="work-chart-bar">
                    <span
                      style={{
                        width: `${issues.length ? (100 * n) / issues.length : 0}%`,
                      }}
                    />
                  </div>
                  <b>{n}</b>
                </div>
              );
            },
          )}
          {!issues.length && (
            <p className="work-muted mt-5">
              Create issues to see the breakdown.
            </p>
          )}
        </section>
        <section>
          <h2>Team workload</h2>

          {items
            .filter((i) => i.kind === "member")
            .map((m) => {
              const n = issues.filter(
                (i) => i.data.assignee === m.id && !done(i),
              ).length;
              return (
                <div className="work-chart-row" key={m.id}>
                  <span>{m.title}</span>
                  <div className="work-chart-bar">
                    <span
                      style={{
                        width: `${issues.length ? (100 * n) / issues.length : 0}%`,
                      }}
                    />
                  </div>
                  <b>{n}</b>
                </div>
              );
            })}
          <div className="work-chart-row">
            <span>Unassigned</span>
            <b>{issues.filter((i) => !i.data.assignee && !done(i)).length}</b>
          </div>
        </section>
        <section>
          <h2>Project delivery</h2>
          {items
            .filter((i) => i.kind === "project")
            .map((p) => {
              const list = issues.filter((i) => i.data.project === p.id);
              return (
                <div className="work-chart-row" key={p.id}>
                  <span>{p.title}</span>
                  <div className="work-chart-bar">
                    <span style={{ width: `${progress(list)}%` }} />
                  </div>
                  <b>{progress(list)}%</b>
                </div>
              );
            })}
        </section>
        <section>
          <h2>Priority distribution</h2>
          {PRIORITIES.map((p, n) => (
            <div className="work-chart-row" key={p}>
              <span>{p}</span>
              <div className="work-chart-bar">
                <span
                  style={{
                    width: `${issues.length ? (100 * issues.filter((i) => (i.data.priority || 0) === n).length) / issues.length : 0}%`,
                  }}
                />
              </div>
              <b>{issues.filter((i) => (i.data.priority || 0) === n).length}</b>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
