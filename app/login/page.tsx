import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Sign in — 3256 Tools" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  if (await isAuthed()) redirect(next.startsWith("/") ? next : "/");
  return (
    <main
      className="flex-1 flex flex-col justify-between px-6 sm:px-12 min-h-dvh pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:py-14"
      style={{ background: "var(--plum)", color: "#fff" }}
    >
      <div className="flex items-center justify-between">
        <p className="eyebrow" style={{ color: "var(--plum-text)" }}>
          Team 3256
        </p>
        <ThemeToggle />
      </div>
      <div className="max-w-xl w-full">
        <h1 className="display mb-8 sm:mb-10" style={{ fontSize: "clamp(52px, 17vw, 96px)" }}>
          Team<br />tools.
        </h1>
        <LoginForm next={next} />
      </div>
      <p className="eyebrow" style={{ color: "var(--plum-text)", opacity: 0.7 }}>
        Batteries · Fab stock
      </p>
    </main>
  );
}
