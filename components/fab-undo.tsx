"use client";

import { undoEvent } from "@/app/fab-actions";
import { useFabAction } from "./fab-ui";
import { ConfirmButton } from "./confirm-button";

/** Undo link for a stock log entry; an error (e.g. "changed since") shows inline. */
export function UndoButton({ id }: { id: string }) {
  const a = useFabAction(undoEvent);
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <ConfirmButton
        className="text-xs font-semibold underline"
        link
        pending={a.pending}
        label={<span style={{ color: "var(--purple)" }}>Undo</span>}
        confirmLabel="Undo it"
        message="The pieces go back to how they were before this."
        onConfirm={() => a.call({ id })}
      />
      {a.error && (
        <span className="text-xs text-right max-w-[220px]" style={{ color: "var(--bad)" }} role="alert">
          {a.error}
        </span>
      )}
    </span>
  );
}
