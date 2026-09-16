"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { BeakResult } from "@/app/actions";
import type { ActionName } from "@/lib/offline-actions";
import {
  IR_TIER_LABEL,
  IR_TIER_TONE,
  STATES,
  STATE_LABEL,
  STATUS_LABEL,
  type Battery,
  type BatteryState,
  type BatteryStatus,
  type IncidentKind,
  type UsageContext,
} from "@/lib/types";
import { useCompMode } from "./comp-mode";
import { useOffline } from "./offline";

/**
 * Shared form wrapper: runs a registered server action (through the offline
 * outbox), shows errors, calls onDone. `onSuccess` (when given) replaces onDone
 * and receives the action's data, so a form can show a follow-up step instead
 * of closing. `validate` can reject before anything is sent.
 */
function ActionForm<T = void>({
  action,
  battery,
  submitLabel,
  onDone,
  onSuccess,
  validate,
  children,
  danger,
}: {
  action: ActionName;
  battery: Battery;
  submitLabel: string;
  onDone: () => void;
  onSuccess?: (data: T | undefined) => void;
  validate?: (fd: FormData) => string | null;
  children: ReactNode;
  danger?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { offline, run } = useOffline();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = validate?.(fd);
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    start(async () => {
      const r = await run(action, battery.id, fd);
      if (!r.ok) setError(r.error);
      else if ("queued" in r && r.queued)
        onDone(); // parked in the outbox; nothing to follow up on
      else (onSuccess ?? onDone)(r.data as T | undefined);
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
        {pending ? "Saving…" : offline ? `${submitLabel} (offline)` : submitLabel} <span aria-hidden>→</span>
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
        <button key={o.value} type="button" className="tile" data-selected={value === o.value} onClick={() => onChange(o.value)}>
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

const needsRating = (fd: FormData) => (fd.get("driver_rating") === "" ? "Pick a driver rating (1–5)" : null);

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
    <ActionForm action="logUsage" battery={battery} submitLabel="Save usage" onDone={onDone} validate={needsRating}>
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
          Saving moves <b>{battery.name}</b> to Charging.
        </p>
      )}
    </ActionForm>
  );
}

/** The three Battery Beak readouts. Shared by plain checks and pre/post-match. */
function BeakFields({ autoFocus = true }: { autoFocus?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Voltage (V)">
          <input
            name="voltage"
            required
            type="number"
            step="0.01"
            inputMode="decimal"
            className="input mono text-lg"
            placeholder="12.8"
            autoFocus={autoFocus}
          />
        </Field>
        <Field label="IR (mΩ)">
          <input
            name="internal_resistance_mohm"
            required
            type="number"
            step="0.1"
            inputMode="decimal"
            className="input mono text-lg"
            placeholder="12.5"
          />
        </Field>
      </div>
      <Field label="Charge %">
        <input name="charge_pct" type="number" step="1" min="0" max="200" inputMode="numeric" className="input mono" placeholder="115" />
      </Field>
    </>
  );
}

/**
 * Shown after a Beak reading lands in a worse band than the battery's status:
 * one tap to mark it practice-only / retire, or dismiss.
 */
function TierFollowUp({ battery, result, onDone }: { battery: Battery; result: BeakResult; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { run } = useOffline();
  const to = result.suggestedStatus!;
  const tone = IR_TIER_TONE[result.tier];
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-[10px] p-3.5"
        style={{
          background: `var(--${tone}-soft)`,
          border: `1px solid var(--${tone})`,
        }}
      >
        <p className="eyebrow mb-1" style={{ color: `var(--${tone})` }}>
          Saved · IR band: {IR_TIER_LABEL[result.tier]}
        </p>
        <p className="text-sm">
          This reading puts <b>{battery.name}</b> in the <b>{IR_TIER_LABEL[result.tier].toLowerCase()}</b> band. Mark it{" "}
          <b>{STATUS_LABEL[to].toLowerCase()}</b>?
        </p>
      </div>
      {error && (
        <p className="text-sm font-medium" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={`btn ${to === "retired" ? "btn-danger" : "btn-primary"} py-3`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("to", to);
            fd.set("reason", `IR in ${IR_TIER_LABEL[result.tier].toLowerCase()} band`);
            const r = await run("setStatusForm", battery.id, fd);
            if (r.ok) onDone();
            else setError(r.error);
          })
        }
      >
        {pending ? "Saving…" : `Mark ${STATUS_LABEL[to].toLowerCase()}`} <span aria-hidden>→</span>
      </button>
      <button type="button" className="btn btn-ghost py-3" disabled={pending} onClick={onDone}>
        Keep as {STATUS_LABEL[battery.status].toLowerCase()}
      </button>
    </div>
  );
}

