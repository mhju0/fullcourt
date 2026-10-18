# Sentry shipping-build source maps — 2026-10-12

## Scope and contract

Owner-requested launch item9 build setup. This candidate prepares source-map upload from
the Vercel build that ships; it does not create a token, change account settings, deploy,
or add an intentional-error endpoint. The existing public DSN, errors-only SDK settings,
PII defaults, CSP, redirects and cold-build rule remain in place.

The root inspected `JAVASCRIPT-NEXTJS-4`, one production timeout at 2026-10-07 15:40:35 UTC,
release `2757083`: first-party minified server chunks, one-character functions and no source
context. A source-map build wrapper was absent. This is missing artifact setup evidence;
it does not establish a successful upload or explain the timeout itself.

## Authentic contracts inspected

- Installed Next16.3.8 docs: Turbopack is the default; public browser maps are normally off
  and become publicly served when enabled; `runAfterProductionCompile` runs after compilation
  and before type checking/static generation.
- Installed `@sentry/nextjs`11.4.0 config/types and build-plugin implementation: native
  Turbopack Debug IDs, post-compile upload over server/static chunk directories, public map
  deletion/comment stripping, and private server map retention.
- [Sentry Next.js source maps](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/)
  and [build options](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/)
  confirm the wrapper, token, upload/delete/error-handler options. Widening covers bundled
  dependency chunks; it does not upload standalone `node_modules` sources.

The installed SDK's default additional build-time instrumentation and route manifest injection
are disabled explicitly. Existing `src/instrumentation.ts`, `src/instrumentation-client.ts`
and `src/lib/sentry-options.ts` are unchanged. The SDK still injects its version/build metadata;
its navigation/tracing warnings do not authorize adding tracing to this errors-only project.

## Exercised locally

- Node22.13.0 / pnpm11.8.0 frozen install, lint, typecheck, full Vitest suite, production build
  and production dependency audit pass; 91 test files /1,157 tests, including9 Sentry build
  contracts. `pnpm docs:check` and `git diff --check` pass. Dependency versions/lockfile unchanged.
- Installed-SDK regression tests replace only the outbound upload adapter. They exercise
  local/CI skip, missing production/preview secret, dev/runtime independence, unchanged
  headers/redirect/cache configuration, Debug IDs, upload-before-delete ordering, server map
  retention, failed upload, missing server maps and uncovered public maps. This is lifecycle
  evidence, not evidence of Sentry acceptance.
- No-token actual Turbopack build against the isolated populated PostgreSQL restore passed;
  public map count0. URL connection options enforced `default_transaction_read_only=on`,
  verified with a real database query. No production database was read or written.
- Token-path actual Turbopack build used a harmless sentinel and a temporary outbound-adapter
  stub, never a real token or network upload. Both artifact families existed before upload;
  public maps and mapping references were0 afterward, private server maps remained. The
  sentinel was absent from generated output. An actual build with the same adapter forced
  to reject exited1 at `runAfterProductionCompile`, before page generation, with
  `Sentry source-map upload failed; refusing to ship this build`. The succeeding replay
  then rebuilt the candidate fully.
- Local production start served `/`200 and `/api/health`200 (`db: up`); `/upcoming` remained
  a307 to `/games`, and a public map request returned404.

Actual generated artifacts observed at the stubbed outbound boundary (indexed map sections
were traversed for embedded source content and first-party `src/` paths):

| Family | JavaScript maps | Maps with Debug ID | Maps with source content | Maps containing first-party sources |
| --- | ---: | ---: | ---: | ---: |
| Server | 268 | 211 | 155 | 151 |
| Client | 44 | 43 | 43 | 40 |

After the hook:0 public maps,0 public `sourceMappingURL` references,268 private server maps,
0 sentinel occurrences in generated files. These counts are local build evidence, not live
Sentry artifact acceptance or coverage of externalized dependencies.

## Unverified gates

No real organization token upload, artifact-bundle acceptance, authenticated preview,
production deployment, or new-event source-context verification has occurred in this
candidate. Owner token/account approval and the separate credential-rotation handoff are
outside this code change. Item9 stays incomplete until the shipping build upload and a new
first-party bundled event are checked. Do not reinterpret the offline stub's SDK success log
as a real Sentry upload.


## Shipping verification — 2026-10-18

PR #171 shipped the token-backed upload; authenticated Vercel dashboard inspection confirmed
production commit `69b5e026456f1d90c1308cbe81d02018657c819b` Ready. The original local
"Unverified gates" section above is a historical candidate record, superseded as follows.

After the owner's specific approval, a clean isolated browser intercepted only its own Analysis
API response and supplied deliberately malformed synthetic data. Existing first-party bundled
code threw and the deployed error boundary captured it. One clearly tagged event was sent:
`d2332a304dab43edbf15ef15bcdb025a`, Sentry `JAVASCRIPT-NEXTJS-9`, release `69b5e02`.
Sentry returned original source `src/lib/analysis-claims.ts:216:42`, the statement reading
`data.venueBaseline.homeWinPct`, and surrounding source context. Both bundled Debug IDs were
present. The probe changed neither the public application nor database state.

The deliberate test issue was resolved after checking the event. This closes new-event client
symbolication for that build. A first-party **server** event has not been induced or observed;
server artifact upload/build coverage is separate evidence and does not close that runtime gate.
The unrelated October 7 timeout remains open and was not marked fixed by this test.
