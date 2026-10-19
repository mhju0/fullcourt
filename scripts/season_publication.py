"""Read-only release guard for exports that pool current-season player results."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

CURRENT_TEAM_ABBREVIATIONS = frozenset((
    "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
    "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
    "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
))
MIN_FINAL_APPEARANCES = 10


class SeasonPublicationHeld(ValueError):
    pass


def require_player_season_publication(conn, years, now: datetime | None = None) -> None:
    eastern = (now or datetime.now(ZoneInfo("America/New_York"))).astimezone(ZoneInfo("America/New_York"))
    current_year = eastern.year if eastern.month >= 10 else eastern.year - 1
    for year in sorted({int(value) for value in years if int(value) >= current_year}):
        season = f"{year}-{str(year + 1)[-2:]}"
        # Physical final appearances, not fatigue eligibility or the analytical regime cohort.
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT t.abbreviation, count(DISTINCT g.id)
                FROM teams t
                LEFT JOIN games g ON g.season = %s
                    AND g.game_type = 'regular' AND g.status = 'final'
                    AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL
                    AND g.home_score >= 0 AND g.away_score >= 0
                    AND g.home_score <> g.away_score
                    AND g.home_team_id <> g.away_team_id
                    AND (g.home_team_id = t.id OR g.away_team_id = t.id)
                GROUP BY t.abbreviation
            """, (season,))
            counts = dict(cursor.fetchall())
        if not CURRENT_TEAM_ABBREVIATIONS.issubset(counts) or any(
            counts[team] < MIN_FINAL_APPEARANCES for team in CURRENT_TEAM_ABBREVIATIONS
        ):
            raise SeasonPublicationHeld(
                f"Player export held: {season} results have not met the season publication rule. "
                "Keep the previous published export."
            )
