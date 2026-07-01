"""Build the playoff SERIES SKELETON from per-game playoff rows (Phase 2b-i).

This is the Playoff Predictor's series-grain builder, **skeleton only**. It groups the
already-ingested per-game ``004`` (playoffs/finals) rows in the ``games`` table into
series, derives the structural fields of each series, and idempotently upserts them into
``playoff_series``. It computes **no model features** — ``seed_diff``, ``win_pct_diff``,
``entry_rest_diff`` and ``h2h_diff`` are left NULL here and are the job of a later 2b-ii
feature pass. The upsert is written so a re-run NEVER clobbers those four columns.

See ``docs/PLAYOFF_PREDICTOR_DESIGN.md`` §1 (home-court reference team) and §6.2 (schema).

DATA SCOPE
  * Reads only ``games`` rows with ``game_type IN ('playoffs','finals')`` (the ``004``
    pool). The playoffs/finals sub-tag is a noisy ``month >= 6`` heuristic and is treated
    as a single pool — it is NEVER used to determine round.
  * Excludes ``005`` play-in rows (not series) and season ``'2019-20'`` (the COVID bubble,
    matching the regular-season exclusion in ``src/lib/nba-season.ts``).
  * Tallies wins/winners from FINAL games only (both scores present).

SERIES GROUPING
  A series = (season, unordered {home_team_id, away_team_id}). Two NBA teams meet at most
  once per postseason, so this key is unique.

ROUND is derived STRUCTURALLY per season via a backward walk through series winners
  (Finals = latest-starting series; conf finals = series won by a Finals team; conf semis
  = series won by a conf-final participant; first round = the remainder). Each step
  validates its expected count ([8,4,2,1]); a mismatch flags that season.

WRITE is an idempotent ``ON CONFLICT (external_series_key) DO UPDATE`` that refreshes
  ONLY the skeleton columns — never the four feature columns.

Usage:
  python ml/build_series_dataset.py            # compute, validate, and upsert
  python ml/build_series_dataset.py --dry-run  # compute + validate, write nothing

DATABASE_URL resolution mirrors ``scripts/daily_update.py``: process env, else repo-root
``.env.local``, else ``scripts/.env``. Run from the project root in the venv.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import psycopg2

REPO_ROOT = Path(__file__).resolve().parent.parent

# Season excluded everywhere in the product (COVID Orlando bubble — no real travel/rest).
EXCLUDED_SEASON = "2019-20"
# Expected modern-bracket round sizes: [first round, conf semis, conf finals, Finals].
EXPECTED_ROUND_COUNTS = [8, 4, 2, 1]


def resolve_database_url() -> str:
    """Prefer DATABASE_URL from the process env; else load repo-root .env.local then
    scripts/.env and read again (mirrors scripts/daily_update.resolve_database_url)."""
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    from dotenv import load_dotenv  # lazy: only the local .env fallback needs it

    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        print(
            "ERROR: DATABASE_URL is not set. "
            "Set it in the environment or add it to .env.local / scripts/.env.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def current_season_label(today: date) -> str:
    """NBA season label ("YYYY-YY") containing ``today`` (mirrors nba-season.ts:
    Oct–Dec → that year is the start year, else the previous year)."""
    start = today.year if today.month >= 10 else today.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


@dataclass
class GameRow:
    external_id: str
    date: date
    season: str
    home_team_id: int
    away_team_id: int
    home_score: int | None
    away_score: int | None
    status: str

    @property
    def is_final(self) -> bool:
        return (
            self.status == "final"
            and self.home_score is not None
            and self.away_score is not None
        )

    @property
    def winner_team_id(self) -> int | None:
        if not self.is_final:
            return None
        return self.home_team_id if self.home_score > self.away_score else self.away_team_id


@dataclass
class Series:
    season: str
    home_court_team_id: int
    opponent_team_id: int
    first_game_date: date
    external_series_key: str
    home_court_wins: int = 0
    opponent_wins: int = 0
    # Filled in by per-season round derivation:
    round: int | None = None
    is_best_of_7: bool | None = None
    conference: str | None = None
    series_winner_team_id: int | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def provisional_winner(self) -> int | None:
        """Argmax over current win tallies (the round walk needs winners). None on a tie
        or with no final games yet."""
        if self.home_court_wins > self.opponent_wins:
            return self.home_court_team_id
        if self.opponent_wins > self.home_court_wins:
            return self.opponent_team_id
        return None

    @property
    def leader_wins(self) -> int:
        return max(self.home_court_wins, self.opponent_wins)


def load_teams(conn) -> tuple[dict[int, str], dict[int, str]]:
    """Return (id -> CURRENT abbreviation, id -> conference) from the teams table."""
    abbr: dict[int, str] = {}
    conf: dict[int, str] = {}
    with conn.cursor() as cur:
        cur.execute("SELECT id, abbreviation, conference FROM teams")
        for tid, abbreviation, conference in cur.fetchall():
            abbr[tid] = abbreviation
            conf[tid] = conference
    return abbr, conf


def load_playoff_games(conn) -> list[GameRow]:
    """All 004 (playoffs/finals) game rows in scope, excluding the bubble season."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT external_id, date, season, home_team_id, away_team_id,
                   home_score, away_score, status
            FROM games
            WHERE game_type IN ('playoffs', 'finals')
              AND season <> %s
            """,
            (EXCLUDED_SEASON,),
        )
        return [GameRow(*row) for row in cur.fetchall()]


def build_series(
    games: list[GameRow], team_abbr: dict[int, str]
) -> dict[str, list[Series]]:
    """Group 004 games into series keyed by (season, unordered team-pair) and tally wins.

    Returns season -> list[Series]. home-court = the HOME team of the chronologically
    first game (order by date, then external_id); the other team is the opponent.
    """
    # (season, frozenset{teamA, teamB}) -> list[GameRow]
    groups: dict[tuple[str, frozenset[int]], list[GameRow]] = defaultdict(list)
    for g in games:
        groups[(g.season, frozenset((g.home_team_id, g.away_team_id)))].append(g)

    by_season: dict[str, list[Series]] = defaultdict(list)
    for (season, _pair), group in groups.items():
        group.sort(key=lambda r: (r.date, r.external_id))
        opener = group[0]
        home_court = opener.home_team_id
        opponent = opener.away_team_id

        series = Series(
            season=season,
            home_court_team_id=home_court,
            opponent_team_id=opponent,
            first_game_date=opener.date,
            external_series_key=make_series_key(season, home_court, opponent, team_abbr),
        )
        for g in group:
            winner = g.winner_team_id
            if winner == home_court:
                series.home_court_wins += 1
            elif winner == opponent:
                series.opponent_wins += 1
        by_season[season].append(series)
    return by_season


def make_series_key(
    season: str, team_a: int, team_b: int, team_abbr: dict[int, str]
) -> str:
    """Deterministic, stable key: "{season}_{abbrA}-{abbrB}" with the two CURRENT team
    abbreviations sorted alphabetically (order-independent)."""
    a, b = sorted((team_abbr[team_a], team_abbr[team_b]))
    return f"{season}_{a}-{b}"


def derive_rounds(
    series_list: list[Series], team_conf: dict[int, str]
) -> tuple[list[str], list[str]]:
    """Assign ``round`` (1–4) to each series in a season via a backward bracket walk.
    Returns (fail_reasons, warn_reasons) for the season.

    The bracket is a binary tree: the winner of a round-(r+1) series is one of the two
    round-r winners feeding it. So walking backward from the Finals:

    Step 1 Finals (4)  = the series with the LATEST first-game date; its two teams are the
                          conference champions.
    Steps 3→2 = for each team advancing OUT of round r+1 (i.e. each participant of a
                round-(r+1) series), its round-r series is the LATEST-dated series that
                team WON which is not yet assigned. (A simple "winner ∈ {finalists}" test
                is wrong — a champion won R1, R2 AND R3, so it would over-match.)
    Step 4 First round (1) = the remaining unassigned series.
    Expected counts: R3=2, R2=4, R1=8. A mismatch is recorded as a FAIL (not raised).
    """
    fails: list[str] = []
    warns: list[str] = []
    if not series_list:
        return fails, warns

    by_winner: dict[int, list[Series]] = defaultdict(list)
    for s in series_list:
        w = s.provisional_winner
        if w is not None:
            by_winner[w].append(s)

    assigned: set[int] = set()

    # ── Step 1: Finals = latest-starting series ───────────────────────────────
    finals = max(series_list, key=lambda s: (s.first_game_date, s.external_series_key))
    finals.round = 4
    assigned.add(id(finals))
    c_home = team_conf.get(finals.home_court_team_id)
    c_opp = team_conf.get(finals.opponent_team_id)
    if c_home is not None and c_opp is not None and c_home == c_opp:
        warns.append(
            f"Finals teams share conference '{c_home}' (stale historical conference data)"
        )
    advancing = [finals.home_court_team_id, finals.opponent_team_id]

    # ── Steps 3 → 2: each advancing team's latest unassigned won series ────────
    for r, expected in ((3, 2), (2, 4)):
        round_series: list[Series] = []
        seen: set[int] = set()
        for team in advancing:
            candidates = [s for s in by_winner.get(team, []) if id(s) not in assigned]
            if not candidates:
                continue
            chosen = max(
                candidates, key=lambda s: (s.first_game_date, s.external_series_key)
            )
            if id(chosen) in seen:
                continue
            seen.add(id(chosen))
            round_series.append(chosen)
        if len(round_series) != expected:
            fails.append(f"expected {expected} round-{r} series, found {len(round_series)}")
        next_advancing: list[int] = []
        for s in round_series:
            s.round = r
            assigned.add(id(s))
            next_advancing.append(s.home_court_team_id)
            next_advancing.append(s.opponent_team_id)
        advancing = next_advancing

    # ── Step 4: first round = the remaining unassigned series ─────────────────
    remaining = [s for s in series_list if id(s) not in assigned]
    if len(remaining) != 8:
        fails.append(f"expected 8 round-1 series, found {len(remaining)}")
    for s in remaining:
        s.round = 1

    return fails, warns


def finalize_series(s: Series, team_conf: dict[int, str]) -> None:
    """Set is_best_of_7, conference, and the resolved winner once ``round`` is known.

    is_best_of_7: best-of-5 IFF (round == 1 AND season start year <= 2001) — the first
    round was bo5 through the 2002 playoffs — otherwise best-of-7.
    """
    start_year = int(s.season[:4])
    s.is_best_of_7 = not (s.round == 1 and start_year <= 2001)

    # Conference: shared conference for rounds 1–3; NULL for Finals or on disagreement.
    if s.round == 4:
        s.conference = None
    else:
        c_home = team_conf.get(s.home_court_team_id)
        c_opp = team_conf.get(s.opponent_team_id)
        s.conference = c_home if (c_home is not None and c_home == c_opp) else None

    clinch = 4 if s.is_best_of_7 else 3
    leader = s.provisional_winner
    if leader is not None and s.leader_wins >= clinch:
        s.series_winner_team_id = leader
        if s.leader_wins != clinch:
            s.warnings.append(
                f"winner has {s.leader_wins} wins, expected {clinch} "
                f"(bo{'7' if s.is_best_of_7 else '5'}; likely duplicate games)"
            )
    else:
        # Unresolved: in-progress, or a completed series missing/mis-scored games.
        s.series_winner_team_id = None
        if s.leader_wins > 0:
            s.warnings.append(
                f"{s.external_series_key} unresolved: leader has {s.leader_wins}/{clinch} "
                f"wins (likely missing or mis-scored game)"
            )


@dataclass
class SeasonReport:
    season: str
    n_series: int
    round_counts: list[int]
    n_resolved: int
    status: str  # "OK" | "IN-PROGRESS" | "FAIL"
    flags: list[str]


def assess_season(
    season: str,
    series_list: list[Series],
    round_fails: list[str],
    round_warns: list[str],
    current_season: str,
) -> SeasonReport:
    """Apply the completeness invariant and classify the season."""
    n_series = len(series_list)
    counts = [sum(1 for s in series_list if s.round == r) for r in (1, 2, 3, 4)]
    n_resolved = sum(1 for s in series_list if s.series_winner_team_id is not None)

    win_count_warnings = [w for s in series_list for w in s.warnings]
    flags = list(round_warns) + win_count_warnings

    invariant_ok = (
        n_series == 15
        and counts == EXPECTED_ROUND_COUNTS
        and n_resolved == 15
        and not round_fails
    )

    if invariant_ok:
        status = "OK"
        flags = round_warns + win_count_warnings  # only WARNINGs (or none)
    elif season == current_season:
        status = "IN-PROGRESS"
        flags = ["in-progress"] + round_fails + flags
    else:
        status = "FAIL"
        detail = []
        if n_series != 15:
            detail.append(f"{n_series} series (expected 15)")
        if counts != EXPECTED_ROUND_COUNTS:
            detail.append(f"round counts {counts} (expected {EXPECTED_ROUND_COUNTS})")
        if n_resolved != 15:
            detail.append(f"{n_resolved} resolved (expected 15)")
        flags = detail + round_fails + flags

    return SeasonReport(season, n_series, counts, n_resolved, status, flags)


UPSERT_SQL = """
INSERT INTO playoff_series
    (season, round, conference, home_court_team_id, opponent_team_id,
     is_best_of_7, series_winner_team_id, home_court_wins, opponent_wins,
     external_series_key, computed_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (external_series_key) DO UPDATE SET
    round                 = EXCLUDED.round,
    conference            = EXCLUDED.conference,
    home_court_team_id    = EXCLUDED.home_court_team_id,
    opponent_team_id      = EXCLUDED.opponent_team_id,
    is_best_of_7          = EXCLUDED.is_best_of_7,
    series_winner_team_id = EXCLUDED.series_winner_team_id,
    home_court_wins       = EXCLUDED.home_court_wins,
    opponent_wins         = EXCLUDED.opponent_wins,
    computed_at           = NOW()
-- NOTE: seed_diff, win_pct_diff, entry_rest_diff, h2h_diff are intentionally NOT in the
-- column list or the DO UPDATE SET, so a re-run never clobbers a later feature pass.
""".strip()


def upsert_series(conn, all_series: list[Series]) -> int:
    n = 0
    with conn.cursor() as cur:
        for s in all_series:
            cur.execute(
                UPSERT_SQL,
                (
                    s.season,
                    s.round,
                    s.conference,
                    s.home_court_team_id,
                    s.opponent_team_id,
                    s.is_best_of_7,
                    s.series_winner_team_id,
                    s.home_court_wins,
                    s.opponent_wins,
                    s.external_series_key,
                ),
            )
            n += cur.rowcount
    return n


def print_report(reports: list[SeasonReport], total_series: int, wrote: int | None) -> None:
    print("\n══ Series skeleton validation report ════════════════════════════════")
    print(
        f"{'season':>8} | {'#ser':>4} | {'[r1 r2 r3 r4]':>13} | "
        f"{'#res':>4} | status      | flags"
    )
    print("-" * 100)
    for r in reports:
        counts = "[{} {} {} {}]".format(*r.round_counts)
        flag_str = "; ".join(r.flags) if r.flags else ""
        print(
            f"{r.season:>8} | {r.n_series:>4} | {counts:>13} | "
            f"{r.n_resolved:>4} | {r.status:<11} | {flag_str}"
        )

    fail_seasons = [r.season for r in reports if r.status == "FAIL"]
    warn_seasons = [r.season for r in reports if r.status != "FAIL" and r.flags]
    inprogress = [r.season for r in reports if r.status == "IN-PROGRESS"]

    print("-" * 100)
    if wrote is None:
        print(f"Total series computed : {total_series}  (DRY-RUN — nothing written)")
    else:
        print(f"Total series written  : {wrote}  (of {total_series} computed)")
    print(f"IN-PROGRESS seasons   : {inprogress or '—'}")
    print(f"WARNING seasons       : {warn_seasons or '—'}")
    print(f"FAIL seasons          : {fail_seasons or '—'}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the playoff series skeleton from 004 per-game rows."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute + validate and print the report, but perform NO database writes.",
    )
    args = parser.parse_args()

    database_url = resolve_database_url()
    current_season = current_season_label(date.today())

    conn = psycopg2.connect(database_url)
    try:
        team_abbr, team_conf = load_teams(conn)
        games = load_playoff_games(conn)

        print(
            f"Loaded {len(team_abbr)} teams and {len(games)} playoff/finals games "
            f"(004 pool, excluding {EXCLUDED_SEASON}). Current season: {current_season}."
        )

        by_season = build_series(games, team_abbr)

        reports: list[SeasonReport] = []
        all_series: list[Series] = []
        for season in sorted(by_season):
            series_list = by_season[season]
            round_fails, round_warns = derive_rounds(series_list, team_conf)
            for s in series_list:
                finalize_series(s, team_conf)
            reports.append(
                assess_season(
                    season, series_list, round_fails, round_warns, current_season
                )
            )
            all_series.extend(series_list)

        wrote: int | None = None
        if not args.dry_run:
            with conn:
                wrote = upsert_series(conn, all_series)

        print_report(reports, len(all_series), wrote)

        fail_seasons = [r.season for r in reports if r.status == "FAIL"]
        if fail_seasons:
            print(
                f"\nFAILED: {len(fail_seasons)} completed season(s) violate the "
                f"15-series [8,4,2,1]/all-resolved invariant.",
                file=sys.stderr,
            )
            sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
