# Battery Tracker — FRC 3256

Mobile-first PWA: which batteries exist, what state each is in, how healthy it is, and which one to grab next. See [SPEC.md](SPEC.md).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Realtime) · Recharts · Vercel.

## Setup

1. **Supabase project** — create one, then run the files in [`supabase/migrations/`](supabase/migrations/) in order in the SQL editor (or `supabase db push`). It creates `batteries`, `battery_events`, `settings` (single row), enables RLS (locked down — the app uses the service role), and adds triggers that broadcast a `changed` ping on the public `board` realtime topic.
2. **Env vars** — copy `.env.example` → `.env.local`:
   | Var | Where |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key (realtime pings only) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key (server only) |
   | `TEAM_CODE` | the shared code everyone types on the login screen |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
3. `npm install && npm run dev`

## How auth works

`POST /api/login` checks the code and sets a signed HttpOnly cookie (`<sha256(code)>.<hmac>`). `proxy.ts` verifies the HMAC on every route except `/login`; the app layout additionally checks the hash matches the *current* code, so changing the code (env var, or from Settings → stored in `settings.team_code_hash`) logs everyone out.

## Layout

- `app/(app)/` — board `/`, `/batteries`, `/batteries/[name]`, `/log`, `/comp`, `/settings`
- `app/actions.ts` — all server actions (state moves, logging, CRUD, settings)
- `lib/health.ts` — health score, warnings, Ready ordering
- `lib/data.ts` — Supabase reads; `supabase/migrations/` — schema
- `components/` — board, cards, bottom sheet, forms, charts; `offline.tsx` + `lib/offline-actions.ts` — offline outbox; `public/sw.js` — app-shell cache
- `lib/beak-ocr.ts` + `components/beak-scan.tsx` — **Scan Beak screen**: photograph the Battery Beak's OLED and the Beak form fills itself in (see below)

## Scanning the Battery Beak

Every Beak form (Beak check, pre-match, post-match) has a **📷 Scan Beak screen** button. On a phone it opens the rear camera; take a photo of the Beak's results screen and the voltage (V0), IR (Rint → mΩ) and Charge % fields are filled in for you to confirm. V1/V2 under load and the Beak's own Good/Fair/Bad verdict are saved with the event too.

OCR runs on the phone with [Tesseract.js](https://github.com/naptha/tesseract.js) — no server, no API key, and it works offline once the assets are cached. Tesseract wasn't trained on the Beak's 5×7 pixel font, so `lib/beak-ocr.ts` does a fair amount of work first: it locates the screen in the photo, repairs the font's slashed zeros (Ø reads as 8 otherwise — a retire-vs-fine difference for IR), OCRs the text at several sizes and takes a majority vote per field, and rejects anything a Beak can't display. Tips for good reads: fill the frame with the screen, avoid glare, hold steady.

`scripts/ocr-assets.mjs` (run on `postinstall`/`prebuild`) copies the Tesseract worker, WASM core and English data from `node_modules` into `public/ocr/` (gitignored), which `sw.js` caches for offline use.

## Deploy

Vercel: import the repo, set the five env vars, deploy. `public/manifest.json` makes it installable (Add to Home Screen).
