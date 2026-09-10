# FullCourt: user and recruiter polish review

Reviewed September 11, 2026 (Korea time). Repository candidate: `50249df`.
This is an audit and proposed backlog, not an implementation or release record.
Product code and production data were not changed. The owner selected antislop throughout.

## Recommendation

FullCourt already has enough analytical depth to showcase. Prioritize a reliable first visit,
an easy route to a personally interesting finding, and evidence that survives sharing. More
studies are less valuable before launch than preventing empty defaults and observing actual users.

The live application can serve as the demonstration. Keep the current rest-focused identity;
make it easy to reach one real example and then understand how it was built. The repository
is public, and the live footer already links to it. A separate GitHub Pages site is not needed
to address the observed product gaps.

The regular season starts **October 20, 2026** ([NBA key dates](https://www.nba.com/news/key-dates)).
Proposed plan: finish visible feature work before opening night, then use the first 7–14 days
to validate actual ingest and publication behavior before reducing attention to maintenance.
This is a suggested schedule, not a scheduled automation or a promise of unattended monitoring.

## What was checked

- Source/tests, current Git status, roadmap, brand grammar, rollover and operating checklists.
- Live homepage to Games, expansion of a completed matchup, player search and expansion,
  About, Explore, and Officiating report expansion. Desktop and 390 × 844 browser views sampled.
- A fresh mobile Games deep link and a desktop-to-mobile resize were checked separately.
- Live `/api/health` returned `status: ok`, `db: up`. This proves connectivity, not fresh scores.
- Current GitHub main CI run [34485317110](https://github.com/mhju0/fullcourt/actions/runs/34485317110)
  succeeded for `50249df`; repository visibility was confirmed PUBLIC.
- Local lint, typecheck, and documentation-link check passed.
- Local full Vitest rerun: **73 files, 972 tests passed**. The initial concurrent run had four
  failures after two 5-second timeouts; both affected suites then passed all 21 tests in
  isolation, and the normal full command passed alone. Concurrent audit processes were running
  initially. This does not establish a production bug or a cross-file isolation defect.
- Compared public first-party material from six analytics products below.

Limits: not an exhaustive route/control, screen-reader, performance, or physical-device audit.
No new production build, Python-contract run, dependency audit, or full browser suite was run
in this pass. Existing CI success is separate evidence. No friends have tested the site as part
of this review; the protocol below is prepared for that next step. October behavior is inferred
from code, not simulated with a changed browser clock or observed in a future production run.

## Preserve these strengths

- Homepage explains rest/travel/schedule and shows the denominator, venue baseline and causal
  limitation with the result. It has a distinctive design rather than a generic SaaS pitch.
- Games already retains season, date and expanded game in the URL.
- Searching `jokic` finds Nikola Jokić; player expansion retains the query/player in the URL.
- Shooting keeps attempt counts with rates and explains percentage points and uncertainty.
- Officiating separates data-through date from last successful refresh. Its report expansion
  exposes NBA verdict text, report links, video-page links, and a link to the selected game.
- About and How It Was Built already exist. The engineering page includes real implementation
  decisions, tradeoffs, verification limits and lessons from past usability corrections.
- Explore already groups studies around basketball questions. Do not propose rebuilding it
  as though question-led navigation or source access were absent.

## Prioritized findings

### 1. High: default research views can become empty on October 1

**Evidence:** `src/components/playoffs-content.tsx:351` and
`src/components/shot-quality-content.tsx:434` initialize selection with `currentDisplaySeason()`.
`src/lib/nba-season.ts:144` advances the label in October. These defaults do not query the most
recent published season. Playoffs renders an empty bracket message at line 384; Shot Value
renders an empty-data message at line 513. Its explanation, “SHOT-LOCATION COORDINATES ONLY
REACH BACK TO 1996-97,” does not explain missing data for a new season.

**Impact:** a valid research page can look unfinished precisely when NBA interest returns.
This is a source-confirmed default-policy gap; the future empty result depends on available data.

**Proposed fix:** default each research surface to its latest available publication; retain an
honest current-season empty state when explicitly selected. Explain whether data is not yet
published or outside historical coverage, and offer a direct return to the latest results.
Do not apply a single global season rule to Games, historical research and playoffs.

**Acceptance:** September 30, October 1, opening week, and pre-playoff fixtures; valid explicit
selections win; a genuinely missing publication is distinguishable from a request failure;
previous data never appears under a newly selected season label.

### 2. Medium: Games hides the offseason explanation below the slate on phones

**Evidence:** live default opens April 12, 2026 with 15 final games. The completed-season notice,
next-season action and Edges Ahead are in the `aside` after the matchup list
(`src/app/games/page.tsx:535`). On desktop they are visible alongside the date board; on mobile
they follow the list. This behavior is intentional under the current rollover policy.

**Impact hypothesis:** a new fan may think the site is stale, and a recruiter may never reach
the useful upcoming-season control. This requires user observation before changing the default.

**Proposed fix:** keep the useful historical default but put a short season-status explanation
and upcoming-season action beside the date controls on mobile. Consider a separate, durable
“See an example” entry for first-time visitors. Do not silently replace historical evidence with
projections or label the last final slate as today's games.

**Acceptance:** a first-time phone visitor can identify which season/date is shown and reach
the upcoming schedule without scrolling past all games.

### 3. Medium: game row controls have indistinguishable accessible names

**Evidence:** all collapsed rows expose “Expand game details” in the live accessibility tree.
`src/components/matchup-table.tsx:638` sets this generic `aria-label` on each row control.

**Proposed fix:** include away/home teams and date in the expand/collapse name. Preserve keyboard
activation and expanded state. Officiating's named game controls provide an existing local pattern.

**Acceptance:** the accessible button list distinguishes every matchup; Enter and Space open the
intended game; collapse retains focus. Verify with a screen reader, not only an automated scan.

### 4. Medium: the user-facing status link reports only database liveness

**Evidence:** footer `src/app/layout.tsx:125` links “System status” directly to raw `/api/health`
JSON. `src/app/api/health/route.ts` runs `select 1`. It does not establish score freshness,
publication completeness or a successful pipeline write. The homepage historical result has
coverage but no data-through stamp (`src/components/home-content.tsx:26`); the schedule result
does show one at line 59.

**Proposed fix:** preserve the machine health endpoint and add a concise human-readable data
status view or section. Distinguish coverage, last data date and last successful refresh by
surface. Reuse Officiating's pattern. Derive dates from producers/records, never build time.

**Acceptance:** a feed failure can coexist with a healthy database without showing “all current”;
offseason is distinguished from stale data; unavailable refresh metadata is honestly unknown.

### 5. Medium: shareable state is inconsistent across studies

**Evidence:** Games, Shooting and Officiating retain selected records in live URLs. Playoffs
and Shot Value use local `useState` for season; Shot Value also keeps mode/comparison locally
(`playoffs-content.tsx:351`, `shot-quality-content.tsx:434–436`). Games also inherits the generic
“FullCourt · NBA Analytics” browser title rather than a route-specific title.

**Proposed fix:** extend the existing validated URL-state convention to those studies and add
a visible copy/share action where finding-sharing matters. Give Games a specific page title.
Treat finding-specific social images as a later enhancement, not a prerequisite for URL sharing.

**Acceptance:** copy/open in a fresh tab reproduces season and comparison; Back/Forward work;
unsupported values recover honestly; share text retains date, unit and relevant limitation.

### 6. Low: selected date visibility does not recover after viewport narrowing

**Evidence:** starting at desktop and resizing to 390 px left October and early-April chips
visible while the selected April 12 chips were offscreen. A fresh 390 px load correctly revealed
both selections. `src/app/games/page.tsx:339` reruns the strip reveal on selection/calendar
changes, with no viewport-change dependency.

**Proposed fix:** reveal the selected controls when their container changes size, without
moving keyboard focus or resetting user scrolling unnecessarily. Test orientation changes on
a real phone. This is a resize-specific issue, not a broken fresh mobile default.

### 7. Low: singular search results still say “1 players”

**Evidence:** live `jokic` search shows “1 PLAYERS IN 2025-26”;
`src/components/player-rest-content.tsx:548` unconditionally renders the plural.

**Proposed fix:** count-aware wording. Include zero, one and many in routine visual verification.

## Product opportunities, ranked by likely value and maintenance cost

These are recommendations, not proven user needs or accepted roadmap commitments.

| Opportunity | Human purpose | Suggested scope | Cost |
| --- | --- | --- | --- |
| A real example entry | Let a visitor experience the product without choosing among decades of games | Link to a validated completed matchup and explain what to inspect; reuse existing URL state | Low |
| Team-first game lookup | Answer “What does my team's schedule look like?” without guessing dates | Team + season, with upcoming/completed navigation and a shareable URL | Medium |
| Upcoming rest gaps by horizon | Make “Edges Ahead” relevant to what someone might watch soon | Next 7/30 days, retaining an all-season view; clear projected labels | Medium |
| Copy a finding with context | Let friends discuss the same evidence | Selected URL plus season, unit, source/limitation; no account | Low–medium |
| Download a finding image | Make a useful, attributable image for messages or applications | One carefully chosen surface first, source date and uncertainty included | Medium |
| Feedback entry | Help a visitor report confusion at the exact view | Owner-approved contact destination with current URL and optional note | Low–medium |

Do not add accounts, saved preferences, an AI chatbot, betting picks, push notifications, a
general NBA news feed or more model families for this polish cycle. They expand ongoing work
without evidence that they solve the observed first-use problems. Existing roadmap boundaries
already exclude accounts and persisted preferences.

## Lessons from comparable products

| First-party reference | Useful pattern | FullCourt application |
| --- | --- | --- |
| [NBA Stats quick links](https://www.nba.com/stats/quicklinks) and [glossary](https://www.nba.com/stats/help/glossary) | Discovery by statistical task, with definitions available | Keep question-led Explore and make unfamiliar terms understandable where used |
| [Cleaning the Glass](https://cleaningtheglass.com/) | Explains data filters and percentile context as part of its value | Explain why FullCourt includes/excludes records; avoid unsupported professional-authority claims |
| [Dunks & Threes comparison](https://dunksandthrees.com/compare) | Direct comparison around a distinctive analytical product | Give users a specific comparison task; avoid unrelated metric accumulation |
| [Basketball-Reference](https://aws.basketball-reference.com/) | Familiar player/team entry points lead into historical records | Make team/player intent a shorter route into existing evidence |
| [Our World in Data](https://ourworldindata.org/redesigning-our-interactive-data-visualizations) | Source visibility, sharing/download, and multiple useful data views | Make the selected finding easy to inspect and pass on; add chart/table switching only where useful |
| [Datawrapper accessibility](https://www.datawrapper.de/accessibility) | Keyboard access, semantic structure and alternatives to visual-only information | Check complete interpretation tasks, including named controls and readable data equivalents |

These are pattern comparisons based on public product material, not comparative usability
measurements. They do not justify copying another site's visual identity.

## Recruiter path

Aim for an optional 90-second path: understand the question, inspect one real result, then
read one engineering decision. Keep ordinary fans in the product; let recruiters follow About
or How It Was Built when they want implementation evidence.

Use the existing engineering page. Its opening action currently goes to generic Games; a
specific, verified worked example would better fulfill “Follow one finding from source data
to a working interface.” Keep the technical depth, but make the record and result concrete.

Before adding personal ownership claims, ask the owner to confirm what they designed,
implemented, researched, and maintained, including collaboration/AI assistance as appropriate.
The repository can prove behavior and commits, but cannot independently establish the full
personal contribution story. Do not invent usage, uptime, model accuracy or performance claims.

## Friend-testing protocol

Proposed first round: five people, roughly three NBA fans, one casual/non-fan and one developer
or recruiter-like reader. This is a practical discovery round, not a statistically representative
sample. Adapt the mix to who is available. Use their usual device; include actual mobile Safari.

Allow 15–20 minutes each. Say: “We are testing the website, not you. Think aloud. I will avoid
explaining it until the end.” Ask consent before any recording; written notes are sufficient.

| Task | What to observe |
| --- | --- |
| Look at the homepage for 20 seconds, then explain what this site does | Can they state the purpose without calling it a complete winner predictor? |
| Find a game involving a team you care about and explain who had more rest | Route choice, date/team friction, whether model-score units are understood |
| Find a familiar player and explain the shooting comparison | Search success, attempt counts, percentage points, recognition of uncertainty |
| Find where one displayed result came from | Can they reach methods or the primary record without help? |
| Prepare the link you would send a friend | Does the recipient get the same selection and understand its context? |
| For the non-NBA/developer reader: identify one engineering decision and its tradeoff | Is the existing walkthrough understandable without NBA expertise? |

Do not tell participants which buttons to click or teach the metrics first. After each task,
ask how easy it felt (1–7), what they expected, and where they lost confidence. Finish with:
“When, if ever, would you come back?” Avoid leading with “Do you like it?”

Record: participant code; device/browser; task; unaided/assisted/failed; approximate time;
first wrong turn; exact quote; interpretation; severity; candidate fix. Separate observed
behavior from your explanation. Do not store names or private contact details in this repo.

Prioritize incorrect interpretation and blocked tasks over cosmetic preference. A repeated
issue across two participants is a useful signal; a single severe misleading result also merits
action. Re-test corrected tasks with two or three fresh people. Suggested release target:
four of five finish the core tasks unaided, with no unresolved serious misinterpretation.
That is an internal acceptance target, not evidence of population-wide usability.

Invitation draft, for the owner to send:

> Could you try FullCourt for 15 minutes on the device you normally use? I'd like to watch you
> find an NBA game or player and tell me what you think the numbers mean. I'm looking for
> confusing parts, so you don't need to prepare or know advanced stats. Honest reactions will
> help more than compliments. We can just take notes; no recording is necessary.

No invitations were sent and no user feedback was fabricated.

## Proposed path to maintenance

1. **September:** address rollover defaults, accessible game labels and status clarity; conduct
   the first friend round before committing to additional features.
2. **Early October:** implement the strongest observed friction fixes and at most one discovery
   feature. Re-test with new people and physical devices.
3. **Before October 20:** freeze optional scope; verify a populated preview and production;
   exercise the October defaults and opening-week schedule. Preserve publication protocols.
4. **First 7–14 season days:** follow `docs/LAUNCH_DAY.md`. Demonstrate actual final-score writes,
   correct Eastern dates, fatigue coverage, and prediction resolution. Review canonical-ID
   re-keying and shooting refresh under `docs/SEASON_ROLLOVER.md` when inputs become available.
5. **Maintenance:** continue ingest monitoring, source-refresh review, dependency/security
   checks and reproducible bug fixes. Review feature suggestions in batches instead of turning
   every new idea into a release. Choose a realistic personal time budget after opening week.

The existing browser suite runs separately from CI. A small preview smoke check for home →
game → details, player search, source access and mobile navigation would reduce manual burden.
Use deterministic fixtures for failure/rollover checks and a bounded read-only populated-preview
check for real integration. Do not weaken preview access controls or mutate production to test it.

Maintenance readiness requires the live writer evidence and human/device checks above; an
offseason green job, healthy database, or passing unit suite cannot replace them.
