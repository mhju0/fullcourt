"""Read-only validation of scored regular finals used by player exports.

Publication starts with observed games. There is no league-wide sample floor.
"""
from __future__ import annotations

class SeasonPublicationHeld(ValueError):
    pass


def require_player_season_publication(conn, years, now=None) -> None:
    seasons = [f"{int(year)}-{str(int(year) + 1)[-2:]}" for year in sorted(set(years))]
    if not seasons:
        return
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT g.external_id FROM games g
            WHERE g.season = ANY(%s) AND g.game_type = 'regular' AND g.status = 'final'
              AND (g.home_score IS NULL OR g.away_score IS NULL
                   OR g.home_score < 0 OR g.away_score < 0
                   OR g.home_score = g.away_score OR g.home_team_id = g.away_team_id)
        """, (seasons,))
        invalid = cursor.fetchall()
    if invalid:
        raise SeasonPublicationHeld(f"Invalid scored regular finals: {invalid[:5]}. Keep the previous export.")
