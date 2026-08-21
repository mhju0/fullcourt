"""Write `src/data/referee-legends.json` — the folklore findings, in the page's own shape.

The page that renders this is about the beliefs basketball audiences already hold: that a
particular official has it in for a particular star, that referees even calls up, that stars get
sat down early. Each is measured in `ml/REFEREE_PLAYER_REPORT.md`; this script lifts the figures
into one artifact so **no number is ever typed into a sentence**, per the pinning rule in
`CLAUDE.md`.

The load-bearing editorial decision, encoded here rather than left to the copy: every extreme pair
ships **with the count chance produces at the same bar**. `noiseFloor` is not a footnote to the
`legend` block, it is the other half of it, and the page renders them together.

Reads the artifacts written by:
    ml/referee_axes.py · ml/referee_player_axes.py · ml/referee_exploratory_axes.py
    ml/referee_makeup_diagnostic.py · ml/referee_playoff_claims.py · ml/referee_playoff_confound.py

Usage:
    ml/.venv/bin/python ml/build_referee_legends.py
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

DATA_DIR = Path("ml/data/referee")
OUT = Path("src/data/referee-legends.json")

# The pair the page opens on, and the official whose other pairs make the argument.
LEGEND = ("Scott Foster", "Chris Paul")
# Found by scanning, published as the demonstration that scanning finds things. Never as a claim.
UNNAMED = ("Tony Brothers", "Marcus Smart")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def load(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text())


def main() -> None:
    axes = load("axes_results.json")
    player = load("player_axes_results.json")
    expl = load("exploratory_results.json")
    mk = load("makeup_diagnostic.json")
    po = load("playoff_claims.json")
    conf = load("playoff_confound.json")

    sweep = conf["sweep_opponent_aware"]
    # `split_season` is the first OUT-of-sample season, so the claim was already circulating the
    # season before it. Derived from the pre-registered split rather than written down twice.
    seasons = axes["seasons"]
    split = player["d2_oos"]["split_season"]
    famous_by = seasons[max(0, seasons.index(split) - 1)]
    by_pair = {(c["official"], c["player"]): c for c in conf["claims"]}
    ranked = {(r["official"], r["player"]): r for r in sweep["ranked"]}
    po_claims = {(c["official"], c["player"]): c for c in po["claims"]}

    legend_conf = by_pair[LEGEND]
    # The noise floor (1/N) is the expected minimum of the TWO-SIDED sweep, so the legend must be
    # quoted two-sided too. Using the one-sided p here compared a 0.0006 against a 0.00145 floor
    # and made the pair look twice as extreme as it is. Caught by referee-legends.test.ts.
    legend_rank = ranked[LEGEND]
    legend_po = po_claims[LEGEND]

    # Every other pair of the legend's official that reached the published list, in the direction
    # that makes the point: the same man, the same seasons, teams winning.
    same_official = [
        {
            "player": r["player"],
            "wins": r["wins"],
            "games": r["games"],
            "expectedWins": round(r["expected"], 2),
            "p": round(r["p_two_sided"], 4),
            "playerWon": bool(r["wins"] > r["expected"]),
        }
        for (o, _p), r in ranked.items()
        if o == LEGEND[0] and (o, _p) != LEGEND
    ]
    same_official.sort(key=lambda r: -(r["wins"] / r["games"]))

    unnamed = ranked[UNNAMED]

    d3 = player["d3"]
    d3b = player["d3_base"]
    star = {
        "starGames": d3b["star_games"],
        "twoFoulsFirstQuarterRate": round(d3b["early2_rate"], 4),
        "atHome": round(d3b["early2_home"], 4),
        "onTheRoad": round(d3b["early2_road"], 4),
        "minutesLost": round(d3b["minutes_when_early2"] - d3b["minutes_when_not"], 2),
        "spreadRatio": round(d3["star_early2"]["global"]["spread_ratio"], 2),
        "p": round(d3["star_early2"]["global"]["p_value"], 4),
        "officialsTested": d3["star_early2"]["global"]["n_officials"],
    }

    f = expl["axis_f"]
    makeup = {
        "observedSwitchRate": round(f["observed_switch_rate"], 4),
        "shuffledNull": round(f["null_switch_rate"], 4),
        "excessT": round(f["excess_t"], 1),
        "afterDefensiveFoul": round(mk["by_first_foul"]["defensive"]["observed_switch"], 4),
        "afterDefensiveT": round(mk["by_first_foul"]["defensive"]["t"], 1),
        "afterOffensiveFoul": round(mk["by_first_foul"]["offensive"]["observed_switch"], 4),
        "afterOffensiveT": round(mk["by_first_foul"]["offensive"]["t"], 1),
        "afterOffensiveWithin15s": round(mk["offensive_by_gap"]["0-15s"]["observed_switch"], 4),
        "pairs": mk["n_pairs"],
    }

    volume = axes["volume"]["vol_total"]["global"]
    vol_means = [v["mean"] for v in axes["volume"]["vol_total"]["officials"].values()]

    facts = {
        "source": "ESPN play-by-play and box scores",
        "generated": "2026-08-21",
        "preRegistration": "ml/referee_player_preregistration.md",
        "report": "ml/REFEREE_PLAYER_REPORT.md",
        "firstSeason": axes["seasons"][0],
        "lastSeason": axes["seasons"][-1],
        "regularSeasonGames": axes["n_games"],
        "playoffGames": po["playoff_games"],

        # --- the whistle really does differ, which is the one thing that survives
        "whistleVolume": {
            "leagueFoulsPerGame": round(volume["league_mean"], 2),
            "lowest": round(min(vol_means), 2),
            "highest": round(max(vol_means), 2),
            "spreadRatio": round(volume["spread_ratio"], 2),
            "officialsTested": volume["n_officials"],
        },

        # --- the legend
        "legend": {
            "official": LEGEND[0],
            "player": LEGEND[1],
            "wins": legend_conf["wins"],
            "losses": legend_conf["losses"],
            "expectedWins": legend_conf["expected_wins_opponent_aware"],
            "p": round(legend_rank["p_two_sided"], 4),
            "pOneSided": legend_conf["p_at_or_below"],
            "opponentStrengthWith": legend_conf["mean_opponent_strength_with"],
            "opponentStrengthWithout": legend_conf["mean_opponent_strength_without"],
            "rank": sweep["foster_paul_rank"],
            "beforeClaimWasFamous": {
                "wins": legend_po["playoffs_in_sample"].get("wins", 0),
                "losses": legend_po["playoffs_in_sample"].get("losses", 0),
                "testable": legend_po["playoffs_in_sample"].get("testable", False),
            },
            "afterClaimWasFamous": {
                "wins": legend_po["playoffs_out_of_sample"].get("wins", 0),
                "losses": legend_po["playoffs_out_of_sample"].get("losses", 0),
                "testable": legend_po["playoffs_out_of_sample"].get("testable", False),
            },
            "minGamesToJudge": po["min_playoff_pair_games"],
            # The season by which the claim was in public circulation, which is what makes
            # everything after it an out-of-sample test. Pinned, never derived from firstSeason.
            "famousBySeason": famous_by,
        },
        "sameOfficialOtherPairs": same_official,
        "pairNobodyNamed": {
            "official": UNNAMED[0],
            "player": UNNAMED[1],
            "wins": unnamed["wins"],
            "games": unnamed["games"],
            "expectedWins": round(unnamed["expected"], 2),
            "p": round(unnamed["p_two_sided"], 4),
        },

        # --- the other half of every figure above
        "noiseFloor": {
            "pairsTested": sweep["n_pairs"],
            "minSharedGames": sweep["min_games"],
            "mostExtremePFromNoise": sweep["expected_min_p"],
            "clearedPoint01": sweep["n_p_under_01"],
            "expectedPoint01": sweep["expected_under_01"],
            "clearedPoint05": sweep["n_p_under_05"],
            "expectedPoint05": sweep["expected_under_05"],
        },

        # --- the four claims that were named in advance and came back empty
        "preRegisteredClaims": [
            {
                "official": c["official"],
                "player": c["player"],
                "wins": c["wins"],
                "losses": c["losses"],
                "expectedWins": c["expected_wins_opponent_aware"],
                # One-sided, and named so nothing compares it to the two-sided noise floor.
                "pOneSided": c["p_at_or_below"],
            }
            for c in conf["claims"]
            if (c["official"], c["player"]) != LEGEND
        ],

        "makeupCalls": makeup,
        "starFoulTrouble": star,
    }

    OUT.write_text(json.dumps(facts, indent=2) + "\n")
    log.info("wrote %s", OUT)
    log.info("  legend %s x %s: %d-%d, rank %d of %d",
             LEGEND[0], LEGEND[1], facts["legend"]["wins"], facts["legend"]["losses"],
             facts["legend"]["rank"], facts["noiseFloor"]["pairsTested"])
    log.info("  same-official pairs carried: %d", len(same_official))


if __name__ == "__main__":
    main()
