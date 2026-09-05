# Claude Environment Inventory — ARCHIVE

**This file is an archive, not a migration target.** It records what the Claude Code harness
around this project consisted of on 2026-09-04. **The classifications and recommendations in
the historical sections below are not current instructions.** The owner approved a clean-slate
takeover on 2026-09-05; nothing here may be migrated without an explicit request.

The pre-existing local skill ports and Codex reviewer configuration were moved outside agent
discovery on 2026-09-05, into `~/.local/share/fullcourt-handoff-archive/20260905T051330Z/`.
They remain recoverable archives, not active project configuration.

**Takeover assessment (2026-09-05):**

| Classification | Important entries |
| --- | --- |
| **PROJECT ACTUALLY DEPENDS ON THIS** | No archived agent/harness configuration identified. Package dependencies, PostgreSQL, hosting and the data feeds are ordinary project infrastructure documented elsewhere. |
| **RE-ADD ONLY IF NEEDED** | Semantic navigation (Serena), independent review, browser/service access and mechanical command blocking. Propose the smallest solution only after a repeated limitation; do not copy the old setup. |
| **PROBABLY UNNECESSARY NOW** | Headroom, TokenSave, usage counters and duplicated generic guidance. |
| **CLAUDE-SPECIFIC / DO NOT MIGRATE** | Global preferences, allow-lists, Orca hooks/status line, memory format, plugin/client state and stale reviewer/skill ports. |

**No secret values appear in this document.** Environment variable *names* are recorded;
values are not, and never should be added. Where a configuration file contains credentials or
tokens, this inventory names the file and stops there. Values live in `.env.local`,
`scripts/.env`, `~/.claude.json`, the macOS keychain, and the Vercel / GitHub / Supabase secret
stores — all of them out of scope for this document and for any Codex configuration derived
from it.

**Historical classification used below (archived, not the takeover assessment)**

| Class | Meaning |
| --- | --- |
| **PROJECT-CRITICAL** | encodes real project knowledge that would be lost if discarded |
| **USEFUL-BUT-OPTIONAL** | genuinely helpful, but re-creatable or replaceable |
| **CLAUDE-SPECIFIC** | exists to make one agent behave; carries no project knowledge |
| **LIKELY-OBSOLETE** | stale, superseded, or referring to things that no longer exist |
| **UNKNOWN** | could not be established from the files available |

---

## 1. Summary

| # | Item | Location | Scope | Class |
| --- | --- | --- | --- | --- |
| 1 | Project instructions | `CLAUDE.md` (tracked) | project | **PROJECT-CRITICAL** |
| 2 | Global instructions | `~/.claude/CLAUDE.md` | global | **CLAUDE-SPECIFIC** (with 2 project-critical clauses) |
| 3 | Tracked permission deny rule | `.claude/settings.json` (tracked) | project | **PROJECT-CRITICAL** |
| 4 | Local permission allow-list | `.claude/settings.local.json` (gitignored) | project | **LIKELY-OBSOLETE** |
| 5 | Global settings | `~/.claude/settings.json` | global | **CLAUDE-SPECIFIC** |
| 6 | Reviewer subagent | `.claude/agents/fullcourt-reviewer.md` (tracked) | project | **USEFUL-BUT-OPTIONAL** |
| 7 | Codex port of the reviewer | `.codex/agents/fullcourt-reviewer.toml` (gitignored) | project | **LIKELY-OBSOLETE** |
| 8 | 3 project skills | `.agents/skills/fullcourt-{audit,migration,review}/` (gitignored) | project | **PROJECT-CRITICAL** |
| 9 | Vendored Vercel skill | `.agents/skills/react-best-practices/` (gitignored) | project | **USEFUL-BUT-OPTIONAL** |
| 10 | Agent conventions docs | `docs/agents/*.md` (gitignored) | project | **USEFUL-BUT-OPTIONAL** |
| 11 | 4 global skills | `~/.claude/skills/` | global | **CLAUDE-SPECIFIC** |
| 12 | MCP servers | `~/.claude/.claude.json` | global | **USEFUL-BUT-OPTIONAL** |
| 13 | Hooks + status line | `~/.orca/agent-hooks/claude-hook.sh` | global | **CLAUDE-SPECIFIC** |
| 14 | Plugins + marketplaces | `~/.claude/plugins/` | global/local | **CLAUDE-SPECIFIC** |
| 15 | Persistent memory (61 files) | `~/.claude/projects/…-fullcourt/memory/` | project | **PROJECT-CRITICAL** |
| 16 | Per-project client state | `~/.claude.json` → `projects` | project | **LIKELY-OBSOLETE** |
| 17 | Runtime artifacts | `.claude/{launch.json, skill-stats.json, …}` | project | **CLAUDE-SPECIFIC** |
| 18 | Slash commands | — | — | **none exist** |

