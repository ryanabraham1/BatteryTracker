"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BatteryWithHealth } from "@/lib/health";
import { fmtNum, timeAgo } from "@/lib/format";
import type { BatteryStatus } from "@/lib/types";
import { HealthPill, StatePill, StatusPill } from "./ui";
import { useNow } from "./board";

type SortKey = "name" | "health" | "state" | "cycles" | "beak" | "cba";
type Filter = "all" | BatteryStatus;

export function BatteriesTable({ items }: { items: BatteryWithHealth[] }) {
  const sp = useSearchParams();
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<1 | -1>(1);

  const rows = useMemo(() => {
    let list = items;
    if (filter !== "all") list = list.filter((i) => i.battery.status === filter);
    if (q) list = list.filter((i) => i.battery.name.toLowerCase().includes(q));
    const val = (i: BatteryWithHealth): string | number => {
      switch (sort) {
        case "name":
          return i.battery.name.toLowerCase();
        case "health":
          return i.health.score ?? -1;
        case "state":
          return i.battery.state;
        case "cycles":
          return i.battery.cycle_count;
        case "beak":
          return i.health.latestBeak?.at ?? "";
        case "cba":
          return i.health.latestCba?.at ?? "";
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }, [items, filter, q, sort, dir]);

  function th(key: SortKey, label: string, className = "") {
    const active = sort === key;
    return (
      <th className={`text-left px-3 py-2 ${className}`}>
        <button
          type="button"
          className="eyebrow"
          style={{ color: active ? "var(--purple-dark)" : "var(--muted)" }}
          onClick={() => {
            if (active) setDir(dir === 1 ? -1 : 1);
            else {
              setSort(key);
              setDir(key === "health" || key === "cycles" ? -1 : 1);
            }
          }}
        >
          {label}
          {active ? (dir === 1 ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  const counts = {
    all: items.length,
    active: items.filter((i) => i.battery.status === "active").length,
    practice_only: items.filter((i) => i.battery.status === "practice_only").length,
    retired: items.filter((i) => i.battery.status === "retired").length,
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-3">
        {(
          [
            ["all", "All"],
            ["active", "Active"],
            ["practice_only", "Practice-only"],
            ["retired", "Retired"],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" className="tile py-1.5 px-3 text-sm" data-selected={filter === k} onClick={() => setFilter(k)}>
            {label} <span className="mono text-xs" style={{ color: "var(--muted)" }}>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead style={{ borderBottom: "1px solid var(--line)" }}>
            <tr>
              {th("name", "Name")}
              {th("health", "Health")}
              <th className="text-left px-3 py-2 eyebrow" style={{ color: "var(--muted)" }}>Status</th>
              {th("state", "State")}
              {th("cycles", "Cycles")}
              {th("beak", "Last Beak")}
              {th("cba", "Last CBA")}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ battery: b, health: h }) => (
              <tr key={b.id} className="hover:bg-[var(--purple-soft)]" style={{ borderBottom: "1px solid var(--line)" }}>
                <td className="px-3 py-2.5">
                  <Link href={`/batteries/${encodeURIComponent(b.name)}`} className="display text-xl">
                    {b.name}
                  </Link>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{b.brand_model || "—"} · {b.capacity_ah} Ah</div>
                </td>
                <td className="px-3 py-2.5"><HealthPill badge={h.badge} score={h.score} /></td>
                <td className="px-3 py-2.5"><StatusPill status={b.status} /></td>
                <td className="px-3 py-2.5"><StatePill state={b.state} /></td>
                <td className="px-3 py-2.5 mono">{b.cycle_count}</td>
                <td className="px-3 py-2.5 mono text-xs">
                  {h.latestBeak ? (
                    <>
                      {fmtNum(h.latestBeak.voltage, 2)} V · {fmtNum(h.latestBeak.internal_resistance_mohm)} mΩ
                      <div style={{ color: "var(--muted)" }}>{timeAgo(h.latestBeak.at, now)}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 mono text-xs">
                  {h.latestCba ? (
                    <>
                      {fmtNum(h.latestCba.measured_ah, 2)} Ah ({Math.round(h.latestCba.pct)}%)
                      <div style={{ color: "var(--muted)" }}>{timeAgo(h.latestCba.at, now)}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No batteries match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
