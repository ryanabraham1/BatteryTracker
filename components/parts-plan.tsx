"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { commitSheet, commitStick } from "@/app/parts-actions";
import { addOrder } from "@/app/fab-actions";
import { isSheet, materialName, type FabLocation, type FabMaterial, type FabPiece } from "@/lib/fab";
import { KIND_LABEL, type FabMachine, type PartKind } from "@/lib/parts";
import { layerName, svgPath, transformLoop, writeDxf, type Loop } from "@/lib/geom";
import { nestSheets, nestSticks, zoneToNest, type SheetPlan, type StickPlan } from "@/lib/nest";
import type { Level } from "@/lib/dfm";
import { fmtLength, fmtRect, type Units } from "@/lib/units";
import { Empty } from "./ui";
import { ErrorText, useFabAction } from "./fab-ui";
import { ConfirmButton } from "./confirm-button";

export interface PlanPart {
  id: string;
  name: string;
  bot: string;
  kind: PartKind;
  design_id: string | null;
  toCut: number;
  material_id: string | null;
  material_text: string;
  length: number | null;
  width: number | null;
  geometry: { loops: Loop[]; width: number; height: number } | null;
  dfm: { level: Level; why: string | null; warns: number; machineId: string | null };
}

interface Group {
  material: FabMaterial;
  parts: PlanPart[];
  sheet?: { plans: SheetPlan[]; tooBig: { id: string; name: string }[]; skippedCutouts: number; machine: FabMachine | null; gap: number };
  stick?: { plans: StickPlan[]; tooBig: { id: string; name: string }[] };
  /** new stock to buy */
  buy: number;
}

