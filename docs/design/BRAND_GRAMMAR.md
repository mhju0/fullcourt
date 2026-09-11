# Brand grammar

FullCourt is the product; rest advantage is a metric. The interface helps a casual fan inspect
NBA rest, travel, and schedule findings, then follow the evidence. Homepage findings stay within
that premise; secondary studies belong in Explore.

## Identity

The wordmark is FULLCOURT, one word, in Geist capitals. Running prose uses FullCourt.
COURT takes the accent color. The shared optical kerning lives in
`src/lib/brand/wordmark-kern.ts`; do not recreate the lockup with independent letter spacing.
The previously explored hollow-U treatment was withdrawn; PRs #51/#52 and DECISIONS.md retain
that decision. The homepage statement is “Rest is a stat.” `/about` explains purpose and author; `/how-it-was-built` explains engineering decisions.

The application is light, with dark text, hairline rules, aligned data, and whitespace between
sections. The homepage is the deliberately dark exception. Geist carries text; Geist Mono
carries numerals and short labels. Exact tokens and layout mechanics belong in
[Frontend](../FRONTEND.md) and `src/lib/terminal-styles.ts`.

## Color and evidence

Indigo is the interface accent. Fatigue/rest values retain rose/teal semantics. Shooting has an
explicit owner-approved exception: green/red tint only in signed difference cells, with uncertain
values muted. Officiating uses blue for missed calls and gray for incorrect whistles. Every value
keeps a direct number, sign, or label; color alone never explains a finding.

Every headline needs its denominator, baseline where applicable, and a visible limitation.
Report null findings honestly. “Rest advantage” does not mean a causal effect or a complete win
forecast. Games shows matchup conditions; historical win rates belong in Model Results.
The Home-court advantage study also shows historical venue baselines beside rested-home
rates under D-70; Season Report keeps that comparison specific to the selected season.
Officiating reports cannot establish whole-game accuracy, individual-official culpability, or
team helped/hurt rankings.

## Composition and interaction

Use the page question, principal finding, and accessible evidence as the reading order. Prefer
a chart for patterns and a table for lookup. Secondary tables and methods can expand; primary
mobile comparisons must be visible without sideways page scrolling. No decorative imagery or
new motion is implied by a cleanup.

Explore uses equal-height study cards with the same category, title, question, and action structure. Keep numerical findings on the destination study rather than adding a second card format. Its reading order is Home-court Advantage, Shooting by Rest, Playoff Rest, Availability Cost, Expected Shot Value, Officiating, then Model Results: core basketball questions first, related studies next, technical validation last.

The homepage has one short CSS hero entrance. Repeated controls, keyboard actions, and record
expansions are immediate. Respect reduced motion. [Frontend](../FRONTEND.md) and
[the design decision record](fullcourt-decision-record.md) hold the current implementation and
owner-approved exceptions to older motion rules.

## Decision history

Front Office was selected from four visual directions in August 2026. The rejected directions
and subsequent refinements remain in Git snapshot `34b8961`; static pitches and embedded font
copies were removed after implementation. [DECISIONS.md](../DECISIONS.md) and the
[ADRs](../adr/) preserve rationale without presenting old mockups as current product behavior.
