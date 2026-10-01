/**
 * The team's Machining and 3D Printing tracker sheets, as the fab tracker
 * speaks them: statuses, the sheet's dropdowns (offered as suggestions —
 * anything typed is kept) and reading rows pasted from the sheet. The rows
 * themselves are parts (lib/parts.ts).
 */

export type Tracker = "machining" | "print";
export const TRACKERS: Tracker[] = ["machining", "print"];
export const TRACKER_LABEL: Record<Tracker, string> = { machining: "Machining", print: "3D printing" };
export const isTracker = (v: unknown): v is Tracker => TRACKERS.includes(v as Tracker);

export type JobStatus = "not_started" | "have_cam" | "in_progress" | "outsourced" | "spares_needed" | "spares_finished" | "finished" | "not_needed";
export const STATUS_LABEL: Record<JobStatus, string> = {
  not_started: "Not Started",
  have_cam: "Have Drawing/CAM",
  in_progress: "In Progress",
  outsourced: "SendCutSend",
  spares_needed: "Spares Needed",
  spares_finished: "Spares Finished",
  finished: "Finished",
  not_needed: "Not Needed",
};
export const STATUS_TONE: Record<JobStatus, "muted" | "info" | "purple" | "warn" | "good" | "bad"> = {
  not_started: "muted",
  have_cam: "info",
  in_progress: "purple",
  outsourced: "info",
  spares_needed: "warn",
  spares_finished: "good",
  finished: "good",
  not_needed: "muted",
};
/** Statuses each tracker offers, in workflow order. */
export const STATUSES: Record<Tracker, JobStatus[]> = {
  machining: ["not_started", "have_cam", "in_progress", "outsourced", "finished", "spares_needed", "spares_finished"],
  print: ["not_started", "in_progress", "finished", "spares_needed", "spares_finished", "not_needed"],
};
export const ALL_STATUSES = Object.keys(STATUS_LABEL) as JobStatus[];
export const isJobStatus = (v: unknown): v is JobStatus => ALL_STATUSES.includes(v as JobStatus);
/** Nothing left to make. (Spares Needed is still open.) */
export const isDone = (s: JobStatus) => s === "finished" || s === "spares_finished" || s === "not_needed";

export const PRIORITIES = [0, 1, 2, 3, 4];
export const priorityLabel = (p: number | null) => (p === null ? "" : `#${p}`);

// The sheet's dropdown lists (2026-27 Hardware Resources).
export const SUGGEST = {
  bot: ["Aimbot", "Dumper", "EveryBot", "Other"],
  subsystem: ["Drivebase", "Turret", "Shooter", "Indexer", "Intake", "Climb", "La Tolva (Hopper)", "Driverstation", "Other"],
  machine: ["CNC Router", "CNC Mill", "Bridgeport Mill", "Lathe", "Horizontal Bandsaw", "Vertical Bandsaw", "xTool MetalFab", "Laser Cutter", "Fabworks"],
  material: [
    "Polycarbonate Sheet",
    "Aluminum Sheet",
    "Aluminum Punched Box Tube 1x1",
    "Aluminum Punched Box Tube 2x1",
    "Aluminum Punched Box Tube 2x2",
    "Aluminum Punched Box Tube 0.75x0.75",
    "Maxtube 2x1",
    "Maxtube 1x1",
    "Maxtube 2x2",
    "Aluminum Round Tube",
    "Aluminum L Bracket",
    "Aluminum Round Rod",
    "Aluminum Thunderhex Rod",
    "Polycarbonate Round Tube",
    "Aluminum Plain Box Tube",
    "Aluminum Block",
    "Birch",
    "Aluminum Nutstrip - #10-32",
    "SRPP",
    "CF",
    "SplineXL Rod",
    "Corrugated Polycarbonate Sheet",
  ],
  filament: ["PLA (Bambu)", "PETG-CF (Bambu)", "PA-CF (Bambu)", "ABS (Stratasys)", "TPU"],
  stock_dims: [
    '1/32" thick',
    '1/16" thick',
    '1/8" thick',
    '3/16" thick',
    '1/4" thick',
    '3/8" thick',
    '1/2" thick',
    '1/16" wall',
    '1/8" wall',
    "3/8 diam shaft",
    "1/2 diam shaft",
    '1" diam round tube',
    '1.5" diam round tube',
    '2" diam round tube',
    '2.5" diam round tube',
    '3" diam round tube',
    '4" diam round tube',
    "Check Notes",
  ],
  tapped: ["no", "yes", "both sides"],
};

