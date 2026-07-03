---
name: fullcourt-review
description: Post-change self-review loop for FullCourt. Use after completing ANY code change, before writing the final report. Delegates mechanical verification to the fullcourt-reviewer subagent, applies auto-fixable issues, and produces an explicit escalation list for senior (Claude Chat) review.
---

# FullCourt self-review loop

## When
After any implementation work, before the final report.
NOT for read-only diagnostics — use fullcourt-audit for those.

## Loop (max 2 iterations, then stop)
1. Collect the list of changed files.
2. Delegate to the `fullcourt-reviewer` subagent.
3. Verdict FIX -> apply the listed mechanical fixes, re-run the reviewer ONCE.
4. Still failing after round 2 -> STOP. Report the failure and escalate.
   Never loop indefinitely. Never weaken a check to make it pass.

## Definition of done
- Reviewer verdict PASS
- `pnpm lint`, `pnpm test:run`, `pnpm build` all green
- Final report includes an "Escalate to senior" section (may be "none")

## Escalate to senior (Claude Chat) — NEVER decide these alone
- Any schema/migration design choice
- Anything touching fatigue.ts semantics or the locked rest-advantage identifiers
- Model/metric naming or framing (honesty calls: calibration vs accuracy, etc.)
- Verification numbers that contradict docs or expectations
- Scope changes, new phases, new dependencies
- Production env, deploys, secrets
