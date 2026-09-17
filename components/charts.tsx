"use client";

import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { cbaDerived } from "@/lib/cba";
import type { BatteryEvent, BeakTestData, CbaTestData, ChargeData, LoadTestData, Settings, UsageData } from "@/lib/types";

interface Pt {
  t: number;
  v: number;
}

function Panel({
  title,
  unit,
  data,
  refs,
  domain,
  mono = true,
}: {
  title: string;
  unit: string;
  data: Pt[];
  refs?: { y: number; label: string; color: string }[];
  domain?: [number | "auto", number | "auto"];
  mono?: boolean;
}) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-baseline justify-between mb-2">
        <p className="eyebrow" style={{ color: "var(--muted)" }}>
          {title}
        </p>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>
          {unit}
        </span>
      </div>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs" style={{ color: "var(--muted)" }}>
          No data yet
        </div>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t: number) =>
                  new Date(t).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
                tick={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--muted)",
                }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
              />
              <YAxis
                domain={domain ?? ["auto", "auto"]}
                tick={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--muted)",
                }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, title]}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  fontFamily: mono ? "var(--font-mono)" : undefined,
                  fontSize: 12,
                }}
              />
              {refs?.map((r) => (
                <ReferenceLine
                  key={r.label}
                  y={r.y}
                  stroke={r.color}
                  strokeDasharray="4 4"
                  label={{
                    value: r.label,
                    fontSize: 10,
                    fill: r.color,
                    position: "insideTopRight",
                  }}
                />
              ))}
              <Line
                type="monotone"
                dataKey="v"
                stroke="var(--purple)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--purple)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Per-match voltage drop (pre-match Beak → post-match Beak), newest right. */
function DropPanel({ data }: { data: { label: string; drop: number; t: number }[] }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-baseline justify-between mb-2">
        <p className="eyebrow" style={{ color: "var(--muted)" }}>
          Voltage drop per match
        </p>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>
          V
        </span>
      </div>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs text-center px-4" style={{ color: "var(--muted)" }}>
          Log pre- and post-match checks to see drop per match
        </div>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(-12)} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tick={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--muted)",
                }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
              />
              <YAxis
                tick={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--muted)",
                }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                labelFormatter={(l, p) => `${l} · ${new Date(Number(p?.[0]?.payload?.t)).toLocaleDateString()}`}
                formatter={(v) => [`−${Number(v).toFixed(2)} V`, "drop"]}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="drop" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                {data.slice(-12).map((d, i) => (
                  <Cell key={i} fill={d.drop >= 1 ? "var(--bad)" : d.drop >= 0.6 ? "var(--warn)" : "var(--purple)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function BatteryCharts({ events, settings, capacityAh }: { events: BatteryEvent[]; settings: Settings; capacityAh: number }) {
  const asc = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const ir: Pt[] = [];
  const volt: Pt[] = [];
  const cap: Pt[] = [];
  const cbaIr: Pt[] = [];
  const loadV: Pt[] = [];
  const load: Pt[] = [];
  const drops: { label: string; drop: number; t: number }[] = [];
  let n = 0;
  for (const e of asc) {
    const t = new Date(e.occurred_at).getTime();
    if (e.type === "beak_test") {
      const d = e.data as unknown as BeakTestData;
      ir.push({ t, v: d.internal_resistance_mohm });
      volt.push({ t, v: d.voltage });
    } else if (e.type === "charge") {
      const d = e.data as unknown as ChargeData;
      if (typeof d.resting_voltage_after === "number")
        volt.push({
          t: d.ended_at ? new Date(d.ended_at).getTime() : t,
          v: d.resting_voltage_after,
        });
    } else if (e.type === "usage") {
      const d = e.data as unknown as UsageData;
      if (typeof d.voltage_after === "number") volt.push({ t, v: d.voltage_after });
      n++;
      if (typeof d.voltage_before === "number" && typeof d.voltage_after === "number")
        drops.push({
          label: d.match_label || `#${n}`,
          drop: Math.max(0, d.voltage_before - d.voltage_after),
          t,
        });
    } else if (e.type === "load_test") {
      load.push({ t, v: (e.data as unknown as LoadTestData).loaded_voltage });
    } else if (e.type === "cba_test") {
      const d = e.data as unknown as CbaTestData;
      // Same rule as computeHealth: BD380 tests (with a mode) are rate-corrected, legacy rows are % of rated.
      const dv = cbaDerived(d, { capacity_ah: capacityAh }, settings);
      const pct = d.mode !== undefined && dv.pct_of_expected !== undefined ? dv.pct_of_expected : capacityAh > 0 ? (d.measured_ah / capacityAh) * 100 : 0;
      cap.push({ t, v: pct });
      if (typeof d.ir_mohm === "number") cbaIr.push({ t, v: d.ir_mohm });
      if (typeof d.measured_wh === "number" && d.measured_ah > 0) loadV.push({ t, v: d.measured_wh / d.measured_ah });
    }
  }
  volt.sort((a, b) => a.t - b.t);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Panel
        title="Beak IR"
        unit="mΩ"
        data={ir}
        refs={[
          { y: settings.ir_warn_mohm, label: "reserve", color: "var(--info)" },
          {
            y: settings.ir_practice_mohm,
            label: "practice",
            color: "var(--warn)",
          },
          { y: settings.ir_fail_mohm, label: "retire", color: "var(--bad)" },
        ]}
      />
      <Panel title="Voltage" unit="V" data={volt} />
      <DropPanel data={drops} />
      <Panel
        title="Load test · V @ 100 A"
        unit="V"
        data={load}
        refs={[{ y: settings.load_test_min_v, label: "floor", color: "var(--bad)" }]}
      />
      <Panel
        title="CBA capacity · % of expected (BD380) or rated"
        unit="%"
        data={cap}
        refs={[
          { y: settings.capacity_warn_pct, label: "warn", color: "var(--warn)" },
          { y: settings.capacity_fail_pct, label: "fail", color: "var(--bad)" },
        ]}
      />
      <Panel title="CBA IR" unit="mΩ" data={cbaIr} />
      <Panel title="CBA mean V under load" unit="V" data={loadV} />
    </div>
  );
}
