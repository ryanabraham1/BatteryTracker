import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "./supabase";
import { WORK_COOKIE_OPTIONS } from "./work-cookie";
export type WorkRole = "admin" | "member" | "viewer";
export type WorkUser = {
  email: string;
  role: WorkRole;
  memberId: string;
  name: string;
  userId: string;
};
export type WorkAccess = {
  email: string;
  role: WorkRole;
  disabled: boolean;
  user_id: string | null;
  member_id: string | null;
};
export async function workAuthClient() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: WORK_COOKIE_OPTIONS,
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            for (const c of values) jar.set(c.name, c.value, c.options);
          } catch {
            /* Proxy refreshes cookies for Server Components. */
          }
        },
      },
    },
  );
}
export const getWorkUser = cache(async (): Promise<WorkUser | null> => {
  const client = await workAuthClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (
    error ||
    !user?.email ||
    !user.email_confirmed_at ||
    !user.identities?.some((i) => i.provider === "google")
  )
    return null;
  const { data: access, error: accessError } = await supabaseAdmin()
    .from("work_access")
    .select("*")
    .eq("email", user.email.toLowerCase())
    .eq("user_id", user.id)
    .eq("disabled", false)
    .single();
  if (accessError || !access?.member_id) return null;
  const { data: member } = await supabaseAdmin()
    .from("work_items")
    .select("title")
    .eq("id", access.member_id)
    .eq("kind", "member")
    .single();
  return {
    email: user.email,
    role: access.role,
    memberId: access.member_id,
    name: member?.title || user.email,
    userId: user.id,
  };
});
export async function requireWorkUser(write = false, admin = false) {
  const user = await getWorkUser();
  if (!user) throw new Error("Sign in with Google to access Work.");
  if (write && user.role === "viewer")
    throw new Error("Your account has view-only access.");
  if (admin && user.role !== "admin")
    throw new Error("Only workspace admins can manage access and teams.");
  return user;
}
export async function getWorkAccess(): Promise<WorkAccess[]> {
  const user = await requireWorkUser();
  if (user.role !== "admin") return [];
  const { data, error } = await supabaseAdmin()
    .from("work_access")
    .select("email,role,disabled,user_id,member_id")
    .order("email");
  if (error) throw error;
  return data ?? [];
}
