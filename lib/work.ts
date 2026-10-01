export const WORK_KINDS = [
  "issue",
  "project",
  "initiative",
  "cycle",
  "label",
  "team",
  "member",
  "document",
  "template",
  "view",
  "milestone",
  "customer",
  "release",
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
export const STATUSES = [
  "Backlog",
  "Todo",
  "In progress",
  "In review",
  "Done",
  "Canceled",
  "Duplicate",
];
export const PRIORITIES = ["No priority", "Urgent", "High", "Medium", "Low"];
export const KIND_NAMES: Record<WorkKind, string> = {
  issue: "Issue",
  project: "Project",
  initiative: "Initiative",
  cycle: "Cycle",
  label: "Label",
  team: "Team",
  member: "Member",
  document: "Document",
  template: "Template",
  view: "View",
  milestone: "Milestone",
  customer: "Customer",
  release: "Release",
};
export type WorkData = {
  templateTitle?: string;
  email?: string;
  attachments?: { id: string; title: string; url: string }[];
  source?: {
    system: "linear";
    workspaceId: string;
    id: string;
    identifier?: string;
    url?: string;
    raw?: Record<string, unknown>;
  };
  description?: string;
  status?: string;
  priority?: number;
  team?: string;
  assignee?: string;
  project?: string;
  initiative?: string;
  cycle?: string;
  parent?: string;
  milestone?: string;
  customer?: string;
  release?: string;
  parentInitiative?: string;
  parentTeam?: string;
  labels?: string[];
  estimate?: number;
  due?: string;
  start?: string;
  color?: string;
  icon?: string;
  identifier?: string;
  health?: string;
  url?: string;
  relations?: {
    id: string;
    type: "blocks" | "blocked by" | "related" | "duplicate of";
  }[];
  subscribers?: string[];
  favorites?: string[];
  recurrence?: "" | "weekly" | "monthly";
  workflow?: string[];
  nextRepeat?: string;
  filter?: WorkFilter;
  group?: string;
  layout?: string;
  targetKind?: WorkKind;
};
export type WorkItem = {
  id: string;
  number: number;
  kind: WorkKind;
  title: string;
  data: WorkData;
  revision: number;
  archived: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type WorkEvent = {
  id: string;
  item_id: string;
  actor: string;
  actor_id?: string;
  type: string;
  body: string;
  created_at: string;
  data: Record<string, unknown>;
};
export type WorkFilter = {
  query?: string;
  team?: string;
  assignee?: string;
  project?: string;
  priority?: string;
  label?: string;
  status?: string;
  cycle?: string;
  /** "overdue" | "week" | "none" | "any" */
  due?: string;
};
export type WorkSnapshot = {
  items: WorkItem[];
  events: WorkEvent[];
  now: string;
  receipts: {
    event_id: string;
    member_id: string;
    snoozed_until: string | null;
  }[];
  error?: string;
};
export function uniqueStatuses(statuses: string[]) {
  return statuses.filter((s, index) => statuses.findIndex(v => v.toLowerCase() === s.toLowerCase()) === index);
}
export function done(item: WorkItem) {
  return ["done", "completed", "canceled", "cancelled", "duplicate"].includes((item.data.status ?? "").toLowerCase());
}
export function issueCode(item: WorkItem, items: WorkItem[]) {
  if (item.data.source?.identifier) return item.data.source.identifier;
  return `${items.find((i) => i.id === item.data.team)?.data.identifier || "WB"}-${item.number}`;
}
function matchesDue(item: WorkItem, due?: string) {
  if (!due) return true;
  const d = item.data.due;
  if (due === "none") return !d;
  if (!d) return false;
  if (due === "any") return true;
  const now = today();
  if (due === "overdue") return d < now && !done(item);
  const end = new Date(`${now}T12:00:00`);
  end.setDate(end.getDate() + 7);
  const limit = end.toLocaleDateString("en-CA");
  return due === "week" ? d >= now && d <= limit : true;
}
/** Active issues also require an active project, when one is assigned. */
export function activeWorkItems(items: WorkItem[]) {
  const projects = new Set(items.filter(i => i.kind === "project" && !i.archived && !i.deleted_at).map(i => i.id));
  return items.filter(i => !i.archived && !i.deleted_at &&
    (i.kind !== "issue" || !i.data.project || projects.has(i.data.project)));
}
export function filterIssues(items: WorkItem[], filter: WorkFilter) {
  return activeWorkItems(items).filter(
    (i) =>
      i.kind === "issue" &&
      !i.archived &&
      !i.deleted_at &&
      (!filter.query ||
        `${i.title} ${i.data.description ?? ""} ${issueCode(i, items)}`
          .toLowerCase()
          .includes(filter.query.toLowerCase())) &&
      (!filter.team || i.data.team === filter.team) &&
      (!filter.assignee ||
        (filter.assignee === "unassigned"
          ? !i.data.assignee
          : i.data.assignee === filter.assignee)) &&
      (!filter.project || i.data.project === filter.project) &&
      (!filter.cycle || i.data.cycle === filter.cycle) &&
      (!filter.status ||
        (filter.status === "open" ? !done(i) : i.data.status === filter.status)) &&
      matchesDue(i, filter.due) &&
      (!filter.label || i.data.labels?.includes(filter.label)) &&
      (!filter.priority || String(i.data.priority ?? 0) === filter.priority),
  );
}
export function progress(items: WorkItem[]) {
  return items.length
    ? Math.round((100 * items.filter(done).length) / items.length)
    : 0;
}
/** Milestones include started work at quarter credit, as in Linear's progress view. */
export function milestoneProgress(milestone: WorkItem, items: WorkItem[]) {
  const issues = items.filter(i => i.kind === "issue" && !i.archived && !i.deleted_at && i.data.milestone === milestone.id && (!milestone.data.project || i.data.project === milestone.data.project));
  const completed = issues.filter(done).length;
  const started = issues.filter(i => ["In progress", "In Progress", "In review", "In Review"].includes(i.data.status ?? "")).length;
  const percent = issues.length ? Math.round(100 * (completed + started / 4) / issues.length) : done(milestone) ? 100 : 0;
  return { total: issues.length, completed, percent, complete: done(milestone) || (issues.length > 0 && completed === issues.length) };
}
/** Today's date in the team's timezone, so server and browser agree on overdue. */
export function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
export function dateLabel(date?: string) {
  return date
    ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "No date";
}
export function validateWorkInput(
  kind: unknown,
  title: unknown,
  input: unknown,
  existing: WorkData = {},
): { kind: WorkKind; title: string; data: WorkData } {
  if (!WORK_KINDS.includes(kind as WorkKind))
    throw new Error("Choose a valid item type.");
  if (typeof title !== "string" || !title.trim() || title.trim().length > 300)
    throw new Error("Enter a title of 1–300 characters.");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid properties.");
  const d = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const k of [
    "team",
    "assignee",
    "project",
    "initiative",
    "cycle",
    "parent",
    "milestone",
    "customer",
    "release",
    "parentInitiative",
    "parentTeam",
  ]) {
    if (d[k] !== undefined) {
      if (
        d[k] !== "" &&
        (typeof d[k] !== "string" || !uuid.test(d[k] as string))
      )
        throw new Error(`Invalid ${k}.`);
      data[k] = d[k];
    }
  }
  for (const k of [
    "description",
    "status",
    "identifier",
    "health",
    "color",
    "icon",
    "url",
    "group",
    "layout",
  ]) {
    if (d[k] !== undefined) {
      if (
        typeof d[k] !== "string" ||
        (d[k] as string).length > (k === "description" ? 50000 : 2000)
      )
        throw new Error(`Invalid ${k}.`);
      data[k] = d[k];
    }
  }
  if (d.icon && !/^[a-z][a-z0-9-]{0,30}$/.test(String(d.icon)))
    throw new Error("Choose a valid icon.");
  if (d.color && !/^#[0-9a-f]{6}$/i.test(String(d.color)))
    throw new Error("Choose a valid color.");
  if (d.url && !/^https?:\/\//i.test(String(d.url)))
    throw new Error("Links must start with https:// or http://.");
  if (d.identifier && !/^[A-Z][A-Z0-9]{0,9}$/.test(String(d.identifier)))
    throw new Error(
      "Team identifier must be 1–10 uppercase letters or digits.",
    );
  for (const k of ["priority", "estimate"])
    if (d[k] !== undefined) {
      if (
        !Number.isInteger(d[k]) ||
        Number(d[k]) < 0 ||
        Number(d[k]) > (k === "priority" ? 4 : 100)
      )
        throw new Error(`Invalid ${k}.`);
      data[k] = d[k];
    }
  for (const k of ["due", "start"])
    if (d[k] !== undefined) {
      if (
        d[k] !== "" &&
        (typeof d[k] !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(d[k] as string) ||
          new Date(`${d[k]}T12:00:00Z`).toISOString().slice(0, 10) !== d[k])
      )
        throw new Error(`Invalid ${k} date.`);
      data[k] = d[k];
    }
  // Cross-field rules judge the result of the change, but only when it touches those fields.
  const merged = () => ({ ...existing, ...data }) as WorkData;
  if (("start" in data || "due" in data) && merged().start && merged().due && merged().start! > merged().due!)
    throw new Error("End date must be after the start date.");
  for (const k of ["labels", "subscribers", "favorites"])
    if (d[k] !== undefined) {
      if (
        !Array.isArray(d[k]) ||
        d[k].length > 100 ||
        !d[k].every((v) => typeof v === "string" && uuid.test(v))
      )
        throw new Error(`Invalid ${k}.`);
      data[k] = [...new Set(d[k])];
    }
  if (d.relations !== undefined) {
    if (
      !Array.isArray(d.relations) ||
      d.relations.length > 100 ||
      !d.relations.every(
        (r) =>
          r &&
          uuid.test(r.id) &&
          ["blocks", "blocked by", "related", "duplicate of"].includes(r.type),
      )
    )
      throw new Error("Invalid relationships.");
    data.relations = d.relations;
  }
  if (d.workflow !== undefined) {
    if (
      !Array.isArray(d.workflow) ||
      d.workflow.length > 30 ||
      !d.workflow.every(
        (v) => typeof v === "string" && v.trim() && v.length < 80,
      )
    )
      throw new Error("Enter up to 30 workflow statuses.");
    data.workflow = [...new Set(d.workflow)];
  }
  if (d.recurrence !== undefined) {
    if (!["", "weekly", "monthly"].includes(String(d.recurrence)))
      throw new Error("Invalid repeat schedule.");
    data.recurrence = d.recurrence;
  }
  if (d.targetKind !== undefined) {
    if (!WORK_KINDS.includes(d.targetKind as WorkKind))
      throw new Error("Invalid template type.");
    data.targetKind = d.targetKind;
  }
  if (d.filter !== undefined) {
    if (!d.filter || typeof d.filter !== "object" || Array.isArray(d.filter))
      throw new Error("Invalid view filters.");
    const filter: Record<string, string> = {};
    for (const k of [
      "query",
      "team",
      "assignee",
      "project",
      "priority",
      "label",
      "status",
      "cycle",
      "due",
    ]) {
      const v = (d.filter as Record<string, unknown>)[k];
      if (v !== undefined) {
        if (typeof v !== "string" || v.length > 300)
          throw new Error("Invalid view filter.");
        filter[k] = v;
      }
    }
    data.filter = filter;
  }
  if (d.nextRepeat !== undefined) {
    if (
      typeof d.nextRepeat !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.nextRepeat)
    )
      throw new Error("Invalid repeat date.");
    data.nextRepeat = d.nextRepeat;
  }
  if (("recurrence" in data || "due" in data) && merged().recurrence && !merged().due)
    throw new Error("Set a due date for a recurring issue.");
  return {
    kind: kind as WorkKind,
    title: title.trim(),
    data: data as WorkData,
  };
}
