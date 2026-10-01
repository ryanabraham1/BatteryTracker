"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteOrder, setOrderStatus } from "@/app/fab-actions";
import { fmtAmount, fmtPiece, materialName, sizeLabel, summarize, type FabLocation, type FabMaterial, type FabOrder, type FabPiece } from "@/lib/fab";
import { fmtDate } from "@/lib/format";
import type { Units } from "@/lib/units";
import { Sheet } from "./sheet";
import { Empty } from "./ui";
import { ErrorText, useFabAction } from "./fab-ui";
import { OrderForm, ReceiveForm } from "./fab-material-detail";
import { ConfirmButton } from "./confirm-button";

export function FabShopping({
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
  const [open, setOpen] = useState<{ kind: "order"; m: FabMaterial } | { kind: "receive"; m: FabMaterial; order: FabOrder } | null>(null);
  const close = () => setOpen(null);
  const [copied, setCopied] = useState(false);
  const mat = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const low = summarize(materials, pieces, orders).filter((s) => s.low);

  const byVendor = useMemo(() => {
    const g = new Map<string, FabOrder[]>();
    for (const o of orders) {
      const m = mat.get(o.material_id);
      if (!m) continue;
      const k = m.vendor || "No vendor";
      g.set(k, [...(g.get(k) ?? []), o]);
    }
    return [...g].sort(([a], [b]) => a.localeCompare(b));
  }, [orders, mat]);

  function copyText() {
    const lines: string[] = [];
    for (const [vendor, os] of byVendor) {
      lines.push(`${vendor}:`);
      for (const o of os) {
        const m = mat.get(o.material_id)!;
        const size = o.length_mm ? ` @ ${fmtPiece(m, { length_mm: o.length_mm, width_mm: o.width_mm }, units)}` : "";
        const part = m.vendor_part ? ` (${m.vendor_part})` : "";
        lines.push(`  ${o.quantity} × ${materialName(m)}${size}${part}${o.status === "ordered" ? " — ordered" : ""}${m.url ? `\n    ${m.url}` : ""}`);
      }
    }
    navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const estTotal = orders.reduce((sum, o) => {
    const c = mat.get(o.material_id)?.unit_cost;
    return c ? sum + c * o.quantity : sum;
  }, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px] items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            To buy · {orders.length} {orders.length === 1 ? "line" : "lines"}
            {estTotal > 0 && ` · ≈ $${estTotal.toFixed(2)}`}
          </p>
          {orders.length > 0 && (
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost text-sm" onClick={copyText}>
                {copied ? "Copied ✓" : "Copy as text"}
              </button>
              <a href="/api/export/stock-shopping" className="btn btn-ghost text-sm">
                CSV
              </a>
            </div>
          )}
        </div>
        {byVendor.length === 0 ? (
          <Empty>The shopping list is empty. Add items from a material&apos;s page (“Need more”) or from “Running low”.</Empty>
        ) : (
          byVendor.map(([vendor, os]) => (
            <div key={vendor} className="card">
              <p className="eyebrow px-4 pt-3" style={{ color: "var(--purple-dark)" }}>
                {vendor}
              </p>
              <ul>
                {os.map((o) => (
                  <OrderRow
                    key={o.id}
                    o={o}
                    m={mat.get(o.material_id)!}
                    units={units}
                    onReceive={() => setOpen({ kind: "receive", m: mat.get(o.material_id)!, order: o })}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="card p-4">
        <p className="eyebrow mb-3" style={{ color: "var(--muted)" }}>
          Running low
        </p>
        {low.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Nothing is under its low-stock line.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {low.map((s) => (
              <li key={s.material.id} className="flex items-center gap-2 justify-between">
                <Link href={`/stock/${s.material.id}`} className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.material.material} {sizeLabel(s.material)}
                  </p>
                  <p className="mono text-xs" style={{ color: "var(--bad)" }}>
                    {fmtAmount(s.material, s.total, units)} of {fmtAmount(s.material, s.material.min_amount ?? 0, units)}
                  </p>
                </Link>
                {s.openOrders > 0 ? (
                  <span className="pill pill-warn shrink-0">Listed</span>
                ) : (
                  <button type="button" className="btn btn-ghost text-sm shrink-0" onClick={() => setOpen({ kind: "order", m: s.material })}>
                    + List
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={open?.kind === "order"} onClose={close} eyebrow={open ? sizeLabel(open.m) : ""} title="Need more">
        {open?.kind === "order" && <OrderForm m={open.m} units={units} onDone={close} />}
      </Sheet>
      <Sheet open={open?.kind === "receive"} onClose={close} eyebrow={open ? sizeLabel(open.m) : ""} title="It arrived">
        {open?.kind === "receive" && <ReceiveForm m={open.m} locations={locations} units={units} order={open.order} onDone={close} />}
      </Sheet>
    </div>
  );
}

function OrderRow({ o, m, units, onReceive }: { o: FabOrder; m: FabMaterial; units: Units; onReceive: () => void }) {
  const status = useFabAction(setOrderStatus);
  const del = useFabAction(deleteOrder);
  const [date, setDate] = useState(o.expected_date ?? "");
  const pending = status.pending || del.pending;
  return (
    <li className="px-4 py-3 border-t flex flex-col gap-2" style={{ borderColor: "var(--line)", opacity: pending ? 0.6 : 1 }}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/stock/${m.id}`} className="min-w-0">
          <p className="font-medium leading-tight">
            <span className="mono">{o.quantity} ×</span> {m.material} {sizeLabel(m)}
          </p>
          <p className="mono text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {o.length_mm ? fmtPiece(m, { length_mm: o.length_mm, width_mm: o.width_mm }, units) : "—"}
            {m.vendor_part && ` · ${m.vendor_part}`}
            {m.unit_cost !== null && ` · $${(m.unit_cost * o.quantity).toFixed(2)}`}
          </p>
          {o.notes && <p className="text-xs mt-0.5">{o.notes}</p>}
        </Link>
        <span className={`pill shrink-0 ${o.status === "ordered" ? "pill-info" : "pill-warn"}`}>
          {o.status === "ordered" ? `Ordered${o.expected_date ? ` · ${fmtDate(o.expected_date)}` : ""}` : "Needed"}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        {o.status === "needed" ? (
          <>
            <input
              type="date"
              className="input mono py-1 flex-1 min-w-[140px]"
              style={{ minHeight: 40 }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Expected delivery"
            />
            <button type="button" className="btn btn-ghost text-sm" disabled={pending} onClick={() => status.call({ id: o.id, status: "ordered", expected_date: date })}>
              Mark ordered
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost text-sm" disabled={pending} onClick={() => status.call({ id: o.id, status: "needed", expected_date: "" })}>
            Not ordered yet
          </button>
        )}
        <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={onReceive}>
          Arrived
        </button>
        <ConfirmButton
          className="btn btn-danger text-sm"
          danger
          pending={pending}
          label="Remove"
          confirmLabel="Remove it"
          message="Take this off the shopping list?"
          onConfirm={() => del.call({ id: o.id })}
        />
        {m.url && (
          <a href={m.url} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: "var(--purple)" }}>
            Vendor ↗
          </a>
        )}
      </div>
      <ErrorText error={status.error ?? del.error} />
    </li>
  );
}
