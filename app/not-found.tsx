import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="eyebrow" style={{ color: "var(--muted)" }}>404</p>
      <h1 className="display text-5xl">Not found.</h1>
      <Link href="/" className="btn btn-primary">Back to board <span aria-hidden>→</span></Link>
    </main>
  );
}
