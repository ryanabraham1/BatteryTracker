"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fmtAmount,
  fmtPiece,
  isSheet,
  materialName,
  SHAPE_GROUP,
  SHAPE_LABEL,
  sizeLabel,
  summarize,
  type FabLocation,
  type FabMaterial,
  type FabOrder,
  type FabPiece,
  type ShapeGroup,
} from "@/lib/fab";
import type { Units } from "@/lib/units";
import { useCompMode } from "./comp-mode";
import { Empty } from "./ui";

type Filter = "all" | ShapeGroup | "low";

export function FabRack({
  materials,
  pieces,
  orders,
  locations,
  units,
}: {
  materials: FabMaterial[];
  pieces: FabPiece[];
  orders: FabOrder[];
  locations: FabLocation[];
  units: Units;
}) {
  const sp = useSearchParams();
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const { compMode } = useCompMode();
  const [filter, setFilter] = useState<Filter>("all");
  // In comp mode the rack starts on what's in the pit; either way it can be flipped.
  const [pitOverride, setPitOverride] = useState<boolean | null>(null);
  const pitOnly = pitOverride ?? compMode;

  const pitIds = useMemo(() => new Set(locations.filter((l) => l.kind === "pit").map((l) => l.id)), [locations]);
  const locName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  // Low stock is about everything on hand, even when the view is narrowed to the pit.
  const lowIds = useMemo(() => new Set(summarize(materials, pieces).filter((r) => r.low).map((r) => r.material.id)), [materials, pieces]);

  const rows = useMemo(() => {
    const visiblePieces = pitOnly ? pieces.filter((p) => p.location_id && pitIds.has(p.location_id)) : pieces;
    let list = summarize(materials, visiblePieces, orders).map((r) => ({ ...r, low: lowIds.has(r.material.id) }));
    if (pitOnly) list = list.filter((r) => r.pieces.length > 0);
    if (filter === "low") list = list.filter((r) => r.low);
    else if (filter !== "all") list = list.filter((r) => SHAPE_GROUP[r.material.shape] === filter);
    if (q) {
      // "2x1" and "2×1" should both match; so should "1/4 poly"
      const norm = (s: string) => s.toLowerCase().replace(/×/g, "x").replace(/"/g, "");
      const terms = norm(q).split(/\s+/).filter(Boolean);
      list = list.filter((r) => {
        const hay = norm(`${materialName(r.material)} ${r.material.vendor} ${r.material.vendor_part} ${r.material.notes}`);
        return terms.every((t) => hay.includes(t));
      });
    }
    return list;
  }, [materials, pieces, orders, pitOnly, pitIds, lowIds, filter, q]);

  const lowCount = lowIds.size;
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "tube", label: "Tube" },
    { value: "bar", label: "Bar · angle" },
    { value: "shaft", label: "Rod · hex" },
    { value: "sheet", label: "Sheet" },
    { value: "low", label: `Low${lowCount ? ` · ${lowCount}` : ""}` },
  ];

  return (
    <>
      <div className="hscroll no-scrollbar mb-4 pb-1">
        {filters.map((f) => (
          <button key={f.value} type="button" className="tile tile-chip text-sm" data-selected={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
        <button
          type="button"
          className="tile tile-chip text-sm"
          data-selected={pitOnly}
          onClick={() => setPitOverride(!pitOnly)}
          title="Only show pieces in pit locations"
        >
          {pitOnly ? "Pit only ✓" : "Pit only"}
        </button>
      </div>

      {q && (
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Matching “{q}” · <Link href="/stock" className="underline">clear</Link>
        </p>
      )}

      {rows.length === 0 ? (
        <Empty>
          {materials.length === 0 ? (
            <>
              No materials yet. <Link href="/stock/new" className="underline" style={{ color: "var(--purple)" }}>Add the first one</Link> — e.g. 2×1 box tube.
            </>
          ) : pitOnly ? (
            "Nothing in the pit locations. Move pieces to the pit cart from a material's page."
          ) : (
            "Nothing matches."
          )}
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const m = r.material;
            const byLoc = new Map<string, number>();
            for (const p of r.pieces) {
              const k = p.location_id ? (locName.get(p.location_id) ?? "—") : "No location";
              byLoc.set(k, (byLoc.get(k) ?? 0) + 1);
            }
            return (
              <Link key={m.id} href={`/stock/${m.id}`} className="card p-4 flex flex-col gap-2 hover:border-[var(--purple)] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="eyebrow" style={{ color: "var(--muted)" }}>
                      {m.material} · {SHAPE_LABEL[m.shape]}
                    </p>
                    <p className="text-xl font-medium tracking-tight leading-tight mt-0.5">{sizeLabel(m)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {r.low && <span className="pill pill-bad">Low</span>}
                    {r.openOrders > 0 && <span className="pill pill-warn">On order</span>}
                  </div>
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="mono text-2xl font-semibold">{r.pieces.length ? fmtAmount(m, r.total, units) : "—"}</span>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>
                    {r.pieces.length} {r.pieces.length === 1 ? "piece" : "pieces"}
                    {r.fullCount > 0 && ` · ${r.fullCount} full`}
                  </span>
                </div>
                {r.pieces.length > 0 && (
                  <p className="mono text-xs" style={{ color: "var(--muted)" }}>
                    {isSheet(m) ? "Biggest" : "Longest"}: {fmtPiece(m, r.pieces[0], units)}
                  </p>
                )}
                {byLoc.size > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {[...byLoc].map(([name, n]) => (
                      <span key={name} className="chip">
                        {name} · {n}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
