"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { brownout } from "@/app/actions";
import { sortReady, type BatteryWithHealth } from "@/lib/health";
import { STATES, STATE_LABEL, STATE_TONE, type BatteryState, type Settings } from "@/lib/types";
import { BatteryActionSheet, useBatteryActions } from "./battery-actions";
import { BatteryCard, restRemaining } from "./battery-card";
import { useCompMode } from "./comp-mode";
import { Empty } from "./ui";

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Board({ items, settings }: { items: BatteryWithHealth[]; settings: Settings }) {
  const sp = useSearchParams();
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const now = useNow();
  const actions = useBatteryActions();
  const { compMode, matchLabel } = useCompMode();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const live = items.filter((i) => i.battery.status !== "retired");
    const filtered = q ? live.filter((i) => i.battery.name.toLowerCase().includes(q)) : live;
    const by: Record<BatteryState, BatteryWithHealth[]> = {
      ready: [],
      in_robot: [],
      cooling: [],
      charging: [],
      needs_attention: [],
    };
    for (const i of filtered) by[i.battery.state].push(i);
    // recompute rest with the live clock so ordering updates as time passes
    by.ready = sortReady(
      by.ready.map((i) => ({ ...i, health: { ...i.health, restRemainingMin: restRemaining(i, now) } })),
    );
    for (const s of STATES) if (s !== "ready") by[s].sort((a, b) => a.battery.state_changed_at.localeCompare(b.battery.state_changed_at));
    return by;
  }, [items, q, now]);

  const grabId = columns.ready.find((i) => i.battery.status === "active" && restRemaining(i, now) === 0)?.battery.id
    ?? columns.ready[0]?.battery.id;

  function doBrownout(id: string) {
    setBusyId(id);
    start(async () => {
      await brownout(id, matchLabel || undefined);
      setBusyId(null);
    });
  }

  if (items.length === 0) {
    return (
      <Empty>
        No batteries yet.{" "}
        <Link href="/batteries/new" className="underline" style={{ color: "var(--purple)" }}>
          Add the first one →
        </Link>
      </Empty>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {STATES.map((state) => {
          const list = columns[state];
          return (
            <section key={state} className="min-w-0">
              <header className="flex items-center justify-between mb-2 px-0.5">
                <h2 className="eyebrow flex items-center gap-2" style={{ color: `var(--${STATE_TONE[state]})` }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: `var(--${STATE_TONE[state]})` }} />
                  {STATE_LABEL[state]}
                </h2>
                <span className="mono text-xs font-semibold" style={{ color: "var(--muted)" }}>
                  {list.length}
                </span>
              </header>
              <div className="flex flex-col gap-2">
                {list.length === 0 && (
                  <div className="rounded-[10px] border border-dashed p-4 text-center text-xs" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                    {state === "ready" ? "Nothing ready" : "—"}
                  </div>
                )}
                {list.map((item) => (
                  <BatteryCard
                    key={item.battery.id}
                    item={item}
                    now={now}
                    grab={state === "ready" && item.battery.id === grabId}
                    onClick={() => actions.open(item.battery)}
                    extra={
                      compMode && state === "in_robot" ? (
                        <button
                          type="button"
                          className="btn btn-danger w-full py-2.5 text-sm"
                          disabled={pending && busyId === item.battery.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            doBrownout(item.battery.id);
                          }}
                        >
                          {busyId === item.battery.id ? "Logging…" : "⚡ Brownout"}
                        </button>
                      ) : null
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-xs" style={{ color: "var(--muted)" }}>
        Ready is sorted best-first (health, then longest rested). Rest window {settings.min_rest_after_charge_min}m after charge.
      </p>
      <BatteryActionSheet
        battery={actions.battery}
        view={actions.view}
        onClose={actions.close}
        onView={actions.setView}
      />
    </>
  );
}
