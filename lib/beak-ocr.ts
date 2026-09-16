/**
 * Read a photo of the CTRE Battery Beak's results screen.
 *
 * The Beak's OLED shows (orange, then blue, on black):
 *
 *   Status: Good          SLA
 *   Charge: 115%
 *   V0: 12.911 @  0 Amps
 *   V1: 12.821 @  1 Amp
 *   V2: 12.586 @ 18 Amps
 *   Rint: 0.014 Ohms
 *
 * OCR runs on-device with Tesseract.js (WASM in a web worker). Assets are
 * served from /ocr (see scripts/ocr-assets.mjs) so it works offline once
 * cached.
 *
 * Tesseract was never trained on this 5×7 pixel font, and a pit photo is a
 * long way from a scan, so most of this file is getting a clean, level,
 * black-on-white image of the six rows in front of it:
 *  1. find the screen by colour — it is the only thing in frame that is both
 *     saturated yellow (Status/Charge rows) and saturated blue (readings);
 *  2. crop to it, rotate it level, and binarise per colour class with a
 *     top-hat (so the glass's grey reflection and the glow around each row
 *     drop out) and a closing that heals the OLED's dot grid;
 *  3. repair the font's slashed zeros (Ø, which read as 8) into plain 0s;
 *  4. OCR the same mask at several glyph heights and decide each field by
 *     majority vote — Tesseract's misreads vary with scale, the right answer
 *     doesn't — and leave a field blank unless two passes agree;
 *  5. parse forgivingly (O↔0, l/I↔1, S↔5, %↔digit, ":"↔"s"), identify
 *     V0/V1/V2 by the "@ N Amps" current or screen order rather than the
 *     label digit, and reject values a Beak can't display.
 */

import type { BeakStatus } from "./types";

export type { BeakStatus };

export interface BeakReading {
  status?: BeakStatus;
  charge_pct?: number;
  /** Open-circuit voltage (@ 0 A) — what the app logs as `voltage`. */
  v0?: number;
  /** Voltage under the 1 A load. */
  v1?: number;
  /** Voltage under the 18 A load. */
  v2?: number;
  /** Internal resistance in mΩ (the Beak shows Ohms; converted here). */
  rint_mohm?: number;
  chemistry?: string;
}

export interface BeakScan {
  /** Majority-vote result across all OCR passes. */
  reading: BeakReading;
  /** Raw text of every pass, for the "what the reader saw" disclosure. */
  rawText: string;
  /** How many passes agreed on the voltage / IR (0 when unread). */
  votes: { v0: number; rint: number };
}

export type ScanProgress = { step: "loading" | "preprocessing" | "recognizing"; progress: number };

// ---------------------------------------------------------------------------
// Parsing

