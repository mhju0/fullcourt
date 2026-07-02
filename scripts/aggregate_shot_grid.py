"""[Shot Quality Model, Phase SQ-3] Aggregate the local shot cache into ``shot_grid``.

This is the STORAGE step of the Expected Shot Value (xeFG%) module. It reads the raw
per-shot cache written by SQ-2 (``scripts/collect_shot_data.py``) at
``ml/data/shots/{season}/{team_abbr}.csv.gz`` and folds it into a 1ft x 1ft spatial grid
of **atomic counts** (``fga``/``fgm``/``fg3a``/``fg3m``) per cell, which it idempotently
upserts into the ``public.shot_grid`` table. Raw shots NEVER leave the local cache and are
NEVER written to the DB.

Design (fixed by the SQ-3 spec):
  * Cell = 1ft x 1ft. LOC_X/LOC_Y are in 1/10 ft, so ``cell_x = floor(LOC_X/10)`` and
    ``cell_y = floor(LOC_Y/10)``. Origin = the rim. No left/right folding (the grid is
    stored UNFOLDED / full width).
  * Half-court clip: keep only shots with ``LOC_X in [-250, 250)`` and
    ``LOC_Y in [-50, 420)`` (i.e. cell_x in [-25, 24], cell_y in [-5, 41]). Shots outside
    (backcourt heaves, behind-backboard, and the +250 sideline-clamp edge) are dropped and
    counted. Rows with a missing/non-numeric LOC are dropped as "no-location".
  * Per cell we store only the four atomic counts. eFG%/xPPS are DERIVED downstream and are
    NOT stored here.
  * ``zone_basic``/``zone_range``/``zone_area`` = the MODAL zone label of the shots in the
    cell. These are display-only; SQ-4 computes baseline zone means from the local per-shot
    cache, not from these columns.
  * Aggregated at two grains: one set of rows per (season, team) with ``team_id`` set, and
    one league-wide set per season with ``team_id`` NULL (the season's shots summed across
    all teams).
  * ``external_cell_key = f"{season}:{team_id or 'LG'}:{cell_x}:{cell_y}"`` is the idempotent
    upsert key (``ON CONFLICT (external_cell_key) DO UPDATE``). 2019-20 is INCLUDED.

The run is a gate-then-write pipeline:
  1. MEASURE: scan every ``.csv.gz``, validate the required columns exist, and compute
     global LOC min/max, SHOT_TYPE / SHOT_MADE_FLAG uniques, per-season totals and the
     out-of-grid fraction -> ``ml/data/shots/_grid_probe.txt``. If a required column is
     missing anywhere, or the LOC magnitude / out-of-grid fraction is implausible, STOP
     before touching the DB.
  2. AGGREGATE per (season, team) and per season (league), building all rows in memory.
  3. INTEGRITY: assert fgm<=fga, fg3m<=fg3a, fg3a<=fga, fg3m<=fgm on every row. Any
     violation -> write the summary, roll back, and fail without committing.
  4. UPSERT in one transaction, then re-read the DB row counts grouped by
     (season, team_id IS NULL) and compare to the local aggregate BEFORE committing. A
     mismatch rolls back and fails. Result -> ``ml/data/shots/_grid_summary.txt``.

Usage (run from the project root, in the ml venv):
    ./ml/.venv/bin/python scripts/aggregate_shot_grid.py            # measure -> aggregate -> upsert
    ./ml/.venv/bin/python scripts/aggregate_shot_grid.py --dry-run  # measure + aggregate + checks, NO DB write
    ./ml/.venv/bin/python scripts/aggregate_shot_grid.py --measure-only  # probe + gate only

DATABASE_URL resolution mirrors ``ml/build_series_dataset.py`` / ``scripts/daily_update.py``:
process env, else repo-root ``.env.local``, else ``scripts/.env``.
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

logger = logging.getLogger("aggregate_shot_grid")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "ml" / "data" / "shots"
PROBE_FILE = DATA_DIR / "_grid_probe.txt"
SUMMARY_FILE = DATA_DIR / "_grid_summary.txt"

SEASON_RE = re.compile(r"^\d{4}-\d{2}$")

# Columns every cache file must contain (from SQ-0 / SQ-2 EXPECTED_COLUMNS subset).
REQUIRED_COLUMNS = [
    "LOC_X",
    "LOC_Y",
    "SHOT_TYPE",
    "SHOT_ZONE_BASIC",
    "SHOT_ZONE_AREA",
    "SHOT_ZONE_RANGE",
    "SHOT_MADE_FLAG",
]
ZONE_COLUMNS = ["SHOT_ZONE_BASIC", "SHOT_ZONE_RANGE", "SHOT_ZONE_AREA"]
# SHOT_TYPE value that marks a three-point attempt (confirmed across all 30 seasons).
THREE_PT_LABEL = "3PT Field Goal"

# Half-court clip in 1/10 ft (half-open on the upper bound to keep cell_x in [-25, 24],
# cell_y in [-5, 41]). LOC_X is clamped to +/-250 by nba_api; LOC_Y > 420 are heaves.
CLIP_X_MIN, CLIP_X_MAX = -250, 250
CLIP_Y_MIN, CLIP_Y_MAX = -50, 420

# Gate thresholds for the measurement step.
MAX_ABS_LOC_X = 400  # nba_api clamps X to +/-250; anything past this means wrong units.
STOP_OUT_OF_GRID_FRACTION = 0.02  # observed ~0.002; stop well before "normal shots outside".


def resolve_database_url() -> str:
    """Prefer DATABASE_URL from the process env; else load repo-root .env.local then
    scripts/.env and read again (mirrors ml/build_series_dataset.resolve_database_url)."""
    import os

    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    from dotenv import load_dotenv  # lazy: only the local .env fallback needs it

    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        logger.error(
            "DATABASE_URL is not set. Set it in the environment or add it to "
            ".env.local / scripts/.env."
        )
        sys.exit(1)
    return url


def season_dirs() -> list[Path]:
    """Season subdirectories of the shot cache, sorted (skips the _*.log helper files)."""
    dirs = [p for p in DATA_DIR.iterdir() if p.is_dir() and SEASON_RE.match(p.name)]
    return sorted(dirs, key=lambda p: p.name)


def team_files(season_dir: Path) -> list[Path]:
    """The ``{ABBR}.csv.gz`` files in a season dir, sorted by abbreviation."""
    return sorted(season_dir.glob("*.csv.gz"), key=lambda p: p.name)


def abbr_from_file(path: Path) -> str:
    """``ATL.csv.gz`` -> ``ATL`` (strip BOTH extensions; Path.stem leaves ``ATL.csv``)."""
    return path.name.split(".", 1)[0]


def load_team_map(url: str) -> dict[str, int]:
    """abbreviation -> teams.id from the DB."""
    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT abbreviation, id FROM teams")
            rows = cur.fetchall()
    finally:
        conn.close()
    return {abbr: int(tid) for abbr, tid in rows}


# --------------------------------------------------------------------------------------
# Step 1: measurement / gate
# --------------------------------------------------------------------------------------


def measure() -> dict:
    """Validate columns and profile LOC / SHOT_TYPE / SHOT_MADE_FLAG across the whole cache.

    Writes ``_grid_probe.txt`` and returns a dict of aggregates. Sets ``result['ok']`` False
    (with ``result['stop_reasons']``) if a required column is missing anywhere or the LOC
    magnitude / out-of-grid fraction is implausible.
    """
    missing_cols: list[str] = []
    shot_types: set = set()
    made_values: set = set()
    per_season_total: dict[str, int] = {}
    total_rows = 0
    no_location = 0
    out_of_grid = 0  # in-clip failures among rows WITH a valid location
    gx_min, gx_max = np.inf, -np.inf
    gy_min, gy_max = np.inf, -np.inf

    for sdir in season_dirs():
        season = sdir.name
        season_rows = 0
        for f in team_files(sdir):
            header = pd.read_csv(f, nrows=0)
            absent = [c for c in REQUIRED_COLUMNS if c not in header.columns]
            if absent:
                missing_cols.append(f"{season}/{f.name}: missing {absent}")
                continue
            df = pd.read_csv(f, usecols=["LOC_X", "LOC_Y", "SHOT_TYPE", "SHOT_MADE_FLAG"])
            n = len(df)
            total_rows += n
            season_rows += n
            if n == 0:
                continue
            shot_types.update(df["SHOT_TYPE"].dropna().unique().tolist())
            made_values.update(pd.to_numeric(df["SHOT_MADE_FLAG"], errors="coerce").dropna().unique().tolist())
            x = pd.to_numeric(df["LOC_X"], errors="coerce")
            y = pd.to_numeric(df["LOC_Y"], errors="coerce")
            loc_ok = x.notna() & y.notna()
            no_location += int((~loc_ok).sum())
            xv, yv = x[loc_ok], y[loc_ok]
            if len(xv):
                gx_min = min(gx_min, float(xv.min()))
                gx_max = max(gx_max, float(xv.max()))
                gy_min = min(gy_min, float(yv.min()))
                gy_max = max(gy_max, float(yv.max()))
                inx = (xv >= CLIP_X_MIN) & (xv < CLIP_X_MAX)
                iny = (yv >= CLIP_Y_MIN) & (yv < CLIP_Y_MAX)
                out_of_grid += int((~(inx & iny)).sum())
        per_season_total[season] = season_rows

    dropped_total = no_location + out_of_grid
    frac = (dropped_total / total_rows) if total_rows else 0.0

    stop_reasons: list[str] = []
    if missing_cols:
        stop_reasons.append(f"{len(missing_cols)} file(s) missing required columns")
    if total_rows == 0:
        stop_reasons.append("no shot rows found in cache")
    if np.isfinite(gx_max) and max(abs(gx_min), abs(gx_max)) > MAX_ABS_LOC_X:
        stop_reasons.append(
            f"|LOC_X| max {max(abs(gx_min), abs(gx_max))} > {MAX_ABS_LOC_X} (units look wrong)"
        )
    if frac > STOP_OUT_OF_GRID_FRACTION:
        stop_reasons.append(
            f"out-of-grid fraction {frac:.5f} > {STOP_OUT_OF_GRID_FRACTION} "
            "(normal shots fall outside the clip)"
        )

    lines = [
        "# SQ-3 shot_grid MEASUREMENT probe",
        f"total_files_scanned = {sum(len(team_files(s)) for s in season_dirs())}",
        f"total_rows = {total_rows}",
        f"no_location_rows = {no_location}",
        f"out_of_grid_rows (valid-loc, outside clip) = {out_of_grid}",
        f"dropped_total (no_location + out_of_grid) = {dropped_total}",
        f"out_of_grid_fraction = {frac:.6f}",
        f"clip_X = [{CLIP_X_MIN}, {CLIP_X_MAX})   clip_Y = [{CLIP_Y_MIN}, {CLIP_Y_MAX})",
        f"global LOC_X min/max = {gx_min} / {gx_max}",
        f"global LOC_Y min/max = {gy_min} / {gy_max}",
        f"SHOT_TYPE uniques = {sorted(shot_types)}",
        f"SHOT_MADE_FLAG uniques = {sorted(made_values)}",
        f"THREE_PT_LABEL used for fg3 = {THREE_PT_LABEL!r}",
        "",
        "# per-season total shot rows (pre-clip)",
    ]
    for season in sorted(per_season_total):
        lines.append(f"  {season} = {per_season_total[season]}")
    if missing_cols:
        lines.append("")
        lines.append("# MISSING-COLUMN files")
        lines.extend(f"  {m}" for m in missing_cols)
    lines.append("")
    lines.append(f"GATE = {'PASS' if not stop_reasons else 'STOP'}")
    for r in stop_reasons:
        lines.append(f"  stop: {r}")
    PROBE_FILE.write_text("\n".join(lines) + "\n")
    logger.info("measurement probe written -> %s", PROBE_FILE)

    return {
        "ok": not stop_reasons,
        "stop_reasons": stop_reasons,
        "total_rows": total_rows,
        "shot_types": sorted(shot_types),
        "out_of_grid_fraction": frac,
    }


# --------------------------------------------------------------------------------------
# Step 2: aggregation
# --------------------------------------------------------------------------------------


def _clip_and_cell(df: pd.DataFrame) -> tuple[pd.DataFrame, int, int]:
    """Coerce LOC, drop no-location and out-of-clip rows, and attach cell/made/is3 columns.

    Returns (minimal_df, dropped_no_location, dropped_out_of_grid). ``minimal_df`` has
    columns cell_x, cell_y (int), made (int 0/1), is3 (bool), made3 (int 0/1) and the three
    raw zone columns, for the in-clip rows only.
    """
    x = pd.to_numeric(df["LOC_X"], errors="coerce")
    y = pd.to_numeric(df["LOC_Y"], errors="coerce")
    loc_ok = x.notna() & y.notna()
    dropped_no_location = int((~loc_ok).sum())
    inx = (x >= CLIP_X_MIN) & (x < CLIP_X_MAX)
    iny = (y >= CLIP_Y_MIN) & (y < CLIP_Y_MAX)
    keep = loc_ok & inx & iny
    dropped_out_of_grid = int((loc_ok & ~(inx & iny)).sum())

    sub = df.loc[keep].copy()
    if sub.empty:
        return sub, dropped_no_location, dropped_out_of_grid
    # floor(LOC/10) toward -inf for both signs (np.floor matches the spec).
    sub["cell_x"] = np.floor(x[keep].to_numpy() / 10.0).astype(np.int64)
    sub["cell_y"] = np.floor(y[keep].to_numpy() / 10.0).astype(np.int64)
    made = (pd.to_numeric(sub["SHOT_MADE_FLAG"], errors="coerce") == 1)
    is3 = sub["SHOT_TYPE"] == THREE_PT_LABEL
    sub["made"] = made.astype(np.int64)
    sub["is3"] = is3
    sub["made3"] = (made & is3).astype(np.int64)
    return (
        sub[["cell_x", "cell_y", "made", "is3", "made3", *ZONE_COLUMNS]],
        dropped_no_location,
        dropped_out_of_grid,
    )


def _modal_zone(df: pd.DataFrame, col: str) -> pd.Series:
    """Modal value of ``col`` per (cell_x, cell_y), NaN zones ignored. Deterministic
    tie-break: higher count first, then the label sorted ascending. Vectorized."""
    vc = df.groupby(["cell_x", "cell_y", col], sort=False).size().reset_index(name="_n")
    vc = vc.sort_values(
        ["cell_x", "cell_y", "_n", col], ascending=[True, True, False, True]
    )
    top = vc.drop_duplicates(["cell_x", "cell_y"], keep="first")
    return top.set_index(["cell_x", "cell_y"])[col]


def _aggregate_cells(mini: pd.DataFrame, season: str, team_id: int | None) -> list[dict]:
    """Group a minimal per-shot frame into per-cell rows for one (season, team|league)."""
    if mini.empty:
        return []
    grp = mini.groupby(["cell_x", "cell_y"], sort=True)
    counts = grp.agg(
        fga=("made", "size"),
        fgm=("made", "sum"),
        fg3a=("is3", "sum"),
        fg3m=("made3", "sum"),
    )
    modes = {c: _modal_zone(mini, c) for c in ZONE_COLUMNS}
    key_label = "LG" if team_id is None else str(team_id)
    rows = []
    for (cx, cy), r in counts.iterrows():
        cx_i, cy_i = int(cx), int(cy)
        def _z(col: str):
            v = modes[col].get((cx, cy))
            return None if v is None or (isinstance(v, float) and np.isnan(v)) else str(v)
        rows.append(
            {
                "season": season,
                "team_id": team_id,
                "cell_x": cx_i,
                "cell_y": cy_i,
                "zone_basic": _z("SHOT_ZONE_BASIC"),
                "zone_range": _z("SHOT_ZONE_RANGE"),
                "zone_area": _z("SHOT_ZONE_AREA"),
                "fga": int(r["fga"]),
                "fgm": int(r["fgm"]),
                "fg3a": int(r["fg3a"]),
                "fg3m": int(r["fg3m"]),
                "external_cell_key": f"{season}:{key_label}:{cx_i}:{cy_i}",
            }
        )
    return rows


def aggregate(team_map: dict[str, int]) -> tuple[list[dict], dict]:
    """Build all (season, team) and (season, league) cell rows. Returns (rows, stats)."""
    all_rows: list[dict] = []
    stats = {
        "dropped_no_location": 0,
        "dropped_out_of_grid": 0,
        "per_season_team_rows": {},
        "per_season_league_rows": {},
        "unmapped_abbrs": set(),
    }
    for sdir in season_dirs():
        season = sdir.name
        season_minis: list[pd.DataFrame] = []
        team_row_count = 0
        for f in team_files(sdir):
            abbr = abbr_from_file(f)
            if abbr not in team_map:
                stats["unmapped_abbrs"].add(abbr)
                continue
            df = pd.read_csv(f, usecols=REQUIRED_COLUMNS)
            mini, d_noloc, d_out = _clip_and_cell(df)
            stats["dropped_no_location"] += d_noloc
            stats["dropped_out_of_grid"] += d_out
            if mini.empty:
                continue
            team_rows = _aggregate_cells(mini, season, team_map[abbr])
            all_rows.extend(team_rows)
            team_row_count += len(team_rows)
            season_minis.append(mini)
        stats["per_season_team_rows"][season] = team_row_count
        if season_minis:
            league_mini = pd.concat(season_minis, ignore_index=True)
            league_rows = _aggregate_cells(league_mini, season, None)
            all_rows.extend(league_rows)
            stats["per_season_league_rows"][season] = len(league_rows)
        else:
            stats["per_season_league_rows"][season] = 0
        logger.info(
            "aggregated %s: %d team rows, %d league rows",
            season,
            team_row_count,
            stats["per_season_league_rows"][season],
        )
    return all_rows, stats


def integrity_violations(rows: list[dict]) -> list[str]:
    """Return human-readable descriptions of any count-invariant violations."""
    bad = []
    for r in rows:
        fga, fgm, fg3a, fg3m = r["fga"], r["fgm"], r["fg3a"], r["fg3m"]
        problems = []
        if not (fgm <= fga):
            problems.append("fgm>fga")
        if not (fg3m <= fg3a):
            problems.append("fg3m>fg3a")
        if not (fg3a <= fga):
            problems.append("fg3a>fga")
        if not (fg3m <= fgm):
            problems.append("fg3m>fgm")
        if problems:
            bad.append(f"{r['external_cell_key']}: {','.join(problems)} "
                       f"(fga={fga},fgm={fgm},fg3a={fg3a},fg3m={fg3m})")
    return bad


# --------------------------------------------------------------------------------------
# Step 4: upsert + DB reconciliation
# --------------------------------------------------------------------------------------

UPSERT_SQL = """
INSERT INTO shot_grid
  (season, team_id, cell_x, cell_y, zone_basic, zone_range, zone_area, fga, fgm, fg3a, fg3m, external_cell_key)
