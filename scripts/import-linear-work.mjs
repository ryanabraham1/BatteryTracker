import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildLinearImport } from "../lib/linear-import.mjs";

const directory = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    "/private/tmp/warriorborgs-linear-import",
);
const apply = process.argv.includes("--apply");
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const p = l.indexOf("=");
      return [
        l.slice(0, p),
        l
          .slice(p + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
async function all(table) {
  const result = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(
        table === "work_access"
          ? "email"
          : table === "work_receipts"
            ? "event_id"
            : "id",
      )
      .range(from, from + 499);
    if (error) throw Error(error.message);
    result.push(...data);
    if (data.length < 500) return result;
  }
}
const snapshot = JSON.parse(
  await readFile(resolve(directory, "source.json"), "utf8"),
);
snapshot.users.push(...JSON.parse(await readFile(resolve(directory, "extra-users.json"), "utf8")));
snapshot.comments = JSON.parse(
  await readFile(resolve(directory, "comments.json"), "utf8"),
);
snapshot.projects = JSON.parse(
  await readFile(resolve(directory, "projects.json"), "utf8"),
);
const assets = JSON.parse(
  await readFile(resolve(directory, "assets.json"), "utf8"),
);
const [items, access, events, receipts] = await Promise.all([
  all("work_items"),
  all("work_access"),
  all("work_events"),
  all("work_receipts"),
]);
// Keep an immutable backup from immediately before the first import.
try {
  await writeFile(
    resolve(directory, "before-import.json"),
    JSON.stringify({ items, access, events, receipts }),
    { flag: "wx" },
  );
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
const result = buildLinearImport(snapshot, { items, access }, assets);
await writeFile(
  resolve(directory, "report.json"),
  JSON.stringify(result.report, null, 2),
);
await writeFile(
  resolve(directory, "payload.json"),
  JSON.stringify(result.payload),
);
console.log(
  JSON.stringify({ mode: apply ? "apply" : "preview", ...result.report }),
);
if (apply) {
  for (const a of result.usedAssets) {
    const { error } = await db.storage
      .from("work-imports")
      .upload(
        `linear/${a.id}`,
        await readFile(resolve(directory, "files", a.id)),
        { contentType: a.contentType, upsert: true },
      );
    if (error) throw Error(`File upload failed: ${a.id}: ${error.message}`);
  }
  const { data, error } = await db.rpc("import_linear_work", {
    payload: result.payload,
  });
  if (error) throw Error(error.message);
  console.log(JSON.stringify({ database: data }));
  const imported = await all("work_items");
  const source = imported.filter(
    (i) => i.data.source?.workspaceId === snapshot.workspace.id,
  );
  const importedEvents = (await all("work_events")).filter(
    (e) => e.data.source?.workspaceId === snapshot.workspace.id,
  );
  for (const [kind, count] of Object.entries(result.report.counts))
    if (source.filter((i) => i.kind === kind).length !== count)
      throw Error(`Count mismatch for ${kind}`);
  if (
    source.some(
      (i) =>
        i.kind === "issue" &&
        i.data.source.raw.labels.some((l) => /^(fab|fabrication)$/i.test(l)),
    )
  )
    throw Error("Fabrication issue imported");
  if (importedEvents.length !== result.payload.events.length)
    throw Error("Event count mismatch");
  console.log(
    JSON.stringify({
      verified: true,
      items: source.length,
      events: importedEvents.length,
    }),
  );
}