/** Digits an LSTM model commonly swaps for letters inside a numeric token. */
function numeric(tok: string): number | undefined {
  const cleaned = tok
    .replace(/[Oo°@]/g, "0")
    .replace(/[lIi|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/B/g, "8")
    .replace(/,/g, ".")
    .replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

const NUM = "[0-9OoIlS|,.]+";

function parseStatus(line: string): BeakStatus | undefined {
  if (/g[o0]{2}d/i.test(line)) return "Good";
  if (/fa[il1]r/i.test(line)) return "Fair";
  if (/\bba[dc]\b/i.test(line)) return "Bad";
  if (/ch[a-z]*\s*ba[t7]/i.test(line)) return "Charge Battery";
  return undefined;
}

export function parseBeakText(text: string): BeakReading {
  const r: BeakReading = {};
  const volts: { v: number; slot: number | undefined }[] = [];
  // Rotated renders leave stray dots/bars at line starts; drop them so a "."
  // isn't mistaken for the label's colon.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[^a-z0-9]+/i, ""))
    .filter(Boolean);

  for (const line of lines) {
    // Status: Good      NiMH / SLA / Lead
    if (/^s[ti]a[ti]u[s5]/i.test(line) || /[a-z]atus/i.test(line)) {
      r.status ??= parseStatus(line);
      const chem = line.match(/\b(NiMH|SLA|Lead|Pb|Li[a-z]*)\b/i);
      if (chem) r.chemistry = chem[1];
      continue;
    }
    // Charge: 115%   (skip if it's the "Charge Battery" status line)
    const charge = line.match(new RegExp(`^(?:c?h?a?r?ge|ch[a-z]*)\\s*[:;]?\\s*(${NUM})\\s*[%Zz]?`, "i"));
    if (charge && !/ba[t7]/i.test(line)) {
      let pct = numeric(charge[1]);
      // Charge is 0–130 %, so three digits above that means the "%" was read
      // as a digit ("83%" → "834"): drop it.
      if (pct !== undefined && pct > 130 && charge[1].length >= 3) pct = numeric(charge[1].slice(0, -1));
      if (pct !== undefined && pct >= 0 && pct <= 130) r.charge_pct = Math.round(pct);
      continue;
    }
    // V0: 12.911 @  0 Amps  — prefer the current to identify the row. The
    // label often comes back as "Vg:"/"yo:"/"U0:" or just "0:", and the colon
    // as "s", so accept up to two characters before the separator and take
    // the last as the index.
    const volt = line.match(new RegExp(`^(?:[a-z]\\s*)?([0-9a-z|])?\\s*[:;.s]\\s*(${NUM})(?:\\s*[@a]+\\s*(${NUM})\\s*[ab])?`, "i"));
    if (volt) {
      const v = numeric(volt[2]);
      // The Beak prints three decimals; anything without 2–3 is a misread.
      if (v === undefined || v < 4 || v > 20 || !/[.,][0-9OoIlS|]{2,3}$/.test(volt[2])) continue;
      const amps = volt[3] !== undefined ? numeric(volt[3]) : undefined;
      const idx = volt[1] !== undefined ? numeric(volt[1]) : undefined;
      const slot = amps === 0 ? 0 : amps === 1 ? 1 : amps !== undefined && amps >= 10 ? 2 : idx !== undefined && idx <= 2 ? idx : undefined;
      volts.push({ v, slot });
      continue;
    }
    // Rint: 0.014 Ohms
    // Lazy number so the "O" of "Ohms" isn't swallowed as a zero.
    // ("@" is what a leading Ø turns into when the LSTM gives up on it.)
    const rint = line.match(new RegExp(`^r\\s*[il1I]?\\s*[nh]\\s*[t7]?\\s*[:;.s]?\\s*(@?${NUM}?)\\s*(m)?\\s*[o0@]?h?[mn]`, "i"));
    if (rint) {
      const raw = rint[1].replace(/,/g, ".");
      // The LSTM's language prior dislikes numbers that start with "0." and
      // returns "8.014" / "6.014" for 0.014. The Beak can't show ≥ 1 Ω, so
      // one digit before the point is always a zero.
      const lead = raw.match(/^[0-9OoIlS|B@]\.([0-9OoIlS|B]{3})$/);
      const n = numeric(lead ? `0.${lead[1]}` : raw);
      if (n === undefined) continue;
      // Otherwise a value ≥ 1 with no "m" means the decimal point got lost —
      // better to leave it blank than log 14 000 mΩ.
      const mohm = rint[2] ? n : n < 1 ? n * 1000 : undefined;
      if (mohm !== undefined && mohm >= 1 && mohm <= 200) r.rint_mohm = Math.round(mohm * 10) / 10;
      continue;
    }
  }

  // Place voltage rows by their identified slot; rows whose label was
  // unreadable fill the remaining slots in screen order (V0 is printed first,
  // and its Ø is the label most often mangled).
  const slots: (number | undefined)[] = [undefined, undefined, undefined];
  for (const { v, slot } of volts) if (slot !== undefined && slots[slot] === undefined) slots[slot] = v;
  for (const { v, slot } of volts) {
    if (slot !== undefined) continue;
    const free = slots.indexOf(undefined);
    if (free !== -1) slots[free] = v;
  }
  // Voltage can only fall as load rises; a row that breaks that is a misread.
  if (slots[1] !== undefined && slots[0] !== undefined && slots[1] > slots[0]) slots[1] = undefined;
  if (slots[2] !== undefined && slots[0] !== undefined && slots[2] > slots[0]) slots[2] = undefined;
  [r.v0, r.v1, r.v2] = slots;
  return r;
}

/**
 * Majority vote per field across several OCR passes. Ties go to the earlier
 * pass. Once three or more passes have run, a value needs two of them to
 * agree — a lone reading is more likely a misread than a fact, and a blank
 * field the user fills in beats a wrong one they might not notice.
 */
export function voteReadings(passes: BeakReading[]): { reading: BeakReading; votes: { v0: number; rint: number } } {
  const need = passes.length >= 3 ? 2 : 1;
  function pick<K extends keyof BeakReading>(key: K): { value: BeakReading[K]; votes: number } {
    const counts = new Map<string, { value: BeakReading[K]; n: number }>();
    for (const p of passes) {
      const v = p[key];
      if (v === undefined) continue;
      const k = String(v);
      const e = counts.get(k);
      if (e) e.n++;
      else counts.set(k, { value: v, n: 1 });
    }
    let best: { value: BeakReading[K]; n: number } | undefined;
    for (const e of counts.values()) if (!best || e.n > best.n) best = e;
    if (!best || best.n < need) return { value: undefined, votes: best?.n ?? 0 };
    return { value: best.value, votes: best.n };
  }
  const reading: BeakReading = {};
  const v0 = pick("v0");
  const rint = pick("rint_mohm");
  reading.v0 = v0.value;
  reading.rint_mohm = rint.value;
  reading.v1 = pick("v1").value;
  reading.v2 = pick("v2").value;
  reading.charge_pct = pick("charge_pct").value;
  reading.status = pick("status").value;
  reading.chemistry = pick("chemistry").value;
  for (const k of Object.keys(reading) as (keyof BeakReading)[]) if (reading[k] === undefined) delete reading[k];
  return { reading, votes: { v0: v0.votes, rint: rint.votes } };
}

/** How many of the fields the app cares about were read. */
export function scoreReading(r: BeakReading): number {
  return (r.v0 !== undefined ? 3 : 0) + (r.rint_mohm !== undefined ? 3 : 0) + (r.charge_pct !== undefined ? 1 : 0) + (r.status ? 1 : 0) + (r.v2 !== undefined ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Image preprocessing (browser only)

/** Glyph (cap) heights, in px, to OCR at. Spread deliberately: misreads differ by scale, so they get outvoted. */
const GLYPH_TARGETS_PX = [22, 26, 31, 37, 44];

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return createImageBitmap(file);
  }
}

interface Glyph {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Binarized {
  fg: Uint8Array; // 1 = text
  w: number;
  h: number;
  /** Typical digit/capital height in px, from connected components. */
  capHeight: number;
  /** Digit-shaped components, in mask coordinates. */
  glyphs: Glyph[];
  /** Tilt of the text rows in radians (positive = clockwise), estimated from the glyphs. */
  skew: number;
}

/** Glyph height to aim for when re-binarising the located screen. Big enough for the Ø repair to see the holes. */
const TARGET_CAP_PX = 56;
/** Where the binarisation cut sits between Otsu's threshold (0) and the lit class's mean (1). */
const CUT_LEVEL = 0.35;
/** Closing radius as a fraction of the OLED pixel pitch: heals the dot grid, must stay under the 1-pitch glyph gap. */
const CLOSE_PITCH = 0.3;

/**
 * Turn a phone photo of the OLED into a clean text mask. First find the
 * screen by colour — it is the only thing in a pit photo that is both
 * saturated yellow (Status/Charge rows) and saturated blue (readings) — then
 * crop the source to it and binarise at a size where glyph holes are big
 * enough to inspect. If the screen has a visible pixel grid, a second round
 * at the measured glyph height closes it.
 */
function binarize(bmp: ImageBitmap): Binarized {
  const region = locateScreen(bmp) ?? { x: 0, y: 0, w: bmp.width, h: bmp.height };
  const maxScale = 2400 / Math.max(region.w, region.h);
  // Round 1 — a guess at the scale (six text rows fill the screen; the
  // region has some padding, so this lands a little small) to measure the
  // glyph height.
  let scale = Math.min(TARGET_CAP_PX / (region.h / 8.5), maxScale, 6);
  const probe = binarizeRegion(bmp, region, scale, 0);
  // Trust the measurement only if it looks like glyphs, not OLED dots or
  // merged rows.
  const trusted = probe.glyphs.length >= 8 && probe.capHeight >= TARGET_CAP_PX * 0.35 && probe.capHeight <= TARGET_CAP_PX * 2.5;
  if (trusted) scale = Math.min(scale * (TARGET_CAP_PX / probe.capHeight), maxScale, 6);
  // Round 2 — at the target glyph height, and with the photo rotated level
  // first: binarising the tilted image and rotating the mask afterwards
  // leaves ragged strokes, which is exactly what Tesseract misreads.
  return binarizeRegion(bmp, region, scale, trusted ? probe.skew : 0);
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Find the Beak's screen in the photo by colour. Working on a small copy,
 * score every pixel for OLED-yellow (R and G high, B low) and OLED-blue (B
 * well above R and G), bucket the hits into coarse cells, join neighbouring
 * cells into blobs, and take the blob that has the most of *both* colours.
 * Case lettering (green), cables (red), skin and grey pit clutter score
 * nothing; a yellow box or blue tape scores one colour but not both.
 * Returns the padded region in source pixels, or null if nothing plausible.
 */
function locateScreen(bmp: ImageBitmap): Region | null {
  const scale = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const CELL = 8;
  const cw = Math.ceil(w / CELL);
  const ch = Math.ceil(h / CELL);
  const yellow = new Uint16Array(cw * ch);
  const blue = new Uint16Array(cw * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const r = px[o];
      const g = px[o + 1];
      const b = px[o + 2];
      if (Math.max(r, g, b) < 90) continue; // lit pixels only
      const c = (y / CELL | 0) * cw + (x / CELL | 0);
      if (Math.min(r, g) - b > 60) yellow[c]++;
      else if (b - r > 60 && b > 120) blue[c]++; // blue or cyan: B high, R low
    }
  }

  // Cells with enough hits are "text"; dilate by one cell so rows of a
  // screen join into one blob, then label blobs.
  const MIN_HITS = 3;
  const text = new Uint8Array(cw * ch);
  for (let c = 0; c < cw * ch; c++) if (yellow[c] + blue[c] >= MIN_HITS) text[c] = 1;
  const grown = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      let any = 0;
      for (let dy = -1; dy <= 1 && !any; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && text[ny * cw + nx]) {
            any = 1;
            break;
          }
        }
      grown[cy * cw + cx] = any;
    }
  const label = new Int32Array(cw * ch);
  let best: { score: number; total: number; x0: number; y0: number; x1: number; y1: number } | null = null;
  let id = 0;
  const stack: number[] = [];
  for (let seed = 0; seed < cw * ch; seed++) {
    if (!grown[seed] || label[seed]) continue;
    id++;
    label[seed] = id;
    stack.push(seed);
    let ys = 0;
    let bs = 0;
    let x0 = cw;
    let y0 = ch;
    let x1 = 0;
    let y1 = 0;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cw;
      const cy = (c - cx) / cw;
      ys += yellow[c];
      bs += blue[c];
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const q = ny * cw + nx;
          if (grown[q] && !label[q]) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    // Both colours needed; the weaker one sets the score so a big yellow box
    // with a stray blue speck can't win over a real screen.
    const score = Math.min(ys, bs);
    if (score > 0 && (!best || score > best.score)) best = { score, total: ys + bs, x0, y0, x1, y1 };
  }
  if (!best || best.total < 40) return null;

  // Back to source pixels, padded by a text row so nothing is clipped.
  const bw = (best.x1 - best.x0 + 1) * CELL;
  const bh = (best.y1 - best.y0 + 1) * CELL;
  const pad = Math.max(CELL * 2, bh * 0.2);
  const x = Math.max(0, (best.x0 * CELL - pad) / scale);
  const y = Math.max(0, (best.y0 * CELL - pad) / scale);
  const x1 = Math.min(bmp.width, (best.x0 * CELL + bw + pad) / scale);
  const y1 = Math.min(bmp.height, (best.y0 * CELL + bh + pad) / scale);
  return { x, y, w: x1 - x, h: y1 - y };
}

/**
 * Binarise one region of the photo: colour-based text-ness, a small blur,
 * a global threshold, an optional closing for the OLED's dot grid, then
 * specks go and the slashed zeros are repaired.
 */
function binarizeRegion(bmp: ImageBitmap, region: Region, scale: number, rotate: number): Binarized {
  // Canvas sized to the rotated region's bounding box; the region is drawn
  // scaled and turned by -rotate about its centre so text rows come out level.
  const sw = region.w * scale;
  const sh = region.h * scale;
  const cos = Math.abs(Math.cos(rotate));
  const sin = Math.abs(Math.sin(rotate));
  const w = Math.max(1, Math.round(sw * cos + sh * sin));
  const h = Math.max(1, Math.round(sw * sin + sh * cos));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-rotate);
  ctx.drawImage(bmp, region.x, region.y, region.w, region.h, -sw / 2, -sh / 2, sw, sh);

  const px = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  // Value = mean(R,G,B), split by colour class. Cameras blow out the OLED's
  // dominant channel across the whole glow around a row (B ≈ 255 on both the
  // blue text and its halo), so neither max(R,G,B) nor a colour difference
  // separates core from glow; the mean does, because a core is near-white
  // (135,255,255 → 215) and the glow is pure colour (10,120,217 → 116), and
  // it still works for dim, unsaturated text. Colour only decides the class —
  // yellowish (Status/Charge rows), bluish (readings) or white (a saturated
  // core, either) — and green (bezel, traces) is dropped. Each class is
  // background-subtracted and thresholded on its own, so the yellow rows,
  // which cameras usually expose dimmer, get a cut that fits them.
  const yel = new Uint8Array(n);
  const blu = new Uint8Array(n);
  // 1 where the pixel is actually coloured (not a white core): only these
  // vote on each class's threshold, so grey case or glare can't skew it.
  const colored = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    const value = Math.round((r + g + b) / 3);
    const yellowish = Math.min(r, g) - b > 30;
    const bluish = b - r > 30;
    // Green — the bezel outline and traces, including the pale green the
    // outline photographs as — is never text.
    if (!yellowish && !bluish && g > Math.max(r, b) + 25) continue;
    // A saturated core has two channels pinned near 255 (135,255,255); the
    // grey case (170,170,175) does not.
    const white = !yellowish && !bluish && r + g + b - Math.max(r, g, b) - Math.min(r, g, b) >= 230 && Math.max(r, g, b) >= 240;
    if (yellowish || white) yel[i] = value;
    if (bluish || white) blu[i] = value;
    if (yellowish || bluish) colored[i] = 1;
  }
  // Top-hat per class: estimate the background by a grayscale opening wider
  // than a bloomed stroke (text can't survive it, the glass's reflection
  // does) and keep only what rises above it. A stroke is one OLED pixel but
  // blooms to two or more in a photo, so the window is three pitches; the
  // 128-px-wide panel fills most of the region, so pitch ≈ w/170.
  const pitch = sw / 170;
  const openR = Math.max(4, Math.round(pitch * 3));
  const fg = new Uint8Array(n);
  for (const ch of [yel, blu]) {
    const bg = grayOpen(ch, w, h, openR);
    const detail = new Uint8Array(n);
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      detail[i] = Math.max(0, ch[i] - bg[i]);
      hist[detail[i]]++;
    }
    // Skip a colour that isn't in the picture: its 99th percentile is noise.
    let acc = 0;
    let p99 = 255;
    for (; p99 > 0 && acc < n * 0.01; p99--) acc += hist[p99];
    if (p99 < 12) continue;
    const lum = boxBlur3(detail, w, h);
    const thresh = otsuLevel(lum, colored);
    for (let i = 0; i < n; i++) if (lum[i] > thresh) fg[i] = 1;
  }
  // The OLED's physical pixels show as a dot grid; close the gaps (dilate
  // then erode) so each glyph is one solid shape. Dot gaps are ~0.3 pitch,
  // the gap between glyphs a full pitch, so a 0.3-pitch radius bridges one
  // and not the other.
  closeMask(fg, w, h, Math.max(1, Math.round(pitch * CLOSE_PITCH)));
  const glyphs = cleanAndRepair(fg, w, h);
  const capHeight = typicalHeight(glyphs.map((g) => g.h)) || h / 12;
  return { fg, w, h, capHeight, glyphs, skew: estimateSkew(glyphs, capHeight) };
}

