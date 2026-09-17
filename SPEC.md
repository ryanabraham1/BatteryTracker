# Battery Tracker — Spec Sheet

**Team:** FRC 3256
**Type:** Mobile-first web app (PWA)
**Status:** Draft v1 — 2026-09-15

---

## 1. Purpose

One place for the team to know **which batteries exist, what state each one is in, how healthy it is, and which one to grab next**. Optimized for a phone in a noisy pit: any common action takes ≤ 2 taps.

## 2. Non-Goals (explicitly out of scope for v1)

- QR / barcode scanning (batteries are identified by their existing names)
- User accounts, roles, or per-user audit trails
- Native iOS / Android apps
- Charger inventory tracking
- Push notifications
- Bluetooth integration with testers

(Offline support was originally out of scope; it shipped in v1.1 — see §6.8.)

## 3. Users & Access

- **Single shared team code.** Enter it once on the login screen; a cookie/localStorage session keeps you signed in on that device.
- No roles. Everyone who has the code can do everything.
- No "who did it" tracking. Logs record **what happened to the battery and when**, not by whom.
- Team code is stored server-side as an env var; changing it logs everyone out.

## 4. Domain Model

### 4.1 Battery
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | internal |
| `name` | text, unique | the team's existing battery name (e.g. "Thor", "B07") |
| `brand_model` | text | e.g. MK ES17-12, Interstate SLA1116 |
| `capacity_ah` | number | default 18 |
| `purchase_date` | date | |
| `manufacture_date` | date | date printed on the battery |
| `status` | enum | `active` · `practice_only` · `retired` |
| `retired_reason` | text, nullable | |
| `notes` | text | |
| `state` | enum | live location/state — see §4.2 |
| `state_changed_at` | timestamp | drives rest-time and "charging too long" logic |
| `cycle_count` | int | auto-incremented on each completed charge |

### 4.2 Battery state (the live board)
```
READY  →  IN_ROBOT  →  COOLING  →  CHARGING  →  READY
                                  ↘ NEEDS_ATTENTION (any state can go here)
```
| State | Meaning |
|---|---|
| `ready` | Charged, rested, OK to use |
| `in_robot` | Currently in a robot (comp or practice) |
| `cooling` | Just came out; resting before charge |
| `charging` | On a charger |
| `needs_attention` | Flagged: brownout, bad reading, physical issue |

### 4.3 Event log (append-only)
Every change to a battery produces an event. This is the "what's going on" log.

| Field | Type |
|---|---|
| `id` | uuid |
| `battery_id` | fk |
| `type` | enum — `state_change` · `charge` · `usage` · `beak_test` · `cba_test` · `load_test` · `incident` · `note` · `status_change` |
| `occurred_at` | timestamp |
| `data` | jsonb (shape depends on `type`, below) |

