"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { BatteryEvent, BeakTestData, CbaTestData, ChargeData, Settings, UsageData } from "@/lib/types";

interface Pt {
  t: number;
  v: number;
}

function Panel({ title, unit, data, refs, domain, mono = true }: {
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
        <p className="eyebrow" style={{ color: "var(--muted)" }}>{title}</p>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>{unit}</span>
      </div>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs" style={{ color: "var(--muted)" }}>No data yet</div>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
              />
              <YAxis
                domain={domain ?? ["auto", "auto"]}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, title]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--line)", fontFamily: mono ? "var(--font-mono)" : undefined, fontSize: 12 }}
              />
              {refs?.map((r) => (
                <ReferenceLine key={r.label} y={r.y} stroke={r.color} strokeDasharray="4 4" label={{ value: r.label, fontSize: 10, fill: r.color, position: "insideTopRight" }} />
              ))}
              <Line type="monotone" dataKey="v" stroke="var(--purple)" strokeWidth={2} dot={{ r: 3, fill: "var(--purple)" }} isAnimationActive={false} />
            </LineChart>
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
  for (const e of asc) {
    const t = new Date(e.occurred_at).getTime();
    if (e.type === "beak_test") {
      const d = e.data as unknown as BeakTestData;
      ir.push({ t, v: d.internal_resistance_mohm });
      volt.push({ t, v: d.voltage });
    } else if (e.type === "charge") {
      const d = e.data as unknown as ChargeData;
      if (typeof d.resting_voltage_after === "number") volt.push({ t: d.ended_at ? new Date(d.ended_at).getTime() : t, v: d.resting_voltage_after });
    } else if (e.type === "usage") {
      const d = e.data as unknown as UsageData;
      if (typeof d.voltage_after === "number") volt.push({ t, v: d.voltage_after });
    } else if (e.type === "cba_test") {
      const d = e.data as unknown as CbaTestData;
      cap.push({ t, v: d.measured_ah });
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
          { y: settings.ir_warn_mohm, label: "warn", color: "var(--warn)" },
          { y: settings.ir_fail_mohm, label: "fail", color: "var(--bad)" },
        ]}
      />
      <Panel title="Voltage" unit="V" data={volt} />
      <Panel
        title="CBA capacity"
        unit="Ah"
        data={cap}
        refs={[
          { y: (capacityAh * settings.capacity_warn_pct) / 100, label: `${settings.capacity_warn_pct}%`, color: "var(--warn)" },
          { y: (capacityAh * settings.capacity_fail_pct) / 100, label: `${settings.capacity_fail_pct}%`, color: "var(--bad)" },
        ]}
      />
    </div>
  );
}
