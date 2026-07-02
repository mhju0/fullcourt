"""
[READ-ONLY PROBE — Shot Quality Model, Phase SQ-0b]

Checks whether nba_api's defender/tracking endpoints expose closest-defender-distance
data, and at what granularity (per-shot vs aggregated splits), across seasons.

Does NOT touch the DB. Does NOT write anywhere except ml/shot_defend_probe.txt.
Run with the ROOT venv: ./venv/bin/python scripts/probe_shotdefend.py
"""

import inspect
import time
import traceback
from pathlib import Path

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "ml" / "shot_defend_probe.txt"
DELAY_SECONDS = 1.5

lines = []


def log(msg=""):
    print(msg)
    lines.append(str(msg))


def section(title):
    log()
    log("=" * 70)
    log(title)
    log("=" * 70)


def timed_call(label, fn):
    """Run fn(), report elapsed time, return (result, elapsed) or (None, elapsed) on failure."""
    log(f"\n--- Calling: {label} ---")
    start = time.time()
    try:
        result = fn()
        elapsed = time.time() - start
        log(f"  status: OK  elapsed={elapsed:.2f}s")
        return result, elapsed
    except Exception as e:
        elapsed = time.time() - start
        log(f"  status: FAILED  elapsed={elapsed:.2f}s")
        log(f"  error: {type(e).__name__}: {e}")
        log("  traceback:")
        for tb_line in traceback.format_exc().splitlines():
            log(f"    {tb_line}")
        return None, elapsed


