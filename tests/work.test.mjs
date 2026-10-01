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
