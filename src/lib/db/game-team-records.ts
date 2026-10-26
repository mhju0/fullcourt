import { sql } from "drizzle-orm";

export interface GameRecordTarget {
  id: number;
  season: string;
  date: string;
  tipOffUtc: Date | null;
  homeTeamId: number;
  awayTeamId: number;
}

export function gameTeamRecordsQuery(targets: GameRecordTarget[], asOf = new Date()) {
  const values = sql.join(targets.map(target => sql`(${target.id}::int, ${target.season}::text, ${target.date}::date,
    ${target.tipOffUtc?.toISOString() ?? null}::timestamptz, ${target.homeTeamId}::int, ${target.awayTeamId}::int)`), sql`, `);
  const cutoff = asOf.toISOString();
  return sql`
    select target.id as game_id, side.name as side,
      count(prior.id) filter (where
        case when prior.home_team_id = side.team_id then prior.home_score > prior.away_score
        else prior.away_score > prior.home_score end)::int as wins,
      count(prior.id) filter (where
        case when prior.home_team_id = side.team_id then prior.home_score < prior.away_score
        else prior.away_score < prior.home_score end)::int as losses
    from (values ${values}) target(id, season, date, tip_off_utc, home_team_id, away_team_id)
    cross join lateral (values ('home', target.home_team_id), ('away', target.away_team_id)) side(name, team_id)
    left join games prior on prior.season = target.season
      and prior.id <> target.id
      and prior.game_type = 'regular' and prior.status = 'final'
      and prior.home_score is not null and prior.away_score is not null
      and prior.home_score <> prior.away_score
      and side.team_id in (prior.home_team_id, prior.away_team_id)
      and (prior.date < target.date or (prior.date = target.date and
        case when prior.tip_off_utc is not null and target.tip_off_utc is not null
          and prior.tip_off_utc <> target.tip_off_utc then prior.tip_off_utc < target.tip_off_utc
        else prior.id < target.id end))
      and prior.date <= (${cutoff}::timestamptz at time zone 'America/New_York')::date
      and (prior.tip_off_utc is null or prior.tip_off_utc <= ${cutoff}::timestamptz)
    group by target.id, side.name
  `;
}