VALUES %s
ON CONFLICT (external_cell_key) DO UPDATE SET
  fga = EXCLUDED.fga,
  fgm = EXCLUDED.fgm,
  fg3a = EXCLUDED.fg3a,
  fg3m = EXCLUDED.fg3m,
  zone_basic = EXCLUDED.zone_basic,
  zone_range = EXCLUDED.zone_range,
  zone_area = EXCLUDED.zone_area,
  computed_at = now()
"""


def _row_tuple(r: dict) -> tuple:
    return (
        r["season"], r["team_id"], r["cell_x"], r["cell_y"],
        r["zone_basic"], r["zone_range"], r["zone_area"],
        r["fga"], r["fgm"], r["fg3a"], r["fg3m"], r["external_cell_key"],
    )


def local_group_counts(rows: list[dict]) -> dict[tuple[str, bool], int]:
    """(season, is_league) -> row count from the in-memory aggregate."""
    counts: dict[tuple[str, bool], int] = {}
    for r in rows:
        k = (r["season"], r["team_id"] is None)
        counts[k] = counts.get(k, 0) + 1
    return counts


def upsert_and_reconcile(url: str, rows: list[dict]) -> tuple[bool, list[str]]:
    """Upsert all rows in one transaction, then compare DB counts to the local aggregate
    BEFORE committing. Returns (committed, report_lines). Rolls back on any mismatch."""
    report: list[str] = []
    conn = psycopg2.connect(url)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            execute_values(cur, UPSERT_SQL, [_row_tuple(r) for r in rows], page_size=1000)
            cur.execute(
                "SELECT season, (team_id IS NULL) AS is_league, count(*) "
                "FROM shot_grid GROUP BY season, (team_id IS NULL)"
            )
            db_counts = {(s, bool(is_lg)): int(n) for s, is_lg, n in cur.fetchall()}

        local_counts = local_group_counts(rows)
        all_keys = sorted(set(local_counts) | set(db_counts))
        mismatches = []
        report.append("# DB vs local (season, is_league) -> local / db")
        for k in all_keys:
            lc = local_counts.get(k, 0)
            dc = db_counts.get(k, 0)
            flag = "" if lc == dc else "  <-- MISMATCH"
            report.append(f"  {k[0]} league={k[1]} : {lc} / {dc}{flag}")
            if lc != dc:
                mismatches.append(k)

        if mismatches:
            conn.rollback()
            report.append(f"ROLLED BACK: {len(mismatches)} group mismatch(es)")
            logger.error("DB reconciliation mismatch on %d groups; rolled back", len(mismatches))
            return False, report

        conn.commit()
        report.append(f"COMMITTED: {len(rows)} rows upserted, DB reconciliation OK")
        logger.info("committed %d rows; DB reconciliation OK", len(rows))
        return True, report
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# --------------------------------------------------------------------------------------
# Step 5: summary report
# --------------------------------------------------------------------------------------


def write_summary(rows: list[dict], stats: dict, viol: list[str],
                  db_report: list[str] | None, mode: str) -> None:
    total = len(rows)
    team_total = sum(stats["per_season_team_rows"].values())
    league_total = sum(stats["per_season_league_rows"].values())
    lines = [
        "# SQ-3 shot_grid AGGREGATION summary",
        f"mode = {mode}",
        f"total_rows = {total}  (team={team_total}, league={league_total})",
        f"dropped_no_location = {stats['dropped_no_location']}",
        f"dropped_out_of_grid = {stats['dropped_out_of_grid']}",
        f"dropped_total = {stats['dropped_no_location'] + stats['dropped_out_of_grid']}",
        "",
        "# per-season row counts (league / team)",
    ]
    for season in sorted(stats["per_season_team_rows"]):
        lines.append(
            f"  {season} : league={stats['per_season_league_rows'].get(season, 0)}"
            f"  team={stats['per_season_team_rows'][season]}"
        )
    lines.append("")
    lines.append("# integrity (fgm<=fga, fg3m<=fg3a, fg3a<=fga, fg3m<=fgm)")
    lines.append(f"  violations = {len(viol)}")
    lines.extend(f"    {v}" for v in viol[:50])
    if len(viol) > 50:
        lines.append(f"    ... {len(viol) - 50} more")
    lines.append("")
    if db_report is not None:
        lines.extend(db_report)
    else:
        lines.append("# DB reconciliation skipped (measure-only / dry-run / integrity fail)")
    SUMMARY_FILE.write_text("\n".join(lines) + "\n")
    logger.info("summary written -> %s", SUMMARY_FILE)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    ap = argparse.ArgumentParser(description="Aggregate local shot cache into shot_grid.")
    ap.add_argument("--dry-run", action="store_true",
                    help="measure + aggregate + integrity, but do NOT write to the DB")
    ap.add_argument("--measure-only", action="store_true",
                    help="run the measurement probe and gate only, then exit")
    args = ap.parse_args()

    if not DATA_DIR.exists():
        logger.error("shot cache dir not found: %s", DATA_DIR)
        return 1

    # Step 1: measure + gate.
    m = measure()
    if not m["ok"]:
        logger.error("measurement gate STOP: %s", "; ".join(m["stop_reasons"]))
        return 1
    if THREE_PT_LABEL not in m["shot_types"]:
        logger.error("expected SHOT_TYPE %r not present; observed %s",
                     THREE_PT_LABEL, m["shot_types"])
        return 1
    if args.measure_only:
        logger.info("measure-only: gate PASS; probe at %s", PROBE_FILE)
        return 0

    # Step 2: map + aggregate.
    url = resolve_database_url()
    team_map = load_team_map(url)
    rows, stats = aggregate(team_map)
    if stats["unmapped_abbrs"]:
        logger.error("unmapped team abbreviations (no guessing): %s",
                     sorted(stats["unmapped_abbrs"]))
        return 1
    if not rows:
        logger.error("no rows aggregated; aborting")
        return 1

    # Step 3: integrity.
    viol = integrity_violations(rows)
    if viol:
        write_summary(rows, stats, viol, None, mode="integrity-fail")
        logger.error("%d integrity violations; NOT writing to DB (see %s)",
                     len(viol), SUMMARY_FILE)
        return 1

    # Step 4 + 5: upsert (unless dry-run) + reconcile + summary.
    if args.dry_run:
        write_summary(rows, stats, viol, None, mode="dry-run")
        logger.info("dry-run: %d rows aggregated, integrity OK, DB untouched", len(rows))
        return 0

    committed, db_report = upsert_and_reconcile(url, rows)
    write_summary(rows, stats, viol, db_report, mode="upsert")
    return 0 if committed else 1


if __name__ == "__main__":
    sys.exit(main())
