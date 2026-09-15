"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCompMode } from "./comp-mode";

const NAV: { href: string; label: string; icon: React.ReactNode }[] = [
  {
    href: "/",
    label: "Board",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="7" height="16" rx="1.5" />
        <rect x="14" y="4" width="7" height="9" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/log",
    label: "Log",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 6h16M4 12h10M4 18h13" />
      </svg>
    ),
  },
  {
    href: "/batteries",
    label: "Batteries",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="7" width="17" height="10" rx="2" />
        <path d="M22 10v4M6 11v2M10 11v2" />
      </svg>
    ),
  },
  {
    href: "/comp",
    label: "Comp",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    ),
  },
];

const SEARCHABLE = ["/", "/batteries"];

function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const { compMode, setCompMode, matchLabel } = useCompMode();
  const urlQ = sp.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  if (urlQ !== lastUrlQ) {
    // sync the box when the URL changes (e.g. Clear / back nav)
    setLastUrlQ(urlQ);
    setQ(urlQ);
  }
  // Mobile search is collapsed behind an icon so the top bar stays one row tall.
  const [searchOpen, setSearchOpen] = useState(!!urlQ);
  const mobileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) mobileInput.current?.focus();
  }, [searchOpen]);

  const canSearch = SEARCHABLE.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
  const searchTarget = pathname.startsWith("/batteries") ? "/batteries" : "/";

  function search(e: FormEvent) {
    e.preventDefault();
    router.push(q ? `${searchTarget}?q=${encodeURIComponent(q)}` : searchTarget);
  }

  function clearSearch() {
    setQ("");
    setSearchOpen(false);
    if (urlQ) router.push(searchTarget);
  }

  const compPill = (
    <button
      type="button"
      onClick={() => setCompMode(!compMode)}
      className="pill"
      style={{
        minHeight: 36,
        padding: "0 0.8rem",
        ...(compMode
          ? { background: "var(--purple)", color: "#fff" }
          : { background: "var(--paper)", color: "var(--muted)", border: "1px solid var(--line)" }),
      }}
      title="Competition mode"
      aria-pressed={compMode}
    >
      {compMode ? `Comp${matchLabel ? ` · ${matchLabel}` : ""}` : "Comp off"}
    </button>
  );

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b pt-safe"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto max-w-[1400px] px-4 py-2 flex items-center gap-3 min-h-[56px]">
          <Link href="/" className="flex items-center gap-2 shrink-0 min-h-[44px]">
            <span
              className="eyebrow px-2 py-1 rounded-md"
              style={{ background: "var(--plum)", color: "var(--plum-text)" }}
            >
              3256
            </span>
            <span className="font-medium tracking-tight">Batteries</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => {
              const active = isActive(n.href, pathname);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="eyebrow px-2.5 py-2 rounded-md whitespace-nowrap"
                  style={{
                    color: active ? "var(--purple-dark)" : "var(--muted)",
                    background: active ? "var(--purple-soft)" : "transparent",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {canSearch && (
              <form onSubmit={search} className="hidden md:block">
                <input
                  className="input py-1.5 w-44"
                  style={{ minHeight: 38 }}
                  placeholder="Search…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search batteries"
                  enterKeyHint="search"
                />
              </form>
            )}
            {canSearch && (
              <button
                type="button"
                className="md:hidden flex items-center justify-center w-11 h-11 -mr-1 rounded-full"
                style={{ color: searchOpen || urlQ ? "var(--purple-dark)" : "var(--muted)", background: searchOpen || urlQ ? "var(--purple-soft)" : "transparent" }}
                onClick={() => (searchOpen ? clearSearch() : setSearchOpen(true))}
                aria-label={searchOpen ? "Close search" : "Search batteries"}
                aria-expanded={searchOpen}
              >
                {searchOpen ? (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                )}
              </button>
            )}
            {compPill}
          </div>
        </div>
        {canSearch && searchOpen && (
          <form onSubmit={search} className="md:hidden px-4 pb-2.5 fade-in">
            <div className="relative">
              <input
                ref={mobileInput}
                className="input pr-11"
                placeholder="Search batteries…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search batteries"
                enterKeyHint="search"
                autoCapitalize="none"
              />
              <button
                type="submit"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-md"
                style={{ color: "var(--purple)" }}
                aria-label="Go"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </form>
        )}
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t pb-safe"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
        aria-label="Primary"
      >
        <div className="flex items-stretch px-1">
          {NAV.map((n) => {
            const active = isActive(n.href, pathname);
            return (
              <Link key={n.href} href={n.href} className="tabbar-item" data-active={active} aria-current={active ? "page" : undefined}>
                {n.icon}
                <span>{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
