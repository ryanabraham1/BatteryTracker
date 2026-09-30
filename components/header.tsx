"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCompMode } from "./comp-mode";

type NavItem = { href: string; label: string; icon: React.ReactNode };

const SETTINGS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

const BATTERY_NAV: NavItem[] = [
  {
    href: "/battery",
    label: "Board",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="7" height="16" rx="1.5" />
        <rect x="14" y="4" width="7" height="9" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/battery/log",
    label: "Log",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 6h16M4 12h10M4 18h13" />
      </svg>
    ),
  },
  {
    href: "/battery/batteries",
    label: "Batteries",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="7" width="17" height="10" rx="2" />
        <path d="M22 10v4M6 11v2M10 11v2" />
      </svg>
    ),
  },
  {
    href: "/battery/comp",
    label: "Comp",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
    ),
  },
  {
    href: "/battery/settings",
    label: "Settings",
    icon: SETTINGS_ICON,
  },
];

/** Fab stock app tabs. */
const STOCK_NAV: NavItem[] = [
  {
    href: "/stock",
    label: "Rack",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="4" rx="1" />
        <rect x="3" y="10" width="13" height="4" rx="1" />
        <rect x="3" y="16" width="8" height="4" rx="1" />
      </svg>
    ),
  },
  {
    href: "/stock/shopping",
    label: "Shopping",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.5L21 8H6" />
      </svg>
    ),
  },
  {
    href: "/stock/log",
    label: "Log",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 6h16M4 12h10M4 18h13" />
      </svg>
    ),
  },
  {
    href: "/stock/kit",
    label: "Pit kit",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="8" width="20" height="12" rx="2" />
        <path d="M8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M2 13h20" />
      </svg>
    ),
  },
  { href: "/stock/setup", label: "Setup", icon: SETTINGS_ICON },
];

/** Parts app tabs: the build boards, the cut planner, Onshape designs, machines. */
const PARTS_NAV: NavItem[] = [
  {
    href: "/parts",
    label: "Board",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="11" rx="1" />
        <rect x="17" y="4" width="4" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/parts/plan",
    label: "Cut plan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="1.5" />
        <rect x="6" y="6" width="6" height="5" rx="0.5" />
        <circle cx="16" cy="9" r="2" />
        <rect x="6" y="14" width="11" height="4" rx="0.5" />
      </svg>
    ),
  },
  {
    href: "/parts/designs",
    label: "Designs",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2l9 5v10l-9 5-9-5V7z" />
        <path d="M12 12l9-5M12 12v10M12 12L3 7" />
      </svg>
    ),
  },
  { href: "/parts/machines", label: "Machines", icon: SETTINGS_ICON },
];

/** Fab tracker tabs: the team's Machining and 3D Printing tracker sheets. */
const TRACKER_NAV: NavItem[] = [
  {
    href: "/tracker",
    label: "Machining",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 11l2 2 4-4" />
        <path d="M4 6h1M4 12h1M4 18h1M9 18h11M9 6h11" />
      </svg>
    ),
  },
  {
    href: "/tracker/print",
    label: "3D printing",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="6" rx="1" />
        <path d="M12 9v4M9 13h6l-1 3h-4zM5 21h14" />
      </svg>
    ),
  },
];

const SEARCHABLE = ["/battery", "/battery/batteries", "/stock", "/parts"];

/** The first tab of each app (board / rack) is exact, so it doesn't light up for the other tabs. */
const SUBPAGES: Record<string, RegExp> = {
  "/battery": /^\/battery\/./,
  "/stock": /^\/stock\/(log|shopping|kit|setup)(\/|$)/,
  "/parts": /^\/parts\/(plan|designs|machines)(\/|$)/,
  "/tracker": /^\/tracker\/./,
};

function isActive(href: string, pathname: string) {
  const sub = SUBPAGES[href];
  // The rack / board tab also covers material and part pages (/stock/<id>, /parts/<id>), but not the other tabs.
  if (sub) return pathname === href || ((href === "/stock" || href === "/parts") && pathname.startsWith(`${href}/`) && !sub.test(pathname));
  return pathname === href || pathname.startsWith(`${href}/`);
}

const isStockPath = (pathname: string) => pathname === "/stock" || pathname.startsWith("/stock/");
const isPartsPath = (pathname: string) => pathname === "/parts" || pathname.startsWith("/parts/");
const isTrackerPath = (pathname: string) => pathname === "/tracker" || pathname.startsWith("/tracker/");

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

  const home = pathname === "/";
  const stockApp = isStockPath(pathname);
  const partsApp = isPartsPath(pathname);
  const trackerApp = isTrackerPath(pathname);
  const batteryApp = !home && !stockApp && !partsApp && !trackerApp;
  const NAV = home ? [] : stockApp ? STOCK_NAV : partsApp ? PARTS_NAV : trackerApp ? TRACKER_NAV : BATTERY_NAV;
  const canSearch = SEARCHABLE.includes(pathname) || pathname.startsWith("/battery/batteries/");
  const searchTarget = stockApp ? "/stock" : partsApp ? "/parts" : pathname.startsWith("/battery/batteries") ? "/battery/batteries" : "/battery";
  const searchWhat = stockApp ? "stock" : partsApp ? "parts" : "batteries";

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
          <div className="flex items-center gap-2 shrink-0 min-h-[44px]">
            {/* Home: the 3256 Tools dashboard */}
            <Link href="/" className="flex items-center gap-2 min-h-[44px]" aria-label="3256 Tools home" aria-current={home ? "page" : undefined}>
              <span className="eyebrow px-2 py-1 rounded-md" style={{ background: "var(--plum)", color: "var(--plum-text)" }}>
                3256
              </span>
              <span className={`font-medium tracking-tight ${home ? "" : "hidden lg:inline"}`}>Tools</span>
            </Link>
            {/* App switcher: batteries ↔ fab stock */}
            <nav className="inline-flex rounded-lg p-0.5" style={{ background: "var(--paper)", border: "1px solid var(--line)" }} aria-label="App">
              {(
                [
                  ["/battery", "Batteries", "Batteries", batteryApp],
                  ["/stock", "Fab stock", "Stock", stockApp],
                  ["/tracker", "Tracker", "Track", trackerApp],
                  ["/parts", "Parts", "Parts", partsApp],
                ] as const
              ).map(([href, label, short, on]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-md px-2.5 flex items-center text-sm font-medium tracking-tight whitespace-nowrap"
                  style={{ minHeight: 36, background: on ? "var(--plum)" : "transparent", color: on ? "#fff" : "var(--muted)" }}
                  aria-current={on ? "page" : undefined}
                >
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{short}</span>
                </Link>
              ))}
            </nav>
          </div>

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
                  aria-label={`Search ${searchWhat}`}
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
                aria-label={searchOpen ? "Close search" : `Search ${searchWhat}`}
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
                placeholder={stockApp ? "2x1, 1/4 poly, hex…" : partsApp ? "Search parts…" : "Search batteries…"}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={`Search ${searchWhat}`}
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

      {/* Mobile bottom tab bar (the home dashboard has none) */}
      {NAV.length > 0 && (
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
      )}
    </>
  );
}