/** The sheet's text columns (sheet names; see SHEET_TO_PART for where each is stored). */
export const TEXT_FIELDS = [
  "bot",
  "subsystem",
  "name",
  "material",
  "stock_dims",
  "length",
  "tapped",
  "machine",
  "infill",
  "designer",
  "dri",
  "file",
  "notes",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** Part column for each sheet column (DRI becomes the people on the part). */
export const SHEET_TO_PART: Record<Exclude<TextField, "dri">, string> = {
  bot: "bot",
  subsystem: "subsystem",
  name: "name",
  material: "material_text",
  stock_dims: "stock_dims",
  length: "length_text",
  tapped: "tapped",
  machine: "machine",
  infill: "infill",
  designer: "designer",
  file: "file",
  notes: "notes",
};

/** "Ana, Ben & Cy" → ["Ana", "Ben", "Cy"] */
export const splitPeople = (s: string) =>
  s
    .split(/\s*(?:,|&|\/|\band\b)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);

export const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

// ── Import from the sheet ─────────────────────────────────────────────────────

/** Split pasted spreadsheet text (tab-separated from Sheets/Excel, or CSV) into rows. */
export function parseTable(text: string): string[][] {
  const sep = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

type Col = TextField | "status" | "priority" | "qty" | "spare_qty";

/** Which job field a sheet header means (the Machining and 3D Printing sheets name them a little differently). */
function headerField(h: string): Col | null {
  const s = h.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Linear columns from the old sheet are ignored — issues live in the issue tracker now
  if (/^linear|synced|sync|^_/.test(s)) return null;
  if (/^status/.test(s)) return "status";
  if (/^bot/.test(s)) return "bot";
  if (/^subsys/.test(s)) return "subsystem";
  if (/^part|^name/.test(s)) return "name";
  if (/^prio/.test(s)) return "priority";
  if (/spare/.test(s)) return "spare_qty";
  if (/^(qty|quantity)/.test(s)) return "qty";
  if (/^stock dim|dimension/.test(s)) return "stock_dims";
  if (/material|filament/.test(s)) return "material";
  if (/^length/.test(s)) return "length";
  if (/^tap/.test(s)) return "tapped";
  if (/^machine/.test(s)) return "machine";
  if (/^infill/.test(s)) return "infill";
  if (/^designer/.test(s)) return "designer";
  if (/^dri/.test(s)) return "dri";
  if (/drawing|cam|step|stl|^file/.test(s)) return "file";
  if (/^notes?$/.test(s)) return "notes";
  return null;
}

export function statusFromText(s: string): JobStatus | null {
  const t = s.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return null;
  if (t.startsWith("sparesfin")) return "spares_finished";
  if (t.startsWith("sparesneed")) return "spares_needed";
  if (t.startsWith("finish") || t === "done") return "finished";
  if (t.startsWith("inprog")) return "in_progress";
  if (t.startsWith("notstart")) return "not_started";
  if (t.startsWith("notneed")) return "not_needed";
  if (t.startsWith("have") || t.includes("cam")) return "have_cam";
  if (t.includes("sendcutsend") || t.includes("outsourc")) return "outsourced";
  return null;
}

export type ImportRow = Partial<Record<TextField, string>> & {
  status: JobStatus;
  priority: number | null;
  qty: number;
  spare_qty: number;
  name: string;
};

/**
 * Read rows copied straight out of the tracker sheet. The header row (the one
 * with "Status" and a part-name column) says which column is which; rows with
 * no part name (section breaks like "Off-Season") are skipped.
 */
export function readSheet(text: string): { rows: ImportRow[]; columns: string[]; skipped: number; error?: string } {
  const table = parseTable(text);
  const hi = table.findIndex((r) => {
    const f = r.map(headerField);
    return f.includes("status") && f.includes("name");
  });
  if (hi < 0) return { rows: [], columns: [], skipped: 0, error: "Couldn't find the header row — copy it too (Status, Bot, Part #_Name, …)." };
  const fields = table[hi].map(headerField);
  const columns = [...new Set(fields.filter((f): f is Col => !!f))];
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of table.slice(hi + 1)) {
    const get = (f: Col) => {
      const i = fields.indexOf(f);
      return i >= 0 ? (r[i] ?? "").trim() : "";
    };
    const name = get("name");
    if (!name) {
      skipped++;
      continue;
    }
    const n = (v: string) => {
      const x = Number(v.replace(/[^\d.]/g, ""));
      return v && Number.isFinite(x) ? Math.round(x) : null;
    };
    const pri = n(get("priority"));
    const row: ImportRow = {
      name,
      status: statusFromText(get("status")) ?? "not_started",
      priority: pri !== null && pri >= 0 && pri <= 4 ? pri : null,
      qty: n(get("qty")) ?? 1,
      spare_qty: n(get("spare_qty")) ?? 0,
    };
    for (const f of TEXT_FIELDS) {
      if (f === "name") continue;
      // the 3D printing sheet numbers its subsystems ("02. Intake"); match the machining names
      const v = f === "subsystem" ? get(f).replace(/^\d+\.\s*/, "") : get(f);
      if (v) row[f] = v;
    }
    rows.push(row);
  }
  return { rows, columns, skipped };
}

/** Same part on the same bot = the same row, so importing again updates instead of duplicating. */
export const jobKey = (j: { bot?: string; name: string }) => `${(j.bot ?? "").trim().toLowerCase()}|${j.name.trim().toLowerCase()}`;
