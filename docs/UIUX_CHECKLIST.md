# UI/UX Checklist — measured against the sports-data field

Written 2026-08-15. A living checklist of the conventions major sports properties carry,
what FullCourt adopts, what it already had, and what it **refuses with a reason** — so the
next design pass starts from decisions, not from a blank sweep of "what do other sites do".

**Provenance.** Claims about other sites come from their shipped pages, fetched and read on
2026-08-15: ESPN, NBA.com, Basketball-Reference, CBS Sports (blocked — see below), Naver
Sports (m.sports.naver.com shell + its CSS bundle), STATIZ (blocked), KBO (koreabaseball.com,
including a server-rendered record page), KBL. Rows sourced from memory rather than a fetch
say so. Re-verify before citing a row as current — sites redesign without notice.

Legend: **[x]** adopted / already conforming · **[ ]** open, with owner · **[—]** refused,
with the reason.

---

## 1. Mobile & touch

- [x] **Horizontal tab strips signal their overflow with an edge fade** (Naver Sports tab
  strips; ESPN mobile subnavs). Shipped 2026-08-15 (`useEdgeFades`, `nav-bar.tsx`): each side
  fades only while content is under it, because a static gradient dims the last tab of a row
  that fits. The 2026-08-04 measurement that motivated it — OTHER menu entirely off-screen at
  360px with no affordance — is the entry this closes.
- [x] **No control under 16px at phone widths** — the iOS input-zoom floor. Shipped
  2026-08-15 in the class layer (`termSelectClass`, `EXPLORE_SELECT_CLASS`, the /shooting
  search input): 16px below `sm`, the 12px scale above. Needs one hand check on a real
  iPhone; the e2e asserts computed size, not Safari's behavior.
- [—] **`user-scalable=no` / `maximum-scale=1`.** ESPN, NBA.com, Naver Sports and KBL all
  ship it — it is the industry's answer to the same zoom problem, and it disables pinch-zoom
  for every reader to solve a styling bug. B-Ref caps at `maximum-scale=2.0`, also a cut-down.
  FullCourt keeps the default viewport and fixes the trigger instead.
- [—] **KBO's `width=1200` fixed viewport** — no responsive layout at all; the phone gets a
  desktop page to pinch around. Listed because it is what "just don't do RWD" looks like.
- [x] **Touch targets ≥ 44px in the chrome.** The tab row is 44px tall by construction.
- [ ] **Hand-measure the strip on a real device** — fade visibility over the actual OTHER
  trigger at 360px, and the 16px floor against real Safari. Owner: Michael (device).

## 2. Install & platform surface

- [x] **Web app manifest** (ESPN `/manifest.json`, NBA.com `/site-manifest.json`). Shipped
  2026-08-15: `manifest.webmanifest`, `display: standalone`, `start_url: /games` — the front
  door argues, and someone who pinned the site has heard the argument.
- [x] **`apple-touch-icon`** (every major property; Naver ships seven sizes). Shipped: the
  court mark as a build-time 180×180 PNG (`app/apple-icon.tsx`), full-bleed because iOS
  applies its own mask and fills transparency with black. Served **extensionless** at
  `/apple-icon`, like `/opengraph-image` — the `.png` URL 404s; measured.
- [x] **`theme-color`** (B-Ref ships `#4d4438`). Already present before this pass —
  `viewport.themeColor` pinned to `--term-bg`, 2026-08-14.
- [x] **Maskable / 512px manifest icon.** Shipped 2026-08-18: `/icon-192.png` and
  `/icon-512.png`, route handlers over one `maskableIconResponse()` renderer, declared
  `purpose: "maskable"` only — the artwork is inset to the spec's 80% safe circle, so a
  launcher that crops keeps the whole court and one that does not gets the SVG instead.
  Route handlers rather than metadata routes, because the manifest has to name a stable URL
  and a metadata route serves at a basename Next picks (`/apple-icon`).
- [x] **`docs/social-preview.png` is no longer a hand export** — regenerated 2026-08-18 as a
  render of `/opengraph-image`, which retires the drift (it carried "40-SEASON BACKTEST", the
  retired ~55% claim, and the pre-2026-07-30 divider lean). **The GitHub re-upload is still
  manual** and still Michael's: Settings → Social preview (SEASON_ROLLOVER §7).

