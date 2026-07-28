"""[Shooting by Rest, Phase 1] Does a tired team shoot worse?

READ-ONLY against the database. Writes one markdown report to ``docs/audit/``.
Nothing is inserted, updated or migrated — see the spec §2.

Reads the local hoopR cache written by ``scripts/fetch_team_shooting.py``, joins it to
``games`` + ``fatigue_scores``, and estimates the **within-team-season** change in eFG%
across rest situations.

The five confirmatory contrasts and the Holm-Bonferroni correction were fixed in
``docs/superpowers/specs/2026-07-28-shooting-by-rest-design.md`` §3.3 BEFORE this script
was run. Everything else it prints is exploratory and is labelled as such.

Why within-team-season: league eFG% rose from the high .480s to the mid .530s across
this window, and better teams earn more rest through seeding. Comparing a team to itself
inside one season removes era and team quality by construction rather than by adjustment.

Usage:
    python scripts/analyze_shooting_by_rest.py
    python scripts/analyze_shooting_by_rest.py --verify   # + ESPN cross-check
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

import psycopg2
import psycopg2.extras

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "ml" / "data" / "shooting"
REPORT = ROOT / "docs" / "audit"
REGULAR_PREFIX = "002"

# Pre-registered. Do not add to this list after seeing results — that is the whole point.
CONFIRMATORY = [
    ("0 vs 2 days rest, overall", "overall"),
    ("0 vs 2 days rest, home only", "home"),
    ("0 vs 2 days rest, road only", "road"),
    ("3-in-4 vs not", "three_in_four"),
    ("4-in-6 vs not", "four_in_six"),
]

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={d}"
ESPN_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={e}"


# ── stats helpers ────────────────────────────────────────────────────────────

def mean_sd(xs: list[float]) -> tuple[float, float]:
    n = len(xs)
    if n == 0:
        return float("nan"), float("nan")
    m = sum(xs) / n
    if n == 1:
        return m, 0.0
    var = sum((x - m) ** 2 for x in xs) / (n - 1)
    return m, math.sqrt(var)


def norm_sf(z: float) -> float:
    """Two-sided p-value from a z score. erfc is in the stdlib; no scipy needed."""
    return math.erfc(abs(z) / math.sqrt(2))


def holm_bonferroni(pvals: list[float]) -> list[float]:
    """Holm step-down adjusted p-values, order preserved.

    Chosen over plain Bonferroni because it is uniformly more powerful at the same
    family-wise error rate, and over FDR because five pre-registered claims is a small
    family where controlling FWER is the honest standard.
    """
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    out = [0.0] * m
    running = 0.0
    for rank, idx in enumerate(order):
        adj = min(1.0, (m - rank) * pvals[idx])
        running = max(running, adj)  # enforce monotonicity
        out[idx] = running
    return out


def paired_delta(pairs: list[tuple[float, float, int, int]]) -> dict:
    """Aggregate per-team-season (treated eFG%, control eFG%) pairs into one estimate.

    Weighted by the harmonic-style min(n_treated, n_control) so a team-season with three
    back-to-backs does not carry the same weight as one with twenty. Unweighted mean is
    reported alongside so the choice is visible rather than buried.
    """
    if not pairs:
        return {"n_units": 0}
    deltas = [(t - c) * 100 for t, c, _, _ in pairs]          # percentage points
    weights = [min(nt, nc) for _, _, nt, nc in pairs]
    wsum = sum(weights)

    wmean = sum(d * w for d, w in zip(deltas, weights)) / wsum
    # Weighted SE via the weighted variance of the deltas.
    wvar = sum(w * (d - wmean) ** 2 for d, w in zip(deltas, weights)) / wsum
    eff_n = wsum ** 2 / sum(w * w for w in weights)           # Kish effective sample size
    se = math.sqrt(wvar / eff_n) if eff_n > 1 else float("nan")

    umean, usd = mean_sd(deltas)
    z = wmean / se if se and not math.isnan(se) and se > 0 else float("nan")
    p = norm_sf(z) if not math.isnan(z) else float("nan")

    return {
        "n_units": len(pairs),
        "n_treated_games": sum(nt for _, _, nt, _ in pairs),
        "n_control_games": sum(nc for _, _, _, nc in pairs),
        "delta_pp": wmean,
        "se_pp": se,
        "ci_lo": wmean - 1.96 * se if se == se else float("nan"),
        "ci_hi": wmean + 1.96 * se if se == se else float("nan"),
        "unweighted_pp": umean,
        "p": p,
        "eff_n": eff_n,
    }


# ── data loading ─────────────────────────────────────────────────────────────

def load_cache() -> dict[tuple[str, str], dict]:
    """{(game_id, 'home'|'away'): shooting row}. Regular season only."""
    out: dict[tuple[str, str], dict] = {}
    for path in sorted(CACHE.glob("team_boxscores_*.csv")):
        with path.open(newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                gid = r["game_id"]
                if not gid.startswith(REGULAR_PREFIX):
                    continue
                try:
                    fga = int(r["field_goals_attempted"])
                    if fga <= 0:
                        continue
                    out[(gid, r["side"])] = {
                        "fgm": int(r["field_goals_made"]),
                        "fga": fga,
                        "tpm": int(r["three_pointers_made"]),
                        "fta": int(r["free_throws_attempted"]),
                        "pts": int(r["points"]),
                        "tricode": r["team_tricode"],
                    }
                except (ValueError, KeyError):
                    continue
    return out


def load_games(conn) -> list[dict]:
    """One row per team-game: rest situation + venue + margin, from our own tables."""
    sql = """
    SELECT g.external_id, g.season, g.home_score, g.away_score,
           g.home_team_id, g.away_team_id,
           f.team_id, f.days_since_last_game, f.is_back_to_back,
           f.is_three_in_four, f.is_four_in_six, f.score AS fatigue,
           f.is_overtime_penalty
    FROM games g
    JOIN fatigue_scores f ON f.game_id = g.id
    WHERE g.game_type = 'regular'
      AND g.status = 'final'
      AND g.season >= '1996-97'
      AND g.external_id LIKE '002%%'
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    out = []
    for r in rows:
        side = "home" if r["team_id"] == r["home_team_id"] else "away"
        hs, as_ = r["home_score"], r["away_score"]
        margin = None
        if hs is not None and as_ is not None:
            margin = abs(hs - as_)
        out.append({
            "external_id": r["external_id"],
            "season": r["season"],
            "side": side,
            "days": r["days_since_last_game"],
            "b2b": r["is_back_to_back"],
            "three_in_four": r["is_three_in_four"],
            "four_in_six": r["is_four_in_six"],
            "fatigue": float(r["fatigue"]) if r["fatigue"] is not None else None,
            "ot_prior": r["is_overtime_penalty"],
            "team_id": r["team_id"],
            "margin": margin,
        })
    return out


