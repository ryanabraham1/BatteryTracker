"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createBattery, deleteBattery, updateBattery } from "@/app/actions";
import { STATES, STATE_LABEL, type Battery } from "@/lib/types";

export function BatteryForm({ battery }: { battery?: Battery }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editing = !!battery;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = editing ? await updateBattery(battery.id, fd) : await createBattery(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/batteries/${encodeURIComponent(r.data!.name)}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card p-5 flex flex-col gap-4 max-w-lg">
      <label className="block">
        <span className="label">Name</span>
        <input name="name" required className="input display text-2xl" placeholder="Thor" defaultValue={battery?.name} autoFocus={!editing} />
      </label>
      <label className="block">
        <span className="label">Brand / model</span>
        <input name="brand_model" className="input" placeholder="MK ES17-12" defaultValue={battery?.brand_model} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Capacity (Ah)</span>
          <input name="capacity_ah" type="number" step="0.1" inputMode="decimal" className="input mono" defaultValue={battery?.capacity_ah ?? 18} />
        </label>
        <label className="block">
          <span className="label">Purchased</span>
          <input name="purchase_date" type="date" className="input mono text-sm" defaultValue={battery?.purchase_date ?? ""} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Cycle count</span>
          <input name="cycle_count" type="number" step="1" inputMode="numeric" className="input mono" defaultValue={battery?.cycle_count ?? 0} />
        </label>
        {!editing && (
          <label className="block">
            <span className="label">Starting state</span>
            <select name="state" className="input" defaultValue="ready">
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {STATE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!editing && (
        <label className="block">
          <span className="label">Status</span>
          <select name="status" className="input" defaultValue="active">
            <option value="active">Active</option>
            <option value="practice_only">Practice only</option>
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Notes</span>
        <textarea name="notes" className="input" rows={3} defaultValue={battery?.notes} />
      </label>
      {error && (
        <p className="text-sm font-medium" style={{ color: "var(--bad)" }} role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary py-3 flex-1">
          {pending ? "Saving…" : editing ? "Save changes" : "Add battery"} <span aria-hidden>→</span>
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
      {editing && (
        <button
          type="button"
          className="btn btn-danger mt-2"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete ${battery.name} and all of its history? This cannot be undone.`)) return;
            start(async () => {
              const r = await deleteBattery(battery.id);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              router.push("/batteries");
              router.refresh();
            });
          }}
        >
          Delete battery
        </button>
      )}
    </form>
  );
}