## 3. Accessibility

- [x] **Skip link as the first tab stop** (ESPN "Skip to main content"; Naver 본문 바로가기).
  Shipped 2026-08-15, with the half most sites miss: `main` takes `tabIndex={-1}` so the
  fragment jump moves *focus*, not just the URL — asserted in e2e.
- [x] **Landmarks with accessible names** — two labelled navs in the bar, a labelled surface
  nav on the front door. Predates this pass; e2e counts hang off the names.
- [x] **Motion is opt-out end to end** — every scroll effect gates on
  `prefers-reduced-motion`, and the resting state lives in the class layer so a reduced-motion
  reader gets the *finished* page, not the animation's start frame (the `.fc-word` 12% lesson,
  2026-08-14).
- [x] **Focus states mirror hover** — `focus-visible:` carries every hover declaration on the
  surface cards; the retracting bar reveals on keyboard entry (`onFocus={reveal}`).
- [x] **The axe half of the a11y pass is CLEAN** — first run 2026-08-24 (all 20 routes,
  wcag2a/aa + 21a/aa + best-practice; report in `docs/audit/2026-08-24-axe-pass.md`,
  local-only) found two discrete defects (fixed same day) and one systemic finding: pole hues
  and the 10px unit slot as *small text* at 3.0–4.4:1 against AA's 4.5:1. Michael chose full
  compliance; the resolution is the two-grade pole rule in `docs/FRONTEND.md` (text-grade
  tokens `--term-red-text`/`--term-blue-text`, the unit slot undimmed, `/shooting`'s noisy
  rows de-emphasized by colour instead of opacity, the front-door ghost numerals painted as
  CSS counters). All 20 routes re-audit with **zero violations**; the token ratios are pinned
  by `design-contrast.test.ts`.
- [—] **The VoiceOver walkthrough.** Carried as open from 2026-08-15 and never run; **refused
  2026-08-30** by Michael as out of scope for this project. The reason it is a defensible cut
  rather than a gap: the structural work a screen reader depends on is shipped and enforced —
  axe is clean on all 20 routes, the contrast ratios are pinned by `design-contrast.test.ts`,
  the three landmarks are distinctly named (`Main navigation` / `Reference` / `Bottom
  navigation`), decorative icons are `aria-hidden`, every dock slot carries its full accessible
  name, and `focus-visible` mirrors hover. What the walkthrough alone would have caught is
  second-order — focus order across a view transition, how a long table reads cell by cell,
  whether the twin-landmark nav is heard as the same routes twice — and an untrained pass
  yields impressions more than actionable defects. **Do not silently reopen this row**; it is a
  decision, not an oversight. The cheap partial substitute, if it is ever wanted, is a
  keyboard-only Tab pass through one page — offered 2026-08-30 and not adopted.

## 4. Tables & data density

- [x] **Mono/tabular numerals in every stat table** — `.mono` (Geist Mono) is the data face
  site-wide. Notable: Naver's shipped home CSS contains **zero** `tabular-nums` /
  `font-variant-numeric`, and KBO's record tables are `<thead>`-only with no `<caption>` or
  `scope` — on numeral and table discipline FullCourt is already ahead of parts of the field,
  not behind it.
- [x] **Every numeric column names its unit** (`termThUnitStyle`) — the house rule since
  2026-08-01. No fetched site does this consistently; keep it, it is a differentiator.
- [x] **Width-capped numeric tables** (`TERM_NUMERIC_TABLE_MAX_WIDTH`) rather than B-Ref's
  full-bleed stretch — a 2026-08-11 decision with its reasoning in `terminal-styles.ts`.
- [x] **Row hover highlight on interactive rows** — the slate row carries `hover:bg`; rows
  that do nothing get nothing, which is the honest version of B-Ref's everywhere-highlight.
