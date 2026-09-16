/**
 * Read the Beak's screen as the character grid it actually is.
 *
 * The OLED is 128×64 dots and the firmware prints six lines of 5×7-dot
 * glyphs in 6-dot-wide cells, 21 per line, each line starting with a known
 * label. Rather than asking a general OCR engine to make sense of a pixel
 * font it has never seen, this solves for the grid — where the dots are in
 * the photo — and then decides each cell by correlating its dot samples
 * against the font the Beak draws with.
 *
 *  1. Row grid. A horizontal projection of the lit image is matched against
 *     a comb of the six lines (seven lit dot rows each, at the offsets the
 *     firmware uses) over top edge and dot pitch.
 *  2. Each line's label ("Charge:", "V0:", …) is searched for over position,
 *     column pitch and a couple of dots vertically. That fixes column 0 and
 *     the line's top; the pitches of the six lines are then fitted to a
 *     straight line (perspective makes them drift top to bottom), which
 *     pins each one far better than its own short label could.
 *  3. Every cell: sample a 7×9-dot window (the glyph plus its blank margin)
 *     at three sub-samples per dot, and correlate against every glyph the
 *     line can contain, rendered the same way — dots as squares blurred by
 *     a Gaussian whose width is fitted per line from its label, since a
 *     photo blooms each lit dot into its neighbours. A cell whose best
 *     match is weak, or is beaten closely by a glyph that means something
 *     different, is emitted as "?" so the parser leaves that field blank
 *     rather than logging a guess. Confident cells nudge the position for
 *     the cells after them, so a residual tilt is followed across the line.
 */

import { CELL_W, GLYPH_H, GLYPH_W, TEXT_H, glyphBits } from "./beak-font";
import type { Binarized } from "./beak-ocr";

/**
 * The six lines: the label printed at column 0, the dot row the firmware
 * draws the line at, and the characters that can follow the label. Offsets
 * were measured from photos (the lines are not on 8-dot boundaries); each
 * line refines its own position by up to two dots, so they only need to be
 * close. Restricting the alphabet removes look-alikes that can't occur —
 * an "S" on a voltage line is only ever a 5.
 */
const DIGITS = "0123456789";
const LINES = [
  { label: "Status:", top: 0, chars: "GoodFairBadChargeBattery" + "SLANiMHLeadPb" },
  { label: "Charge:", top: 8.6, chars: DIGITS + "%" },
  { label: "V0:", top: 25.2, chars: DIGITS + ".@Amps" },
  { label: "V1:", top: 33.2, chars: DIGITS + ".@Amps" },
  { label: "V2:", top: 41.1, chars: DIGITS + ".@Amps" },
  { label: "Rint:", top: 56.9, chars: DIGITS + ".Ohms" },
];
const COLS = 21;
const PANEL_H = 64;
/** Sampled window around a glyph: one dot of margin above and below the eight glyph rows (and each side). */
const WIN_H = GLYPH_H + 2;

/** Below this normalised correlation a cell is unreadable. */
const MIN_SCORE = 0.6;
/** Rivals within this much correlation of the leader get a pairwise check. */
const RIVAL_WINDOW = 0.25;
/** Share of the differing dots the leader must win in every pairwise check. */
const MIN_VOTE = 0.65;
/** Label correlation below which a line's own position isn't trusted. */
const MIN_LABEL = 0.5;
/** A cell this sure of its glyph also tells us where the line is. */
const TRACK_SCORE = 0.75;
/** Mean lit level (0–255) under which a cell is blank. */
const BLANK_LEVEL = 18;
/** Sub-samples per dot, each way, when matching cells. */
const SUB = 3;
/**
 * Ways a lit dot can appear in a photo, tried per line: the camera clips the
 * bright core so the halo reads as solid, fattening every stroke (`dot`,
 * the lit square's width in dots), and the rest of the glow is a Gaussian
 * (`sigma`, in dots).
 */
