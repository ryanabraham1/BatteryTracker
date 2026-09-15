import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Battery Tracker" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <main
      className="flex-1 flex flex-col justify-between px-6 py-10 sm:px-12 sm:py-14 min-h-dvh"
      style={{ background: "var(--plum)", color: "#fff" }}
    >
      <div>
        <p className="eyebrow" style={{ color: "var(--plum-text)" }}>
          Team 3256
        </p>
      </div>
      <div className="max-w-xl w-full">
        <h1 className="display text-[64px] sm:text-[96px] mb-10">
          Grab a<br />battery.
        </h1>
        <LoginForm next={next} />
      </div>
      <p className="eyebrow" style={{ color: "var(--plum-text)", opacity: 0.7 }}>
        Battery tracker
      </p>
    </main>
  );
}
