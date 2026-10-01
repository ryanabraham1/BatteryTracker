import { getWorkUser } from "@/lib/work-auth";
import { supabaseAdmin } from "@/lib/supabase";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getWorkUser()))
    return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(id))
    return new Response("Not found", { status: 404 });
  const { data, error } = await supabaseAdmin()
    .storage.from("work-imports")
    .createSignedUrl(`linear/${id}`, 60);
  if (error || !data) return new Response("File unavailable", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, no-store" },
  });
}
