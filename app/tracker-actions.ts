"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { isAuthed } from "@/lib/auth";
import { isJobStatus, isTracker, jobKey, readSheet, TEXT_FIELDS, type ImportRow, type Tracker } from "@/lib/tracker";
import type { FabResult } from "./fab-actions";

const db = () => supabaseAdmin();

async function run<T>(fn: () => Promise<T>): Promise<FabResult<T>> {
  try {
    if (!(await isAuthed())) throw new Error("Not signed in");
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
    // the table comes from migration 0010; say so instead of a Postgres error
    if (/fab_jobs/.test(msg) && /exist|schema cache/i.test(msg)) return { ok: false, error: "The tracker table isn't set up yet — run supabase/migrations/0010 in Supabase." };
    return { ok: false, error: msg };
  }
}

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
function int(fd: FormData, k: string, def: number | null): number | null {
  const v = str(fd, k).replace(/^#/, "");
  if (!v) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${k.replace("_", " ")} must be a number`);
  return Math.round(n);
}

/** Add or edit one tracker row. */
export async function saveJob(fd: FormData): Promise<FabResult<string>> {
  return run(async () => {
    const id = str(fd, "id");
    const tracker = str(fd, "tracker");
    if (!isTracker(tracker)) throw new Error("Pick a tracker");
    const status = str(fd, "status") || "not_started";
    if (!isJobStatus(status)) throw new Error("Pick a status");
    const row: Record<string, unknown> = {
      tracker,
      status,
      priority: int(fd, "priority", null),
      qty: int(fd, "qty", 1),
      spare_qty: int(fd, "spare_qty", 0),
      material_id: str(fd, "material_id") || null,
    };
    for (const f of TEXT_FIELDS) row[f] = str(fd, f);
    if (!row.name) throw new Error("Enter the part name");
    if (row.priority !== null && (row.priority as number) > 4) throw new Error("Priority goes from #0 (most urgent) to #4");
    if (id) {
      const { data: before } = await db().from("fab_jobs").select("status").eq("id", id).maybeSingle();
      if (before && before.status !== status) row.status_changed_at = new Date().toISOString();
      const { error } = await db().from("fab_jobs").update(row).eq("id", id);
      if (error) throw error;
      return id;
    }
    const { data, error } = await db().from("fab_jobs").insert(row).select("id").single();
    if (error) throw error;
    return data.id as string;
  });
}

/** Quick status change from the table. */
export async function setJobStatus(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const status = str(fd, "status");
    if (!isJobStatus(status)) throw new Error("Pick a status");
    const { error } = await db().from("fab_jobs").update({ status, status_changed_at: new Date().toISOString() }).eq("id", str(fd, "id"));
    if (error) throw error;
  });
}

export async function deleteJob(fd: FormData): Promise<FabResult> {
  return run(async () => {
    const { error } = await db().from("fab_jobs").delete().eq("id", str(fd, "id"));
    if (error) throw error;
  });
}

/**
 * Rows pasted from the tracker sheet. A row whose bot + part name is already
 * on this tracker updates it (only the columns that were pasted); new ones
 * are added.
 */
export async function importJobs(fd: FormData): Promise<FabResult<{ added: number; updated: number }>> {
  return run(async () => {
    const tracker = str(fd, "tracker") as Tracker;
    if (!isTracker(tracker)) throw new Error("Pick a tracker");
    const { rows, columns, error } = readSheet(str(fd, "text"));
    if (error) throw new Error(error);
    if (!rows.length) throw new Error("No parts found under the header row");
    if (rows.length > 2000) throw new Error("That's more than 2000 rows — paste it in parts");

    const { data: existing, error: ee } = await db().from("fab_jobs").select("id, bot, name").eq("tracker", tracker);
    if (ee) throw ee;
    const byKey = new Map((existing ?? []).map((j) => [jobKey(j as { bot: string; name: string }), j.id as string]));

    // only overwrite what the paste actually had a column for
    const has = new Set<string>(columns);
    const patch = (r: ImportRow) => {
      const out: Record<string, unknown> = { name: r.name };
      for (const k of ["status", "priority", "qty", "spare_qty", ...TEXT_FIELDS] as const) {
        if (k !== "name" && has.has(k)) out[k] = (r as Record<string, unknown>)[k] ?? (k === "priority" ? null : "");
      }
      return out;
    };

    const inserts: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let updated = 0;
    for (const r of rows) {
      const key = jobKey(r);
      if (seen.has(key)) continue; // the sheet lists a few parts twice; keep the first
      seen.add(key);
      const id = byKey.get(key);
      if (id) {
        const { error: ue } = await db().from("fab_jobs").update(patch(r)).eq("id", id);
        if (ue) throw ue;
        updated++;
      } else {
        inserts.push({ tracker, ...patch(r) });
      }
    }
    if (inserts.length) {
      const { error: ie } = await db().from("fab_jobs").insert(inserts);
      if (ie) throw ie;
    }
    return { added: inserts.length, updated };
  });
}
