"""Compute the four playoff SERIES FEATURES (Phase 2b-ii).

This is the feature pass that follows the Phase 2b-i skeleton builder
(``ml/build_series_dataset.py``). It reads the already-built ``playoff_series`` rows plus
the per-game ``games`` table, derives the four model features for each series, and
idempotently writes them back via an UPDATE that touches **only** the four feature
columns. It never changes the skeleton columns, never renames the rest-advantage metric,
and never imports ``src/lib/fatigue.ts``.

See ``docs/PLAYOFF_PREDICTOR_DESIGN.md`` §1 (home-court reference team) and §3 (features).

────────────────────────────────────────────────────────────────────────────────────────
LABEL / SIGN CONVENTION
  The skeleton stores each series oriented around the HOME-COURT team (the home team of
  the chronologically first 004 game). The predicted label is ``y = 1 if the home-court
  team wins`` (design §1). Every feature here is oriented so that **positive = advantage to
  the home-court (reference) team**, keeping all four coefficients interpretable against a
  single reference team.

FEATURES (all differentials; each = home-court value − opponent value, except seed which is
opponent − home-court so that "positive = home-court is the better seed"):

  win_pct_diff   = homeCourtRegSeasonWinPct − opponentRegSeasonWinPct           (design §3.3)
      Reg-season Win% = wins / games_played from games(game_type='regular', final) that
      season. Positive ⇒ home-court had the better record. Range [-1, 1].

  h2h_diff       = homeCourtH2HWins − opponentH2HWins                            (design §3.5)
      Over the two teams' REGULAR-season meetings that season. Positive ⇒ home-court won
      the season series. Small integer (often 0).

  entry_rest_diff = homeCourtDaysOff − opponentDaysOff                           (design §3.1)
      DaysOff = (series Game-1 date) − (date of that team's most recent prior FINAL game
      that season, ANY game_type). This reuses the SEMANTICS of fetchRecentGamesForTeam
      (src/lib/fatigue-recent-games.ts: status='final', date < gameDate, NO game_type
      filter) — re-implemented here, NOT importing fatigue.ts. Because game_type is not
      filtered, a first-round opener's "previous game" correctly reaches back into the
      regular season (or the team's last play_in game); a later round's reaches the prior
      series clinch. This is the raw-days HEADLINE feature (the optional calculateFatigue
      variant in §3.1 is NOT one of the four columns and is out of scope). Positive ⇒
      home-court entered more rested (rust-vs-rest). Small integer days.

  seed_diff      = opponentSeed − homeCourtSeed                                  (design §3.2)
      Official playoff seeds are NOT stored in the DB (design §3.2, §7). They are DERIVED
      here as a standings PROXY: for each season, conference membership is derived
      STRUCTURALLY (union-find over rounds 1-3 series; round 4 excluded so the two
      conferences do not merge), then the 8 teams in each conference are ranked by
      reg-season Win% desc → proxy seeds 1..8 (1 = best). Positive ⇒ home-court is the
      better (lower-numbered) seed. Integer.
      KNOWN PROXY LIMITATIONS (reported, not hidden): a pure-Win% rank can disagree with
      the OFFICIAL seed in (i) the division-winner guaranteed-seeding era (pre-2016) and
      (ii) the play-in 7/8 ordering era (2020-21+). The SET of 8 teams is always correct;
      only the intra-conference ordering can drift a line or two. seed_diff lives in a
      single function so a future authoritative-seed ingest can replace it.

IDEMPOTENCY / ISOLATION
  * The ONLY write is: UPDATE playoff_series SET seed_diff, win_pct_diff, entry_rest_diff,
    h2h_diff WHERE external_series_key = %s. No other table, column, INSERT, DELETE or DDL.
  * Re-running recomputes the same values (deterministic) and overwrites in place — safe.
  * The 002/004/005 game rows and every skeleton column are read-only here.

Usage:
  python ml/compute_series_features.py                     # compute + write (all 600)
  python ml/compute_series_features.py --dry-run           # compute + validate, no writes
  python ml/compute_series_features.py --report-file PATH  # also write full report to PATH

DATABASE_URL resolution mirrors ml/build_series_dataset.py. Run from the project root in
the venv.
"""

from __future__ import annotations

import argparse
import functools
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import psycopg2

REPO_ROOT = Path(__file__).resolve().parent.parent