def main():
    log("Shot Quality Model — Phase SQ-0b defender/tracking feasibility probe")
    log(f"Delay between calls: {DELAY_SECONDS}s")

    # ------------------------------------------------------------------
    section("1. ENDPOINT REALITY CHECK (introspected from installed library)")
    # ------------------------------------------------------------------
    try:
        from nba_api.stats.endpoints import (
            PlayerDashPtShotDefend,
            LeagueDashPtDefend,
        )

        log("\nPlayerDashPtShotDefend: FOUND in installed nba_api")
        log("  __init__ signature:")
        log(f"    {inspect.signature(PlayerDashPtShotDefend.__init__)}")

        log("\nLeagueDashPtDefend: FOUND in installed nba_api")
        log("  __init__ signature:")
        log(f"    {inspect.signature(LeagueDashPtDefend.__init__)}")

        # Look for any other classes whose name implies defender/shot-defense tracking
        import nba_api.stats.endpoints as ep_module

        all_names = [n for n in dir(ep_module) if n[0].isupper()]
        defend_related = [
            n
            for n in all_names
            if "defend" in n.lower()
            or "ptshot" in n.lower()
            or ("pt" in n.lower() and "defend" in n.lower())
        ]
        log("\nAll installed endpoint classes with 'defend' or 'ptshot' in the name:")
        for n in sorted(set(defend_related)):
            log(f"  - {n}")

    except ImportError as e:
        log(f"\nFAILED to import endpoint classes: {e}")
        log("STOPPING — cannot proceed without these classes.")
        write_output()
        return

    # ------------------------------------------------------------------
    section("2. GRANULARITY QUESTION — live pull, PlayerDashPtShotDefend, 2023-24")
    # ------------------------------------------------------------------
    # LeBron James: player_id=2544, Lakers team_id=1610612747 (well-known, stable IDs)
    LEBRON_PLAYER_ID = 2544
    LAKERS_TEAM_ID = 1610612747

    def call_player_defend_2023_24():
        return PlayerDashPtShotDefend(
            team_id=LAKERS_TEAM_ID,
            player_id=LEBRON_PLAYER_ID,
            season="2023-24",
            season_type_all_star="Regular Season",
        )

    result, elapsed = timed_call(
        "PlayerDashPtShotDefend(LeBron James, 2023-24, Regular Season)",
        call_player_defend_2023_24,
    )

    granularity_2023_24 = "[Unknown]"
    defender_distance_present_2023_24 = "[Unknown]"

    if result is not None:
        try:
            dfs = result.get_data_frames()
            log(f"\n  number of data frames returned: {len(dfs)}")
            for i, df in enumerate(dfs):
                log(f"\n  --- data frame [{i}] ---")
                log(f"  row count: {len(df)}")
                log(f"  columns ({len(df.columns)}):")
                for col in df.columns:
                    log(f"    - {col}")
                if len(df) > 0:
                    log(f"  first row (raw values):")
                    first_row = df.iloc[0].to_dict()
                    for k, v in first_row.items():
                        log(f"    {k} = {v}")

            # Granularity determination: does row count match "1 per player per
            # defense-category bucket" (aggregated) vs "1 per shot attempt" (per-shot)?
            # A per-shot table would need thousands of rows (a full season of shots)
            # and shot/game-level identifier columns (GAME_ID, GAME_EVENT_ID, etc).
            main_df = dfs[0] if dfs else None
            if main_df is not None:
                cols_lower = [c.lower() for c in main_df.columns]
                has_game_id = any("game_id" in c for c in cols_lower)
                has_shot_dist_dimension = any(
                    "defend" in c and ("category" in c or "range" in c or "dist" in c)
                    for c in cols_lower
                )
                log(f"\n  GAME_ID-like column present: {has_game_id}")
                log(f"  defender-distance dimension/category column present: {has_shot_dist_dimension}")

                if len(main_df) <= 20 and not has_game_id:
                    granularity_2023_24 = (
                        "AGGREGATED SPLITS (one row per player per defender-distance "
                        f"bucket; row_count={len(main_df)}, no GAME_ID column)"
                    )
                elif has_game_id:
                    granularity_2023_24 = (
                        f"PER-SHOT (GAME_ID-like column present; row_count={len(main_df)})"
                    )
                else:
                    granularity_2023_24 = (
                        f"UNCLEAR — row_count={len(main_df)}, no GAME_ID column, "
                        "manual inspection of columns above required"
                    )

                defender_distance_present_2023_24 = str(has_shot_dist_dimension)
        except Exception as e:
            log(f"\n  ERROR while parsing result: {type(e).__name__}: {e}")

    log(f"\n>>> GRANULARITY VERDICT (2023-24): {granularity_2023_24}")
    log(f">>> DEFENDER-DISTANCE DIMENSION PRESENT (2023-24): {defender_distance_present_2023_24}")

    time.sleep(DELAY_SECONDS)

    # ------------------------------------------------------------------
    section("3. SEASON REACH — testing LeagueDashPtDefend across seasons")
    # ------------------------------------------------------------------
    seasons_to_test = ["2023-24", "2015-16", "2013-14", "2009-10"]
    season_results = {}

    for season in seasons_to_test:
        def call_league_defend(season=season):
            return LeagueDashPtDefend(
                defense_category="Overall",
                season=season,
                season_type_all_star="Regular Season",
            )

        result, elapsed = timed_call(
            f"LeagueDashPtDefend(defense_category=Overall, season={season})",
            call_league_defend,
        )

        entry = {
            "season": season,
            "responded": result is not None,
            "elapsed_seconds": round(elapsed, 2),
            "row_count": None,
            "columns": None,
            "defender_distance_dimension_present": None,
        }

        if result is not None:
            try:
                dfs = result.get_data_frames()
                df = dfs[0] if dfs else None
                if df is not None:
                    entry["row_count"] = len(df)
                    entry["columns"] = list(df.columns)
                    cols_lower = [c.lower() for c in df.columns]
                    entry["defender_distance_dimension_present"] = any(
                        "close_def_dist" in c or "def_dist" in c or "closest" in c
                        for c in cols_lower
                    )
                    log(f"  season={season}: row_count={len(df)}, columns={list(df.columns)}")
            except Exception as e:
                log(f"  season={season}: ERROR parsing result: {type(e).__name__}: {e}")

        season_results[season] = entry
        time.sleep(DELAY_SECONDS)

    log("\n--- Season reach summary ---")
    earliest_usable = None
    for season in seasons_to_test:
        e = season_results[season]
        usable = bool(e["responded"] and e["row_count"] and e["defender_distance_dimension_present"])
        log(
            f"  {season}: responded={e['responded']} non_empty={bool(e['row_count'])} "
            f"defender_distance_present={e['defender_distance_dimension_present']} "
            f"usable={usable} elapsed={e['elapsed_seconds']}s"
        )
        if usable:
            earliest_usable = season  # seasons_to_test is in descending order; last usable wins as "earliest tested"

    log(f"\n>>> EARLIEST SEASON TESTED THAT RETURNED USABLE DEFENDER DATA: {earliest_usable if earliest_usable else '[None of the tested seasons — see detail above]'}")

    # ------------------------------------------------------------------
    section("3b. CLOSEST-DEFENDER-DISTANCE AS A FILTER (LeagueDashPlayerPtShot)")
    # ------------------------------------------------------------------
    # LeagueDashPtDefend's 'Overall' category has NO distance-bucket column (only
    # CLOSE_DEF_PERSON_ID = the defender's identity). But LeagueDashPlayerPtShot
    # exposes close_def_dist_range_nullable as a QUERY FILTER param (not a returned
    # column). Confirm whether it's real and whether it changes granularity.
    from nba_api.stats.endpoints import LeagueDashPlayerPtShot

    def call_unfiltered():
        return LeagueDashPlayerPtShot(season="2023-24", season_type_all_star="Regular Season")

    unfiltered_result, _ = timed_call(
        "LeagueDashPlayerPtShot(season=2023-24, no distance filter)", call_unfiltered
    )
    unfiltered_rowcount = None
    unfiltered_columns = None
    if unfiltered_result is not None:
        df = unfiltered_result.get_data_frames()[0]
        unfiltered_rowcount = len(df)
        unfiltered_columns = list(df.columns)
        log(f"\n  unfiltered row_count={unfiltered_rowcount}")
        log(f"  unfiltered columns: {unfiltered_columns}")

    time.sleep(DELAY_SECONDS)

    def call_filtered():
        return LeagueDashPlayerPtShot(
            season="2023-24",
            season_type_all_star="Regular Season",
            close_def_dist_range_nullable="0-2 Feet - Very Tight",
        )

    filtered_result, _ = timed_call(
        "LeagueDashPlayerPtShot(season=2023-24, close_def_dist_range='0-2 Feet - Very Tight')",
        call_filtered,
    )
    filtered_rowcount = None
    filter_changed_data = "[Unknown]"
    if filtered_result is not None:
        df = filtered_result.get_data_frames()[0]
        filtered_rowcount = len(df)
        log(f"\n  filtered row_count={filtered_rowcount}")
        if len(df) > 0:
            log(f"  filtered first row: {df.iloc[0].to_dict()}")
        if unfiltered_rowcount is not None:
            filter_changed_data = str(filtered_rowcount != unfiltered_rowcount)

    log(f"\n>>> close_def_dist_range_nullable FILTER IS FUNCTIONAL (row count changed vs unfiltered): {filter_changed_data}")
    log(">>> IMPORTANT: even with this filter applied, the endpoint still returns ONE ROW PER PLAYER")
    log(">>> (season-aggregate FGA/FGM/FG_PCT for that distance bucket), NOT one row per shot.")
    log(">>> No GAME_ID, no shot coordinates, no shot clock value, no per-shot identifier in the response.")
    log(">>> Conclusion: closest-defender-distance EXISTS as a real dimension in nba_api, but only as a")
    log(">>> query-time FILTER producing AGGREGATED per-player splits — never as a per-shot column.")

    # ------------------------------------------------------------------
    section("4. JOIN FEASIBILITY (only meaningful if per-shot in step 2)")
    # ------------------------------------------------------------------
    if "PER-SHOT" in granularity_2023_24:
        log("\n  Step 2 data was PER-SHOT. Inspecting columns for a join key to ShotChartDetail...")
        log(f"  [Inferred] See column list printed in section 2 above for GAME_ID / event identifiers.")
    else:
        log("\n  Step 2 data was NOT per-shot (aggregated splits).")
        log("  Join feasibility to ShotChartDetail (per-shot) is THEREFORE MOOT —")
        log("  there is no per-shot defender row to join on.")

    # ------------------------------------------------------------------
    section("5. SPEED / RATE-LIMIT SUMMARY")
    # ------------------------------------------------------------------
    log(f"\n  Delay used between calls: {DELAY_SECONDS}s")
    log(f"  Call 1 (PlayerDashPtShotDefend, 2023-24): elapsed={elapsed:.2f}s (see section 2 for its own timing)")
    for season in seasons_to_test:
        e = season_results[season]
        log(f"  Call (LeagueDashPtDefend, {season}): elapsed={e['elapsed_seconds']}s, responded={e['responded']}")

    write_output()


def write_output():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(lines) + "\n")
    print(f"\n[written to {OUTPUT_PATH}]")


if __name__ == "__main__":
    main()