/** Render the text mask (black on white) scaled so glyphs are `targetPx` tall. */
function renderScaled(b: Binarized, targetPx: number): Promise<Blob> {
  const factor = Math.min(1.5, targetPx / b.capHeight);
  const src = document.createElement("canvas");
  src.width = b.w;
  src.height = b.h;
  const sctx = src.getContext("2d")!;
  const img = sctx.createImageData(b.w, b.h);
  for (let i = 0; i < b.fg.length; i++) {
    const v = b.fg[i] ? 0 : 255;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  // Scale, then rotate by the negative skew so the rows come out level. The
  // canvas is sized to the rotated bounding box plus a margin (Tesseract
  // likes white space around the text).
  const sw = b.w * factor;
  const sh = b.h * factor;
  const cos = Math.abs(Math.cos(b.skew));
  const sin = Math.abs(Math.sin(b.skew));
  const pad = Math.round(targetPx);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * cos + sh * sin)) + pad * 2;
  out.height = Math.max(1, Math.round(sw * sin + sh * cos)) + pad * 2;
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.translate(out.width / 2, out.height / 2);
  octx.rotate(-b.skew);
  octx.drawImage(src, -sw / 2, -sh / 2, sw, sh);
  return new Promise((resolve, reject) =>
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/png"),
  );
}

