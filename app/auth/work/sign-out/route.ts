import { NextResponse } from "next/server";
import { workAuthClient } from "@/lib/work-auth";
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return new NextResponse("Invalid origin", { status: 403 });
  const client = await workAuthClient();
  await client.auth.signOut();
  return NextResponse.redirect(`${origin}/work/login`, 303);
}
