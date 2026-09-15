"use client";

import { useState, type ReactNode } from "react";

/** Folds its children behind a toggle row on phones; always expanded from md up. */
export function MobileCollapse({
  label,
  badge,
  defaultOpen = false,
  className = "",
  children,
}: {
  label: string;
  badge?: number;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        className="md:hidden w-full flex items-center justify-between gap-3 px-4 min-h-[48px] select-none"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="eyebrow flex items-center gap-2" style={{ color: "var(--muted)" }}>
          {label}
          {badge ? <span className="pill pill-purple">{badge}</span> : null}
        </span>
        <span className="transition-transform" style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : undefined }} aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div className={open ? "" : "hidden md:block"}>{children}</div>
    </div>
  );
}
