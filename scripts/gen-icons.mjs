// Generates the WarriorBorgs WB favicon and home-screen icons (plum and lavender)
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
// Vector letterforms keep the monogram crisp without a font dependency.
const segments = [
  [17, 33, 23, 67], [23, 67, 33, 44],
  [33, 44, 43, 67], [43, 67, 49, 33],
  [59, 33, 59, 67], [59, 33, 70, 33],
  [59, 50, 72, 50], [59, 67, 72, 67],
];
const onSegment = (x, y, [ax, ay, bx, by]) => {
  const t = Math.max(0, Math.min(1,
    ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) /
    ((bx - ax) ** 2 + (by - ay) ** 2)));
  return (x - ax - t * (bx - ax)) ** 2 +
    (y - ay - t * (by - ay)) ** 2 <= 3.3 ** 2;
};
const onLetter = (x, y) => segments.some((segment) => onSegment(x, y, segment)) ||
  (x >= 70 && Math.abs(Math.hypot(x - 70, y - 41.5) - 8.5) <= 3.3) ||
  (x >= 72 && Math.abs(Math.hypot(x - 72, y - 58.5) - 8.5) <= 3.3);

function render(size) {
  const px = Buffer.alloc(size * size * 3);
  const samples = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          if (onLetter((x + (sx + 0.5) / samples) * 100 / size,
            (y + (sy + 0.5) / samples) * 100 / size)) coverage++;
        }
      }
      const alpha = coverage / (samples * samples);
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] + (FG[c] - BG[c]) * alpha);
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
// ICO stores a PNG at each common browser-tab size.
const sizes = [16, 32, 48];
const images = sizes.map(render);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
writeFileSync("app/favicon.ico", Buffer.concat([header, ...images]));
console.log("WB icons written");