/** Wraps a Beak-producing form so a suggestion can replace it after save. */
function useTierFollowUp(onDone: () => void) {
  const [result, setResult] = useState<BeakResult | null>(null);
  const onSuccess = (data: BeakResult | undefined) => {
    if (data?.suggestedStatus) setResult(data);
    else onDone();
  };
  return { result, onSuccess };
}

export function BeakForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  const { result, onSuccess } = useTierFollowUp(onDone);
  if (result) return <TierFollowUp battery={battery} result={result} onDone={onDone} />;
  return (
    <ActionForm<BeakResult> action="logBeak" battery={battery} submitLabel="Save Beak check" onDone={onDone} onSuccess={onSuccess}>
      <BeakFields />
    </ActionForm>
  );
}

/** Pre-match: Beak reading tagged with the match, then into the robot. */
export function PreMatchForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  const { compMode, matchLabel } = useCompMode();
  const { result, onSuccess } = useTierFollowUp(onDone);
  const [move, setMove] = useState(battery.state !== "in_robot");
  if (result) return <TierFollowUp battery={battery} result={result} onDone={onDone} />;
  return (
    <ActionForm<BeakResult> action="logPreMatch" battery={battery} submitLabel="Save pre-match" onDone={onDone} onSuccess={onSuccess}>
      <BeakFields />
      <MatchLabelField defaultValue={compMode ? matchLabel : ""} />
      {battery.state !== "in_robot" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="move" value={move ? "1" : "0"} />
          <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} className="accent-[var(--purple)] w-4 h-4" />
          Move <b>{battery.name}</b> to In Robot
        </label>
      )}
    </ActionForm>
  );
}

/** Post-match: Beak reading + driver rating; logs usage with the pre-match numbers and moves to Charging. */
export function PostMatchForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  const { compMode, matchLabel } = useCompMode();
  const { result, onSuccess } = useTierFollowUp(onDone);
  const [rating, setRating] = useState<number | null>(null);
  const [ctx, setCtx] = useState<UsageContext>(compMode ? "match" : "practice");
  if (result) return <TierFollowUp battery={battery} result={result} onDone={onDone} />;
  return (
    <ActionForm<BeakResult>
      action="logPostMatch"
      battery={battery}
      submitLabel="Save post-match"
      onDone={onDone}
      onSuccess={onSuccess}
      validate={needsRating}
    >
      <BeakFields />
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
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Saves the Beak reading and a usage entry (before/after from the pre-match check), then moves <b>{battery.name}</b> to Charging.
      </p>
    </ActionForm>
  );
}