# ── the contrasts ────────────────────────────────────────────────────────────

def build_pairs(joined, treated, control, unit_key, restrict=None):
    """Group team-games into (team, season) units and pair treated vs control eFG%.

    A unit contributes only if it has at least one game on BOTH sides, which is what
    makes this a within-team-season comparison rather than a pooled one.
    """
    buckets = defaultdict(lambda: {"t": [0, 0, 0], "c": [0, 0, 0]})  # [fgm, fga, tpm]
    for row in joined:
        if restrict and not restrict(row):
            continue
        arm = "t" if treated(row) else ("c" if control(row) else None)
        if arm is None:
            continue
        b = buckets[unit_key(row)][arm]
        b[0] += row["fgm"]
        b[1] += row["fga"]
        b[2] += row["tpm"]

    pairs = []
    counts = defaultdict(lambda: [0, 0])
    for row in joined:
        if restrict and not restrict(row):
            continue
        if treated(row):
            counts[unit_key(row)][0] += 1
        elif control(row):
            counts[unit_key(row)][1] += 1

    for key, arms in buckets.items():
        t, c = arms["t"], arms["c"]
        if t[1] == 0 or c[1] == 0:
            continue
        t_efg = (t[0] + 0.5 * t[2]) / t[1]
        c_efg = (c[0] + 0.5 * c[2]) / c[1]
        nt, nc = counts[key]
        pairs.append((t_efg, c_efg, nt, nc))
    return pairs


def fmt(res: dict) -> str:
    if not res.get("n_units"):
        return "no units"
    return (f"{res['delta_pp']:+.3f} pp  [95% CI {res['ci_lo']:+.3f}, {res['ci_hi']:+.3f}]  "
            f"n={res['n_units']} team-seasons  "
            f"({res['n_treated_games']} vs {res['n_control_games']} games)")


# ── ESPN cross-check ─────────────────────────────────────────────────────────

