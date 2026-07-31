# Playoff Rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/playoffs` as **PLAYOFF REST** — an argument-first page about how surviving a long series taxes a team in the round that follows — backed by a recalculated series model that swaps `entry_rest_diff` for a format-aware `prior_grind_diff`.

**Architecture:** One new nullable column on `playoff_series`, backfilled from `playoff_series` itself. A new Python analysis script emits every published figure to a committed JSON, which a TypeScript constants module mirrors and a vitest test pins. The page splits into four static server-rendered argument sections (A–D) plus the existing SWR-driven bracket (E), kept as sibling components so a later bracket-first reorder is a sibling swap rather than a rewrite.

**Tech Stack:** Next.js 15 App Router, React server + client components, Drizzle ORM over Supabase Postgres, `swr`, vitest, Playwright, Python 3.11 + scikit-learn 1.9.0 in `ml/.venv`, `unittest` for Python tests.

**Spec:** `docs/superpowers/specs/2026-07-31-playoff-rest-design.md`

## Global Constraints

- **The module keeps its internal name "Playoff Predictor."** Tables (`playoff_series`, `playoff_series_predictions`), scripts (`ml/`, `scripts/fetch_playoffs.py`), code comments, and the historical design docs (`docs/PLAYOFF_PREDICTOR_DESIGN.md`, `docs/DATA_PIPELINE.md`, `docs/ARCHITECTURE.md` module sections) do **not** get renamed. Only the user-facing tab label, page header, page content, and the nav-listing rows in docs change. Renaming the module would multiply the diff for zero user benefit.
- **Claude Code never applies migrations.** It writes `drizzle/00XX_*.sql` only. The human runs it in the Supabase SQL editor. Never run `drizzle-kit push` or `drizzle-kit generate`.
- **Every number rendered on the page traces to a generated report.** Numbers live in exactly one TypeScript module (`src/lib/playoff-rest-facts.ts`), which is pinned against a committed JSON emitted by Python. Never retype a figure into a component.
- **Page description must fit exactly two lines** with the last line ≥30% filled, at 1440px width and a `42rem` measure. Enforced by `e2e/page-headers.spec.ts`.
- **Every numeric column names its unit**, and season counts in prose must not age. (Existing site conventions.)
- **No new dependencies.** Not in `package.json`, not in `ml/requirements.txt`.
- **No `Co-Authored-By: Claude` trailers in commit messages.** History was filter-branch'd on 2026-07-27 to strip them.
- **Verification gate for every task that touches TS/TSX:** `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build` all clean.
- **Sign convention, everywhere, no exceptions:** all `*_diff` values are `(home-court team) − (opponent)` **except** `prior_grind_diff`, which is `(opponent) − (home-court team)` so that **positive still favors the home-court team** (their opponent got ground down more). This inversion is deliberate and must be stated in the column comment, the docstring, and the page's sign-convention line.
- **Format-aware grind, always:** one team's grind is `games_played − (4 if is_best_of_7 else 3)`. Never raw games played. 136 of 320 Round 1 series (1985-86 → 2001-02) were best-of-5, where 5 games means going the full distance rather than closing early.

---

### Task 1: Add the `prior_grind_diff` column

**Files:**
- Create: `drizzle/0012_playoff_series_prior_grind.sql`
- Modify: `src/lib/db/schema.ts` (the `playoffSeries` table, after `entryRestDiff`)

**Interfaces:**
- Consumes: nothing.
- Produces: `playoffSeries.priorGrindDiff` — a Drizzle `decimal("prior_grind_diff")`, nullable, importable from `@/lib/db/schema`. The physical column is `public.playoff_series.prior_grind_diff numeric NULL`.

- [ ] **Step 1: Confirm the migration number**

Run: `ls drizzle/ | sort | tail -3`

Expected: highest on disk is `0011_games_tip_off_neutral_site.sql`, so this file is `0012`. If the listing shows anything higher, use the next number after it. Some migrations were applied manually in Supabase and may not exist on disk — if the next number looks ambiguous, **stop and ask the human to confirm** rather than guessing.

- [ ] **Step 2: Write the migration file**

Create `drizzle/0012_playoff_series_prior_grind.sql`:

```sql
-- =============================================================================
-- Playoff Rest — playoff_series.prior_grind_diff (2026-07-31)
-- =============================================================================
--
-- COMPLETE, STANDALONE migration: paste directly into the Supabase SQL editor.
-- It does NOT rely on `drizzle-kit push`.
--
-- Adds ONE nullable column to an existing table. Creates nothing else, drops
-- nothing, and does not touch teams / games / fatigue_scores / predictions /
-- playoff_series_predictions. RLS and grants on playoff_series already cover
-- this column (they are table-scoped, set in drizzle/0006_playoff_series.sql),
-- so no policy or grant changes are needed or included.
--
-- WHAT THE VALUE MEANS
--   One team's "grind" in its previous round = games_played - (4 if that series
--   was best-of-7 else 3), i.e. games played BEYOND a sweep. Range 0..3 (0..2
--   for a best-of-5). The format adjustment is mandatory: 136 of 320 Round 1
--   series (1985-86 .. 2001-02) were best-of-5, where a 5-game series means the
--   team went the FULL DISTANCE while in a best-of-7 it means they closed early.
--   Raw games played gives those opposite situations the same number.
--
--   prior_grind_diff = opponent's grind - home-court team's grind.
--
-- SIGN CONVENTION (deliberately INVERTED vs the other *_diff columns)
--   Every other *_diff on this table is (home-court - opponent). This one is
--   (opponent - home-court) so that POSITIVE STILL FAVORS THE HOME-COURT TEAM:
--   a positive value means the opponent was ground down more. Keeping the
--   *meaning* of the sign consistent matters more than keeping the subtraction
--   order consistent, because the model's coefficient sign is what gets read.
--
-- NULLABILITY CONTRACT
--   0     = Round 1. No prior round exists, so there genuinely is no
--           differential. This is a fact, not a fill value.
--   non-0 = rounds 2+ where both teams' prior series resolved.
--   NULL  = a prior series could not be resolved at all. The backfill reports
--           these as a count with their series keys; it never coerces to 0,
--           because a silent 0 is indistinguishable from a real Round 1 value.
-- =============================================================================

ALTER TABLE public.playoff_series
  ADD COLUMN IF NOT EXISTS "prior_grind_diff" numeric;

COMMENT ON COLUMN public.playoff_series.prior_grind_diff IS
  'Opponent prior-round grind minus home-court prior-round grind, where grind = games_played - (4 if best-of-7 else 3). POSITIVE FAVORS THE HOME-COURT TEAM (inverted vs the other *_diff columns by design). 0 in Round 1; NULL only when a prior series cannot be resolved.';
```

- [ ] **Step 3: Add the column to the Drizzle schema**

In `src/lib/db/schema.ts`, inside the `playoffSeries` table definition, immediately after the `entryRestDiff` line, add:

```ts
    /**
     * Opponent's prior-round grind minus the home-court team's, where one team's grind is
     * `games_played - (4 if is_best_of_7 else 3)` — games beyond a sweep.
     *
     * SIGN IS INVERTED vs the other *_diff columns on purpose: this is (opponent - home-court)
     * so that positive still favors the home-court team. 136 of 320 Round 1 series (1985-86 ..
     * 2001-02) were best-of-5, where five games means going the full distance rather than
     * closing early, so the format adjustment is mandatory rather than cosmetic.
     *
     * 0 in Round 1 (no prior round exists — a fact, not a fill value). NULL only where a prior
     * series cannot be resolved. Written by `ml/compute_prior_grind.py`; migration 0012.
     */
    priorGrindDiff: decimal("prior_grind_diff"),
```

- [ ] **Step 4: Verify the schema compiles**

Run: `pnpm typecheck`
Expected: clean. If `decimal` is not already imported in `schema.ts` it will error — it is imported (used by `seedDiff` and siblings), so no import change is expected.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0012_playoff_series_prior_grind.sql src/lib/db/schema.ts
git commit -m "Add playoff_series.prior_grind_diff column and migration"
```

- [ ] **Step 6: Hand the migration to the human**

Report to the user, verbatim:

> Migration `drizzle/0012_playoff_series_prior_grind.sql` is ready. Please paste it into the Supabase SQL editor and run it. Post-apply verification:
>
> ```sql
> SELECT column_name, data_type, is_nullable
> FROM information_schema.columns
> WHERE table_schema = 'public' AND table_name = 'playoff_series'
>   AND column_name = 'prior_grind_diff';
> -- expect exactly 1 row: prior_grind_diff | numeric | YES
>
> SELECT count(*) AS total, count(prior_grind_diff) AS populated
> FROM playoff_series;
> -- expect total = 600, populated = 0 (backfill runs in Task 2)
> ```
>
> Rollback: `ALTER TABLE public.playoff_series DROP COLUMN prior_grind_diff;` — safe, drops only the new column and nothing reads it yet.

**Do not proceed to Task 2 until the human confirms the migration is applied.**

---

### Task 2: Compute and backfill `prior_grind_diff`

**Files:**
- Create: `ml/compute_prior_grind.py`
- Create: `ml/tests/test_compute_prior_grind.py`
- Create: `ml/tests/__init__.py` (empty)

**Interfaces:**
- Consumes: `ml.compute_series_features.resolve_database_url` (already exists at `ml/compute_series_features.py:94`).
- Produces:
  - `grind_beyond_sweep(games_played: int, is_best_of_7: bool) -> int`
  - `prior_grind_diff(home_grind: int | None, opp_grind: int | None, round_no: int) -> int | None`
  - `SeriesRow` dataclass with fields `key: str, season: str, round: int, home_court_team_id: int, opponent_team_id: int, home_court_wins: int | None, opponent_wins: int | None, is_best_of_7: bool`
  - `build_prior_grind(rows: list[SeriesRow]) -> dict[str, int | None]` keyed by `external_series_key`

- [ ] **Step 1: Write the failing test**

Create `ml/tests/__init__.py` as an empty file, then create `ml/tests/test_compute_prior_grind.py`:

```python
"""Unit tests for the format-aware prior-round grind computation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from compute_prior_grind import (  # noqa: E402
    SeriesRow,
    build_prior_grind,
    grind_beyond_sweep,
    prior_grind_diff,
)


def series(key, season, rnd, hc, opp, hw, ow, bo7=True):
    return SeriesRow(
        key=key, season=season, round=rnd,
        home_court_team_id=hc, opponent_team_id=opp,
        home_court_wins=hw, opponent_wins=ow, is_best_of_7=bo7,
    )


class GrindBeyondSweepTests(unittest.TestCase):
    def test_best_of_7_sweep_is_zero(self) -> None:
        self.assertEqual(grind_beyond_sweep(4, True), 0)

    def test_best_of_7_full_distance_is_three(self) -> None:
        self.assertEqual(grind_beyond_sweep(7, True), 3)

    def test_best_of_5_sweep_is_zero(self) -> None:
        self.assertEqual(grind_beyond_sweep(3, False), 0)

    def test_best_of_5_full_distance_is_two(self) -> None:
        self.assertEqual(grind_beyond_sweep(5, False), 2)

    def test_five_games_means_opposite_things_by_format(self) -> None:
        """The whole reason this function exists: same games played, opposite grind."""
        self.assertEqual(grind_beyond_sweep(5, False), 2)  # went the full distance
        self.assertEqual(grind_beyond_sweep(5, True), 1)   # closed early
        self.assertNotEqual(grind_beyond_sweep(5, False), grind_beyond_sweep(5, True))


class PriorGrindDiffTests(unittest.TestCase):
    def test_round_one_is_zero_not_null(self) -> None:
        self.assertEqual(prior_grind_diff(None, None, 1), 0)

    def test_positive_favors_home_court(self) -> None:
        """Opponent ground down more (3) than home court (0) -> positive."""
        self.assertEqual(prior_grind_diff(0, 3, 2), 3)

    def test_negative_when_home_court_ground_down_more(self) -> None:
        self.assertEqual(prior_grind_diff(3, 0, 2), -3)

    def test_unresolved_prior_series_is_none_not_zero(self) -> None:
        self.assertIsNone(prior_grind_diff(None, 2, 2))
        self.assertIsNone(prior_grind_diff(2, None, 2))


class BuildPriorGrindTests(unittest.TestCase):
    def test_resolves_prior_round_for_both_teams(self) -> None:
        rows = [
            # Round 1: team 10 sweeps team 11 (bo7, 4 games -> grind 0)
            series("s_10_11", "2024-25", 1, 10, 11, 4, 0),
            # Round 1: team 20 survives team 21 in seven (bo7, 7 games -> grind 3)
            series("s_20_21", "2024-25", 1, 20, 21, 4, 3),
            # Round 2: 10 (home court) vs 20
            series("s_10_20", "2024-25", 2, 10, 20, None, None),
        ]
        out = build_prior_grind(rows)
        self.assertEqual(out["s_10_11"], 0)   # round 1
        self.assertEqual(out["s_20_21"], 0)   # round 1
        # opponent grind 3 - home-court grind 0 = +3, favoring the home-court team
        self.assertEqual(out["s_10_20"], 3)

    def test_losing_team_prior_round_still_resolves(self) -> None:
        """A team's prior series is found whether it was that series' home-court side or not."""
        rows = [
            series("s_30_31", "2024-25", 1, 30, 31, 4, 2),   # 6 games -> grind 2 for BOTH
            series("s_40_41", "2024-25", 1, 40, 41, 4, 0),   # 4 games -> grind 0 for BOTH
            series("s_31_41", "2024-25", 2, 31, 41, None, None),
        ]
        out = build_prior_grind(rows)
        # home court = 31 (grind 2), opponent = 41 (grind 0) -> 0 - 2 = -2
        self.assertEqual(out["s_31_41"], -2)

    def test_best_of_five_prior_round_uses_its_own_format(self) -> None:
        rows = [
            series("s_50_51", "1995-96", 1, 50, 51, 3, 2, bo7=False),  # 5 of a bo5 -> grind 2
            series("s_60_61", "1995-96", 1, 60, 61, 3, 0, bo7=False),  # 3 of a bo5 -> grind 0
            series("s_50_60", "1995-96", 2, 50, 60, None, None),
        ]
        out = build_prior_grind(rows)
        # home court 50 grind 2, opponent 60 grind 0 -> 0 - 2 = -2
        self.assertEqual(out["s_50_60"], -2)

    def test_unresolvable_prior_series_yields_none(self) -> None:
        rows = [series("s_70_80", "2024-25", 2, 70, 80, None, None)]  # no round 1 rows at all
        self.assertIsNone(build_prior_grind(rows)["s_70_80"])

    def test_prior_series_with_null_wins_is_unresolvable(self) -> None:
        rows = [
            series("s_90_91", "2024-25", 1, 90, 91, None, None),
            series("s_92_93", "2024-25", 1, 92, 93, 4, 1),
            series("s_90_92", "2024-25", 2, 90, 92, None, None),
        ]
        self.assertIsNone(build_prior_grind(rows)["s_90_92"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./ml/.venv/bin/python -m unittest discover -s ml/tests -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'compute_prior_grind'`

- [ ] **Step 3: Write the implementation**

Create `ml/compute_prior_grind.py`:

```python
"""Playoff Rest — compute and persist `playoff_series.prior_grind_diff`.

