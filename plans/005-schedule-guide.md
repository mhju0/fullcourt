# 005 — Stop guide rotation transitions with reduced motion

- **Status**: IMPLEMENTED · locally verified
- **Commit**: 2d458df
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: one source file and focused browser regression

## Problem

src/components/schedule-disparity-content.tsx:135. The native guide disclosure rotates its chevron over 200ms in reduced motion. Open/closed orientation remains useful, but interpolation should stop.

Current source excerpt:

```tsx
        <ChevronDown
          className="size-4 text-[var(--term-text-muted)] transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
```

## Target

Append motion-reduce:transition-none. Normal transform transition stays 200ms; reduced mode rotates instantly to 180deg. Native details state unchanged.

Exact target code:

```tsx
<ChevronDown
  className="size-4 text-[var(--term-text-muted)] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
  aria-hidden
/>
```

## Repo conventions to follow

Follow docs/FRONTEND.md Motion and src/app/globals.css:734-748 shared control feedback. Repeated controls and record expansion are immediate; reduced motion keeps static feedback.

## Steps

1. Add a failing browser regression for the observable defect on baseline 2d458df.
2. Apply only the target edit at src/components/schedule-disparity-content.tsx:135.
3. Run focused regression in normal/reduced modes at 390/1440px and required project gates.

## Boundaries

No new dependencies, modal transitions, FINAL cues, layout, colors, labels, keyboard-navigation motion, homepage entrance/bar draw, route crossfade, model, schema or analytics data changes. Preserve existing handlers and accessibility. Report baseline drift instead of widening scope.

## Verification

- **Mechanical**: pnpm lint; pnpm typecheck; pnpm test:run; pnpm build; pnpm audit --prod; pnpm docs:check; git diff --check.
- **Feel check**: Open full breakdown, toggle WHAT THESE COLUMNS MEAN via Enter and mouse. Normal 200ms, reduced transition none, open/close state and content retained. Inspect computed transitions and in-flight state; manual 10% playback remains a human review option. No physical-device claim.
- **Done when**: baseline failure reproduced, candidate browser regression passes, required checks pass. Record environment and any verification limits in README.
