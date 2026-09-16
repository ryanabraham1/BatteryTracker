#!/usr/bin/env python3
"""Import the team's battery spreadsheet into Supabase.

    python3 scripts/import-xlsx.py "path/to/ebde-battery tracker.xlsx" [--dry]

Wipes every battery + event (the placeholder seed) and rebuilds from the sheets.
Re-runnable. Needs openpyxl (`pip3 install openpyxl`) and .env.local.

The sheets have no dates on them, so each event day is pinned to a constant
below. "47 drive practice" / "48 new batteries" / "417 drive practice" read
as April 7 / 8 / 17; CBA tests carry their own dates. Adjust EBD / DCMP / CMP
if they're off and re-run.
"""
import json
import re
import sys
import urllib.request
from datetime import date, datetime, time, timedelta
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
TZ = "-04:00"  # America/New_York, DST

# --- Event days ------------------------------------------------------------
MEASURE_DAY = date(2026, 3, 7)    # "battery measurements" shop day (times on the sheet)
EBD_DAY = date(2026, 3, 14)       # "ebd perfomance" + Sheet1 quals; playoffs same day
PRACTICE_47 = date(2026, 4, 7)
NEW_BATTERIES_48 = date(2026, 4, 8)
DCMP_QUALS = date(2026, 4, 10)
DCMP_PLAYOFFS = date(2026, 4, 11)
PRACTICE_417 = date(2026, 4, 17)
CMP_THU = date(2026, 4, 22)       # practice + first quals
CMP_FRI = date(2026, 4, 23)
CMP_SAT = date(2026, 4, 24)

CBA_CURRENT_A = 13  # "Each test done at 13A discharge down to 11.5V"

# Sheet spellings → canonical battery name
ALIASES = {
    "samuel": "Sam", "sam": "Sam", "db": "Diddyblud", "diddyblud": "Diddyblud",
}
NEW_BATTERIES = {"Joltik", "Aimee", "Luxray", "Rhea", "Comet", "Mareep"}


# --- Supabase REST -----------------------------------------------------------
def load_env():
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


ENV = load_env()
URL = ENV["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/"
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]


