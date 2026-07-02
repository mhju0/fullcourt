"""[Shot Quality Model, Phase SQ-5] Write the Expected Shot Value (xeFG%) SURFACE.

FIRST DB-writing step of the Expected Shot Value module. It combines the LOCAL trained
pickles from SQ-4 / SQ-4b with the league-grain ``shot_grid`` cells (read-only) to compute a
per-cell expected-shot-value surface, and idempotently upserts it into ``shot_value_surface``.

Two model versions are written for every league cell:
  * ``gbm-v1``          — the ADOPTED model: HistGradientBoostingClassifier P(make) from
                          ``ml/shot_value/sq4b_gbm_full.pkl`` (SQ-4b winner: it beat the zone
                          baseline on pooled log-loss/Brier, 29/29 folds).
  * ``baseline-zone-v1`` — the comparison floor: empirical make% per SHOT_ZONE_BASIC ||
                          SHOT_ZONE_RANGE from ``ml/shot_value/sq4_logit_full.pkl``
                          (``baseline_zone_rate`` / ``zone_vocab`` / ``baseline_global_rate``;
                          the GBM pickle does NOT carry the zone table — verified at load).

Cell -> features (matches SQ-4's _build_X order and per-feature standardization exactly; the
pickle's ``scaler_mean``/``scaler_std`` are reused, and ``_build_X`` is IMPORTED from
``scripts/sq4_train_shot_value.py`` so the transform is byte-identical):
  * cell center (LOC units) = ((cell_x + 0.5) * 10, (cell_y + 0.5) * 10).
  * distance = sqrt(cx^2 + cy^2) / 10   (SQ-4 cross-checked SHOT_DISTANCE ~= this, r>=0.99).
  * angle    = arctan2(|cx|, cy)        (folds left/right onto one angle, as SQ-4 does).
  * period   = NEUTRALIZED to the training mean (standardized value 0) — a cell has no period.
  * home     = NEUTRALIZED to 0.5 (raw 0/1 feature; a cell has no home/away).
  Both neutralizations are reported. Only distance/angle carry cell information.

Three-point weighting per cell (r3 = fg3a / fga, clipped to [0,1]):
    P(make)      = (1-r3)*p2 + r3*p3
    xPPS         = (1-r3)*2*p2 + r3*3*p3
    expected_eFG = (1-r3)*p2 + r3*1.5*p3
  where p2 = P(make | is3=0), p3 = P(make | is3=1). For the baseline (3pt-agnostic) p2=p3=
  the cell's zone make-rate, substituted into the SAME three formulas. Pure-2pt (r3=0) cells
  drop the p3 term; pure-3pt (r3=1) cells drop the p2 term (both fall out of the algebra).

Target cells: ``shot_grid`` rows with ``team_id IS NULL`` (league grain) AND ``fga > 0``.
external_surface_key = f"{model_version}:{season}:{cell_x}:{cell_y}" (idempotent upsert key).

DB contract (strict): the ONLY table written is ``shot_value_surface`` (INSERT ... ON CONFLICT
DO UPDATE of p_make/expected_efg/xpps/created_at). ``shot_grid`` is read-only. No other table
is touched. No TRUNCATE/DROP/ALTER. DATABASE_URL resolves env -> .env.local -> scripts/.env
(never hard-coded), mirroring aggregate_shot_grid.resolve_database_url.

Run from the project root, in the ml venv (safest order = measure -> dry-run -> real):
    ./ml/.venv/bin/python scripts/sq5_write_surface.py --measure-only  # count target cells only
    ./ml/.venv/bin/python scripts/sq5_write_surface.py --dry-run       # compute + validate, NO write
    ./ml/.venv/bin/python scripts/sq5_write_surface.py                 # compute + upsert + reconcile

Every verification number is written to ml/shot_value/sq5_surface_summary.txt and re-read from
that file, never trusted from stdout (the rtk proxy has masked stdout digits before).
"""

from __future__ import annotations

import argparse
import logging
import pickle
import sys
from pathlib import Path

import numpy as np
import psycopg2
from psycopg2.extras import execute_values

