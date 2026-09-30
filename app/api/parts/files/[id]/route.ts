import { isAuthed } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { FILES_BUCKET } from "@/lib/parts-data";

/** A part's file: a short-lived signed link to the private bucket. `?view=1` opens it inline. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const { data: f } = await supabaseAdmin().from("fab_part_files").select("name, path").eq("id", id).maybeSingle();
  if (!f) return new Response("Not found", { status: 404 });
  const inline = new URL(req.url).searchParams.get("view") === "1";
  const { data, error } = await supabaseAdmin()
    .storage.from(FILES_BUCKET)
    .createSignedUrl(f.path as string, 300, inline ? undefined : { download: f.name as string });
  if (error || !data) return new Response("Couldn't open that file", { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}