const DOT_MODELS = [1, 5 / 3].flatMap((dot) => [0.2, 0.35, 0.5, 0.65].map((sigma) => ({ dot, sigma })));
/**
 * Samples are raised to this power before matching: a stroke's halo is
 * typically 30–40 % as bright as its core, and squaring pushes that toward
 * the background so a dim halo can't stand in for a stroke (the reason a
 * blurry 3 otherwise correlates better with 8 than with 3).
 */
const GAMMA = 2;
/** Offsets tried around the tracked position, in dots. */
const SHIFTS = [-0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375];

/**
 * Glyphs the parser treats as the same thing in a number (O↔0, l/i↔1, S↔5,
 * B↔8). They differ by a dot or two, so a close runner-up from the same class
 * is no reason to reject the cell.
 */
const SAME: Record<string, string> = { "0": "0", O: "0", "1": "1", l: "1", i: "1", "5": "5", S: "5", "8": "8", B: "8" };
const meaning = (ch: string) => SAME[ch] ?? ch;

export interface GridCell {
  ch: string;
  score: number;
  margin: number;
  /** Best glyph with a different meaning, for the debug view. */
  rival?: string;
}

export interface GridRead {
  /** One string per screen line, in screen order; unreadable cells are "?". */
  lines: string[];
  cells: GridCell[][];
  /** Per-line label correlation, for the debug view. */
  labelFit: number[];
  /** Dot pitch in px. */
  pitch: number;
}

/** Summed-area table over the lit image, so any box mean is four lookups. */
class Integral {
  private readonly s: Float64Array;
  constructor(
    readonly src: Uint8Array,
    readonly w: number,
    readonly h: number,
  ) {
    const s = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
      let row = 0;
      for (let x = 1; x <= w; x++) {
        row += src[(y - 1) * w + (x - 1)];
        s[y * (w + 1) + x] = s[(y - 1) * (w + 1) + x] + row;
      }
    }
    this.s = s;
  }
  /** Mean over the box centred at (cx, cy) with half-size r; boxes off the image count as dark. */
  mean(cx: number, cy: number, r: number): number {
    const x0 = Math.max(0, Math.round(cx - r));
    const y0 = Math.max(0, Math.round(cy - r));
    const x1 = Math.min(this.w, Math.round(cx + r) + 1);
    const y1 = Math.min(this.h, Math.round(cy + r) + 1);
    if (x1 <= x0 || y1 <= y0) return 0;
    const W = this.w + 1;
    const sum = this.s[y1 * W + x1] - this.s[y0 * W + x1] - this.s[y1 * W + x0] + this.s[y0 * W + x0];
    return sum / ((x1 - x0) * (y1 - y0));
  }
}

/** Box half-size for sampling a dot: about a third of the pitch, so neighbouring dots don't bleed in. */
const dotRadius = (px: number) => Math.max(0.6, px * 0.3);

/** A dot-pattern template, mean-centred and scaled to unit norm so correlation is a dot product. */
interface Template {
  /** Size in dots (including the one-dot margin). */
  cols: number;
  rows: number;
  /** Samples per dot each way. */
  sub: number;
  /** Centred, normalised values, (cols·sub) × (rows·sub); all zero for a blank template. */
  v: Float64Array;
}

/**
 * Render a string of glyphs in cells with a one-dot blank margin all round.
 * At `sub` = 1 each dot is one sample (the coarse template used to find a
 * label); at higher `sub` each lit dot is a square `dot` dots wide blurred
 * by a Gaussian of `sigma` dots, the way it appears in a photo.
 */
