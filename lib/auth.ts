import "server-only";
import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase";

export const SESSION_COOKIE = "bt_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Missing SESSION_SECRET");
  return s;
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/** Effective team-code hash: DB override (set from Settings) wins over env var. */
export async function currentCodeHash(): Promise<string> {
  try {
    const { data } = await supabaseAdmin()
      .from("settings")
      .select("team_code_hash")
      .eq("id", 1)
      .abortSignal(AbortSignal.timeout(3000))
      .maybeSingle();
    if (data?.team_code_hash) return data.team_code_hash as string;
  } catch {
    // fall through to env
  }
  const env = process.env.TEAM_CODE;
  if (!env) throw new Error("Missing TEAM_CODE");
  return hashCode(env);
}

export function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Cookie value = <codeHash>.<hmac>. Changing the code changes the hash → everyone is logged out. */
export function makeSessionValue(codeHash: string): string {
  return `${codeHash}.${sign(codeHash)}`;
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifySessionValue(value: string | undefined, codeHash: string): boolean {
  if (!value) return false;
  const [h, sig] = value.split(".");
  if (!h || !sig) return false;
  return safeEq(h, codeHash) && safeEq(sig, sign(h));
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const v = jar.get(SESSION_COOKIE)?.value;
  if (!v) return false;
  return verifySessionValue(v, await currentCodeHash());
}

export async function setSessionCookie(codeHash: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, makeSessionValue(codeHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
