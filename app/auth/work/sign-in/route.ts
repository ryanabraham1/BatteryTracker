import { NextResponse } from "next/server";
import { workAuthClient } from "@/lib/work-auth";
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return new NextResponse("Invalid origin", { status: 403 });
  try {
    const settings = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        cache: "no-store",
      },
    );
    const config = await settings.json();
    if (!settings.ok || !config.external?.google)
      return NextResponse.redirect(`${origin}/work/login?error=provider`, 303);
  } catch {
    return NextResponse.redirect(`${origin}/work/login?error=provider`, 303);
  }
  const client = await workAuthClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/work/callback`,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url)
    return NextResponse.redirect(`${origin}/work/login?error=provider`, 303);
  return NextResponse.redirect(data.url, 303);
}
