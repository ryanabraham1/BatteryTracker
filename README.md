# 3256 Tools — FRC 3256

Mobile-first PWA with three tools behind one team code. The home page (`/`) is a dashboard: what battery to grab next, battery warnings, fab stock that's low or on order, pit kit status, and recent activity from both. Each tool is a tap away from there or from the header switcher:

- **Batteries** (`/battery`) — which batteries exist, what state each is in, how healthy it is, and which one to grab next. See [SPEC.md](SPEC.md).
- **Fab stock** (`/stock`) — the raw material the team cuts: tube, bar, angle, channel, rod, hex shaft, sheet/plate. See [Fab stock](#fab-stock) below.
- **Fab tracker** (`/tracker`) — replaces the team's Machining and 3D Printing tracker sheets: every part to make, loaded from Onshape or pasted from the sheet, on a table and a kanban board, with manufacturability checks against the shop's machines, a cut plan that nests parts onto the stock on the rack, and stock taken off the rack automatically. See [Fab tracker](#fab-tracker) below.

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
   | `ONSHAPE_ACCESS_KEY` / `ONSHAPE_SECRET_KEY` | optional — Onshape API keys for Parts (dev-portal.onshape.com) |
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

## Fab tracker

One list of parts (`fab_parts`) with the columns of the team's tracker sheets — Status, Bot, Subsystem, Part #/Name, Priority (#0 most urgent), Qty + spares, Stock material/type, Stock dimensions, Length, Tapped, Machine, Infill/Designer (prints), DRI (the people on it), file, Linear issue, Notes — plus what the app adds: kind (plate / tube & bar / shaft / machined / 3D print), sizes, a plate outline, files, the stock it's cut from and how many have been cut. Needs migrations 0009–0011 (0011 merged the old sheet-only tracker table into parts).

- **Machining** / **3D print** (`/tracker`, `/tracker/print`) — the sheets, as tables (cards on phones): status changed in place, filters by bot / subsystem / machine, search, "still to make" counts. **Import from sheet**: paste rows (with the header) from Sheets/Excel; a part with the same bot + name is updated (only the pasted columns), so pasting onto Onshape-synced parts fills in their tracker columns.
- **Board** (`/tracker/board`) — the same parts as a kanban whose columns are the sheet's statuses (Not Started → Have Drawing/CAM → In Progress → Finished; SendCutSend / Spares / Not Needed columns appear when used). Filter to one kind, a bot, or **Mine** (set **Who are you?** once per device). Drag on desktop, tap on a phone.
- **Onshape** (`/tracker/designs`) — paste an assembly (or Part Studio) link; **Sync** reads the BOM (flattened, quantities summed, standard hardware skipped), then two calls per Part Studio (properties + body details). The **`Process`** custom property picks the kind (Router/Laser/CNC → Plate, Tube/Saw → Tube & bar, Lathe/Hex → Shaft, 3D print, Mill → Machined, COTS/Purchased → left out); **Subsystem / Priority / Machine / Tapped** properties fill those columns. A design's **Bot** goes on its parts; **Robots** multiplies quantities. Re-syncing updates in place; parts that left the design are flagged, not deleted.
- **COTS BOM** (`/tracker/bom`) — what the robots need that's bought, not made: Onshape standard hardware (bolts, nuts) and every synced part that isn't ours (no part number like `0201_`, not printed, or `Process` = COTS). Quantity across all robots, vendor / part number / buy link from Onshape properties, Need to buy → Ordered → Have it (one at a time or in bulk), **Copy buy list**. **We make this** moves a line onto the tracker; **We don't make this** on the board moves it back. Origin cubes and unnamed "Part 7" bodies are skipped. Needs migration 0012.
- **Part page** (`/tracker/[id]`) — every column, files (plates get a DXF straight from the model; STEP/STL from Onshape on demand; anything else uploads straight to storage), the DFM breakdown per machine, the stock it's cut from (matched from the model's size, or from the sheet's material + dims text; pick one to lock it), history.
- **Machines** (`/tracker/machines`) — what each machine can do. Blank specs are "not checked", never guessed. Seeded with the Sept 2026 shop (CNC router, xTool MetalFab 1200W, manual mill, 3-axis CNC mill, manual lathe, horizontal + vertical bandsaws).
- **DFM checks** (`lib/dfm.ts`) — SendCutSend-style: material allowed on the machine (and never-laser materials), thickness (per-material limits), bed size, holes vs the bit / min hole / half the thickness, sharp inside corners and inside radii vs the bit, narrowest slot, thinnest web; saw/lathe/mill/printer size limits.
- **Cut plan** (`/tracker/plan`) — every stock part (plate / tube / shaft) not cut yet, across the active designs. Grouped by stock material and, for plates, by the machine it's going to, so router and xTool parts get their own sheets sized to that bed and bit. Plates are nested (MaxRects on the part's box, 90° turns) around anything already cut out of a sheet, offcuts first; sticks best-fit with the saw kerf. Short → **Add to shopping list**. **Download DXF** per sheet; **Mark cut** takes it off the rack.
- **Stock is automatic** — a plate / tube / shaft moving from Not Started / Have CAM / Spares Needed to In Progress / Finished / Spares Finished (table, board, part page) takes whatever's still uncut off the rack with the same packing: sticks are cut to length with the kerf, plates get their spot marked as an unusable area on the best sheet (or the sheet is used up). Each is a normal stock log entry with **Undo**. If the rack is short, the status still changes and a note says what's missing. SendCutSend parts don't touch stock.

Code: `lib/parts.ts` (kinds, statuses, classification, stock matching), `lib/tracker.ts` (the sheet's statuses, dropdowns, paste import), `lib/onshape.ts` (API client), `lib/geom.ts` (DXF read/write, outlines), `lib/dfm.ts`, `lib/nest.ts`, `lib/parts-data.ts`, `app/parts-actions.ts`, `components/tracker.tsx`, `components/parts-*.tsx`, `components/part-detail.tsx`.

## Fab tracker

Needs [`0010_tracker_dead_zones.sql`](supabase/migrations/0010_tracker_dead_zones.sql). `/tracker` (Machining) and `/tracker/print` (3D printing) are the team's tracker sheets: same columns, statuses, #0–#4 priorities and dropdown lists (offered as suggestions). Grouped by subsystem, filtered by bot / subsystem / machine / status, status changes in place. **Import from sheet**: copy the rows with the header row out of the sheet (or a CSV) and paste; a part with the same bot + name updates instead of doubling. A machining row can link to a rack material to show whether the stock is on hand. Code: `lib/tracker.ts`, `lib/tracker-data.ts`, `app/tracker-actions.ts`, `components/tracker.tsx`.

The same migration adds **unusable areas** to sheet stock (`fab_pieces.dead_zones`, rectangles in mm from the sheet's corner). Logging a cut as "Same, with holes" or editing a sheet shows it to scale: drag to mark what's gone. On-hand totals use the usable area, and "Find a piece" only suggests a sheet when the need fits a clean rectangle (`freeRects` in `lib/fab.ts`). Drawn in `components/sheet-map.tsx`.

## Deploy

Vercel: import the repo, set the five env vars (plus the two Onshape keys for Parts), deploy. `public/manifest.json` makes it installable (Add to Home Screen).