def rest(method, path, body=None, prefer="return=representation"):
    req = urllib.request.Request(
        URL + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


# --- Helpers ---------------------------------------------------------------
def canon(name):
    if not name:
        return None
    n = str(name).strip().lower()
    n = re.sub(r"\s*\((un)?heated\)|\s+heated$", "", n).strip()
    if n.startswith("*"):
        n = n[1:]
    n = n.split("/")[0].strip()  # "*shreya/ryan" → first named
    n = n.split(" ")[0]
    return ALIASES.get(n, n.capitalize())


def name_note(raw):
    """Extra context hidden in the battery cell: '(heated)', '*a/b??' etc."""
    if not raw:
        return None
    s = str(raw).strip()
    notes = []
    if "heated" in s.lower():
        notes.append("unheated" if "unheated" in s.lower() else "heated")
    if "/" in s or "?" in s or s.startswith("*"):
        notes.append(f"battery assignment uncertain ({s.strip('*').strip()})")
    return "; ".join(notes) or None


def num(v):
    """First number in a cell; None if there isn't one."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(\.\d+)?", str(v))
    return float(m.group()) if m else None


def pct(v):
    """Beak charge shows up as 0.82, 82, 1.3 or 130 depending on who typed it."""
    n = num(v)
    if n is None:
        return None
    return round(n * 100) if n <= 2 else round(n)


def mohm(v):
    n = num(v)
    return round(n * 1000, 1) if n is not None else None


def at(day, t):
    return datetime.combine(day, t).isoformat() + TZ


def extra(v):
    """Trailing text in a numeric cell, e.g. '112% (after charging)'. """
    if v is None or isinstance(v, (int, float)):
        return None
    m = re.search(r"\((.*)\)", str(v))
    return m.group(1).strip() if m else None


def join(*parts):
    return "; ".join(p for p in parts if p) or None


# --- Import state ----------------------------------------------------------
batteries = {}  # name → {notes: [...]}
events = []     # (name, type, occurred_at, data)


def battery(name):
    if name not in batteries:
        batteries[name] = {"notes": []}
    return batteries[name]


def ev(name, typ, when, data):
    battery(name)
    events.append((name, typ, when, {k: v for k, v in data.items() if v is not None}))


def beak(name, when, v0, v1, v2, r, charge=None, phase=None, match=None, note=None):
    """Beak reading → beak_test. V0 is the open-circuit reading; V2 the loaded one.
    Health scoring needs IR, so readings without it become a note instead."""
    v = num(v0) if num(v0) is not None else (num(v1) if num(v1) is not None else num(v2))
    ir = mohm(r)
    if v is None and ir is None:
        return
    if ir is None:
        parts = [f"Beak {v:.3f} V"]
        if pct(charge) is not None:
            parts.append(f"{pct(charge)}%")
        if num(v2) is not None:
            parts.append(f"V2 {num(v2):.3f}")
        ev(name, "note", when, {"text": join(" · ".join(parts), phase and phase.replace("_", "-"), match, note)})
        return
    data = {"voltage": v, "internal_resistance_mohm": ir, "charge_pct": pct(charge), "phase": phase, "match_label": match}
    ev(name, "beak_test", when, data)
    if note:
        ev(name, "note", when, {"text": join(match, note)})


def is_brownout(text):
    if not text:
        return False
    t = str(text).strip().lower()
    return "brownout" in t and not t.startswith("no brownout") and not t.startswith("none")


def usage(name, when, match, context, notes=None, pre=None, post=None, brownout=None, name_raw=None):
    """One match/practice run. pre/post = (charge, V0, V1, V2, R)."""
    data = {"context": context, "match_label": match, "notes": join(name_note(name_raw), notes)}
    if pre:
        c, v0, v1, v2, r = pre
        data["charge_pct_before"] = pct(c)
        data["voltage_before"] = num(v0) if num(v0) is not None else num(v1)
        data["ir_before_mohm"] = mohm(r)
    if post:
        c, v0, v1, v2, r = post
        data["charge_pct_after"] = pct(c)
        data["voltage_after"] = num(v0) if num(v0) is not None else num(v1)
        data["ir_after_mohm"] = mohm(r)
    ev(name, "usage", when, data)
    # Brownout column ("4 secs", "none", "~10-15 sec") or notes text
    bo = brownout
    if bo is not None and str(bo).strip().lower() not in ("none", "no", ""):
        ev(name, "incident", when, {"kind": "brownout", "match_label": match, "notes": f"brownout {str(bo).strip()}"})
    elif bo is None and is_brownout(notes):
        ev(name, "incident", when, {"kind": "brownout", "match_label": match, "notes": str(notes).split(";")[0].strip()})


def match_time(day, i, start=time(9, 0), step_min=12):
    return at(day, (datetime.combine(day, start) + timedelta(minutes=step_min * i)).time())


# --- Sheets ----------------------------------------------------------------
def rows(ws, skip=1):
    out = []
    for r in ws.iter_rows(values_only=True):
        out.append(list(r) + [None] * (60 - len(r)))
    return out[skip:]


def sheet_cba(wb):
    for r in rows(wb["CBA Tests"], skip=2):
        name, start_v, wh, t, d, tester, notes, recent, tier = r[:9]
        if not name or not isinstance(d, datetime):
            continue
        n = canon(name)
        mins = num(t)
        data = {
            "measured_ah": round(CBA_CURRENT_A * mins / 60, 2) if mins else None,  # Ah ≈ I × t
            "measured_wh": round(wh, 2) if wh else None,
            "test_current_a": CBA_CURRENT_A,
            "notes": join(f"to 11.5 V in {int(mins)} min" if mins else None, f"start {start_v} V", tester, notes, tier),
        }
        ev(n, "cba_test", at(d.date(), time(15, 0)), data)
        if tier:
            battery(n)["notes"].append(f"CBA: {tier}")


def sheet_measurements(wb):
    """One shop day, five Beak passes per battery. Column groups are positional."""
    day = MEASURE_DAY
    for r in rows(wb["battery measurements"]):
        if not r[1]:
            continue
        n = canon(r[1])
        charger = f"charger {int(r[2])}" if num(r[2]) else None
        # 12:30 — fresh off charger (on since 11:30)
        beak(n, at(day, time(12, 30)), r[5], r[6], r[7], r[8], r[4],
             note=join(charger, r[3] and f"charger showed {r[3]}", num(r[9]) and f"multimeter {r[9]} V @12:50"))
        # 14:00 — after an hour off the charger
        beak(n, at(day, time(14, 0)), r[15], r[16], r[17], r[18], r[14],
             note=join("1 h off charger", num(r[19]) and f"multimeter {r[19]} V"))
        # 14:25 — after ~10 min back on charger, then drive-station readings
        ds = join(num(r[28]) and f"DS {r[28]} V", num(r[29]) and f"{r[29]} V after 1 min",
                  num(r[30]) and f"{r[30]} V after 10 s driving", num(r[31]) and f"PDH {r[31]} V",
                  num(r[32]) and f"PDH {r[32]} V after 1 min")
        beak(n, at(day, time(14, 25)), r[24], r[25], r[26], r[27], r[23],
             note=join(r[21], r[22] and f"charger showed {r[22]}", ds))
        # unlabeled pass between 14:25 and 18:00
        if num(r[35]) is not None:
            beak(n, at(day, time(16, 0)), r[36], r[37], r[38], r[39], r[35],
                 note=join(r[34] and f"charger showed {r[34]}", isinstance(r[40], str) and f"charger {r[40]}"))
        # 18:00
        if num(r[44]) is not None or num(r[45]) is not None:
            ds = join(num(r[50]) and f"DS {r[50]} V at start", num(r[51]) and f"{r[51]} V after 2 min",
                      num(r[52]) and f"{r[52]} V after 10 s driving", num(r[53]) and f"PDH {r[53]} V")
            beak(n, at(day, time(18, 0)), r[45], r[46], r[47], r[48], r[44],
                 note=join(num(r[43]) and f"charger {int(r[43])}", num(r[49]) and f"multimeter {r[49]} V", ds))


def sheet_ebd(wb):
    """'ebd perfomance' has every match; Sheet1 adds pre-match Beak for the last six."""
    pre = {}
    for r in rows(wb["Sheet1"]):
        if r[0]:
            pre[r[0]] = r
    i = 0
    for r in rows(wb["ebd perfomance"]):
        flag, match, raw, brownout, notes = r[:5]
        if not match:
            continue
        label = match.rstrip("*")
        n = canon(raw)
        uncertain = "battery order uncertain" if (match.endswith("*") or flag) else None
        p = pre.get(label)
        when = match_time(EBD_DAY, i)
        i += 1
        pre_t = (p[2], p[3], p[4], p[5], p[6]) if p else None
        good = p[7] if p else None
        usage(n, when, label, "match", notes=join(notes, uncertain, extra(p[2]) if p else None, good),
              pre=pre_t, brownout=brownout, name_raw=raw)


def sheet_practice_47(wb):
    for i, r in enumerate(rows(wb["47 drive practice"])):
        if not r[2]:
            continue
        n = canon(r[2])
        pre = (r[3], r[4], r[5], r[6], r[7])
        post = (r[11], r[13], r[14], r[15], r[16]) if any(x is not None for x in r[11:17]) else None
        ds = join(r[8] and f"DS {r[8]}", r[12] and f"DS after {r[12]}", r[1] and f"charger {r[1]}")
        usage(n, match_time(PRACTICE_47, i, time(16, 0), 20), f"practice {int(r[0])}", "practice",
              notes=join(r[9], ds), pre=pre, post=post)


def sheet_new_48(wb):
    """First Beak of the new batteries. Unnamed rows are skipped — no way to tell whose they are."""
    day = NEW_BATTERIES_48
    for i, r in enumerate(rows(wb["48 new batteries"])):
        if not r[0]:
            continue
        n = canon(r[0])
        beak(n, at(day, time(16, 0)), r[5], r[6], r[7], r[8], r[4],
             note=join(r[2] and f"{r[2]} charger", r[3] and f"charger showed {r[3]}",
                       num(r[9]) and f"multimeter {r[9]} V", r[10]))
        if any(x is not None for x in r[12:17]):
            beak(n, at(day, time(18, 0)), r[13], r[14], r[15], r[16], r[12], phase="post_match", note="after practice")


def sheet_dcmp(wb):
    q = p = 0
    for r in rows(wb["dcmp"]):
        match, raw = r[0], r[1]
        if not raw:
            continue
        n = canon(raw)
        post = (r[10], r[11], r[12], r[13], r[14]) if any(x is not None for x in r[10:15]) else None
        if match == "Testing":
            if post:
                c, v0, v1, v2, rr = post
                beak(n, at(DCMP_QUALS, time(12, 0) if q else time(8, 0)), v0, v1, v2, rr, c, note="testing")
            continue
        if match.startswith("M"):
            when = match_time(DCMP_PLAYOFFS, p, time(13, 0))
            p += 1
        else:
            when = match_time(DCMP_QUALS, q)
            q += 1
        pre = (None, r[2], r[3], r[4], r[5])
        usage(n, when, match, "match", notes=join(r[8], r[7], num(r[6]) and f"multimeter {r[6]} V", r[15]),
              pre=pre if any(x is not None for x in r[2:6]) else None, post=post, name_raw=raw)


def sheet_practice_417(wb):
    in_notes = False
    for r in rows(wb["417 drive practice"]):
        if r[0] == "ryan notes:":
            in_notes = True
        elif in_notes and r[0] and r[1]:
            # a driver's verdict per battery: "Sam | Mid | Brownout in 2"
            battery(canon(r[0]))["notes"].append(f"Drive practice 4/17: {r[1]}" + (f" ({str(r[2]).strip()})" if r[2] else ""))
        elif r[1] and isinstance(r[2], (int, float)):
            beak(canon(r[1]), at(PRACTICE_417, time(16, 0)), r[2], r[3], r[4], r[5])


def sheet_cmp(wb):
    day, i = CMP_THU, 0
    for r in rows(wb["CMP"]):
        match, raw = r[0], r[1]
        if match == "Friday":
            day, i = CMP_FRI, 0
            continue
        if match == "Playoffs":
            day, i = CMP_SAT, 0
            continue
        if not raw:
            continue
        n = canon(raw)
        label = str(match).strip()
        context = "practice" if label.lower().startswith("practice") else "match"
        pre = (None, r[2], r[3], r[4], r[5]) if any(x is not None for x in r[2:6]) else None
        post = (r[8], r[9], r[10], r[11], r[12]) if any(x is not None for x in r[8:13]) else None
        when = match_time(day, i, time(10, 0), 30)
        i += 1
        usage(n, when, label, context, notes=join(r[7], num(r[6]) and f"unlabeled reading {r[6]}", r[14]),
              pre=pre, post=post, name_raw=raw)
    # Side block: multimeter readings on Luxray / Comet at 16:15 Thursday
    for r in rows(wb["CMP"]):
        if r[18]:
            ev(canon(r[18]), "note", at(CMP_THU, time(16, 15)),
               {"text": f"multimeter {r[19]} V; unlabeled reading {r[20]}"})


# --- Run ---------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
    sheet_measurements(wb)
    sheet_ebd(wb)
    sheet_practice_47(wb)
    sheet_new_48(wb)
    sheet_dcmp(wb)
    sheet_practice_417(wb)
    sheet_cba(wb)
    sheet_cmp(wb)

    # Battery rows. Rhea only ever did CBA tests and is marked "testing only".
    battery("Rhea")
    rows_out = []
    for n, b in sorted(batteries.items()):
        notes = "\n".join(b["notes"])
        status = "practice_only" if n == "Rhea" else "active"
        rows_out.append({
            "name": n,
            "brand_model": "",
            "capacity_ah": 18,
            "purchase_date": NEW_BATTERIES_48.isoformat() if n in NEW_BATTERIES else None,
            "status": status,
            "notes": notes,
            "state": "ready",
            "cycle_count": sum(1 for e in events if e[0] == n and e[1] == "usage"),
        })

    print(f"{len(rows_out)} batteries, {len(events)} events")
    for e in events:
        assert e[0] in batteries, e
    if "--dry" in sys.argv:
        for b in rows_out:
            print(b["name"], b["status"], b["cycle_count"], repr(b["notes"]))
        for e in sorted(events, key=lambda e: e[2]):
            print(e[2][:16], f"{e[0]:10} {e[1]:11}", e[3])
        return

    # Wipe placeholders (events cascade) and insert.
    rest("DELETE", "battery_events?id=neq.00000000-0000-0000-0000-000000000000", prefer="return=minimal")
    rest("DELETE", "batteries?id=neq.00000000-0000-0000-0000-000000000000", prefer="return=minimal")
    inserted = rest("POST", "batteries", rows_out)
    ids = {b["name"]: b["id"] for b in inserted}
    payload = [{"battery_id": ids[n], "type": t, "occurred_at": w, "data": d} for n, t, w, d in events]
    for k in range(0, len(payload), 200):
        rest("POST", "battery_events", payload[k:k + 200], prefer="return=minimal")
    print("done")


if __name__ == "__main__":
    main()
