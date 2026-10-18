"""Import-light, explicit contracts for schedule ingestion conflict handling."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScheduleUpsertPolicy:
    """Declares which source is authoritative for each mutable game field."""

    update_date: bool
    preserve_final_status: bool
    preserve_existing_scores_when_missing: bool
    update_overtime_periods: bool
    update_game_type: bool


CDN_SCHEDULE_UPSERT_POLICY = ScheduleUpsertPolicy(
    update_date=False,
    preserve_final_status=True,
    preserve_existing_scores_when_missing=True,
    update_overtime_periods=False,
    update_game_type=False,
)

STATS_SCHEDULE_UPSERT_POLICY = ScheduleUpsertPolicy(
    update_date=False,
    preserve_final_status=True,
    preserve_existing_scores_when_missing=False,
    update_overtime_periods=True,
    update_game_type=True,
)


def build_schedule_upsert_sql(policy: ScheduleUpsertPolicy) -> str:
    """Render the shared game insert with source-specific conflict assignments."""
    assignments: list[str] = []
    if policy.update_date:
        assignments.append("date = games.date")

    final_guard = "(games.status = 'final' AND EXCLUDED.status <> 'final')" if policy.preserve_final_status else "FALSE"
    protect = f"{final_guard} OR games.status IN ('postponed', 'cancelled')"
    for column in ("home_score", "away_score"):
        incoming = f"COALESCE(EXCLUDED.{column}, games.{column})" if policy.preserve_existing_scores_when_missing else f"EXCLUDED.{column}"
        assignments.append(f"{column} = CASE WHEN {protect} THEN games.{column} ELSE {incoming} END")
    assignments.append(f"status = CASE WHEN {protect} THEN games.status ELSE EXCLUDED.status END")

    if policy.update_overtime_periods:
        assignments.append(f"overtime_periods = CASE WHEN {protect} THEN games.overtime_periods ELSE EXCLUDED.overtime_periods END")
    if policy.update_game_type:
        assignments.append("game_type = EXCLUDED.game_type")

    conflict_updates = ",\n    ".join(assignments)
    return f"""
INSERT INTO games (
    external_id, date, season,
    home_team_id, away_team_id,
    home_score, away_score, status,
    overtime_periods, game_type
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (external_id) DO UPDATE SET
    {conflict_updates}
WHERE games.date = EXCLUDED.date AND games.home_team_id = EXCLUDED.home_team_id AND games.away_team_id = EXCLUDED.away_team_id;
"""
