# Audit: hardcoded win-rate stats vs. live `/api/analysis` — consistency check

**Scope:** read-only. Triggered by a stale premise — "the app hardcodes `SEASON_WIN_RATE =
53.5%` (and a paired ≥5 → 61.7%) while `/api/analysis` computes 54.8% live." Goal: locate every
hardcoded win-rate number on disk, confirm the live definition, and pin down why 53.5/61.7 and
54.8/61.1 differ. No files changed except this report.

**Date:** 2026-07-03. **Method:** `grep -rn` over source/docs (excluding `node_modules`), `git log
-S` to date when strings entered/left the tree, direct `Read` of the cited lines. Every numeric
grep hit was written to a scratch file and re-read with the `Read` tool before being cited here
(rtk stdout-masking mitigation).

---

## 1. Inventory — every place `53.5`, `61.7`, `54.8`, `61.1`, or `SEASON_WIN_RATE` appears on disk

| Pattern | Hits (non-`node_modules`) | Real hits | Coincidental |
|---|---|---|---|
| `53.5` | 1 | 1 (`docs/ROADMAP.md:103`, past-tense) | 0 |
| `61.7` | 0 | 0 | 0 |
| `54.8` / `61.1` | 4 files | `README.md:13` | `pnpm-lock.yaml:3983` (`stylus: '>=0.54.8'`), `docs/audit/tier3-explain.txt` / `tier3-explain-after.txt` (Postgres `EXPLAIN` timings, e.g. `...54.8 ms...`) |
| `SEASON_WIN_RATE` | 0 live occurrences | — | — |

**Headline: `53.5` and `61.7` do not exist anywhere in the current working tree as live UI/doc
values, and `SEASON_WIN_RATE` no longer exists as an identifier.** [Verified: grep of full tree,
scratch-file re-read]

## 2. Where the numbers actually come from — a closed, dated timeline

`git log -S"53.5"` / `-S"61.7"` across all commits: [Verified file:line via `git log`/`git show`]

| Commit | Date | Event |
|---|---|---|
| `05656e6` | 2026-03-31 | **First appearance.** Docs text: *"These figures come from the project's historical backtest (final games with fatigue data, neutral threshold \|RA\| ≥ 0.5): More-rested teams win 53.5% of decidable games overall... At RA ≥ 5, 61.7%..."* Same commit's API-doc example response: `{"totalGames": 1200, "overallWins": 642, "overallWinRate": 53.5, ...}`. |
| `31ec9e0` | 2026-06-21 | Rebrand carries the same static `~53.5%` / `~61.7%` text forward into the new `README.md`, plus a static `SEASON_WIN_RATE = "53.5"` UI constant on the Today's Games page. |
| `aa1a813` | 2026-07-01 | **Fix commit** (`chore: wrap up portfolio polish — ... live win-rate`): (a) `src/app/page.tsx` — removes `SEASON_WIN_RATE = "53.5"`, wires the "SEASON WIN RATE" stat card to `useSWR("/api/analysis", ...)` → `analysis.overallWinRate` (`src/app/page.tsx:227-230`); (b) `README.md` — replaces the static `~53.5% / ~61.7%` sentence with *"computed live from the DB... currently ~54.8% overall, rising to ~61.1% at a gap of 5+"* (`README.md:13`). |
| `docs/ROADMAP.md:101-104` | 2026-06-29 note | Documents the fix: *"Wired the SEASON WIN RATE stat card to the live value... so the old hardcoded SEASON_WIN_RATE = '53.5' constant is gone. Still open: the decorative hardcoded nav ticker..."* |

**Conclusion: the discrepancy the prompt describes (53.5%/61.7% hardcoded vs. 54.8% live) was real
up through `31ec9e0` and was fixed in `aa1a813` on 2026-07-01 — two days before this audit
(2026-07-03).** [Verified file:line + commit hashes above] The prompt's premise reflects
pre-`aa1a813` state.

### `docs/API.md` — also already clean
The old `05656e6` example response (`totalGames: 1200, overallWinRate: 53.5`) is **not** present in
the current `docs/API.md` (only field names remain at `docs/API.md:139`, no numeric example).
[Verified: grep of `docs/API.md`, no `53.5`/`1200` hit]

## 3. Live definition of `overallWinRate` (source of truth today)

`src/app/api/analysis/route.ts`:

- **Query scope**: `getCompletedGamesWithFatigue()` (`src/lib/db/queries.ts:533-558`) selects rows
  where `games.status = 'final'` AND `games.gameType = 'regular'`, inner-joined to each side's
  latest fatigue score. **No season-range filter is applied in SQL** — it returns every completed
  regular-season game currently ingested with fatigue data, whatever that set is at query time.
  [Verified src/lib/db/queries.ts:533-558]
- **Decidable-set filter**: `NEUTRAL_THRESHOLD = 0.5` (`route.ts:17`); `decidable = rows.filter(r
  => Math.abs(r.differential) >= NEUTRAL_THRESHOLD)` (`route.ts:39-41`). Games with `|RA| < 0.5`
  are dropped entirely before any win-rate math — matches CLAUDE.md's "`|RA| < 0.5` is
  neutral/no-call."
- **`overallWinRate`** = `winPct(overallWins, decidable.length)` where `overallWins` = decidable
  games the more-rested team won (`route.ts:43,124`). **It is a rate over the decidable subset,
  not over all completed games.** `totalGames` in the API response is `decidable.length`
  (`route.ts:122`), i.e. it already reports the decidable count, not the raw completed-game count.
- **Threshold buckets** (`THRESHOLDS = [2,3,5,7]`, `route.ts:18,46-58`): each bucket further
  filters the already-decidable set by `|differential| >= threshold`, so the ≥5 bucket is `|RA| ≥
  5` computed on top of `|RA| ≥ 0.5`. The `winPct` for `threshold === 5` is what
  `src/components/analysis-content.tsx:682` (`ra5`) and the bar chart at
  `analysis-content.tsx:675-680` render — this is the figure a fresh README snapshot would quote
  as "≥5 → X%." [Verified src/app/api/analysis/route.ts:17-58,122-124; src/components/analysis-content.tsx:675-682]
- **Rendering**: `/` (Today's Games) shows `analysis.overallWinRate` via `useSWR("/api/analysis",
  ...)` (`src/app/page.tsx:227-230`, live, no fallback except `"—"` while loading/erroring).
  `/analysis` shows the same field directly from its own `useSWR` fetch
  (`analysis-content.tsx:707`). Both are wired to the same endpoint — no divergence between the
  two live UI surfaces. [Verified]

## 4. Why 53.5%/61.7% ≠ 54.8%/61.1% — candidate ranking

| Candidate | Verdict | Evidence |
|---|---|---|
| **(b) Stale, hand-pasted snapshot** | **[Verified] — primary cause** | `05656e6`'s own commit text states the 53.5/61.7 figures came from "the project's historical backtest" with the **same** methodology (`|RA| ≥ 0.5`, decidable games) described in today's `route.ts`. The commit's doc example shows `totalGames: 1200` at that point. The pipeline (`scripts/backfill_historical.py`, `scripts/backfill_fatigue.ts`, the daily cron) keeps adding completed games — both older backfilled seasons and new 2025-26 games as they're played — so the decidable set (and thus the win rate over it) is expected to drift release over release. 53.5/61.7 was never re-computed between 2026-03-31 and 2026-07-01; 54.8/61.1 is the 2026-07-01 recomputation (and may itself already be stale by the time this is read — see §5). |
| **(d) Calculation-formula difference** | **[Verified] — ruled out** | The 2026-03-31 doc text explicitly names the same neutral-threshold/decidable-set formula (`|RA| ≥ 0.5`) that `route.ts:39-41` implements today. No evidence of a different formula (e.g. all-games vs. decidable) at any point in the numbers' history. |
| **(a) Set-definition difference (all games vs. decidable)** | **[Verified] — ruled out as the cause of *this* gap** | Both the old and current numbers are explicitly the decidable-set rate. (Note: this is still a real property of the live number worth flagging in §5 below — "overall win rate" reads as "all games" to a portfolio viewer but is actually the decidable subset — but it's constant across old and new, so it doesn't explain the 53.5→54.8 drift.) |
| **(c) Season-range difference** | **[Inferred] — unlikely to be material** | `route.ts` applies no season filter at all; `NBA_SEASONS` (`src/lib/nba-season.ts:8-18`, 1985-86–present excluding 2019-20) is unchanged in range logic across the period. The *effective* range only changes via how much of that range has been ingested/backfilled at query time — which collapses into candidate (b), not a distinct cause. |

**Bottom line: the 53.5%/61.7% → 54.8%/61.1% change is explained by data growth between two
manually-triggered snapshots taken ~3 months apart, computed with an unchanged formula over an
unchanged (but not-yet-fully-ingested-at-the-earlier-snapshot) season range — not by a
methodology bug.** [Verified via commit evidence above]

## 5. Residual weaknesses (severity ranked, no fixes applied)

1. **Medium — `README.md:13`'s "currently ~54.8% / ~61.1%" is itself a manually-pasted snapshot,
   not live-linked.** The UI (`page.tsx`, `analysis-content.tsx`) now reads `/api/analysis` live,
   but the README text is plain markdown with no automation tying it to the endpoint. The same
   drift that produced this audit's original premise (53.5→54.8) will recur for 54.8/61.1 as more
   games are ingested, unless someone manually re-syncs the README each time. [Verified: no script/
   CI step found that regenerates README stats — confirmed by inventory in §1, no generator
   references `overallWinRate` outside the two React components]
2. **Low — "OVERALL WIN RATE" / "SEASON WIN RATE" labels don't disclose the decidable-set
   filter.** `route.ts:122` sets `totalGames = decidable.length`, so the UI's "N GAMES" sub-label
   (`analysis-content.tsx:708`) already reflects the filtered count, not the raw completed-game
   count — internally consistent, but a portfolio viewer reading "OVERALL WIN RATE — 12,345 GAMES"
   has no visible cue that ~`|RA| < 0.5` games were excluded before that count was taken. This is a
   disclosure gap, not a math bug. [Verified route.ts:39-41,122]
3. **Low — `docs/ROADMAP.md:103-104` flags a known-open decorative hardcode in
   `nav-bar.tsx`'s `TICKER_ITEMS` (`src/components/nav-bar.tsx:15-22`).** Checked directly: those
   six values (`BOS 2.4`, `DEN 1.8`, etc.) are per-team fatigue-differential placeholders, not
   win-rate/headline numbers, so they don't collide with the 53.5/54.8 question — but they are
   still static text sitting next to a page that otherwise shows live data, which is the exact
   pattern that produced this audit's original premise. [Verified nav-bar.tsx:15-22]
4. **Informational — `CLAUDE.md`'s own "Headline finding" line already matches the current live
   snapshot (~54.8% / ~61.1%)**, so agent-facing docs and the human-facing README are in sync as of
   this audit. No action needed there.

## 6. Open [Unknown]s — needs Michael / DB access

- **Current live `overallWinRate` and the ≥5 bucket's `winPct` right now (2026-07-03) are
  [Unknown]** — this audit did not query the DB. To confirm whether README's "~54.8% / ~61.1%" is
  still accurate today, run:
  ```bash
  curl -s http://localhost:3000/api/analysis | jq '.data.overallWinRate, (.data.thresholds[] | select(.threshold==5) | .winPct)'
  ```
  (or hit `https://fullcourt-nba.vercel.app/api/analysis` for the deployed value). If either number
  has moved from 54.8/61.1, README.md:13 is stale again and candidate (b) has repeated.