**Nothing in the running product depends on any of it.** The build, tests, CI, cron jobs and
deployment run with the entire `.claude/` tree deleted. The dependency runs the other way: several
of these files are the *only* place certain project rules are written down — item 15 above all.

---

## 2. Instruction files

### 2.1 `CLAUDE.md` (project root, **tracked**, 179 lines) — PROJECT-CRITICAL

Despite the filename, this is **not** Claude-specific configuration. It is the project's rule
sheet, and it is the densest statement of the domain's hard constraints anywhere in the repo:

- the hard bans (`drizzle-kit push`/`generate`; manual SQL only; never rename rest-advantage
  identifiers; `/referees` is published; no Alembic, no `httpx`, `logging` not `print()`);
- the ratified-coefficient rule for `src/lib/fatigue.ts` and the single sanctioned exception;
- the three-step fatigue harness and the fact that skipping the middle step fails **silently**;
- the domain rules that are easy to get wrong (`publishableGames()`, ET dates, `signedNumber()`,
  `MessageCard`, no hardcoded season labels, pinned figures);
- the documentation index.

**Its content has been carried into [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) §3 and §2** so the
knowledge survives whatever happens to the file. Two parts are genuinely agent-behavior and were
**not** carried over: the Korean four-line final-report template, and the instruction to trust the
code over the file.

**Recommendation:** keep the file (it is tracked, and it costs nothing), or rename its knowledge
into whatever the new toolchain reads. Do not delete it without first confirming everything in
§3 of the handoff is preserved.

### 2.2 `~/.claude/CLAUDE.md` (global) — CLAUDE-SPECIFIC, with two exceptions

Cross-project working rules for one user: delivering-work scope discipline, `[Verified]` /
`[Inferred]` / `[Unknown]` evidence tags, define-the-success-check-first, commit-at-checkpoints,
git hygiene (`git add .` 금지 — always explicit paths; no force-push; never push to `main`),
and a secrets policy.

Almost all of it is exactly what the clean-slate principle says not to migrate — a modern model
handles it without being told. **Two clauses are project facts, not agent behavior**, and are
preserved in the handoff:

1. **Licensing.** No repo gets a `LICENSE` unless explicitly requested; `mammacare` is a
   non-solely-owned repo whose licensing is not the owner's to set. FullCourt's
   `"license": "UNLICENSED"` is deliberate, and licensing must never be raised as a gap.
2. **Secrets scope.** A local-dev default already committed to `.env.example` is *not* a secret;
   live credentials, third-party API keys, and anything touching real user data or money are.

---

## 3. Settings

### 3.1 `.claude/settings.json` — **tracked** — PROJECT-CRITICAL

The smallest and most important file in the whole harness. Its only content is a
`permissions.deny` entry blocking `drizzle-kit push` and `drizzle-kit generate`.

**This is the mechanical enforcement of a hard project rule** (`schema.ts` deliberately lags the
live DB; two tables are absent on purpose). It is the one piece of Claude configuration whose
*absence* creates real risk.

> **If any equivalent is rebuilt in a new toolchain, make it this one.** Otherwise the rule
> survives only as prose in `CLAUDE.md` and `PROJECT_HANDOFF.md` §3.

### 3.2 `.claude/settings.local.json` — gitignored — LIKELY-OBSOLETE

A long per-tool Bash allow-list accumulated over the project's life, including a broad
`Bash(git *)`. Several entries still reference the repository's **old path**
(`nba-rest-advantage`), which dates it. It encodes no project knowledge — it is a record of which
commands were approved once. **Do not port.**

### 3.3 `~/.claude/settings.json` — global — CLAUDE-SPECIFIC

Recorded structurally; contains no project knowledge.

