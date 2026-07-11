# FullCourt — Manual Browser Checklist (2026-07-10)

Things only a human in a real browser can verify. Companion to
`audit/ux-product-audit-2026-07-10.md` (finding IDs referenced below).
Suggested setup: Chrome normal + incognito, and a phone (or DevTools device mode, 375×812).

## A. Cold-start behavior (F-01) — do this FIRST, in incognito, after ≥1h of no site traffic

- [ ] Open https://fullcourt-nba.vercel.app/ cold. Does the matchup list load, or do you see
      "FAILED TO LOAD GAMES" / a red date-error line? If it errors, does it EVER recover without
      a manual reload? (Code says no — plain fetch, no retry.)
- [ ] Immediately open `/playoffs` and `/shot-quality` in new tabs. Note whether the first paint is
      the red "FAILED TO LOAD…" card, and how many seconds until SWR retry fills the data in.
- [ ] Check Vercel → Functions logs for the 500s recorded at ~2026-07-10 13:18 UTC
      (`/api/playoffs?season=2025-26`, `/api/shot-quality?season=2025-26`): what was the actual
      exception? (Connection timeout vs. something else.)
- [ ] Check the Supabase dashboard: is the project on a plan/state that pauses or cold-scales after
      idle? Any connection-limit warnings around that timestamp?

## B. Deployed-build parity (F-19)

- [ ] Footer should read `RENDERED: 2026-07-04 10:54 UTC` until the next deploy. Confirm the
      deployed commit in Vercel → Deployments equals `855e1a4` (or note the gap). The audit assumed
      deployed ≈ HEAD; several findings (e.g. F-04) were traced in HEAD source only.

## C. Offseason landing page (F-02)

- [ ] Confirm `/` auto-selects a mid-April 2026 date (selected-date line under the month tabs) and
      the stat row shows that day's games under "GAMES TODAY".
- [ ] Watch the first paint: how long does the `0 / 0.0 / — / 0` stat row linger before real data?
- [ ] Gut check as a stranger: does anything on screen tell you the season is over? (Expected: no.)

## D. Mobile viewport (375px)

- [ ] `/` matchup card main row: away block (110px) + fatigue bars + home block (110px) +
      REST ADVANTAGE panel (180–200px) are fixed-width in a flex row
      (`matchup-card.tsx:638-674`) — does it overflow, squish the bars to nothing, or clip the RA
      panel? This was NOT verifiable from code alone.
- [ ] Nav bar: 5 links + ticker at 375px — wrapping/overflow?
- [ ] `/analysis`: threshold bar chart + explore table (table has `overflow-x-auto`; chart?).
- [ ] `/shot-quality`: two side-by-side courts in value mode — do they stack (`md:grid-cols-2`)?
- [ ] Explore game-detail modal on mobile: scrollable? close button reachable?

## E. Visual/asset checks

- [ ] Favicon in the tab: custom FullCourt mark or the default Next.js icon? (F-10)
- [ ] Paste the site URL into a LinkedIn/KakaoTalk/Slack draft: what does the preview card show?
      (Expected: bare/no image — F-10.)
- [ ] Team logos: `cdn.nba.com/logos/nba/{id}/global/L/logo.svg` — do all 30 load? Check a few
      historical seasons in the explorer (e.g. 1990s SEA/VAN/NOH rows) for the abbreviation-chip
      fallback vs. broken images.
- [ ] Click SYSTEM STATUS in the footer — you get raw JSON. Acceptable for the terminal aesthetic?

## F. Interaction bugs found in code — reproduce live

- [ ] F-04 stuck filter: `/analysis` → click the "RA ≥ 3" bar (page scrolls to Explore) → now try
      the RA dropdown ("RA ≥ 7") and CLEAR FILTERS. Expected bug: both silently snap back to RA ≥ 3.
- [ ] F-12: click a month tab (e.g. JAN) — confirm it selects the LAST day of January, not the first.
- [ ] Modal drill-down: open a game → click a recent game → Back. Confirm history stack works and
      focus returns to the triggering row when the modal closes.

## G. Season-gated (re-run in October 2026)

- [ ] F-05: on/after Oct 1, `/upcoming` — if untouched, expect the false "NO SCHEDULED GAMES MATCH
      THIS FILTER" while the 2026-27 schedule exists.
- [ ] F-27 Realtime: during a live game night, watch a card for score flash updates
      (`useLiveGames`); requires `NEXT_PUBLIC_SUPABASE_*` set in the Vercel env.
- [ ] Vercel cron: switch `vercel.json` to daily (`0 10 * * *`) per CLAUDE.md before the season.
- [ ] `/playoffs` + `/shot-quality` default-season behavior after `defaultNbaSeason()` rolls to
      2026-27 (F-18): expect empty states unless defaults are fixed.