function textTemplate(text: string, sub: number, { dot, sigma } = { dot: 1, sigma: 0 }): Template {
  const cols = text.length * CELL_W - 1 + 2;
  const rows = WIN_H;
  const W = cols * sub;
  const H = rows * sub;
  let v = new Float64Array(W * H);
  for (let c = 0; c < text.length; c++) {
    const g = glyphBits(text[c]);
    for (let y = 0; y < GLYPH_H; y++)
      for (let x = 0; x < GLYPH_W; x++) {
        if (!g[y * GLYPH_W + x]) continue;
        // The lit square is centred on the dot's sub×sub block.
        const grow = Math.round(((dot - 1) * sub) / 2);
        const dx = (c * CELL_W + x + 1) * sub;
        const dy = (y + 1) * sub;
        for (let sy = -grow; sy < sub + grow; sy++)
          for (let sx = -grow; sx < sub + grow; sx++) {
            const yy = dy + sy;
            const xx = dx + sx;
            if (yy >= 0 && yy < H && xx >= 0 && xx < W) v[yy * W + xx] = 1;
          }
      }
  }
  if (sigma > 0) {
    const r = Math.ceil(3 * sigma * sub);
    const k = new Float64Array(2 * r + 1);
    for (let i = -r; i <= r; i++) k[i + r] = Math.exp(-(i * i) / (2 * (sigma * sub) ** 2));
    const tmp = new Float64Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          const xx = x + i;
          if (xx >= 0 && xx < W) acc += k[i + r] * v[y * W + xx];
        }
        tmp[y * W + x] = acc;
      }
    v = new Float64Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          const yy = y + i;
          if (yy >= 0 && yy < H) acc += k[i + r] * tmp[yy * W + x];
        }
        v[y * W + x] = acc;
      }
  }
  const n = W * H;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += v[i];
  mean /= n;
  let norm = 0;
  for (let i = 0; i < n; i++) {
    v[i] -= mean;
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < n; i++) v[i] /= norm;
  return { cols, rows, sub, v };
}

interface Candidate {
  ch: string;
  t: Template;
  /** The glyph's own 5×7 bits, for the pairwise check. */
  bits: Uint8Array;
}

/** Templates for a line's alphabet under one dot model, built on demand and kept. */
const templateCache = new Map<string, Candidate[]>();
function glyphTemplates(chars: string, model: (typeof DOT_MODELS)[number]): Candidate[] {
  const key = `${model.dot}:${model.sigma}:${chars}`;
  let set = templateCache.get(key);
  if (!set) {
    set = [...new Set(chars)].map((ch) => ({ ch, t: textTemplate(ch, SUB, model), bits: glyphBits(ch) }));
    templateCache.set(key, set);
  }
  return set;
}

