"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card p-6 max-w-lg mx-auto mt-10 flex flex-col gap-3">
      <p className="eyebrow" style={{ color: "var(--bad)" }}>Something broke</p>
      <h1 className="display text-3xl">Couldn&apos;t load data.</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Usually this means the Supabase connection isn&apos;t configured yet (check <code className="mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="mono">SUPABASE_SERVICE_ROLE_KEY</code>) or the migration hasn&apos;t been run.
      </p>
      {error.message && <p className="mono text-xs break-words" style={{ color: "var(--muted)" }}>{error.message}</p>}
      <button type="button" className="btn btn-primary" onClick={reset}>Try again <span aria-hidden>→</span></button>
    </div>
  );
}
