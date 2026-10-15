# 002 — Reuse shared Games control feedback

- **Status**: IMPLEMENTED · locally verified
- **Commit**: 2d458df
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: one source file and focused browser regression

## Problem

src/app/games/page.tsx:227,572,583,602,613. Games date chips and four day/week arrows use local active scale utilities instead of the shared reduced-motion guard. The chips also replace shared timing with Tailwind transition defaults.

Current source excerpt:

```tsx
        "mono flex shrink-0 w-[3.75rem] flex-col items-center border border-[var(--term-border)] px-2 py-2 transition-[transform,background-color,border-color] active:scale-[0.97]",

            aria-label="Previous week"
            className="bg-[var(--term-surface)] active:scale-95 sm:hidden"
            style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}

            aria-label="Previous day"
            className="hidden bg-[var(--term-surface)] active:scale-95 sm:inline-flex"
            style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}

            aria-label="Next week"
            className="bg-[var(--term-surface)] active:scale-95 sm:hidden"
            style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}

            aria-label="Next day"
            className="hidden bg-[var(--term-surface)] active:scale-95 sm:inline-flex"
            style={{ border: "1px solid var(--term-border)", borderRadius: "var(--term-radius)" }}
```

## Target

Add fc-control-button to GamesDateChip and all four Previous/Next day/week buttons. Remove their ad hoc active scale and transition utilities. Shared rule: transform 90ms ease-out; box-shadow/background-color/border-color 120ms ease-out; active scale(0.97). Reduced motion: transition none, transform none.

Exact target code:

```tsx
"fc-control-button mono flex shrink-0 w-[3.75rem] flex-col items-center border border-[var(--term-border)] px-2 py-2"
// Previous/Next week:
className="fc-control-button bg-[var(--term-surface)] sm:hidden"
// Previous/Next day:
className="fc-control-button hidden bg-[var(--term-surface)] sm:inline-flex"
```

## Repo conventions to follow

Follow docs/FRONTEND.md Motion and src/app/globals.css:734-748 shared control feedback. Repeated controls and record expansion are immediate; reduced motion keeps static feedback.

## Steps

1. Add a failing browser regression for the observable defect on baseline 2d458df.
2. Apply only the target edit at src/app/games/page.tsx:227,572,583,602,613.
3. Run focused regression in normal/reduced modes at 390/1440px and required project gates.

## Boundaries

No new dependencies, modal transitions, FINAL cues, layout, colors, labels, keyboard-navigation motion, homepage entrance/bar draw, route crossfade, model, schema or analytics data changes. Preserve existing handlers and accessibility. Report baseline drift instead of widening scope.

## Verification

- **Mechanical**: pnpm lint; pnpm typecheck; pnpm test:run; pnpm build; pnpm audit --prod; pnpm docs:check; git diff --check.
- **Feel check**: Press date chip and visible day/week arrows at 390px and 1440px. Normal press scale .97; reduced press no movement; keyboard and date selection work; targets >=44px. Inspect computed transitions and in-flight state; manual 10% playback remains a human review option. No physical-device claim.
- **Done when**: baseline failure reproduced, candidate browser regression passes, required checks pass. Record environment and any verification limits in README.
