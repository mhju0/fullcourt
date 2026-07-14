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
    update_date=True,
    preserve_final_status=True,
    preserve_existing_scores_when_missing=True,
    update_overtime_periods=False,
    update_game_type=False,
)

STATS_SCHEDULE_UPSERT_POLICY = ScheduleUpsertPolicy(
    update_date=False,
    preserve_final_status=False,
    preserve_existing_scores_when_missing=False,
    update_overtime_periods=True,
    update_game_type=True,
)


def build_schedule_upsert_sql(policy: ScheduleUpsertPolicy) -> str:
    """Render the shared game insert with source-specific conflict assignments."""
    assignments: list[str] = []
    if policy.update_date:
        assignments.append("date = EXCLUDED.date")

    if policy.preserve_existing_scores_when_missing:
        assignments.extend(
            [
                "home_score = COALESCE(EXCLUDED.home_score, games.home_score)",
                "away_score = COALESCE(EXCLUDED.away_score, games.away_score)",
            ]
        )
    else:
        assignments.extend(
            [
                "home_score = EXCLUDED.home_score",
                "away_score = EXCLUDED.away_score",
            ]
        )

    if policy.preserve_final_status:
        assignments.append(
            "status = CASE WHEN games.status = 'final' "
            "THEN games.status ELSE EXCLUDED.status END"
        )
    else:
        assignments.append("status = EXCLUDED.status")

    if policy.update_overtime_periods:
        assignments.append("overtime_periods = EXCLUDED.overtime_periods")
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
    {conflict_updates};
"""
