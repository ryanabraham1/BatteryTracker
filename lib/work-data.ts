import "server-only";
import { requireWorkUser } from "./work-auth";
import { supabaseAdmin } from "./supabase";
import type { WorkSnapshot } from "./work";
import { compactWorkSnapshot } from "./work-snapshot";
async function collect<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  maximum = Infinity,
): Promise<T[]> {
  const all: T[] = [];
  while (all.length < maximum) {
    const size = Math.min(500, maximum - all.length);
    const result = await page(all.length, all.length + size - 1);
    if (result.error) throw result.error;
    const batch = result.data ?? [];
    all.push(...batch);
    if (batch.length < size) break;
  }
  return all;
}
export async function getWork(full = false): Promise<WorkSnapshot> {
  const user = await requireWorkUser();
  try {
    const db = supabaseAdmin();
    const maintenance = await db.rpc("advance_work");
    if (maintenance.error) throw maintenance.error;
    const [items, events, receipts] = await Promise.all([
      collect<WorkSnapshot["items"][number]>((from, to) =>
        db.from("work_items").select("*").order("number").range(from, to),
      ),
      collect<WorkSnapshot["events"][number]>(
        (from, to) =>
          db
            .from("work_events")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        2000,
      ),
      collect<WorkSnapshot["receipts"][number]>((from, to) =>
        db
          .from("work_receipts")
          .select("*")
          .eq("member_id", user.memberId)
          .order("event_id")
          .range(from, to),
      ),
    ]);
    const snapshot = { now: new Date().toISOString(), items, events, receipts };
    return full ? snapshot : compactWorkSnapshot(snapshot);
  } catch (e) {
    const message =
      e && typeof e === "object" && "message" in e
        ? String(e.message)
        : String(e);
    return {
      now: new Date().toISOString(),
      items: [],
      events: [],
      receipts: [],
      error: /work_.*(exist|schema cache)/i.test(message)
        ? "Work needs its database migration. Apply the team_work migration to the linked Supabase project."
        : "Work couldn't load. Check your connection and try again.",
    };
  }
}