/**
 * Text-row tilt from the glyph centres: try angles in ±15°, project the
 * centres onto the axis perpendicular to each, and keep the angle whose
 * projection is the most tightly clustered (level rows stack into a few
 * sharp bins; tilted rows smear). Returns 0 with too few glyphs to judge.
 */
function estimateSkew(glyphs: Glyph[], capHeight: number): number {
  const pts = glyphs.filter((g) => g.h >= capHeight / 1.25 && g.h <= capHeight * 1.25);
  if (pts.length < 8) return 0;
  const bin = Math.max(2, capHeight / 3);
  let best = 0;
  let bestScore = -1;
  for (let deg = -15; deg <= 15; deg += 0.5) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const counts = new Map<number, number>();
    for (const g of pts) {
      const y = (g.y + g.h / 2) * c - (g.x + g.w / 2) * sn;
      const k = Math.round(y / bin);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let score = 0;
    for (const n of counts.values()) score += n * n;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Morphological closing with a (2r+1)² square: dilate, then erode. Separable max/min passes, in place. */
function closeMask(fg: Uint8Array, w: number, h: number, r: number) {
  const tmp = new Uint8Array(fg.length);
  const pass = (src: Uint8Array, dst: Uint8Array, pick: 1 | 0) => {
    // horizontal
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = pick ^ 1;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (src[y * w + nx] === pick) {
            v = pick;
            break;
          }
        }
        dst[y * w + x] = v;
      }
    // vertical
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        let v = pick ^ 1;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          if (dst[ny * w + x] === pick) {
            v = pick;
            break;
          }
        }
        src[y * w + x] = v;
      }
  };
  pass(fg, tmp, 1); // dilate: any 1 in the window → 1
  pass(fg, tmp, 0); // erode: any 0 in the window → 0
}

