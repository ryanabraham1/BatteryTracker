"use client";
import { PRIORITIES, STATUSES, type WorkFilter, type WorkItem } from "@/lib/work";
import { EntitySelect, Field } from "./editor";
import { Icon, StatusIcon } from "./icons";
import { PropertyPicker } from "./property-picker";

type FilterKey = "team" | "assignee" | "status" | "due" | "project" | "label" | "priority";

/** The issue filter pickers, shared by the main issues page and a project's Issues tab. */
export function IssueFilterFields({
  items,
  filter,
  onChange,
  hide = [],
}: {
  items: WorkItem[];
  filter: WorkFilter;
  onChange: (patch: WorkFilter) => void;
  hide?: FilterKey[];
}) {
  const show = (k: FilterKey) => !hide.includes(k);
  return (
    <>
      {show("team") && (
        <Field label="Team">
          <EntitySelect items={items} kind="team" value={filter.team} onChange={(v) => onChange({ team: v })} empty="All teams" />
        </Field>
      )}
      {show("assignee") && (
        <Field label="Assignee">
          <PropertyPicker
            label="Assignee"
            value={filter.assignee ?? ""}
            onChange={(v) => onChange({ assignee: v })}
            icon={<Icon name="member" size={15} />}
            options={[
              { value: "", label: "Everyone" },
              { value: "unassigned", label: "Unassigned" },
              ...items
                .filter((i) => i.kind === "member" && !i.archived && !i.deleted_at)
                .map((m) => ({ value: m.id, label: m.title })),
            ]}
          />
        </Field>
      )}
      {show("status") && (
        <Field label="Status">
          <PropertyPicker
            label="Status"
            value={filter.status ?? ""}
            onChange={(v) => onChange({ status: v })}
            icon={<Icon name="my-issues" size={15} />}
            options={[
              { value: "", label: "All statuses" },
              { value: "open", label: "Open" },
              ...STATUSES.map((st) => ({ value: st, label: st, icon: <StatusIcon status={st} /> })),
            ]}
          />
        </Field>
      )}
      {show("due") && (
        <Field label="Due date">
          <PropertyPicker
            label="Due date"
            value={filter.due ?? ""}
            onChange={(v) => onChange({ due: v })}
            icon={<Icon name="timeline" size={15} />}
            options={[
              { value: "", label: "Any time" },
              { value: "overdue", label: "Overdue" },
              { value: "week", label: "Due in the next 7 days" },
              { value: "any", label: "Has a due date" },
              { value: "none", label: "No due date" },
            ]}
          />
        </Field>
      )}
      {show("project") && (
        <Field label="Project">
          <EntitySelect items={items} kind="project" value={filter.project} onChange={(v) => onChange({ project: v })} empty="All projects" />
        </Field>
      )}
      {show("label") && (
        <Field label="Label">
          <EntitySelect items={items} kind="label" value={filter.label} onChange={(v) => onChange({ label: v })} empty="All labels" />
        </Field>
      )}
      {show("priority") && (
        <Field label="Priority">
          <PropertyPicker
            label="Priority"
            value={filter.priority ?? ""}
            onChange={(v) => onChange({ priority: v })}
            icon={<Icon name="filter" size={15} />}
            options={[
              { value: "", label: "All priorities" },
              ...PRIORITIES.map((p, n) => ({ value: String(n), label: p })),
            ]}
          />
        </Field>
      )}
    </>
  );
}
