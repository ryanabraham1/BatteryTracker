/**
 * Registry of every server action the offline outbox may replay. Entries are
 * stored as { name, batteryId, fields } so they survive a tab being killed;
 * the name is looked up here when the connection comes back.
 */
import {
  addNote,
  logBeak,
  logCba,
  logCharge,
  logIncident,
  logLoadTest,
  logPostMatch,
  logPreMatch,
  logUsage,
  moveStateForm,
  setStatusForm,
} from "@/app/actions";
import type { BatteryState } from "./types";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

export const ACTIONS = {
  addNote,
  logBeak,
  logCba,
  logCharge,
  logIncident,
  logLoadTest,
  logPostMatch,
  logPreMatch,
  logUsage,
  moveStateForm,
  setStatusForm,
} satisfies Record<string, (batteryId: string, fd: FormData) => Promise<Result>>;

export type ActionName = keyof typeof ACTIONS;

export interface OutboxEntry {
  id: string;
  name: ActionName;
  batteryId: string;
  /** FormData flattened to string pairs (files aren't used anywhere). */
  fields: [string, string][];
  queuedAt: string;
}

export function toFields(fd: FormData): [string, string][] {
  const out: [string, string][] = [];
  fd.forEach((v, k) => out.push([k, typeof v === "string" ? v : ""]));
  return out;
}

export function fromFields(fields: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of fields) fd.append(k, v);
  return fd;
}

/**
 * The state a queued action will put the battery in once it replays, so the
 * board can show it optimistically while offline. Null = no state change.
 */
export function impliedState(e: OutboxEntry, current: BatteryState): BatteryState | null {
  const get = (k: string) => e.fields.find(([kk]) => kk === k)?.[1];
  switch (e.name) {
    case "moveStateForm":
      return (get("to") as BatteryState) ?? null;
    case "logPreMatch":
      return get("move") === "0" ? null : "in_robot";
    case "logPostMatch":
      return current === "in_robot" || current === "ready" ? "charging" : null;
    case "logUsage":
      return current === "in_robot" && get("stay") !== "1" ? "charging" : null;
    case "logIncident":
      return get("flag") === "0" ? null : "needs_attention";
    default:
      return null;
  }
}
