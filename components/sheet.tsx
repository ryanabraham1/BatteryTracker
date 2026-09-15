"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Mobile bottom sheet / desktop centered dialog. */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center fade-in" role="dialog" aria-modal>
      <div className="absolute inset-0" style={{ background: "rgba(24,21,31,0.45)" }} onClick={onClose} />
      <div
        className="sheet-enter relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full sm:hidden" style={{ background: "var(--line)" }} />
        {(title || eyebrow) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              {eyebrow && (
                <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>
                  {eyebrow}
                </p>
              )}
              {title && <h2 className="display text-3xl">{title}</h2>}
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost px-3 py-2 text-sm" aria-label="Close">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