/** Per-dot means of a sampled window (sub-samples pooled), 7×9 including the margin. */
function dotMeans(sample: Float64Array, t: Template): Float64Array {
  const W = t.cols * t.sub;
  const out = new Float64Array(t.cols * t.rows);
  for (let y = 0; y < t.rows; y++)
    for (let x = 0; x < t.cols; x++) {
      let acc = 0;
      for (let sy = 0; sy < t.sub; sy++) for (let sx = 0; sx < t.sub; sx++) acc += sample[(y * t.sub + sy) * W + x * t.sub + sx];
      out[y * t.cols + x] = acc / (t.sub * t.sub);
    }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

/**
 * Pairwise check between two glyphs on the dots where they differ. Bloom
 * makes a stroke's halo count as weak evidence for any glyph that has a
 * stroke there, which is enough for correlation to prefer a fat 8 over a
 * 3; but next to the glyph's own strokes and its blank margin, a halo is
 * plainly dark. Each differing dot is classed lit or dark against those two
 * levels and votes. Returns the share of votes for `a` (0–1).
 */
function pairwise(dots: Float64Array, cols: number, a: Uint8Array, b: Uint8Array): number {
  const at = (x: number, y: number) => dots[(y + 1) * cols + x + 1];
  const both: number[] = [];
  const neither: number[] = [];
  for (let y = 0; y < GLYPH_H; y++)
    for (let x = 0; x < GLYPH_W; x++) {
      const i = y * GLYPH_W + x;
      if (a[i] && b[i]) both.push(at(x, y));
      else if (!a[i] && !b[i]) neither.push(at(x, y));
    }
  // The margin is always dark (the bottom one too, past the descender row).
  for (let x = 0; x < cols; x++) neither.push(dots[x], dots[(GLYPH_H + 1) * cols + x]);
  for (let y = 1; y <= GLYPH_H; y++) neither.push(dots[y * cols], dots[y * cols + cols - 1]);
  let lit = median(both);
  if (!both.length) {
    for (let i = 0; i < a.length; i++) if (a[i] || b[i]) both.push(at(i % GLYPH_W, (i - (i % GLYPH_W)) / GLYPH_W));
    lit = Math.max(...both);
  }
  const dark = median(neither);
  const cut = (lit + dark) / 2;
  let forA = 0;
  let n = 0;
  for (let y = 0; y < GLYPH_H; y++)
    for (let x = 0; x < GLYPH_W; x++) {
      const i = y * GLYPH_W + x;
      if (a[i] === b[i]) continue;
      n++;
      if ((at(x, y) > cut) === !!a[i]) forA++;
    }
  return n ? forA / n : 0.5;
}

/** Normalised cross-correlation of a sample window with a template. */
function ncc(sample: Float64Array, t: Template): number {
  const n = t.v.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += sample[i];
  mean /= n;
  let num = 0;
  let sVar = 0;
  for (let i = 0; i < n; i++) {
    const d = sample[i] - mean;
    num += d * t.v[i];
    sVar += d * d;
  }
  return sVar < 1e-6 ? 0 : num / Math.sqrt(sVar);
}

/**
 * Fill `sample` with the template-shaped window whose top-left dot (the
 * margin) is centred at (x, y): one box mean per sub-sample, each box a
 * sub-sample wide.
 */
function sampleWindow(img: Integral, sample: Float64Array, t: Template, x: number, y: number, px: number, py: number) {
  const W = t.cols * t.sub;
  const H = t.rows * t.sub;
  const off = (t.sub - 1) / 2;
  const r = t.sub === 1 ? dotRadius(px) : (px / t.sub) * 0.5;
  for (let yy = 0; yy < H; yy++) {
    const cy = y + ((yy - off) / t.sub) * py;
    for (let xx = 0; xx < W; xx++) sample[yy * W + xx] = img.mean(x + ((xx - off) / t.sub) * px, cy, r) ** GAMMA;
  }
}

/**
 * Row grid: the panel's top dot row and dot pitch. Scores a (y0, pitch) pair
 * by how much brighter the lines' dot rows are than the dot row just above
 * and below each; coarse-to-fine over the plausible range (the region is
 * the screen plus padding and bezel glow, so 64 dots span anywhere from a
 * third to nearly all of its height).
 */
function fitRows(lit: Uint8Array, w: number, h: number): { y0: number; py: number } {
  const proj = new Float64Array(h + 1); // prefix sum of per-row totals
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += lit[y * w + x];
    proj[y + 1] = proj[y] + s;
  }
  const rowMean = (a: number, b: number) => {
    const ya = Math.max(0, Math.min(h, Math.round(a)));
    const yb = Math.max(0, Math.min(h, Math.round(b)));
    return yb > ya ? (proj[yb] - proj[ya]) / (yb - ya) : 0;
  };
  const score = (y0: number, py: number) => {
    let on = 0;
    let off = 0;
    for (const l of LINES) {
      const top = y0 + l.top * py;
      on += rowMean(top, top + TEXT_H * py);
      off += rowMean(top - py, top) + rowMean(top + TEXT_H * py, top + (TEXT_H + 1) * py);
    }
    return on / LINES.length - off / (2 * LINES.length);
  };
  let best = { y0: 0, py: h / 80, s: -Infinity };
  for (let py = h / 200; py <= h / 55; py *= 1.01) {
    for (let y0 = -py; y0 <= h - PANEL_H * py + py; y0 += Math.max(1, py / 4)) {
      const s = score(y0, py);
      if (s > best.s) best = { y0, py, s };
    }
  }
  const c = best;
  for (let py = c.py * 0.985; py <= c.py * 1.015; py += c.py * 0.0025) {
    for (let y0 = c.y0 - c.py; y0 <= c.y0 + c.py; y0 += 0.25) {
      const s = score(y0, py);
      if (s > best.s) best = { y0, py, s };
    }
  }
  return { y0: best.y0, py: best.py };
}