/**
 * Threshold level for a class: Otsu's cut over the voting pixels, raised
 * halfway toward the lit class's mean. Otsu separates lit from unlit, but
 * camera blur gives each stroke a halo just above that cut, doubling its
 * width and fusing neighbours; glyph cores are far brighter than halos, so
 * the midpoint sits about at the stroke's true edge (the mean itself is too
 * tight — only the OLED dot cores survive). Only pixels flagged in `votes`
 * with a non-zero value are counted, so masked-out pixels and white glare
 * can't pull the cut around.
 */
function otsuLevel(lum: Uint8Array, votes: Uint8Array): number {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < lum.length; i++)
    if (votes[i] && lum[i] > 0) {
      hist[lum[i]]++;
      n++;
    }
  if (n === 0) return 255;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thresh = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thresh = t;
    }
  }
  let litSum = 0;
  let litN = 0;
  for (let t = thresh + 1; t < 256; t++) {
    litSum += t * hist[t];
    litN += hist[t];
  }
  if (litN) thresh = Math.min(250, Math.round(thresh + (litSum / litN - thresh) * CUT_LEVEL));
  return thresh;
}

/** Most common glyph height (±20 %), so stray noise blobs can't skew it. */
function typicalHeight(heights: number[]): number {
  if (!heights.length) return 0;
  const sorted = [...heights].sort((a, b) => a - b);
  let bestCount = 0;
  let bestMedian = sorted[0];
  let j = 0;
  for (let i = 0; i < sorted.length; i++) {
    while (sorted[j] < sorted[i] / 1.2) j++;
    const count = i - j + 1;
    if (count > bestCount) {
      bestCount = count;
      bestMedian = sorted[Math.floor((i + j) / 2)];
    }
  }
  return bestMedian;
}

