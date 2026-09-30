"use client";

import Link from "next/link";
import { useState } from "react";
import { addDesign, deleteDesign, syncDesign, updateDesign } from "@/app/parts-actions";
import type { FabDesign } from "@/lib/parts";
import { SUGGEST } from "@/lib/tracker";
import { timeAgo } from "@/lib/format";
import { Empty } from "./ui";
import { ErrorText, Field, SubmitButton, useFabAction } from "./fab-ui";

export function PartsDesigns({
  designs,
  counts,
  connected,
  processProp,
  requireProp,
}: {
  designs: FabDesign[];
  counts: Record<string, { live: number; missing: number; done: number }>;
  connected: boolean;
  processProp: string;
  requireProp: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const add = useFabAction(addDesign, (d) => setNote(d?.note || "Added."));
  const live = designs.filter((d) => !d.archived);
  const archived = designs.filter((d) => d.archived);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
      <datalist id="design-bots">
        {SUGGEST.bot.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <div className="flex flex-col gap-3">
        {live.length === 0 && <Empty>No designs yet. Paste an Onshape assembly link to load its parts.</Empty>}
        {live.map((d) => (
          <DesignCard key={d.id} d={d} c={counts[d.id]} connected={connected} />
        ))}
        {archived.length > 0 && (
          <details className="mt-2">
            <summary className="eyebrow cursor-pointer" style={{ color: "var(--muted)" }}>
              Archived · {archived.length}
            </summary>
            <div className="flex flex-col gap-3 mt-3">
              {archived.map((d) => (
                <DesignCard key={d.id} d={d} c={counts[d.id]} connected={connected} />
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <form className="card p-4 flex flex-col gap-3" onSubmit={add.submit}>
          <h2 className="text-xl font-medium tracking-tight">Add a design</h2>
          <Field label="Onshape link" hint="Open the robot's top assembly (or a Part Studio) in Onshape and copy the URL.">
            <input name="url" className="input mono text-sm" placeholder="https://cad.onshape.com/documents/…/w/…/e/…" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-[1fr_1fr_90px] gap-2">
            <Field label="Name" hint="Blank = Onshape's">
              <input name="name" className="input" placeholder="2027 robot" />
            </Field>
            <Field label="Bot" hint="Its parts' Bot">
              <input name="bot" className="input" placeholder="Aimbot" list="design-bots" />
            </Field>
            <Field label="Robots" hint="Copies to build">
              <input name="copies" type="number" min={1} defaultValue={1} className="input mono" />
            </Field>
          </div>
          <ErrorText error={add.error} />
          {note && !add.error && (
            <p className="text-sm" style={{ color: "var(--good)" }}>
              {note}
            </p>
          )}
          <SubmitButton pending={add.pending} label={add.pending ? "Loading from Onshape…" : "Add design"} />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            No Onshape link? Just give it a name and add its parts by hand from the board.
          </p>
        </form>

        <section className="card p-4 flex flex-col gap-2 text-sm">
          <h2 className="text-xl font-medium tracking-tight">How parts get sorted</h2>
          {!connected && (
            <p className="rounded-md p-2" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
              Onshape isn&apos;t connected yet: set <span className="mono">ONSHAPE_ACCESS_KEY</span> and <span className="mono">ONSHAPE_SECRET_KEY</span> (from dev-portal.onshape.com → API keys) in the
              app&apos;s environment.
            </p>
          )}
          <p>
            <b>You don&apos;t need to set anything up.</b> A synced part goes on the tracker if its name starts with a part number (
            <span className="mono">0201_Mounting_Plate</span>) or its material is a 3D print, and the app guesses its kind from its shape and material. Everything
            else — motors, gears, bearings, belts, bolts — goes on the <Link href="/tracker/bom" className="underline">COTS BOM</Link>. Origin cubes and unnamed
            &ldquo;Part 7&rdquo; bodies are skipped.
          </p>
          <details>
            <summary className="cursor-pointer font-medium">Optional: say exactly how a part is made (a “{processProp}” property)</summary>
            <div className="flex flex-col gap-2 mt-2">
              <p>When the guess is wrong, a custom property on the part overrides it. Setting it up once (needs an Onshape company / education admin):</p>
              <ol className="list-decimal pl-5 flex flex-col gap-1">
                <li>
                  Onshape → your account menu → <b>Company settings</b> (or <b>Enterprise settings</b>) → <b>Custom properties</b> → <b>Create custom property</b>.
                </li>
                <li>
                  Name it <b className="mono">{processProp}</b>, applies to <b>Part</b>, type <b>List</b> with the values below (or Text).
                </li>
              </ol>
              <p>Then on any part: right-click it in the Part Studio&apos;s parts list → <b>Properties</b> → pick its {processProp}.</p>
              <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <li className="contents">
                  <span className="mono">Router, Laser, CNC, Plate</span>
                  <span>Plate</span>
                </li>
                <li className="contents">
                  <span className="mono">Tube, Saw, Bar</span>
                  <span>Tube &amp; bar</span>
                </li>
                <li className="contents">
                  <span className="mono">Lathe, Shaft, Hex</span>
                  <span>Shaft</span>
                </li>
                <li className="contents">
                  <span className="mono">3D print</span>
                  <span>3D print</span>
                </li>
                <li className="contents">
                  <span className="mono">Mill</span>
                  <span>Machined</span>
                </li>
                <li className="contents">
                  <span className="mono">COTS, Purchased</span>
                  <span>COTS BOM</span>
                </li>
                <li className="contents">
                  <span className="mono">Reference, N/A</span>
                  <span>left out</span>
                </li>
              </ul>
              <p style={{ color: "var(--muted)" }}>
                Subsystem, Priority, Machine and Tapped properties fill in those tracker columns too.{" "}
                {requireProp ? `Right now only parts with a ${processProp} go on the tracker — ` : ""}
                Change the property name in <Link href="/tracker/machines" className="underline">Machines</Link>. Or skip Onshape for this: fix the kind on the tracker and it sticks
                through re-syncs.
              </p>
            </div>
          </details>
          <p style={{ color: "var(--muted)" }}>
            Syncing reads the BOM plus two calls per Part Studio. Plate outlines (DXF) come straight from the model; STEP files are fetched per part on demand, since
            Onshape counts API calls.
          </p>
        </section>
      </div>
    </div>
  );
}

function DesignCard({ d, c, connected }: { d: FabDesign; c?: { live: number; missing: number; done: number }; connected: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const sync = useFabAction(syncDesign, (note) => setMsg(note ?? "Synced."));
  const upd = useFabAction(updateDesign);
  const del = useFabAction(deleteDesign);
  const [copies, setCopies] = useState(d.copies);
  const [bot, setBot] = useState(d.bot ?? "");
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            {d.element_type === "assembly" ? "Onshape assembly" : d.element_type === "partstudio" ? "Onshape Part Studio" : "By hand"}
            {d.last_synced_at && ` · synced ${timeAgo(d.last_synced_at)}`}
          </p>
          <p className="text-xl font-medium tracking-tight break-words">{d.name}</p>
        </div>
        <div className="flex gap-2 items-center">
          {d.url && (
            <a href={d.url} target="_blank" rel="noreferrer" className="btn btn-ghost text-sm">
              Onshape ↗
            </a>
          )}
          {d.document_id && (
            <button type="button" className="btn btn-primary text-sm" disabled={sync.pending || !connected} onClick={() => sync.call({ id: d.id })}>
              {sync.pending ? "Syncing…" : "Sync"}
            </button>
          )}
        </div>
      </div>
      <p className="text-sm">
        <Link href="/tracker" className="underline">
          {c?.live ?? 0} parts
        </Link>
        {c?.done ? ` · ${c.done} done` : ""}
        {c?.missing ? ` · ${c.missing} no longer in the design` : ""}
      </p>
      {(msg ?? d.sync_note) && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {msg ?? d.sync_note}
        </p>
      )}
      <ErrorText error={sync.error ?? upd.error ?? del.error} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          Bot
          <input
            className="input py-1 w-32"
            style={{ minHeight: 34 }}
            value={bot}
            list="design-bots"
            onChange={(e) => setBot(e.target.value)}
            onBlur={() => {
              if (bot !== (d.bot ?? "")) upd.call({ id: d.id, bot });
            }}
          />
        </label>
        <label className="flex items-center gap-2">
          Robots
          <input
            type="number"
            min={1}
            className="input mono w-20 py-1"
            style={{ minHeight: 34 }}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
            onBlur={() => {
              if (copies !== d.copies) upd.call({ id: d.id, copies: String(copies) });
            }}
          />
        </label>
        <button type="button" className="btn btn-ghost text-sm ml-auto" onClick={() => upd.call({ id: d.id, archived: d.archived ? "0" : "1" })}>
          {d.archived ? "Unarchive" : "Archive"}
        </button>
        <button
          type="button"
          className="btn btn-danger text-sm"
          onClick={() => {
            if (confirm(`Delete ${d.name}, all ${c?.live ?? 0} of its parts, and their files? Archive it instead to keep the history.`)) del.call({ id: d.id });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
