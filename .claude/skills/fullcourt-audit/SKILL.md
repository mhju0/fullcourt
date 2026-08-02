---
name: fullcourt-audit
description: Read-only diagnostic audit for FullCourt. Use when the task is diagnosis or investigation with NO code changes — error-handling audits, performance scans, coverage checks, pre-fix investigations.
---

# FullCourt read-only audit

## Rules
- [READ-ONLY]: no source/config edits, no git. The ONLY allowed write is one
  report file under docs/audit/.
- Count things on disk (routes, files, columns) — never trust docs' counts.
- Every numeric claim: Read the literal line, cite file:line.
- Tag every line [Verified file:line] / [Inferred] / [Unknown].

## Report structure — docs/audit/<topic>.md
1. Inventory (what actually exists on disk)
2. Findings per scope question, with evidence
3. Prioritized weakness list — severity + one-line rationale. NO fixes.
4. Open [Unknown]s needing human/runtime confirmation

## Definition of done
One report file + the standard Korean chat report (변경 파일 = 리포트 1개, 그 외 0).
Fixes happen in a separate session after human verification of this report.