One team's GRIND in its previous round is the number of games it played beyond a sweep:

    grind = games_played - (4 if that series was best-of-7 else 3)

Range 0..3 for a best-of-7, 0..2 for a best-of-5. The format adjustment is mandatory, not
cosmetic: 136 of 320 Round 1 series (1985-86 .. 2001-02) were best-of-5, where a five-game
series means the team went the FULL DISTANCE, while in a best-of-7 five games means they
closed early. Raw `games_played` gives those opposite situations the same number across
roughly half the historical sample.

    prior_grind_diff = opponent's grind - home-court team's grind

SIGN CONVENTION — deliberately inverted versus the other `*_diff` columns on this table,
which are all (home-court - opponent). Here the subtraction runs the other way so that
POSITIVE STILL FAVORS THE HOME-COURT TEAM: a positive value means the opponent was ground
down more. Consistent *meaning* of the sign beats a consistent subtraction order, because
the model coefficient's sign is what a reader interprets.

NULLABILITY: 0 for every Round 1 row (no prior round exists — a fact, not a fill value);
NULL only where a prior series cannot be resolved at all. A silent 0 there would be
indistinguishable from a real Round 1 value, so unresolved rows are reported by count and
key rather than coerced.

Run from the project root:
    ./ml/.venv/bin/python ml/compute_prior_grind.py --dry-run   # print, write nothing
    ./ml/.venv/bin/python ml/compute_prior_grind.py             # UPDATE the column

The ONLY write is:
    UPDATE playoff_series SET prior_grind_diff = %s WHERE external_series_key = %s
No other table, column, INSERT, DELETE or DDL.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import psycopg2

ML_DIR = Path(__file__).resolve().parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from compute_series_features import resolve_database_url  # noqa: E402


@dataclass(frozen=True)
class SeriesRow:
    key: str
    season: str
    round: int
    home_court_team_id: int
    opponent_team_id: int
    home_court_wins: int | None
    opponent_wins: int | None
    is_best_of_7: bool


def grind_beyond_sweep(games_played: int, is_best_of_7: bool) -> int:
    """Games played beyond a sweep. Format-aware; see the module docstring."""
    return games_played - (4 if is_best_of_7 else 3)


def prior_grind_diff(
    home_grind: int | None, opp_grind: int | None, round_no: int
) -> int | None:
    """Opponent grind minus home-court grind. 0 in Round 1; None when either side is unresolved."""
    if round_no <= 1:
        return 0
    if home_grind is None or opp_grind is None:
        return None
    return opp_grind - home_grind


def _team_grind_in_round(rows: list[SeriesRow], season: str, round_no: int, team: int) -> int | None:
    """That team's grind in the given round, or None if no resolved series is found."""
    for s in rows:
        if s.season != season or s.round != round_no:
            continue
        if team not in (s.home_court_team_id, s.opponent_team_id):
            continue
        if s.home_court_wins is None or s.opponent_wins is None:
            return None
        return grind_beyond_sweep(s.home_court_wins + s.opponent_wins, s.is_best_of_7)
    return None


def build_prior_grind(rows: list[SeriesRow]) -> dict[str, int | None]:
    """Map external_series_key -> prior_grind_diff for every input row."""
    out: dict[str, int | None] = {}
    for s in rows:
        if s.round <= 1:
            out[s.key] = 0
            continue
        home = _team_grind_in_round(rows, s.season, s.round - 1, s.home_court_team_id)
        opp = _team_grind_in_round(rows, s.season, s.round - 1, s.opponent_team_id)
        out[s.key] = prior_grind_diff(home, opp, s.round)
    return out


def load_series(conn) -> list[SeriesRow]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT external_series_key, season, round, home_court_team_id,
                   opponent_team_id, home_court_wins, opponent_wins, is_best_of_7
            FROM playoff_series
            ORDER BY season, round, id
            """
        )
        return [SeriesRow(*r) for r in cur.fetchall()]


UPDATE_SQL = "UPDATE playoff_series SET prior_grind_diff = %s WHERE external_series_key = %s"


def write_prior_grind(conn, values: dict[str, int | None]) -> int:
    with conn.cursor() as cur:
        for key, v in values.items():
            cur.execute(UPDATE_SQL, (v, key))
    conn.commit()
    return len(values)


def main() -> None:
    ap = argparse.ArgumentParser(description="Compute and persist playoff_series.prior_grind_diff")
    ap.add_argument("--dry-run", action="store_true", help="print the summary, write nothing")
    args = ap.parse_args()

    conn = psycopg2.connect(resolve_database_url())
    try:
        rows = load_series(conn)
        values = build_prior_grind(rows)

        by_round: Counter[int] = Counter()
        nulls: list[str] = []
        dist: Counter[int | None] = Counter()
        round_of = {s.key: s.round for s in rows}
        for key, v in values.items():
            by_round[round_of[key]] += 1
            dist[v] += 1
            if v is None:
                nulls.append(key)

        print(f"series rows            : {len(rows)}")
        print(f"round 1 rows (all 0)   : {by_round[1]}")
        print(f"rounds 2+ rows         : {sum(n for r, n in by_round.items() if r >= 2)}")
        print(f"NULL (unresolved prior): {len(nulls)}")
        for key in nulls:
            print(f"    unresolved: {key}")
        print("value distribution     :")
        for v in sorted(dist, key=lambda x: (x is None, x)):
            print(f"    {str(v):>5}: {dist[v]}")

        r1_bad = [k for k, v in values.items() if round_of[k] == 1 and v != 0]
        if r1_bad:
            raise SystemExit(f"INVARIANT FAILED: {len(r1_bad)} Round 1 rows are not 0: {r1_bad[:5]}")

        if args.dry_run:
            print("\nDRY RUN — nothing written.")
            return
        print(f"\nWROTE prior_grind_diff for {write_prior_grind(conn, values)} rows.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./ml/.venv/bin/python -m unittest discover -s ml/tests -v`
Expected: PASS, 14 tests.

- [ ] **Step 5: Dry-run against the live DB**

Run: `./ml/.venv/bin/python ml/compute_prior_grind.py --dry-run`

Expected: `series rows: 600`, `round 1 rows (all 0): 320`, `rounds 2+ rows: 280`, `NULL (unresolved prior): 1`. The single expected NULL is the rounds-2+ row whose prior series is `1986-87_LAL-OKC` (that series has a NULL winner but, more relevantly here, check whether its wins are populated — if `NULL` is 0 instead of 1, that is also acceptable and means the wins are present). **If the NULL count exceeds 2, stop and report** — that means prior-round resolution is broken, not that the data is sparse.

- [ ] **Step 6: Backfill for real**

Run: `./ml/.venv/bin/python ml/compute_prior_grind.py`
Expected: `WROTE prior_grind_diff for 600 rows.`

Then verify in the DB:

```bash
./ml/.venv/bin/python -c "
import sys; sys.path.insert(0, 'ml')
from compute_series_features import resolve_database_url
import psycopg2
c = psycopg2.connect(resolve_database_url()); cur = c.cursor()
cur.execute('SELECT count(*), count(prior_grind_diff) FROM playoff_series')
print('total, populated:', cur.fetchone())
cur.execute('SELECT count(*) FROM playoff_series WHERE round = 1 AND prior_grind_diff <> 0')
print('round-1 rows that are not 0 (must be 0):', cur.fetchone()[0])
cur.execute('SELECT min(prior_grind_diff), max(prior_grind_diff) FROM playoff_series')
print('min, max (must be within -3..+3):', cur.fetchone())
c.close()"
```

Expected: `total, populated: (600, 599)` or `(600, 600)`; `round-1 rows that are not 0: 0`; min/max within `-3 .. +3`.

- [ ] **Step 7: Commit**

```bash
git add ml/compute_prior_grind.py ml/tests/__init__.py ml/tests/test_compute_prior_grind.py
git commit -m "Compute format-aware prior-round grind for playoff series"
```

---

### Task 3: Emit every published figure to a committed JSON

This task exists so no number is ever hand-typed into a component. It is the single source for Sections A, B and C.

**Files:**
- Create: `ml/playoff_rest_report.py`
- Create: `ml/playoff_rest_facts.json` (generated, **committed**)
- Create: `ml/PLAYOFF_REST_REPORT.md` (generated, **committed**)

**Interfaces:**
- Consumes: `playoff_series` (including `prior_grind_diff` from Task 2), `games`, `teams`.
- Produces: `ml/playoff_rest_facts.json` with this exact top-level shape, which Task 6 mirrors in TypeScript:

```json
{
  "generatedFrom": "playoff_series + games (play-in excluded)",
  "equalRest": {"game1Games": 0, "game1Equal": 0, "laterGames": 0, "laterEqual": 0},
  "grindMatrix": {
    "ownLowOppLow": {"winPct": 0.0, "n": 0},
    "ownLowOppHigh": {"winPct": 0.0, "n": 0},
    "ownHighOppLow": {"winPct": 0.0, "n": 0},
    "ownHighOppHigh": {"winPct": 0.0, "n": 0}
  },
  "exogenous": {
    "oppClosedEarly": {"winPct": 0.0, "n": 0, "meanWinPctDiff": 0.0},
    "oppWentLong": {"winPct": 0.0, "n": 0, "meanWinPctDiff": 0.0},
    "closeMatchupOppClosedEarly": {"winPct": 0.0, "n": 0},
    "closeMatchupOppWentLong": {"winPct": 0.0, "n": 0},
    "mirrorDeltaPts": 0.0
  },
  "entryRestBuckets": [{"label": "", "n": 0, "winPct": 0.0}],
  "bestOfFiveRound1Series": 0,
  "round1TotalSeries": 0
}
```

- [ ] **Step 1: Write the report script**

Create `ml/playoff_rest_report.py`:

```python
"""Playoff Rest — emit every figure the /playoffs page publishes.