/** Grayscale opening (min filter then max filter) with a (2r+1)² square, separable. */
function grayOpen(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const a = new Uint8Array(src.length);
  const b = new Uint8Array(src.length);
  const filt = (input: Uint8Array, out: Uint8Array, useMin: boolean) => {
    // horizontal into `a`, then vertical into `out`
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = useMin ? 255 : 0;
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(w - 1, x + r);
        for (let xx = x0; xx <= x1; xx++) {
          const p = input[y * w + xx];
          if (useMin ? p < v : p > v) v = p;
        }
        a[y * w + x] = v;
      }
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        let v = useMin ? 255 : 0;
        const y0 = Math.max(0, y - r);
        const y1 = Math.min(h - 1, y + r);
        for (let yy = y0; yy <= y1; yy++) {
          const p = a[yy * w + x];
          if (useMin ? p < v : p > v) v = p;
        }
        out[y * w + x] = v;
      }
  };
  filt(src, b, true); // erode
  const out = new Uint8Array(src.length);
  filt(b, out, false); // dilate
  return out;
}

function boxBlur3(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let sum = 0;
      let cnt = 0;
      for (let yy = y0; yy <= y1; yy++)
        for (let xx = x0; xx <= x1; xx++) {
          sum += src[yy * w + xx];
          cnt++;
        }
      out[y * w + x] = Math.round(sum / cnt);
    }
  }
  return out;
}

/** Height difference between the left and right thirds of a hole's edge (per-column y, -1 = no pixel). */
function edgeTilt(edge: Int16Array): number {
  const cols: number[] = [];
  for (let x = 0; x < edge.length; x++) if (edge[x] !== -1) cols.push(edge[x]);
  if (cols.length < 6) return 0;
  const third = Math.max(1, Math.floor(cols.length / 3));
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.abs(mean(cols.slice(0, third)) - mean(cols.slice(-third)));
}