interface LineFit {
  /** x of column 0's first dot centre. */
  x0: number;
  /** y of the line's top dot row centre. */
  yTop: number;
  px: number;
  py: number;
  fit: number;
  /** How this line's dots look (see DOT_MODELS). */
  model: (typeof DOT_MODELS)[number];
}

/**
 * Where a line's label is: its dot pattern is searched for over position, a
 * range of column pitches (foreshortening makes px differ from py) and a
 * couple of dots vertically, coarse then fine. Then the dot model that
 * best explains the label is picked for the line's cells.
 */
function fitLabel(img: Integral, label: string, yTop: number, py: number): LineFit {
  const plain = textTemplate(label, 1);
  let sample = new Float64Array(plain.v.length);
  // Positions are of the glyph's first dot; the template starts a dot earlier (its margin).
  const evaluate = (t: Template, x0: number, y: number, px: number, lpy: number) => {
    sampleWindow(img, sample, t, x0 - px, y - lpy, px, lpy);
    return ncc(sample, t);
  };
  let best = { x0: 0, yTop, px: py, py, fit: -Infinity };
  for (let px = py * 0.82; px <= py * 1.2; px *= 1.02)
    for (let dy = -2 * py; dy <= 2 * py; dy += py / 2)
      for (let x0 = px; x0 + plain.cols * px < img.w; x0 += px / 2) {
        const s = evaluate(plain, x0, yTop + dy, px, py);
        if (s > best.fit) best = { x0, yTop: yTop + dy, px, py, fit: s };
      }
  // Fine pass, now also over the line's own row pitch (perspective).
  const c = best;
  for (let px = c.px * 0.97; px <= c.px * 1.03; px += c.px * 0.005)
    for (let lpy = py * 0.94; lpy <= py * 1.06; lpy += py * 0.01)
      for (let dy = -py / 2; dy <= py / 2; dy += py / 8)
        for (let dx = -c.px / 2; dx <= c.px / 2; dx += c.px / 8) {
          const s = evaluate(plain, c.x0 + dx, c.yTop + dy, px, lpy);
          if (s > best.fit) best = { x0: c.x0 + dx, yTop: c.yTop + dy, px, py: lpy, fit: s };
        }
  let model = DOT_MODELS[0];
  let fit = -Infinity;
  for (const m of DOT_MODELS) {
    const t = textTemplate(label, SUB, m);
    sample = new Float64Array(t.v.length);
    const s = evaluate(t, best.x0, best.yTop, best.px, best.py);
    if (s > fit) {
      fit = s;
      model = m;
    }
  }
  return { ...best, fit, model };
}

/**
 * Classify one cell: best glyph over a small shift window around the cell's
 * nominal position (`dx`/`dy`, in dots, are the line's tracked offsets at
 * this cell). Returns the offset the winning glyph was found at so the line
 * can follow a residual tilt or pitch error across its width.
 */
