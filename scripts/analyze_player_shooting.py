"""[Shooting by Rest] Rhythm, fatigue and age — at player level.

READ-ONLY against the database. Writes one markdown report to ``docs/audit/``.

Three questions, all asked WITHIN a player so roster quality never enters:

  fatigue   does a player shoot worse on short rest?
  rhythm    does a player shoot better when he has been playing a lot?
  age       does either effect change as he gets older?

The important improvement over the team-level pass: rest and load are measured from
the player's OWN played games, not his team's schedule. If he sat last night, he is
not on a back-to-back — his team is. That distinction is what made team box scores
unable to separate "the players were tired" from "the best shooter did not play",
and measuring the player directly removes it rather than adjusting for it.

Rhythm and fatigue are NOT one axis with two signs. Fatigue is about last night;
rhythm is about the last week. A player can be rested but cold (back from a long
break) or busy but not on a back-to-back. The 2x2 separates them.

Usage:
    python scripts/analyze_player_shooting.py
    python scripts/analyze_player_shooting.py --min-fga 40
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from bisect import bisect_left
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "ml" / "data" / "shooting"
REPORT = ROOT / "docs" / "audit"
REGULAR_PREFIX = "002"

# A player-season contributes to a contrast only if it clears this in BOTH arms.
# Below roughly this, a single hot night moves the number more than any real effect.
DEFAULT_MIN_FGA = 30
# Career FGA required in each arm before a player appears in a named leaderboard.
LEADERBOARD_MIN_FGA = 250

AGE_BUCKETS = [(0, 24, "23 and under"), (24, 28, "24–27"), (28, 32, "28–31"), (32, 99, "32 and over")]


# ── small stats helpers ──────────────────────────────────────────────────────

def efg(fgm: float, fga: float, fg3m: float) -> float:
    return (fgm + 0.5 * fg3m) / fga


def efg_se(fgm: float, fga: float, fg3m: float) -> float:
    """SE of eFG% in pp, treating each attempt as roughly binomial on points-per-shot/2."""
    p = efg(fgm, fga, fg3m)
    return math.sqrt(max(p * (1 - p), 0.01) / fga) * 100


def norm_p(z: float) -> float:
    return math.erfc(abs(z) / math.sqrt(2))


def weighted(vals: list[tuple[float, float]]) -> tuple[float, float]:
    """Inverse-variance weighted mean of (estimate, se). Returns (mean, se)."""
    vals = [(v, s) for v, s in vals if s and s > 0 and s == s]
    if not vals:
        return float("nan"), float("nan")
    wsum = sum(1 / s**2 for _, s in vals)
    m = sum(v / s**2 for v, s in vals) / wsum
    return m, math.sqrt(1 / wsum)


def parse_min(s: str) -> float:
    """'35:56' -> 35.93. Blank/garbage -> 0."""
    s = (s or "").strip()
    if not s:
        return 0.0
    if ":" in s:
        mm, _, ss = s.partition(":")
        try:
            return int(mm) + int(float(ss)) / 60
        except ValueError:
            return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_birth(s: str) -> date | None:
    """'MAY 08, 2000' -> date(2000,5,8)."""
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.title() if "," in s else s, fmt).date()
        except ValueError:
            continue
    return None


# ── loading ──────────────────────────────────────────────────────────────────

def load_player_games() -> list[dict]:
    rows = []
    for path in sorted(CACHE.glob("player_boxscores_*.csv")):
        with path.open(newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                gid = r["game_id"]
                if not gid.startswith(REGULAR_PREFIX):
                    continue
                try:
                    fga = int(r["field_goals_attempted"] or 0)
                except ValueError:
                    continue
                if fga <= 0:                       # did not shoot: no eFG% to speak of
                    continue
                rows.append({
                    "gid": gid,
                    "pid": r["person_id"],
                    "name": f"{r['first_name']} {r['family_name']}".strip(),
                    "team": r["team_tricode"],
                    "season": r["season"],
                    "min": parse_min(r["minutes"]),
                    "fgm": int(r["field_goals_made"] or 0),
                    "fga": fga,
                    "fg3m": int(r["three_pointers_made"] or 0),
                    "fg3a": int(r["three_pointers_attempted"] or 0),
                    "fta": int(r["free_throws_attempted"] or 0),
                    "ftm": int(r["free_throws_made"] or 0),
                    "pts": int(r["points"] or 0),
                })
    return rows


def load_birthdays() -> dict[str, date]:
    out: dict[str, date] = {}
    for path in sorted(CACHE.glob("rosters_*.csv")):
        with path.open(newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                pid = (r.get("player_id") or "").strip()
                bd = parse_birth(r.get("birth_date", ""))
                if pid and bd and pid not in out:
                    out[pid] = bd
    return out


def load_game_dates(conn) -> dict[str, date]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT external_id, date FROM games
            WHERE game_type='regular' AND status='final' AND external_id LIKE '002%%'
        """)
        return {ext: d for ext, d in cur.fetchall()}