# Season excluded everywhere in the product (COVID Orlando bubble). No 2019-20 series exist
# in playoff_series, but we keep the constant for parity with the skeleton builder.
EXCLUDED_SEASON = "2019-20"


def resolve_database_url() -> str:
    """Prefer DATABASE_URL from the process env; else load repo-root .env.local then
    scripts/.env and read again (mirrors ml/build_series_dataset.resolve_database_url)."""
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


# ─── Data classes ──────────────────────────────────────────────────────────────────────


@dataclass
class SeriesRow:
    """A skeleton row from playoff_series (read-only; feature columns filled in by us)."""

    series_id: int
    season: str
    round: int
    home_court_team_id: int
    opponent_team_id: int
    external_series_key: str
    # Computed features (None = could not compute; reason recorded in `notes`):
    seed_diff: int | None = None
    win_pct_diff: float | None = None
    entry_rest_diff: int | None = None
    h2h_diff: int | None = None
    notes: list[str] = field(default_factory=list)


# ─── Loaders (all SELECT-only) ───────────────────────────────────────────────────────────


def load_teams(conn) -> dict[int, str]:
    """id -> current abbreviation (for readable reports only)."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, abbreviation FROM teams")
        return {tid: abbr for tid, abbr in cur.fetchall()}


def load_series(conn) -> list[SeriesRow]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, season, round, home_court_team_id, opponent_team_id,
                   external_series_key
            FROM playoff_series
            ORDER BY season, round, external_series_key
            """
        )
        return [SeriesRow(*row) for row in cur.fetchall()]


def load_regular_records(
    conn,
) -> tuple[dict[tuple[str, int], tuple[int, int]], dict[tuple[str, int, int], tuple[int, int]]]:
    """Return regular-season aggregates from final regular games.

    * team_record[(season, team_id)] = (wins, games_played)
    * h2h[(season, teamA, teamB)] with teamA < teamB = (winsA, winsB)
    """
    team_record: dict[tuple[str, int], list[int]] = defaultdict(lambda: [0, 0])
    h2h: dict[tuple[str, int, int], list[int]] = defaultdict(lambda: [0, 0])

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT season, home_team_id, away_team_id, home_score, away_score
            FROM games
            WHERE game_type = 'regular'
              AND status = 'final'
              AND home_score IS NOT NULL
              AND away_score IS NOT NULL
            """
        )
        for season, home_id, away_id, hs, as_ in cur.fetchall():
            home_won = hs > as_
            # per-team record
            team_record[(season, home_id)][1] += 1
            team_record[(season, away_id)][1] += 1
            if home_won:
                team_record[(season, home_id)][0] += 1
            else:
                team_record[(season, away_id)][0] += 1
            # head-to-head (ordered key so A<B is stable)
            a, b = (home_id, away_id) if home_id < away_id else (away_id, home_id)
            winner = home_id if home_won else away_id
            if winner == a:
                h2h[(season, a, b)][0] += 1
            else:
                h2h[(season, a, b)][1] += 1

    return (
        {k: (v[0], v[1]) for k, v in team_record.items()},
        {k: (v[0], v[1]) for k, v in h2h.items()},
    )


def load_final_game_dates(conn) -> dict[tuple[str, int], list[date]]:
    """(season, team_id) -> sorted list of dates for ALL final games (any game_type).

    Used for entry-rest previous-game lookup. No game_type filter, mirroring
    fetchRecentGamesForTeam, so a first-round opener reaches into the regular season /
    play-in and a later round reaches the prior-series clinch.
    """
    dates: dict[tuple[str, int], list[date]] = defaultdict(list)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT season, date, home_team_id, away_team_id
            FROM games
            WHERE status = 'final'
              AND home_score IS NOT NULL
              AND away_score IS NOT NULL
            """
        )
        for season, d, home_id, away_id in cur.fetchall():
            dates[(season, home_id)].append(d)
            dates[(season, away_id)].append(d)
    for key in dates:
        dates[key].sort()
    return dates


