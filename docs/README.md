# Documentation

Current implementation and operational reference, reconciled with source on 2026-09-08.
Start with the topic you need; do not use old release notes as setup instructions.

| Question | Source of truth |
| --- | --- |
| What does FullCourt do? | [Repository README](../README.md) |
| What is deployed, and what needs attention? | [Project handoff](PROJECT_HANDOFF.md) |
| What work is actually planned? | [Roadmap](ROADMAP.md) |
| How is the application structured? | [Architecture](ARCHITECTURE.md) |
| How do pages, controls, and motion work? | [Frontend](FRONTEND.md) |
| What are the product and design rules? | [Brand grammar](design/BRAND_GRAMMAR.md), [design decisions](design/fullcourt-decision-record.md) |
| How do I add a page? | [Surface contract](ADDING_A_SURFACE.md) |
| What can each endpoint return? | [API](API.md) and `src/types/` |
| How is data stored? | [Database](DATABASE.md) |
| How do I refresh or reproduce data? | [Data pipeline](DATA_PIPELINE.md), [script inventory](../scripts/README.md), [analysis inventory](../ml/README.md) |
| How are NBA L2M reports published? | [Officiating operations](OFFICIATING.md) |
| How do I test and release? | [Testing and CI/CD](TESTING_AND_CICD.md) |
| What needs checking when games resume? | [Live-season checklist](LAUNCH_DAY.md), [season rollover](SEASON_ROLLOVER.md) |
| Why were choices made? | [Decisions](DECISIONS.md), [ADRs](adr/), [research index](research/README.md) |
| What historical records are retained? | [Archive](archive/README.md) |

## Maintenance rules

Update an existing section when behavior changes. Do not append a second version of the same
instructions at the bottom. Keep current behavior in reference documents, commitments in the
roadmap, and rationale in the decision record. Link between them instead of copying them.

Source and tests outrank documentation. Avoid hand-maintained dependency versions, test counts,
page counts, or performance guarantees in evergreen guides. A dated release record may report
observed results with its commit and verification limits.

Generated figures belong to their producing scripts. Preserve source snapshots, pre-registrations,
model evaluation reports, ADR amendments, and published content-addressed report files. Remove
superseded mockups and disposable captures once their decisions are recorded; Git retains them.
Screenshots have one generator and capture manifest in `docs/screenshots/`.

The active contributor contract is [AGENTS.md](../AGENTS.md). Historical Claude material is
identified as such and does not override it. This cleanup does not migrate agent harnesses.
