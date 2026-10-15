-- Test-only four-table slice of src/lib/db/schema.ts. Not a deployment/bootstrap migration.
-- CREATE without IF NOT EXISTS refuses an already populated service.
create table teams (
  id serial primary key, abbreviation varchar(3) not null unique, name varchar not null,
  city varchar not null, conference varchar not null, latitude numeric not null,
  longitude numeric not null, altitude_flag boolean not null default false
);
create table games (
  id serial primary key, external_id varchar not null unique, date date not null,
  season varchar not null, home_team_id integer not null references teams(id),
  away_team_id integer not null references teams(id), home_score integer, away_score integer,
  home_moneyline integer, away_moneyline integer, status varchar not null default 'scheduled',
  game_type varchar(16) not null default 'regular', overtime_periods integer not null default 0,
  tip_off_utc timestamptz, neutral_site boolean not null default false, neutral_venue_city varchar
);
create table fatigue_scores (
  id serial primary key, game_id integer not null references games(id),
  team_id integer not null references teams(id), score numeric not null,
  decay_load_score numeric not null, travel_load_score numeric not null,
  b2b_multiplier numeric not null, altitude_multiplier numeric not null,
  density_multiplier numeric not null, freshness_bonus numeric not null,
  games_in_last_7_days integer not null, games_in_last_30_days integer not null default 0,
  travel_distance_miles numeric not null, is_back_to_back boolean not null,
  days_since_last_game integer, is_overtime_penalty boolean not null default false,
  road_trip_consecutive_away integer not null default 0, is_three_in_four boolean not null default false,
  is_four_in_six boolean not null default false, has_time_zone_displacement boolean not null default false,
  computed_at timestamp not null default now()
);
create table predictions (
  id serial primary key, game_id integer not null references games(id),
  predicted_advantage_team_id integer not null references teams(id), rest_advantage_differential numeric not null,
  actual_winner_id integer references teams(id), created_at timestamp not null default now()
);
-- The four teams used by the existing integrity harness, from scripts/seed_teams.py.
insert into teams (id, abbreviation, name, city, conference, latitude, longitude) values
  (1, 'BOS', 'Celtics', 'Boston', 'East', 42.3662, -71.0621),
  (2, 'BKN', 'Nets', 'Brooklyn', 'East', 40.6826, -73.9754),
  (3, 'NYK', 'Knicks', 'New York', 'East', 40.7505, -73.9934),
  (4, 'PHI', '76ers', 'Philadelphia', 'East', 39.9012, -75.1720);