def load_series_game1(conn) -> dict[tuple[str, frozenset[int]], date]:
    """(season, {teamA,teamB}) -> Game-1 date = earliest 004 game of the pair, ordered by
    (date, external_id) — identical to the skeleton's opener rule."""
    best: dict[tuple[str, frozenset[int]], tuple[date, str]] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT season, date, external_id, home_team_id, away_team_id
            FROM games
            WHERE game_type IN ('playoffs', 'finals')
              AND status = 'final'
              AND home_score IS NOT NULL
              AND away_score IS NOT NULL
            """
        )
        for season, d, ext, home_id, away_id in cur.fetchall():
            key = (season, frozenset((home_id, away_id)))
            cand = (d, ext)
            cur_best = best.get(key)
            if cur_best is None or cand < cur_best:
                best[key] = cand
    return {k: v[0] for k, v in best.items()}


# ─── Feature helpers ─────────────────────────────────────────────────────────────────────


def win_pct(team_record: dict[tuple[str, int], tuple[int, int]], season: str, team: int) -> float | None:
    rec = team_record.get((season, team))
    if not rec or rec[1] == 0:
        return None
    wins, played = rec
    return wins / played


def h2h_wins(
    h2h: dict[tuple[str, int, int], tuple[int, int]], season: str, team: int, other: int
) -> int:
    """Regular-season wins by `team` over `other` that season (0 if they never met)."""
    a, b = (team, other) if team < other else (other, team)
    rec = h2h.get((season, a, b))
    if not rec:
        return 0
    winsA, winsB = rec
    return winsA if team == a else winsB


def previous_game_days_off(
    game_dates: dict[tuple[str, int], list[date]], season: str, team: int, game1: date
) -> int | None:
    """DaysOff = game1 − (most recent final game that season strictly before game1)."""
    lst = game_dates.get((season, team))
    if not lst:
        return None
    prev = None
    for d in lst:  # sorted ascending
        if d < game1:
            prev = d
        else:
            break
    if prev is None:
        return None
    return (game1 - prev).days


def derive_seeds(
    series_rows: list[SeriesRow],
    team_record: dict[tuple[str, int], tuple[int, int]],
    h2h: dict[tuple[str, int, int], tuple[int, int]],
    team_abbr: dict[int, str],
) -> tuple[dict[tuple[str, int], int], dict[str, list[str]]]:
    """Proxy seeds per (season, team) via structural conference detection + Win% rank.

    Returns (seed_map, season_flags). seed_map[(season, team_id)] = seed 1..8.

    Conference membership: union-find over rounds 1-3 series (round 4 excluded). Each
    season should yield exactly two components of eight teams; anything else is flagged and
    that season's seeds are left unset (seed_diff → NULL for those series).

    Ranking within a conference: regular-season Win% desc, then ties broken by, in order,
    (1) the series' own Game-1 HOST when the two tied teams actually met in a rounds-1-3
    series — in the 2-2-1-1-1 format the higher seed always hosts Game 1, so the host IS the
    official higher seed for that pair (ground truth; a pre-game known, not the outcome);
    (2) regular-season HEAD-TO-HEAD (the NBA's primary 2-team tiebreaker) for tied teams that
    did NOT meet; (3) total wins; (4) abbreviation (deterministic last resort). This keeps
    intra-conference (rounds 1-3) seed_diff strictly positive — home-court is the better seed.
    """
    seed_map: dict[tuple[str, int], int] = {}
    flags: dict[str, list[str]] = defaultdict(list)

    # group series by season
    by_season: dict[str, list[SeriesRow]] = defaultdict(list)
    for s in series_rows:
        by_season[s.season].append(s)

    for season, rows in by_season.items():
        # Union-find over rounds 1-3 only (do NOT union across the Finals).
        parent: dict[int, int] = {}

        def find(x: int) -> int:
            parent.setdefault(x, x)
            root = x
            while parent[root] != root:
                root = parent[root]
            while parent[x] != root:  # path compression
                parent[x], x = root, parent[x]
            return root

        def union(x: int, y: int) -> None:
            parent[find(x)] = find(y)

        teams_seen: set[int] = set()
        # host_of_pair[{a,b}] = the Game-1 host of the rounds-1-3 series they played (the
        # official higher seed for that pair). Used only to break exact win% ties.
        host_of_pair: dict[frozenset[int], int] = {}
        for s in rows:
            teams_seen.add(s.home_court_team_id)
            teams_seen.add(s.opponent_team_id)
            if s.round in (1, 2, 3):
                union(s.home_court_team_id, s.opponent_team_id)
                host_of_pair[frozenset((s.home_court_team_id, s.opponent_team_id))] = (
                    s.home_court_team_id
                )

        components: dict[int, list[int]] = defaultdict(list)
        for t in teams_seen:
            components[find(t)].append(t)

        comp_list = [sorted(v) for v in components.values()]
        sizes = sorted(len(c) for c in comp_list)
        if len(comp_list) != 2 or sizes != [8, 8]:
            flags[season].append(
                f"structural conference split unexpected: {len(comp_list)} components "
                f"sizes {sizes} (expected 2x8) — seeds left NULL this season"
            )
            continue

        def winpct(t: int) -> float:
            wins, played = team_record.get((season, t), (0, 0))
            return wins / played if played else 0.0

        def wins_of(t: int) -> int:
            return team_record.get((season, t), (0, 0))[0]

        def rank_cmp(a: int, b: int) -> int:
            pa, pb = winpct(a), winpct(b)
            if pa != pb:
                return -1 if pa > pb else 1  # higher win% = better (lower) seed
            # Exact win% tie. (1) If the two teams actually met in a rounds-1-3 series, the
            # Game-1 host is the official higher seed (2-2-1-1-1 format) — ground truth.
            host = host_of_pair.get(frozenset((a, b)))
            if host is not None:
                return -1 if host == a else 1
            # (2) Otherwise regular-season head-to-head (NBA primary 2-team tiebreak).
            net = h2h_wins(h2h, season, a, b) - h2h_wins(h2h, season, b, a)
            if net != 0:
                return -1 if net > 0 else 1  # more H2H wins ranks ahead
            wa, wb = wins_of(a), wins_of(b)
            if wa != wb:
                return -1 if wa > wb else 1  # more raw wins (shorter season edge)
            aa, ab = team_abbr.get(a, str(a)), team_abbr.get(b, str(b))
            return -1 if aa < ab else (1 if aa > ab else 0)  # deterministic last resort

        for comp in comp_list:
            ranked = sorted(comp, key=functools.cmp_to_key(rank_cmp))
            # flag exact win% ties (seed order then relies on the H2H tiebreaker)
            pcts = [round(winpct(t), 9) for t in comp]
            if len(set(pcts)) < len(pcts):
                flags[season].append("win% tie within a conference (seed order via H2H tiebreaker)")
            for seed, t in enumerate(ranked, start=1):
                seed_map[(season, t)] = seed

    return seed_map, flags


# ─── Compute + write ─────────────────────────────────────────────────────────────────────


def compute_features(
    series_rows: list[SeriesRow],
    team_record,
    h2h,
    game_dates,
    game1_dates,
    seed_map,
    season_flags,
) -> None:
    for s in series_rows:
        home, opp, season = s.home_court_team_id, s.opponent_team_id, s.season

        # win_pct_diff
        hp = win_pct(team_record, season, home)
        op = win_pct(team_record, season, opp)
        if hp is None or op is None:
            s.notes.append("win_pct_diff NULL: missing regular-season record")
        else:
            s.win_pct_diff = round(hp - op, 6)

        # h2h_diff
        s.h2h_diff = h2h_wins(h2h, season, home, opp) - h2h_wins(h2h, season, opp, home)

        # entry_rest_diff
        game1 = game1_dates.get((season, frozenset((home, opp))))
        if game1 is None:
            s.notes.append("entry_rest_diff NULL: no Game-1 (004) date for pair")
        else:
            hd = previous_game_days_off(game_dates, season, home, game1)
            od = previous_game_days_off(game_dates, season, opp, game1)
            if hd is None or od is None:
                s.notes.append("entry_rest_diff NULL: a team's previous game not found")
            else:
                s.entry_rest_diff = hd - od

        # seed_diff
        hs = seed_map.get((season, home))
        os_ = seed_map.get((season, opp))
        if hs is None or os_ is None:
            reason = season_flags.get(season)
            s.notes.append(
                "seed_diff NULL: "
                + (reason[0] if reason else "seed unavailable for a team")
            )
        else:
            s.seed_diff = os_ - hs


UPDATE_SQL = """
UPDATE playoff_series
SET seed_diff = %s, win_pct_diff = %s, entry_rest_diff = %s, h2h_diff = %s
WHERE external_series_key = %s
""".strip()


def write_features(conn, series_rows: list[SeriesRow]) -> int:
    n = 0
    with conn.cursor() as cur:
        for s in series_rows:
            cur.execute(
                UPDATE_SQL,
                (s.seed_diff, s.win_pct_diff, s.entry_rest_diff, s.h2h_diff, s.external_series_key),
            )
            n += cur.rowcount
    return n


# ─── Reporting ───────────────────────────────────────────────────────────────────────────


def _fmt_num(x) -> str:
    if x is None:
        return "NULL"
    if isinstance(x, float):
        return f"{x:.4f}"
    return str(x)


def build_report(
    series_rows: list[SeriesRow],
    team_abbr: dict[int, str],
    season_flags: dict[str, list[str]],
    team_record,
    h2h,
    game_dates,
    game1_dates,
    seed_map,
    wrote: int | None,
) -> str:
    lines: list[str] = []

    def w(s: str = "") -> None:
        lines.append(s)

    total = len(series_rows)

    def n_populated(attr: str) -> int:
        return sum(1 for s in series_rows if getattr(s, attr) is not None)

    w("══ Playoff series feature report (Phase 2b-ii) ══════════════════════════════════")
    w(f"Total series rows            : {total}")
    for col in ("seed_diff", "win_pct_diff", "entry_rest_diff", "h2h_diff"):
        pop = n_populated(col)
        w(f"  {col:<16} populated  : {pop}   NULL: {total - pop}")

    # NULL-with-reason
    nulls = [s for s in series_rows if s.notes]
    w("")
    w(f"Series with any NULL feature : {len(nulls)}")
    for s in nulls:
        w(f"  {s.external_series_key} (R{s.round}): {'; '.join(s.notes)}")

    # Ranges + non-constant checks
    def stats(attr: str):
        vals = [getattr(s, attr) for s in series_rows if getattr(s, attr) is not None]
        if not vals:
            return "no values"
        distinct = len(set(vals))
        return f"min={_fmt_num(min(vals))} max={_fmt_num(max(vals))} distinct={distinct} n={len(vals)}"

    w("")
    w("Ranges / non-constant checks:")
    for col in ("seed_diff", "win_pct_diff", "entry_rest_diff", "h2h_diff"):
        w(f"  {col:<16}: {stats(col)}")

    # Sign invariants.
    #  win_pct_diff / seed_diff are oriented so positive = home-court advantage. Home-court
    #  is (almost always) the better-record side, so negatives should be rare.
    #  KEY invariant: seed_diff for rounds 1-3 is INTRA-conference (two distinct seeds, and
    #  home-court is the Game-1 host = better seed) → must be STRICTLY POSITIVE. The Finals
    #  (R4) is CROSS-conference: both champions are seeded within their own conference, so a
    #  #1-vs-#1 Finals is seed_diff==0 and a lower-overall-seed hosting is seed_diff<0 — both
    #  legitimate. So we split every seed check into "R1-3" (the real invariant) vs "Finals".
    wp_neg = [s for s in series_rows if s.win_pct_diff is not None and s.win_pct_diff < 0]
    wp_zero = [s for s in series_rows if s.win_pct_diff is not None and s.win_pct_diff == 0]
    sd_nonpos_r13 = [
        s for s in series_rows
        if s.seed_diff is not None and s.round in (1, 2, 3) and s.seed_diff <= 0
    ]
    sd_zero_finals = [s for s in series_rows if s.seed_diff == 0 and s.round == 4]
    sd_neg_finals = [s for s in series_rows if s.seed_diff is not None and s.seed_diff < 0 and s.round == 4]
    w("")
    w("Sign invariants (home-court expected to be the stronger/better-seeded side):")
    w(f"  win_pct_diff  < 0 (home-court worse record) : {len(wp_neg)}")
    w(f"  win_pct_diff == 0 (equal record)            : {len(wp_zero)}")
    w(f"  seed_diff  <= 0 in ROUNDS 1-3 (MUST be 0)   : {len(sd_nonpos_r13)}  "
      f"<-- the real red flag")
    if sd_nonpos_r13:
        w("    !! intra-conference series where proxy home-court is NOT the better seed:")
        for s in sd_nonpos_r13:
            w(f"       {s.external_series_key} R{s.round}: seed_diff={s.seed_diff}")
    w(f"  seed_diff == 0 in Finals (#1-vs-#1 etc.)    : {len(sd_zero_finals)}  (legitimate)")
    w(f"  seed_diff  < 0 in Finals (cross-conf host)  : {len(sd_neg_finals)}  (legitimate)")
    w("  home-court-worse-record series (win_pct_diff < 0; era anomalies pre-2016 / play-in):")
    if not wp_neg:
        w("    (none — home-court had >= regular-season record in every series)")
    for s in sorted(wp_neg, key=lambda x: x.external_series_key):
        w(
            f"    {s.external_series_key} R{s.round}: "
            f"win_pct_diff={_fmt_num(s.win_pct_diff)} seed_diff={_fmt_num(s.seed_diff)}"
        )

    # Season flags (deduped: the tie flag fires once per conference, collapse to one line).
    if season_flags:
        w("")
        w("Season flags (deduped):")
        for season in sorted(season_flags):
            uniq = sorted(set(season_flags[season]))
            for f in uniq:
                w(f"  {season}: {f}")

    # 5 spot-checks with raw inputs
    w("")
    w("Spot-checks (raw inputs → computed features):")
    picks = [
        "2023-24_BOS-DAL",  # modern Finals
        "1986-87_BOS-LAL",  # 1980s Finals
        "1986-87_LAL-OKC",  # the 1 unresolved series
        "2015-16_CLE-GSW",  # famous 3-1 Finals
        "2022-23_DEN-MIA",  # play-in era Finals (MIA entered via play-in)
    ]
    by_key = {s.external_series_key: s for s in series_rows}
    for key in picks:
        s = by_key.get(key)
        if s is None:
            w(f"  [{key} not found]")
            continue
        home, opp, season = s.home_court_team_id, s.opponent_team_id, s.season
        ha, oa = team_abbr.get(home, home), team_abbr.get(opp, opp)
        hrec = team_record.get((season, home), (0, 0))
        orec = team_record.get((season, opp), (0, 0))
        game1 = game1_dates.get((season, frozenset((home, opp))))
        hd = previous_game_days_off(game_dates, season, home, game1) if game1 else None
        od = previous_game_days_off(game_dates, season, opp, game1) if game1 else None
        hseed = seed_map.get((season, home))
        oseed = seed_map.get((season, opp))
        w(f"  ── {key}  (R{s.round})")
        w(f"     home-court={ha}(id {home}) rec={hrec[0]}-{hrec[1]-hrec[0]} ({hrec[1]} gp)  "
          f"seed(proxy)={hseed}")
        w(f"     opponent ={oa}(id {opp}) rec={orec[0]}-{orec[1]-orec[0]} ({orec[1]} gp)  "
          f"seed(proxy)={oseed}")
        w(f"     Game-1={game1}  home DaysOff={hd}  opp DaysOff={od}")
        w(f"     h2h(regular): home {h2h_wins(h2h, season, home, opp)} - "
          f"{h2h_wins(h2h, season, opp, home)} opp")
        w(f"     => seed_diff={_fmt_num(s.seed_diff)} win_pct_diff={_fmt_num(s.win_pct_diff)} "
          f"entry_rest_diff={_fmt_num(s.entry_rest_diff)} h2h_diff={_fmt_num(s.h2h_diff)}")

    w("")
    if wrote is None:
        w(f"DRY-RUN — nothing written ({total} series computed).")
    else:
        w(f"WROTE {wrote} rows (of {total} computed).")

    return "\n".join(lines)


# ─── Main ────────────────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compute the four playoff_series features (Phase 2b-ii)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute + validate and print the report, but perform NO database writes.",
    )
    parser.add_argument(
        "--report-file",
        default=None,
        help="Optional path to also write the full report (for offline inspection).",
    )
    args = parser.parse_args()

    database_url = resolve_database_url()
    conn = psycopg2.connect(database_url)
    try:
        team_abbr = load_teams(conn)
        series_rows = load_series(conn)
        team_record, h2h = load_regular_records(conn)
        game_dates = load_final_game_dates(conn)
        game1_dates = load_series_game1(conn)

        print(
            f"Loaded {len(series_rows)} series, {len(team_abbr)} teams; "
            f"regular-record keys={len(team_record)}, final-game-date keys={len(game_dates)}."
        )

        seed_map, season_flags = derive_seeds(series_rows, team_record, h2h, team_abbr)
        compute_features(
            series_rows, team_record, h2h, game_dates, game1_dates, seed_map, season_flags
        )

        wrote: int | None = None
        if not args.dry_run:
            with conn:
                wrote = write_features(conn, series_rows)

        report = build_report(
            series_rows,
            team_abbr,
            season_flags,
            team_record,
            h2h,
            game_dates,
            game1_dates,
            seed_map,
            wrote,
        )
        print(report)
        if args.report_file:
            Path(args.report_file).write_text(report)
            print(f"\n(report also written to {args.report_file})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
