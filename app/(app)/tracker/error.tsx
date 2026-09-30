"use client";

export default function TrackerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card p-6 max-w-lg mx-auto mt-10 flex flex-col gap-3">
      <p className="eyebrow" style={{ color: "var(--bad)" }}>
        Something broke
      </p>
      <h1 className="display text-3xl">Couldn&apos;t load the tracker.</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        If the tracker is new here, the database needs <code className="mono">supabase/migrations/0010_tracker_dead_zones.sql</code> run once in the Supabase SQL editor. It adds the
        tracker table and the unusable-area column for sheet stock.
      </p>
      {error.message && (
        <p className="mono text-xs break-words" style={{ color: "var(--muted)" }}>
          {error.message}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={reset}>
        Try again <span aria-hidden>→</span>
      </button>
    </div>
  );
}