**`state_change`** — `{ from, to }`
**`charge`** — `{ charger?: string, started_at, ended_at, resting_voltage_after? }`
**`usage`** — `{ context: "match" | "practice" | "other", match_label?: string, voltage_before?, voltage_after?, charge_pct_before?, charge_pct_after?, ir_before_mohm?, ir_after_mohm?, duration_min?, driver_rating?: 1–5 }`
**`beak_test`** — `{ voltage, internal_resistance_mohm, charge_pct?, v1?, v2?, beak_status?: "Good" | "Fair" | "Bad" | "Charge Battery", phase?: "pre_match" | "post_match", match_label? }` (Battery Beak; `voltage` is the no-load V0, `v1`/`v2` the 1 A / 18 A readings and `beak_status` the Beak's verdict — the last three come from scanning the screen; `phase` set by the pre/post-match sheets)
**`load_test`** — `{ loaded_voltage, held_10s: boolean, open_voltage?, notes? }` (100 A load tester: hold 10 s; fail = second drop or below `load_test_min_v`)
**`cba_test`** — `{ measured_ah, measured_wh?, mode? (cc|cp|cr|cv), test_current_a? | test_power_w? | test_resistance_ohm? | test_voltage_v?, cutoff_v?, duration_min?, ir_mohm?, temp_internal_c?, temp_external_c?, notes? }` (CBA discharge / capacity test — fields mirror the SkyRC BD380 end-of-discharge screen)
**`incident`** — `{ kind: "brownout" | "died" | "connector" | "swollen" | "other", match_label?, notes }`
**`note`** — `{ text }`
**`status_change`** — `{ from, to, reason? }`

### 4.4 Settings (single row)
| Field | Default | Purpose |
|---|---|---|
| `min_rest_after_charge_min` | 30 | Don't recommend a battery until it has rested this long |
| `max_charge_duration_min` | 240 | Flag "charging too long" |
| `ir_warn_mohm` | 15 | IR ≥ this → **reserve** (below = comp-ready) |
| `ir_practice_mohm` | 18 | IR ≥ this → **practice only** (suggests marking practice-only) |
| `ir_suspect_mohm` | 23 | IR ≥ this → **suspect** |
| `ir_fail_mohm` | 25 | IR ≥ this → **retire** (suggests retiring; IR score hits 0) |
| `load_test_min_v` | 10 | Loaded voltage below this fails the 100 A load test |
| `capacity_warn_pct` | 80 | CBA measured / expected Ah below this → warn (expected = Peukert-corrected rated Ah when the test recorded time or current, else rated) |
| `peukert_k` | 1.2 | Peukert exponent: expected Ah at current I = rated · (I₂₀ / I)^(k−1). ≈1.2 SLA, ≈1.05 lithium, 1.0 off |
| `cba_max_temp_c` | 50 | External-probe battery temp during a CBA discharge at/above this → warn |
| `capacity_fail_pct` | 70 | below this → recommend retire |
| `max_cycles_warn` | 200 | age warning |

## 5. Health Score

Each battery gets a **0–100 health score** and a badge: **Good** (≥75) · **Watch** (50–74) · **Bad** (<50).

Computed from the most recent data available; missing inputs are skipped and weights renormalized.

| Input | Weight | Scoring |
|---|---|---|
| Latest CBA capacity % of expected (rate-corrected) or of rated | 40% | 100% → 100 pts, linearly down to `capacity_fail_pct` → 0 |
| Latest Beak internal resistance | 30% | ≤ 10 mΩ → 100, `ir_fail_mohm` → 0 |
| Recent driver ratings (last 5 usages) | 15% | avg rating × 20 |
| Incidents in last 30 days | 10% | 0 → 100, each incident −35 |
| Cycle count / age | 5% | 0 cycles → 100, `max_cycles_warn` → 0 |

A **failed 100 A load test** caps the score at 40 (Bad) regardless of other inputs.

Also surfaces **explicit warnings** (independent of score):
- IR tier (reserve / practice-only / suspect / retire) from the latest Beak reading
- Failed load test
- Capacity below warn/fail threshold
- 3+ consecutive driver ratings ≤ 2
- Any incident in the last 7 days
- No Beak test in 30+ days / no CBA test in 90+ days
- Charging longer than `max_charge_duration_min`

## 6. Screens

### 6.1 Login `/login`
- Dark plum full-bleed screen matching the attendance app: `TEAM 3256` mono eyebrow, huge display headline (“Grab a battery.”), one input **“Shared team code”**, one white button **“Open tracker →”**.
- Wrong code → inline red error, no lockout.

### 6.2 Board `/` (home)
- Five columns (desktop) / stacked sections (mobile): **Ready · In Robot · Cooling · Charging · Needs Attention**, each with a count.
- **Ready** is sorted best-first: health score desc, then longest-rested. Top card gets a **“GRAB THIS”** tag.
- Ready batteries still inside the rest window show a countdown chip (“rests 12m”) and sort below rested ones.
- Each card: name (display font), health badge, last voltage, chips for cycles / last tested / time in current state.
- Tap a card → bottom sheet. Ready cards lead with **Pre-match check** (Beak reading + match → In Robot); In Robot cards lead with **Post-match check** (Beak + driver rating → usage event with pre/post ΔV, ΔIR → Cooling). Then **Move to → [states]** + **Log usage**, **Beak check**, **Load test**, **Flag issue**.
- In comp mode the GRAB THIS card gets a **Pre-match check** button and In Robot cards get **Post-match** + **Brownout**.
- Any Beak reading whose IR lands in a worse band than the battery's status prompts a one-tap **Mark practice-only / Retire**.
- Header: team code indicator, **Log** and **Batteries** nav, search.
- Live updates via Supabase realtime so every phone in the pit sees the same board.

### 6.3 Battery detail `/batteries/[name]`
- Header: name, status pill, health score ring, current state + duration.
- **Stats row:** cycles, age, last Beak V / IR, last CBA Ah, avg driver rating.
- **Charts:** Beak IR over time (tier lines), voltage over time, **voltage drop per match**, **load-test V @ 100 A**, CBA capacity (% of expected at test rate), CBA IR, CBA mean V under load.
- **CBA analysis card:** % of Peukert-expected capacity, mean V under load (Wh ÷ Ah), state of health vs first CBA test, IR drift vs best reading (+30 % warn, 2× fail), battery temp.
- **Timeline:** full event log for this battery, newest first, filterable by type.
- Actions: Move state, Log charge, Log usage, Beak test, CBA test, Flag incident, Add note, Edit, Retire / Un-retire.

### 6.4 Batteries `/batteries`
- Table/list of all batteries with health, status, state, cycles, last tests. Sort + filter (Active / Practice-only / Retired).
- **Add battery** form (name, brand/model, capacity, purchase date, notes).
- Export CSV.

### 6.5 Activity log `/log`
- Global feed of all events across all batteries, newest first, filter by type/battery/date range.
- Export CSV.

### 6.6 Competition mode `/comp`
- Toggle on from header. Adds a **match label** field (Q12, SF1-2…) that pre-fills on usage/incident logs.
- **Rotation plan:** next N matches × recommended battery, derived from Ready order + rest rule; recalculates live as states change.
- One-tap **“Brownout”** button on In-Robot cards → creates an incident and moves battery to Needs Attention.

### 6.7 Settings `/settings`
- Edit thresholds from §4.4. Change team code (requires current code).

### 6.8 Offline (v1.1)
- A service worker (`public/sw.js`) caches the app shell and the last copy of each page, so the board still opens on dead pit Wi‑Fi.
- When offline (browser event, failed action, or failed `/api/ping`), every log/move form drops into a **localStorage outbox** instead of calling the server; the board shows the queued result immediately with a `queued` chip. The outbox replays in order on reconnect (or on next app open) — a banner shows the count.

## 7. Key Flows

**Grab a battery (match about to start)**
Board → top Ready card says GRAB THIS → tap → “Move to In Robot” → done (2 taps).

**Battery comes off the robot**
Tap card in In Robot → “Log usage” sheet (voltage after, driver rating 1–5, optional match) → save → auto-moves to Cooling. Minimal fields; everything optional except rating.

**Put on charger**
Tap card in Cooling → “Move to Charging” → `charge` event opened. When moved to Ready, the charge event closes, `cycle_count++`, optional resting voltage prompt.

**Beak check (pit routine)**
Tap card → “Beak check” → enter V, IR, % (or **Scan Beak screen**: photograph the Beak's OLED and on-device OCR fills them in) → saved, health recomputed, warnings shown instantly.

**CBA test (shop day)**
Battery detail → “CBA test” → enter measured Ah → capacity trend + retire recommendation if under threshold.

## 8. Visual Design (adopted from 3256attend)

### Tokens
```css
--ink:          #18151f;   /* primary text */
--paper:        #f5f6fa;   /* app background */
--surface:      #ffffff;   /* cards */
--line:         #dedee7;   /* borders */
--muted:        #716d7a;   /* secondary text */
--purple:       #6b3fd4;   /* primary accent */
--purple-dark:  #4b259e;
--purple-soft:  #eee9fb;
--plum:         #201632;   /* login background */
--plum-text:    #bda8ee;   /* eyebrow text on plum */

/* semantic (reused from attendance statuses) */
--good:   #178558;  --good-soft:  #e7f6ef;   /* Ready / healthy */
--warn:   #b86a04;  --warn-soft:  #fff2d9;   /* Watch / cooling / charging */
--bad:    #cf3e4c;  --bad-soft:   #fcecef;   /* Needs attention / bad */
--info:   #2b69b6;  --info-soft:  #e8f1fc;   /* In robot */
```

### Typography
- **Display / body:** Space Grotesk (Google Fonts). Big headlines at weight 400 with tight negative letter-spacing (≈ −0.075em).
- **Labels / eyebrows / numbers:** IBM Plex Mono, 11–12px, weight 600, uppercase, letter-spacing ≈ 0.18em (e.g. `ROSTER`, `TEAM 3256` style).
- Voltage / IR / Ah readouts use the mono font.

### Components
- Cards: white surface, 1px `--line` border, ~10px radius, no shadow.
- Primary button: white on plum (login) / purple on paper (app), 650 weight, arrow suffix “→”.
- Selectable tiles (state pickers, filters): outlined tiles like the “Pick your crew” grid; selected = purple border + purple-soft fill.
- Status pills: soft background + strong text color from the semantic pairs above.
- Login page is the only dark screen; the rest of the app is light `--paper`. (Dark mode for the whole app is a v2 item.)

## 9. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS with the tokens above as CSS variables |
| Database / realtime | Supabase (Postgres + Realtime) |
| Auth | Shared team code checked in a Route Handler → signed HttpOnly cookie; Next.js middleware guards all routes except `/login` |
| Charts | Recharts |
| OCR | Tesseract.js (WASM, on-device) for reading the Battery Beak screen; assets self-hosted under `/ocr` |
| Hosting | Vercel |
| PWA | `manifest.json` + installable; offline is **not** in v1 |

### Tables
`batteries`, `battery_events`, `settings`. RLS enabled; all access goes through server actions using the service role, gated by the cookie (no per-user Supabase auth).

## 10. Milestones

1. **Scaffold + login + tokens** — Next.js, Tailwind theme, plum login, cookie gate.
2. **Batteries CRUD + Board** — add/edit/retire, state moves, event log written on every change, realtime board.
3. **Logging sheets** — usage, charge, Beak, CBA, incident, note.
4. **Health score + warnings** — scoring engine, badges, GRAB THIS ordering, rest countdown.
5. **Detail page + charts + activity log + CSV export.**
6. **Competition mode** — match labels, rotation plan, brownout button.
7. **Settings + polish** — thresholds, PWA manifest, mobile QA in the pit.

## 11. Open Questions

- Do you want practice-only batteries shown on the same board or a separate tab?
- Should the rotation plan be editable by hand (drag to reorder) or purely automatic?
- Rest-time and threshold defaults above are guesses — confirm against what the team actually uses.