function readCell(img: Integral, templates: Candidate[], cx: number, cy: number, px: number, py: number, dx: number, dy: number): GridCell & { dx: number; dy: number } {
  const r = dotRadius(px);
  let level = 0;
  for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) level += img.mean(cx + (x + dx) * px, cy + (y + dy) * py, r);
  if (level / (GLYPH_W * GLYPH_H) < BLANK_LEVEL) return { ch: " ", score: 1, margin: 1, dx, dy };

  // Best score (and where it was found) per glyph over the shift window.
  const sample = new Float64Array(templates[0].t.v.length);
  const bestBy = new Map<string, { s: number; dx: number; dy: number }>();
  for (const sy of SHIFTS)
    for (const sx of SHIFTS) {
      sampleWindow(img, sample, templates[0].t, cx + (dx + sx - 1) * px, cy + (dy + sy - 1) * py, px, py);
      for (const { ch, t } of templates) {
        const s = ncc(sample, t);
        if (s > (bestBy.get(ch)?.s ?? -Infinity)) bestBy.set(ch, { s, dx: dx + sx, dy: dy + sy });
      }
    }
  let best = { ch: "?", s: -Infinity, dx, dy };
  for (const [ch, e] of bestBy) if (e.s > best.s) best = { ch, ...e };
  if (best.s < MIN_SCORE) return { ch: "?", score: best.s, margin: 0, rival: best.ch, dx: best.dx, dy: best.dy };

  // Correlation ranks the candidates; the dots where the leader and each
  // close rival differ decide between them (see pairwise). The leader must
  // win every such contest clearly, or the cell is left unread.
  const t0 = templates[0].t;
  sampleWindow(img, sample, t0, cx + (best.dx - 1) * px, cy + (best.dy - 1) * py, px, py);
  const dots = dotMeans(sample, t0);
  const byCh = new Map(templates.map((c) => [c.ch, c]));
  const rivals = [...bestBy]
    .filter(([ch, e]) => meaning(ch) !== meaning(best.ch) && e.s >= best.s - RIVAL_WINDOW)
    .sort((p, q) => q[1].s - p[1].s)
    .slice(0, 3);
  let margin = 1;
  let worst = "";
  for (const [ch] of rivals) {
    const share = pairwise(dots, t0.cols, byCh.get(best.ch)!.bits, byCh.get(ch)!.bits);
    if (share < margin) {
      margin = share;
      worst = ch;
    }
  }
  const ch = margin < MIN_VOTE ? "?" : best.ch;
  return { ch, score: best.s, margin, rival: `${best.ch}/${worst}`, dx: best.dx, dy: best.dy };
}

/** Least-squares line through (x, y) points; a flat mean when there are too few to fit a slope. */
function linearFit(pts: { x: number; y: number }[]): (x: number) => number {
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const slope = n >= 3 && sxx > 0 ? sxy / sxx : 0;
  return (x) => my + slope * (x - mx);
}

export function readGrid(b: Binarized): GridRead {
  const { y0, py } = fitRows(b.lit, b.w, b.h);
  const img = new Integral(b.lit, b.w, b.h);

  const lines = LINES.map((l) => fitLabel(img, l.label, y0 + l.top * py, py));
  // Lines the labels place well set the grid for the rest: column 0 is the
  // same for every line, and the pitch drifts linearly down the screen with
  // perspective. A short label only pins its own pitch to a percent or so,
  // which is a dot or more by the far end of the line; six of them together
  // do much better.
  const good = lines.filter((l) => l.fit >= MIN_LABEL);
  if (good.length) {
    const xs = good.map((l) => l.x0).sort((p, q) => p - q);
    const x0 = xs[xs.length >> 1];
    const pxAt = linearFit(good.map((l) => ({ x: l.yTop, y: l.px })));
    const pyAt = linearFit(good.map((l) => ({ x: l.yTop, y: l.py })));
    for (const l of lines) {
      if (l.fit < MIN_LABEL) l.x0 = x0;
      l.px = pxAt(l.yTop);
      l.py = pyAt(l.yTop);
    }
  }

  // Read left to right. The label cells are written in as-is (the line was
  // anchored on them), and confident cells nudge the position for those
  // after them so a residual tilt or pitch error is followed across.
  const cells = lines.map((l, i) => {
    const templates = glyphTemplates(LINES[i].chars, l.model);
    const label = LINES[i].label;
    const out: GridCell[] = [];
    let dx = 0;
    let dy = 0;
    for (let c = 0; c < COLS; c++) {
      const cell = readCell(img, templates, l.x0 + c * CELL_W * l.px, l.yTop, l.px, l.py, dx, dy);
      if (cell.ch !== " " && cell.ch !== "?" && cell.score >= TRACK_SCORE) {
        dx = cell.dx;
        dy = cell.dy;
      }
      out.push(c < label.length && l.fit >= MIN_LABEL ? { ch: label[c], score: l.fit, margin: 1 } : { ch: cell.ch, score: cell.score, margin: cell.margin, rival: cell.rival });
    }
    return out;
  });
  const text = cells.map((row) => row.map((c) => c.ch).join("").replace(/\s+$/, ""));
  return { lines: text, cells, labelFit: lines.map((l) => l.fit), pitch: py };
}
