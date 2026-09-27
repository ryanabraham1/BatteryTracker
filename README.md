# 3256 Tools — FRC 3256

Mobile-first PWA with two tools behind one team code. The home page (`/`) is a dashboard: what battery to grab next, battery warnings, fab stock that's low or on order, pit kit status, and recent activity from both. Each tool is a tap away from there or from the header switcher:

- **Batteries** (`/battery`) — which batteries exist, what state each is in, how healthy it is, and which one to grab next. See [SPEC.md](SPEC.md).
- **Fab stock** (`/stock`) — the raw material the team cuts: tube, bar, angle, channel, rod, hex shaft, sheet/plate. See [Fab stock](#fab-stock) below.

The battery app used to live at the root; `next.config.ts` redirects the old `/batteries`, `/log`, `/comp` and `/settings` URLs.

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

- `app/(app)/battery/` — board `/battery`, `/battery/batteries`, `/battery/batteries/[name]`, `/battery/log`, `/battery/comp`, `/battery/settings`; `app/(app)/stock/` — fab stock
- `app/actions.ts` — all server actions (state moves, logging, CRUD, settings)
- `lib/health.ts` — health score, warnings, Ready ordering
- `lib/data.ts` — Supabase reads; `supabase/migrations/` — schema
- `components/` — board, cards, bottom sheet, forms, charts; `offline.tsx` + `lib/offline-actions.ts` — offline outbox; `public/sw.js` — app-shell cache
- `lib/beak-ocr.ts` + `components/beak-scan.tsx` — **Scan Beak screen**: photograph the Battery Beak's OLED and the Beak form fills itself in (see below)

## Scanning the Battery Beak

Every Beak form (Beak check, pre-match, post-match) has a **Scan Beak screen** button. On a phone it opens the rear camera; take a photo of the Beak's results screen and the voltage (V0), IR (Rint → mΩ) and Charge % fields are filled in for you to confirm. V1/V2 under load and the Beak's own Good/Fair/Bad verdict are saved with the event too.

OCR runs on the phone with [Tesseract.js](https://github.com/naptha/tesseract.js) — no server, no API key, and it works offline once the assets are cached. Tesseract wasn't trained on the Beak's 5×7 pixel font and a pit photo is nothing like a scan, so `lib/beak-ocr.ts` does most of the work before OCR: it finds the screen by colour (the only thing in frame that is both yellow and blue), crops and levels it, binarises each colour separately so the glass's reflection and the glow around bright rows drop out, heals the OLED dot grid, repairs the font's slashed zeros (Ø reads as 8 otherwise — a retire-vs-fine difference for IR), then OCRs at several sizes and fills a field only when two passes agree. A field it isn't sure of is left blank for you to type — a blank beats a wrong number.

Tips for good reads: get close so the screen fills most of the frame, keep the phone roughly square to it, tap to focus on the text, and avoid glare on the glass. The blue rows read more reliably than the yellow ones, so voltage and IR usually land even when Charge % doesn't.

`scripts/ocr-assets.mjs` (run on `postinstall`/`prebuild`) copies the Tesseract worker, WASM core and English data from `node_modules` into `public/ocr/` (gitignored), which `sw.js` caches for offline use.

## Fab stock

Tracks raw material as **individual pieces** — each stick has a length, each sheet a W × L — because an offcut isn't interchangeable with a full stick.

- **Rack** (`/stock`) — every material with its total on hand, piece count, and where the pieces are. Filter by shape, "Low", or "Pit only" (on by default in comp mode). Header search takes shop shorthand: `2x1`, `1/4 poly`, `hex`.
- **Material page** (`/stock/[id]`) — **Receive** new sticks/sheets, **Cut** (the blade kerf is subtracted per cut; a leftover shorter than the scrap length defaults to "toss"), **Move** between locations, **Edit** a piece after measuring it, **Scrap** it. **Find a piece** suggests the shortest stick (smallest sheet) that fits, so offcuts get used before full stock.
- **Sheets** — a cut records what's left: one or more smaller rectangles, "same outline, has cutouts", or nothing.
- **Shopping** (`/stock/shopping`) — "Need more" lines grouped by vendor, *needed → ordered → arrived* (arriving adds the pieces). Materials under their low-stock line are listed alongside. Copy as text or CSV.
- **Pit kit** (`/stock/kit`) — lists like "2 × 2×1 tube ≥ 24"". A line is packed when enough pieces that big sit in a *pit* location; short lines say which shop piece to grab.
- **Log** (`/stock/log`) and **Setup** (`/stock/setup`: kerf, scrap length, locations).
- **Undo** — every log entry (cut, receive, move, edit, scrap, shopping-list change) has an Undo, on the log and on the material's history. Each entry stores before/after snapshots of the rows it touched (`fab_events.undo`); undo puts the *before* back only if those rows still match *after*, so undoing an old cut on a piece that has since been moved asks you to undo the move first.

**Units:** everything is stored in millimetres. Each device picks inches or mm (the `fab_units` cookie, toggled on any stock page). Length fields take `27 1/2`, `27.5"`, `2' 3"`, `700mm`, `70cm` and show the conversion. Material sizes are shown the way they're sold (`2×1" × 1/16 wall`, `8 mm hex`), set per material.

Code: `lib/units.ts` (parse/format), `lib/fab.ts` (types, fit + summary logic), `lib/fab-data.ts` (reads), `app/fab-actions.ts` (server actions), `components/fab-*.tsx`. Schema: `supabase/migrations/0007_fab_stock.sql`.

## Deploy

Vercel: import the repo, set the five env vars, deploy. `public/manifest.json` makes it installable (Add to Home Screen).
