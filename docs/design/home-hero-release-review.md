# Homepage simplification and dependency verification

September 9, 2026. The owner approved removal of the homepage matchup example, then authorized
remediation of the dependency audit findings and a PR. Production release awaits PR review.

| Before | After | Why |
| --- | --- | --- |
| A two-column hero with a single-game result and limitation text | Headline, original description and Find a game action | Keep the introduction focused and preserve whitespace |
| 18px description | 24px desktop / 20px mobile, capped at 48ch | Give the existing sentence more presence |
| Homepage loads a season report and one game only for the example | Those reads and the unused presentation/type are removed | Avoid fetching content that is no longer displayed |
| Next.js 16.2.12 and eslint-config-next 16.2.10 | Both pinned to 16.3.4 | Apply the security updates with aligned framework tooling |
| Sharp 0.35.3 with an older override | Sharp 0.35.4 through Next's own dependency requirement | Use the patched image libraries without an obsolete override |

The exact description remains: “Understand the schedule behind an NBA game. Compare rest and
travel, then check what happened.” The existing hero entrance, primary action, and aggregate
findings remain. No React version change or application migration was required.

## Dependency evidence

- [Next.js image optimization advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4)
- [Next.js Windows-hosting advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36)
- [Sharp / libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
- [Next.js 16.3.4 release](https://github.com/vercel/next.js/releases/tag/v16.3.4), which restores AVIF optimization with the patched dependency.

Next's installed Sharp reports version 0.35.4 and libheif 1.23.2. A trusted generated AVIF image
successfully encodes and decodes. The production Next image endpoint resizes the application's
192px icon to a verified 64px WebP. These checks validate normal operation, not exploit testing.

## Verification

- pnpm 11.8.0 frozen-lockfile installation passes; production audit reports no known vulnerabilities.
- Lint, TypeScript, 972 unit tests, 33 ML contracts, two script contracts, documentation links and
  the production build pass.
- The installed WASM-tooling peer warnings for @emnapi/core and @emnapi/runtime were already present
  in the prior lockfile. They are unchanged; native image loading and the exercised build/test paths pass.
- All 65 production-build browser checks pass across the homepage, navigation, season controls,
  Games, Shooting, Playoff Rest and Officiating, including desktop/mobile accessibility checks.
  Hosted-preview results are recorded in the PR description after completion.

The package update stays within Next.js 16. Existing account, data, coefficient, and schema behavior
is unchanged. The PR remains unmerged until reviewed.
