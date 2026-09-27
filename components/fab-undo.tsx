"use client";

import { undoEvent } from "@/app/fab-actions";
import { useFabAction } from "./fab-ui";

/** Undo link for a stock log entry; an error (e.g. "changed since") shows inline. */
export function UndoButton({ id }: { id: string }) {
  const a = useFabAction(undoEvent);
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        className="text-xs font-semibold underline"
        style={{ color: "var(--purple)" }}
        disabled={a.pending}
        onClick={() => {
          if (confirm("Undo this? The pieces go back to how they were before it.")) a.call({ id });
        }}
      >
        {a.pending ? "Undoing…" : "Undo"}
      </button>
      {a.error && (
        <span className="text-xs text-right max-w-[220px]" style={{ color: "var(--bad)" }} role="alert">
          {a.error}
        </span>
      )}
    </span>
  );
}
