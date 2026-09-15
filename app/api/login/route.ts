import { NextResponse } from "next/server";
import { currentCodeHash, hashCode, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  let code = "";
  try {
    const body = (await req.json()) as { code?: string };
    code = (body.code ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  if (!code) return NextResponse.json({ ok: false, error: "Enter the team code" }, { status: 400 });

  const expected = await currentCodeHash();
  if (hashCode(code) !== expected) {
    return NextResponse.json({ ok: false, error: "That's not the team code." }, { status: 401 });
  }
  await setSessionCookie(expected);
  return NextResponse.json({ ok: true });
}
