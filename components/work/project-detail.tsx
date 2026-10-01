"use client";
import { useRef, useState } from "react";
import { dateLabel, today, done, issueCode, milestoneProgress, uniqueStatuses, PRIORITIES, progress, type WorkData, type WorkEvent, type WorkItem, type WorkKind } from "@/lib/work";
import { Avatar, LabelPicker, Labels, Empty } from "./collections";
import { RichText } from "./detail";
import { CommitInput, EntitySelect, Field, Modal } from "./editor";
import { Icon, MilestoneIcon, PROJECT_ICONS, StatusIcon } from "./icons";
import { useMilestoneMenu, type MilestoneActions } from "./milestone-menu";
import { InlineEdit, PropertyPicker } from "./property-picker";

const STATUS_ORDER = ["backlog", "todo", "planned", "in progress", "in review", "done", "completed", "canceled", "cancelled", "duplicate"];
const statusRank = (s: string) => { const r = STATUS_ORDER.indexOf(s.toLowerCase()); return r < 0 ? 5 : r; };
const PROJECT_COLORS = ["#6b3fd4", "#2b69b6", "#178558", "#b86a04", "#cf3e4c", "#c2418f", "#0e8f9f", "#5f6b7a"];
function ProjectEmblemPicker({ icon, color, disabled, onChange }: { icon?: string; color?: string; disabled: boolean; onChange: (data: WorkData) => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const current = color || "#6b3fd4";
  const [pos, setPos] = useState({ left: 0, top: 0 });
  return <div className="work-emblem-picker">
    <button type="button" className="work-project-emblem" aria-label="Change project icon and color" disabled={disabled} style={{ color: current }} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 284)), top: r.bottom + 8 }); menu.current?.togglePopover(); }}><Icon name={icon || "projects"} size={30} /></button>
    <div ref={menu} popover="auto" className="work-emblem-menu" style={pos} role="dialog" aria-label="Project icon and color">
      <div className="work-emblem-grid">{PROJECT_ICONS.map(n => <button type="button" key={n} aria-label={n} aria-pressed={(icon || "projects") === n} style={{ color: current }} onClick={() => onChange({ icon: n })}><Icon name={n} size={20} /></button>)}</div>
      <div className="work-emblem-colors">{PROJECT_COLORS.map(c => <button type="button" key={c} aria-label={`Color ${c}`} aria-pressed={current.toLowerCase() === c} style={{ background: c }} onClick={() => onChange({ color: c })} />)}<input type="color" aria-label="Custom color" value={current} onChange={e => onChange({ color: e.target.value })} /></div>
    </div>
  </div>;
}
function healthLabel(health: string) { return ({offTrack:"Off track", atRisk:"At risk", onTrack:"On track"} as Record<string,string>)[health] || health; }