READ-ONLY. Writes two files and nothing to the database:
    ml/playoff_rest_facts.json   machine-readable, pinned by a vitest test
    ml/PLAYOFF_REST_REPORT.md    human-readable, committed

Run from the project root:
    ./ml/.venv/bin/python ml/playoff_rest_report.py

PLAY-IN GAMES ARE EXCLUDED. `games.game_type <> 'regular'` includes play-in games, which are
single games that inflate the Game-1 bucket. The published equal-rest figure must count
playoff games only, so games are restricted to pairs of teams that actually meet in a
`playoff_series` row for that season.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2

ML_DIR = Path(__file__).resolve().parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from compute_series_features import resolve_database_url  # noqa: E402

REPO_ROOT = ML_DIR.parent
JSON_PATH = ML_DIR / "playoff_rest_facts.json"
MD_PATH = ML_DIR / "PLAYOFF_REST_REPORT.md"

# Grind buckets. "low" = closed early (0-1 games beyond a sweep), "high" = went long (2-3).
LOW, HIGH = (0, 1), (2, 3)
CLOSE_MATCHUP = 0.08  # |win_pct_diff| ceiling for the strength-controlled cut


def pct(hits: int, n: int) -> float:
    return round(100.0 * hits / n, 1) if n else 0.0


def load(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT season, round, home_court_team_id, opponent_team_id,
                   series_winner_team_id, home_court_wins, opponent_wins, is_best_of_7,
                   win_pct_diff::float8, entry_rest_diff::float8, prior_grind_diff::float8
            FROM playoff_series
            ORDER BY season, round, id
            """
        )
        series = cur.fetchall()

        # Only games between two teams that meet in a playoff_series row that season.
        # This is what excludes play-in games from the equal-rest figure.
        cur.execute(
            """
            WITH pairs AS (
              SELECT season,
                     least(home_court_team_id, opponent_team_id)    AS lo,
                     greatest(home_court_team_id, opponent_team_id) AS hi
              FROM playoff_series
            ),
            pg AS (
              SELECT g.id, g.season, g.date, g.home_team_id AS h, g.away_team_id AS a
              FROM games g
              JOIN pairs p
                ON p.season = g.season
               AND p.lo = least(g.home_team_id, g.away_team_id)
               AND p.hi = greatest(g.home_team_id, g.away_team_id)
              WHERE g.game_type <> 'regular' AND g.status = 'final'
            )
            SELECT pg.season, pg.date, pg.h, pg.a,
              pg.date - (SELECT max(x.date) FROM games x
                          WHERE x.status = 'final' AND x.season = pg.season
                            AND (x.home_team_id = pg.h OR x.away_team_id = pg.h)
                            AND x.date < pg.date) AS h_off,
              pg.date - (SELECT max(x.date) FROM games x
                          WHERE x.status = 'final' AND x.season = pg.season
                            AND (x.home_team_id = pg.a OR x.away_team_id = pg.a)
                            AND x.date < pg.date) AS a_off
            FROM pg
            ORDER BY pg.season, pg.date
            """
        )
        games = cur.fetchall()
    return series, games


def equal_rest(games) -> dict:
    """Game 1 vs Game 2+ equal-rest counts, play-in excluded."""
    seq: dict[tuple, int] = defaultdict(int)
    g1 = g1eq = later = latereq = 0
    for season, _date, h, a, h_off, a_off in games:
        key = (season, min(h, a), max(h, a))
        seq[key] += 1
        if h_off is None or a_off is None:
            continue
        is_first = seq[key] == 1
        same = h_off == a_off
        if is_first:
            g1 += 1
            g1eq += same
        else:
            later += 1
            latereq += same
    return {"game1Games": g1, "game1Equal": g1eq, "laterGames": later, "laterEqual": latereq}


def _grind_of(series, season, rnd, team):
    for s in series:
        if s[0] != season or s[1] != rnd:
            continue
        if team not in (s[2], s[3]):
            continue
        if s[5] is None or s[6] is None:
            return None
        return (s[5] + s[6]) - (4 if s[7] else 3)
    return None


def rounds2plus(series):
    """(y, own_grind, opp_grind, win_pct_diff) for resolved rounds-2+ series."""
    out = []
    for s in series:
        season, rnd, hc, opp, winner, _hw, _ow, _bo7, wpd, _rest, _pgd = s
        if rnd < 2 or winner is None or wpd is None:
            continue
        own = _grind_of(series, season, rnd - 1, hc)
        oth = _grind_of(series, season, rnd - 1, opp)
        if own is None or oth is None:
            continue
        out.append((int(winner == hc), own, oth, wpd))
    return out


def grind_matrix(rows) -> dict:
    def cell(own_bucket, opp_bucket):
        m = [r for r in rows if own_bucket[0] <= r[1] <= own_bucket[1]
             and opp_bucket[0] <= r[2] <= opp_bucket[1]]
        return {"winPct": pct(sum(r[0] for r in m), len(m)), "n": len(m)}

    return {
        "ownLowOppLow": cell(LOW, LOW),
        "ownLowOppHigh": cell(LOW, HIGH),
        "ownHighOppLow": cell(HIGH, LOW),
        "ownHighOppHigh": cell(HIGH, HIGH),
    }


def exogenous(rows) -> dict:
    own_low = [r for r in rows if LOW[0] <= r[1] <= LOW[1]]
    early = [r for r in own_low if r[2] <= LOW[1]]
    longg = [r for r in own_low if r[2] >= HIGH[0]]

    def blk(m):
        return {
            "winPct": pct(sum(r[0] for r in m), len(m)),
            "n": len(m),
            "meanWinPctDiff": round(sum(r[3] for r in m) / len(m), 4) if m else 0.0,
        }

    close = [r for r in rows if abs(r[3]) <= CLOSE_MATCHUP]
    c_early = [r for r in close if r[2] <= LOW[1]]
    c_long = [r for r in close if r[2] >= HIGH[0]]

    own_high = [r for r in rows if r[1] >= HIGH[0]]
    mh_early = [r for r in own_high if r[2] <= LOW[1]]
    mh_long = [r for r in own_high if r[2] >= HIGH[0]]

    return {
        "oppClosedEarly": blk(early),
        "oppWentLong": blk(longg),
        "closeMatchupOppClosedEarly": {"winPct": pct(sum(r[0] for r in c_early), len(c_early)), "n": len(c_early)},
        "closeMatchupOppWentLong": {"winPct": pct(sum(r[0] for r in c_long), len(c_long)), "n": len(c_long)},
        "mirrorDeltaPts": round(
            pct(sum(r[0] for r in mh_long), len(mh_long)) - pct(sum(r[0] for r in mh_early), len(mh_early)), 1
        ),
    }


def entry_rest_buckets(series) -> list[dict]:
    defs = [
        ("2 or more days short", lambda v: v <= -2),
        ("within a day either way", lambda v: -2 < v < 2),
        ("2 or more days rested", lambda v: v >= 2),
    ]
    out = []
    for label, keep in defs:
        m = [s for s in series if s[1] >= 2 and s[4] is not None and s[9] is not None and keep(s[9])]
        out.append({"label": label, "n": len(m), "winPct": pct(sum(1 for s in m if s[4] == s[2]), len(m))})
    return out


def main() -> None:
    conn = psycopg2.connect(resolve_database_url())
    try:
        series, games = load(conn)
    finally:
        conn.close()

    rows = rounds2plus(series)
    facts = {
        "generatedFrom": "playoff_series + games (play-in excluded)",
        "equalRest": equal_rest(games),
        "grindMatrix": grind_matrix(rows),
        "exogenous": exogenous(rows),
        "entryRestBuckets": entry_rest_buckets(series),
        "bestOfFiveRound1Series": sum(1 for s in series if s[1] == 1 and not s[7]),
        "round1TotalSeries": sum(1 for s in series if s[1] == 1),
    }
    JSON_PATH.write_text(json.dumps(facts, indent=2) + "\n")

    er = facts["equalRest"]
    gm = facts["grindMatrix"]
    ex = facts["exogenous"]
    md = [
        "# Playoff Rest — published figures",
        "",
        f"Generated by `ml/playoff_rest_report.py`. Rounds-2+ sample: **n = {len(rows)}**.",
        "",
        "## Equal rest (play-in excluded)",
        "",
        "| slot | games | equal rest | % equal |",
        "|---|---:|---:|---:|",
        f"| Game 1 | {er['game1Games']} | {er['game1Equal']} | {pct(er['game1Equal'], er['game1Games'])}% |",
        f"| Game 2+ | {er['laterGames']} | {er['laterEqual']} | {pct(er['laterEqual'], er['laterGames'])}% |",
        "",
        "## The Grind Tax (rounds 2+, grind = games beyond a sweep)",
        "",
        "| own \\ opponent | closed early (0-1) | went long (2-3) |",
        "|---|---:|---:|",
        f"| closed early (0-1) | {gm['ownLowOppLow']['winPct']}% (n={gm['ownLowOppLow']['n']}) "
        f"| {gm['ownLowOppHigh']['winPct']}% (n={gm['ownLowOppHigh']['n']}) |",
        f"| went long (2-3) | {gm['ownHighOppLow']['winPct']}% (n={gm['ownHighOppLow']['n']}) "
        f"| {gm['ownHighOppHigh']['winPct']}% (n={gm['ownHighOppHigh']['n']}) |",
        "",
        "## Confound test (own grind held at 0-1)",
        "",
        "| opponent's prior round | home-court wins | mean win% diff |",
        "|---|---:|---:|",
        f"| closed early | {ex['oppClosedEarly']['winPct']}% (n={ex['oppClosedEarly']['n']}) "
        f"| {ex['oppClosedEarly']['meanWinPctDiff']:+.4f} |",
        f"| went long | {ex['oppWentLong']['winPct']}% (n={ex['oppWentLong']['n']}) "
        f"| {ex['oppWentLong']['meanWinPctDiff']:+.4f} |",
        "",
        f"Close matchups only (|win% diff| <= {CLOSE_MATCHUP}): "
        f"{ex['closeMatchupOppClosedEarly']['winPct']}% (n={ex['closeMatchupOppClosedEarly']['n']}) -> "
        f"{ex['closeMatchupOppWentLong']['winPct']}% (n={ex['closeMatchupOppWentLong']['n']}).",
        "",
        f"Mirror check (own grind held at 2-3, vary the opponent): {ex['mirrorDeltaPts']:+.1f} points.",
        "",
        "## Format context",
        "",
        f"{facts['bestOfFiveRound1Series']} of {facts['round1TotalSeries']} Round 1 series were "
        "best-of-5, which is why grind is measured beyond a sweep rather than as raw games played.",
        "",
    ]
    MD_PATH.write_text("\n".join(md))
    print(json.dumps(facts, indent=2))
    print(f"\nwrote {JSON_PATH.relative_to(REPO_ROOT)} and {MD_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

Run: `./ml/.venv/bin/python ml/playoff_rest_report.py`

Expected: `equalRest.laterEqual == equalRest.laterGames` **exactly** (100% of Game 2+ on equal rest — this is the page's opening claim and it must be exact, not rounded). The rounds-2+ sample should be `n = 279`. `bestOfFiveRound1Series` should be `136`, `round1TotalSeries` `320`.

**If `laterEqual != laterGames`, stop and report.** The spec's headline claim is falsified and Section A cannot ship as written.

- [ ] **Step 3: Sanity-check the matrix against the spec**

Read `ml/PLAYOFF_REST_REPORT.md`. The Grind Tax cells should be close to 68.9 / 85.4 / 65.9 / 59.7 with n of 74 / 89 / 44 / 72. Small differences are acceptable (the spec's probe excluded rows with any NULL feature; this script only requires a winner and `win_pct_diff`). **Differences larger than 3 percentage points or 10 in any n mean the bucketing diverged — stop and reconcile before continuing.**

- [ ] **Step 4: Commit**

```bash
git add ml/playoff_rest_report.py ml/playoff_rest_facts.json ml/PLAYOFF_REST_REPORT.md
git commit -m "Emit the published Playoff Rest figures to a committed report"
```

---

### Task 4: Retrain the series model on `prior_grind_diff`

**Files:**
- Modify: `ml/train_series_model.py` (the `FEATURES` constant at line 50, the module docstring at lines 13-19, the `load_trainable` WHERE clause, and the report builder)
- Modify: `ml/PHASE3_REPORT.md` (add the round-split section)

**Interfaces:**
- Consumes: `playoff_series.prior_grind_diff` (Task 2).
- Produces: `FEATURES = ["seed_diff", "win_pct_diff", "prior_grind_diff", "h2h_diff"]` — imported by `ml/predict_series.py` (Task 5). Column order is fixed and load-bearing.

- [ ] **Step 1: Swap the feature and its NOT NULL guard**

In `ml/train_series_model.py`:

1. Change line 50 from `FEATURES = ["seed_diff", "win_pct_diff", "entry_rest_diff", "h2h_diff"]` to:

```python
# Column order is FIXED and load-bearing — predict_series.py imports this list and indexes
# into the same matrix. prior_grind_diff replaced entry_rest_diff (2026-07-31): the two
# correlate at r = 0.910, and in a joint fit the rest coefficient flips negative, which is a
# collinearity artifact rather than a finding. prior_grind_diff wins on accuracy, log-loss and
# Brier, and reads as a sentence a fan already understands.
#
# NOTE the sign inversion: every other feature here is (home-court - opponent), while
# prior_grind_diff is (opponent - home-court) so that positive still favors the home-court
# team. The coefficient is therefore expected POSITIVE like the others.
FEATURES = ["seed_diff", "win_pct_diff", "prior_grind_diff", "h2h_diff"]
```

2. In `load_trainable`, replace the `AND ps.entry_rest_diff IS NOT NULL` line with `AND ps.prior_grind_diff IS NOT NULL`, and replace `ps.entry_rest_diff::float8` in the SELECT with `ps.prior_grind_diff::float8`.

3. Update the docstring's feature line (around line 18) to read `[seed_diff, win_pct_diff, prior_grind_diff, h2h_diff]`.

- [ ] **Step 2: Carry rounds and seasons through the walk-forward**

`Dataset` (line 87) already has `rounds` and `seasons`; `WalkForwardResult` (line 163) does not carry them through to the pooled arrays. Two small edits fix that.

In `WalkForwardResult`, add two fields after `pooled_p`:

```python
    # Aligned row-for-row with pooled_y / pooled_p, so any pooled metric can be re-sliced
    # after the fact. Added 2026-07-31 for the round split, which is the model's real claim.
    pooled_rounds: np.ndarray
    pooled_seasons: np.ndarray
```

In `walk_forward`, add two accumulators beside `pooled_y` / `pooled_p`:

```python
    pooled_rounds: list[int] = []
    pooled_seasons: list[str] = []
```

extend them inside the loop, immediately after the existing two `.extend(...)` calls:

```python
        pooled_rounds.extend(ds.rounds[te].tolist())
        pooled_seasons.extend(ds.seasons[te].tolist())
```

and pass them in the `return WalkForwardResult(...)`:

```python
        pooled_rounds=np.array(pooled_rounds, dtype=int),
        pooled_seasons=np.array(pooled_seasons, dtype=object),
```

- [ ] **Step 3: Add the round-split report block**

Add this function to `ml/train_series_model.py`, above the report builder (the function that writes `ml/phase3_results.txt`):

```python
def round_split_block(res: WalkForwardResult) -> list[str]:
    """Accuracy and log-loss split by round, plus the per-season paired record versus the
    always-home-court rule in rounds 2+.

    The split IS the headline. Pooled over all rounds this model beats the one-line rule by
    about +0.2 points, which is noise — and that pooling is what hides the real result: the
    model gains where a prior round exists to have been ground down by, and loses in Round 1
    where it does not. Reporting only the pooled figure understates it in one direction and
    reporting only rounds 2+ would overstate it in the other, so both ship.
    """
    lines = ["", "── Round split (walk-forward, out-of-sample) ──", ""]
    lines.append(
        f"  {'slice':<12}{'n':>5}{'model acc':>11}{'always-HC':>11}{'log-loss':>11}{'base LL':>10}"
    )
    for label, mask in (
        ("round 1", res.pooled_rounds == 1),
        ("rounds 2+", res.pooled_rounds >= 2),
    ):
        n = int(mask.sum())
        if n == 0:
            continue
        t, p = res.pooled_y[mask], res.pooled_p[mask]
        base = np.full(n, t.mean())
        lines.append(
            f"  {label:<12}{n:>5}{(t == (p >= 0.5)).mean() * 100:>10.1f}%"
            f"{t.mean() * 100:>10.1f}%"
            f"{log_loss(t, p):>11.4f}{log_loss(t, base, labels=[0, 1]):>10.4f}"
        )

    wins = ties = losses = 0
    m2 = res.pooled_rounds >= 2
    for szn in sorted(set(res.pooled_seasons[m2].tolist())):
        sel = m2 & (res.pooled_seasons == szn)
        if not sel.any():
            continue
        model_acc = (res.pooled_y[sel] == (res.pooled_p[sel] >= 0.5)).mean()
        base_acc = res.pooled_y[sel].mean()  # always-home-court accuracy on that slice
        wins += model_acc > base_acc
        ties += model_acc == base_acc
        losses += model_acc < base_acc

    lines += [
        "",
        f"  per-season paired record vs always-home-court, ROUNDS 2+: "
        f"{wins} win / {ties} tie / {losses} loss",
        "  (the pooled accuracy gap is only about 8 series — the paired record is the evidence",
        "   that carries, and it is the test §5 of PHASE3_REPORT.md already argues for)",
    ]
    return lines
```

`log_loss` is already imported at the top of the module (it is used by `fold_metrics`); if it is not, add `from sklearn.metrics import log_loss`.

Call it from the report builder, appending its lines for the chosen model of record (the unregularized logistic result — the same `WalkForwardResult` whose pooled metrics the ladder table already prints).

- [ ] **Step 4: Retrain and read the results**

Run: `./ml/.venv/bin/python ml/train_series_model.py`

Expected in `ml/phase3_results.txt`: pooled accuracy ≈ 75.3%, log-loss ≈ 0.4939, Brier ≈ 0.1628. Round split: rounds 2+ ≈ 73.3% model vs ≈ 69.5% always-home-court; Round 1 ≈ 77.1% model vs ≈ 78.8% always-home-court. Per-season rounds-2+ record ≈ 11 / 16 / 3.

**Read the numbers out of the file rather than from terminal scrollback**, matching the existing report's own discipline. If pooled accuracy is below 74.4% (the always-home-court baseline), stop and report — the swap has regressed the model and the plan's premise needs rechecking.

- [ ] **Step 5: Update the Phase 3 report**

Edit `ml/PHASE3_REPORT.md`:
- In §1's feature row, change `entry_rest_diff` to `prior_grind_diff` and note the swap date.
- Add a new §3a "Round split" carrying the table from Step 3's output verbatim, plus this sentence: "Pooling the two halves is what produced the earlier '+0.2 points, inside noise' headline: Round 1, where the model has nothing to say, dilutes rounds 2+, where it does."
- In §4, replace the `entry_rest_diff` coefficient row with the newly printed `prior_grind_diff` row, and keep the note that all coefficients are positive (the inverted sign convention preserves this).
- In §5, replace the "Rest specifically" bullet with one describing `prior_grind_diff` and the round split.

- [ ] **Step 6: Commit**

```bash
git add ml/train_series_model.py ml/PHASE3_REPORT.md
git commit -m "Retrain the playoff series model on prior-round grind and report by round"
```

---

### Task 5: Write predictions under a new model version

**Files:**
- Modify: `ml/predict_series.py` (`MODEL_VERSION` at line 55, the `load_trainable` SELECT and WHERE)

**Interfaces:**
- Consumes: `FEATURES` from `ml/train_series_model.py` (Task 4).
- Produces: rows in `playoff_series_predictions` with `model_version = 'logistic_grind_v2'` for both `full_insample` and `walk_forward_oos`.

- [ ] **Step 1: Bump the model version and swap the feature**

In `ml/predict_series.py`:

```python
# Bumped from logistic_unreg_v1 (2026-07-31) when entry_rest_diff was replaced by
# prior_grind_diff. The UNIQUE is (series_id, prediction_method, model_version), so the v1
# rows coexist untouched and stay auditable — this is a new version, not an overwrite.
MODEL_VERSION = "logistic_grind_v2"
```

In `load_trainable`, replace `ps.entry_rest_diff::float8` with `ps.prior_grind_diff::float8` and `AND ps.entry_rest_diff IS NOT NULL` with `AND ps.prior_grind_diff IS NOT NULL`.

- [ ] **Step 2: Dry-run**

Run: `./ml/.venv/bin/python ml/predict_series.py --dry-run`

Expected: the dry-run report prints `model_version : logistic_grind_v2` and roughly 599 rows for `full_insample`, 450 for `walk_forward_oos`. Confirm the accuracy figures in the dry-run match Task 4's report — a mismatch means the two scripts disagree about the feature matrix.

- [ ] **Step 3: Write for real**

Run: `./ml/.venv/bin/python ml/predict_series.py`

Then verify both versions coexist:

```bash
./ml/.venv/bin/python -c "
import sys; sys.path.insert(0, 'ml')
from compute_series_features import resolve_database_url
import psycopg2
c = psycopg2.connect(resolve_database_url()); cur = c.cursor()
cur.execute('SELECT model_version, prediction_method, count(*) FROM playoff_series_predictions GROUP BY 1,2 ORDER BY 1,2')
for r in cur.fetchall(): print(r)
c.close()"
```

Expected: four rows — `logistic_unreg_v1` and `logistic_grind_v2`, each with `full_insample` and `walk_forward_oos`. The v1 counts must be unchanged.

- [ ] **Step 4: Commit**

```bash
git add ml/predict_series.py
git commit -m "Write playoff series predictions under model version logistic_grind_v2"
```

---

### Task 6: TypeScript facts module pinned to the JSON

**Files:**
- Create: `src/lib/playoff-rest-facts.ts`
- Create: `src/lib/__tests__/playoff-rest-facts.test.ts`
- Modify: `src/lib/playoff-model-metrics.ts`

**Interfaces:**
- Consumes: `ml/playoff_rest_facts.json` (Task 3), `ml/phase3_results.txt` figures (Task 4).
- Produces:
  - `PLAYOFF_EQUAL_REST: { game1Games, game1Equal, laterGames, laterEqual }`
  - `PLAYOFF_GRIND_MATRIX: { ownLowOppLow, ownLowOppHigh, ownHighOppLow, ownHighOppHigh }` where each cell is `{ winPct: number; n: number }`
  - `PLAYOFF_GRIND_EXOGENOUS: { oppClosedEarly, oppWentLong, closeMatchupOppClosedEarly, closeMatchupOppWentLong, mirrorDeltaPts }`
  - `PLAYOFF_ENTRY_REST_BUCKETS: ReadonlyArray<{ label: string; n: number; winPct: number }>`
  - `PLAYOFF_BEST_OF_FIVE: { round1BestOfFive: number; round1Total: number }`
  - `PLAYOFF_ROUND_SPLIT: { roundsTwoPlus, roundOne }` where each is `{ n, model, baseline, logLoss, baselineLogLoss }`
  - `PLAYOFF_ROUNDS_TWO_PLUS_RECORD: { win: number; tie: number; loss: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/playoff-rest-facts.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYOFF_BEST_OF_FIVE,
  PLAYOFF_ENTRY_REST_BUCKETS,
  PLAYOFF_EQUAL_REST,
  PLAYOFF_GRIND_EXOGENOUS,
  PLAYOFF_GRIND_MATRIX,
  PLAYOFF_ROUND_SPLIT,
  PLAYOFF_ROUNDS_TWO_PLUS_RECORD,
} from "@/lib/playoff-rest-facts";

/**
 * These constants are the page's published numbers. They are generated by
 * `ml/playoff_rest_report.py` and hand-mirrored here, so this test is the thing that stops
 * the two drifting apart — a figure edited in a component and nowhere else is exactly the
 * failure mode this file exists to prevent.
 */
const facts = JSON.parse(
  readFileSync(join(process.cwd(), "ml", "playoff_rest_facts.json"), "utf8")
);

describe("playoff rest facts mirror the generated report", () => {
  it("equal-rest counts match", () => {
    expect(PLAYOFF_EQUAL_REST).toEqual(facts.equalRest);
  });

  it("the grind matrix matches", () => {
    expect(PLAYOFF_GRIND_MATRIX).toEqual(facts.grindMatrix);
  });

  it("the exogenous block matches", () => {
    expect(PLAYOFF_GRIND_EXOGENOUS).toEqual(facts.exogenous);
  });

  it("the entry-rest buckets match", () => {
    expect(PLAYOFF_ENTRY_REST_BUCKETS).toEqual(facts.entryRestBuckets);
  });

  it("the best-of-five context matches", () => {
    expect(PLAYOFF_BEST_OF_FIVE.round1BestOfFive).toBe(facts.bestOfFiveRound1Series);
    expect(PLAYOFF_BEST_OF_FIVE.round1Total).toBe(facts.round1TotalSeries);
  });
});

describe("the claims the page makes are actually true of the data", () => {
  it("every playoff game after game 1 is on equal rest", () => {
    // Section A's headline is an exact claim, not a rounded one. If this ever fails the
    // section is false and must not ship.
    expect(PLAYOFF_EQUAL_REST.laterEqual).toBe(PLAYOFF_EQUAL_REST.laterGames);
    expect(PLAYOFF_EQUAL_REST.laterGames).toBeGreaterThan(2000);
  });

  it("game 1 is where the asymmetry lives", () => {
    expect(PLAYOFF_EQUAL_REST.game1Equal).toBeLessThan(PLAYOFF_EQUAL_REST.game1Games);
  });

  it("the fresh-vs-tired cell is the highest in the matrix", () => {
    const { ownLowOppHigh, ownLowOppLow, ownHighOppLow, ownHighOppHigh } = PLAYOFF_GRIND_MATRIX;
    for (const other of [ownLowOppLow, ownHighOppLow, ownHighOppHigh]) {
      expect(ownLowOppHigh.winPct).toBeGreaterThan(other.winPct);
    }
  });

  it("the effect survives the strength control", () => {
    expect(PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppWentLong.winPct).toBeGreaterThan(
      PLAYOFF_GRIND_EXOGENOUS.closeMatchupOppClosedEarly.winPct
    );
  });

  it("the model beats the one-line rule in rounds 2+ and loses in round 1", () => {
    // Section D publishes both halves. If either direction flips, the section's copy is wrong.
    expect(PLAYOFF_ROUND_SPLIT.roundsTwoPlus.model).toBeGreaterThan(
      PLAYOFF_ROUND_SPLIT.roundsTwoPlus.baseline
    );
    expect(PLAYOFF_ROUND_SPLIT.roundOne.model).toBeLessThan(PLAYOFF_ROUND_SPLIT.roundOne.baseline);
  });

  it("the paired record is a majority of decided seasons", () => {
    const { win, loss } = PLAYOFF_ROUNDS_TWO_PLUS_RECORD;
    expect(win).toBeGreaterThan(loss);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/lib/__tests__/playoff-rest-facts.test.ts`
Expected: FAIL — cannot resolve `@/lib/playoff-rest-facts`.

- [ ] **Step 3: Write the facts module**

Create `src/lib/playoff-rest-facts.ts`. **Fill every number from `ml/playoff_rest_facts.json` and `ml/phase3_results.txt` — do not copy the illustrative values below without checking them against the generated files.**

```ts
/**
 * Every figure the /playoffs page publishes.
 *
 * These are constants because they describe a fitted model and a finished measurement, not a
 * query: they change only when `ml/playoff_rest_report.py` or `ml/train_series_model.py` is
 * re-run. `src/lib/__tests__/playoff-rest-facts.test.ts` pins this file against
 * `ml/playoff_rest_facts.json`, so a number edited here and nowhere else fails the suite.
 *
 * Why one home: the previous version of this page retyped its figures into a component, a
 * method page and a README, and they drifted.
 */

/** One cell of the grind matrix: home-court series win rate and the series behind it. */
export interface GrindCell {
  /** 0-100, one decimal. */
  winPct: number;
  n: number;
}

/**
 * Equal-rest counts across playoff games, play-in excluded.
 *
 * The Game 2+ figure is the page's opening claim and it is exact: after Game 1 the two teams
 * are playing each other, so they share a schedule by construction.
 */
export const PLAYOFF_EQUAL_REST = Object.freeze({
  game1Games: 0,
  game1Equal: 0,
  laterGames: 0,
  laterEqual: 0,
});

/**
 * The Grind Tax. Rows are the home-court team's own prior-round grind, columns its opponent's.
 * "Low" = closed early (0-1 games beyond a sweep), "high" = went long (2-3).
 *
 * The bottom row matters as much as the lit cell: when the home-court team also went long, the
 * opponent's grind stops helping and reverses. That is the signature of a differential rather
 * than of "long series are bad in the absolute".
 */
export const PLAYOFF_GRIND_MATRIX = Object.freeze({
  ownLowOppLow: Object.freeze({ winPct: 0, n: 0 }) as GrindCell,
  ownLowOppHigh: Object.freeze({ winPct: 0, n: 0 }) as GrindCell,
  ownHighOppLow: Object.freeze({ winPct: 0, n: 0 }) as GrindCell,
  ownHighOppHigh: Object.freeze({ winPct: 0, n: 0 }) as GrindCell,
});

/**
 * The confound test. The opponent's prior-round length is decided by two other teams, so it is
 * exogenous to the home-court team — unlike its own closeout speed, which is confounded with
 * being good.
 *
 * `meanWinPctDiff` is published alongside because the "went long" group is nominally stronger
 * on record, so the headline gap is partly strength. The close-matchup pair is the number the
 * claim actually rests on.
 */
export const PLAYOFF_GRIND_EXOGENOUS = Object.freeze({
  oppClosedEarly: Object.freeze({ winPct: 0, n: 0, meanWinPctDiff: 0 }),
  oppWentLong: Object.freeze({ winPct: 0, n: 0, meanWinPctDiff: 0 }),
  closeMatchupOppClosedEarly: Object.freeze({ winPct: 0, n: 0 }) as GrindCell,
  closeMatchupOppWentLong: Object.freeze({ winPct: 0, n: 0 }) as GrindCell,
  /** Holding own grind high and varying the opponent's: the effect goes the wrong way. */
  mirrorDeltaPts: 0,
});

/** Corroboration from a second angle: series win rate by the layoff into Game 1, rounds 2+. */
export const PLAYOFF_ENTRY_REST_BUCKETS = Object.freeze([
  Object.freeze({ label: "", n: 0, winPct: 0 }),
]);

/**
 * Why grind is measured beyond a sweep rather than as raw games played: in a best-of-5, five
 * games means going the full distance; in a best-of-7 it means closing early.
 */
export const PLAYOFF_BEST_OF_FIVE = Object.freeze({
  round1BestOfFive: 0,
  round1Total: 0,
});

/** One side of the round split. Accuracies are 0-100 with one decimal; losses are raw. */
export interface RoundSplitSlice {
  n: number;
  /** Model accuracy, 0-100. */
  model: number;
  /** Always-pick-the-home-court-team accuracy, 0-100. */
  baseline: number;
  logLoss: number;
  baselineLogLoss: number;
}

/**
 * The model's real claim. It gains where a prior round exists to have been ground down by, and
 * loses in Round 1 where it does not. Pooling the two halves is what produced the earlier
 * "+0.2 points, inside noise" headline.
 */
export const PLAYOFF_ROUND_SPLIT = Object.freeze({
  roundsTwoPlus: Object.freeze({
    n: 0,
    model: 0,
    baseline: 0,
    logLoss: 0,
    baselineLogLoss: 0,
  }) as RoundSplitSlice,
  roundOne: Object.freeze({
    n: 0,
    model: 0,
    baseline: 0,
    logLoss: 0,
    baselineLogLoss: 0,
  }) as RoundSplitSlice,
});

/**
 * Per-season paired record against the always-home-court rule in rounds 2+.
 *
 * The pooled accuracy gap is about eight series, so the pooled number alone is not evidence.
 * The paired record is what carries the claim — and it is the test `ml/PHASE3_REPORT.md` §5
 * already argues is the right one here.
 */
export const PLAYOFF_ROUNDS_TWO_PLUS_RECORD = Object.freeze({ win: 0, tie: 0, loss: 0 });
```

- [ ] **Step 4: Fill in the real values and run the test**

Read `ml/playoff_rest_facts.json` and `ml/phase3_results.txt`, replace every zero above with the generated value, then run:

Run: `pnpm test:run src/lib/__tests__/playoff-rest-facts.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Retire the superseded accuracy constants**

`src/lib/playoff-model-metrics.ts` currently exports `PLAYOFF_MODEL_ACCURACY`, `PLAYOFF_MODEL_CALIBRATION` and `PLAYOFF_MODEL_EVAL`, all describing the v1 model. `PLAYOFF_MODEL_EVAL` is still true of the walk-forward span and stays. Update `PLAYOFF_MODEL_CALIBRATION` and `PLAYOFF_MODEL_ACCURACY` to the v2 figures from `ml/phase3_results.txt`, and add to the file's top docstring:

```
 * As of 2026-07-31 these describe the `logistic_grind_v2` model (prior_grind_diff replaced
 * entry_rest_diff). The page no longer headlines them — see `playoff-rest-facts.ts`, which
 * holds the round split that is now the model's claim — but they remain the pooled figures
 * and the method page still quotes them.
```

- [ ] **Step 6: Full verification and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all clean.

```bash
git add src/lib/playoff-rest-facts.ts src/lib/__tests__/playoff-rest-facts.test.ts src/lib/playoff-model-metrics.ts
git commit -m "Add the Playoff Rest facts module pinned to the generated report"
```

---

### Task 7: Surface grind through the type, query and API

**Files:**
- Modify: `src/types/index.ts:194-217` (`PlayoffSeriesWithPredictions`)
- Modify: `src/lib/db/queries.ts:909-957` (`mapRowToPlayoffSeriesWithPredictions`) and `:976-1027` (`getPlayoffSeriesWithPredictions`)

**Interfaces:**
- Consumes: `playoffSeries.priorGrindDiff` (Task 1).
- Produces: three new fields on `PlayoffSeriesWithPredictions`, consumed by Task 10:
  - `priorGrindDiff: number | null`
  - `homeCourtPriorGames: number | null` — games the home-court team played in its previous round; `null` in Round 1 and wherever unresolved
  - `opponentPriorGames: number | null`

`homeCourtPriorGames` / `opponentPriorGames` are raw games played, **not** grind, because the card says "closed in 5" / "survived a 7" — the number a fan recognises. Grind is the modelling quantity; games played is the display quantity. Both ship so neither has to be derived in a component.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/playoff-prior-games.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { priorRoundGamesLabel } from "@/lib/playoff-rest-facts";

describe("priorRoundGamesLabel", () => {
  it("names a sweep", () => {
    expect(priorRoundGamesLabel(4, true)).toBe("swept in 4");
  });

  it("names a best-of-five sweep", () => {
    expect(priorRoundGamesLabel(3, false)).toBe("swept in 3");
  });

  it("names an early close", () => {
    expect(priorRoundGamesLabel(5, true)).toBe("closed in 5");
  });

  it("names going the full distance in a best-of-seven", () => {
    expect(priorRoundGamesLabel(7, true)).toBe("survived a 7");
  });

  it("names going the full distance in a best-of-five", () => {
    expect(priorRoundGamesLabel(5, false)).toBe("survived a 5");
  });

  it("returns null in round 1, where there is no prior round", () => {
    expect(priorRoundGamesLabel(null, true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run src/lib/__tests__/playoff-prior-games.test.ts`
Expected: FAIL — `priorRoundGamesLabel` is not exported.

- [ ] **Step 3: Add the label helper**

Append to `src/lib/playoff-rest-facts.ts`:

```ts
/**
 * How a series card names a team's previous round.
 *
 * Games played, not grind: "survived a 7" is a phrase a fan already owns, while "grind 3" is
 * modelling vocabulary. The format matters for the wording as much as for the arithmetic — in
 * a best-of-5, five games IS the full distance.
 */
export function priorRoundGamesLabel(
  gamesPlayed: number | null,
  isBestOf7: boolean
): string | null {
  if (gamesPlayed === null) return null;
  const sweep = isBestOf7 ? 4 : 3;
  const distance = isBestOf7 ? 7 : 5;
  if (gamesPlayed <= sweep) return `swept in ${gamesPlayed}`;
  if (gamesPlayed >= distance) return `survived a ${gamesPlayed}`;
  return `closed in ${gamesPlayed}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run src/lib/__tests__/playoff-prior-games.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Extend the API type**

In `src/types/index.ts`, inside `PlayoffSeriesWithPredictions`, after the `h2hDiff` line:

```ts
  /**
   * Opponent's prior-round grind minus the home-court team's, where grind is games beyond a
   * sweep. Positive favors the home-court team — the sign is inverted versus the other diffs
   * on purpose so that "positive is good for home court" holds for every one of them.
   */
  priorGrindDiff: number | null;
  /** Games the home-court team played in its previous round. null in Round 1. */
  homeCourtPriorGames: number | null;
  /** Games the opponent played in its previous round. null in Round 1. */
  opponentPriorGames: number | null;
```

- [ ] **Step 6: Extend the query**

In `src/lib/db/queries.ts`:

1. Add `priorGrindDiff: playoffSeries.priorGrindDiff,` to the `.select({...})` in `getPlayoffSeriesWithPredictions`, next to `h2hDiff`.

2. Prior-round games need a second, tiny query rather than a self-join — the join condition ("the series in round N−1 that this team appeared in") is not expressible as a simple `ON` clause and a lateral would be harder to read than a second pass. Add this above `getPlayoffSeriesWithPredictions`:

```ts
/**
 * Games each team played in the round before, keyed by `${round}:${teamId}`, for one season.
 *
 * A separate small query rather than a lateral join: "the series in round N−1 that this team
 * appeared in" is a lookup over the same season's rows, and the season's row count is 15, so
 * resolving it in memory is both clearer and cheaper than expressing it in SQL.
 */
async function priorRoundGamesBySeason(season: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      round: playoffSeries.round,
      homeCourtTeamId: playoffSeries.homeCourtTeamId,
      opponentTeamId: playoffSeries.opponentTeamId,
      homeCourtWins: playoffSeries.homeCourtWins,
      opponentWins: playoffSeries.opponentWins,
    })
    .from(playoffSeries)
    .where(eq(playoffSeries.season, season));

  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.homeCourtWins === null || r.opponentWins === null) continue;
    const played = r.homeCourtWins + r.opponentWins;
    // Keyed by the round the value is consumed IN, i.e. one after the round it was played in.
    out.set(`${r.round + 1}:${r.homeCourtTeamId}`, played);
    out.set(`${r.round + 1}:${r.opponentTeamId}`, played);
  }
  return out;
}
```

3. In `getPlayoffSeriesWithPredictions`, before the final `return`, resolve the map and pass it to the mapper:

```ts
  const priorGames = await priorRoundGamesBySeason(season);
  return rows.map((row) => mapRowToPlayoffSeriesWithPredictions(row, priorGames));
```

4. Change `mapRowToPlayoffSeriesWithPredictions`'s signature to `(row: PlayoffSeriesJoinRow, priorGames: Map<string, number>)` and add to the returned object, after `h2hDiff`:

```ts
    priorGrindDiff: row.priorGrindDiff !== null ? parseFloat(row.priorGrindDiff) : null,
    homeCourtPriorGames: priorGames.get(`${row.round}:${row.homeCourtTeamId}`) ?? null,
    opponentPriorGames: priorGames.get(`${row.round}:${row.opponentTeamId}`) ?? null,
```

5. Add `priorGrindDiff: string | null;` to the `PlayoffSeriesJoinRow` type if it is declared explicitly; if it is inferred from the select, no change is needed.

- [ ] **Step 7: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all clean.

```bash
git add src/types/index.ts src/lib/db/queries.ts src/lib/playoff-rest-facts.ts src/lib/__tests__/playoff-prior-games.test.ts
git commit -m "Serve prior-round grind and games played from the playoffs API"
```

---

### Task 8: The Grind Tax matrix component

**Files:**
- Create: `src/components/playoff-grind-matrix.tsx`
- Create: `src/components/__tests__/playoff-grind-matrix.test.ts`

**Interfaces:**
- Consumes: `PLAYOFF_GRIND_MATRIX`, `GrindCell` from `@/lib/playoff-rest-facts`.
- Produces: `<PlayoffGrindMatrix />` (no props — it renders the published constants) and `grindCellTone(cell: GrindCell, all: GrindCell[]) -> "lit" | "plain"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/playoff-grind-matrix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { grindCellTone } from "@/components/playoff-grind-matrix";

const cell = (winPct: number, n = 50) => ({ winPct, n });

describe("grindCellTone", () => {
  it("lights only the highest cell", () => {
    const all = [cell(63), cell(85.4), cell(66), cell(60)];
    expect(grindCellTone(all[1], all)).toBe("lit");
    expect(grindCellTone(all[0], all)).toBe("plain");
    expect(grindCellTone(all[2], all)).toBe("plain");
    expect(grindCellTone(all[3], all)).toBe("plain");
  });

  it("lights nothing when the cells are tied, rather than lighting two", () => {
    // A tie means there is no story to point at. Highlighting both would assert one.
    const all = [cell(70), cell(70), cell(60), cell(55)];
    expect(all.every((c) => grindCellTone(c, all) === "plain")).toBe(true);
  });

  it("ignores cells with too few series to mean anything", () => {
    // A 100% cell built from 3 series is noise, not the finding.
    const all = [cell(100, 3), cell(85.4, 89), cell(66, 44), cell(60, 72)];
    expect(grindCellTone(all[1], all)).toBe("lit");
    expect(grindCellTone(all[0], all)).toBe("plain");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run src/components/__tests__/playoff-grind-matrix.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the component**

Create `src/components/playoff-grind-matrix.tsx`:

```tsx
import { PLAYOFF_GRIND_MATRIX, type GrindCell } from "@/lib/playoff-rest-facts"
import { TERM_ACCENT, termCardStyle } from "@/lib/terminal-styles"

/** Below this a cell's rate is noise and must not be presented as the finding. */
const MIN_MEANINGFUL_N = 20

/**
 * Exactly one cell carries the accent, and only when it is unambiguously the highest.
 *
 * A tie lights nothing rather than lighting both: highlighting two cells asserts a story the
 * data has not picked. A small-n cell is never lit however high it reads.
 */
export function grindCellTone(cell: GrindCell, all: GrindCell[]): "lit" | "plain" {
  const eligible = all.filter((c) => c.n >= MIN_MEANINGFUL_N)
  if (eligible.length === 0) return "plain"
  const top = Math.max(...eligible.map((c) => c.winPct))
  if (eligible.filter((c) => c.winPct === top).length !== 1) return "plain"
  return cell.n >= MIN_MEANINGFUL_N && cell.winPct === top ? "lit" : "plain"
}

function Cell({ cell, all }: { cell: GrindCell; all: GrindCell[] }) {
  const lit = grindCellTone(cell, all) === "lit"
  return (
    <td
      className="tabular-nums"
      style={{
        padding: "14px 12px",
        textAlign: "right",
        background: lit ? "var(--term-surface-2)" : "transparent",
        borderTop: `2px solid ${lit ? TERM_ACCENT.blue : "transparent"}`,
        borderLeft: "1px solid var(--term-border)",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: lit ? 26 : 20,
          fontWeight: 700,
          color: lit ? "var(--term-blue)" : "var(--term-text)",
          lineHeight: 1.1,
        }}
      >
        {cell.winPct.toFixed(1)}%
      </span>
      <span
        className="mono block"
        style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em", marginTop: 2 }}
      >
        {cell.n} SERIES
      </span>
    </td>
  )
}

const ROW_HEAD: React.CSSProperties = {
  padding: "14px 12px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--term-text)",
}

/**
 * The Grind Tax, rounds 2+. Rows are the home-court team's own prior-round grind, columns its
 * opponent's; every cell is the home-court team's series win rate.
 *
 * The bottom row is not filler. When the home-court team also went long, the opponent's grind
 * stops helping and reverses — a differential, not "long series are bad in the absolute", and
 * the one thing here a revealed-weakness story does not predict.
 */
export function PlayoffGrindMatrix() {
  const m = PLAYOFF_GRIND_MATRIX
  const all = [m.ownLowOppLow, m.ownLowOppHigh, m.ownHighOppLow, m.ownHighOppHigh]

  return (
    <div style={termCardStyle}>
      {/* Scrolls inside its own box so the page body never scrolls sideways on a phone. */}
      <div style={{ overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 420 }}>
          <caption
            className="mono"
            style={{
              captionSide: "top",
              textAlign: "left",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "var(--term-text-muted)",
              fontWeight: 700,
              paddingBottom: 10,
            }}
          >
            HOME-COURT TEAM&rsquo;S SERIES WIN RATE · ROUNDS 2+
          </caption>
          <thead>
            <tr>
              <th style={{ ...ROW_HEAD, color: "var(--term-text-muted)", fontSize: 11, letterSpacing: "0.08em" }}>
                THEIR LAST ROUND →
              </th>
              <th className="mono" style={{ ...ROW_HEAD, textAlign: "right", fontSize: 11, letterSpacing: "0.06em", color: "var(--term-text-muted)" }}>
                CLOSED IT EARLY
              </th>
              <th className="mono" style={{ ...ROW_HEAD, textAlign: "right", fontSize: 11, letterSpacing: "0.06em", color: "var(--term-text-muted)" }}>
                WENT THE DISTANCE
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: "1px solid var(--term-border)" }}>
              <th scope="row" style={ROW_HEAD}>You closed it early</th>
              <Cell cell={m.ownLowOppLow} all={all} />
              <Cell cell={m.ownLowOppHigh} all={all} />
            </tr>
            <tr style={{ borderTop: "1px solid var(--term-border)" }}>
              <th scope="row" style={ROW_HEAD}>You went the distance</th>
              <Cell cell={m.ownHighOppLow} all={all} />
              <Cell cell={m.ownHighOppHigh} all={all} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3" style={{ fontSize: 15, color: "var(--term-text-muted)", lineHeight: 1.55, maxWidth: "42rem" }}>
        &ldquo;Closed it early&rdquo; means a team won its previous round within one game of a
        sweep; &ldquo;went the distance&rdquo; means it needed the last game or the one before
        it. Measured that way rather than by raw games played because a five-game
        best-of-five went the distance while a five-game best-of-seven did not.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run src/components/__tests__/playoff-grind-matrix.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all clean.

```bash
git add src/components/playoff-grind-matrix.tsx src/components/__tests__/playoff-grind-matrix.test.ts
git commit -m "Add the Grind Tax matrix component"
```

---

### Task 9: Argument sections A, C and D

**Files:**
- Create: `src/components/playoff-rest-sections.tsx`
- Modify: `src/app/playoffs/page.tsx`

**Interfaces:**
- Consumes: everything from `@/lib/playoff-rest-facts`, plus `<PlayoffGrindMatrix />` (Task 8).
- Produces: `<PlayoffRestArgument />` — a server component rendering sections A, B (by embedding the matrix), C and D. No props, no client state, no data fetching.

- [ ] **Step 1: Write the sections component**

Create `src/components/playoff-rest-sections.tsx`. Every figure comes from the imported constants — **no literal numbers in the JSX except the bucket boundaries the constants do not carry.**

```tsx
import { PlayoffGrindMatrix } from "@/components/playoff-grind-matrix"
import {
  PLAYOFF_BEST_OF_FIVE,
  PLAYOFF_ENTRY_REST_BUCKETS,
  PLAYOFF_EQUAL_REST,
  PLAYOFF_GRIND_EXOGENOUS,
  PLAYOFF_GRIND_MATRIX,
  PLAYOFF_ROUND_SPLIT,
  PLAYOFF_ROUNDS_TWO_PLUS_RECORD,
} from "@/lib/playoff-rest-facts"
import { termCardStyle, termTdStyle, termThStyle } from "@/lib/terminal-styles"

const BODY: React.CSSProperties = {
  fontSize: 15,
  color: "var(--term-text-muted)",
  lineHeight: 1.55,
  maxWidth: "42rem",
}
const LEAD = { color: "var(--term-text)", fontWeight: 600 } as const

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono flex items-center gap-3 py-1" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)" }}>
      <span style={{ fontWeight: 700 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "var(--term-border)" }} />
    </div>
  )
}

/**
 * Section A — the fact that justifies this page existing separately from /analysis.
 *
 * Deliberately the smallest section on the page: one number, why it is structural, and the one
 * exception. The claim is exact rather than rounded, which is why the facts test asserts
 * equality rather than a threshold.
 */
function NoRestSection() {
  const { laterGames, laterEqual, game1Games, game1Equal } = PLAYOFF_EQUAL_REST
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>THE POSTSEASON HAS NO REST</SectionHeading>
      <div style={termCardStyle}>
        <span
          className="mono tabular-nums block"
          style={{ fontSize: 40, fontWeight: 700, color: "var(--term-text)", lineHeight: 1.05 }}
        >
          {laterEqual.toLocaleString()} of {laterGames.toLocaleString()}
        </span>
        <span className="mono block" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700, marginTop: 6 }}>
          PLAYOFF GAMES AFTER GAME 1, BOTH TEAMS ON THE SAME REST
        </span>
        <p className="mt-3" style={BODY}>
          <span style={LEAD}>Every single one.</span> Once a series starts, the two teams are
          playing each other — so they are on the same schedule, and neither can be more rested
          than the other. Rest, the thing the rest of this site measures, has exactly one place
          to exist in the playoffs: the wait before Game 1.
        </p>
        <p className="mt-2" style={BODY}>
          That wait is where the whole story is. Only {game1Equal} of {game1Games} Game 1s were
          played with both teams equally rested.
        </p>
      </div>
    </section>
  )
}

/** Section B — the finding. The matrix carries it; the layoff buckets corroborate from a second angle. */
function GrindTaxSection() {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>THE GRIND TAX</SectionHeading>
      <p style={BODY}>
        <span style={LEAD}>The round before decides the round after.</span> A team that had to
        go the distance to survive its last series is in trouble in the next one — and the
        team waiting for them is the one that benefits.
      </p>
      <PlayoffGrindMatrix />
      <div style={termCardStyle}>
        <p className="mono pb-3" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
          THE SAME THING, COUNTED BY DAYS OFF · ROUNDS 2+
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 380 }}>
            <thead>
              <tr>
                <th style={{ ...termThStyle, textAlign: "left" }}>REST INTO GAME 1</th>
                <th style={termThStyle}>SERIES</th>
                <th style={termThStyle}>WON THE SERIES (%)</th>
              </tr>
            </thead>
            <tbody>
              {PLAYOFF_ENTRY_REST_BUCKETS.map((b) => (
                <tr key={b.label} style={{ borderTop: "1px solid var(--term-border)" }}>
                  <td style={{ ...termTdStyle, textAlign: "left" }}>{b.label}</td>
                  <td className="tabular-nums" style={termTdStyle}>{b.n}</td>
                  <td className="tabular-nums" style={termTdStyle}>{b.winPct.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/**
 * Section C — the objection, answered, then the part of it that survives.
 *
 * This is the section that earns the page. It also publishes the caveat rather than burying
 * it: the mechanism is arguable even though the effect is not.
 */
function ConfoundSection() {
  const { oppClosedEarly, oppWentLong, closeMatchupOppClosedEarly, closeMatchupOppWentLong, mirrorDeltaPts } =
    PLAYOFF_GRIND_EXOGENOUS
  const closeDelta = closeMatchupOppWentLong.winPct - closeMatchupOppClosedEarly.winPct

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>&ldquo;ISN&rsquo;T THAT JUST THE BETTER TEAM?&rdquo;</SectionHeading>
      <p style={BODY}>
        Fair objection. You earn a short series by being good, so maybe the fresh team just wins
        because it was better all along. Here is why that does not cover it:{" "}
        <span style={LEAD}>how long your opponent&rsquo;s last series went is not up to you.</span>{" "}
        It was decided by two other teams. So hold your own last round fixed at a quick close,
        and let only their side vary.
      </p>
      <div style={termCardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ ...termThStyle, textAlign: "left" }}>THEIR LAST ROUND</th>
                <th style={termThStyle}>SERIES</th>
                <th style={termThStyle}>YOU WON THE SERIES (%)</th>
                <th style={termThStyle}>YOUR RECORD EDGE (WIN%)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>They closed it early</td>
                <td className="tabular-nums" style={termTdStyle}>{oppClosedEarly.n}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppClosedEarly.winPct.toFixed(1)}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppClosedEarly.meanWinPctDiff.toFixed(3)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>They went the distance</td>
                <td className="tabular-nums" style={termTdStyle}>{oppWentLong.n}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppWentLong.winPct.toFixed(1)}</td>
                <td className="tabular-nums" style={termTdStyle}>{oppWentLong.meanWinPctDiff.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p style={BODY}>
        <span style={LEAD}>
          {(oppWentLong.winPct - oppClosedEarly.winPct).toFixed(1)} points, from something you did
          not control.
        </span>{" "}
        But read the last column honestly: the teams whose opponents went long were also
        slightly better on record, so part of that gap is quality rather than exhaustion.
      </p>
      <p style={BODY}>
        So here it is again with only the evenly-matched series — where neither side has a real
        record advantage to hide behind:{" "}
        <span style={LEAD}>
          {closeMatchupOppClosedEarly.winPct.toFixed(1)}% becomes{" "}
          {closeMatchupOppWentLong.winPct.toFixed(1)}%
        </span>{" "}
        ({closeMatchupOppClosedEarly.n} series against {closeMatchupOppWentLong.n}), a gap of{" "}
        {closeDelta.toFixed(1)} points. It barely shrinks. And running it the other way — when
        you are the one who went the distance — moves it {mirrorDeltaPts.toFixed(1)} points,
        the wrong direction entirely.
      </p>
      <div style={{ ...termCardStyle, borderLeft: "2px solid var(--term-neutral)" }}>
        <p className="mono pb-2" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--term-text-muted)", fontWeight: 700 }}>
          WHAT WE CANNOT TELL YOU
        </p>
        <p style={BODY}>
          Whether it is really fatigue. A team that needed seven games to get past someone has
          also just shown it is worse than its record said — and this data cannot separate
          &ldquo;worn down&rdquo; from &ldquo;not as good as we thought.&rdquo; Game-by-game the
          edge does not fade the way tiredness should, which cuts against the fatigue reading.
          The effect is solid. The reason for it is arguable, and we would rather say so.
        </p>
      </div>
    </section>
  )
}

/**
 * Section D — the model, with the half it loses published beside the half it wins.
 *
 * Both rows ship. Reporting only the rounds-2+ gain would be the same omission that made the
 * previous version of this page hollow, just pointed the other way.
 */
function ModelSection() {
  const { roundsTwoPlus, roundOne } = PLAYOFF_ROUND_SPLIT
  const { win, tie, loss } = PLAYOFF_ROUNDS_TWO_PLUS_RECORD
  const gain = roundsTwoPlus.model - roundsTwoPlus.baseline
  const drop = roundOne.baseline - roundOne.model

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>WHAT THE MODEL DOES WITH IT</SectionHeading>
      <p style={BODY}>
        The bracket below carries a win probability for every series. It is worth knowing where
        that number is worth anything — because there is a rule so simple it barely counts as a
        model: <span style={LEAD}>always pick the team with home-court advantage.</span> Beating
        it is the only bar that matters.
      </p>
      <div style={termCardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ ...termThStyle, textAlign: "left" }}>SERIES PREDICTED</th>
                <th style={termThStyle}>SERIES</th>
                <th style={termThStyle}>OUR MODEL (% RIGHT)</th>
                <th style={termThStyle}>ALWAYS HOME COURT (% RIGHT)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>Second round onward</td>
                <td className="tabular-nums" style={termTdStyle}>{roundsTwoPlus.n}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, color: "var(--term-blue)", fontWeight: 700 }}>
                  {roundsTwoPlus.model.toFixed(1)}
                </td>
                <td className="tabular-nums" style={termTdStyle}>{roundsTwoPlus.baseline.toFixed(1)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid var(--term-border)" }}>
                <td style={{ ...termTdStyle, textAlign: "left" }}>First round</td>
                <td className="tabular-nums" style={termTdStyle}>{roundOne.n}</td>
                <td className="tabular-nums" style={termTdStyle}>{roundOne.model.toFixed(1)}</td>
                <td className="tabular-nums" style={{ ...termTdStyle, fontWeight: 700 }}>
                  {roundOne.baseline.toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p style={BODY}>
        <span style={LEAD}>
          It gains {gain.toFixed(1)} points from the second round on, and loses{" "}
          {drop.toFixed(1)} in the first.
        </span>{" "}
        That is exactly what it should do. In the first round nobody has a previous round to be
        tired from, so the model knows nothing the simple rule does not — and it is worse for
        pretending otherwise. From the second round on there is a grind to read, and it reads it.
      </p>
      <p style={BODY}>
        {roundsTwoPlus.n} series is not many, so one number is not proof. Season by season, from
        the second round on, the model beat that rule in {win}, tied it in {tie}, and lost to it
        in {loss}. That is the comparison worth trusting: same brackets, same seasons, counted
        in pairs.
      </p>
      <p style={BODY}>
        Grind is measured as games beyond a sweep rather than raw games played because{" "}
        {PLAYOFF_BEST_OF_FIVE.round1BestOfFive} of {PLAYOFF_BEST_OF_FIVE.round1Total} first
        rounds in this record were best-of-five, where five games means a team went the full
        distance rather than closing early.
      </p>
    </section>
  )
}

/**
 * Sections A-D: the argument. A server component with no props and no data fetching — every
 * figure is a published constant, so none of this needs to reach the client as JS.
 *
 * Kept as a sibling of the bracket rather than wrapping it, so reordering the page to put the
 * bracket first is a swap of two elements in `page.tsx` and nothing else.
 */
export function PlayoffRestArgument() {
  return (
    <div className="flex flex-col gap-12" style={{ maxWidth: 1040 }}>
      <NoRestSection />
      <GrindTaxSection />
      <ConfoundSection />
      <ModelSection />
    </div>
  )
}
```

Note: `PLAYOFF_GRIND_MATRIX` is imported but only used by the matrix component — remove it from this file's import list if lint flags it as unused.

- [ ] **Step 2: Wire it into the page and rewrite the header**

Replace `src/app/playoffs/page.tsx` entirely:

```tsx
import type { Metadata } from "next";
import { MethodLink } from "@/components/method-link";
import { PageHeader } from "@/components/page-header";
import { PlayoffRestArgument } from "@/components/playoff-rest-sections";
import { PlayoffsContentLazy } from "@/components/playoffs-lazy";

export const metadata: Metadata = {
  title: "Playoff Rest",
};

export default function PlayoffsPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow="PLAYOFF REST"
        title="The round before decides the round after"
        description="How a long series taxes the team that survived it, and what that costs them in the round that follows."
      />
      <MethodLink surfaceHref="/playoffs" />

      {/* Argument first, bracket second. These are siblings on purpose: showing the bracket
          first is a swap of these two lines, not a rewrite of either. */}
      <PlayoffRestArgument />
      <PlayoffsContentLazy />
    </div>
  );
}
```

- [ ] **Step 3: Check the description fits two lines**

Run: `pnpm build && pnpm start &` then `pnpm test:e2e e2e/page-headers.spec.ts`
Expected: the `/playoffs` case passes — exactly 2 lines with the last line ≥30% filled.

If it reports 3 lines, shorten the description; if it reports a 1-line orphan under 30%, lengthen it. Do not change `descriptionMaxWidth` to make it pass — that knob exists for pages with a deliberately different measure, and using it to dodge this test defeats the test.

- [ ] **Step 4: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all clean.

```bash
git add src/components/playoff-rest-sections.tsx src/app/playoffs/page.tsx
git commit -m "Add the Playoff Rest argument sections and rebuild the page header"
```

---

### Task 10: Rewrite the bracket to lead with grind

**Files:**
- Modify: `src/components/playoffs-content.tsx`
- Modify: `src/components/playoffs-lazy.tsx`

**Interfaces:**
- Consumes: `priorGrindDiff`, `homeCourtPriorGames`, `opponentPriorGames` (Task 7); `priorRoundGamesLabel` (Task 7).
- Produces: `<PlayoffsContent />` — the bracket only.

- [ ] **Step 1: Remove the superseded header components**

Delete `CalibrationTile`, `ModelResultHeader`, `ScoreLine` and `SeasonScoreboard` from `src/components/playoffs-content.tsx` (lines 26-188), and remove the now-unused imports of `PLAYOFF_MODEL_ACCURACY`, `PLAYOFF_MODEL_CALIBRATION` and `PLAYOFF_MODEL_EVAL`. Section D replaced everything those four rendered.

Keep `seriesCorrectness`, `correctnessAccent`, `CorrectnessBadge`, `methodDisplayProb`, `MethodInline`, `FeatureRow`, `formatFeature`, `SeriesFeatureGrid`, `SeriesCard`, `RoundSection`, `PlayoffsSkeleton` and `PlayoffsContent` — all still used.

- [ ] **Step 2: Add the grind line to the collapsed series row**

Add above `SeriesCard`:

```tsx
/**
 * How each side arrived — the page's whole argument, restated for one matchup.
 *
 * Sits on the collapsed row rather than inside the drawer: it is the reason a reader is on
 * this page, and it was previously buried three clicks deep as a signed decimal.
 */
function GrindLine({ series }: { series: PlayoffSeriesWithPredictions }) {
  const home = priorRoundGamesLabel(series.homeCourtPriorGames, series.isBestOf7)
  const opp = priorRoundGamesLabel(series.opponentPriorGames, series.isBestOf7)
  if (!home || !opp) return null

  return (
    <span className="mono" style={{ fontSize: 11, color: "var(--term-text-muted)", letterSpacing: "0.04em" }}>
      <span style={{ color: "var(--term-text)", fontWeight: 700 }}>{series.homeCourtTeam.abbreviation}</span>{" "}
      {home}
      <span style={{ padding: "0 6px" }}>·</span>
      <span style={{ color: "var(--term-text)", fontWeight: 700 }}>{series.opponentTeam.abbreviation}</span>{" "}
      {opp}
    </span>
  )
}
```

Import `priorRoundGamesLabel` from `@/lib/playoff-rest-facts`.

Then inside `SeriesCard`, in the block that currently renders the score line and prediction row (around the `<div className="mt-2 flex flex-wrap items-center justify-between gap-2">`), insert the grind line as its own row directly beneath the matchup line and above the score row:

```tsx
        <div className="mt-1.5">
          <GrindLine series={series} />
        </div>
```

`GrindLine` returns `null` for Round 1 — where there is no prior round — so no placeholder or em-dash is rendered there. That is correct: the absence is the fact.

- [ ] **Step 3: Add grind to the feature drawer**

In `SeriesFeatureGrid`, replace the `ENTRY REST DIFF` row's position by adding the new row above it (both ship — `entry_rest_diff` is still a populated column and still shown, it is only out of the model's feature vector):

```tsx
      <FeatureRow k="PRIOR GRIND DIFF" v={formatFeature(series.priorGrindDiff)} />
```

And amend the sign-convention footnote, because this one feature runs the other way:

```tsx
      <p className="mono mt-1" style={{ fontSize: 10, color: "var(--term-text-muted)", letterSpacing: "0.04em", lineHeight: 1.4 }}>
        SIGN CONVENTION: POSITIVE FAVORS HOME-COURT ({series.homeCourtTeam.abbreviation}). ALL ROWS ARE
        (HOME-COURT − OPPONENT) EXCEPT PRIOR GRIND DIFF, WHICH IS (OPPONENT − HOME-COURT) SO THAT
        POSITIVE STILL MEANS THE SAME THING.
      </p>
```

- [ ] **Step 4: Fix the empty and error states**

In `PlayoffsContent`, the empty-state copy still says "NO PLAYOFF PREDICTIONS FOR THIS SEASON" and the error state "FAILED TO LOAD PLAYOFF PREDICTIONS". Change to "NO BRACKET FOR THIS SEASON" and "FAILED TO LOAD THE BRACKET" — the page now has three sections of content above these, so "playoff predictions failed" would read as the whole page having failed.

Also remove the `<ModelResultHeader />` and `<SeasonScoreboard ... />` calls from the success branch, leaving the season selector and the round sections.

- [ ] **Step 5: Trim the lazy skeleton**

`src/components/playoffs-lazy.tsx`'s fallback still mimics the two-tile calibration header, which no longer exists in this component. Replace its body with a season-selector-sized block plus three row skeletons, matching what `PlayoffsSkeleton` now renders. Do the same to `PlayoffsSkeleton` inside `playoffs-content.tsx` — remove its two-tile grid.

- [ ] **Step 6: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all clean. Lint will catch any import left orphaned by Step 1 — fix those, and only those.

```bash
git add src/components/playoffs-content.tsx src/components/playoffs-lazy.tsx
git commit -m "Lead each series card with how both teams arrived"
```

---

### Task 11: Rename the tab and update every surface that names it

**Files:**
- Modify: `src/lib/primary-navigation.ts:36-42`
- Modify: `src/lib/behind-the-data-sections.ts:35`
- Modify: `src/app/behind-the-data/playoff-predictions/page.tsx`
- Modify: `e2e/playoffs.spec.ts`
- Modify: `e2e/onboarding.spec.ts:22`
- Modify: `e2e/behind-the-data.spec.ts:32`
- Modify: `docs/GLOSSARY.md:69`, `docs/FRONTEND.md:114-116` and `:353`, `docs/ARCHITECTURE.md:256`, `docs/ROADMAP.md:21`, `docs/DATABASE.md` (the `playoff_series` column table), `docs/API.md:173`, `README.md:58-64`

**Interfaces:**
- Consumes: everything above.
- Produces: no new exports. `DIRECT_NAV_ITEMS` keeps its shape; only the `label` and `guideDescription` of the `/playoffs` entry change.

- [ ] **Step 1: Rename the nav entry**

In `src/lib/primary-navigation.ts`, replace the `/playoffs` entry:

```ts
  {
    href: "/playoffs",
    // Not "PLAYOFF EDGE": `edge` is the qualifier that makes SCHEDULE EDGE legible as something
    // other than a game list, and a second EDGE tab stops it qualifying. Not "PLAYOFF EFFECT":
    // REFEREE EFFECT means the effect referees have, so by that pattern this would read as the
    // effect the playoffs have — backwards, since the page is about the effect of rest inside
    // them. "REST" is the site's own word and the page is the postseason answer to it.
    label: "PLAYOFF REST",
    guideDescription:
      "See what surviving a long series costs a team in the round that follows.",
  },
```

- [ ] **Step 2: Update the e2e assertions**

`e2e/playoffs.spec.ts` — replace the whole file:

```ts
import { expect, test } from "@playwright/test";

test.describe("Playoff Rest page", () => {
  test("renders the terminal heading and eyebrow label", async ({ page }) => {
    await page.goto("/playoffs");

    // Heading + eyebrow render server-side in the page wrapper, independent of
    // PlayoffsContentLazy — no need to wait on lazy/data-dependent content.
    await expect(
      page.getByRole("heading", { name: "The round before decides the round after" })
    ).toBeVisible();

    await expect(page.getByText("PLAYOFF REST", { exact: true }).first()).toBeVisible();
  });

  test("leads with the argument, not the bracket", async ({ page }) => {
    await page.goto("/playoffs");

    // Sections A-D are server-rendered constants, so they are present without any DB round
    // trip. This is what makes the page useful when the API is slow or empty.
    await expect(page.getByText("THE POSTSEASON HAS NO REST")).toBeVisible();
    await expect(page.getByText("THE GRIND TAX")).toBeVisible();
    await expect(page.getByText("WHAT THE MODEL DOES WITH IT")).toBeVisible();
  });
});
```

`e2e/onboarding.spec.ts:22` — change `/^PLAYOFF PREDICTIONS\b/` to `/^PLAYOFF REST\b/`.

`e2e/behind-the-data.spec.ts:32` — this asserts the *method* page's label. Leave it as `"PLAYOFF PREDICTIONS"` only if you keep that label in `behind-the-data-sections.ts`; Step 3 changes it, so change this string to match whatever Step 3 sets.

- [ ] **Step 3: Update the method page**

In `src/lib/behind-the-data-sections.ts:35`, change the label from `"PLAYOFF PREDICTIONS"` to `"PLAYOFF REST"`. Leave the route `/behind-the-data/playoff-predictions` unchanged — renaming a URL breaks inbound links for a label change, and the module's internal name is still Playoff Predictor.

In `src/app/behind-the-data/playoff-predictions/page.tsx`:
- Change the eyebrow to `"BEHIND THE DATA · PLAYOFF REST"`.
- Replace any prose describing `entry_rest_diff` as a model feature with `prior_grind_diff`, including the format-aware definition and the inverted sign convention.
- Add the round split and the rounds-2+ paired record, sourced from `@/lib/playoff-rest-facts` — not retyped.
- State that `logistic_grind_v2` superseded `logistic_unreg_v1` on 2026-07-31 and that the v1 rows are retained.

- [ ] **Step 4: Update the docs that would now be wrong**

Change only the rows and sentences that describe the *tab label*, the *page content*, or the *model's feature vector*. Leave every "Playoff Predictor" module reference alone — the module name has not changed.

- `docs/GLOSSARY.md:69` — nav table row: label `PLAYOFF REST`, h1 `The round before decides the round after`. Keep the "Playoff Odds" confusion note; add that PLAYOFF EDGE was rejected for colliding with SCHEDULE EDGE.
- `docs/FRONTEND.md:114-116` — the `/playoffs` section: new eyebrow, new h1, and the A–D/E split with the note that they are siblings so the order can be swapped.
- `docs/FRONTEND.md:353` — nav enumeration: `PLAYOFF REST → /playoffs`.
- `docs/ARCHITECTURE.md:256` — nav enumeration.
- `docs/ROADMAP.md:21` — nav enumeration.
- `docs/DATABASE.md` — the `playoff_series` column table gains `prior_grind_diff` with its meaning, inverted sign convention and nullability contract; the migration table gains a `0012_playoff_series_prior_grind.sql` row.
- `docs/API.md:173` — note the three new fields on the `/api/playoffs` series objects.
- `README.md:58-64` — the section title and prose. **The screenshot and its alt text describe the old page in detail and are now wrong.** Regenerate via `scripts/screenshots.mjs` and rewrite the alt text to describe the new page, or, if the screenshot cannot be regenerated in this environment, remove the `<img>` and note in the commit message that `docs/screenshots/playoffs.png` needs regenerating. Do not leave an accurate-sounding alt text describing a page that no longer exists.

- [ ] **Step 5: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all clean.

Run: `pnpm test:e2e`
Expected: all pass, including `page-headers.spec.ts` for `/playoffs` and `/behind-the-data/playoff-predictions`, `onboarding.spec.ts`, `behind-the-data.spec.ts` and `playoffs.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/primary-navigation.ts src/lib/behind-the-data-sections.ts src/app/behind-the-data/playoff-predictions/page.tsx e2e/playoffs.spec.ts e2e/onboarding.spec.ts e2e/behind-the-data.spec.ts docs/GLOSSARY.md docs/FRONTEND.md docs/ARCHITECTURE.md docs/ROADMAP.md docs/DATABASE.md docs/API.md README.md
git commit -m "Rename the playoffs tab to PLAYOFF REST and update every surface that names it"
```

---

## Post-implementation review

Run the `fullcourt-review` skill after Task 11. It delegates mechanical verification to the `fullcourt-reviewer` subagent and produces an escalation list.

Beyond the mechanical gate, check these by hand — they are the things a linter cannot see:

1. **No number appears on the page that is not in `playoff-rest-facts.ts`.** Grep the two new components for numeric literals; the only legitimate ones are style values and the bucket boundary labels.
2. **The sign convention reads correctly in the drawer.** Open a rounds-2+ series where the home-court team was the fresher side and confirm `PRIOR GRIND DIFF` is positive.
3. **Round 1 renders without a grind line** rather than with an em-dash or a zero.
4. **The page is useful with the API down.** Stop the DB or point `DATABASE_URL` at nothing; Sections A–D must still render, because they are server constants. Only the bracket should show its error state.
5. **Section D's two rows still point opposite ways.** The facts test asserts this, but confirm the prose in `ModelSection` matches the actual sign of `gain` and `drop` — if a retrain ever flipped one, the sentence would read as nonsense while the test still passed on the other.