| Key | Value |
| --- | --- |
| `includeCoAuthoredBy` | `false` — matches the 2026-07-27 history rewrite that stripped `Co-Authored-By: Claude` trailers |
| `model` | `opus[1m]` |
| `effortLevel` | `medium` |
| `autoMemoryEnabled` | `true` — drives §7 |
| `skipDangerousModePermissionPrompt` | `true` |
| `hooks` | 12 events, all delegating to one orca script — §6 |
| `statusLine` | also from orca |
| `enabledPlugins` | `mattpocock-skills`, `github` |
| `extraKnownMarketplaces` | four entries — §8 |
| `autoMode` | an environment block |

The only line worth carrying forward as a *project* fact is `includeCoAuthoredBy: false`, and only
because it explains why the git history looks the way it does.

---

## 4. Subagents

### 4.1 `.claude/agents/fullcourt-reviewer.md` — **tracked** — USEFUL-BUT-OPTIONAL

A mechanical reviewer. Tools: Read, Bash, Grep, Glob. Never edits files, never runs git. Reviews
exactly the file list it is handed. Returns **PASS / FIX / ESCALATE**. Four ordered checks:

1. **Guardrails** — no edits to `src/lib/fatigue.ts`; no renames of the locked rest-advantage
   identifiers; no `drizzle-kit push`/`generate`; no new secrets in code.
2. **The suite** — `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`, **all four, in
   that order**. The file explains why `typecheck` cannot be dropped: `next build` does not
   substitute for it, and CI runs it as its own step, so omitting it lets the reviewer return PASS
   on a change CI then fails.
3. **Numbers** — every numeric claim in a report must be re-verified by **Reading the file
   directly**; numbers sourced only from grep/stdout are rejected.
4. **Conventions** — `{ data, error }` envelope + `getPublicApiErrorMessage` on any touched route;
   season labels via `nba-season.ts`, never hardcoded.

**What is worth keeping is checks 1–3, not the agent.** The four-command gate, the guardrail list
and the re-verify-numbers rule are all in [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md). The agent
wrapper itself is Claude plumbing.

The most recent commit on the current branch (`51588c4`, pushed, unmerged, no PR) exists only to
update this file's guardrail list to current component names — see the handoff's Git section.

### 4.2 `.codex/agents/fullcourt-reviewer.toml` — gitignored — LIKELY-OBSOLETE

**A pre-existing Codex port of the same reviewer already sits in the repo**, and it is stale in
two ways that matter: its guardrail list names an older component (`RestAdvPanel`), and its suite
is **three** commands — `lint`, `test:run`, `build` — **missing `typecheck`**, which is exactly
the omission §4.1 was later amended to warn about.

> **If this file is kept, fix it before trusting it.** As written it will return PASS on a change
> that fails CI on a type error.

---

## 5. Skills

No slash commands exist at either scope (`~/.claude/commands/` is empty; the project has no
`.claude/commands/`).

### 5.1 The three project skills — `.agents/skills/fullcourt-*/SKILL.md` — PROJECT-CRITICAL

`fullcourt-audit`, `fullcourt-migration`, `fullcourt-review`.

**These are already written for Codex.** They say "Codex" throughout — e.g. *"Codex only WRITES
the `.sql` file… NEVER applies it"* and *"Escalate to senior (Codex Chat)"*. They were moved out
of `.claude/skills/` in commit `03665a7`; `.claude/skills/` is now an empty directory.

**They encode real project rules**, chiefly the manual-SQL boundary and the escalation path. Every
rule they carry is also in `CLAUDE.md` and now in [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md).

> **Important:** `/.agents/` is **gitignored**, so these three files are **absent from a fresh
> clone**. They exist only on this machine. If they matter, either track them deliberately or rely
> on the handoff, which now carries their content.

### 5.2 `.agents/skills/react-best-practices/` — USEFUL-BUT-OPTIONAL

Vercel Engineering's public React/Next.js performance skill (v1.0.0, MIT, 69 rules across 8
categories, one markdown file per rule under `rules/`). Third-party content, vendored in, freely
re-obtainable. Relevant to this stack; carries **no** FullCourt-specific knowledge.

### 5.3 Global skills — `~/.claude/skills/` — CLAUDE-SPECIFIC