- **Exact `totalGames` (decidable-set size) at each of the two snapshots is [Unknown]** beyond the
  `1200` example captured in `05656e6`'s doc text — that number was illustrative in an API-shape
  example, not confirmed as the literal live count on 2026-03-31. Treat it as directional evidence
  for "the set was smaller then," not a precise historical data point.

---

## Escalate — "which number is the honest official headline" (framing decision, not this audit's call)

This is a model-framing-honesty judgment, not a code-fact — deferred to Chat/Michael. Candidates,
with what's known about each:

- **A. Live-fetched, no static number in prose** — the README could describe the finding
  qualitatively ("the more-rested team wins the majority of games, and the edge widens at higher
  RA") and let the *site itself* (which already live-fetches) carry the actual percentage, removing
  the drift-prone pasted number from static docs entirely. Trade-off: portfolio reviewers skimming
  only the README lose the concrete number.
- **B. Keep a pasted snapshot but timestamp it** — e.g. "as of 2026-07-01: ~54.8% / ~61.1% (see
  live site for current)" — cheaper than (A), keeps the concrete number, but still drifts and still
  requires someone to remember to refresh it periodically.
- **C. Automate the README number** — a small script/CI step that queries `/api/analysis` (or the
  DB directly) and rewrites the README stat line on each daily-update run, guaranteeing the pasted
  number never lags the live one. Highest fidelity, most build-out cost for a portfolio project.

No recommendation made here on which to pick — flagging only that all three are viable and the
choice is a judgment call about how much "always current" matters for a portfolio README versus
how much engineering it's worth.