# ── deriving the player's own situation ──────────────────────────────────────

def annotate(rows: list[dict], gdate: dict[str, date], birth: dict[str, date]) -> list[dict]:
    """Attach each row's personal rest, personal 7-day load, and age at tip-off.

    Personal, not team: the player's previous PLAYED game is what his legs know about.
    """
    for r in rows:
        r["date"] = gdate.get(r["gid"])
    rows = [r for r in rows if r["date"] is not None]

    by_player: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_player[r["pid"]].append(r)

    out = []
    for pid, games in by_player.items():
        games.sort(key=lambda r: r["date"])
        days = [g["date"].toordinal() for g in games]
        bd = birth.get(pid)
        for i, g in enumerate(games):
            g["rest"] = None if i == 0 else days[i] - days[i - 1]
            # games the player himself played in the 7 days before this one
            lo = bisect_left(days, days[i] - 7, 0, i)
            g["load7"] = i - lo
            g["min7"] = sum(games[j]["min"] for j in range(lo, i))
            if bd:
                a = g["date"].year - bd.year - ((g["date"].month, g["date"].day) < (bd.month, bd.day))
                g["age"] = a
            else:
                g["age"] = None
            out.append(g)
    return out


# ── contrasts ────────────────────────────────────────────────────────────────

def paired(rows, treated, control, min_fga: int, key=lambda r: (r["pid"], r["season"])):
    """Within-unit eFG% delta in pp, one entry per unit clearing min_fga in both arms."""
    agg: dict = defaultdict(lambda: {"t": [0, 0, 0], "c": [0, 0, 0]})
    for r in rows:
        arm = "t" if treated(r) else ("c" if control(r) else None)
        if arm is None:
            continue
        a = agg[key(r)][arm]
        a[0] += r["fgm"]; a[1] += r["fga"]; a[2] += r["fg3m"]

    out = []
    for k, arms in agg.items():
        t, c = arms["t"], arms["c"]
        if t[1] < min_fga or c[1] < min_fga:
            continue
        d = (efg(*t) - efg(*c)) * 100
        se = math.sqrt(efg_se(*t) ** 2 + efg_se(*c) ** 2)
        out.append((k, d, se, t[1], c[1]))
    return out


def summarize(pairs) -> dict:
    if not pairs:
        return {"n": 0}
    m, se = weighted([(d, s) for _, d, s, _, _ in pairs])
    return {
        "n": len(pairs), "delta": m, "se": se,
        "lo": m - 1.96 * se, "hi": m + 1.96 * se,
        "p": norm_p(m / se) if se and se == se and se > 0 else float("nan"),
        "fga_t": sum(a for _, _, _, a, _ in pairs),
    }


def shrink(pairs, grand: float) -> list[tuple]:
    """Empirical-Bayes shrinkage toward the league mean.

    Without this a leaderboard is a list of small samples: a player with 250 attempts
    per arm carries an SE near 4pp, so the extremes of a raw ranking are noise, not
    talent. Shrinking by tau^2/(tau^2+se^2) pulls unreliable estimates back toward the
    league and leaves well-measured ones almost untouched.
    """
    ds = [d for _, d, _, _, _ in pairs]
    ses = [s for _, _, s, _, _ in pairs]
    if len(ds) < 3:
        return [(k, d, s, d, a, b) for k, d, s, a, b in pairs]
    var_obs = sum((d - grand) ** 2 for d in ds) / (len(ds) - 1)
    mean_var = sum(s * s for s in ses) / len(ses)
    tau2 = max(var_obs - mean_var, 0.0)
    out = []
    for (k, d, s, a, b) in pairs:
        w = tau2 / (tau2 + s * s) if (tau2 + s * s) > 0 else 0.0
        out.append((k, d, s, grand + w * (d - grand), a, b))
    return out


