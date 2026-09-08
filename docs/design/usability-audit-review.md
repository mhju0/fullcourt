# Usability audit implementation review

Date: 2026-09-08. Approved independent audit of source `afc5dfc` and its live pages.
Owner approved the before/after implementation on 2026-09-09 for publication.
Release gates are CI and hosted-preview verification; GitHub/Vercel carry deployment status.
Decision: [D-65](../DECISIONS.md#d-65--first-use-clarity-and-an-inspectable-engineering-story--approved).

## Changes to inspect

| Before | After | Reason |
| --- | --- | --- |
| Games inferred three-in-four from seven-day volume and last-game rest | Exact rolling four-night count, using completed prior games plus the selected game | Avoid presenting an approximation as a schedule fact |
| Altitude multiplier described as current altitude | Current venue and altitude carryover have separate labels, including known neutral venues | Match the model flag to its actual meaning |
| HIGH CONF labels | Large, medium and small gap labels; model-score unit in the introduction | Describe gap magnitude without implying a calibrated win probability |
| Mobile calendar always precedes games; active month can sit off-screen | Date stepping stays visible; optional calendar reveals its selected month | Expose a matchup sooner while preserving navigation |
| Shooting definitions, uncertainty and coverage crowd out players | Short signed-value key; optional definitions, filters and coverage | Let visitors start with a player while keeping interpretation available |
| Abstract homepage example | Real completed matchup, date, rest conditions, score and deep link | Demonstrate the product with inspectable evidence |
| Repetitive study introductions and methods bands | Short route-specific questions with compact adjacent methods links | Clarify Games, Season Report, Schedule Edge and Model Results scopes |
| Explore tiles contain spare vertical space | Shorter tiles and real Officiating/Availability previews | Make destinations recognizable from content |
| Availability implies causality and deliberate sitting | Absence associations and explicit magnitude/direction explanation | Match the supported inference |
| Playoff comparison uses ambiguous pronouns | Studied home-court subgroup and opponent's prior-round conditions named separately | Make the grouping readable without reconstructing it |
| Shot Value leads with model acronyms | Location model, zone average and model difference labels | Give the court comparison familiar entry vocabulary |
| Long initial Officiating category list | Common categories first, all types available, selected rare category retained | Reduce initial choice load without removing evidence |
| About explains the name | Purpose, author and source-linked engineering walkthrough | Explain the problem and technical decisions to a non-NBA reader |
| Duplicate homepage/footer utilities | One shared footer with Methods, About, walkthrough, Source, Status and page search | Make supporting routes easier to discover |

Numerical research artifacts, fatigue coefficients, database schema, analytical grouping and
existing motion behavior are unchanged. The schedule-density/venue labels are read-path fixes.
No adoption, participant success rate or individual contribution claims have been invented.

## Verification

Regression coverage includes actual April 2026 schedule/altitude records, mobile first-row
visibility, selected-month visibility, search and expansion, shared rare-category state and the
homepage-to-game deep link. Existing interaction, route-header and data contract checks accompany
lint, type checking and a production build. The before/after review package records the settled
rendered views, automated accessibility results and exact check outcomes.

Verified locally: lint, types, 972 unit tests, production build, documentation links and production
dependency audit passed. Across the targeted browser runs, 156 distinct tests passed; affected
checks were repeated after the last copy and spacing edits. Fifty settled page states across
25 routes at 1440px and 390px had no detected axe violations, document overflow or page JavaScript
errors. Six routes also fit at 320px. At 390×844, the first Games row moved from y=1042 to y=621,
and the first Shooting row from y=958 to y=728; both complete rows clear the dock at y=787.

Automated browser inspection does not establish usability with people, device performance,
physical Safari behavior or screen-reader comprehension. Those remain in [Roadmap](../ROADMAP.md).
The engineering walkthrough describes the system; personal ownership and collaboration wording
requires the owner's account before further elaboration.

### Preview build follow-up

The first two hosted previews timed out during homepage prerendering. The three concurrent
homepage loaders reproduced a stalled season-report read through the hosted database connection;
the same loaders completed in about two seconds when the season report followed the other two.
The homepage now uses that sequence, preserving its data, example selection and error handling.
This avoids the observed stall without changing database configuration or increasing build timeouts.
