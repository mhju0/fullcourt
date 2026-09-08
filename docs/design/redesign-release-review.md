# Rest-focused redesign release review

Date: 2026-09-08. Scope: the owner-approved decision record, including Officiating and the
rest-focused mockups. The owner authorized completing, verifying, and deploying this work.

| Before | After | Why |
| --- | --- | --- |
| Season Report repeats schedule value, travel, and weekly fatigue | Three outcome sections; travel/workload and calendar belong to Schedule Edge | Each analysis has one home |
| Several full tables precede the season's useful findings | Six team records with remaining teams under a disclosure; five largest completed gaps include wins and losses | Keep the principal result and examples easy to reach |
| Mobile Games hides rest advantage beyond the horizontal scroll | Teams, status, and labeled rest advantage fit within the row; workload expands beneath it | The principal daily comparison must be visible |
| Routine Games rows animate on entry | Immediate rows and expansions; keyboard navigation skips transitions | Emil's frequent-action rule and the owner's motion policy |
| Schedule breakdown and technical coefficients always occupy space | Native keyboard-accessible disclosures | UI/UX Pro Max's responsive table guidance; secondary evidence remains available |
| URL selection covers only some surfaces | Games season/date/view, shared primary-route season, Shooting filters/sort/player, and existing Officiating state | Reload/share/history describe the same view |
| Both shot courts stack on mobile | One court by default; Compare models reveals the second; desktop keeps both | Mobile comparison is a deliberate action |
| Reference topic links and headings compete with content | Compact scrollable topic navigation, neutral headings, local contents anchors | Reference navigation stays accessible without becoming the headline |

Verification uses source calculations without changing fatigue coefficients or regenerating
unrelated analytics. Schedule workload retains its source basis: before the first completed game,
the available published schedule; afterward, completed games only. The fatigue calendar remains
completed-game measurement and never gains a projected tail by moving pages. Missing values
remain distinct from zero.

Officiating keeps the NBA verdict text, source links, all-assessment access, clean games, and the
compact archive link. Published files retain their generating scripts and contract tests. The
refresh workflow prepares reviewable data updates rather than automatically merging them.
Repository policy currently blocks Actions-created PRs; the workflow leaves a comparison link
when a validated branch cannot become a PR. No repository-wide permission was broadened.

Release gates: project lint/typecheck/unit/build/audit, Python contracts, desktop/mobile browser
coverage, focused history/loading/error checks, screenshots, hosted preview verification, and
post-merge production checks. Results are recorded in PROJECT_HANDOFF and the release PR.
Physical-device and human screen-reader testing are not claimed by browser automation.


### Release verification — 2026-09-08

- Lint, typecheck, 969 unit tests, production build, and production dependency audit passed.
- Python contracts passed: 24 ML tests and two pipeline tests.
- The full 333-case browser sweep passed 323 initially, including all 50 desktop/mobile
  accessibility scans. Ten expectations tied to the previous page layout were updated.
  The affected 86-case sweep passed 85; a final eight-case run passed the narrowed schedule
  assertion and all four new release interactions. No browser failure remains unresolved.
- Production and hosted preview testing exposed an intermittent Shooting history race. The
  shared query hook now reads Next.js's committed search parameters and notifies navigation
  after that commit, avoiding a competing synchronous URL snapshot during Back navigation.
- GitHub CodeQL flagged research-support code. Mockup destinations are now a fixed allowlist;
  the comparison generator logs completion without dumping intermediate records. Regeneration
  left the published comparison files unchanged; CodeQL passed after these changes.
- The advisory network-idle alignment sweep was stopped when polling prevented useful progress.
  The assertion-based alignment and responsive-layout suites passed in the browser sweeps.
- Production screenshots at 390px and 1280px confirm that Season Report, Games, Schedule Edge,
  Shot Value, and reference content fit without page-level horizontal overflow. Evidence is
  in `docs/screenshots/redesign-*`. Games expansion URLs survive reload; changing dates clears
  the previous game selection. Filters and expansions remain instantaneous.

Hosted preview and post-merge production verification are recorded with the release PR.

After the history fix: ten consecutive production-mode repetitions passed, followed by all
39 checks covering Shooting, Games, Season Report, schedule contracts, and release interactions.
Lint, typecheck, all 969 unit tests, and the production build also passed on the corrected code.
