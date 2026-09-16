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
 * Tesseract was never trained on this 5×7 pixel font, so three things make
 * it reliable enough to trust:
 *  1. the photo is binarised and the font's slashed zeros (Ø, which read as
 *     8) are repaired into plain 0s before OCR;
 *  2. the same binarised text is OCR'd at several glyph heights and each
 *     field is decided by majority vote — Tesseract's misreads vary with
 *     scale, the right answer doesn't;
 *  3. the parser is forgiving of the usual misreads (O↔0, l/I↔1, S↔5, %↔Z),
 *     identifies V0/V1/V2 by the "@ N Amps" current rather than the label
 *     digit, and rejects values outside what a Beak can print.
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
    .replace(/[Oo°]/g, "0")
    .replace(/[lI|]/g, "1")
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
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Status: Good      NiMH / SLA / Lead
    if (/^s[ti]a[ti]u[s5]/i.test(line) || /stat[a-z]*\s*[:;]/i.test(line)) {
      r.status ??= parseStatus(line);
      const chem = line.match(/\b(NiMH|SLA|Lead|Pb|Li[a-z]*)\b/i);
      if (chem) r.chemistry = chem[1];
      continue;
    }
    // Charge: 115%   (skip if it's the "Charge Battery" status line)
    const charge = line.match(new RegExp(`^(?:c?h?a?r?ge|ch[a-z]*)\\s*[:;]?\\s*(${NUM})\\s*[%Zz]?`, "i"));
    if (charge && !/ba[t7]/i.test(line)) {
      const pct = numeric(charge[1]);
      if (pct !== undefined && pct >= 0 && pct <= 130) r.charge_pct = Math.round(pct);
      continue;
    }
    // V0: 12.911 @  0 Amps  — prefer the current to identify the row. The
    // label often comes back as "Vg:"/"yo:"/"U0:" or just "0:", so accept up
    // to two characters before the colon and take the last as the index.
    const volt = line.match(new RegExp(`^(?:[a-z]\\s*)?([0-9a-z|])?\\s*[:;.]\\s*(${NUM})(?:\\s*[@a]\\s*(${NUM})\\s*[ab])?`, "i"));
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
    const rint = line.match(new RegExp(`^r\\s*[il1I]?\\s*[nh]\\s*[t7]?\\s*[:;.]?\\s*(${NUM}?)\\s*(m)?\\s*[o0]?h?m`, "i"));
    if (rint) {
      const raw = rint[1].replace(/,/g, ".");
      // The LSTM's language prior dislikes numbers that start with "0." and
      // returns "8.014" / "6.014" for 0.014. The Beak can't show ≥ 1 Ω, so
      // one digit before the point is always a zero.
      const lead = raw.match(/^[0-9OoIlS|B]\.([0-9OoIlS|B]{3})$/);
      const n = numeric(lead ? `0.${lead[1]}` : raw);
      if (n === undefined) continue;
      // Otherwise a value ≥ 1 with no "m" means the decimal point got lost —
      // better to leave it blank than log 14 000 mΩ.
      const mohm = rint[2] ? n : n < 1 ? n * 1000 : undefined;
      if (mohm !== undefined && mohm >= 1 && mohm <= 200) r.rint_mohm = Math.round(mohm * 10) / 10;
      continue;
    }
  }

  // Place voltage rows by their identified slot. The V0 label is the one most
  // often mangled (its Ø), so a single unidentified row is taken as V0 when
  // that slot is free; V1/V2 are never guessed.
  const slots: (number | undefined)[] = [undefined, undefined, undefined];
  for (const { v, slot } of volts) if (slot !== undefined && slots[slot] === undefined) slots[slot] = v;
  const unknown = volts.filter((x) => x.slot === undefined);
  if (unknown.length === 1 && slots[0] === undefined) slots[0] = unknown[0].v;
  // Voltage can only fall as load rises; a row that breaks that is a misread.
  if (slots[1] !== undefined && slots[0] !== undefined && slots[1] > slots[0]) slots[1] = undefined;
  if (slots[2] !== undefined && slots[0] !== undefined && slots[2] > slots[0]) slots[2] = undefined;
  [r.v0, r.v1, r.v2] = slots;
  return r;
}

/** Majority vote per field across several OCR passes. Ties go to the earlier pass. */
export function voteReadings(passes: BeakReading[]): { reading: BeakReading; votes: { v0: number; rint: number } } {
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
    return { value: best?.value, votes: best?.n ?? 0 };
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

const MAX_SIDE = 1800;
/** Glyph (cap) heights, in px, to OCR at. Spread deliberately: misreads differ by scale, so they get outvoted. */
const GLYPH_TARGETS_PX = [18, 22, 26, 32, 40];

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
}

