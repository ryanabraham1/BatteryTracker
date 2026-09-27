import { NextResponse, type NextRequest } from "next/server";
import { appForPath, LAST_APP_COOKIE } from "./lib/apps";

const COOKIE = "bt_session";

// Edge-safe signature check. The full check (does the hash match the *current*
// team code?) happens in the app layout, which can talk to the DB.
async function hasValidSignature(value: string | undefined, secret: string): Promise<boolean> {
  if (!value) return false;
  const [hash, sig] = value.split(".");
  if (!hash || !sig) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(hash));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sig;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET ?? "";
  const ok = await hasValidSignature(request.cookies.get(COOKIE)?.value, secret);

  // /login decides for itself (it does the full DB-backed check), so a stale
  // cookie with a valid signature can't bounce between / and /login.
  if (pathname === "/login") return NextResponse.next();
  if (!ok) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // `/` opens whichever app this device used last.
  if (pathname === "/") {
    const last = request.cookies.get(LAST_APP_COOKIE)?.value === "stock" ? "/stock" : "/battery";
    return NextResponse.redirect(new URL(last, request.url));
  }
  const res = NextResponse.next();
  const app = appForPath(pathname);
  if (app && request.cookies.get(LAST_APP_COOKIE)?.value !== app) {
    res.cookies.set(LAST_APP_COOKIE, app, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return res;
}

export const config = {
  matcher: [
    // everything except: login API, static assets, PWA files
    "/((?!api/login|_next/static|_next/image|manifest.json|icon-.*\\.png|favicon.ico|sw.js).*)",
  ],
};
