# 004 — Show fatigue fills immediately

- **Status**: IMPLEMENTED · locally verified
- **Commit**: 2d458df
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: one source file and focused browser regression

## Problem

src/components/fatigue-bar.tsx:41. A static fatigue value animates width for 500ms. This is a layout property and a repeated data readout, not progress.

Current source excerpt:

```tsx
      <div
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${fillPct}%`, background: toneColor(tone) }}
      />
```

## Target

Set fill className="h-full". Preserve fillPct clamping, width, score, tone colors and aria-hidden. No transition in either preference.

Exact target code:

```tsx
<div
  className="h-full"
  style={{ width: `${fillPct}%`, background: toneColor(tone) }}
/>
```

## Repo conventions to follow

Follow docs/FRONTEND.md Motion and src/app/globals.css:734-748 shared control feedback. Repeated controls and record expansion are immediate; reduced motion keeps static feedback.

## Steps

1. Add a failing browser regression for the observable defect on baseline 2d458df.
2. Apply only the target edit at src/components/fatigue-bar.tsx:41.
3. Run focused regression in normal/reduced modes at 390/1440px and required project gates.

## Boundaries

No new dependencies, modal transitions, FINAL cues, layout, colors, labels, keyboard-navigation motion, homepage entrance/bar draw, route crossfade, model, schema or analytics data changes. Preserve existing handlers and accessibility. Report baseline drift instead of widening scope.

## Verification

- **Mechanical**: pnpm lint; pnpm typecheck; pnpm test:run; pnpm build; pnpm audit --prod; pnpm docs:check; git diff --check.
- **Feel check**: Open Games record details, inspect fatigue fills: correct percentage and color, no width transition. Existing value/unit regressions remain green. Inspect computed transitions and in-flight state; manual 10% playback remains a human review option. No physical-device claim.
- **Done when**: baseline failure reproduced, candidate browser regression passes, required checks pass. Record environment and any verification limits in README.
