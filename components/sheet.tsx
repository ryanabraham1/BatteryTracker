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
        className="sheet-enter relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl px-4 sm:px-5 pt-3 sm:pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        {/* Grab handle — tapping it also closes on phones */}
        <button type="button" onClick={onClose} className="sm:hidden block mx-auto mb-2 py-2 px-6" aria-label="Close">
          <span className="block h-1 w-10 rounded-full" style={{ background: "var(--line)" }} />
        </button>
        {(title || eyebrow) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {eyebrow && (
                <p className="eyebrow mb-1" style={{ color: "var(--muted)" }}>
                  {eyebrow}
                </p>
              )}
              {title && <h2 className="display text-3xl break-words">{title}</h2>}
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost w-11 h-11 p-0 shrink-0" aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
