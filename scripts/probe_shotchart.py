"""
[Shot Quality Model, Phase SQ-0] Read-only feasibility probe for nba_api shot-chart data.

Does NOT touch the database. Does NOT write anywhere except ml/shot_data_probe.txt.
Makes small, polite (>=1s delay) calls to the live NBA stats API via nba_api and
records exactly what the installed library actually returns -- no assumptions.

Run with the ROOT data-pipeline venv:
    ./venv/bin/python scripts/probe_shotchart.py
"""

import inspect
import sys
import time
from pathlib import Path

DELAY_SECONDS = 1.5
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "ml" / "shot_data_probe.txt"

lines = []


def log(msg=""):
    print(msg)
    lines.append(msg)


def fail(msg):
    log(f"FATAL: {msg}")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(lines) + "\n")
    sys.exit(1)


def main():
    log("=" * 70)
    log("Shot Quality Model - Phase SQ-0 feasibility probe")
    log("Read-only. No DB access. Live nba_api calls only.")
    log("=" * 70)
    log()

    # ------------------------------------------------------------------
    # 1. Endpoint reality check
    # ------------------------------------------------------------------
    log("## 1. Endpoint reality check")
    try:
        from nba_api.stats.endpoints import shotchartdetail
        import nba_api
    except Exception as e:
        fail(f"could not import nba_api / shotchartdetail: {e!r}")

    log(f"nba_api module path: {nba_api.__file__}")

    sig = inspect.signature(shotchartdetail.ShotChartDetail.__init__)
    log("\nShotChartDetail.__init__ ACTUAL parameters (name = default):")
    for name, p in sig.parameters.items():
        if name == "self":
            continue
        log(f"  {name} = {p.default!r}")

    log("\nOther installed nba_api endpoint classes with shot/tracking/defend/hustle in the name:")
    import nba_api.stats.endpoints as ep
    names = sorted(
        n for n in dir(ep)
        if not n.startswith("_")
        and n[0].isupper()
        and any(k in n.lower() for k in ["shot", "defend", "track", "hustle"])
    )
    for n in names:
        log(f"  {n}")
    log()

    # ------------------------------------------------------------------
    # 2. Small live pulls
    # ------------------------------------------------------------------
    log("## 2. Small live pulls")

    # Well-known player: LeBron James, player_id=2544
    player_id = 2544
    player_name = "LeBron James"
    season = "2023-24"

    log(f"\nPulling player-season shot chart: {player_name} ({player_id}), season={season}, "
        f"season_type='Regular Season', context_measure_simple='FGA'")
    t0 = time.time()
    try:
        resp = shotchartdetail.ShotChartDetail(
            team_id=0,
            player_id=player_id,
            season_nullable=season,
            season_type_all_star="Regular Season",
            context_measure_simple="FGA",
        )
    except Exception as e:
        fail(f"ShotChartDetail call (player-season) raised: {e!r}")
    t1 = time.time()
    call1_secs = t1 - t0
    log(f"Call duration: {call1_secs:.2f}s")

    try:
        df_player = resp.get_data_frames()[0]
    except Exception as e:
        fail(f"could not extract data frame from player-season response: {e!r}")

    log(f"Player-season row count: {len(df_player)}")
    log(f"Player-season columns ({len(df_player.columns)}): {list(df_player.columns)}")
    if len(df_player) == 0:
        fail("player-season shot chart returned 0 rows -- cannot confirm shot data access")

    log(f"\nSleeping {DELAY_SECONDS}s before next call...")
    time.sleep(DELAY_SECONDS)

    # Pick one GAME_ID from the returned frame, and the team on that game
    sample_game_id = str(df_player.iloc[0]["GAME_ID"])
    sample_team_id = int(df_player.iloc[0]["TEAM_ID"])
    log(f"\nSampled GAME_ID={sample_game_id}, TEAM_ID={sample_team_id} from player-season frame")

    log(f"\nPulling single-game team shot chart: team_id={sample_team_id}, "
        f"game_id_nullable={sample_game_id}, player_id=0")
    t0 = time.time()
    try:
        resp2 = shotchartdetail.ShotChartDetail(
            team_id=sample_team_id,
            player_id=0,
            game_id_nullable=sample_game_id,
            season_nullable=season,
            season_type_all_star="Regular Season",
            context_measure_simple="FGA",
        )
    except Exception as e:
        fail(f"ShotChartDetail call (single-game) raised: {e!r}")
    t1 = time.time()
    call2_secs = t1 - t0
    log(f"Call duration: {call2_secs:.2f}s")

    try:
        df_game = resp2.get_data_frames()[0]
    except Exception as e:
        fail(f"could not extract data frame from single-game response: {e!r}")

    log(f"Single-game row count: {len(df_game)}")
    log(f"Single-game columns ({len(df_game.columns)}): {list(df_game.columns)}")
    if len(df_game) == 0:
        fail("single-game shot chart returned 0 rows -- cannot confirm game-level access")

    log(f"\nSleeping {DELAY_SECONDS}s before next call...")
    time.sleep(DELAY_SECONDS)

    # ------------------------------------------------------------------
    # 3. Field inventory
    # ------------------------------------------------------------------
    log("\n## 3. Field inventory (from REAL returned columns, player-season pull)")
    cols = set(df_player.columns)

    def present(*candidates):
        hits = [c for c in candidates if c in cols]
        return hits if hits else None

    checks = [
        ("shot location coordinates", ("LOC_X", "LOC_Y")),
        ("shot distance", ("SHOT_DISTANCE",)),
        ("shot type / action type / zone",
         ("SHOT_TYPE", "ACTION_TYPE", "SHOT_ZONE_BASIC", "SHOT_ZONE_AREA", "SHOT_ZONE_RANGE")),
        ("made-vs-missed flag", ("SHOT_MADE_FLAG", "EVENT_TYPE")),
        ("defender distance (closest-defender)",
         ("CLOSE_DEF_DIST", "CLOSEST_DEFENDER", "CLOSEST_DEFENDER_PLAYER_ID")),
        ("shot clock", ("SHOT_CLOCK",)),
    ]
    for label, candidates in checks:
        hit = present(*candidates)
        status = f"PRESENT ({hit})" if hit else "ABSENT"
        log(f"  {label}: {status}")

    if "LOC_X" in cols and "LOC_Y" in cols:
        x_min, x_max = df_player["LOC_X"].min(), df_player["LOC_X"].max()
        y_min, y_max = df_player["LOC_Y"].min(), df_player["LOC_Y"].max()
        log(f"\n  LOC_X range in sample: [{x_min}, {x_max}]")
        log(f"  LOC_Y range in sample: [{y_min}, {y_max}]")
        log("  (nba_api convention: units are 1/10 foot, origin at hoop -- "
            "verify against SHOT_DISTANCE arithmetic below if present)")
        if "SHOT_DISTANCE" in cols:
            import math
            row = df_player.iloc[0]
            computed = math.hypot(row["LOC_X"], row["LOC_Y"]) / 10.0
            log(f"  Sanity check row0: LOC_X={row['LOC_X']}, LOC_Y={row['LOC_Y']}, "
                f"SHOT_DISTANCE={row['SHOT_DISTANCE']}, "
                f"hypot(LOC_X,LOC_Y)/10={computed:.2f}")

    log("\n  [Inferred] If defender distance / shot clock are ABSENT above, that data would "
        "require a separate tracking endpoint (e.g. PlayerDashPtShotDefend / "
        "LeagueDashPtDefend), which was NOT called in this probe.")

    # ------------------------------------------------------------------
    # 4. Scale sense
    # ------------------------------------------------------------------
    log("\n## 4. Scale sense")
    log(f"\nSleeping {DELAY_SECONDS}s before next call...")
    time.sleep(DELAY_SECONDS)

    # Full team-season for the sampled team, most recent season
    log(f"\nPulling FULL team-season shot chart: team_id={sample_team_id}, season={season}, "
        f"player_id=0 (all players on team)")
    t0 = time.time()
    try:
        resp3 = shotchartdetail.ShotChartDetail(
            team_id=sample_team_id,
            player_id=0,
            season_nullable=season,
            season_type_all_star="Regular Season",
            context_measure_simple="FGA",
        )
    except Exception as e:
        fail(f"ShotChartDetail call (team-season) raised: {e!r}")
    t1 = time.time()
    call3_secs = t1 - t0
    log(f"Call duration: {call3_secs:.2f}s")

    try:
        df_team_season = resp3.get_data_frames()[0]
    except Exception as e:
        fail(f"could not extract data frame from team-season response: {e!r}")

    team_season_rows = len(df_team_season)
    log(f"Team-season row count (one team, {season}, regular season): {team_season_rows}")

    if team_season_rows > 0:
        per_season_league_est = team_season_rows * 30
        total_40_season_est = per_season_league_est * 40
        log(f"\nArithmetic:")
        log(f"  one team, one season = {team_season_rows} shots")
        log(f"  x 30 teams           = {per_season_league_est} shots/season (league-wide estimate)")
        log(f"  x ~40 seasons        = {total_40_season_est} shots (rough ~40-season total estimate)")
    else:
        log("  team_season_rows == 0, cannot estimate scale")

    # ------------------------------------------------------------------
    # 5. Season availability (backward reach)
    # ------------------------------------------------------------------
    log("\n## 5. Season availability (backward reach)")
    test_seasons = ["2023-24", "2013-14", "2005-06", "1996-97", "1990-91"]
    season_results = []
    for i, s in enumerate(test_seasons):
        if i > 0:
            log(f"\nSleeping {DELAY_SECONDS}s before next call...")
            time.sleep(DELAY_SECONDS)
        log(f"\nTesting season={s} (team_id={sample_team_id}, player_id=0, context_measure_simple='FGA')")
        t0 = time.time()
        try:
            resp_s = shotchartdetail.ShotChartDetail(
                team_id=sample_team_id,
                player_id=0,
                season_nullable=s,
                season_type_all_star="Regular Season",
                context_measure_simple="FGA",
            )
            df_s = resp_s.get_data_frames()[0]
            responded = True
            row_count = len(df_s)
            has_loc = row_count > 0 and "LOC_X" in df_s.columns and "LOC_Y" in df_s.columns
            has_nonzero_loc = has_loc and not (df_s["LOC_X"] == 0).all()
        except Exception as e:
            responded = False
            row_count = None
            has_loc = False
            has_nonzero_loc = False
            log(f"  ERROR calling season={s}: {e!r}")
        t1 = time.time()
        dur = t1 - t0
        log(f"  responded={responded}, duration={dur:.2f}s, row_count={row_count}, "
            f"has_LOC_columns={has_loc}, has_nonzero_LOC_values={has_nonzero_loc}")
        season_results.append((s, responded, row_count, has_loc, has_nonzero_loc, dur))

    log("\nSeason availability summary:")
    earliest_usable = None
    for s, responded, row_count, has_loc, has_nonzero_loc, dur in season_results:
        usable = bool(responded and row_count and row_count > 0 and has_nonzero_loc)
        log(f"  {s}: responded={responded} non_empty={bool(row_count and row_count > 0)} "
            f"has_LOC_X_LOC_Y={has_loc} nonzero_coords={has_nonzero_loc} usable={usable}")
        if usable:
            earliest_usable = s  # test_seasons is newest->oldest, last usable wins as "earliest"
    log(f"\nEarliest season in this test set with usable coordinate data: {earliest_usable}")

    # ------------------------------------------------------------------
    # 6. Rate-limit / speed sense
    # ------------------------------------------------------------------
    log("\n## 6. Rate-limit / speed sense")
    log(f"Delay used between calls: {DELAY_SECONDS}s")
    log(f"Call 1 (player-season, {season}): {call1_secs:.2f}s")
    log(f"Call 2 (single-game): {call2_secs:.2f}s")
    log(f"Call 3 (team-season, {season}): {call3_secs:.2f}s")
    for s, responded, row_count, has_loc, has_nonzero_loc, dur in season_results:
        log(f"Call (season availability, {s}): {dur:.2f}s")
    all_durs = [call1_secs, call2_secs, call3_secs] + [d for *_, d in season_results]
    avg_dur = sum(all_durs) / len(all_durs)
    log(f"\nAverage call duration across all {len(all_durs)} calls: {avg_dur:.2f}s")
    log("No timeout/throttle errors encountered in this probe (all calls above either "
        "succeeded or their error is logged inline).")
    log(f"\n[Inferred] At ~{avg_dur:.1f}s/call with a >=1s polite delay, pulling one call per "
        f"team-season across ~30 teams x ~40 seasons = ~1200 calls would take roughly "
        f"1200 x (~{avg_dur:.1f}+{DELAY_SECONDS})s ~= {1200 * (avg_dur + DELAY_SECONDS) / 3600:.1f} hours "
        "of wall-clock time (order of magnitude only; real pulls would need per-player or "
        "per-game granularity in earlier eras and retry/backoff handling, which would push this higher).")

    log("\n" + "=" * 70)
    log("Probe complete.")
    log("=" * 70)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(lines) + "\n")
    print(f"\nReport written to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
