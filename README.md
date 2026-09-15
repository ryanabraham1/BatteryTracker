# Battery Tracker — FRC 3256

Mobile-first PWA: which batteries exist, what state each is in, how healthy it is, and which one to grab next. See [SPEC.md](SPEC.md).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Realtime) · Recharts · Vercel.

## Setup

1. **Supabase project** — create one, then run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the SQL editor (or `supabase db push`). It creates `batteries`, `battery_events`, `settings` (single row), enables RLS (locked down — the app uses the service role), and adds triggers that broadcast a `changed` ping on the public `board` realtime topic.
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
- `components/` — board, cards, bottom sheet, forms, charts

## Deploy

Vercel: import the repo, set the five env vars, deploy. `public/manifest.json` makes it installable (Add to Home Screen).