export function PartsPlan({
  parts,
  designs,
  materials,
  pieces,
  locations,
  machines,
  gap,
  margin,
  kerf,
  units,
}: {
  parts: PlanPart[];
  designs: { id: string; name: string; copies: number }[];
  materials: FabMaterial[];
  pieces: FabPiece[];
  locations: FabLocation[];
  machines: FabMachine[];
  gap: number;
  margin: number;
  kerf: number;
  units: Units;
}) {
  const [off, setOff] = useState<Set<string>>(new Set()); // designs left out
  const [skip, setSkip] = useState<Set<string>>(new Set()); // parts left out
  const [useWarn, setUseWarn] = useState(true);
  const matById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const locName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  const designName = useMemo(() => new Map(designs.map((d) => [d.id, d.name])), [designs]);
  // where each rack piece is, so the plan says which cart to pull from
  const where = useMemo(() => new Map(pieces.map((p) => [p.id, p.location_id ? (locName.get(p.location_id) ?? "") : ""])), [pieces, locName]);

  const inScope = parts.filter((p) => !(p.design_id && off.has(p.design_id)));
  const cantMake = inScope.filter((p) => p.dfm.level === "fail");
  const risky = inScope.filter((p) => p.dfm.level === "warn");
  const noMaterial = inScope.filter((p) => p.dfm.level !== "fail" && !p.material_id);
  const planned = inScope.filter((p) => p.dfm.level !== "fail" && p.material_id && !skip.has(p.id) && (useWarn || p.dfm.level !== "warn"));

  // (the React Compiler memoises this chain; the nesting only reruns when the scope changes)
  const groups: Group[] = (() => {
    // one group per stock material — and for sheet parts, per machine, so router
    // and xTool parts each get sheets laid out for that machine's bed and bit
    const by = new Map<string, PlanPart[]>();
    for (const p of planned) {
      const mat = matById.get(p.material_id!);
      const key = `${p.material_id}|${mat && isSheet(mat) ? (p.dfm.machineId ?? "") : ""}`;
      const list = by.get(key) ?? [];
      list.push(p);
      by.set(key, list);
    }
    const out: Group[] = [];
    // a piece one group plans to cut isn't offered to the next group
    const taken = new Set<string>();
    for (const [key, ps] of by) {
      const [mid, machineId] = key.split("|");
      const material = matById.get(mid);
      if (!material) continue;
      const stock = pieces.filter((x) => x.material_id === mid && !taken.has(x.id));
      if (isSheet(material)) {
        const machine = machineId ? (machineById.get(machineId) ?? null) : null;
        const g = gap + (machine?.tool_diameter_mm ?? 0);
        const items = ps.flatMap((p) => {
          const w = p.geometry?.width ?? p.width;
          const h = p.geometry?.height ?? p.length;
          if (!w || !h) return [];
          return Array.from({ length: p.toCut }, () => ({ id: p.id, name: p.name, w, h }));
        });
        // part-cut sheets are fine as long as the rack knows where the cuts are
        const clean = stock.filter((s) => s.width_mm && (!s.has_cutouts || s.dead_zones.length > 0));
        const res = nestSheets(
          items,
          clean.map((s) => ({ pieceId: s.id, w: s.width_mm!, l: s.length_mm, zones: s.dead_zones.map(zoneToNest) })),
          {
            gap: g,
            margin,
            bed: machine?.bed_w_mm && machine.bed_l_mm ? { w: machine.bed_w_mm, l: machine.bed_l_mm } : null,
            full: material.full_width_mm && material.full_length_mm ? { w: material.full_width_mm, l: material.full_length_mm } : null,
          },
        );
        for (const sh of res.sheets) if (sh.pieceId) taken.add(sh.pieceId);
        out.push({
          material,
          parts: ps,
          sheet: { plans: res.sheets, tooBig: res.tooBig, skippedCutouts: stock.length - clean.length, machine, gap: g },
          buy: res.sheets.filter((s) => s.pieceId === null).length,
        });
      } else {
        const items = ps.flatMap((p) => (p.length ? Array.from({ length: p.toCut }, () => ({ id: p.id, name: p.name, len: p.length! })) : []));
        const res = nestSticks(
          items,
          stock.map((s) => ({ pieceId: s.id, len: s.length_mm })),
          kerf,
          material.full_length_mm,
        );
        for (const st of res.sticks) if (st.pieceId) taken.add(st.pieceId);
        out.push({ material, parts: ps, stick: { plans: res.sticks, tooBig: res.tooBig }, buy: res.sticks.filter((s) => s.pieceId === null).length });
      }
    }
    return out.sort((a, b) => b.buy - a.buy || materialName(a.material).localeCompare(materialName(b.material)));
  })();

  const totalCopies = planned.reduce((s, p) => s + p.toCut, 0);
  const fromStock = groups.reduce((s, g) => s + (g.sheet?.plans ?? g.stick?.plans ?? []).filter((x) => x.pieceId).length, 0);
  const toBuy = groups.filter((g) => g.buy > 0);
  const project = designs
    .filter((d) => !off.has(d.id) && planned.some((p) => p.design_id === d.id))
    .map((d) => d.name)
    .join(", ");

  if (!parts.length) {
    return (
      <Empty>
        Nothing is waiting on stock. Parts show up here while they&apos;re in the first column(s) of the Plate, Tube &amp; bar or Shaft boards.{" "}
        <Link href="/tracker/board" className="underline" style={{ color: "var(--purple)" }}>
          Open the board →
        </Link>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Scope */}
      <section className="card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="label mb-0">Designs</span>
          {designs.map((d) => (
            <button
              key={d.id}
              type="button"
              className="tile tile-chip text-sm"
              data-selected={!off.has(d.id)}
              onClick={() => setOff((s) => toggle(s, d.id))}
            >
              {d.name}
              {d.copies > 1 && ` ×${d.copies}`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Big label="Parts to cut" value={`${totalCopies}`} sub={`${planned.length} different`} />
          <Big label="From the rack" value={`${fromStock}`} sub="sheets / sticks" tone="good" />
          <Big label="To buy" value={`${toBuy.reduce((s, g) => s + g.buy, 0)}`} sub={toBuy.length ? toBuy.map((g) => g.material.material).join(", ") : "enough on hand"} tone={toBuy.length ? "bad" : "good"} />
          <Big label="Can't make" value={`${cantMake.length}`} sub={noMaterial.length ? `+ ${noMaterial.length} with no stock match` : "with our machines"} tone={cantMake.length ? "bad" : undefined} />
        </div>
        {risky.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useWarn} onChange={(e) => setUseWarn(e.target.checked)} />
            Include {risky.length} part{risky.length > 1 ? "s" : ""} with DFM warnings (sharp corners, small holes…)
          </label>
        )}
      </section>

      {(cantMake.length > 0 || noMaterial.length > 0) && (
        <section className="card p-4 flex flex-col gap-2">
          <h2 className="text-xl font-medium tracking-tight">Needs attention first</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {cantMake.map((p) => (
              <li key={p.id} className="flex gap-2">
                <span className="pill pill-bad shrink-0">Can&apos;t make</span>
                <Link href={`/tracker/${p.id}`} className="underline font-medium">
                  {p.name}
                </Link>
                <span style={{ color: "var(--muted)" }}>{p.dfm.why}</span>
              </li>
            ))}
            {noMaterial.map((p) => (
              <li key={p.id} className="flex gap-2">
                <span className="pill pill-warn shrink-0">No stock</span>
                <Link href={`/tracker/${p.id}`} className="underline font-medium">
                  {p.name}
                </Link>
                <span style={{ color: "var(--muted)" }}>
                  {p.material_text || "No material"} — nothing on the rack matches. Pick one on the part, or{" "}
                  <Link href="/stock/new" className="underline">
                    add the material
                  </Link>
                  .
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) => (
        <MaterialGroup
          key={`${g.material.id}-${g.sheet?.machine?.id ?? ""}`}
          g={g}
          units={units}
          where={where}
          project={project}
          designName={designName}
          margin={margin}
          onSkip={(id) => setSkip((s) => toggle(s, id))}
        />
      ))}

      {skip.size > 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {skip.size} part{skip.size > 1 ? "s" : ""} left out of the plan ·{" "}
          <button type="button" className="underline" onClick={() => setSkip(new Set())}>
            put back
          </button>
        </p>
      )}
    </div>
  );
}

function toggle(s: Set<string>, id: string): Set<string> {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: tone ? `var(--${tone}-soft)` : "var(--paper)" }}>
      <p className="label" style={{ color: tone ? `var(--${tone})` : undefined }}>
        {label}
      </p>
      <p className="mono text-3xl font-semibold">{value}</p>
      <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
        {sub}
      </p>
    </div>
  );
}

