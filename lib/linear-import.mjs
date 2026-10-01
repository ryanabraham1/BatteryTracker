import { createHash } from "node:crypto";

const ADMINS = new Set([
  "ryan.ryanabraham@gmail.com",
  "ryan.abraham@warriorlife.net",
  "robotics@warriorlife.net",
]);
export function isFabIssue(issue) {
  return (issue.labels ?? []).some((label) =>
    /^(fab|fabrication)$/i.test(typeof label === "string" ? label : label.name),
  );
}
export function stableImportId(workspaceId, kind, sourceId) {
  const hex = createHash("sha256")
    .update(`${workspaceId}:${kind}:${sourceId}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function buildLinearImport(
  snapshot,
  existing = { items: [], access: [] },
  assets = [],
) {
  const workspaceId = snapshot.workspace.id;
  const excluded = new Set(
    snapshot.issues.filter(isFabIssue).flatMap((i) => [i.id, i.uuid]),
  );
  const issues = snapshot.issues
    .filter((i) => !isFabIssue(i))
    .map((i) => ({ ...i, ...snapshot.issueDetails[i.uuid] }));
  const items = [],
    events = [],
    access = [],
    mergeIds = new Set(),
    ids = new Map(),
    warnings = [];
  const assetMap = new Map(
    assets
      .filter((a) => !a.error)
      .map((a) => [a.pathname, `/api/work/files/${a.id}`]),
  );
  function rewrite(text = "") {
    return text.replace(
      /https:\/\/uploads\.linear\.app\/[^\s<>"\])]+/g,
      (url) => assetMap.get(new URL(url).pathname) ?? url,
    );
  }
  function identify(kind, raw, fallback) {
    const key = raw.uuid ?? raw.id;
    let match = existing.items.find(
      (i) =>
        i.kind === kind &&
        i.data.source?.workspaceId === workspaceId &&
        i.data.source?.id === key,
    );
    if (!match && fallback) match = fallback();
    const id = match?.id ?? stableImportId(workspaceId, kind, key);
    if (match && !match.data.source) mergeIds.add(match.id);
    ids.set(`${kind}:${key}`, id);
    if (raw.id) ids.set(`${kind}:${raw.id}`, id);
    return { id, match };
  }
  function mapped(kind, id) {
    if (!id || excluded.has(id)) return undefined;
    const result = ids.get(`${kind}:${id}`);
    if (!result) throw Error(`Unresolved ${kind} reference: ${id}`);
    return result;
  }
  function add(kind, raw, data = {}, fallback) {
    const { id, match } = identify(kind, raw, fallback);
    const title =
      kind === "member" && match ? match.title : (raw.title ?? raw.name);
    items.push({
      id,
      kind,
      title: title?.trim() || "Untitled",
      data: {
        ...data,
        source: {
          system: "linear",
          workspaceId,
          id: raw.uuid ?? raw.id,
          identifier: raw.uuid ? raw.id : undefined,
          url: raw.url,
          raw,
        },
      },
      archived: !!raw.archivedAt,
      created_at: raw.createdAt ?? snapshot.exportedAt,
      updated_at: raw.updatedAt ?? raw.createdAt ?? snapshot.exportedAt,
    });
    return id;
  }
  for (const t of snapshot.teams) {
    const key =
      snapshot.issues.find((i) => i.teamId === t.id)?.id.split("-")[0] ??
      (t.name.includes("Purchase") ? "PO" : "WB");
    add(
      "team",
      t,
      {
        identifier: key,
        workflow: (snapshot.statuses[t.id] ?? []).map((s) => s.name),
        color: t.color ?? "#6b3fd4",
      },
      () =>
        existing.items.find(
          (i) =>
            i.kind === "team" && !i.data.source && i.data.identifier === key,
        ),
    );
  }
  for (const u of snapshot.users) {
    const email = u.email?.toLowerCase();
    const member = add("member", u, { email, color: "#6b3fd4" }, () => {
      const a = existing.access.find((a) => a.email.toLowerCase() === email);
      return existing.items.find((i) => i.id === a?.member_id);
    });
    if (email && !email.endsWith("@linear.linear.app"))
      access.push({
        email,
        member_id: member,
        role: ADMINS.has(email) ? "admin" : "member",
        disabled: u.isActive === false,
      });
  }
  const labelRows = new Map();
  for (const l of snapshot.labels) labelRows.set(l.id, { ...l });
  for (const [team, list] of Object.entries(snapshot.teamLabels))
    for (const l of list)
      if (!labelRows.has(l.id)) labelRows.set(l.id, { ...l, teamId: team });
  for (const l of [...snapshot.projectLabels, ...snapshot.initiativeLabels])
    if (!labelRows.has(l.id)) labelRows.set(l.id, l);
  for (const l of labelRows.values())
    add(
      "label",
      l,
      {
        description: l.description ?? "",
        color: l.color ?? "#6b3fd4",
        group: l.parent ?? "",
        team: mapped("team", l.teamId),
      },
      () =>
        existing.items.find(
          (i) =>
            i.kind === "label" &&
            !i.data.source &&
            !l.teamId &&
            !i.data.team &&
            i.title === l.name,
        ),
    );
  for (const p of snapshot.projects) identify("project", p);
  for (const i of snapshot.initiatives) identify("initiative", i);
  for (const i of issues) identify("issue", i);
  for (const c of snapshot.customers)
    add("customer", c, {
      status: c.status?.name,
      description: c.description ?? "",
      url: c.url,
    });
  for (const r of snapshot.releases)
    add("release", r, {
      status: r.stage?.name,
      description: rewrite(r.description ?? ""),
      url: r.url,
    });
  const allCycles = Object.entries(snapshot.cycles).flatMap(([team, list]) =>
    (Array.isArray(list) ? list : (list.cycles ?? [])).map((c) => ({
      ...c,
      teamId: team,
    })),
  );
  for (const c of allCycles)
    add("cycle", c, {
      team: mapped("team", c.teamId),
      start: c.startsAt?.slice(0, 10),
      due: c.endsAt?.slice(0, 10),
      description: rewrite(c.description ?? ""),
    });
  const labelsFor = (raw, teamId) =>
    (raw.labels ?? [])
      .map((l) => {
        if (typeof l !== "string") return mapped("label", l.id);
        const label = [...labelRows.values()].find(
          (x) => x.name === l && (!x.teamId || x.teamId === teamId),
        );
        if (!label) throw Error(`Missing label ${l}`);
        return mapped("label", label.id);
      })
      .filter(Boolean);
  for (const i of snapshot.initiatives)
    add("initiative", i, {
      description: rewrite(i.description || i.summary || ""),
      status: i.status === "Active" ? "In progress" : i.status,
      priority: i.priority?.value ?? 0,
      due: i.targetDate?.slice(0, 10),
      color: i.color,
      health: i.health,
      assignee: mapped("member", i.owner?.id),
      parentInitiative: mapped("initiative", i.parentInitiatives?.[0]?.id),
      labels: labelsFor(i, i.leadTeam?.id),
    });
  for (const p of snapshot.projects) {
    add("project", p, {
      description: rewrite(p.description || p.summary || ""),
      status: p.status?.name ?? "Planned",
      priority: p.priority?.value ?? 0,
      start: p.startDate?.slice(0, 10),
      due: p.targetDate?.slice(0, 10),
      color: p.color,
      team: mapped("team", p.leadTeam?.id ?? p.teams?.[0]?.id),
      assignee: mapped("member", p.lead?.id),
      initiative: mapped("initiative", p.initiatives?.[0]?.id),
      labels: labelsFor(p, p.leadTeam?.id),
    });
    for (const m of p.milestones ?? [])
      add("milestone", m, {
        project: mapped("project", p.uuid),
        description: rewrite(m.description ?? ""),
        due: m.targetDate?.slice(0, 10),
        status: m.status ?? "Planned",
      });
  }
  for (const i of issues) {
    const relations = [];
    for (const [key, type] of [
      ["blocks", "blocks"],
      ["blockedBy", "blocked by"],
      ["relatedTo", "related"],
    ])
      for (const r of i.relations?.[key] ?? []) {
        const id = mapped("issue", r.uuid ?? r.id);
        if (id) relations.push({ id, type });
      }
    if (i.relations?.duplicateOf) {
      const id = mapped(
        "issue",
        i.relations.duplicateOf.uuid ?? i.relations.duplicateOf.id,
      );
      if (id) relations.push({ id, type: "duplicate of" });
    }
    add("issue", i, {
      description: rewrite(i.description ?? ""),
      status: i.status,
      priority: i.priority?.value ?? 0,
      estimate: i.estimate?.value,
      due: i.dueDate?.slice(0, 10),
      team: mapped("team", i.teamId),
      assignee: mapped("member", i.assigneeId),
      project: mapped("project", i.projectId),
      parent: mapped("issue", i.parentId),
      cycle: mapped("cycle", i.cycleId),
      milestone: mapped("milestone", i.projectMilestone?.id),
      labels: labelsFor(i, i.teamId),
      relations,
      attachments: (i.attachments ?? []).map((a) => ({
        ...a,
        url: rewrite(a.url),
      })),
    });
  }
  for (const d of snapshot.documents)
    add("document", d, {
      description: rewrite(d.content ?? ""),
      project: mapped("project", d.project?.id),
      initiative: mapped("initiative", d.initiative?.id),
      parent: mapped("issue", d.issue?.id),
      team: mapped("team", d.team?.id),
    });
  for (const t of snapshot.templates) {
    const c = t.content ?? {};
    const state = Object.values(snapshot.statuses)
      .flat()
      .find((s) => s.id === c.stateId);
    add("template", t, {
      targetKind: t.type,
      templateTitle: c.title,
      description: rewrite(c.description ?? ""),
      status: state?.name ?? "Todo",
      priority: c.priority?.value ?? 0,
      labels: (c.labelIds ?? []).map((id) => mapped("label", id)),
      team: mapped(
        "team",
        snapshot.teams.find(
          (tm) =>
            items.find((i) => i.id === mapped("team", tm.id))?.data
              .identifier === t.scope,
        )?.id,
      ),
    });
  }
  function event(raw, itemId, type, body, extra = {}) {
    if (!itemId) return;
    events.push({
      id: stableImportId(workspaceId, "event", raw.id),
      item_id: itemId,
      type,
      body: rewrite(body),
      actor: raw.author?.name ?? raw.user?.name ?? raw.createdBy ?? "Linear",
      actor_id: mapped(
        "member",
        raw.author?.id ?? raw.user?.id ?? raw.createdById,
      ),
      created_at: raw.createdAt ?? snapshot.exportedAt,
      data: {
        ...extra,
        source: { system: "linear", workspaceId, id: raw.id, raw },
      },
    });
  }
  for (const i of issues) {
    const itemId = mapped("issue", i.uuid);
    event({ ...i, id: `${i.uuid}:created` }, itemId, "created", i.title);
    for (const [index, h] of (i.stateHistory ?? []).entries())
      event(
        { id: `${i.uuid}:state:${index}`, createdAt: h.startedAt },
        itemId,
        "status",
        h.state.name,
        { status: h.state.name },
      );
  }
  const updateParents = new Map();
  for (const u of snapshot.updates) {
    const itemId = mapped(u.type, u.project?.id ?? u.initiative?.id);
    updateParents.set(u.id, itemId);
    event(u, itemId, "update", u.body, {
      health: u.health,
      diffMarkdown: rewrite(u.diffMarkdown ?? ""),
    });
  }
  for (const group of snapshot.comments) {
    if (group.parentKind === "issue" && excluded.has(group.parentId)) continue;
    const itemId =
      group.parentKind === "update"
        ? updateParents.get(group.parentId)
        : mapped(group.parentKind, group.parentId);
    for (const c of group.result.comments)
      event(c, itemId, "comment", c.body, {
        parentId: c.parentId,
        quotedText: c.quotedText,
        resolvedAt: c.resolvedAt,
        updatedAt: c.updatedAt,
      });
  }
  const allIds = new Set([
    ...items.map((i) => i.id),
    ...existing.items.map((i) => i.id),
  ]);
  for (const i of items) {
    for (const key of [
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
    ]) {
      if (i.data[key] && !allIds.has(i.data[key]))
        throw Error(`Dangling ${key} on ${i.title}`);
    }
    for (const id of i.data.labels ?? [])
      if (!allIds.has(id)) throw Error("Dangling label");
  }
  const counts = Object.fromEntries(
    [...new Set(items.map((i) => i.kind))].map((k) => [
      k,
      items.filter((i) => i.kind === k).length,
    ]),
  );
  const usedAssets = assets.filter((a) =>
    JSON.stringify({
      items: items.map((i) => ({
        ...i,
        data: { ...i.data, source: undefined },
      })),
      events: events.map((e) => ({ ...e, data: undefined })),
    }).includes(`/api/work/files/${a.id}`),
  );
  return {
    payload: {
      workspaceId,
      items,
      events,
      access,
      mergeIds: [...mergeIds],
      maximumIssueNumber: Math.max(
        ...snapshot.issues.map((i) => Number(i.id.split("-").at(-1)) || 0),
      ),
    },
    report: {
      workspace: snapshot.workspace.name,
      counts,
      excludedFabIssues: snapshot.issues.filter(isFabIssue).length,
      comments: events.filter((e) => e.type === "comment").length,
      updates: events.filter((e) => e.type === "update").length,
      stateHistory: events.filter((e) => e.type === "status").length,
      assets: usedAssets.length,
      warnings,
    },
    usedAssets,
  };
}