`computer-use`, `orca-cli`, `orchestration`, `ui-ux-pro-max` (a local design database — 67 styles,
161 palettes, 57 font pairings, 25 charts, 21 stacks). None is project-specific. `ui-ux-pro-max`
plausibly informed some of the 2026-08 design work, but the *outcomes* of that work are recorded
in `docs/design/BRAND_GRAMMAR.md`, `docs/FRONTEND.md` and `docs/UIUX_CHECKLIST.md` — which is
where they belong.

### 5.4 `docs/agents/*.md` — gitignored — USEFUL-BUT-OPTIONAL

`domain.md`, `issue-tracker.md`, `triage-labels.md`: domain-doc conventions, the `gh`-based issue
tracker contract, and five triage labels. Written for agents, but the tracker contract and label
taxonomy are genuine project process. **Also absent from a fresh clone**, and `CLAUDE.md`
explicitly forbids linking to them from any committed file.

`domain.md` is **stale**: it refers to "ADRs 0001–0007" when there are **ten**.

---

## 6. Hooks and status line — CLAUDE-SPECIFIC

Twelve hook events are configured in `~/.claude/settings.json`, and **all twelve delegate to a
single external script**: `~/.orca/agent-hooks/claude-hook.sh`. The status line comes from the
same orca installation.

Orca is a general-purpose agent-tooling layer belonging to the user, not to this project. Nothing
in FullCourt's build, tests, CI or deployment invokes it. **Carries no project knowledge.**

`[Unknown]` — the script's internals were not inspected for this inventory. If anything
project-specific was ever encoded there, it is not recorded anywhere in the repo.

---

## 7. MCP servers — USEFUL-BUT-OPTIONAL

Configured globally in `~/.claude/.claude.json`:

| Server | Transport | Notes |
| --- | --- | --- |
| `serena` | `uvx` from `git+https://github.com/oraios/serena` | semantic code navigation |
| `headroom` | local | — |
| `tokensave` | local | — |

Each leaves a gitignored working directory in the repo (`.serena/`, `.tokensave/`).

**Per-project MCP state** (`~/.claude.json` → `projects` → fullcourt): `mcpServers: {}` — the
project adds none of its own; `hasTrustDialogAccepted: true`; `disabledMcpServers:
["claude.ai Higgsfield"]`.

**Also present in the session, from the client rather than the project:** the GitHub plugin's MCP
server, a Chrome browser-automation server, and Gmail / Google Calendar / Google Drive / Notion
connectors. None is referenced by the project.

> **A finding worth recording:** the **GitHub MCP server failed to connect** during this session —
> `plugin:github:github (400): "Error POSTing to endpoint: bad request: Authorization header is
> badly formatted"`. The `gh` CLI is authenticated independently (as `mhju0`, scopes
> `gist, read:org, repo, workflow`) and worked throughout. Every GitHub fact in the handoff was
> gathered with `gh`, not with the MCP server. **This is a connection failure, not a missing
> capability** — and it means the plugin's credential state needs attention if it is ever relied
> on again.

None of these servers is required to build, test, or deploy FullCourt. `serena` is the one whose
loss would be felt on a large codebase, and it is trivially re-installable.

---

## 8. Plugins and marketplaces — CLAUDE-SPECIFIC

**Installed** (`~/.claude/plugins/installed_plugins.json`):

| Plugin | Version | Scope |
| --- | --- | --- |
| `mattpocock-skills@claude-plugins-official` | 1.2.3 | user |
| `github@claude-plugins-official` | — | user |
| `skill-usage-counter@skill-usage-counter-marketplace` | 1.0.1 | local |

**Known marketplaces:** `claude-plugins-official`, `karpathy-skills`, `ponytail`,
`skill-usage-counter-marketplace`, `anthropic-agent-skills`.

All general-purpose. None encodes project knowledge. `mattpocock-skills` is the plausible origin
of the vendored React skill in §5.2.

---

## 9. Persistent memory — `~/.claude/projects/…-fullcourt/memory/` — PROJECT-CRITICAL

**61 files**, one fact each, with a `MEMORY.md` index loaded at the start of every session. This
is the largest concentration of **conversation-only knowledge in the entire setup** — facts that
exist nowhere in the repository, in Git, or in any committed document.

Representative of what only lives here:

