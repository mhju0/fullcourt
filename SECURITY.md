# Security Policy

FullCourt is a read-only analytics site: it serves public NBA statistics, stores no
user accounts, and collects no personal data beyond Vercel's cookieless page-view
analytics (`@vercel/analytics`, mounted in `src/app/layout.tsx` and whitelisted in the CSP). The only privileged surface is the
authenticated cron endpoint that refreshes scores.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via
[GitHub Security Advisories](https://github.com/mhju0/fullcourt/security/advisories/new)
rather than opening a public issue. Reports are read by the maintainer; you can expect an
initial response within a week.

Please include the affected route or file, reproduction steps, and the impact you believe
it has.

## Scope

- Production site: `fullcourt-nba.vercel.app`
- This repository (application code, data pipeline scripts, CI workflows)

Out of scope: denial-of-service volume testing against the live site, and findings that
require a compromised Vercel/Supabase/GitHub account.
