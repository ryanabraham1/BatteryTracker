/** Which of the two apps this device used last, so `/` can open it. Set in proxy.ts. */
export const LAST_APP_COOKIE = "last_app";
export type AppName = "battery" | "stock";

export function appForPath(pathname: string): AppName | null {
  if (pathname === "/battery" || pathname.startsWith("/battery/")) return "battery";
  if (pathname === "/stock" || pathname.startsWith("/stock/")) return "stock";
  return null;
}
