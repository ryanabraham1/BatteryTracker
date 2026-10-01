import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function refreshWorkSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const c of cookies) request.cookies.set(c.name, c.value);
          response = NextResponse.next({ request });
          for (const c of cookies)
            response.cookies.set(c.name, c.value, c.options);
        },
      },
    },
  );
  const { data, error } = await client.auth.getClaims();
  if (
    (!data?.claims || error) &&
    request.nextUrl.pathname !== "/work/login" &&
    !request.nextUrl.pathname.startsWith("/auth/work/")
  ) {
    const redirect = NextResponse.redirect(new URL("/work/login", request.url));
    for (const c of response.cookies.getAll())
      redirect.cookies.set(c.name, c.value, c);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
