import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LAST_APP_COOKIE } from "@/lib/apps";

export const dynamic = "force-dynamic";

/** proxy.ts normally redirects `/` first; this is the fallback. */
export default async function Home() {
  const last = (await cookies()).get(LAST_APP_COOKIE)?.value;
  redirect(last === "stock" ? "/stock" : "/battery");
}
