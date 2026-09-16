// Copies the Tesseract.js worker, WASM cores and English traineddata from
// node_modules into public/ocr so the Beak-screen scanner is served from our
// own origin (and cached by sw.js for offline pits) instead of a CDN.
// Runs on postinstall/prebuild; public/ocr is gitignored.
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ocr");
mkdirSync(out, { recursive: true });

const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  // LSTM-only cores; tesseract.js picks one based on the device's SIMD support.
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];

let copied = 0;
for (const [src, dst] of files) {
  const from = join(root, "node_modules", src);
  const to = join(out, dst);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}
console.log(`ocr-assets: ${copied ? `copied ${copied}` : "up to date"} → public/ocr`);