# Import SQ-4's design matrix builder verbatim so the cell->feature transform is byte-identical
# to training (same column order, same standardization). CPython already puts scripts/ on
# sys.path[0] when run as ``python scripts/sq5_write_surface.py``; this makes it explicit.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sq4_train_shot_value import _build_X  # noqa: E402

logger = logging.getLogger("sq5_write_surface")

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "ml" / "shot_value"
GBM_PICKLE = OUT_DIR / "sq4b_gbm_full.pkl"
BASELINE_PICKLE = OUT_DIR / "sq4_logit_full.pkl"
SUMMARY_FILE = OUT_DIR / "sq5_surface_summary.txt"

GBM_VERSION = "gbm-v1"
BASELINE_VERSION = "baseline-zone-v1"

TABLE = "shot_value_surface"
TOL = 1e-9  # probability-bound tolerance
CONT_INDEX_PERIOD = 2  # cont_features order = [distance, angle, period]; period is index 2
HOME_NEUTRAL = 0.5


# ======================================================================================
# DB URL resolution (env -> .env.local -> scripts/.env; identical to aggregate_shot_grid)
# ======================================================================================

def resolve_database_url() -> str:
    import os

    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    from dotenv import load_dotenv  # lazy: only the local .env fallback needs it

    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        logger.error("DATABASE_URL is not set (checked env, .env.local, scripts/.env).")
        sys.exit(1)
    return url


# ======================================================================================
# Pickle loading
# ======================================================================================

def load_models() -> dict:
    """Load the adopted GBM (sq4b) + the baseline zone table (sq4_logit), and confirm WHERE
    the zone table actually lives. Returns everything SQ-5 needs, plus provenance for the
    report."""
    if not GBM_PICKLE.exists():
        logger.error("GBM pickle missing: %s", GBM_PICKLE)
        sys.exit(1)
    if not BASELINE_PICKLE.exists():
        logger.error("baseline pickle missing: %s", BASELINE_PICKLE)
        sys.exit(1)

    # SAFETY: these two pickles are LOCAL artifacts this repo produced in SQ-4/SQ-4b
    # (scripts/sq4_train_shot_value.py, scripts/sq4b_train_gbm.py) — not untrusted input.
    # sklearn estimators cannot be JSON/msgspec-serialized, so pickle is the established
    # pattern here (see save_full_model / save_full_gbm). Do not point these at foreign files.
    with open(GBM_PICKLE, "rb") as f:
        gbm_pkl = pickle.load(f)
    with open(BASELINE_PICKLE, "rb") as f:
        base_pkl = pickle.load(f)

    # Where is the baseline zone table? Prefer the GBM pickle if it carries one; else the
    # logit pickle. Report the actual source so the claim is [Verified], not assumed.
    gbm_has_zone = "baseline_zone_rate" in gbm_pkl and "zone_vocab" in gbm_pkl
    if gbm_has_zone:
        zone_src = GBM_PICKLE.name
        zone_rate = np.asarray(gbm_pkl["baseline_zone_rate"], dtype=np.float64)
        zone_vocab = dict(gbm_pkl["zone_vocab"])
        global_rate = float(gbm_pkl["baseline_global_rate"])
    else:
        zone_src = BASELINE_PICKLE.name
        zone_rate = np.asarray(base_pkl["baseline_zone_rate"], dtype=np.float64)
        zone_vocab = dict(base_pkl["zone_vocab"])
        global_rate = float(base_pkl["baseline_global_rate"])

    features = list(gbm_pkl["features"])
    include_home = "home" in features
    scaler_mean = np.asarray(gbm_pkl["scaler_mean"], dtype=np.float64)
    scaler_std = np.asarray(gbm_pkl["scaler_std"], dtype=np.float64)
    if scaler_mean.shape != (3,) or scaler_std.shape != (3,):
        logger.error("unexpected scaler shape mean=%s std=%s (want (3,))",
                     scaler_mean.shape, scaler_std.shape)
        sys.exit(1)

    logger.info("GBM pickle features=%s include_home=%s", features, include_home)
    logger.info("baseline zone table source = %s (gbm_pickle_had_zone=%s)",
                zone_src, gbm_has_zone)
    return {
        "gbm": gbm_pkl["gbm"],
        "features": features,
        "include_home": include_home,
        "scaler_mean": scaler_mean,
        "scaler_std": scaler_std,
        "zone_rate": zone_rate,
        "zone_vocab": zone_vocab,
        "global_rate": global_rate,
        "zone_src": zone_src,
        "gbm_had_zone": gbm_has_zone,
    }


