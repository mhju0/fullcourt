# Games refresh and upcoming edges remediation

2026-10-11. C2, C4 and the approved Games opener explanation. Local isolated worktree only; no merge, deployment, schema or coefficient change.

## Acceptance and behavior

- Realtime updates to tracked game IDs invalidate the full selected-slate API response. No score/status overlay survives an authoritative response. A 250ms debounce coalesces bursts and one trailing fetch handles invalidations during an active request.
- A selected date owns a generation and request lifecycle. Date changes, season changes, retries and history restoration reject previous owners, including A → B → A. Requests have a 12-second overall deadline and abort on disposal; a transport that ignores abort still cannot publish a late result.
- Visible, online current/upcoming slates refresh every 60 seconds and on focus, reconnect and visibility return. Completed historical slates avoid these polling reads. Relevant Realtime invalidations still refresh a historical completed slate while visible.
- Background refresh does not enter full-page loading or clear the games. Failure shows a quiet inline warning and retry beside the retained table. The stable refresh button remains mounted while retrying. Initial failures retain the existing MessageCard. Successful refreshes do not send live-region or toast announcements.
- `View fetched at … (your time)` is the client response receipt time. It is not a source update timestamp, pipeline success, fatigue computation time or data freshness guarantee.
- Upcoming responses include nullable UTC `tipOffUtc`. The strip filters elapsed instants with the local clock even when a subsequent network request fails; null times remain eligible and invalid times are excluded, matching `hasNotTipped`. Eligible candidates sort by absolute rest advantage descending, date ascending and ID ascending; three render.
- The upcoming API accepts an optional integer `limit` from 3 to 30. The strip requests six ranked candidates after server tip filtering. The default request continues returning the complete date/ID-ordered collection. The client fills from its reserve and requests a refill when fewer than three remain, once per received candidate-ID set, with polling/focus/reconnect as fallback.
- Server metadata identifies each team's first stored regular-season game using the complete stored regular schedule, independently of fatigue and the published-regime predicate. The regular predicate on the aliased schedule is a deliberate metadata exception; published rows still use `publishableGames()`. Missing schedule coverage cannot establish the real-world season opener beyond stored coverage.
- Both-team and one-sided opener explanations use this metadata, state that preseason is excluded, and preserve missing fatigue as unavailable. A zero fatigue score is never the opener heuristic. The expansion sentence uses the existing 15px body token.

Normal steady-state cost is at most one slate fetch and one six-candidate strip fetch per visible minute, plus focus/reconnect/Realtimes and the existing calendar fetch. No connection-pool or capacity claim follows from this policy. The optional limit bounds transferred rows; the query still reads the full candidate population before ranking.

## Evidence

The first run of `corepack pnpm exec vitest run src/lib/__tests__/games-refresh-regression.test.ts` against unchanged product code failed all five tests: background failure erased the table; A → B → A accepted an old response; an elapsed chip remained; both-team and one-sided opener explanations were absent. Captured tool output at 16:34 local time is the initial failure record.

Targeted suite after implementation: seven files, 95 tests passed at 16:44. Includes debounce/single-flight, ignored abort, hung-request deadline and retry, initial versus background failure, hidden/offline/historical polling relevance, tracked-ID invalidation and disposal, elapsed/null/invalid tip rendering, reserve fill, metadata-only opener rendering and API parameter validation. Existing slate-machine/storyline/publication-rule tests remain green.

Targeted ESLint passed for the changed hooks, slate coordinator/machine/storyline, Games/strip/notice/table components, API route and tests. Whole-worktree `corepack pnpm typecheck` passed at 16:44 after the other workers resolved their in-progress PostgreSQL/ESPN test typing. The root still owns the final frozen-candidate checks.

Root's connected PostgreSQL 18 API checks returned October 20 as three games with ISO tip instants and both opener flags true. Samples `/tmp/fullcourt-remediation-slate.json`, `/tmp/fullcourt-remediation-upcoming-six.json`, `/tmp/fullcourt-remediation-upcoming-all.json`. The root observed six limited rows / 2,380 bytes versus 633 default rows / 249,811 bytes; these are response sizes, not a latency comparison. Cold/warm request timing is not comparable and no speed-up is claimed.

## UI audit and remaining verification

The established antislop mode is audit after implementation. This slice preserves the light Broadcast/Front Office table, color semantics, existing tokens, URL expansion state and keyboard row controls. The added text explains a fetch failure or schedule fact; it adds no decorative surface or new motion. The warning uses a polite status only on failure and the receipt time is ordinary text. Existing 44px controls cover the new refresh action.

Implemented and unit/SSR-exercised: full-response refresh ownership, stale guards, quiet failure data retention, deadline/retry, local tip filtering, stable rank and reserve, optional API validation, opener copy safety. Connected route/query shape was exercised by the root. Browser focus/expanded-row preservation, real focus/reconnect event paths, mobile/200% layout, real Supabase delivery, physical devices and an actual NBA slate require root/final verification; unit or static rendering does not establish them. No production behavior is claimed here.


## Manual-refresh focus follow-up

Root browser verification found native `disabled` on the clicked Refresh view button moved focus to BODY, while the expanded row and `game=118696` URL survived. At 16:46, a new regression first failed on the rendered native disabled attribute. The button now uses `aria-disabled`, retains its focusable DOM node and 44px target, and ignores activation while refreshing. Regression also directly exercises that handler guard. Root will repeat the actual browser focus check; static markup establishes the attribute/guard contract, not browser focus behavior.

## Full-suite layout follow-up

The root's first full E2E run finished 413 passed / 2 failed. `independent-audit.spec.ts:33` observed the mobile first-row bottom at 820.96875px against the fixed bottom-nav top at 787px; the added separate refresh row displaced the matchup. `season-navigation.spec.ts:90` passed its column-clipping assertion but GAP SIZE had viewport ratio 0 after horizontal scrolling at 768px, requiring verification after removing the same added vertical displacement.

The refresh control now shares the existing MATCHUPS/count header in one 44px row; the failure warning remains above the table and the client fetch receipt time follows the table. The button keeps the same aria-disabled/handler focus semantics. The mobile E2E retains the original first-row-before-dock invariant and adds a header/control placement check. Two affected unit files / 17 tests, targeted ESLint and whole-worktree typecheck passed. The root coordinates a combined production build/restart before affected E2E reruns; no render success is claimed from these checks alone.

After the root's combined production rebuild/restart on port 3101, the six affected cases passed in 4.2 seconds, including the original mobile dock and 768px GAP SIZE viewport assertions without weakening either. The two entire related files then passed 17/17 in 9.4 seconds. Evidence: `docs/reports/2026-10-11-remediation/evidence/e2e-games-layout-focused.log` and `e2e-games-layout-related.log`. The independent-audit mobile test gained the header/control placement check; `season-navigation.spec.ts` is unchanged. This was a vertical-space regression from the added separate notice, resolved with the compact header; no outdated expectation was removed. These runs also exercise calendar opening/closing, selected-date focus after resizing, shareable season/date state and all five matchup widths. The root owns the subsequent full-suite repeat and final screenshots.