/** Glyph height to aim for when re-binarising the located screen. Big enough for the Ø repair to see the holes. */
const TARGET_CAP_PX = 56;

/**
 * Turn a phone photo of the OLED into a clean text mask. Two passes: the
 * first, over the whole (downsized) photo, only finds where the text is; the
 * second crops the source to that region and redoes the work at a size where
 * glyph holes are big enough to inspect.
 */
function binarize(bmp: ImageBitmap): Binarized {
  const full = binarizeRegion(bmp, 0, 0, bmp.width, bmp.height, Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height)), "adaptive");
  const inBand = full.glyphs.filter((g) => g.h >= full.capHeight / 1.2 && g.h <= full.capHeight * 1.2);
  if (inBand.length < 5) return full;
  // Region of the text, padded by a line-height, mapped back to source pixels.
  const s = full.w / bmp.width;
  const pad = full.capHeight * 1.5;
  const x0 = Math.max(0, (Math.min(...inBand.map((g) => g.x)) - pad) / s);
  const y0 = Math.max(0, (Math.min(...inBand.map((g) => g.y)) - pad) / s);
  const x1 = Math.min(bmp.width, (Math.max(...inBand.map((g) => g.x + g.w)) + pad) / s);
  const y1 = Math.min(bmp.height, (Math.max(...inBand.map((g) => g.y + g.h)) + pad) / s);
  const srcCap = full.capHeight / s;
  const scale = Math.min(TARGET_CAP_PX / srcCap, 2400 / Math.max(x1 - x0, y1 - y0), 4);
  return binarizeRegion(bmp, x0, y0, x1 - x0, y1 - y0, scale, "otsu");
}

/**
 * Binarise one region of the photo. The screen text is orange and cyan on
 * black, so brightness = max(R,G,B) keeps both colours equally strong; a
 * small blur closes the gaps between the OLED's physical pixels; then specks
 * go and the slashed zeros are repaired.
 *
 * Thresholds: "adaptive" (local mean) survives a busy frame around the screen
 * but thins strokes enough to break the Ø slash; "otsu" (global) gives clean
 * glyphs once the image is mostly screen. Locate with one, read with the other.
 */
function binarizeRegion(
  bmp: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  scale: number,
  method: "adaptive" | "otsu",
): Binarized {
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);

  const px = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    raw[i] = Math.max(px[o], px[o + 1], px[o + 2]);
  }
  const lum = boxBlur3(raw, w, h);
  const fg = method === "adaptive" ? adaptiveThreshold(lum, w, h) : otsuThreshold(lum);
  const glyphs = cleanAndRepair(fg, w, h);
  return { fg, w, h, capHeight: typicalHeight(glyphs.map((g) => g.h)) || h / 12, glyphs };
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

  const pad = Math.round(targetPx); // Tesseract likes a margin around the text
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(b.w * factor)) + pad * 2;
  out.height = Math.max(1, Math.round(b.h * factor)) + pad * 2;
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, pad, pad, out.width - pad * 2, out.height - pad * 2);
  return new Promise((resolve, reject) =>
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/png"),
  );
}

/** Otsu's global threshold, nudged up: lit OLED pixels are the brightest thing in frame, and dim bezel reflections shouldn't survive. */
function otsuThreshold(lum: Uint8Array): Uint8Array {
  const n = lum.length;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[lum[i]]++;
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
  thresh = Math.min(250, Math.round(thresh + (255 - thresh) * 0.15));
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = lum[i] > thresh ? 1 : 0;
  return fg;
}

/**
 * Bradley-style adaptive threshold: a pixel is text if it is clearly brighter
 * than its neighbourhood. A global (Otsu) cut fails when the screen is a
 * small part of a photo — the grey battery and table end up as "text".
 */
function adaptiveThreshold(lum: Uint8Array, w: number, h: number): Uint8Array {
  const r = Math.max(12, Math.round(Math.min(w, h) / 24));
  // Summed-area table, one row/column of zero padding.
  const W = w + 1;
  const integ = new Uint32Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += lum[(y - 1) * w + (x - 1)];
      integ[y * W + x] = integ[(y - 1) * W + x] + row;
    }
  }
  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integ[(y1 + 1) * W + (x1 + 1)] - integ[y0 * W + (x1 + 1)] - integ[(y1 + 1) * W + x0] + integ[y0 * W + x0];
      const v = lum[y * w + x];
      // Lit OLED pixels are both bright in absolute terms and far above the
      // local mean; textured grey surroundings are neither.
      fg[y * w + x] = v > 110 && v - sum / area > 45 ? 1 : 0;
    }
  }
  return fg;
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