type Tab = "Overview" | "Activity" | "Issues" | "Updates";
export function ProjectDetail({ item, items, events, pending, onEdit, onPatch, onComment, onOpen, onCreate, onArchive, onDelete, milestoneActions }: {
  milestoneActions: MilestoneActions;
  item: WorkItem; items: WorkItem[]; events: WorkEvent[]; pending: boolean;
  onEdit: () => void; onPatch: (data: WorkData) => void;
  onComment: (body: string, type?: string) => Promise<boolean>;
  onOpen: (item: WorkItem) => void; onCreate: (kind: WorkKind, preset?: WorkData) => void;
  onArchive: () => void; onDelete: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const milestoneMenu = useMilestoneMenu(milestoneActions);
  const [composer, setComposer] = useState(false);
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [milestone, setMilestone] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [showProperties, setShowProperties] = useState(true);
  const live = items.filter(i => !i.archived && !i.deleted_at);
  const issues = live.filter(i => i.kind === "issue" && i.data.project === item.id);
  const milestones = live.filter(i => i.kind === "milestone" && i.data.project === item.id).sort((a,b) => (a.data.due || "9999").localeCompare(b.data.due || "9999"));
  const history = events.filter(e => e.item_id === item.id).sort((a,b) => b.created_at.localeCompare(a.created_at));
  const updates = history.filter(e => e.type === "update");
  const documents = live.filter(i => i.kind === "document" && i.data.project === item.id);
  const pct = progress(issues);
  const filtered = issues.filter(i => (!milestone || i.data.milestone === milestone) && `${i.title} ${issueCode(i, items)}`.toLowerCase().includes(search.toLowerCase()));
  const groupMap = new Map<string, [string, WorkItem[]]>();
  for (const i of filtered) { const label = i.data.status || "Backlog"; const entry = groupMap.get(label.toLowerCase()); if (entry) entry[1].push(i); else groupMap.set(label.toLowerCase(), [label, [i]]); }
  const statusGroups = [...groupMap.entries()].map(([key, [label, rows]]) => [key, label, rows] as [string, string, WorkItem[]]).sort((a, b) => statusRank(a[0]) - statusRank(b[0]));
  function updateCard(e: WorkEvent) {
    return <article className="work-project-update" key={e.id}>
      <div className="work-project-update-meta"><Avatar small name={e.actor} /><b>{e.actor}</b><span>{dateLabel(e.created_at)}</span></div>
      {typeof e.data.health === "string" && <span className="work-health" data-health={healthLabel(e.data.health)}>{healthLabel(e.data.health)}</span>}
      <RichText text={e.body} />
    </article>;
  }
  function milestoneRows() {
    return milestones.map(m => {
      const status = milestoneProgress(m, issues);
      const overdue = !status.complete && !!m.data.due && m.data.due < today();
      return <div key={m.id} className="work-milestone-entry" onContextMenu={e => milestoneMenu.show(m, e)}><button className="work-milestone-row" onClick={() => { setMilestone(m.id); setTab("Issues"); }} title={`${m.title}: ${status.completed}/${status.total} completed. Click to view issues.`}>
        <MilestoneIcon percent={status.percent} complete={status.complete} overdue={overdue} />
        <span className="work-milestone-name"><b>{m.title}</b><small>{status.percent}%</small></span>
        <span className="work-milestone-date" data-overdue={overdue}>{dateLabel(m.data.due)}</span>
      </button><button className="work-icon-button" aria-label={`Milestone actions for ${m.title}`} aria-haspopup="menu" onClick={e => milestoneMenu.show(m, e)}><Icon name="menu" size={13}/></button></div>;
    });
  }
  return <div className="work-project-detail">
    <nav className="work-project-tabs" aria-label="Project views">
      {(["Overview", "Activity", "Issues", "Updates"] as Tab[]).map(t => <button key={t} aria-current={tab === t ? "page" : undefined} data-active={tab === t} onClick={() => setTab(t)}>{t}{t === "Issues" && <span>{issues.length}</span>}</button>)}
      <div className="work-project-tab-actions">
        <button className="work-text-button" disabled={pending} onClick={() => setComposer(true)}><Icon name="updates" size={15} /> Write update</button>
        <button className="work-icon-button" aria-label="Toggle project details" aria-pressed={showProperties} onClick={() => setShowProperties(v => !v)}><Icon name="board" size={17} /></button>
      </div>
    </nav>
    <div className="work-project-columns" data-sidebar={showProperties}>
      <main className="work-project-content">
        {tab === "Overview" && <>
          <div className="work-project-heading"><ProjectEmblemPicker icon={item.data.icon} color={item.data.color} disabled={pending} onChange={onPatch} /><button className="work-text-button" onClick={onEdit}>Edit project</button></div>
          <InlineEdit label="Project name" value={item.title} disabled={pending} onSave={title => milestoneActions.onSave(item, { title })}><h1>{item.title}</h1></InlineEdit>
          <InlineEdit label="Summary" multiline value={item.data.description ?? ""} disabled={pending} placeholder="Add a short summary…" onSave={description => onPatch({ description })}>{item.data.description ? <RichText text={item.data.description} /> : <span className="work-description-placeholder">Add a short summary…</span>}</InlineEdit>
          <div className="work-project-inline-properties"><StatusIcon status={item.data.status} /><span>{item.data.status || "Planned"}</span><span className="work-priority" data-priority={item.data.priority}>{PRIORITIES[item.data.priority ?? 0]}</span><Avatar small name={items.find(i => i.id === item.data.assignee)?.title} /><span>{dateLabel(item.data.start)} → {dateLabel(item.data.due)}</span></div>
          <Labels item={item} items={items} />
          <section className="work-project-resources"><div className="work-section-title"><h2>Resources</h2><button className="work-text-button" disabled={pending} onClick={() => onCreate("document", { project: item.id })}><Icon name="plus" size={14} /> Add document</button></div>
            {item.data.url && <a className="work-reference" href={item.data.url} target="_blank" rel="noreferrer"><Icon name="link" size={14} />{item.data.url}</a>}
            {item.data.attachments?.map(a => <a className="work-reference" key={a.id} href={a.url} target="_blank" rel="noreferrer"><Icon name="link" size={14} />{a.title}</a>)}
            {documents.map(d => <button className="work-child" key={d.id} onClick={() => onOpen(d)}><Icon name="documents" size={15}/>{d.title}</button>)}
            {!documents.length && !item.data.url && !item.data.attachments?.length && <p className="work-muted">Keep project documents and links here.</p>}
          </section>
          <section className="work-project-latest"><div className="work-section-title"><h2>Latest update</h2><button className="work-text-button" onClick={() => setComposer(true)} disabled={pending}><Icon name="updates" size={14} /> Update</button></div>
            
            {updates[0] ? updateCard(updates[0]) : <p className="work-muted">Share the latest progress with your team.</p>}
            {updates.length > 1 && <button className="work-text-button" onClick={() => setTab("Updates")}>View all {updates.length} updates <Icon name="arrow" size={14} /></button>}
          </section>
        </>}
        {tab === "Issues" && <>
          <div className="work-section-title"><h2>Issues <span>{filtered.length}</span></h2><button className="work-text-button" disabled={pending} onClick={() => onCreate("issue", { project: item.id, team: item.data.team, ...(milestone ? { milestone } : {}) })}><Icon name="plus" size={14}/> Add issue</button></div>
          <div className="work-project-issue-tools"><input className="input" aria-label="Search project issues" placeholder="Search issues…" value={search} onChange={e => setSearch(e.target.value)} /><PropertyPicker label="Milestone filter" value={milestone} onChange={setMilestone} options={[{ value: "", label: "All milestones" }, ...milestones.map(m => ({value: m.id, label: m.title}))]} />{milestone && <button className="work-text-button" onClick={() => setMilestone("")}>Clear filter</button>}</div>
          {statusGroups.map(([key, label, rows]) => {
            const closed = collapsed.includes(key);
            return <section className="work-project-issue-group" key={key}>
              <div className="work-project-issue-group-head">
                <button className="work-project-issue-group-toggle" aria-expanded={!closed} onClick={() => setCollapsed(c => closed ? c.filter(k => k !== key) : [...c, key])}>
                  <span className="work-group-caret" data-closed={closed}>▾</span><StatusIcon status={label} /><b>{label}</b><span>{rows.length}</span>
                </button>
                <button className="work-icon-button" aria-label={`Add ${label} issue`} disabled={pending} onClick={() => onCreate("issue", { project: item.id, team: item.data.team, status: label, ...(milestone ? { milestone } : {}) })}><Icon name="plus" size={14}/></button>
              </div>
              {!closed && rows.map(i => <button className="work-project-issue-row" key={i.id} onClick={() => onOpen(i)}><StatusIcon status={i.data.status} /><span className="work-code">{issueCode(i, items)}</span><span>{i.title}</span>{i.data.due && <time>{dateLabel(i.data.due)}</time>}<Avatar small name={items.find(m => m.id === i.data.assignee)?.title}/></button>)}
            </section>;
          })}
          {!filtered.length && <Empty title="No issues here" description={milestone ? "Add an issue to this milestone or clear the filter." : "Create the first issue for this project."} />}
        </>}
        {tab === "Updates" && <><div className="work-section-title"><h2>Project updates</h2><button className="work-text-button" onClick={() => setComposer(true)} disabled={pending}>Write update</button></div>{updates.map(updateCard)}{!updates.length && <Empty title="No updates yet" description="Share a progress update with your team." />}</>}
        {tab === "Activity" && <><div className="work-section-title"><h2>Activity</h2></div>{history.map(e => ["update", "comment"].includes(e.type) ? updateCard(e) : <div className="work-project-event" key={e.id}><Avatar small name={e.actor}/><span><b>{e.actor}</b> {e.type === "status" ? `changed status to ${e.body}` : `${e.type} this project`}</span><time>{dateLabel(e.created_at)}</time></div>)}{!history.length && <Empty title="No activity yet" description="Project changes will appear here." />}</>}
      </main>
      {showProperties && <aside className="work-project-sidebar">
        <section className="work-project-property-card"><h2>Properties</h2>
          <Field label="Status"><PropertyPicker label="Status" value={item.data.status || "Planned"} disabled={pending} onChange={status => onPatch({ status })} options={uniqueStatuses([item.data.status || "Planned", "Planned", "In progress", "Done", "Canceled"]).map(s => ({ value: s, label: s, icon: <StatusIcon status={s}/> }))}/></Field>
          <Field label="Priority"><PropertyPicker label="Priority" value={String(item.data.priority ?? 0)} disabled={pending} onChange={v => onPatch({ priority: Number(v) })} icon={<Icon name="insights" size={15}/>} options={PRIORITIES.map((p,n) => ({value:String(n),label:p}))}/></Field>
          <Field label="Lead"><EntitySelect disabled={pending} kind="member" items={items} value={item.data.assignee} onChange={assignee => !pending && onPatch({assignee})} empty="Assign lead" /></Field>
          <Field label="Dates"><div className="work-project-dates"><CommitInput className="work-inline-date" type="date" aria-label="Project start date" disabled={pending} value={item.data.start || ""} onCommit={start => onPatch({start})}/> <span>→</span><CommitInput className="work-inline-date" type="date" aria-label="Project target date" disabled={pending} value={item.data.due || ""} onCommit={due => onPatch({due})}/></div></Field>
          <Field label="Team"><EntitySelect disabled={pending} kind="team" items={items} value={item.data.team} onChange={team => !pending && onPatch({team})}/></Field>
          <Field label="Initiative"><EntitySelect disabled={pending} kind="initiative" items={items} value={item.data.initiative} onChange={initiative => !pending && onPatch({initiative})}/></Field>
          <Field label="Labels"><div className="work-project-label-controls"><LabelPicker item={item} items={items} disabled={pending} onChange={labels => onPatch({ labels })}/></div></Field>
        </section>
        <section className="work-project-property-card"><div className="work-section-title"><h2>Milestones</h2><button className="work-icon-button" aria-label="Add milestone" disabled={pending} onClick={() => onCreate("milestone", {project:item.id})}><Icon name="plus" size={15}/></button></div>
          {milestoneRows()}{!milestones.length && <p className="work-muted">Add milestones to track project stages.</p>}

        </section>
        <section className="work-project-property-card"><div className="work-section-title"><h2>Progress</h2><b>{pct}%</b></div><div className="work-progress"><span style={{width:`${pct}%`}}/></div><p className="work-muted">{issues.filter(done).length} of {issues.length} issues completed</p></section>
        <details className="work-project-manage"><summary>Manage project</summary><button className="work-text-button" disabled={pending} onClick={onArchive}>{item.archived ? "Restore from archive" : "Archive project"}</button><button className="work-text-button" disabled={pending} onClick={onDelete}>Move to trash</button></details>
      </aside>}
    </div>
    {milestoneMenu.element}
    {composer && <Modal title="Project update" onClose={() => setComposer(false)}><form className="work-update-composer" onSubmit={async e => { e.preventDefault(); if (await onComment(body, "update")) { setBody(""); setComposer(false); } }}><h2>{item.title}</h2><textarea autoFocus className="input" aria-label="Project update" placeholder="Share progress, blockers, and next steps…" rows={8} required value={body} onChange={e => setBody(e.target.value)}/><div><span className="work-muted">Markdown supported</span><button className="btn btn-primary" disabled={pending || !body.trim()}>{pending ? "Posting…" : "Post update"}</button></div></form></Modal>}
  </div>;
}
