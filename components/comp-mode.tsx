"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

interface CompCtx {
  compMode: boolean;
  matchLabel: string;
  setCompMode: (v: boolean) => void;
  setMatchLabel: (v: string) => void;
  hydrated: boolean;
}

const Ctx = createContext<CompCtx>({
  compMode: false,
  matchLabel: "",
  setCompMode: () => {},
  setMatchLabel: () => {},
  hydrated: false,
});

const KEY = "bt_comp";

function readStored(): { compMode: boolean; matchLabel: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as { compMode?: boolean; matchLabel?: string };
      return { compMode: !!j.compMode, matchLabel: j.matchLabel ?? "" };
    }
  } catch {}
  return { compMode: false, matchLabel: "" };
}

const noop = () => () => {};

export function CompModeProvider({ children }: { children: ReactNode }) {
  // true once we're on the client (localStorage is readable)
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [stored, setStored] = useState<{ compMode: boolean; matchLabel: string } | null>(null);
  const effective = stored ?? (hydrated ? readStored() : { compMode: false, matchLabel: "" });
  const compMode = effective.compMode;
  const matchLabel = effective.matchLabel;

  const persist = useCallback((c: boolean, m: string) => {
    setStored({ compMode: c, matchLabel: m });
    try {
      localStorage.setItem(KEY, JSON.stringify({ compMode: c, matchLabel: m }));
    } catch {}
  }, []);

  const value = useMemo<CompCtx>(
    () => ({
      compMode,
      matchLabel,
      hydrated,
      setCompMode: (v) => persist(v, matchLabel),
      setMatchLabel: (v) => persist(compMode, v),
    }),
    [compMode, matchLabel, hydrated, persist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompMode() {
  return useContext(Ctx);
}
