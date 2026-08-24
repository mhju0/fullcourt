"""Unequal careers: replicate the published foul-style table, then run the
pre-registered window measurements (``ml/referee_career_preregistration.md``).

M0 gates everything: the career-window replication must match
``src/data/referee-foul-style.json`` before any windowed number is trusted. M1
extracts each official's active span (presentation). M2 runs the drift test
that decides the equal window; M3 assesses the per-season split against its
declared power/stability rules.

Reads ``ml/data/officials/officials-games.json`` — the exact intermediate the published
JSON aggregates — and writes ``ml/data/referee/career_window_results.json``. Pure stdlib.

The first M0 run read the flat corpus tables (``ml/data/referee/*.csv``) instead and
FAILED, which is what the gate is for: it surfaced that the published pipeline credited
duplicate ESPN officials entries (fixed in ``scripts/fetch_officials.ts``, 2026-08-24,
and the artifacts regenerated), and that the corpus tables cover 12,398 filtered games
against the pipeline's DB-matched 11,952 — a population gap that would masquerade as
drift. Reading the pipeline's own intermediate removes both; the reconciliation is
recorded in the report.

Usage:
    ml/.venv/bin/python ml/referee_career_windows.py
"""

from __future__ import annotations

import json
import logging
import math
from collections import defaultdict
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("career_windows")

ROOT = Path(__file__).resolve().parent.parent
COLLECTED = ROOT / "ml/data/officials/officials-games.json"
PUBLISHED = ROOT / "src/data/referee-foul-style.json"
OUT = ROOT / "ml/data/referee/career_window_results.json"

# Mirrors FOUL_TYPES in scripts/fetch_officials.ts — the replication gate (M0) is what
# catches these two copies drifting, which is why it runs first and everything else is
# conditional on it.
FOUL_TYPES: dict[str, tuple[str, ...]] = {
    "shooting": ("Shooting Foul",),
    "personal": ("Personal Foul", "Double Personal Foul", "Inbound Foul"),
    "looseBall": ("Loose Ball Foul",),
    "offensive": ("Offensive Foul",),
    "technical": (
        "Technical Foul",
        "Double Technical Foul",
        "Hanging Technical Foul",
        "Taunting Technical Foul",
    ),
}
KEYS = list(FOUL_TYPES)
COLUMNS = ["fouls", *KEYS]  # the six measured columns

MIN_FOULS = 20  # fetch_officials.ts buildFoulStyle
MIN_GAMES = 200  # src/lib/referee-foul-style.ts publication bar
WINDOW = 200  # pre-registered W
SPLIT_MIN_CAREER = 350  # pre-registered: earlier segment holds >= 150
SEASON_MIN_GAMES = 50  # pre-registered M3 cell bar
SEASON_MIN_SEASONS = 3  # pre-registered M3 agreement bar


def mean_and_z(values: list[float]) -> tuple[float, float, float]:
    """Mean, z of the mean against zero, and the standard error — buildFoulStyle's math."""
    n = len(values)
    mean = sum(values) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in values) / n)
    se = sd / math.sqrt(n) if sd > 0 else 0.0
    return mean, (mean / se if se > 0 else 0.0), se


