import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkUser } from "@/lib/work-auth";
import { ThemeToggle } from "@/components/theme-toggle";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in to Work · 3256 Tools" };
export default async function WorkLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getWorkUser()) redirect("/work");
  const { error } = await searchParams;
  return (
    <main className="min-h-dvh flex items-center justify-center p-5">
      <div className="card w-full max-w-sm p-7">
        <div className="flex items-center justify-between">
        <span className="eyebrow" style={{ color: "var(--purple)" }}>
          3256 Tools
        </span>
        <ThemeToggle />
        </div>
        <h1 className="text-3xl tracking-tight font-medium mt-5 mb-6">
          Sign in to Work
        </h1>
        <form action="/auth/work/sign-in" method="post">
          <button className="btn btn-ghost w-full" type="submit">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4C20.9 18 22 15.4 22 12.2"
              />
              <path
                fill="#34A853"
                d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.9-5.8-4.4H2.7v2.7A10.4 10.4 0 0 0 12 22"
              />
              <path
                fill="#FBBC05"
                d="M6.2 13.5a6.3 6.3 0 0 1 0-3V7.8H2.7a10.4 10.4 0 0 0 0 8.4z"
              />
              <path
                fill="#EA4335"
                d="M12 6.1c1.5 0 2.9.5 3.9 1.5l2.9-2.9A10 10 0 0 0 12 2a10.4 10.4 0 0 0-9.3 5.8l3.5 2.7c.8-2.5 3.1-4.4 5.8-4.4"
              />
            </svg>
            Continue with Google
          </button>
        </form>
        {error && (
          <p
            role="alert"
            className="text-sm mt-5"
            style={{ color: "var(--bad)" }}
          >
            {error === "access"
              ? "This account hasn't been added to Work. Ask a workspace admin to grant access."
              : error === "provider"
                ? "Google sign-in isn't configured yet. Enable the Google provider in Supabase."
                : error === "server"
                  ? "Work couldn't verify account access. Please try again or contact a workspace admin."
                  : "Sign-in couldn't finish. Please try again."}
          </p>
        )}
        <p className="text-sm mt-5" style={{ color: "var(--muted)" }}>
          Use an account your team admin has added.
        </p>
        <Link
          href="/"
          className="text-sm inline-block mt-6"
          style={{ color: "var(--purple)" }}
        >
          Back to team tools
        </Link>
      </div>
    </main>
  );
}
