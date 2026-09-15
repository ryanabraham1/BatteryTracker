"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

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

export function CompModeProvider({ children }: { children: ReactNode }) {
  // Server and first client render agree on the defaults; localStorage is
  // read after mount so hydration never mismatches.
  const [stored, setStored] = useState<{ compMode: boolean; matchLabel: string } | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external store
    setStored(readStored());
  }, []);
  const hydrated = stored !== null;
  const { compMode, matchLabel } = stored ?? { compMode: false, matchLabel: "" };

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

const subscribeNoop = () => () => {};

/**
 * Comp state, masked to the defaults until *this* component has hydrated.
 * Consumers can sit in Suspense boundaries that hydrate after the provider's
 * effect has already read localStorage; without the mask they'd mismatch.
 */
export function useCompMode(): CompCtx {
  const ctx = useContext(Ctx);
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  if (mounted) return ctx;
  return { ...ctx, compMode: false, matchLabel: "", hydrated: false };
}
