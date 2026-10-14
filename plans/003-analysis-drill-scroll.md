# 003 — Respect reduced motion for Analysis drill scrolling

- **Status**: IMPLEMENTED · locally verified
- **Commit**: 2d458df
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: one source file and focused browser regression

## Problem

src/components/analysis-content.tsx:965-973. The threshold drill always requests smooth scrolling even when the reader prefers reduced motion. The destination and threshold are correct; only scroll behavior changes.

Current source excerpt:

```tsx
      setTimeout(() => {
        exploreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 60)
```

## Target

At scroll time use window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth". Preserve 60ms delay, block start, threshold and destination.

Exact target code:

```tsx
setTimeout(() => {
  exploreRef.current?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  })
}, 60)
```

## Repo conventions to follow

Follow docs/FRONTEND.md Motion and src/app/globals.css:734-748 shared control feedback. Repeated controls and record expansion are immediate; reduced motion keeps static feedback.

## Steps

1. Add a failing browser regression for the observable defect on baseline 2d458df.
2. Apply only the target edit at src/components/analysis-content.tsx:965-973.
3. Run focused regression in normal/reduced modes at 390/1440px and required project gates.

## Boundaries

No new dependencies, modal transitions, FINAL cues, layout, colors, labels, keyboard-navigation motion, homepage entrance/bar draw, route crossfade, model, schema or analytics data changes. Preserve existing handlers and accessibility. Report baseline drift instead of widening scope.

## Verification

- **Mechanical**: pnpm lint; pnpm typecheck; pnpm test:run; pnpm build; pnpm audit --prod; pnpm docs:check; git diff --check.
- **Feel check**: Click a threshold bar; confirm explorer filter matches threshold and scrollIntoView receives instant for reduced and smooth for normal. Instant must not inherit CSS smooth behavior. Inspect computed transitions and in-flight state; manual 10% playback remains a human review option. No physical-device claim.
- **Done when**: baseline failure reproduced, candidate browser regression passes, required checks pass. Record environment and any verification limits in README.