- **The RA threshold float boundary** — published `RA ≥ N` counts sit ~1 game below a naive SQL
  check because `2.76 − 0.76 = 1.9999999999999998`. Site-wide, deliberately unfixed, and it does
  not break the `/analysis` ↔ `/season` invariant.
- **Inline `style` silently outranks `hover:` utility classes**, so the hover state never paints.
  Shipped twice (PRs #33, #38); a sweep script exists with a 7-of-11 false-positive rate.
- **Moving a cron's clock invalidates any date derived from "now"** — `/api/cron/update` wrote
  nothing for four days.
- **A Mozilla user-agent trips Akamai** on the ESPN/NBA endpoints.
- **Two design directions the owner declined** (a brand kit; a "GPT-taste" dark restyle) — and the
  A1 wordmark that shipped and was withdrawn the next day, with *"never re-add the hollow U"*.
- **Docs ship in the same PR as the code** — the rule, and the fact that it was violated across
  all six PRs of 2026-08-13 and again by the redesign round.
- **`gsap.from` shipped six invisible cards** on the front door.
- **Run `pnpm test:e2e` by hand when a route or header copy moves**, because `not-found.tsx` and
  `error.tsx` are reachable by no routing at all and link sweeps miss them.
- Several **SUPERSEDED** entries that are still indexed and would mislead a reader who trusted
  the index over the code — notably the currency-pass entry on `/referees`, which predates
  publication.

**Everything in that list has been carried into [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) and
[DECISIONS.md](DECISIONS.md).** The memory directory itself is a Claude storage format and should
not be ported; the *facts* were the point, and they are now in tracked documents.

> The memory files are **outside the repository** and will not travel with a clone. They also
> reflect what was true when each was written — several are explicitly marked SUPERSEDED. Treat
> the committed docs as authoritative from here.

---

## 10. Runtime artifacts — CLAUDE-SPECIFIC

`.claude/launch.json`, `.claude/scheduled_tasks.lock`, `.claude/skill-stats.json`,
`.claude/worktrees/`, `.claude/skills/` (now empty), plus `.DS_Store` files. Generated state, no
knowledge. `.gitignore` covers `/.claude/*` with tracked exceptions for `settings.json`,
`skills/` and `agents/`.

**A stale comment to be aware of:** `.gitignore` describes `.claude/skills/` as a tracked team
contract, but the skills moved to the **gitignored** `.agents/skills/` in commit `03665a7` and
`.claude/skills/` is now empty. The comment describes a state that no longer exists.

Also gitignored and Claude/agent-adjacent: `/.codex/`, `/docs/agents/`, `/docs/audit/` (the one
directory an audit pass may write to), `/design-audit/`, `.serena/`, `.tokensave/`,
`.superpowers/`, and `AGENTS.md`.

---

## 11. The clean-slate split

Applying the three-way separation this migration was built around:

**Category 1 — project facts, preserved.** Now in
[PROJECT_HANDOFF.md](PROJECT_HANDOFF.md), [DECISIONS.md](DECISIONS.md) and
[ROADMAP.md](ROADMAP.md):

- everything in project `CLAUDE.md` (§2.1);
- the three project skills' actual rules, chiefly the manual-SQL boundary (§5.1);
- the reviewer's guardrail list, the four-command gate, and the re-verify-numbers rule (§4.1);
- the whole of the 61-file memory store (§9);
- the licensing and secrets-scope clauses from the global instructions (§2.2);
- the issue-tracker contract and triage labels (§5.4).

**Category 2 — instructions Claude needed to behave well. Not migrated.** The global working
rules, the permission allow-list, the hooks, the status line, the plugins, the evidence-tag
convention, the Korean report template, the runtime artifacts.

**Category 3 — historical preferences a modern model handles unprompted. Not migrated.** Style
and scope discipline, commit-message conventions, "read before you edit", "don't refactor adjacent
code".

**The one thing that is genuinely lost by not migrating**, and the only item worth rebuilding
deliberately: **the `drizzle-kit push|generate` deny rule** (§3.1). It is the sole mechanical
guard on a rule that otherwise exists only as prose, and its violation is destructive and quiet.

**One thing to fix rather than inherit:** the stale Codex reviewer at
`.codex/agents/fullcourt-reviewer.toml` (§4.2) — it is missing `typecheck` and names a component
that no longer exists.
