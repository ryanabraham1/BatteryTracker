"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A button that asks before it acts — in the page, not a browser dialog.
 * The first press opens a small panel right there saying what will happen,
 * with the real button and Cancel; Esc or Cancel closes it.
 */
export function ConfirmButton({
  label,
  message,
  confirmLabel,
  onConfirm,
  danger,
  pending,
  className = "btn btn-ghost text-sm",
  link,
  disabled,
}: {
  label: ReactNode;
  /** What happens if they go ahead. */
  message: ReactNode;
  /** The button that does it (defaults to the label). */
  confirmLabel?: ReactNode;
  onConfirm: () => void;
  danger?: boolean;
  pending?: boolean;
  /** Classes for the first button. */
  className?: string;
  /** Show the first button as a small text link (undo, ✕). */
  link?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) {
    return (
      <button type="button" className={className} disabled={disabled || pending} onClick={() => setOpen(true)} aria-expanded={false}>
        {pending ? "Working…" : label}
      </button>
    );
  }
  return (
    <span
      className={`fade-in ${link ? "inline-flex" : "flex"} flex-col gap-2 rounded-lg p-3 text-sm text-left`}
      style={{
        background: danger ? "var(--bad-soft)" : "var(--purple-soft)",
        border: `1px solid ${danger ? "var(--bad)" : "var(--purple)"}`,
        maxWidth: 420,
      }}
      role="group"
    >
      <span>{message}</span>
      <span className="flex gap-2 flex-wrap">
        <button
          ref={confirmRef}
          type="button"
          className={`btn ${danger ? "btn-danger" : "btn-primary"} text-sm`}
          style={danger ? { background: "var(--bad)", color: "#fff" } : undefined}
          disabled={pending}
          onClick={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          {confirmLabel ?? label}
        </button>
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
    </span>
  );
}