/**
 * Two jobs in one pass over the connected components of the mask:
 *
 *  - drop specks and anything glyph-sized-or-bigger-than-a-line (bezel
 *    edges, reflections), so Tesseract sees text and little else;
 *  - repair slashed zeros. The Beak's font draws zero with a slash (Ø) and
 *    Tesseract reads that as 8 — "0.010 Ohms" becomes "8.818", which for IR
 *    is a retire-vs-fine difference. Digit-sized glyphs whose two holes sit
 *    diagonally (an 8's holes stack vertically, a %'s holes are tiny) get
 *    their interior stroke erased, leaving a plain 0.
 *
 * Works in place; returns the boxes of digit-shaped glyphs.
 */
function cleanAndRepair(fg: Uint8Array, w: number, h: number): Glyph[] {
  const n = w * h;
  const glyphs: Glyph[] = [];
  const label = new Int32Array(n); // 0 = unvisited, >0 component id
  const stack: number[] = [];
  let next = 0;

  for (let start = 0; start < n; start++) {
    if (!fg[start] || label[start]) continue;
    const id = ++next;
    // --- collect the component
    const pixels: number[] = [];
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop()!;
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (fg[q] && !label[q]) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    // Noise: specks, or anything taller than a text line / wider than a word.
    if ((bw < 4 && bh < 4) || pixels.length < 6 || bh > h / 4 || bw > w / 4) {
      for (const p of pixels) fg[p] = 0;
      continue;
    }
    // Digit-shaped? Taller than wide, not a screen-sized blob.
    if (bw < 5 || bh < 8 || bh / bw < 1.1 || bh / bw > 2.6) continue;
    if (pixels.length > 0.8 * bw * bh) continue;
    glyphs.push({ x: minX, y: minY, w: bw, h: bh });

    // --- classify background inside a 1px-padded bbox: exterior vs holes
    const x0 = Math.max(0, minX - 1);
    const y0 = Math.max(0, minY - 1);
    const x1 = Math.min(w - 1, maxX + 1);
    const y1 = Math.min(h - 1, maxY + 1);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    // 0 = unknown bg, 1 = this glyph, 2 = exterior bg, 3+ = hole ids
    const cls = new Uint8Array(cw * ch);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (label[y * w + x] === id) cls[(y - y0) * cw + (x - x0)] = 1;
    const flood = (seed: number, mark: number, list?: number[]) => {
      stack.push(seed);
      cls[seed] = mark;
      while (stack.length) {
        const p = stack.pop()!;
        list?.push(p);
        const x = p % cw;
        const y = (p - x) / cw;
        const step = (q: number) => {
          if (cls[q] === 0) {
            cls[q] = mark;
            stack.push(q);
          }
        };
        if (x > 0) step(p - 1);
        if (x < cw - 1) step(p + 1);
        if (y > 0) step(p - cw);
        if (y < ch - 1) step(p + cw);
      }
    };
    for (let x = 0; x < cw; x++) {
      if (cls[x] === 0) flood(x, 2);
      if (cls[(ch - 1) * cw + x] === 0) flood((ch - 1) * cw + x, 2);
    }
    for (let y = 0; y < ch; y++) {
      if (cls[y * cw] === 0) flood(y * cw, 2);
      if (cls[y * cw + cw - 1] === 0) flood(y * cw + cw - 1, 2);
    }
    // Pin-holes at a slash/ring junction are blur artifacts, not holes.
    const minHole = Math.max(4, 0.01 * bw * bh);
    const holes: { cx: number; cy: number; size: number; bottom: Int16Array; top: Int16Array }[] = [];
    let mark = 3;
    for (let p = 0; p < cw * ch && holes.length <= 2; p++) {
      if (cls[p] !== 0) continue;
      const list: number[] = [];
      flood(p, Math.min(255, mark++), list);
      if (list.length < minHole) continue;
      let sx = 0;
      let sy = 0;
      // Per-column extent of the hole, to measure how its edges are tilted.
      const bottom = new Int16Array(cw).fill(-1);
      const top = new Int16Array(cw).fill(-1);
      for (const q of list) {
        const qx = q % cw;
        const qy = (q - qx) / cw;
        sx += qx;
        sy += qy;
        if (qy > bottom[qx]) bottom[qx] = qy;
        if (top[qx] === -1 || qy < top[qx]) top[qx] = qy;
      }
      holes.push({ cx: sx / list.length, cy: sy / list.length, size: list.length, bottom, top });
    }
    if (holes.length !== 2) continue;
    const [upper, lower] = holes[0].cy <= holes[1].cy ? holes : [holes[1], holes[0]];
    const holeArea = upper.size + lower.size;
    // Ø: two big holes split by a diagonal, so the edge between them is
    // tilted. 8/B: stacked holes with a level bar between. %: tiny holes.
    if (holeArea < 0.12 * bw * bh) continue;
    if (Math.min(upper.size, lower.size) < 0.3 * Math.max(upper.size, lower.size)) continue;
    if (Math.abs(upper.cy - lower.cy) < 0.2 * bh) continue;
    if (Math.max(edgeTilt(upper.bottom), edgeTilt(lower.top)) < 0.15 * bh) continue;

    // --- stroke width: first foreground run from the left on the middle rows
    const runs: number[] = [];
    for (let y = Math.round(bh * 0.3); y <= Math.round(bh * 0.7); y++) {
      let x = 0;
      while (x < cw && cls[y * cw + x] !== 1) x++;
      let len = 0;
      while (x + len < cw && cls[y * cw + x + len] === 1) len++;
      if (len) runs.push(len);
    }
    if (!runs.length) continue;
    runs.sort((p, q) => p - q);
    const stroke = runs[runs.length >> 1];

    // --- distance from the exterior travelling through this glyph's pixels
    // (8-connected, so ring corners measure the same as ring sides). The ring
    // is everything within one stroke; the slash — including the stubs where
    // it meets the ring, which otherwise make the glyph read as 6 or 9 — is
    // deeper, and goes.
    const dist = new Int32Array(cw * ch).fill(-1);
    const queue: number[] = [];
    for (let p = 0; p < cw * ch; p++) {
      if (cls[p] !== 1) continue;
      const x = p % cw;
      const y = (p - x) / cw;
      const touchesExterior =
        (x > 0 && cls[p - 1] === 2) || (x < cw - 1 && cls[p + 1] === 2) || (y > 0 && cls[p - cw] === 2) || (y < ch - 1 && cls[p + cw] === 2);
      if (touchesExterior) {
        dist[p] = 1;
        queue.push(p);
      }
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const p = queue[qi];
      const x = p % cw;
      const y = (p - x) / cw;
      const d = dist[p] + 1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const q = ny * cw + nx;
          if (cls[q] === 1 && dist[q] === -1) {
            dist[q] = d;
            queue.push(q);
          }
        }
    }
    const cut = stroke;
    for (let p = 0; p < cw * ch; p++) {
      if (cls[p] !== 1 || dist[p] <= cut) continue;
      const x = (p % cw) + x0;
      const y = (p - (p % cw)) / cw + y0;
      fg[y * w + x] = 0;
    }
  }
  return glyphs;
}