/** 100 A load tester: hold the switch 10 s and watch the gauge. */
export function LoadTestForm({ battery, onDone, minV }: { battery: Battery; onDone: () => void; minV: number }) {
  const [held, setHeld] = useState<"1" | "0" | null>(null);
  const [done, setDone] = useState<{ pass: boolean } | null>(null);
  if (done) {
    const tone = done.pass ? "good" : "bad";
    return (
      <div className="flex flex-col gap-4">
        <div
          className="rounded-[10px] p-4 text-center"
          style={{
            background: `var(--${tone}-soft)`,
            border: `1px solid var(--${tone})`,
          }}
        >
          <p className="display text-4xl" style={{ color: `var(--${tone})` }}>
            {done.pass ? "PASS" : "FAIL"}
          </p>
          <p className="text-sm mt-1">{done.pass ? "Held under load." : "Bad cell likely — health capped at Bad."}</p>
        </div>
        <button type="button" className="btn btn-primary py-3" onClick={onDone}>
          Done <span aria-hidden>→</span>
        </button>
      </div>
    );
  }
  return (
    <ActionForm<{ pass: boolean }>
      action="logLoadTest"
      battery={battery}
      validate={(fd) => (fd.get("held_10s") === "" ? "Pick whether the voltage held" : null)}
      submitLabel="Save load test"
      onDone={onDone}
      onSuccess={(d) => (d ? setDone(d) : onDone())}
    >
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Hold the 100 A switch for 10 s. Pass = voltage drops once and holds. Fail = it drops again before 10 s (bad cell), or holds below{" "}
        {minV} V.
      </p>
      <Field label="Did the voltage hold for 10 s?">
        <Tiles<"1" | "0">
          name="held_10s"
          cols={2}
          value={held}
          onChange={setHeld}
          options={[
            { value: "1", label: "Held steady", sub: "pass" },
            { value: "0", label: "Dropped again", sub: "fail" },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loaded voltage (V)" hint={`floor ${minV} V`}>
          <input
            name="loaded_voltage"
            required
            type="number"
            step="0.01"
            inputMode="decimal"
            className="input mono text-lg"
            placeholder="11.2"
          />
        </Field>
        <Field label="Open voltage (V)">
          <input name="open_voltage" type="number" step="0.01" inputMode="decimal" className="input mono text-lg" placeholder="12.8" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea name="notes" className="input" rows={2} placeholder="Second dip at ~6 s…" />
      </Field>
    </ActionForm>
  );
}

export function CbaForm({ battery, onDone }: { battery: Battery; onDone: () => void }) {
  return (
    <ActionForm action="logCba" battery={battery} submitLabel="Save CBA test" onDone={onDone}>
      <Field label="Measured capacity (Ah)" hint={`Rated ${battery.capacity_ah} Ah`}>
        <input
          name="measured_ah"
          required
          type="number"
          step="0.01"
          inputMode="decimal"
          className="input mono text-lg"
          placeholder="16.2"
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Total Wh">
          <input name="measured_wh" type="number" step="0.1" inputMode="decimal" className="input mono" placeholder="136.2" />
        </Field>
        <Field label="Test current (A)">
          <input name="test_current_a" type="number" step="0.1" inputMode="decimal" className="input mono" placeholder="7.5" />
        </Field>
      </div>
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
    <ActionForm action="logIncident" battery={battery} submitLabel="Log incident" onDone={onDone} danger>
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
    <ActionForm action="addNote" battery={battery} submitLabel="Add note" onDone={onDone}>
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
    <ActionForm action="logCharge" battery={battery} submitLabel="Log charge" onDone={onDone}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Charges are usually logged automatically by moving a battery to Charging → Ready. Use this to back-fill a charge that happened
        off-board.
      </p>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
        <Field label="Started">
          <input name="started_at" type="datetime-local" required className="input mono" defaultValue={defaults.started} />
        </Field>
        <Field label="Ended">
          <input name="ended_at" type="datetime-local" className="input mono" defaultValue={defaults.ended} />
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
export function MoveStateForm({ battery, onDone, initialTo }: { battery: Battery; onDone: () => void; initialTo?: BatteryState }) {
  const [to, setTo] = useState<BatteryState | null>(initialTo ?? null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [restingV, setRestingV] = useState("");
  const [charger, setCharger] = useState("");
  const { run } = useOffline();
  const needsVoltage = battery.state === "charging" && to === "ready";
  const needsCharger = to === "charging";

  function go() {
    if (!to) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("to", to);
      if (restingV) fd.set("resting_voltage", restingV);
      if (charger) fd.set("charger", charger);
      const r = await run("moveStateForm", battery.id, fd);
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
          <input
            value={restingV}
            onChange={(e) => setRestingV(e.target.value)}
            type="number"
            step="0.01"
            inputMode="decimal"
            className="input mono"
            placeholder="12.9"
          />
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
  const { run } = useOffline();
  const retiring = battery.status !== "retired";
  const setStatus = (to: BatteryStatus, why?: string) => {
    const fd = new FormData();
    fd.set("to", to);
    if (why) fd.set("reason", why);
    return run("setStatusForm", battery.id, fd);
  };
  return (
    <div className="flex flex-col gap-4">
      {retiring ? (
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="Capacity below 70%" autoFocus />
        </Field>
      ) : (
        <p className="text-sm">
          Bring <b>{battery.name}</b> back as an active battery?
        </p>
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
            const r = await setStatus(retiring ? "retired" : "active", reason || undefined);
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
              const r = await setStatus("practice_only", reason || undefined);
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
              const r = await setStatus("active");
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
