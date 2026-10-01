import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateWorkInput,
  filterIssues,
  issueCode,
  progress,
} from "../lib/work.ts";
const team = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const issue = (id, data = {}, props = {}) => ({
  id,
  number: 42,
  kind: "issue",
  title: "Inspect drivetrain",
  data,
  archived: false,
  deleted_at: null,
  revision: 1,
  created_at: "2026-09-30",
  updated_at: "2026-09-30",
  ...props,
});
test("filters compose without including archived or trashed work", () => {
  const items = [
    issue("a", { team, assignee: member, status: "Todo", priority: 2 }),
    issue("b", { team, assignee: member, status: "Done", priority: 2 }),
    issue("c", { team }, { archived: true }),
    issue("d", { team }, { deleted_at: "2026-09-30" }),
  ];
  assert.deepEqual(
    filterIssues(items, {
      team,
      assignee: member,
      status: "Todo",
      priority: "2",
    }).map((i) => i.id),
    ["a"],
  );
  assert.equal(filterIssues(items, { query: "DRIVETRAIN" }).length, 2);
});
test("issue identifiers use the owning team", () => {
  const i = issue("a", { team });
  assert.equal(
    issueCode(i, [{ id: team, kind: "team", data: { identifier: "MECH" } }]),
    "MECH-42",
  );
  assert.equal(issueCode(issue("a"), []), "WB-42");
});
test("server input validation rejects invalid kinds, properties, and unsafe links", () => {
  for (const [kind, title, data] of [
    ["bad", "a", {}],
    ["issue", "", {}],
    ["issue", "a", { priority: 5 }],
    ["issue", "a", { estimate: -1 }],
    ["issue", "a", { assignee: "bad" }],
    ["issue", "a", { url: "javascript:alert(1)" }],
    ["issue", "a", { due: "2026-02-30" }],
    ["cycle", "a", { start: "2026-10-10", due: "2026-10-01" }],
    ["issue", "a", { recurrence: "weekly" }],
  ])
    assert.throws(() => validateWorkInput(kind, title, data));
});
test("valid changes strip unknown properties and normalize labels", () => {
  const result = validateWorkInput("issue", "  Build the intake  ", {
    labels: [team, team],
    priority: 1,
    admin: true,
    description: "**Review** the drawing.",
  });
  assert.equal(result.title, "Build the intake");
  assert.deepEqual(result.data.labels, [team]);
  assert.equal(result.data.admin, undefined);
});
test("empty progress stays finite and finished work rolls up", () => {
  assert.equal(progress([]), 0);
  assert.equal(
    progress([issue("a", { status: "Done" }), issue("b", { status: "Todo" })]),
    50,
  );
});

test("milestones count only live issues in their project, with quarter credit for started work", async () => {
  const { milestoneProgress } = await import("../lib/work.ts");
  const m = { ...issue("m"), kind: "milestone", data: { project: "p" } };
  const linked = (id, status, extra = {}) => issue(id, { project: "p", milestone: "m", status }, extra);
  const items = [linked("a", "Done"), linked("b", "In Progress"), linked("c", "Todo"), linked("d", "Done", { archived: true }), linked("e", "Done", { deleted_at: "2026-09-30" }), issue("f", { project: "other", milestone: "m", status: "Done" })];
  assert.deepEqual(milestoneProgress(m, items), { total: 3, completed: 1, percent: 42, complete: false });
  assert.deepEqual(milestoneProgress(m, [linked("a", "Done")]), { total: 1, completed: 1, percent: 100, complete: true });
  assert.equal(milestoneProgress(m, []).complete, false);
  assert.equal(milestoneProgress({ ...m, data: { status: "Completed" } }, []).percent, 100);
});

test("compact snapshots preserve visible history and provenance without mutating full exports", async () => {
  const { compactWorkSnapshot } = await import("../lib/work-snapshot.ts");
  const item = issue("a", { source: { system: "linear", identifier: "WB-1", raw: { secretImportField: "large data" } } });
  const event = { id: "e", item_id: "a", body: "Update body", data: { before: { data: { status: "Todo", description: "long description" } }, after: { data: { status: "Done" } }, source: { id: "linear-e", raw: { anything: "large data" } } } };
  const snapshot = { items: [item], events: [event], receipts: [], now: "2026-09-30" };
  const compact = compactWorkSnapshot(snapshot);
  assert.equal(compact.items[0].data.source.raw, undefined);
  assert.equal(compact.items[0].data.source.identifier, "WB-1");
  assert.equal(compact.events[0].body, "Update body");
  assert.deepEqual(compact.events[0].data.before, { data: { status: "Todo" } });
  assert.equal(compact.events[0].data.source.raw, undefined);
  assert.equal(snapshot.items[0].data.source.raw.secretImportField, "large data");
  assert.equal(snapshot.events[0].data.before.data.description, "long description");
});

test("timeline clusters crowded dates without losing milestones or squeezing labels", async () => {
  const { clusterMilestones } = await import("../lib/work-timeline.ts");
  const m = (id, due) => ({ ...issue(id), kind: "milestone", data: { due } });
  const min = Date.parse("2026-09-01"), max = Date.parse("2026-10-01");
  const milestones = [m("a","2026-09-02"),m("b","2026-09-03"),m("c","2026-09-03"),m("d","2026-09-20"),m("old","2026-08-20"),m("undated",undefined)];
  const groups = clusterMilestones(milestones,min,max,1000);
  assert.deepEqual(groups.map(g => g.map(m => m.id)), [["a","b","c"],["d"]]);
  assert.deepEqual(clusterMilestones(milestones,min,max,6000).map(g => g.map(m => m.id)), [["a"],["b","c"],["d"]]);
});

test("status choices deduplicate imported capitalization while preserving the selected value", async () => {
  const { uniqueStatuses } = await import("../lib/work.ts");
  assert.deepEqual(uniqueStatuses(["In Progress", "Backlog", "In progress", "Done", "done"]), ["In Progress", "Backlog", "Done"]);
});
