"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCompMode } from "./comp-mode";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Board" },
  { href: "/log", label: "Log" },
  { href: "/batteries", label: "Batteries" },
  { href: "/comp", label: "Comp" },
  { href: "/settings", label: "Settings" },
];

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

  function search(e: FormEvent) {
    e.preventDefault();
    const target = pathname.startsWith("/batteries") ? "/batteries" : "/";
    router.push(q ? `${target}?q=${encodeURIComponent(q)}` : target);
  }

  return (
    <header className="sticky top-0 z-30 border-b" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-[1400px] px-4 py-2.5 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span
            className="eyebrow px-2 py-1 rounded-md"
            style={{ background: "var(--plum)", color: "var(--plum-text)" }}
          >
            3256
          </span>
          <span className="font-medium tracking-tight hidden sm:inline">Batteries</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className="eyebrow px-2.5 py-1.5 rounded-md whitespace-nowrap"
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
          <form onSubmit={search} className="hidden md:block">
            <input
              className="input py-1.5 text-sm w-40"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search batteries"
            />
          </form>
          <button
            type="button"
            onClick={() => setCompMode(!compMode)}
            className="pill"
            style={
              compMode
                ? { background: "var(--purple)", color: "#fff" }
                : { background: "var(--paper)", color: "var(--muted)", border: "1px solid var(--line)" }
            }
            title="Competition mode"
          >
            {compMode ? `Comp${matchLabel ? ` · ${matchLabel}` : ""}` : "Comp off"}
          </button>
        </div>
      </div>
      <form onSubmit={search} className="md:hidden px-4 pb-2">
        <input
          className="input py-1.5 text-sm"
          placeholder="Search batteries…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search batteries"
        />
      </form>
    </header>
  );
}
