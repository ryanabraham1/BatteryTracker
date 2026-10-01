// Work sign-in cookie settings, shared by the proxy and server code so the
// browser keeps the Supabase session (and its refresh token) for a long time
// instead of dropping it when the browser/PWA closes.
export const WORK_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 400, // 400 days, the maximum browsers allow
} as const;
