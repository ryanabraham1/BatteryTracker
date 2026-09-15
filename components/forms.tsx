"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  addNote,
  logBeak,
  logCba,
  logCharge,
  logIncident,
  logUsage,
  moveState,
  setStatus,
} from "@/app/actions";
import { STATES, STATE_LABEL, type Battery, type BatteryState, type IncidentKind, type UsageContext } from "@/lib/types";
import { useCompMode } from "./comp-mode";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Shared form wrapper: runs a server action, shows errors, calls onDone. */
function ActionForm({
  action,
  submitLabel,
  onDone,
  children,
  danger,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  onDone: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await action(fd);
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {children}
      {error && (
        <p className="text-sm font-medium" style={{ color: "var(--bad)" }} role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`btn ${danger ? "btn-danger" : "btn-primary"} py-3`}>
        {pending ? "Saving…" : submitLabel} <span aria-hidden>→</span>
      </button>
    </form>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && (
        <span className="block mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/** Radio-style tile picker (Pick-your-crew grid). */
function Tiles<T extends string>({
  name,
  options,
  value,
  onChange,
  cols = 3,
}: {
  name: string;
  options: { value: T; label: string; sub?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      <input type="hidden" name={name} value={value ?? ""} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="tile"
          data-selected={value === o.value}
          onClick={() => onChange(o.value)}
        >
          <span className="block font-medium text-sm leading-tight">{o.label}</span>
          {o.sub && (
            <span className="block mono text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
              {o.sub}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MatchLabelField({ defaultValue }: { defaultValue: string }) {
  return (
    <Field label="Match (optional)">
      <input name="match_label" className="input mono" placeholder="Q12, SF1-2…" defaultValue={defaultValue} />
    </Field>
  );
}

// ---------------------------------------------------------------------------

export function UsageForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  const { compMode, matchLabel } = useCompMode();
  const [ctx, setCtx] = useState<UsageContext>(compMode ? "match" : "practice");
  const [rating, setRating] = useState<number | null>(null);
  return (
    <ActionForm action={(fd) => logUsage(battery.id, fd)} submitLabel="Save usage" onDone={onDone}>
      <Field label="Driver rating">
        <div className="grid grid-cols-5 gap-2">
          <input type="hidden" name="driver_rating" value={rating ?? ""} />
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className="tile text-center mono text-lg font-semibold py-3"
              data-selected={rating === n}
              onClick={() => setRating(n)}
              aria-label={`${n} of 5`}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Context">
        <Tiles<UsageContext>
          name="context"
          value={ctx}
          onChange={setCtx}
          options={[
            { value: "match", label: "Match" },
            { value: "practice", label: "Practice" },
            { value: "other", label: "Other" },
          ]}
        />
      </Field>
      {ctx === "match" && <MatchLabelField defaultValue={compMode ? matchLabel : ""} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voltage after">
          <input name="voltage_after" type="number" step="0.01" inputMode="decimal" className="input mono" placeholder="12.4" />
        </Field>
        <Field label="Voltage before">
          <input name="voltage_before" type="number" step="0.01" inputMode="decimal" className="input mono" placeholder="12.9" />
        </Field>
      </div>
      <Field label="Duration (min)">
        <input name="duration_min" type="number" step="1" inputMode="numeric" className="input mono" placeholder="3" />
      </Field>
      {battery.state === "in_robot" && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Saving moves <b>{battery.name}</b> to Cooling.
        </p>
      )}
    </ActionForm>
  );
}

export function BeakForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  return (
    <ActionForm action={(fd) => logBeak(battery.id, fd)} submitLabel="Save Beak check" onDone={onDone}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voltage (V)">
          <input name="voltage" required type="number" step="0.01" inputMode="decimal" className="input mono text-lg" placeholder="12.8" autoFocus />
        </Field>
        <Field label="IR (mΩ)">
          <input name="internal_resistance_mohm" required type="number" step="0.1" inputMode="decimal" className="input mono text-lg" placeholder="12.5" />
        </Field>
      </div>
      <Field label="Charge %">
        <input name="charge_pct" type="number" step="1" min="0" max="100" inputMode="numeric" className="input mono" placeholder="100" />
      </Field>
    </ActionForm>
  );
}

export function CbaForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  return (
    <ActionForm action={(fd) => logCba(battery.id, fd)} submitLabel="Save CBA test" onDone={onDone}>
      <Field label="Measured capacity (Ah)" hint={`Rated ${battery.capacity_ah} Ah`}>
        <input name="measured_ah" required type="number" step="0.01" inputMode="decimal" className="input mono text-lg" placeholder="16.2" autoFocus />
      </Field>
      <Field label="Test current (A)">
        <input name="test_current_a" type="number" step="0.1" inputMode="decimal" className="input mono" placeholder="7.5" />
      </Field>
      <Field label="Notes">
        <textarea name="notes" className="input" rows={2} />
      </Field>
    </ActionForm>
  );
}

export function IncidentForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  const { compMode, matchLabel } = useCompMode();
  const [kind, setKind] = useState<IncidentKind>("brownout");
  const [flag, setFlag] = useState(true);
  return (
    <ActionForm action={(fd) => logIncident(battery.id, fd)} submitLabel="Log incident" onDone={onDone} danger>
      <Field label="What happened">
        <Tiles<IncidentKind>
          name="kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "brownout", label: "Brownout" },
            { value: "died", label: "Died" },
            { value: "connector", label: "Connector" },
            { value: "swollen", label: "Swollen" },
            { value: "other", label: "Other" },
          ]}
        />
      </Field>
      <MatchLabelField defaultValue={compMode ? matchLabel : ""} />
      <Field label="Notes">
        <textarea name="notes" className="input" rows={2} placeholder="What did you see?" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="hidden" name="flag" value={flag ? "1" : "0"} />
        <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} className="accent-[var(--purple)] w-4 h-4" />
        Move to Needs Attention
      </label>
    </ActionForm>
  );
}

export function NoteForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  return (
    <ActionForm action={(fd) => addNote(battery.id, fd)} submitLabel="Add note" onDone={onDone}>
      <Field label="Note">
        <textarea name="text" required className="input" rows={3} autoFocus />
      </Field>
    </ActionForm>
  );
}

function localDatetime(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ChargeForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  const [count, setCount] = useState(true);
  const [defaults] = useState(() => ({
    started: localDatetime(new Date(Date.now() - 3 * 3600_000)),
    ended: localDatetime(),
  }));
  return (
    <ActionForm action={(fd) => logCharge(battery.id, fd)} submitLabel="Log charge" onDone={onDone}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Charges are usually logged automatically by moving a battery to Charging → Ready. Use this to
        back-fill a charge that happened off-board.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Started">
          <input name="started_at" type="datetime-local" required className="input mono text-sm" defaultValue={defaults.started} />
        </Field>
        <Field label="Ended">
          <input name="ended_at" type="datetime-local" className="input mono text-sm" defaultValue={defaults.ended} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Charger">
          <input name="charger" className="input" placeholder="Charger 2" />
        </Field>
        <Field label="Resting V after">
          <input name="resting_voltage_after" type="number" step="0.01" inputMode="decimal" className="input mono" placeholder="12.9" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="hidden" name="count_cycle" value={count ? "1" : "0"} />
        <input type="checkbox" checked={count} onChange={(e) => setCount(e.target.checked)} className="accent-[var(--purple)] w-4 h-4" />
        Count as a cycle
      </label>
    </ActionForm>
  );
}

/** Move state picker. Charging → Ready prompts for an optional resting voltage. */
export function MoveStateForm({
  battery,
  onDone,
  initialTo,
}: {
  battery: Battery;
  onDone: () => void;
  initialTo?: BatteryState;
}) {
  const [to, setTo] = useState<BatteryState | null>(initialTo ?? null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [restingV, setRestingV] = useState("");
  const [charger, setCharger] = useState("");
  const needsVoltage = battery.state === "charging" && to === "ready";
  const needsCharger = to === "charging";

  function go() {
    if (!to) return;
    setError(null);
    start(async () => {
      const r = await moveState(battery.id, to, {
        restingVoltage: restingV ? Number(restingV) : undefined,
        charger: charger || undefined,
      });
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Tiles<BatteryState>
        name="to"
        cols={2}
        value={to}
        onChange={setTo}
        options={STATES.filter((s) => s !== battery.state).map((s) => ({
          value: s,
          label: STATE_LABEL[s],
          sub: s === "ready" && battery.state === "charging" ? "closes charge · +1 cycle" : undefined,
        }))}
      />
      {needsVoltage && (
        <Field label="Resting voltage (optional)">
          <input value={restingV} onChange={(e) => setRestingV(e.target.value)} type="number" step="0.01" inputMode="decimal" className="input mono" placeholder="12.9" />
        </Field>
      )}
      {needsCharger && (
        <Field label="Charger (optional)">
          <input value={charger} onChange={(e) => setCharger(e.target.value)} className="input" placeholder="Charger 1" />
        </Field>
      )}
      {error && (
        <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary py-3" disabled={!to || pending} onClick={go}>
        {pending ? "Moving…" : to ? `Move to ${STATE_LABEL[to]}` : "Pick a state"} <span aria-hidden>→</span>
      </button>
    </div>
  );
}

export function RetireForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const retiring = battery.status !== "retired";
  return (
    <div className="flex flex-col gap-4">
      {retiring ? (
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="Capacity below 70%" autoFocus />
        </Field>
      ) : (
        <p className="text-sm">Bring <b>{battery.name}</b> back as an active battery?</p>
      )}
      {error && (
        <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={`btn ${retiring ? "btn-danger" : "btn-primary"} py-3`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setStatus(battery.id, retiring ? "retired" : "active", reason || undefined);
            if (r.ok) onDone();
            else setError(r.error);
          })
        }
      >
        {pending ? "Saving…" : retiring ? "Retire battery" : "Un-retire"} <span aria-hidden>→</span>
      </button>
      {retiring && battery.status === "active" && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setStatus(battery.id, "practice_only", reason || undefined);
              if (r.ok) onDone();
              else setError(r.error);
            })
          }
        >
          Mark practice-only instead
        </button>
      )}
      {retiring && battery.status === "practice_only" && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setStatus(battery.id, "active");
              if (r.ok) onDone();
              else setError(r.error);
            })
          }
        >
          Back to active
        </button>
      )}
    </div>
  );
}
