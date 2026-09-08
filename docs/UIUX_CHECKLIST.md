# UI/UX verification

Use this checklist for changed surfaces. The [design record](design/fullcourt-decision-record.md)
is the approved direction; [Frontend](FRONTEND.md) documents implementation.

## Automated and visual review

- Confirm the page's question, baseline, denominator, units, and limitations are visible.
- Exercise loading, error/retry, empty filters, unavailable data, and true-zero states.
- Inspect mobile essentials without horizontal page overflow; detail tables may scroll.
- Navigate controls and disclosures by keyboard; verify focus and native link/button behavior.
- Test reduced motion, rapid input, share/reload, and Back/Forward.
- Run relevant Playwright and axe checks; review actual screenshots at phone and desktop sizes.
- Regenerate affected documentation captures after visible changes.

## Still requires human/device verification

Mobile Safari input zoom, touch scrolling and edge affordances, fixed navigation, and homepage
motion need physical-device review. Screen-reader navigation and spoken context need human
review. Automated accessibility passes do not establish either result.

## Maintenance

Record an actual issue in the tracker with route, viewport, expected behavior, and reproduction.
Do not append a permanent checklist of already-fixed defects here. Release-specific evidence
belongs in a dated release record; long-term decisions belong in DECISIONS.md or an ADR.