function MaterialGroup({
  g,
  units,
  where,
  project,
  designName,
  margin,
  onSkip,
}: {
  g: Group;
  units: Units;
  where: Map<string, string>;
  project: string;
  designName: Map<string, string>;
  margin: number;
  onSkip: (id: string) => void;
}) {
  const m = g.material;
  const buy = useFabAction(addOrder);
  const [ordered, setOrdered] = useState(false);
  const tooBig = g.sheet?.tooBig ?? g.stick?.tooBig ?? [];
  const copies = g.parts.reduce((s, p) => s + p.toCut, 0);
  const geomById = new Map(g.parts.map((p) => [p.id, p.geometry]));
  const noSize = g.parts.filter((p) => (g.sheet ? !(p.geometry || (p.width && p.length)) : !p.length));

  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            {copies} part{copies === 1 ? "" : "s"}
            {g.sheet?.machine && ` · on the ${g.sheet.machine.name}`}
          </p>
          <Link href={`/stock/${m.id}`} className="text-2xl font-medium tracking-tight hover:underline">
            {materialName(m)}
          </Link>
        </div>
        {g.buy > 0 ? (
          <div className="flex flex-col items-end gap-1">
            <span className="pill pill-bad">
              Short · buy {g.buy} {isSheet(m) ? "sheet" : "stick"}
              {g.buy > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              className="btn btn-ghost text-sm"
              disabled={buy.pending || ordered}
              onClick={() => {
                buy.call({ material_id: m.id, quantity: String(g.buy), notes: `Cut plan: ${project}`.slice(0, 200) });
                setOrdered(true);
              }}
            >
              {ordered && !buy.error ? "On the shopping list ✓" : "Add to shopping list"}
            </button>
            <ErrorText error={buy.error} />
          </div>
        ) : (
          <span className="pill pill-good">Enough on the rack</span>
        )}
      </div>

      {tooBig.length > 0 && (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          Too big for any {isSheet(m) ? "sheet or the machine bed" : "stick"}: {[...new Set(tooBig.map((t) => t.name))].join(", ")}
        </p>
      )}
      {noSize.length > 0 && (
        <p className="text-sm" style={{ color: "var(--warn)" }}>
          No size, so not planned: {noSize.map((p) => p.name).join(", ")}
        </p>
      )}
      {!!g.sheet?.skippedCutouts && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {g.sheet.skippedCutouts} sheet{g.sheet.skippedCutouts > 1 ? "s" : ""} marked “has cutouts” with no marked areas left out — mark where the cuts are on the stock page to use them.
        </p>
      )}
      {!m.full_length_mm && g.buy === 0 && tooBig.length > 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Set the full {isSheet(m) ? "sheet" : "stick"} size on the material to see how many to buy.
        </p>
      )}

      <div className={g.sheet ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-2"}>
        {g.sheet?.plans.map((s, i) => (
          <SheetCard key={i} m={m} s={s} n={i + 1} geomById={geomById} units={units} where={where} project={project} margin={margin} gap={g.sheet!.gap} />
        ))}
        {g.stick?.plans.map((s, i) => (
          <StickCard key={i} m={m} s={s} units={units} where={where} project={project} />
        ))}
      </div>

      <details>
        <summary className="text-sm cursor-pointer" style={{ color: "var(--muted)" }}>
          Parts in this plan
        </summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {g.parts.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="mono w-8 text-right">×{p.toCut}</span>
              <Link href={`/tracker/${p.id}`} className="underline min-w-0 truncate">
                {p.name}
              </Link>
              {p.dfm.warns > 0 && <span className="pill pill-warn">check</span>}
              <span className="text-xs truncate" style={{ color: "var(--muted)" }}>
                {p.design_id ? designName.get(p.design_id) : KIND_LABEL[p.kind]}
              </span>
              <button type="button" className="text-xs underline ml-auto shrink-0" onClick={() => onSkip(p.id)}>
                leave out
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

const HUES = [265, 200, 150, 30, 330, 100, 0, 60, 180, 290];

function SheetCard({
  m,
  s,
  n,
  geomById,
  units,
  where,
  project,
  margin,
  gap,
}: {
  m: FabMaterial;
  s: SheetPlan;
  n: number;
  geomById: Map<string, PlanPart["geometry"]>;
  units: Units;
  where: Map<string, string>;
  project: string;
  margin: number;
  gap: number;
}) {
  const commit = useFabAction(commitSheet);
  const ids = [...new Set(s.placements.map((p) => p.id))];
  const hue = (id: string) => HUES[ids.indexOf(id) % HUES.length];
  const counts = ids.map((id) => ({ partId: id, count: s.placements.filter((p) => p.id === id).length }));
  const placed = s.placements.map((p) => {
    const g = geomById.get(p.id);
    const loops = g
      ? g.loops.map((l) => transformLoop(l, p.rotated, g.height, p.x, p.y))
      : [rect(p.x, p.y, p.w, p.h)];
    return { ...p, loops, hasOutline: !!g };
  });
  const missingOutline = placed.filter((p) => !p.hasOutline).length;

  function download() {
    const text = writeDxf([
      { name: "SHEET", loops: [rect(0, 0, s.w, s.l)], color: 8 },
      { name: "OUTSIDE", loops: placed.filter((p) => p.hasOutline).map((p) => p.loops[0]), color: 7 },
      { name: "INSIDE", loops: placed.filter((p) => p.hasOutline).flatMap((p) => p.loops.slice(1)), color: 1 },
      ...(missingOutline ? [{ name: "NO_OUTLINE_BOXES", loops: placed.filter((p) => !p.hasOutline).map((p) => p.loops[0]), color: 2 }] : []),
    ]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/dxf" }));
    a.download = `${layerName(`${m.material}-${fmtRect(s.w, s.l, "in")}`).replace(/\s+/g, "")}-${n}.dxf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  const pad = Math.max(s.w, s.l) * 0.01;
  return (
    <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--paper)", border: s.pieceId ? "1px solid var(--line)" : "1px dashed var(--bad)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {s.pieceId ? `Sheet ${n}` : `New sheet ${n}`} · <span className="mono">{fmtRect(s.w, s.l, units)}</span>
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {s.placements.length} part{s.placements.length > 1 ? "s" : ""} · {Math.round(s.yield * 100)}% used
            {s.pieceId ? ` · ${where.get(s.pieceId) || "on the rack"}` : " · buy this one"}
          </p>
        </div>
      </div>
      <svg viewBox={`${-pad} ${-s.l - pad} ${s.w + 2 * pad} ${s.l + 2 * pad}`} className="w-full max-h-96" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Layout for sheet ${n}`}>
        <g transform="scale(1,-1)">
          <rect x={0} y={0} width={s.w} height={s.l} fill="var(--surface)" stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <rect x={margin} y={margin} width={Math.max(0, s.w - 2 * margin)} height={Math.max(0, s.l - 2 * margin)} fill="none" stroke="var(--line)" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {(s.zones ?? []).map((z, i) => (
            <rect key={`z${i}`} x={z.x} y={z.y} width={z.w} height={z.h} fill="var(--line)" stroke="var(--muted)" strokeWidth={0.8} vectorEffect="non-scaling-stroke">
              <title>Already cut / unusable</title>
            </rect>
          ))}
          {s.remaining.map((r, i) => (
            <rect
              key={i}
              x={r.at.x}
              y={r.at.y}
              width={r.at.w}
              height={r.at.h}
              fill="var(--good-soft)"
              stroke="var(--good)"
              strokeDasharray="6 4"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {placed.map((p, i) => (
            <path
              key={i}
              d={svgPath(p.loops)}
              fillRule="evenodd"
              fill={`hsl(${hue(p.id)} 70% 88%)`}
              stroke={`hsl(${hue(p.id)} 55% 35%)`}
              strokeWidth={1.2}
              strokeDasharray={p.hasOutline ? undefined : "5 3"}
              vectorEffect="non-scaling-stroke"
            >
              <title>{p.name}</title>
            </path>
          ))}
        </g>
      </svg>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {counts.map((c) => (
          <li key={c.partId} className="chip" style={{ background: `hsl(${hue(c.partId)} 70% 92%)`, color: `hsl(${hue(c.partId)} 55% 28%)` }}>
            {c.count}× {s.placements.find((p) => p.id === c.partId)!.name}
          </li>
        ))}
      </ul>
      {s.remaining.length > 0 && (
        <p className="text-xs" style={{ color: "var(--good)" }}>
          Back on the rack: {s.remaining.map((r) => fmtRect(r.w, r.l, units)).join(", ")}
        </p>
      )}
      {missingOutline > 0 && (
        <p className="text-xs" style={{ color: "var(--warn)" }}>
          {missingOutline} placed as a plain box — no outline yet.
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn btn-ghost text-sm" onClick={download}>
          Download DXF
        </button>
        {s.pieceId && (
          <ConfirmButton
            className="btn btn-primary text-sm"
            pending={commit.pending}
            label="Mark cut"
            message={`${s.yield > 0.85 ? "This sheet gets used up" : "The cut areas get marked unusable on this sheet"}, and ${s.placements.length} part${s.placements.length > 1 ? "s" : ""} count as cut. You can undo it from the stock log.`}
            onConfirm={() => commit.call({ plan: JSON.stringify({ pieceId: s.pieceId, w: s.w, l: s.l, placements: s.placements, yield: s.yield, gap, project }) })}
          />
        )}
      </div>
      <ErrorText error={commit.error} />
    </div>
  );
}

function rect(x: number, y: number, w: number, h: number): Loop {
  return {
    segs: [
      { a: [x, y], b: [x + w, y], bulge: 0 },
      { a: [x + w, y], b: [x + w, y + h], bulge: 0 },
      { a: [x + w, y + h], b: [x, y + h], bulge: 0 },
      { a: [x, y + h], b: [x, y], bulge: 0 },
    ],
  };
}

function StickCard({ m, s, units, where, project }: { m: FabMaterial; s: StickPlan; units: Units; where: Map<string, string>; project: string }) {
  const commit = useFabAction(commitStick);
  const ids = [...new Set(s.cuts.map((c) => c.id))];
  const hue = (id: string) => HUES[ids.indexOf(id) % HUES.length];
  return (
    <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--paper)", border: s.pieceId ? "1px solid var(--line)" : "1px dashed var(--bad)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm">
          <span className="font-medium">{s.pieceId ? "Stick" : "New stick"}</span> <span className="mono">{fmtLength(s.len, units)}</span>
          <span style={{ color: "var(--muted)" }}>
            {" "}
            · {s.cuts.length} cut{s.cuts.length > 1 ? "s" : ""} · {fmtLength(s.leftover, units)} left
            {s.pieceId ? ` · ${where.get(s.pieceId) || "on the rack"}` : " · buy this one"}
          </span>
        </p>
        {s.pieceId && (
          <ConfirmButton
            className="btn btn-primary text-sm"
            pending={commit.pending}
            label="Mark cut"
            message={`${s.cuts.length} cut${s.cuts.length > 1 ? "s" : ""} come off this ${fmtLength(s.len, units)} stick, leaving ${fmtLength(s.leftover, units)}. You can undo it from the stock log.`}
            onConfirm={() => commit.call({ plan: JSON.stringify({ pieceId: s.pieceId, len: s.len, cuts: s.cuts.map((c) => ({ partId: c.id, len: c.len })), project }) })}
          />
        )}
      </div>
      <div className="flex h-8 rounded overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--line)" }} aria-label={`${materialName(m)} cut layout`}>
        {s.cuts.map((c, i) => (
          <div
            key={i}
            className="h-full flex items-center justify-center text-[10px] mono truncate px-1"
            style={{ width: `${(c.len / s.len) * 100}%`, background: `hsl(${hue(c.id)} 70% 88%)`, color: `hsl(${hue(c.id)} 55% 28%)`, borderRight: "2px solid var(--ink)" }}
            title={`${c.name} · ${fmtLength(c.len, units)}`}
          >
            {c.name}
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {s.cuts.map((c, i) => (
          <li key={i} className="chip">
            {fmtLength(c.len, units)} {c.name}
          </li>
        ))}
      </ul>
      <ErrorText error={commit.error} />
    </div>
  );
}
