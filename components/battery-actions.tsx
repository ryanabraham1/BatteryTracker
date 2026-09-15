"use client";

import { useState, useTransition } from "react";
import { moveState } from "@/app/actions";
import { STATES, STATE_LABEL, STATE_TONE, type Battery, type BatteryState } from "@/lib/types";
import { Sheet } from "./sheet";
import {
  BeakForm,
  CbaForm,
  ChargeForm,
  IncidentForm,
  MoveStateForm,
  NoteForm,
  RetireForm,
  UsageForm,
} from "./forms";
import { StatePill } from "./ui";

export type ActionView =
  | "menu"
  | "move"
  | "usage"
  | "beak"
  | "cba"
  | "incident"
  | "note"
  | "charge"
  | "retire";

const TITLES: Record<ActionView, string> = {
  menu: "",
  move: "Move to",
  usage: "Log usage",
  beak: "Beak check",
  cba: "CBA test",
  incident: "Flag issue",
  note: "Add note",
  charge: "Log charge",
  retire: "Retire",
};

export function BatteryActionSheet({
  battery,
  view,
  onClose,
  onView,
}: {
  battery: Battery | null;
  view: ActionView | null;
  onClose: () => void;
  onView: (v: ActionView) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voltageFor, setVoltageFor] = useState<BatteryState | null>(null);

  if (!battery || !view) return null;

  function quickMove(to: BatteryState) {
    if (!battery) return;
    // Charging → Ready: optional resting voltage prompt
    if (battery.state === "charging" && to === "ready") {
      setVoltageFor(to);
      onView("move");
      return;
    }
    setError(null);
    start(async () => {
      const r = await moveState(battery.id, to);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  const title = view === "menu" ? battery.name : TITLES[view];
  const eyebrow = view === "menu" ? <StatePill state={battery.state} /> : battery.name;

  return (
    <Sheet open onClose={onClose} title={title} eyebrow={eyebrow}>
      {view === "menu" && (
        <div className="flex flex-col gap-5">
          <div>
            <p className="label">Move to</p>
            <div className="grid grid-cols-2 gap-2">
              {STATES.filter((s) => s !== battery.state).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => quickMove(s)}
                  className="tile flex items-center gap-2 py-3.5"
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: `var(--${STATE_TONE[s]})` }} />
                  <span className="font-medium">{STATE_LABEL[s]}</span>
                </button>
              ))}
            </div>
            {error && (
              <p className="mt-2 text-sm font-medium" style={{ color: "var(--bad)" }}>
                {error}
              </p>
            )}
          </div>
          <div>
            <p className="label">Log</p>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="btn btn-ghost py-3 px-2 text-sm text-center" onClick={() => onView("usage")}>
                Log usage
              </button>
              <button type="button" className="btn btn-ghost py-3 px-2 text-sm text-center" onClick={() => onView("beak")}>
                Beak check
              </button>
              <button type="button" className="btn btn-danger py-3 px-2 text-sm text-center" onClick={() => onView("incident")}>
                Flag issue
              </button>
            </div>
          </div>
          <a href={`/batteries/${encodeURIComponent(battery.name)}`} className="btn btn-ghost py-3">
            Open details <span aria-hidden>→</span>
          </a>
        </div>
      )}
      {view === "move" && <MoveStateForm battery={battery} onDone={onClose} initialTo={voltageFor ?? undefined} />}
      {view === "usage" && <UsageForm battery={battery} onDone={onClose} />}
      {view === "beak" && <BeakForm battery={battery} onDone={onClose} />}
      {view === "cba" && <CbaForm battery={battery} onDone={onClose} />}
      {view === "incident" && <IncidentForm battery={battery} onDone={onClose} />}
      {view === "note" && <NoteForm battery={battery} onDone={onClose} />}
      {view === "charge" && <ChargeForm battery={battery} onDone={onClose} />}
      {view === "retire" && <RetireForm battery={battery} onDone={onClose} />}
    </Sheet>
  );
}

/** Small hook so pages can open the sheet for any battery. */
export function useBatteryActions() {
  const [battery, setBattery] = useState<Battery | null>(null);
  const [view, setView] = useState<ActionView | null>(null);
  return {
    battery,
    view,
    open: (b: Battery, v: ActionView = "menu") => {
      setBattery(b);
      setView(v);
    },
    close: () => {
      setView(null);
      setBattery(null);
    },
    setView,
  };
}