- [x] **Sticky `<thead>` on long scrolling tables** (B-Ref, Baseball Savant) — measured and
  adopted 2026-08-24. Every `fc-table` on the site was measured at 1440×900: the `/referees`
  officials table ran 74 rows / ~2,640px (~3 viewports) and adopted the `/shooting` mechanism
  (`stickyHeader` against its own `.fc-scrollport` scroll box, never the page scroll — the
  chrome collision FRONTEND.md records). Everything else measured at or under ~1.2 viewports
  (the 30-row league tables on `/season` and `/schedule` at ~1,100px, `/analysis` at ~880px)
  and was refused: a header off-screen for the last few rows does not earn an internal
  scrollbar. Re-measure only if a table's population grows, not on principle.
- [—] **Zebra striping** (STATIZ-dense tables). The hairline-border row rhythm is the house
  style; stripes on top of it read as a second, competing rhythm. Revisit only if a table
  ever drops its row borders.

## 5. Trust & provenance (the Korean-site strength)

- [x] **An "as of" stamp on data surfaces** — Naver/KBO record pages carry 기준 시각 ("as of
  08.15 06:00"); it is the single strongest trust pattern in the Korean set. Shipped on
  **/analysis** 2026-08-18, server-rendered: `getDataAsOf()` (the same count/max that keys the
  held backtest) → `PageHeader`'s `asOf` prop → `formatDataAsOf`. The shape decision was
  server-rendered per surface rather than a field on every API response — no route's response
  shape or cache policy moved. **The date only:** a count in the stamp sat four lines above a
  tile with a different count under the same noun. The footer's `RENDERED` stamp is still
  deliberately *not* this — it says when the layout rendered and makes no data claim.
- [x] **The season-scoped surfaces carry their own stamp** — shipped 2026-08-27, Michael's call.
  `/season` and `/schedule` answer for one *selected* season, so the global final-game date
  above would have been a claim about a different population; each now prints **that season's**
  most recent final game as `AS OF <ET date>`, in the same mono/muted treatment. **The API-shape
  cost this row had been waiting on turned out not to exist:** both reducers already read every
  game in the season, so `latestFinalDate` is derived from rows in memory — no second query, no
  new read, no cache-policy change, and no way for the stamp and the figures to describe
  different populations. Null before a season's first final game, and nothing renders then (the
  whole-element form of the `NO_FIGURE` rule).
  The same change closed a live defect: `/schedule`'s old `AS OF` printed the date the
  **response was built** — today — under the label `/analysis` uses for a data date, so two
  identical-looking lines meant different things. It is now the data date, and shown on every
  season rather than only a provisional one, because a finished season's stamp is the one a
  reader checks months later. `e2e/schedule-disparity.spec.ts` asserts the stamp is **not**
  today's ET date, which is what fails if the old meaning returns.
- [x] **Baselines named next to every rate** — the venue-baseline rule (CLAUDE.md). No
  fetched site does this. It is the site's spine; the checklist exists partly so no adoption
  ever dilutes it.
- [x] **Refusing false precision** — em dash for unmeasured (`NO_FIGURE`), refusal rows,
  "about 0.5". Keep.

## 6. Loading, perf, resilience

- [x] **Layout-stable loading** — loading/error branches keep the page's `gap-12` skeleton
  so nothing shifts when data lands (FRONTEND.md).
- [x] **Heavy libs stay out of the shared bundle** — recharts behind `*-lazy.tsx`, GSAP
  inside an effect. Re-verified 2026-08-13.
- [x] **Edge caching with staleness as a *claim*** — `CACHE.historical` / `CACHE.inSeason`
  per route, policies pinned by tests (2026-08-14).
- [x] **Font subsetting for the OG/wordmark faces** — dissolved rather than done
  (2026-08-19): Outfit was retired from the OG card with the W4 lockup, which now renders
  **Geist** — the same family the whole app ships — from two ~73KB ttf files traced into
  the OG bundle only. There is no longer a face bundled for one card; a future perf pass
  may still subset the two ttfs, but this row's premise is gone.

## 7. Identity & theming

