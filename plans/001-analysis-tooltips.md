# 001 — Disable repeated Analysis tooltip movement

- **Status**: IMPLEMENTED · locally verified
- **Commit**: 2d458df
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: one source file and focused browser regression

## Problem

src/components/analysis-content.tsx:501,1119. Both Analysis Tooltip components inherit Recharts 3.8.1 auto animation: Tooltip.js sets animationDuration=400 and TooltipBoundingBox.js writes a transform transition. High frequency pointer/keyboard inspection therefore moves the readout for 400ms in normal mode.

Current source excerpt:

```tsx
            <Tooltip
              cursor={{ fill: "rgba(23,64,139,0.06)" }}
              content={(props: TooltipContentProps) => <SeasonWinRateTooltip {...props} />}
            />

              <Tooltip
                cursor={{ fill: "rgba(23,64,139,0.06)" }}
                content={winRateTooltipRenderer}
              />
```

## Target

Add isAnimationActive={false} to both Tooltip components. No transform transition in normal or reduced mode.

Exact target code:

```tsx
<Tooltip
  isAnimationActive={false}
  cursor={{ fill: "rgba(23,64,139,0.06)" }}
  content={(props: TooltipContentProps) => <SeasonWinRateTooltip {...props} />}
/>
<Tooltip
  isAnimationActive={false}
  cursor={{ fill: "rgba(23,64,139,0.06)" }}
  content={winRateTooltipRenderer}
/>
```

## Repo conventions to follow

Follow docs/FRONTEND.md Motion and src/app/globals.css:734-748 shared control feedback. Repeated controls and record expansion are immediate; reduced motion keeps static feedback.

## Steps

1. Add a failing browser regression for the observable defect on baseline 2d458df.
2. Apply only the target edit at src/components/analysis-content.tsx:501,1119.
3. Run focused regression in normal/reduced modes at 390/1440px and required project gates.

## Boundaries

No new dependencies, modal transitions, FINAL cues, layout, colors, labels, keyboard-navigation motion, homepage entrance/bar draw, route crossfade, model, schema or analytics data changes. Preserve existing handlers and accessibility. Report baseline drift instead of widening scope.

## Verification

- **Mechanical**: pnpm lint; pnpm typecheck; pnpm test:run; pnpm build; pnpm audit --prod; pnpm docs:check; git diff --check.
- **Feel check**: Hover multiple bars and use chart ArrowRight keyboard navigation. Both tooltips must show current content instantly; preserve cursor and renderer. Inspect computed transitions and in-flight state; manual 10% playback remains a human review option. No physical-device claim.
- **Done when**: baseline failure reproduced, candidate browser regression passes, required checks pass. Record environment and any verification limits in README.