# ── per-player export ────────────────────────────────────────────────────────

EXPORT_MIN_FGA = 150   # per arm, per player, career — low enough to include role players


def _arm(rows) -> tuple[int, int, int]:
    fgm = sum(r["fgm"] for r in rows)
    fga = sum(r["fga"] for r in rows)
    fg3m = sum(r["fg3m"] for r in rows)
    return fgm, fga, fg3m


def export_players(rows, name_of, birth, gdate, grand_rest: float, root: Path) -> None:
    """Write one JSON row per player for the browsable database."""
    by_pid: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_pid[r["pid"]].append(r)

    b2b = lambda r: r["rest"] == 1
    rested = lambda r: r["rest"] is not None and r["rest"] >= 3
    busy = lambda r: r["load7"] >= 3
    cold = lambda r: r["load7"] <= 1

    raw: list[dict] = []
    for pid, gs in by_pid.items():
        t, c = [g for g in gs if b2b(g)], [g for g in gs if rested(g)]
        bz, cd = [g for g in gs if busy(g)], [g for g in gs if cold(g)]
        tf, cf = _arm(t), _arm(c)
        bf, df = _arm(bz), _arm(cd)
        if tf[1] < EXPORT_MIN_FGA or cf[1] < EXPORT_MIN_FGA:
            continue

        seasons = sorted({g["season"] for g in gs})
        ages = [g["age"] for g in gs if g["age"] is not None]
        all_f = _arm(gs)

        rest_d = (efg(*tf) - efg(*cf)) * 100
        rest_se = math.sqrt(efg_se(*tf) ** 2 + efg_se(*cf) ** 2)

        has_rhythm = bf[1] >= EXPORT_MIN_FGA and df[1] >= EXPORT_MIN_FGA
        rhy_d = (efg(*bf) - efg(*df)) * 100 if has_rhythm else None
        rhy_se = (math.sqrt(efg_se(*bf) ** 2 + efg_se(*df) ** 2)) if has_rhythm else None

        raw.append({
            "id": pid,
            "name": name_of.get(pid, pid),
            "from": seasons[0], "to": seasons[-1],
            "g": len(gs),
            "fga": all_f[1],
            "efg": round(efg(*all_f) * 100, 2),
            "ageLo": min(ages) if ages else None,
            "ageHi": max(ages) if ages else None,
            "b2bFga": tf[1], "b2bEfg": round(efg(*tf) * 100, 2),
            "restFga": cf[1], "restEfg": round(efg(*cf) * 100, 2),
            "restD": round(rest_d, 2), "restSe": round(rest_se, 2),
            "busyFga": bf[1] or 0, "busyEfg": round(efg(*bf) * 100, 2) if bf[1] else None,
            "coldFga": df[1] or 0, "coldEfg": round(efg(*df) * 100, 2) if df[1] else None,
            "rhyD": round(rhy_d, 2) if rhy_d is not None else None,
            "rhySe": round(rhy_se, 2) if rhy_se is not None else None,
        })

    # Empirical-Bayes shrinkage, computed once over the exported pool.
    for field, dkey, skey, out in (("rest", "restD", "restSe", "restShrunk"),
                                   ("rhythm", "rhyD", "rhySe", "rhyShrunk")):
        vals = [(p[dkey], p[skey]) for p in raw if p.get(dkey) is not None]
        if len(vals) < 3:
            continue
        mean = sum(d for d, _ in vals) / len(vals)
        var_obs = sum((d - mean) ** 2 for d, _ in vals) / (len(vals) - 1)
        mean_var = sum(s * s for _, s in vals) / len(vals)
        tau2 = max(var_obs - mean_var, 0.0)
        for p in raw:
            if p.get(dkey) is None:
                p[out] = None
                continue
            s = p[skey]
            w = tau2 / (tau2 + s * s) if (tau2 + s * s) > 0 else 0.0
            p[out] = round(mean + w * (p[dkey] - mean), 2)

    raw.sort(key=lambda p: -p["fga"])
    dest = root / "ml" / "data" / "shooting" / "player_shooting.json"
    dest.write_text(json.dumps(raw, separators=(",", ":")), encoding="utf-8")
    print(f"exported {len(raw):,} players -> {dest.relative_to(root)} "
          f"({dest.stat().st_size / 1024:.0f} KB)")


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--min-fga", type=int, default=DEFAULT_MIN_FGA)
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    print("loading player box scores...")
    rows = load_player_games()
    print(f"  {len(rows):,} player-games with at least one attempt")

    print("loading birthdays...")
    birth = load_birthdays()
    print(f"  {len(birth):,} players with a birth date")

    conn = psycopg2.connect(dsn)
    conn.set_session(readonly=True, autocommit=True)
    try:
        gdate = load_game_dates(conn)
    finally:
        conn.close()
    print(f"  {len(gdate):,} game dates from the database")

    rows = annotate(rows, gdate, birth)
    print(f"  {len(rows):,} annotated with personal rest, 7-day load and age")

    lines: list[str] = []

    def emit(s=""):
        print(s)
        lines.append(s)

    b2b = lambda r: r["rest"] == 1
    rested = lambda r: r["rest"] is not None and r["rest"] >= 3
    busy = lambda r: r["load7"] >= 3
    cold = lambda r: r["load7"] <= 1

    emit("# Shooting by Rest — player level")
    emit()
    emit(f"Generated {date.today().isoformat()} by `scripts/analyze_player_shooting.py`. "
         f"Read-only; no database writes.")
    emit()
    emit(f"- **{len(rows):,}** player-games, 1996-97 → 2025-26, regular season, "
         f"at least one field-goal attempt")
    emit(f"- Rest and load are the **player's own**, counted from the games he actually played")
    emit(f"- Every contrast is within a player-season, then pooled inverse-variance")
    emit(f"- A player-season needs ≥{args.min_fga} attempts in **both** arms to contribute")
    emit()

    # ---- 1. fatigue ---------------------------------------------------------
    fat = summarize(paired(rows, b2b, rested, args.min_fga))
    emit("## 1. Fatigue — his own back-to-back vs 3+ days off")
    emit()
    if fat["n"]:
        emit(f"**{fat['delta']:+.3f} pp** [{fat['lo']:+.3f}, {fat['hi']:+.3f}] "
             f"across {fat['n']:,} player-seasons ({fat['fga_t']:,} attempts on zero rest)")
    emit()

    # ---- 2. rhythm ----------------------------------------------------------
    rhy = summarize(paired(rows, busy, cold, args.min_fga))
    emit("## 2. Rhythm — 3+ games in the last week vs 1 or fewer")
    emit()
    if rhy["n"]:
        emit(f"**{rhy['delta']:+.3f} pp** [{rhy['lo']:+.3f}, {rhy['hi']:+.3f}] "
             f"across {rhy['n']:,} player-seasons")
    emit()

    # ---- 3. the 2x2 ---------------------------------------------------------
    emit("## 3. Rhythm and fatigue are not the same axis")
    emit()
    emit("Held against the same baseline — rested **and** in rhythm.")
    emit()
    emit("| situation | Δ eFG% | 95% CI | player-seasons |")
    emit("|---|---|---|---|")
    base = lambda r: rested(r) and busy(r)
    cells = [
        ("tired, in rhythm", lambda r: b2b(r) and busy(r)),
        ("rested, cold", lambda r: rested(r) and cold(r)),
        ("tired and cold", lambda r: b2b(r) and cold(r)),
    ]
    for label, pred in cells:
        s = summarize(paired(rows, pred, base, args.min_fga))
        if s["n"]:
            emit(f"| {label} | {s['delta']:+.3f} pp | [{s['lo']:+.3f}, {s['hi']:+.3f}] | {s['n']:,} |")
        else:
            emit(f"| {label} | — | — | 0 |")
    emit()

    # ---- 4. age -------------------------------------------------------------
    emit("## 4. Does age change the back-to-back penalty?")
    emit()
    emit("| age at tip-off | Δ eFG% on zero rest | 95% CI | player-seasons |")
    emit("|---|---|---|---|")
    for lo_a, hi_a, label in AGE_BUCKETS:
        in_band = lambda r, a=lo_a, b=hi_a: r["age"] is not None and a <= r["age"] < b
        s = summarize(paired(rows,
                             lambda r: b2b(r) and in_band(r),
                             lambda r: rested(r) and in_band(r),
                             args.min_fga))
        if s["n"]:
            emit(f"| {label} | {s['delta']:+.3f} pp | [{s['lo']:+.3f}, {s['hi']:+.3f}] | {s['n']:,} |")
        else:
            emit(f"| {label} | — | — | 0 |")
    emit()

    emit("### Rhythm by age")
    emit()
    emit("| age at tip-off | Δ eFG% when busy | 95% CI | player-seasons |")
    emit("|---|---|---|---|")
    for lo_a, hi_a, label in AGE_BUCKETS:
        in_band = lambda r, a=lo_a, b=hi_a: r["age"] is not None and a <= r["age"] < b
        s = summarize(paired(rows,
                             lambda r: busy(r) and in_band(r),
                             lambda r: cold(r) and in_band(r),
                             args.min_fga))
        if s["n"]:
            emit(f"| {label} | {s['delta']:+.3f} pp | [{s['lo']:+.3f}, {s['hi']:+.3f}] | {s['n']:,} |")
        else:
            emit(f"| {label} | — | — | 0 |")
    emit()

    # ---- 5. named players ---------------------------------------------------
    name_of = {}
    for r in rows:
        name_of.setdefault(r["pid"], r["name"])

    career = paired(rows, b2b, rested, LEADERBOARD_MIN_FGA, key=lambda r: r["pid"])
    grand = fat["delta"] if fat.get("n") else 0.0
    shrunk = shrink(career, grand)
    shrunk.sort(key=lambda t: t[3])

    emit("## 5. Who actually changes on zero rest")
    emit()
    emit(f"Career pooled, ≥{LEADERBOARD_MIN_FGA} attempts in **each** arm, "
         f"empirical-Bayes shrunk toward the league mean of {grand:+.2f} pp.")
    emit()
    emit("Read the shrunk column, not the raw one. A player at the sample floor carries an "
         "SE near 4 pp, so the extremes of a raw ranking are mostly noise — shrinkage is "
         "what stops this being a list of small samples.")
    emit()
    emit(f"**{len(shrunk)} players clear the bar.**")
    emit()
    for title, sl in (("Hurt most by zero rest", shrunk[:12]),
                      ("Least hurt, or helped", shrunk[-12:][::-1])):
        emit(f"### {title}")
        emit()
        emit("| player | shrunk Δ | raw Δ | ± | attempts (0 rest / rested) |")
        emit("|---|---|---|---|---|")
        for pid, raw, se, sh, a, b in sl:
            emit(f"| {name_of.get(pid, pid)} | **{sh:+.2f} pp** | {raw:+.2f} | "
                 f"{se:.2f} | {a:,} / {b:,} |")
        emit()

    # ---- 6. per-player export ----------------------------------------------
    # Powers the browsable player database. Deliberately a LOOKUP, not a ranking:
    # once nothing is being claimed league-wide, the multiple-comparisons problem
    # that makes a leaderboard dishonest simply does not arise.
    export_players(rows, name_of, birth, gdate, grand, ROOT)

    emit("## What this does and does not remove")
    emit()
    emit("Comparing a player to himself removes roster quality, load management and trades: "
         "if he did not play, he contributes nothing to either arm. It does **not** remove "
         "opponent strength, venue, or the possibility that a coach shortens a tired star's "
         "minutes in ways that change his shot mix.")
    emit()

    REPORT.mkdir(parents=True, exist_ok=True)
    out = REPORT / f"player-shooting-{date.today().isoformat()}.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nreport written: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
