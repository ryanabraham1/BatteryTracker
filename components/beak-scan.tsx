"use client";

import { useEffect, useRef, useState } from "react";
import type { BeakReading, ScanProgress } from "@/lib/beak-ocr";
import { CameraIcon } from "./ui";

const STEP_LABEL: Record<ScanProgress["step"], string> = {
  loading: "Loading reader…",
  preprocessing: "Cleaning up photo…",
  recognizing: "Reading screen…",
};

/**
 * "Scan Beak screen": opens the phone camera (or a file picker on desktop),
 * OCRs the photo on-device and hands the parsed reading to the form.
 * The OCR module is imported on demand so the ~4 MB WASM only loads when used.
 */
export function BeakScan({ onReading }: { onReading: (r: BeakReading) => void }) {
  const [busy, setBusy] = useState<ScanProgress | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ reading: BeakReading; rawText: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setShowRaw(false);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setBusy({ step: "loading", progress: 0 });
    try {
      const { scanBeakImage, scoreReading } = await import("@/lib/beak-ocr");
      const scan = await scanBeakImage(file, setBusy);
      setResult({ reading: scan.reading, rawText: scan.rawText });
      if (scoreReading(scan.reading) === 0) setError("Couldn't find Beak text. Fill the screen, avoid glare, and try again.");
      else onReading(scan.reading);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(null);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const r = result?.reading;
  const missing = r ? [r.v0 === undefined && "voltage", r.rint_mohm === undefined && "IR"].filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
      <div className="flex items-stretch gap-2">
        <button type="button" className="btn btn-ghost flex-1 py-2.5" disabled={!!busy} onClick={() => cameraRef.current?.click()}>
          {busy ? (
            <>
              {STEP_LABEL[busy.step]}
              {busy.step === "recognizing" && <span className="mono text-xs ml-1">{Math.round(busy.progress * 100)}%</span>}
            </>
          ) : (
            <>
              <CameraIcon /> Scan Beak screen
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost px-3 py-2.5 text-xs"
          disabled={!!busy}
          onClick={() => fileRef.current?.click()}
          aria-label="Choose an existing photo"
          title="Choose an existing photo"
        >
          Photo
        </button>
      </div>

      {(preview || result || error) && (
        <div className="flex gap-3 items-start rounded-[10px] p-2.5" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Beak screen photo" className="w-16 h-16 object-cover rounded-[6px] shrink-0" style={{ background: "#000" }} />
          )}
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            {r && (
              <>
                <p className="mono">
                  {r.status && <b>{r.status}</b>}
                  {r.charge_pct !== undefined && <> · {r.charge_pct}%</>}
                  {r.v0 !== undefined && <> · V0 {r.v0.toFixed(2)}</>}
                  {r.v2 !== undefined && <> · V2 {r.v2.toFixed(2)}</>}
                  {r.rint_mohm !== undefined && <> · {r.rint_mohm} mΩ</>}
                </p>
                {missing.length > 0 && !error && (
                  <p style={{ color: "var(--warn)" }}>Couldn&apos;t read {missing.join(" or ")} — type it in.</p>
                )}
                {!error && <p style={{ color: "var(--muted)" }}>Filled in below — double-check against the screen.</p>}
              </>
            )}
            {error && (
              <p style={{ color: "var(--bad)" }} role="alert">
                {error}
              </p>
            )}
            {result?.rawText && (
              <button type="button" className="underline mt-1" style={{ color: "var(--muted)" }} onClick={() => setShowRaw((s) => !s)}>
                {showRaw ? "Hide" : "Show"} what the reader saw
              </button>
            )}
            {showRaw && result && (
              <pre className="mono whitespace-pre-wrap mt-1 p-2 rounded-[6px]" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                {result.rawText.trim() || "(nothing)"}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
