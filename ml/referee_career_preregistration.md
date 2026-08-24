# Pre-registration — unequal careers, and whether an equal window changes the table

Written **before any windowed figure was computed**, on 2026-08-24. The exploration was scoped
with Michael in the 2026-08-23 roadmap entry (PR #53) and opened by him on 2026-08-24. Per
[ADR 0007](../docs/adr/0007-referee-analysis-axes-are-pre-registered.md), nothing here may be
revised after results are seen; a revision is a new file.

Convention carried from `referee_player_preregistration.md`: corpus **structure** (game counts,
dates, spans) may be examined while fixing this design; foul-mix **outcomes** may not be, and
were not.

## The problem, stated before the measurement

The published table (`/referees`, `src/data/referee-foul-style.json`) ranks a ~750-game crew
chief beside a 200-game newcomer with nothing but the raw `G` column separating them, and the
|z| ≥ 2 bolding is sample-size-dependent: z = d·√n for a true per-game effect d, so the bar a
veteran's quirk clears at n = 700 (d ≥ 0.076 game-level SDs) is one a newcomer's identical
quirk cannot reach at n = 200 (d ≥ 0.141). The bolding therefore reads as "veterans have more
style", which is partly an artifact of when they were hired.

Three measurements. **M1 ships regardless; M2 and M3 carry declared decision rules, and the
status quo is the accepted fallback** — recorded with the measurement, not retried.

## Population and replication gate

- Corpus: `ml/data/referee/games.csv` + `fouls.csv` (flattened by `ml/extract_referee_corpus.py`
  from the cached ESPN payloads), regular season only (`season_type == 2`), `n_officials >= 3`.
- The game filter and math replicate `scripts/fetch_officials.ts` `buildFoulStyle()` exactly:
  regulation games only, ≥ 20 counted fouls, shares of the game's own foul total, deviations
  from that season's mean share, per-official mean and z = mean / (sd/√n). Regulation is derived
  as "no foul recorded in period ≥ 5" — the corpus tables carry no period count — and the gate
  below is what catches that proxy failing.
- **M0, the gate:** the career-window replication must match the published JSON — game counts
  within ±2 per official (the regulation proxy's price; an exact match is expected for nearly
  all), mean deviations within ±0.02pp and z within ±0.2 for ≥ 95% of (official × column)
  cells over the published officials. **If M0 fails, stop and reconcile before any windowed
  number is looked at.** A windowed figure computed on a stream that cannot reproduce the
  published table would be comparing two different measurements and calling it drift.
- Officials measured: the published set (career games ≥ `MIN_GAMES` = 200,
  `src/lib/referee-foul-style.ts`).

## M1 — seasons active (presentation; no inference; ship regardless)

Per official: first and last season worked, from `games.csv`. A `SINCE`/span readout beside `G`
is a fact about the schedule, needs no threshold, and directly softens the "veterans have more
style" misreading by showing *why* one official has 3× another's sample.

## M2 — the equal window, decided by a drift test

**Window:** each official's most recent **W = 200** games by `date_et` — W is the existing
publication bar, not a tuned value. The equal-window table answers "what is this official like
now", with every official measured at the same n and therefore the same bolding bar.

**The mechanical trap, declared:** at n = 200 every z shrinks by ~√(n/200) relative to career,
so "fewer bolded cells in the window" is arithmetic, not evidence, and is **not** an adoption
criterion. The window earns the page only if recent style actually *differs* from career style
— otherwise the career window measures the same thing with strictly more power, and the
fairness problem is solved by M1's span plus the existing footnote, not by throwing away
sample.

**The drift test:** for each official with career games ≥ 350 (so the earlier segment holds
≥ 150 games), split their stream into `recent` (last 200) and `earlier` (the rest). For each of
the six columns (fouls/game + five type shares), two-sample z:
zΔ = (m_recent − m_earlier) / √(se_recent² + se_earlier²).

**Decision rule, fixed now:** at |zΔ| ≥ 2, chance produces ~4.6% of cells. If **≥ 10%** of
(official × column) cells among the ≥ 350-game officials clear |zΔ| ≥ 2 — at least double
chance — officials' styles drift within careers, the career table is averaging over real
change, and the equal window is presented to Michael for adoption (career `G` stays visible).
Below 10%, **status quo**: the drift finding is recorded, M1 ships alone, and the write-up
says the career window survived a fair attempt to replace it. Between-rule ambiguity does not
exist: the threshold is the count, computed once.

Supporting descriptives, reported either way (no decisions hang on them): the bolded-cell
counts career vs window, leading-trait changes (column of largest |z|), and the officials with
the largest single-column drift — named only with the chance count beside them, per the
standing rule.

## M3 — the literal per-season split, assessed inside (expected to fail)

For each (official, season) cell with ≥ 50 games (an official works ~65 a season): per-season
mean and z per column. Power arithmetic fixed in advance: at n = 65, bolding needs d ≥ 0.248 —
3.3× the career table's veteran bar — so the expectation is near-blanket failure.

**Decision rule, fixed now:** the split is refused unless **both** (a) ≥ 10% of
(official-season × column) cells clear |z| ≥ 2, and (b) within-official sign agreement across
their seasons (per column, among officials with ≥ 3 qualifying seasons) exceeds 70% — i.e. the
split would have to be both powered and stable to earn a surface. Failing either, the refusal
is recorded with the measured numbers and the per-season split does not get a UI.

## What may not happen

- No windowed or per-season figure is browsed, quoted, or written up beyond the declared
  aggregates until M0 has passed and the M2/M3 rules have been applied.
- No named official appears in any write-up without the count chance produces at the same bar.
- No new axis rides along. Career windows of the *existing* published columns only.
- W, the 350 split-bar, the 10% thresholds and the 70% agreement bar do not move after
  results are seen. If they prove badly chosen, that is recorded and a successor file may
  propose different ones for a fresh run.