def espn_cross_check(conn, cache, sample: int) -> tuple[int, int]:
    """Assert hoopR agrees with an INDEPENDENT upstream on a sample. (checked, mismatches)

    hoopR/pbpstats/shufinskiy all mirror stats.nba.com, so they cannot corroborate each
    other. ESPN is one of only two genuinely independent observers available.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT g.external_id, g.date, th.abbreviation, ta.abbreviation
            FROM games g
            JOIN teams th ON th.id = g.home_team_id
            JOIN teams ta ON ta.id = g.away_team_id
            WHERE g.game_type='regular' AND g.status='final'
              AND g.season = '2024-25' AND g.external_id LIKE '002%%'
            ORDER BY g.date
        """)
        games = cur.fetchall()

    step = max(1, len(games) // sample)
    picked = games[::step][:sample]
    checked = mismatches = 0

    for ext, gdate, home_abbr, away_abbr in picked:
        ours = cache.get((ext, "home"))
        if ours is None:
            continue
        ymd = gdate.strftime("%Y%m%d")
        try:
            board = json.loads(_fetch(ESPN_SCOREBOARD.format(d=ymd)))
        except Exception:
            continue
        event_id = None
        for ev in board.get("events", []):
            comp = (ev.get("competitions") or [{}])[0]
            abbrs = {(c.get("team") or {}).get("abbreviation") for c in comp.get("competitors", [])}
            if home_abbr in abbrs and away_abbr in abbrs:
                event_id = ev["id"]
                break
        if event_id is None:
            continue
        try:
            summary = json.loads(_fetch(ESPN_SUMMARY.format(e=event_id)))
        except Exception:
            continue
        espn = {}
        for team in (summary.get("boxscore") or {}).get("teams", []):
            abbr = (team.get("team") or {}).get("abbreviation")
            for st in team.get("statistics", []):
                if st.get("name") == "fieldGoalsMade-fieldGoalsAttempted":
                    made, _, att = str(st.get("displayValue", "")).partition("-")
                    if made.isdigit() and att.isdigit():
                        espn[abbr] = (int(made), int(att))
        if home_abbr not in espn:
            continue
        checked += 1
        want = (ours["fgm"], ours["fga"])
        got = espn[home_abbr]
        if want != got:
            mismatches += 1
            print(f"    MISMATCH {ext} {home_abbr}: hoopR {want} vs ESPN {got}")
        time.sleep(0.4)

    return checked, mismatches


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify", action="store_true", help="cross-check a sample against ESPN")
    ap.add_argument("--sample", type=int, default=10)
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set", file=sys.stderr)
        return 1

    print("loading local hoopR cache...")
    cache = load_cache()
    print(f"  {len(cache)} team-game shooting rows")

    conn = psycopg2.connect(dsn)
    conn.set_session(readonly=True, autocommit=True)
    try:
        print("loading games + fatigue (read-only)...")
        games = load_games(conn)
        print(f"  {len(games)} team-games with rest data")

        joined, unmatched = [], 0
        for g in games:
            s = cache.get((g["external_id"], g["side"]))
            if s is None:
                unmatched += 1
                continue
            row = dict(g)
            row.update(s)
            joined.append(row)
        rate = len(joined) / len(games) * 100 if games else 0
        print(f"  joined {len(joined)} ({rate:.2f}%), {unmatched} unmatched")

        if args.verify:
            print("cross-checking against ESPN (independent upstream)...")
            checked, mism = espn_cross_check(conn, cache, args.sample)
            print(f"  {checked} games checked, {mism} mismatches")
            if mism:
                print("  ESPN disagrees — do not trust these numbers", file=sys.stderr)
                return 1
    finally:
        conn.close()

    unit = lambda r: (r["team_id"], r["season"])
    lines: list[str] = []

    def emit(s=""):
        print(s)
        lines.append(s)

    emit(f"# Shooting by Rest — Phase 1 internal report")
    emit()
    emit(f"Generated {date.today().isoformat()} by `scripts/analyze_shooting_by_rest.py`. "
         f"Read-only; no database writes.")
    emit()
    emit(f"- **{len(joined):,}** team-games joined ({rate:.2f}% of those with rest data), "
         f"1996-97 → 2025-26")
    emit(f"- Outcome: **eFG%**, within-team-season delta, in percentage points")
    emit(f"- Contrasts 1–5 were pre-registered in the design spec before this ran")
    emit()

    # ---- confirmatory family -------------------------------------------------
    b2b = lambda r: r["days"] == 1
    rest2 = lambda r: r["days"] == 3          # days_since_last_game=3 -> 2 days off
    results = []

    results.append(paired_delta(build_pairs(joined, b2b, rest2, unit)))
    results.append(paired_delta(build_pairs(joined, b2b, rest2, unit,
                                            restrict=lambda r: r["side"] == "home")))
    results.append(paired_delta(build_pairs(joined, b2b, rest2, unit,
                                            restrict=lambda r: r["side"] == "away")))
    results.append(paired_delta(build_pairs(
        joined, lambda r: r["three_in_four"], lambda r: not r["three_in_four"], unit)))
    results.append(paired_delta(build_pairs(
        joined, lambda r: r["four_in_six"], lambda r: not r["four_in_six"], unit)))

    raw_p = [r.get("p", float("nan")) for r in results]
    adj_p = holm_bonferroni([p if p == p else 1.0 for p in raw_p])

    emit("## Confirmatory (pre-registered, Holm–Bonferroni across 5)")
    emit()
    emit("| # | Contrast | Δ eFG% | 95% CI | team-seasons | p (raw) | p (adj) | holds |")
    emit("|---|---|---|---|---|---|---|---|")
    for i, ((label, _), res) in enumerate(zip(CONFIRMATORY, results)):
        if not res.get("n_units"):
            emit(f"| {i+1} | {label} | — | — | 0 | — | — | — |")
            continue
        holds = "yes" if adj_p[i] < 0.05 else "no"
        emit(f"| {i+1} | {label} | **{res['delta_pp']:+.3f} pp** | "
             f"[{res['ci_lo']:+.3f}, {res['ci_hi']:+.3f}] | {res['n_units']:,} | "
             f"{raw_p[i]:.2e} | {adj_p[i]:.2e} | {holds} |")
    emit()

    # ---- decomposition -------------------------------------------------------
    def venue_split(restrict=None):
        """0-vs-2 delta estimated separately within each venue, then pooled.

        Holding venue fixed matters because back-to-back second legs are
        disproportionately road games, and road eFG% is lower for reasons that have
        nothing to do with legs. Estimating inside each venue and pooling means a home
        back-to-back is never compared against a road rested game.
        """
        parts = []
        for side in ("home", "away"):
            def keep(x, s=side):
                if x["side"] != s:
                    return False
                return restrict(x) if restrict else True
            r = paired_delta(build_pairs(joined, b2b, rest2, unit, restrict=keep))
            if r.get("n_units") and r["se_pp"] == r["se_pp"]:
                parts.append(r)
        if not parts:
            return None
        wsum = sum(p["eff_n"] for p in parts)
        delta = sum(p["delta_pp"] * p["eff_n"] for p in parts) / wsum
        se = math.sqrt(sum((p["se_pp"] * p["eff_n"]) ** 2 for p in parts)) / wsum
        return {
            "delta_pp": delta, "se_pp": se,
            "ci_lo": delta - 1.96 * se, "ci_hi": delta + 1.96 * se,
            "n_units": sum(p["n_units"] for p in parts),
            "n_treated_games": sum(p["n_treated_games"] for p in parts),
        }

    emit("## Decomposition of the 0-vs-2 gap")
    emit()
    emit("Controls are **cumulative** — each row keeps everything above it and adds one more. "
         "The last row is the honest number.")
    emit()
    emit("| step | Δ eFG% | 95% CI | units | B2B games |")
    emit("|---|---|---|---|---|")

    # naive pooled (no within-team-season pairing at all)
    def pooled(pred_t, pred_c, restrict=None):
        t = [0, 0, 0]
        c = [0, 0, 0]
        for r in joined:
            if restrict and not restrict(r):
                continue
            tgt = t if pred_t(r) else (c if pred_c(r) else None)
            if tgt is None:
                continue
            tgt[0] += r["fgm"]; tgt[1] += r["fga"]; tgt[2] += r["tpm"]
        if not t[1] or not c[1]:
            return float("nan")
        return ((t[0] + .5 * t[2]) / t[1] - (c[0] + .5 * c[2]) / c[1]) * 100

    emit(f"| pooled, no controls | {pooled(b2b, rest2):+.3f} pp | — | — | — |")
    emit(f"| + within team-season | {results[0]['delta_pp']:+.3f} pp | "
         f"[{results[0]['ci_lo']:+.3f}, {results[0]['ci_hi']:+.3f}] | "
         f"{results[0]['n_units']:,} | {results[0]['n_treated_games']:,} |")

    # Opponent rest, looked up from the other side of the same game.
    opp_rest = {}
    for r in joined:
        opp_rest.setdefault(r["external_id"], {})[r["side"]] = r["days"]

    def opp_on_one_day(r):
        """Opponent had exactly one day off — the modal case, held equal in both arms."""
        other = "away" if r["side"] == "home" else "home"
        return opp_rest.get(r["external_id"], {}).get(other) == 2

    close = lambda r: r["margin"] is not None and r["margin"] < 20

    steps = [
        ("+ venue held fixed", None),
        ("+ opponent on 1 day's rest in both arms", opp_on_one_day),
        ("+ non-blowouts only (final margin <20)",
         lambda r: opp_on_one_day(r) and close(r)),
    ]
    final = None
    for label, restrict in steps:
        v = venue_split(restrict)
        if v is None:
            emit(f"| {label} | — | — | — | — |")
            continue
        final = v
        emit(f"| {label} | {v['delta_pp']:+.3f} pp | "
             f"[{v['ci_lo']:+.3f}, {v['ci_hi']:+.3f}] | {v['n_units']:,} | "
             f"{v['n_treated_games']:,} |")
    emit()
    if final:
        emit(f"**Fully adjusted: {final['delta_pp']:+.3f} pp** "
             f"[{final['ci_lo']:+.3f}, {final['ci_hi']:+.3f}]. "
             f"Units are team-season × venue, so a team-season can appear twice.")
        emit()

    # ---- exploratory ---------------------------------------------------------
    emit("## Exploratory (shown, not claimed)")
    emit()
    emit("No significance is asserted for anything below.")
    emit()
    emit("### eFG% by days of rest (pooled level, for orientation only)")
    emit()
    emit("| days rest | team-games | eFG% |")
    emit("|---|---|---|")
    for d, lab in [(1, "0 (back-to-back)"), (2, "1"), (3, "2"), (None, "3+")]:
        pred = (lambda dd: (lambda r: r["days"] == dd)) (d) if d else (
            lambda r: r["days"] is not None and r["days"] >= 4)
        t = [0, 0, 0]; n = 0
        for r in joined:
            if pred(r):
                t[0] += r["fgm"]; t[1] += r["fga"]; t[2] += r["tpm"]; n += 1
        if t[1]:
            emit(f"| {lab} | {n:,} | {((t[0] + .5*t[2]) / t[1]) * 100:.2f}% |")
    emit()

    emit("### Fatigue-score buckets — the second axis")
    emit()
    emit("| fatigue score | team-games | eFG% |")
    emit("|---|---|---|")
    edges = [(0, 2), (2, 4), (4, 6), (6, 8), (8, 999)]
    for lo, hi in edges:
        t = [0, 0, 0]; n = 0
        for r in joined:
            f = r["fatigue"]
            if f is not None and lo <= f < hi:
                t[0] += r["fgm"]; t[1] += r["fga"]; t[2] += r["tpm"]; n += 1
        if t[1]:
            label = f"{lo}–{hi}" if hi != 999 else f"{lo}+"
            emit(f"| {label} | {n:,} | {((t[0] + .5*t[2]) / t[1]) * 100:.2f}% |")
    emit()

    # ---- verdict -------------------------------------------------------------
    emit("## Verdict against the pre-committed thresholds")
    emit()
    # The spec's thresholds are written against the ADJUSTED effect, not the raw
    # headline — judging on the unadjusted number would grade the work on its
    # confounds. Fall back to contrast 1 only if the adjusted estimate is unavailable.
    headline = final if final else results[0]
    if headline and headline.get("delta_pp") is not None:
        mag = abs(headline["delta_pp"])
        crosses = headline["ci_lo"] <= 0 <= headline["ci_hi"]
        emit(f"Raw within-team-season (contrast 1): **{results[0]['delta_pp']:+.3f} pp** "
             f"[{results[0]['ci_lo']:+.3f}, {results[0]['ci_hi']:+.3f}]")
        emit()
        emit(f"Fully adjusted (venue + opponent rest + non-blowouts): "
             f"**{headline['delta_pp']:+.3f} pp** "
             f"[{headline['ci_lo']:+.3f}, {headline['ci_hi']:+.3f}] — this is the one judged.")
        emit()
        if crosses or mag < 0.3:
            emit("→ **Under the 0.3pp threshold, or the CI crosses zero.** "
                 "The spec's pre-committed null-result headline applies: *rest barely touches "
                 "the shot*. This is a publishable finding, not a failure.")
        elif mag < 0.5:
            emit("→ **Small effect (0.3–0.5pp).** Proceed, but the headline leads with the "
                 "size, not the direction.")
        else:
            emit("→ **Real effect (≥0.5pp).** Proceed to Phase 2 (player-level), which is "
                 "required before any of this can be published — see the limitation below.")
    emit()
    emit("## Limitation that blocks publication")
    emit()
    emit("In 22–24% of back-to-back sets a star plays one leg and not the other. Team box "
         "scores cannot distinguish *the players were tired* from *the best shooter did not "
         "play*. Every number above is subject to that. Phase 2 compares each player to "
         "himself across rest states, which removes it structurally.")
    emit()

    REPORT.mkdir(parents=True, exist_ok=True)
    out = REPORT / f"shooting-by-rest-{date.today().isoformat()}.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nreport written: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
