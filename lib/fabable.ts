import { sizesFromText } from "./parts";

/**
 * Which sheet stock we can fabricate, from the team's "Standard Stock List"
 * sheet: every material × thickness cell highlighted green or yellow there is
 * fab-able, the rest isn't. Keep this in step with that sheet.
 */
export type SheetFamily = "aluminum" | "polycarbonate" | "srpp";

const IN = 25.4;

/** Thicknesses the list has a column for, in inches (thickest first, as on the sheet). */
const STANDARD_THICKNESS: [number, string][] = [
  [1, '1"'],
  [1 / 2, '1/2"'],
  [3 / 8, '3/8"'],
  [1 / 4, '1/4"'],
  [3 / 16, '3/16"'],
  [1 / 8, '1/8"'],
  [3 / 32, '3/32"'],
  [1 / 16, '1/16"'],
  [1 / 32, '1/32"'],
];

/** The highlighted (green / yellow) thicknesses for each material, in inches. */
export const FABABLE_THICKNESS: Record<SheetFamily, number[]> = {
  aluminum: [1 / 4, 3 / 16, 1 / 8, 1 / 16],
  polycarbonate: [1 / 8, 3 / 32, 1 / 16],
  srpp: [1 / 4],
};
export const FAMILY_LABEL: Record<SheetFamily, string> = { aluminum: "Aluminum", polycarbonate: "Polycarbonate", srpp: "SRPP" };

/** Which of the list's materials a material text names; null when it isn't one of them. */
export function sheetFamily(text: string): SheetFamily | null {
  const m = text.toLowerCase();
  // corrugated polycarbonate is a different stock from the Polycarbonate row
  if (/corrugat/.test(m)) return null;
  if (/polycarb|lexan/.test(m)) return "polycarbonate";
  if (/srpp|polyprop|\bpp\b/.test(m)) return "srpp";
  if (/alum|606\d|707\d|\bal\b/.test(m)) return "aluminum";
  return null;
}

/** The standard thickness a size in mm is, if it's one of the list's. */
export function standardThickness(mm: number): { inch: number; label: string } | null {
  const hit = STANDARD_THICKNESS.find(([inch]) => Math.abs(inch * IN - mm) <= 0.3);
  return hit ? { inch: hit[0], label: hit[1] } : null;
}

export interface Fabability {
  /** null = can't tell (material or thickness missing, or not on the list) */
  fabable: boolean | null;
  label: string;
  reason: string;
}

/**
 * Whether we can fabricate a sheet part, from its material and thickness
 * (the stock dimensions text first, then the part's measured thickness).
 */
export function sheetFabability(part: { material_text: string; stock_dims: string; size_t_mm: number | null }): Fabability {
  const unknown = (reason: string): Fabability => ({ fabable: null, label: "Check", reason });
  if (!part.material_text.trim()) return unknown("No material set");
  const family = sheetFamily(part.material_text);
  if (!family) return unknown(`${part.material_text.trim()} isn't on the Standard Stock List`);
  const t = sizesFromText(part.material_text, part.stock_dims, "").t ?? part.size_t_mm;
  if (t === null) return unknown("No thickness set");
  const std = standardThickness(t);
  if (!std) return unknown(`${+(t / IN).toFixed(3)}" isn't a standard sheet thickness`);
  const name = `${std.label} ${FAMILY_LABEL[family]}`;
  return FABABLE_THICKNESS[family].some((x) => x === std.inch)
    ? { fabable: true, label: "Fab-able", reason: `${name} is a green/yellow size on the Standard Stock List` }
    : { fabable: false, label: "Not fab-able", reason: `${name} isn't a green/yellow size on the Standard Stock List` };
}