// ---------------------------------------------------------------------------
// Tesseract worker (lazy singleton, torn down after a quiet minute)

type TWorker = import("tesseract.js").Worker;
let workerPromise: Promise<TWorker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

async function getWorker(onProgress?: (p: ScanProgress) => void): Promise<TWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM, OEM } = await import("tesseract.js");
      const worker = await createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        gzip: true,
        logger: (m) => {
          if (m.status !== "recognizing text") onProgress?.({ step: "loading", progress: m.progress });
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        // Everything that can appear on the results screen, nothing else.
        tessedit_char_whitelist: "0123456789.:%@ABCFGHLMNOPRSVabcdeghimnoprstuy",
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

function scheduleTeardown() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const p = workerPromise;
    workerPromise = null;
    p?.then((w) => w.terminate()).catch(() => {});
  }, 60_000);
}

/**
 * OCR a photo of the Beak screen: binarise once, then recognise at several
 * glyph sizes and vote. Stops early once voltage and IR each have two
 * agreeing passes.
 */
export async function scanBeakImage(file: Blob, onProgress?: (p: ScanProgress) => void): Promise<BeakScan> {
  onProgress?.({ step: "loading", progress: 0 });
  const [worker, bmp] = await Promise.all([getWorker(onProgress), loadBitmap(file)]);
  clearTimeout(idleTimer);
  try {
    onProgress?.({ step: "preprocessing", progress: 0 });
    const bin = binarize(bmp);
    const passes: BeakReading[] = [];
    const texts: string[] = [];
    let result = voteReadings(passes);
    for (let i = 0; i < GLYPH_TARGETS_PX.length; i++) {
      onProgress?.({ step: "recognizing", progress: i / GLYPH_TARGETS_PX.length });
      const blob = await renderScaled(bin, GLYPH_TARGETS_PX[i]);
      const { data } = await worker.recognize(blob);
      const text = data.text ?? "";
      texts.push(text);
      passes.push(parseBeakText(text));
      result = voteReadings(passes);
      if (i >= 2 && result.votes.v0 >= 2 && result.votes.rint >= 2) break;
    }
    onProgress?.({ step: "recognizing", progress: 1 });
    return { reading: result.reading, votes: result.votes, rawText: texts.map((t, i) => `— pass ${i + 1} —\n${t.trim()}`).join("\n") };
  } finally {
    bmp.close();
    scheduleTeardown();
  }
}