# ======================================================================================
# shot_grid league-cell load (read-only)
# ======================================================================================

def table_exists(cur, table: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
    return cur.fetchone()[0] is not None


def load_league_cells(cur) -> list[dict]:
    """League-grain (team_id IS NULL), fga>0 cells. SELECT only — never mutates shot_grid."""
    cur.execute(
        "SELECT season, cell_x, cell_y, zone_basic, zone_range, fga, fg3a "
        "FROM shot_grid WHERE team_id IS NULL AND fga > 0 "
        "ORDER BY season, cell_x, cell_y"
    )
    rows = []
    for season, cx, cy, zb, zr, fga, fg3a in cur.fetchall():
        rows.append({
            "season": str(season),
            "cell_x": int(cx),
            "cell_y": int(cy),
            "zone_basic": zb,
            "zone_range": zr,
            "fga": int(fga),
            "fg3a": int(fg3a),
        })
    return rows


# ======================================================================================
# Surface computation
# ======================================================================================

def _cell_distance_angle(cells: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Cell-center distance (ft) and folded angle (rad), matching SQ-4's per-shot definition."""
    cx = (np.array([c["cell_x"] for c in cells], dtype=np.float64) + 0.5) * 10.0
    cy = (np.array([c["cell_y"] for c in cells], dtype=np.float64) + 0.5) * 10.0
    distance = np.sqrt(cx * cx + cy * cy) / 10.0
    angle = np.arctan2(np.abs(cx), cy)
    return distance.astype(np.float32), angle.astype(np.float32)


def _gbm_p2_p3(models: dict, distance: np.ndarray, angle: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """GBM P(make) with is3=0 (p2) and is3=1 (p3). period neutralized to the training mean
    (standardized 0), home neutralized to 0.5. _build_X applies the exact SQ-4 transform."""
    n = distance.shape[0]
    period = np.full(n, models["scaler_mean"][CONT_INDEX_PERIOD], dtype=np.float32)
    home = np.full(n, HOME_NEUTRAL, dtype=np.float64)
    mean, std, inc = models["scaler_mean"], models["scaler_std"], models["include_home"]

    def _predict(is3_val: int) -> np.ndarray:
        arr = {"distance": distance, "angle": angle, "period": period,
               "is3": np.full(n, is3_val, dtype=np.float64), "home": home}
        X = _build_X(arr, mean, std, inc)
        return models["gbm"].predict_proba(X)[:, 1].astype(np.float64)

    return _predict(0), _predict(1)


def _baseline_zone_rate(models: dict, cells: list[dict]) -> tuple[np.ndarray, int]:
    """Per-cell zone make-rate = baseline_zone_rate[vocab["zb||zr"]], unseen -> global_rate.
    Returns (rate array, n_unseen)."""
    vocab, rate, gr = models["zone_vocab"], models["zone_rate"], models["global_rate"]
    out = np.empty(len(cells), dtype=np.float64)
    unseen = 0
    for i, c in enumerate(cells):
        key = f"{c['zone_basic']}||{c['zone_range']}"
        idx = vocab.get(key)
        if idx is None:
            out[i] = gr
            unseen += 1
        else:
            out[i] = float(rate[idx])
    return out, unseen


def _weight(p2: np.ndarray, p3: np.ndarray, r3: np.ndarray) -> dict:
    """Apply the three-point weighting. r3 must already be clipped to [0,1]."""
    p_make = (1.0 - r3) * p2 + r3 * p3
    xpps = (1.0 - r3) * 2.0 * p2 + r3 * 3.0 * p3
    expected_efg = (1.0 - r3) * p2 + r3 * 1.5 * p3
    return {"p_make": p_make, "xpps": xpps, "expected_efg": expected_efg}


def _validate(tag: str, p2: np.ndarray, p3: np.ndarray, surf: dict) -> list[str]:
    """Hard bounds: p2/p3/p_make in [0,1], xpps in [0,3], expected_efg in [0,1.5] (its true
    algebraic max = 1.5 when p=1 & r3=1). Returns failure strings ([] = all good)."""
    fails = []
    for nm, arr, lo, hi in (
        (f"{tag}.p2", p2, 0.0, 1.0),
        (f"{tag}.p3", p3, 0.0, 1.0),
        (f"{tag}.p_make", surf["p_make"], 0.0, 1.0),
        (f"{tag}.xpps", surf["xpps"], 0.0, 3.0),
        (f"{tag}.expected_efg", surf["expected_efg"], 0.0, 1.5),
    ):
        amin, amax = float(arr.min()), float(arr.max())
        if amin < lo - TOL or amax > hi + TOL:
            fails.append(f"{nm} out of [{lo},{hi}]: min={amin:.6f} max={amax:.6f}")
    return fails


# ======================================================================================
# Upsert
# ======================================================================================

UPSERT_SQL = f"""
INSERT INTO {TABLE}
  (season, cell_x, cell_y, model_version, p_make, expected_efg, xpps, external_surface_key, created_at)
VALUES %s
ON CONFLICT (external_surface_key) DO UPDATE SET
  p_make = EXCLUDED.p_make,
  expected_efg = EXCLUDED.expected_efg,
  xpps = EXCLUDED.xpps,
  created_at = now()
"""
# created_at is supplied explicitly as now() via the template (never DEFAULT-dependent).
UPSERT_TEMPLATE = "(%s, %s, %s, %s, %s, %s, %s, %s, now())"


def build_rows(cells: list[dict], version: str, surf: dict) -> list[tuple]:
    rows = []
    for i, c in enumerate(cells):
        cx, cy, season = c["cell_x"], c["cell_y"], c["season"]
        key = f"{version}:{season}:{cx}:{cy}"
        rows.append((season, cx, cy, version,
                     float(surf["p_make"][i]), float(surf["expected_efg"][i]),
                     float(surf["xpps"][i]), key))
    return rows


def upsert_and_reconcile(url: str, all_rows: list[tuple], local_by_model: dict,
                         local_by_model_season: dict) -> tuple[bool, list[str]]:
    """Upsert every row in ONE transaction, then re-read DB counts and compare to the local
    aggregate BEFORE committing. Rolls back on any mismatch. Returns (committed, report)."""
    report: list[str] = []
    conn = psycopg2.connect(url)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            execute_values(cur, UPSERT_SQL, all_rows, template=UPSERT_TEMPLATE, page_size=1000)

            cur.execute(
                f"SELECT model_version, count(*) FROM {TABLE} "
                "WHERE model_version IN (%s, %s) GROUP BY model_version",
                (GBM_VERSION, BASELINE_VERSION),
            )
            db_by_model = {mv: int(n) for mv, n in cur.fetchall()}

            cur.execute(
                f"SELECT model_version, season, count(*) FROM {TABLE} "
                "WHERE model_version IN (%s, %s) GROUP BY model_version, season "
                "ORDER BY model_version, season",
                (GBM_VERSION, BASELINE_VERSION),
            )
            db_by_model_season = {(mv, str(s)): int(n) for mv, s, n in cur.fetchall()}

        report.append("# DB vs local by model_version  (local / db)")
        mismatches = []
        for mv in (GBM_VERSION, BASELINE_VERSION):
            lc, dc = local_by_model.get(mv, 0), db_by_model.get(mv, 0)
            flag = "" if lc == dc else "  <-- MISMATCH"
            report.append(f"  {mv} : {lc} / {dc}{flag}")
            if lc != dc:
                mismatches.append(mv)

        report.append("")
        report.append("# DB vs local by (model_version, season)  (local / db)")
        keys = sorted(set(local_by_model_season) | set(db_by_model_season))
        for k in keys:
            lc, dc = local_by_model_season.get(k, 0), db_by_model_season.get(k, 0)
            flag = "" if lc == dc else "  <-- MISMATCH"
            report.append(f"  {k[0]} {k[1]} : {lc} / {dc}{flag}")
            if lc != dc:
                mismatches.append(k)

        if mismatches:
            conn.rollback()
            report.append(f"ROLLED BACK: {len(mismatches)} mismatch(es)")
            logger.error("reconciliation mismatch on %d group(s); rolled back", len(mismatches))
            return False, report

        conn.commit()
        report.append(f"COMMITTED: {len(all_rows)} rows upserted, reconciliation OK")
        logger.info("committed %d rows; reconciliation OK", len(all_rows))
        return True, report
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ======================================================================================
# Report
# ======================================================================================

def _stat(a: np.ndarray) -> str:
    return f"min={float(a.min()):.6f} max={float(a.max()):.6f} mean={float(a.mean()):.6f}"


def write_summary(ctx: dict) -> None:
    L: list[str] = []
    a = L.append
    a("# SQ-5 Expected Shot Value SURFACE — write to shot_value_surface")
    a(f"mode = {ctx['mode']}")
    a(f"adopted model      = {GBM_VERSION} (HistGradientBoostingClassifier, from {GBM_PICKLE.name})")
    a(f"baseline model     = {BASELINE_VERSION} (zone make-rate, from {ctx['zone_src']})")
    a(f"gbm_pickle_had_zone_table = {ctx['gbm_had_zone']}  "
      "(False -> baseline zone table correctly sourced from the logit pickle)")
    a(f"feature order      = {ctx['features']}")
    a(f"include_home       = {ctx['include_home']}  (home neutralized to {HOME_NEUTRAL})")
    a(f"period neutralized = training mean (standardized 0); scaler_mean[period]={ctx['period_mean']:.6f}")
    a(f"scaler_mean        = {ctx['scaler_mean']}")
    a(f"scaler_std         = {ctx['scaler_std']}")
    a("")
    a("## Target cells (shot_grid league grain: team_id IS NULL AND fga>0)")
    a(f"  league cells               = {ctx['n_cells']}")
    a(f"  seasons                    = {ctx['n_seasons']}  ({ctx['season_first']} .. {ctx['season_last']})")
    a(f"  expected rows per model    = {ctx['n_cells']}")
    a(f"  expected total rows (x2)   = {2 * ctx['n_cells']}")
    a(f"  baseline unseen-zone cells = {ctx['unseen']} (fell back to global_rate={ctx['global_rate']:.6f})")
    a(f"  pure-2pt cells (r3=0)      = {ctx['n_pure2']}")
    a(f"  pure-3pt cells (r3=1)      = {ctx['n_pure3']}")
    a(f"  mixed cells (0<r3<1)       = {ctx['n_mixed']}")
    a("")
    a("## Per-season cell counts (gbm == baseline == shot_grid league cells, by construction)")
    a(f"  {'season':<9} {'cells':>8}")
    for s in ctx["season_order"]:
        a(f"  {s:<9} {ctx['per_season'][s]:>8}")
    a("")
    a("## Value ranges by model  (p_make/expected_efg in [0,1]; xpps in [0,3])")
    for tag in [t for t in (GBM_VERSION, BASELINE_VERSION) if t in ctx["ranges"]]:
        st = ctx["ranges"][tag]
        a(f"  [{tag}]")
        a(f"    p2           {st['p2']}")
        a(f"    p3           {st['p3']}")
        a(f"    p_make       {st['p_make']}")
        a(f"    expected_efg {st['expected_efg']}")
        a(f"    xpps         {st['xpps']}")
        a(f"    expected_efg within [0,1] = {st['efg_in_01']}  "
          "(true algebraic max is 1.5; a value >1 would still be a valid eFG)")
    a("")
    a("## Integrity spot-checks (3pt-weighting algebra)")
    for line in ctx["spot_checks"]:
        a(f"  {line}")
    a("")
    a("## Self-verification")
    for name, ok, detail in ctx["checks"]:
        a(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")
    a("")
    if ctx.get("db_report"):
        a("## DB reconciliation (re-read from shot_value_surface, pre-commit)")
        L.extend(f"  {ln}" for ln in ctx["db_report"])
        a("")
    a(f"OVERALL = {'PASS' if ctx['all_pass'] else 'FAIL'}")
    SUMMARY_FILE.write_text("\n".join(L) + "\n")
    logger.info("summary written -> %s", SUMMARY_FILE)


# ======================================================================================
# Orchestration
# ======================================================================================

def main() -> int:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description="SQ-5 write Expected Shot Value surface.")
    ap.add_argument("--dry-run", action="store_true",
                    help="compute + validate + report, but do NOT write the DB")
    ap.add_argument("--measure-only", action="store_true",
                    help="count target league cells (+ confirm the table exists) and exit")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    models = load_models()
    url = resolve_database_url()

    # --- load league cells (read-only) ---
    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            if not table_exists(cur, TABLE):
                logger.error("target table public.%s does not exist; aborting", TABLE)
                return 1
            cells = load_league_cells(cur)
    finally:
        conn.close()

    n_cells = len(cells)
    if n_cells == 0:
        logger.error("no league cells (team_id IS NULL, fga>0) found in shot_grid; aborting")
        return 1
    seasons = sorted({c["season"] for c in cells})
    per_season = {s: 0 for s in seasons}
    for c in cells:
        per_season[c["season"]] += 1
    logger.info("target league cells = %d across %d seasons", n_cells, len(seasons))

    if args.measure_only:
        # Minimal report: cell counts only, no computation.
        write_summary({
            "mode": "measure-only", "zone_src": models["zone_src"],
            "gbm_had_zone": models["gbm_had_zone"], "features": models["features"],
            "include_home": models["include_home"],
            "period_mean": float(models["scaler_mean"][CONT_INDEX_PERIOD]),
            "scaler_mean": np.round(models["scaler_mean"], 6).tolist(),
            "scaler_std": np.round(models["scaler_std"], 6).tolist(),
            "n_cells": n_cells, "n_seasons": len(seasons),
            "season_first": seasons[0], "season_last": seasons[-1],
            "unseen": "(not computed in measure-only)", "global_rate": models["global_rate"],
            "n_pure2": "-", "n_pure3": "-", "n_mixed": "-",
            "season_order": seasons, "per_season": per_season,
            "ranges": {}, "spot_checks": ["(skipped in measure-only)"],
            "checks": [("table_exists", True, f"public.{TABLE} present"),
                       ("cells_found", True, f"{n_cells} league cells with fga>0")],
            "all_pass": True,
        })
        logger.info("measure-only complete; %d cells. See %s", n_cells, SUMMARY_FILE)
        return 0

    # --- compute features + predictions ---
    distance, angle = _cell_distance_angle(cells)
    fga = np.array([c["fga"] for c in cells], dtype=np.float64)
    fg3a = np.array([c["fg3a"] for c in cells], dtype=np.float64)
    r3 = np.clip(fg3a / fga, 0.0, 1.0)
    n_pure2 = int((r3 == 0.0).sum())
    n_pure3 = int((r3 == 1.0).sum())
    n_mixed = n_cells - n_pure2 - n_pure3

    # GBM surface
    gbm_p2, gbm_p3 = _gbm_p2_p3(models, distance, angle)
    gbm_surf = _weight(gbm_p2, gbm_p3, r3)
    # Baseline surface (p2 = p3 = zone make-rate)
    zrate, unseen = _baseline_zone_rate(models, cells)
    base_surf = _weight(zrate, zrate, r3)

    fails: list[str] = []
    fails += _validate(GBM_VERSION, gbm_p2, gbm_p3, gbm_surf)
    fails += _validate(BASELINE_VERSION, zrate, zrate, base_surf)

    # Integrity spot-checks on the 3pt-weighting algebra.
    spot_checks: list[str] = []
    def _spot(mask_val: float, label: str, expect_fn) -> None:
        idx = np.where(r3 == mask_val)[0]
        if idx.size == 0:
            spot_checks.append(f"{label}: no cells (skip)")
            return
        j = int(idx[0])
        got = gbm_surf["expected_efg"][j]
        exp = expect_fn(j)
        ok = abs(got - exp) < 1e-9
        spot_checks.append(
            f"{label}: cell#{j} r3={r3[j]:.3f} expected_efg={got:.6f} vs {exp:.6f} "
            f"-> {'OK' if ok else 'MISMATCH'}")
        if not ok:
            fails.append(f"spot-check {label} failed")
    _spot(0.0, "pure-2pt expected_efg == p2 (gbm)", lambda j: gbm_p2[j])
    _spot(1.0, "pure-3pt expected_efg == 1.5*p3 (gbm)", lambda j: 1.5 * gbm_p3[j])

    ranges = {}
    for tag, p2, p3, surf in ((GBM_VERSION, gbm_p2, gbm_p3, gbm_surf),
                              (BASELINE_VERSION, zrate, zrate, base_surf)):
        efg_in_01 = bool(float(surf["expected_efg"].max()) <= 1.0 + TOL)
        ranges[tag] = {"p2": _stat(p2), "p3": _stat(p3), "p_make": _stat(surf["p_make"]),
                       "expected_efg": _stat(surf["expected_efg"]), "xpps": _stat(surf["xpps"]),
                       "efg_in_01": efg_in_01}

    # Build rows for both models.
    gbm_rows = build_rows(cells, GBM_VERSION, gbm_surf)
    base_rows = build_rows(cells, BASELINE_VERSION, base_surf)
    all_rows = gbm_rows + base_rows
    local_by_model = {GBM_VERSION: len(gbm_rows), BASELINE_VERSION: len(base_rows)}
    local_by_model_season: dict[tuple[str, str], int] = {}
    for mv in (GBM_VERSION, BASELINE_VERSION):
        for s in seasons:
            local_by_model_season[(mv, s)] = per_season[s]

    # Self-verification checks.
    checks: list[tuple[str, bool, str]] = []
    checks.append(("value_bounds", not fails,
                   "all within bounds" if not fails else "; ".join(fails)))
    checks.append(("rows_per_model_eq_cells",
                   len(gbm_rows) == n_cells and len(base_rows) == n_cells,
                   f"gbm={len(gbm_rows)} baseline={len(base_rows)} cells={n_cells}"))
    checks.append(("total_rows_eq_2x_cells", len(all_rows) == 2 * n_cells,
                   f"total={len(all_rows)} expected={2 * n_cells}"))
    keys = {r[7] for r in all_rows}
    checks.append(("surface_keys_unique", len(keys) == len(all_rows),
                   f"unique keys={len(keys)} rows={len(all_rows)}"))

    committed = False
    db_report: list[str] | None = None
    if fails:
        logger.error("value validation failed: %s", "; ".join(fails))
    elif args.dry_run:
        logger.info("dry-run: %d rows computed + validated, DB untouched", len(all_rows))
    else:
        committed, db_report = upsert_and_reconcile(
            url, all_rows, local_by_model, local_by_model_season)

    all_pass = (not fails) and all(ok for _, ok, _ in checks) and (
        args.dry_run or committed)

    write_summary({
        "mode": "dry-run" if args.dry_run else "upsert",
        "zone_src": models["zone_src"], "gbm_had_zone": models["gbm_had_zone"],
        "features": models["features"], "include_home": models["include_home"],
        "period_mean": float(models["scaler_mean"][CONT_INDEX_PERIOD]),
        "scaler_mean": np.round(models["scaler_mean"], 6).tolist(),
        "scaler_std": np.round(models["scaler_std"], 6).tolist(),
        "n_cells": n_cells, "n_seasons": len(seasons),
        "season_first": seasons[0], "season_last": seasons[-1],
        "unseen": unseen, "global_rate": models["global_rate"],
        "n_pure2": n_pure2, "n_pure3": n_pure3, "n_mixed": n_mixed,
        "season_order": seasons, "per_season": per_season,
        "ranges": ranges, "spot_checks": spot_checks,
        "checks": checks, "db_report": db_report, "all_pass": all_pass,
    })

    if not all_pass:
        logger.error("SQ-5 FAILED — see %s", SUMMARY_FILE)
        return 1
    logger.info("SQ-5 %s complete; all checks PASS. See %s",
                "dry-run" if args.dry_run else "write", SUMMARY_FILE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
