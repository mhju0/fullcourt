# A measured null lives in Behind the Data, and a guarded page keeps a sentry

Status: accepted (2026-08-24)

## Context

The site keeps producing measurements that come back empty — the win-total market check, the
time-zone flights, most of what was asked of the referee corpus, the playoff model's accuracy
against the naive favourite — and each one had been housed ad hoc, wherever it happened to be
built. The market check sat as a full card (bucket table plus three paragraphs of archive
method) at the foot of `/schedule`; the time-zone null got its own method page; the referee
and playoff nulls lived inside their models' sections. The question Michael raised: should the
nulls be tucked further away, visible only to a reader who clicks deliberately, or published
more prominently? Both instincts were live — the nulls are unglamorous endings, but "I looked
and found nothing" is also the site's honest core.

## Decision

Transparency, with one placement rule rather than case-by-case judgement:

1. **A null's evidence lives in Behind the Data**, inside the section for the model it was
   measured against (or its own section when no model owns it, as `time-zones` already
   established). The win-total market check's table and method prose move whole into a
   `THE MARKET CHECK` section of `/behind-the-data/schedule-edge`.
2. **A null that guards a specific product page's claim keeps a one-paragraph sentry on that
   page.** `/schedule` is a leaderboard of schedule edges, which invites exactly one misuse —
   betting season over/unders — so the sentence that closes that door (with the pinned r and
   n) stays at the foot of the page and links to the evidence. A null with no surface to
   guard gets no product-page presence at all.
3. **The Behind the Data index carries a second list, `MEASURED, AND FOUND NOTHING`** — the
   published nulls keyed by question rather than by model, each row linking to the section
   that holds its evidence. The list carries no figure of its own, and a row may only ship
   once the empty result is actually published on the page it points at.

## Why not further away, and why not fully on the product pages

Hiding the nulls deeper spends their value on nothing. They are the site's credibility
currency, and the audience that reads a method section is exactly the audience that currency
buys trust with; a casual reader never meets them either way, so there is no cost to recover.
But a product page carrying a full null (table, archive sourcing, caveat paragraphs) makes an
unglamorous ending the page's ending — the market check was the last thing `/schedule` said,
at more length than the leaderboard's own column guide. The sentry keeps the guardrail where
the temptation arises; the evidence keeps its full length where evidence is read.

## What keeps it honest

- Sentry and evidence render from the same committed `win-total-benchmark.json`, so the two
  surfaces cannot drift apart; `win-total-benchmark.test.ts` still guards the file itself.
- `schedule-disparity.spec.ts` pins the split from the product side: the null sentence
  visible, the bucket table absent, the crosslink resolving to the method page.
- `behind-the-data.spec.ts` pins it from the reference side: the MARKET CHECK section renders
  the table and the null sentence, and the index's four null rows each resolve.
- The index list was fact-checked against the pages it points at before shipping — a first
  draft claimed "several fatigue terms carry nothing", which the rest-advantage page's own
  ablation section contradicts (travel is its largest contributor of correct calls). The rule
  that a row may only restate what its target page publishes is written into the list's
  docblock because it already caught something.

## Consequences

- Future nulls have a default home and a default prominence; "where does this go" stops being
  a per-finding negotiation. A new null adds a row to the index list and its evidence to the
  owning section, and takes a product-page sentry only if it guards a claim.
- `/schedule` ends on its own subject again, one paragraph of guardrail rather than a table.
- The one-home principle of [ADR 0008](0008-schedule-pricing-has-one-home.md) now covers
  negative results: one home for the evidence, sentries where a claim needs guarding.
