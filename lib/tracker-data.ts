import "server-only";
import { supabaseAdmin } from "./supabase";
import type { FabJob, Tracker } from "./tracker";

export async function getJobs(tracker?: Tracker): Promise<FabJob[]> {
  let q = supabaseAdmin().from("fab_jobs").select("*").order("created_at");
  if (tracker) q = q.eq("tracker", tracker);
  const { data, error } = await q.limit(3000);
  if (error) throw error;
  return (data ?? []) as FabJob[];
}
