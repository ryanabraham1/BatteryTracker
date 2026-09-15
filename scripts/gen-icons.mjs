// Generates public/icon-192.png and public/icon-512.png (plum bg, purple-text battery glyph)
// with no dependencies. Run: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#201632");
const FG = hex("#bda8ee");
const ACCENT = hex("#6b3fd4");

function render(size) {
  const px = Buffer.alloc(size * size * 3);
  const u = size / 100; // unit
  // battery body: rounded rect from (22,34) to (72,66); cap at (72..78, 44..56); fill 3 bars
  const inRR = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.max(x0 + r, Math.min(x1 - r, x));
    const cy = Math.max(y0 + r, Math.min(y1 - r, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const X = x / u, Y = y / u;
      let c = BG;
      const outer = inRR(X, Y, 20, 32, 74, 68, 6);
      const inner = inRR(X, Y, 24.5, 36.5, 69.5, 63.5, 3.5);
      const cap = inRR(X, Y, 74, 44, 80, 56, 2);
      if ((outer && !inner) || cap) c = FG;
      else if (inner) {
        // three bars
        for (const bx of [28, 41.5, 55]) {
          if (X >= bx && X <= bx + 10.5 && Y >= 40 && Y <= 60) c = ACCENT;
        }
      }
      const i = (y * size + x) * 3;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, render(s));
console.log("icons written");