def main() -> None:
    collected = json.loads(COLLECTED.read_text())
    log.info("collected games in the pipeline intermediate: %d", len(collected))

    # buildFoulStyle's filter, verbatim: regulation games with a trustable mix.
    rows = []
    for i, g in enumerate(collected):
        if g["periods"] != 4 or g["totalFouls"] < MIN_FOULS:
            continue
        shares = {k: 100.0 * g["fouls"][k] / g["totalFouls"] for k in KEYS}
        rows.append(
            {
                "date": g["date"],
                "season": g["season"],
                "officials": g["officials"],
                "event": i,  # collection order, the chronological tiebreak within a date
                "total": g["totalFouls"],
                "shares": shares,
            }
        )
    log.info("after regulation + >=%d fouls filter: %d", MIN_FOULS, len(rows))

    by_season: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_season[r["season"]].append(r)
    base = {
        season: {
            "fouls": sum(r["total"] for r in gs) / len(gs),
            **{k: sum(r["shares"][k] for r in gs) / len(gs) for k in KEYS},
        }
        for season, gs in by_season.items()
    }

    # Per-official chronological deviation streams.
    streams: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        b = base[r["season"]]
        dev = {
            "fouls": r["total"] - b["fouls"],
            **{k: r["shares"][k] - b[k] for k in KEYS},
        }
        for name in r["officials"]:
            streams[name].append({"date": r["date"], "event": r["event"], "season": r["season"], **dev})
    for s in streams.values():
        s.sort(key=lambda x: (x["date"], x["event"]))

    # The JSON carries every official; the published set is the >= MIN_GAMES slice the page
    # renders (src/lib/referee-foul-style.ts publishable()), and the pre-registration scopes
    # every measurement to it. Since the equal window shipped (2026-08-24) the row's own
    # columns are the last-200 window and the full-span figures live under `career` — M0
    # replicates the career math, so it reads that block when present.
    published = {
        o["name"]: {**(o.get("career") or o), "games": o["games"], "name": o["name"]}
        for o in json.loads(PUBLISHED.read_text())["officials"]
        if o["games"] >= MIN_GAMES
    }

    # ── M0: the replication gate ─────────────────────────────────────────────
    cells = 0
    ok = 0
    games_mismatch = []
    worst: list[tuple[float, str, str]] = []
    for name, pub in published.items():
        stream = streams.get(name, [])
        if abs(len(stream) - pub["games"]) > 2:
            games_mismatch.append((name, pub["games"], len(stream)))
            continue
        for col in COLUMNS:
            mean, z, _ = mean_and_z([g[col] for g in stream])
            dm = abs(mean - pub[col])
            dz = abs(z - pub[f"{col}Z"])
            cells += 1
            if dm <= 0.02 and dz <= 0.2:
                ok += 1
            else:
                worst.append((max(dm, dz), name, col))
    share_ok = ok / cells if cells else 0.0
    m0_pass = not games_mismatch and share_ok >= 0.95
    log.info(
        "M0: %d/%d cells within tolerance (%.1f%%), %d game-count mismatches -> %s",
        ok, cells, 100 * share_ok, len(games_mismatch), "PASS" if m0_pass else "FAIL",
    )
    results: dict = {
        "m0": {
            "pass": m0_pass,
            "cells": cells,
            "within_tolerance": ok,
            "games_mismatches": games_mismatch[:10],
            "worst_cells": [(round(d, 3), n, c) for d, n, c in sorted(worst, reverse=True)[:10]],
        }
    }
    if not m0_pass:
        OUT.write_text(json.dumps(results, indent=2))
        log.error("M0 failed — stopping before any windowed figure, per the pre-registration.")
        return

    # ── M1: spans (presentation) ─────────────────────────────────────────────
    spans = {
        name: {
            "games": len(streams[name]),
            "firstSeason": streams[name][0]["season"],
            "lastSeason": streams[name][-1]["season"],
        }
        for name in published
    }
    results["m1"] = spans

    # ── M2: the drift test ───────────────────────────────────────────────────
    drift_cells = 0
    drift_beyond = 0
    per_official_drift = []
    for name in published:
        stream = streams[name]
        if len(stream) < SPLIT_MIN_CAREER:
            continue
        recent, earlier = stream[-WINDOW:], stream[:-WINDOW]
        row = {"name": name, "career": len(stream), "cols": {}}
        for col in COLUMNS:
            m_r, _, se_r = mean_and_z([g[col] for g in recent])
            m_e, _, se_e = mean_and_z([g[col] for g in earlier])
            denom = math.sqrt(se_r**2 + se_e**2)
            z_delta = (m_r - m_e) / denom if denom > 0 else 0.0
            drift_cells += 1
            if abs(z_delta) >= 2:
                drift_beyond += 1
            row["cols"][col] = {"recent": round(m_r, 3), "earlier": round(m_e, 3), "zDelta": round(z_delta, 2)}
        per_official_drift.append(row)
    drift_share = drift_beyond / drift_cells if drift_cells else 0.0
    m2_adopt = drift_share >= 0.10
    log.info(
        "M2: %d officials >= %d games; %d/%d cells |zDelta|>=2 (%.1f%%, chance ~4.6%%) -> %s",
        len(per_official_drift), SPLIT_MIN_CAREER, drift_beyond, drift_cells,
        100 * drift_share, "DRIFT REAL, present window" if m2_adopt else "STATUS QUO",
    )

    # Descriptives (no decisions hang on these): bolded cells career vs window, leading trait.
    window_bold = 0
    career_bold = 0
    lead_changes = 0
    for name in published:
        stream = streams[name]
        recent = stream[-WINDOW:]
        cz = {}
        wz = {}
        for col in COLUMNS:
            _, z_c, _ = mean_and_z([g[col] for g in stream])
            _, z_w, _ = mean_and_z([g[col] for g in recent])
            cz[col], wz[col] = z_c, z_w
            if col != "fouls":
                career_bold += abs(z_c) >= 2
                window_bold += abs(z_w) >= 2
        lead = lambda zs: max((c for c in KEYS), key=lambda c: abs(zs[c]))  # noqa: E731
        if lead(cz) != lead(wz):
            lead_changes += 1
    results["m2"] = {
        "officials_tested": len(per_official_drift),
        "cells": drift_cells,
        "beyond": drift_beyond,
        "share": round(drift_share, 4),
        "adopt": m2_adopt,
        "career_bold_cells": career_bold,
        "window_bold_cells": window_bold,
        "leading_trait_changes": lead_changes,
        "per_official": sorted(
            per_official_drift,
            key=lambda r: -max(abs(v["zDelta"]) for v in r["cols"].values()),
        )[:10],
    }

    # ── M3: the per-season split ─────────────────────────────────────────────
    season_cells = 0
    season_beyond = 0
    agreements = []
    for name in published:
        by_s: dict[str, list[dict]] = defaultdict(list)
        for g in streams[name]:
            by_s[g["season"]].append(g)
        qual = {s: gs for s, gs in by_s.items() if len(gs) >= SEASON_MIN_GAMES}
        col_signs: dict[str, list[float]] = defaultdict(list)
        for gs in qual.values():
            for col in COLUMNS:
                mean, z, _ = mean_and_z([g[col] for g in gs])
                season_cells += 1
                if abs(z) >= 2:
                    season_beyond += 1
                col_signs[col].append(mean)
        if len(qual) >= SEASON_MIN_SEASONS:
            for col, means in col_signs.items():
                pos = sum(m > 0 for m in means)
                agreements.append(max(pos, len(means) - pos) / len(means))
    season_share = season_beyond / season_cells if season_cells else 0.0
    mean_agreement = sum(agreements) / len(agreements) if agreements else 0.0
    m3_ship = season_share >= 0.10 and mean_agreement > 0.70
    log.info(
        "M3: %d cells, %d beyond |z|>=2 (%.1f%%); mean sign agreement %.1f%% -> %s",
        season_cells, season_beyond, 100 * season_share, 100 * mean_agreement,
        "SHIPS" if m3_ship else "REFUSED",
    )
    results["m3"] = {
        "cells": season_cells,
        "beyond": season_beyond,
        "share": round(season_share, 4),
        "mean_sign_agreement": round(mean_agreement, 4),
        "ship": m3_ship,
    }

    OUT.write_text(json.dumps(results, indent=2))
    log.info("written: %s", OUT)

    # The committed facts file the method page renders its drift figures from — the same
    # pattern as ml/availability_facts.json: prose never types a measured number, it imports
    # this. Written only when M0 passed, so a stale replication can never publish.
    facts = {
        "measuredOn": "2026-08-24",
        "windowGames": WINDOW,
        "minCareerForSplit": SPLIT_MIN_CAREER,
        "publishedOfficials": len(published),
        "drift": {
            "officialsTested": len(per_official_drift),
            "cells": drift_cells,
            "beyond": drift_beyond,
            "sharePct": round(100 * drift_share, 1),
            "chancePct": 4.6,
            "careerBoldCells": career_bold,
            "windowBoldCells": window_bold,
            "leadingTraitChanges": lead_changes,
        },
        "seasonSplit": {
            "cells": season_cells,
            "beyond": season_beyond,
            "sharePct": round(100 * season_share, 1),
            "signAgreementPct": round(100 * mean_agreement, 1),
        },
    }
    facts_path = ROOT / "src/data/referee-career-drift.json"
    facts_path.write_text(json.dumps(facts, indent=2) + "\n")
    log.info("written: %s", facts_path)


if __name__ == "__main__":
    main()
