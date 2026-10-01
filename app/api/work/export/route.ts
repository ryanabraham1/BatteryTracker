import { requireWorkUser } from "@/lib/work-auth";
import { getWork } from "@/lib/work-data";
export async function GET() {
  try {
    await requireWorkUser();
  } catch {
    return Response.json({ error: "Sign in with Google to export Work." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const snapshot = await getWork(true);
  if (snapshot.error) return Response.json({ error: snapshot.error }, { status: 503 });
  return new Response(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: snapshot.items, events: snapshot.events }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="warriorborgs-work.json"', "Cache-Control": "private, no-store" },
  });
}
