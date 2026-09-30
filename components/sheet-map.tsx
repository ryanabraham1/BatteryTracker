"use client";

import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { clipZones, freeRects, type Zone } from "@/lib/fab";
import { fmtLength, fmtRect, MM_PER_IN, type Units } from "@/lib/units";
import { LengthInput } from "./fab-ui";

/** Drawn zones snap to ¼" or 5 mm so a sloppy drag still reads as a clean size. */
const snapFor = (u: Units) => (u === "in" ? MM_PER_IN / 4 : 5);
const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Hatch fill shared by the map and the thumbnails. */
function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
      <rect width="10" height="10" fill={color} fillOpacity="0.16" />
      <line x1="0" y1="0" x2="0" y2="10" stroke={color} strokeWidth="4" strokeOpacity="0.55" />
    </pattern>
  );
}

/**
 * A sheet drawn to scale — length across, width down — with its unusable
 * areas hatched. Drag on it to mark an area; tap one to size or remove it.
 * `locked` zones are shown but can't be changed (what was already marked,
 * while logging a new cut).
 */
export function SheetMap({
  length,
  width,
  zones,
  locked = [],
  onChange,
  units,
}: {
  length: number;
  width: number;
  zones: Zone[];
  locked?: Zone[];
  onChange: (z: Zone[]) => void;
  units: Units;
}) {
  const hatch = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  // bump to reset the size fields after a drag or delete changes the selection
  const [ver, setVer] = useState(0);
  const step = snapFor(units);
  const L = length;
  const W = width;
  // stroke widths in sheet mm, so they read the same on any sheet size
  const px = Math.max(L, W) / 400;

  const clean = useMemo(() => freeRects({ length_mm: L, width_mm: W, dead_zones: [...locked, ...zones] })[0], [L, W, locked, zones]);

  function toSheet(e: PointerEvent): { x: number; y: number } {
    // screen → sheet mm through the SVG's own transform (handles letterboxing)
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const { x, y } = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: Math.min(L, Math.max(0, snap(x, step))), y: Math.min(W, Math.max(0, snap(y, step))) };
  }

  function down(e: PointerEvent<SVGSVGElement>) {
    if ((e.target as Element).getAttribute("data-zone")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSheet(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = toSheet(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  }
  function up() {
    if (!drag) return;
    const z = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
    setDrag(null);
    if (z.w < step / 2 || z.h < step / 2) {
      setSel(null); // a tap on empty sheet just deselects
      return;
    }
    onChange([...zones, z]);
    setSel(zones.length);
    setVer((v) => v + 1);
  }

  function update(i: number, patch: Partial<Zone>) {
    onChange(zones.map((z, k) => (k === i ? (clipZones([{ ...z, ...patch }], L, W)[0] ?? z) : z)));
  }
  function remove(i: number) {
    onChange(zones.filter((_, k) => k !== i));
    setSel(null);
    setVer((v) => v + 1);
  }
  function addBySize() {
    const z = { x: 0, y: 0, w: Math.min(L, snap(L / 4, step) || step), h: Math.min(W, snap(W / 4, step) || step) };
    onChange([...zones, z]);
    setSel(zones.length);
    setVer((v) => v + 1);
  }

  const preview = drag && { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
  const selected = sel !== null ? zones[sel] : null;
  // grid every 6" / 100 mm
  const g = units === "in" ? 6 * MM_PER_IN : 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs mono" style={{ color: "var(--muted)" }}>
        <span>Length {fmtLength(L, units)} →</span>
        <span>↓ Width {fmtLength(W, units)}</span>
      </div>
      <svg
        ref={svg}
        viewBox={`${-px * 2} ${-px * 2} ${L + px * 4} ${W + px * 4}`}
        className="w-full rounded-lg select-none"
        style={{ touchAction: "none", background: "var(--paper)", cursor: "crosshair", maxHeight: 320 }}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        role="img"
        aria-label={`Sheet ${fmtRect(W, L, units)} with ${zones.length + locked.length} unusable areas`}
      >
        <defs>
          <Hatch id={`${hatch}-bad`} color="var(--bad)" />
          <Hatch id={`${hatch}-old`} color="var(--muted)" />
        </defs>
        <rect x={0} y={0} width={L} height={W} fill="var(--surface)" stroke="var(--ink)" strokeWidth={px * 1.5} />
        {Array.from({ length: Math.floor(L / g) }, (_, i) => (
          <line key={`gx${i}`} x1={(i + 1) * g} y1={0} x2={(i + 1) * g} y2={W} stroke="var(--line)" strokeWidth={px * 0.6} />
        ))}
        {Array.from({ length: Math.floor(W / g) }, (_, i) => (
          <line key={`gy${i}`} x1={0} y1={(i + 1) * g} x2={L} y2={(i + 1) * g} stroke="var(--line)" strokeWidth={px * 0.6} />
        ))}
        {clean && (zones.length > 0 || locked.length > 0) && (
          <rect
            x={clean.x + px}
            y={clean.y + px}
            width={Math.max(0, clean.w - 2 * px)}
            height={Math.max(0, clean.h - 2 * px)}
            fill="none"
            stroke="var(--good)"
            strokeWidth={px * 1.2}
            strokeDasharray={`${px * 5} ${px * 3}`}
            pointerEvents="none"
          />
        )}
        {locked.map((z, i) => (
          <rect key={`l${i}`} x={z.x} y={z.y} width={z.w} height={z.h} fill={`url(#${hatch}-old)`} stroke="var(--muted)" strokeWidth={px} pointerEvents="none" />
        ))}
        {zones.map((z, i) => (
          <rect
            key={i}
            data-zone="1"
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            fill={`url(#${hatch}-bad)`}
            stroke="var(--bad)"
            strokeWidth={px * (sel === i ? 3 : 1.2)}
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSel(i);
              setVer((v) => v + 1);
            }}
          />
        ))}
        {preview && <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} fill="var(--bad)" fillOpacity={0.25} stroke="var(--bad)" strokeWidth={px * 1.5} strokeDasharray={`${px * 4} ${px * 2}`} />}
      </svg>
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <span style={{ color: "var(--muted)" }}>
          {preview
            ? fmtRect(preview.h, preview.w, units)
            : clean && (zones.length > 0 || locked.length > 0)
              ? `Biggest clean piece: ${fmtRect(Math.min(clean.w, clean.h), Math.max(clean.w, clean.h), units)}`
              : "Drag across the sheet to mark an area you can't use."}
        </span>
        <button type="button" className="underline" style={{ color: "var(--purple)" }} onClick={addBySize}>
          + Add by measurement
        </button>
      </div>

      {selected && sel !== null && (
        <div key={`${sel}-${ver}`} className="card p-3 flex flex-col gap-2" style={{ background: "var(--paper)" }}>
          <div className="flex items-center justify-between">
            <span className="eyebrow" style={{ color: "var(--bad)" }}>
              Unusable area {sel + 1}
            </span>
            <button type="button" className="text-xs underline" style={{ color: "var(--bad)" }} onClick={() => remove(sel)}>
              remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <LengthInput name="" label="From left" units={units} defaultMm={selected.x} onChange={(v) => v !== null && update(sel, { x: v })} />
            <LengthInput name="" label="From top" units={units} defaultMm={selected.y} onChange={(v) => v !== null && update(sel, { y: v })} />
            <LengthInput name="" label="Along length" units={units} defaultMm={selected.w} onChange={(v) => v && update(sel, { w: v })} />
            <LengthInput name="" label="Across width" units={units} defaultMm={selected.h} onChange={(v) => v && update(sel, { h: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Small static picture of a sheet and its unusable areas, for lists. */
export function SheetThumb({ length, width, zones, className = "" }: { length: number; width: number; zones: Zone[]; className?: string }) {
  const hatch = useId().replace(/:/g, "");
  const px = Math.max(length, width) / 60;
  return (
    <svg viewBox={`${-px} ${-px} ${length + 2 * px} ${width + 2 * px}`} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width={px * 3} height={px * 3} patternTransform="rotate(45)">
          <rect width={px * 3} height={px * 3} fill="var(--bad)" fillOpacity="0.18" />
          <line x1="0" y1="0" x2="0" y2={px * 3} stroke="var(--bad)" strokeWidth={px} strokeOpacity="0.6" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={length} height={width} fill="var(--surface)" stroke="var(--ink)" strokeWidth={px * 0.8} />
      {clipZones(zones, length, width).map((z, i) => (
        <rect key={i} x={z.x} y={z.y} width={z.w} height={z.h} fill={`url(#${hatch})`} stroke="var(--bad)" strokeWidth={px * 0.5} />
      ))}
    </svg>
  );
}
