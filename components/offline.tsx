"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ACTIONS, fromFields, impliedState, toFields, type ActionName, type OutboxEntry } from "@/lib/offline-actions";
import type { BatteryState } from "@/lib/types";

/**
 * Offline support for a pit with bad Wi-Fi.
 *
 *  - `offline` flips on from the browser's offline event, a failed action, or
 *    a failed ping; a 3 s HEAD poll to /api/ping flips it back.
 *  - While offline, forms drop their action into a localStorage outbox instead
 *    of calling the server. The outbox replays in order on reconnect.
 *  - `pendingState(batteryId)` gives the board the state a queued action will
 *    produce so cards move immediately instead of after reconnect.
 */

const KEY = "bt_outbox";
const PING = "/api/ping";

interface OfflineCtx {
  offline: boolean;
  outbox: OutboxEntry[];
  /** Last server-side rejection during replay (the entry is dropped). */
  replayError: string | null;
  /**
   * Run a registered action, or queue it when offline. A network failure
   * mid-flight also queues it and flips the app offline. Resolves
   * `{ ok: true, queued: true }` when parked.
   */
  run: <N extends ActionName>(name: N, batteryId: string, fd: FormData) => Promise<RunResult<N>>;
  pendingState: (batteryId: string, current: BatteryState) => BatteryState | null;
  dismissError: () => void;
}

type Awaited_<N extends ActionName> = Awaited<ReturnType<(typeof ACTIONS)[N]>>;
export type RunResult<N extends ActionName> = Awaited_<N> | { ok: true; queued: true; data?: undefined };

const Ctx = createContext<OfflineCtx>({
  offline: false,
  outbox: [],
  replayError: null,
  run: async () => ({ ok: false, error: "Offline provider missing" }) as never,
  pendingState: () => null,
  dismissError: () => {},
});

function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}
function writeOutbox(list: OutboxEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

/** Only a TypeError from fetch means "no network"; anything else is a real error. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /fetch|network|Load failed/i.test(e.message));
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [replayError, setReplayError] = useState<string | null>(null);
  const draining = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate outbox + initial connectivity after mount (never on the server).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of external stores
    setOutbox(readOutbox());
    if (typeof navigator !== "undefined" && !navigator.onLine) setOffline(true);
  }, []);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      let list = readOutbox();
      while (list.length) {
        const e = list[0];
        let r: { ok: boolean; error?: string };
        try {
          r = await ACTIONS[e.name](e.batteryId, fromFields(e.fields));
        } catch (err) {
          if (isNetworkError(err)) {
            setOffline(true);
            return; // still offline — keep the entry, try again later
          }
          r = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
        if (!r.ok) setReplayError(`${e.name} for a queued change was rejected: ${r.error}`);
        list = list.slice(1);
        writeOutbox(list);
        setOutbox(list);
      }
      router.refresh();
    } finally {
      draining.current = false;
    }
  }, [router]);

  // Poll while offline; drain when we're back.
  useEffect(() => {
    if (!offline) {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (readOutbox().length) void drain();
      return;
    }
    let cancelled = false;
    const ping = async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 2500);
        const res = await fetch(PING, {
          method: "HEAD",
          cache: "no-store",
          signal: ctl.signal,
        });
        clearTimeout(t);
        if (res.ok && !cancelled) {
          setOffline(false);
          return;
        }
      } catch {}
      if (!cancelled) pollTimer.current = setTimeout(ping, 3000);
    };
    pollTimer.current = setTimeout(ping, 1000);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [offline, drain]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const enqueue = useCallback((name: ActionName, batteryId: string, fd: FormData) => {
    const entry: OutboxEntry = {
      id: crypto.randomUUID(),
      name,
      batteryId,
      fields: toFields(fd),
      queuedAt: new Date().toISOString(),
    };
    const list = [...readOutbox(), entry];
    writeOutbox(list);
    setOutbox(list);
    setOffline(true);
  }, []);

  const run = useCallback(
    async <N extends ActionName>(name: N, batteryId: string, fd: FormData): Promise<RunResult<N>> => {
      const queued = { ok: true as const, queued: true as const };
      if (offline || (typeof navigator !== "undefined" && !navigator.onLine)) {
        enqueue(name, batteryId, fd);
        return queued;
      }
      try {
        return (await ACTIONS[name](batteryId, fd)) as Awaited_<N>;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        enqueue(name, batteryId, fd);
        return queued;
      }
    },
    [offline, enqueue],
  );

  const pendingState = useCallback<OfflineCtx["pendingState"]>(
    (batteryId, current) => {
      let state: BatteryState | null = null;
      for (const e of outbox) {
        if (e.batteryId !== batteryId) continue;
        const next = impliedState(e, state ?? current);
        if (next) state = next;
      }
      return state;
    },
    [outbox],
  );

  const value = useMemo<OfflineCtx>(
    () => ({
      offline,
      outbox,
      replayError,
      run,
      pendingState,
      dismissError: () => setReplayError(null),
    }),
    [offline, outbox, replayError, run, pendingState],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const subscribeNoop = () => () => {};

/** Offline state, masked to "online, empty" until this component has hydrated. */
export function useOffline(): OfflineCtx {
  const ctx = useContext(Ctx);
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  if (mounted) return ctx;
  return { ...ctx, offline: false, outbox: [], replayError: null };
}

/** Sticky banner under the header: offline status + queued-change count. */
export function OfflineBanner() {
  const { offline, outbox, replayError, dismissError } = useOffline();
  if (!offline && outbox.length === 0 && !replayError) return null;
  const tone = replayError ? "bad" : offline ? "warn" : "info";
  return (
    <div
      role="status"
      className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 px-4 py-2 text-sm flex items-center gap-3 border-b"
      style={{
        background: `var(--${tone}-soft)`,
        color: `var(--${tone})`,
        borderColor: `var(--${tone})`,
      }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${tone})` }} />
      <span className="flex-1 min-w-0 truncate">
        {replayError
          ? replayError
          : offline
            ? `Offline — ${outbox.length ? `${outbox.length} change${outbox.length === 1 ? "" : "s"} queued, will send on reconnect` : "changes will be queued"}`
            : `Back online — sending ${outbox.length} queued change${outbox.length === 1 ? "" : "s"}…`}
      </span>
      {replayError && (
        <button type="button" className="eyebrow shrink-0" onClick={dismissError}>
          Dismiss
        </button>
      )}
    </div>
  );
}

/** Registers the service worker that caches the app shell for offline reloads. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
