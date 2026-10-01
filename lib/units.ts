/**
 * Length units for the fab stock app. Everything is stored in millimetres;
 * people type and read inches (with shop fractions) or millimetres.
 */
export type Units = "in" | "mm";
export const UNITS_COOKIE = "fab_units";
export const MM_PER_IN = 25.4;

export function isUnits(v: unknown): v is Units {
  return v === "in" || v === "mm";
}

/** "1/2" → 0.5, "27 1/2" / "27-1/2" → 27.5, "27.5" → 27.5. */
function parseNumber(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  // European decimal comma, when it can't be a thousands separator
  if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  let m = /^(\d+(?:\.\d+)?)?\s*(?:[\s-]\s*)?(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const whole = m[1] ? Number(m[1]) : 0;
    const den = Number(m[3]);
    if (!den) return null;
    return whole + Number(m[2]) / den;
  }
  m = /^(\d*\.?\d+)$/.exec(s);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Parse a typed length into mm. Accepts `27 1/2`, `27.5"`, `2' 3"`, `2ft`,
 * `700mm`, `70 cm`, `1.2 m`; a bare number is read in `fallback` units.
 */
export function parseLength(raw: string, fallback: Units): number | null {
  const mm = parseLengthRaw(raw, fallback);
  // round off float noise from the inch ↔ mm round trip (609.5999… → 609.6)
  if (mm === null || !Number.isFinite(mm) || mm <= 0) return null;
  const rounded = Math.round(mm * 1000) / 1000;
  return Number.isFinite(rounded) && rounded > 0 ? rounded : null;
}

function parseLengthRaw(raw: string, fallback: Units): number | null {
  let s = raw.trim().toLowerCase().replace(/[″]/g, '"').replace(/[′’]/g, "'");
  if (!s) return null;

  // feet (+ optional inches): 2' 3 1/2"  |  2ft 3in  |  2'
  const ft = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(.*)$/.exec(s);
  if (ft) {
    const feet = Number(ft[1]);
    const rest = ft[2].replace(/(?:"|''|in|inch|inches)$/, "").replace(/^-/, "").trim();
    const inches = rest ? parseNumber(rest) : 0;
    if (inches === null) return null;
    return (feet * 12 + inches) * MM_PER_IN;
  }

  let unit: Units | "cm" | "m" = fallback;
  const suffix = /(mm|cm|m|"|''|in|inch|inches)$/.exec(s);
  if (suffix) {
    const u = suffix[1];
    unit = u === "mm" ? "mm" : u === "cm" ? "cm" : u === "m" ? "m" : "in";
    s = s.slice(0, -u.length).trim();
  }
  const n = parseNumber(s);
  if (n === null || n <= 0) return null;
  switch (unit) {
    case "in":
      return n * MM_PER_IN;
    case "cm":
      return n * 10;
    case "m":
      return n * 1000;
    default:
      return n;
  }
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Inches as a shop fraction to the nearest 1/`den`: 27.5 → "27 1/2". */
export function inchFraction(inches: number, den = 16): string {
  const sign = inches < 0 ? "-" : "";
  let n = Math.round(Math.abs(inches) * den);
  const whole = Math.floor(n / den);
  n -= whole * den;
  if (!n) return `${sign}${whole}`;
  const g = gcd(n, den);
  const frac = `${n / g}/${den / g}`;
  return whole ? `${sign}${whole} ${frac}` : `${sign}${frac}`;
}

function trim(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}

/** A measured length in the viewer's units: `27 1/2"` or `698.5 mm`. */
export function fmtLength(mm: number | null | undefined, units: Units): string {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return "—";
  if (units === "mm") return `${trim(mm, mm >= 100 ? 0 : 1)} mm`;
  return `${inchFraction(mm / MM_PER_IN)}"`;
}

/** Length as a plain number in the viewer's units (for inputs): `27 1/2` or `698.5`. */
export function lengthInputValue(mm: number | null | undefined, units: Units): string {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return "";
  return units === "mm" ? trim(mm, 1) : inchFraction(mm / MM_PER_IN);
}

/** Sheet piece: `24" × 48"` / `610 × 1219 mm`. */
export function fmtRect(w: number, l: number, units: Units): string {
  if (units === "mm") return `${trim(w, 0)} × ${trim(l, 0)} mm`;
  return `${inchFraction(w / MM_PER_IN)}" × ${inchFraction(l / MM_PER_IN)}"`;
}

export function fmtArea(mm2: number | null | undefined, units: Units): string {
  if (mm2 === null || mm2 === undefined || !Number.isFinite(mm2)) return "—";
  if (units === "mm") {
    const cm2 = mm2 / 100;
    return cm2 >= 10_000 ? `${trim(cm2 / 10_000, 2)} m²` : `${Math.round(cm2).toLocaleString()} cm²`;
  }
  const in2 = mm2 / (MM_PER_IN * MM_PER_IN);
  return `${Math.round(in2).toLocaleString()} in²`;
}

/**
 * A nominal size in the material's own system, the way it's sold:
 * `1/16`, `.090`, `2` (inches) or `1.5` (mm). No unit suffix.
 */
export function fmtNominal(mm: number, system: Units): string {
  if (system === "mm") return trim(mm, 2);
  const inches = mm / MM_PER_IN;
  for (const den of [1, 2, 4, 8, 16, 32, 64]) {
    const n = inches * den;
    if (Math.abs(n - Math.round(n)) < 0.001 * den) return inchFraction(inches, den);
  }
  return trim(inches, 3).replace(/^0\./, ".");
}