- [x] **One type scale, eight steps, each with one job** — `TYPE` in `terminal-styles.ts`
  (2026-08-18). The scale had been a docblock listing *ranges*, and the app had drifted to 36
  distinct font sizes including 9.5, 10.5, 12.5, 17, 19, 21 and 28. `scripts/audit_design_scale.mjs`
  reports strays with `file:line`; `design-scale.test.ts` pins the steps and keeps the script's
  copy in step. See FRONTEND.md §Type. Every major property runs a tight scale — this was
  FullCourt's own gap, not a convention borrowed from anyone.
- [x] **One shared stat tile** — `StatTile` / `StatFigure` (2026-08-18). Replaced eight
  independent implementations (`StatCard` ×2, `Tile`, `RateTile`, `StatCell`, `VerdictTile`, plus
  inline copies in `availability-content.tsx` and `playoff-*`), which had disagreed on every
  measurable property. Two components, not one, because the reading order carries meaning — label
  first for a row a reader scans, figure first for the one number a section states. Verified: two
  rendered signatures across four pages, differing only by the presence of a sub-label.
- [x] **A tracking and leading scale** — `TRACK` (4 steps) and `LEAD` (3), 2026-08-18. Was 18
  letter-spacing values and 15 line-heights; the tails were not decisions — 1, 1.05 and 1.1 all
  meant "a figure needs no air above it". `TRACK` follows a rule rather than a history: more open
  as the type gets smaller, tighter as it gets larger, asserted by a test so it cannot decay into
  four arbitrary numbers.
- [x] **The class layer can reach the scales** — a `@theme` block generates `text-micro` …
  `text-figure`, `tracking-label` …, `leading-body` (2026-08-18). This was the gap that made drift
  inevitable for class-built components: a responsive step cannot be an inline style, so they wrote
  the literal because there was nothing else to write. `text-[16px] sm:text-data` is the standing
  case, and the 16px stays a literal — mobile Safari's threshold, not a step of ours.
- [x] **The scales are enforced, not just documented** — `page-contract.test.ts` runs the audit
  script and fails the gate on any stray, superseding the earlier "deliberately no lint rule"
  stance (2026-08-18). The reason for the reversal is measured, not aesthetic: the 15px prose rule
  sat in FRONTEND.md unenforced and was broken across the module content components. The escape
  hatch is a **named exemption with a reason**, which is reviewable in a diff, not a disabled test.
- [x] **A new page cannot ship off-pattern** — [docs/ADDING_A_SURFACE.md](ADDING_A_SURFACE.md) is
  the contract, and each of its rules names the test that holds it: `PageHeader`, the `gap-12`
  chapter column, nav registration in both directions, and presence in the alignment audit's route
  list. Written 2026-08-18 because every rule the UI pass found broken had been documented and
  enforced nowhere.
- [x] **Light-only, committed** — "Broadcast" (FRONTEND.md). B-Ref ships a `theme-color` and
  no dark mode either; ESPN/NBA are dark-capable apps, and FullCourt's refusal is a recorded
  decision, not a gap. `/about` stays the one dark surface.
- [—] **Team logos and marks** — every US property carries them; FullCourt deliberately does
  not (licensing; abbreviations + era-aware city names instead). Not a gap.
- [—] **Odds/betting modules** (ESPN pushes them hard; CBS leads with them). The win-total
  market check exists as an *evidence* surface with a published null — that is the house
  relationship to the betting market, and a odds rail would invert it.
- [—] **Autoplay video, sticky video rails, infinite feeds** (ESPN, CBS, Naver home). A
  reference site reads; it does not follow you.

## 8. Blocked / unverified this round

- **STATIZ and CBS Sports refuse non-browser fetches** (0 bytes to curl with either UA).
  Their rows above are marked from memory. A browser-session pass could verify; low value —
  nothing above hinges on either.
- **Naver serves a JS shell** — head evidence is real (icons, viewport), but body-level
  patterns (기준 stamps, sticky headers) come from its record pages as remembered, not as
  fetched this round.

---

## How to use this

A new UI/UX round starts by re-reading the **[ ]** rows, not by re-surveying the field. An
adoption PR should name the row it closes and flip it to **[x]** with the date in the same
commit — the same rule as FRONTEND.md and the code (docs ship with the change). A new
refusal gets a **[—]** row with the reason, so the next pass does not relitigate it.
