# Shooting Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Team, Position and Hide-noisy-rows filters to the /shooting table, per `docs/superpowers/specs/2026-07-30-shooting-filters-design.md`.

**Architecture:** All filtering stays in the pure lib (`src/lib/player-rest.ts`) so it is unit-testable without a browser; the export script gains one parallel `pos` array; the component only adds three controls and passes options through. Franchise folding (SEA→OKC etc.) lives beside the filter that uses it.

**Tech Stack:** Next.js 16 / React client component, Vitest, Playwright, Python export script against the cached hoopR CSVs + Postgres.

## Global Constraints

- Tests must be proven to fail on unfixed code before the implementation lands (standing repo rule).
- Never `git add .` — always explicit file paths; commit messages in professional English.
- Match existing style: the lib uses doc comments explaining *why*; the component uses the `term*` style constants.
- The interface stays small: export from the lib only `franchiseOptions`, its `FranchiseOption` type, and the extended `BuildOptions` fields. Folding helpers stay module-private and are tested through `buildRows`/`franchiseOptions`.
- Run commands from the repo root `/Users/michaelju/Workspace/Projects/fullcourt`. Python runs need env: `set -a; . ./.env.local; set +a; ml/.venv/bin/python …`.

---

### Task 1: Filter logic in the lib

**Files:**
- Modify: `src/lib/player-rest.ts`
- Test: `src/lib/__tests__/player-rest.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 3 relies on these exact names):
  - `PlayerRestPayload.pos?: string[]` — `"G" | "F" | "C" | ""` per player, parallel to `names`; absent in pre-filter payloads.
  - `PlayerRestIndex.pos: string[]` — `payload.pos ?? []`.
  - `BuildOptions` gains `team?: string | null` (current-era franchise tricode), `pos?: "G" | "F" | "C" | null`, `evidencedOnly?: boolean`.
  - `export interface FranchiseOption { value: string; label: string }`
  - `export function franchiseOptions(teams: readonly string[]): FranchiseOption[]` — one option per franchise, sorted by tricode, labeled `"OKC · SEA"` where history folded in.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/player-rest.test.ts` (the `PAYLOAD` fixture deliberately stays without `pos` — it doubles as the old-cached-JSON case). Add `franchiseOptions` to the import list from `../player-rest`; also add `import { readFileSync } from "node:fs"` and `import { join } from "node:path"` at the top.

```ts
describe("franchiseOptions", () => {
  it("builds one option per franchise, folding history into its label", () => {
    const opts = franchiseOptions(["DEN", "SEA", "OKC", "MIA/BOS"]);
    expect(opts.map((o) => o.value)).toEqual(["BOS", "DEN", "MIA", "OKC"]);
    expect(opts.find((o) => o.value === "OKC")!.label).toBe("OKC · SEA");
    expect(opts.find((o) => o.value === "DEN")!.label).toBe("DEN");
  });

  // The drift check from the spec: a future relocation adds a tricode the folding
  // table does not claim, which must break this test rather than silently grow the
  // dropdown past 30 franchises.
  it("claims every tricode in the shipped payload for exactly 30 franchises", () => {
    const payload = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "player-rest.json"), "utf8")
    ) as PlayerRestPayload;
    const opts = franchiseOptions(payload.teams);
    expect(opts.map((o) => o.value)).toEqual([
      "ATL", "BKN", "BOS", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
      "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
      "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
    ]);
  });
});

describe("buildRows — team filter", () => {
  const index = indexPayload(PAYLOAD);
  const base = { year: 2025 as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("keeps only that franchise's players in a season view", () => {
    expect(buildRows(index, { ...base, team: "POR" }).map((r) => r.name)).toEqual(["Al-Farouq Aminu"]);
  });

  it("matches a traded player under either of his season's teams", () => {
    expect(buildRows(index, { ...base, team: "BOS" }).map((r) => r.name)).toEqual(["Fringe Player"]);
    expect(buildRows(index, { ...base, team: "MIA" }).map((r) => r.name)).toEqual(["Fringe Player"]);
  });

  it("career view matches a player who ever played for the franchise", () => {
    expect(buildRows(index, { ...base, year: "career", team: "DEN" }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
    expect(buildRows(index, { ...base, year: "career", team: "POR" }).map((r) => r.name)).toEqual(["Al-Farouq Aminu"]);
  });

  it("folds a historical tricode into its franchise", () => {
    const idx = indexPayload({ ...PAYLOAD, teams: ["SEA", "POR", "MIA/BOS"] });
    expect(buildRows(idx, { ...base, team: "OKC" }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
  });
});

describe("buildRows — position filter", () => {
  const index = indexPayload({ ...PAYLOAD, pos: ["C", "F", ""] });
  const base = { year: 2025 as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("keeps only players known to play the position", () => {
    expect(buildRows(index, { ...base, pos: "C" }).map((r) => r.name)).toEqual(["Nikola Jokić"]);
  });

  it("shows a player with no known position only under all positions", () => {
    for (const pos of ["G", "F", "C"] as const) {
      expect(buildRows(index, { ...base, pos }).map((r) => r.name)).not.toContain("Fringe Player");
    }
    expect(buildRows(index, base).map((r) => r.name)).toContain("Fringe Player");
  });

  it("matches nothing when the payload predates the pos array", () => {
    // Old CDN-cached JSON + new code: honest empty, not a crash and not silently wrong.
    expect(buildRows(indexPayload(PAYLOAD), { ...base, pos: "G" })).toEqual([]);
  });
});

describe("buildRows — evidencedOnly", () => {
  const index = indexPayload(PAYLOAD);
  const base = { year: 2025 as const, minFga: 0, query: "", sort: "fga" as const, dir: -1 as const };

  it("drops exactly the rows rendered dim", () => {
    // Jokić 2025: effect −2.8 vs SE ≈ 4.39 → dim. Fringe: no effect → dim. Aminu: +10 vs 6.45 → kept.
    expect(buildRows(index, { ...base, evidencedOnly: true }).map((r) => r.name)).toEqual(["Al-Farouq Aminu"]);
    expect(buildRows(index, base)).toHaveLength(3);
  });

  it("applies in career view too", () => {
    // Aminu's delta (1.0) is inside his SE (2.2) here, so the filter must drop him;
    // with the main fixture both career players are well-evidenced and a broken
    // filter would pass unnoticed.
    const idx = indexPayload({ ...PAYLOAD, shrunk: [[0, -1.71, 1.5, -1.06], [1, 1.0, 2.2, 0.9]] });
    expect(
      buildRows(idx, { ...base, year: "career", evidencedOnly: true }).map((r) => r.name)
    ).toEqual(["Nikola Jokić"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/lib/__tests__/player-rest.test.ts`
Expected: FAIL — `franchiseOptions` is not exported, and the team/pos/evidencedOnly options are ignored (rows come back unfiltered).

- [ ] **Step 3: Implement in `src/lib/player-rest.ts`**

Add to `PlayerRestPayload` (after `shrunk`):

```ts
  /** "G" | "F" | "C" | "" per player, parallel to `names`. Absent in payloads exported before the filters. */
  pos?: string[]
```

Add to `PlayerRestIndex` (after `teams`): `pos: string[]`, and in `indexPayload`'s return object add `pos: payload.pos ?? [],`.

Add the franchise block (above `BuildOptions`):

```ts
/**
 * Historical tricode → the franchise it became, the way Basketball-Reference and the
 * NBA's own franchise histories fold them. The team filter offers franchises, so a
 * visitor picking OKC finds the Seattle years instead of losing them to a defunct code.
 */
const CURRENT_BY_HISTORICAL: Record<string, string> = {
  SEA: "OKC", VAN: "MEM", NJN: "BKN", NOH: "NOP", NOK: "NOP", CHH: "CHA",
}

const franchiseOf = (tricode: string): string => CURRENT_BY_HISTORICAL[tricode] ?? tricode

/** Tricodes in a season team label: "LAL/CLE+" → ["LAL", "CLE"]. The "+" marks a third
    team the label does not carry — 0.7% of player-seasons, accepted in the spec. */
const labelTricodes = (label: string): string[] => label.replace(/\+$/, "").split("/")

const matchesFranchise = (label: string, franchise: string): boolean =>
  labelTricodes(label).some((t) => franchiseOf(t) === franchise)

export interface FranchiseOption {
  value: string
  label: string
}

/** One dropdown option per franchise found in the payload's team labels, sorted by
    tricode, labeled "OKC · SEA" where a defunct code was folded in. */
export function franchiseOptions(teams: readonly string[]): FranchiseOption[] {
  const folded = new Map<string, Set<string>>()
  for (const teamLabel of teams) {
    for (const t of labelTricodes(teamLabel)) {
      const f = franchiseOf(t)
      const hist = folded.get(f) ?? new Set<string>()
      if (t !== f) hist.add(t)
      folded.set(f, hist)
    }
  }
  return [...folded.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, hist]) => ({
      value,
      label: hist.size ? `${value} · ${[...hist].sort().join("/")}` : value,
    }))
}
```

Extend `BuildOptions`:

```ts
  /** Current-era franchise tricode ("OKC" covers the Seattle years); null/absent = all teams. */
  team?: string | null
  /** Modal position. Players without one (never started) match only when this is null/absent. */
  pos?: "G" | "F" | "C" | null
  /** Keep only rows whose effect clears its own standard error — the rows rendered dim. */
  evidencedOnly?: boolean
```

In `buildRows`, career branch — after the `if (!est) continue` line:

```ts
      if (opts.team && !seasons.some((s) => matchesFranchise(index.teams[s[S.TEAM]], opts.team!))) continue
```

Season branch — replace `if (r) rows.push(seasonRow(index, r))` with:

```ts
      if (!r) continue
      if (opts.team && !matchesFranchise(index.teams[r[S.TEAM]], opts.team)) continue
      rows.push(seasonRow(index, r))
```

In the `filtered` predicate — after the `minFga` check, before the query check:

```ts
    if (opts.pos && index.pos[r.player] !== opts.pos) return false
    if (opts.evidencedOnly && r.underEvidenced) return false
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/lib/__tests__/player-rest.test.ts`
Expected: PASS, including every pre-existing test (the new options are optional, so old call sites are untouched).

- [ ] **Step 5: Commit**

```bash
git add src/lib/player-rest.ts src/lib/__tests__/player-rest.test.ts
git commit -m "feat(shooting): filter rows by franchise, position and evidence in the lib"
```

---

### Task 2: Export each player's modal position

**Files:**
- Modify: `scripts/analyze_player_shooting.py` (one field in `load_player_games`)
- Modify: `scripts/export_player_rest.py`
- Modify (regenerated): `public/data/player-rest.json`

**Interfaces:**
- Consumes: the `position` column of `ml/data/shooting/player_boxscores_*.csv` — filled **only for starters**, values `G`/`F`/`C`.
- Produces: `"pos"` in the payload — one of `"G" | "F" | "C" | ""` per player, parallel to `names` (the exact shape Task 1 typed as `PlayerRestPayload.pos`).

- [ ] **Step 1: Carry position through the shared loader**

In `scripts/analyze_player_shooting.py`, `load_player_games`, add one line to the row dict (after `"team"`):

```python
                    "pos": r["position"],
```

This is additive: rows are dicts, so the analysis script is unaffected.

- [ ] **Step 2: Build the array in `scripts/export_player_rest.py`**

In `main()`, after the `seasons.sort(...)` line (by then `nix` maps every exported pid to its index):

```python
    # ── modal position, from started games only ────────────────────────────────
    # The box-score position column is filled only for the five starters, so this is
    # "what he plays when he starts". 86% of players ever started; the rest export ""
    # and appear only under the page's "All positions". Ties break toward the position
    # he started most recently, via the lexicographic order of NBA game ids.
    pos_count: dict[str, Counter] = defaultdict(Counter)
    pos_last: dict[tuple[str, str], str] = {}
    for r in rows:
        if r.get("pos"):
            pos_count[r["pid"]][r["pos"]] += 1
            key = (r["pid"], r["pos"])
            pos_last[key] = max(pos_last.get(key, ""), r["gid"])
    pos = [""] * len(names)
    for pid, i in nix.items():
        c = pos_count.get(pid)
        if c:
            pos[i] = max(c, key=lambda p: (c[p], pos_last[(pid, p)]))
    assert len(pos) == len(names)
```

Add `Counter` to the existing `from collections import defaultdict` import (`from collections import Counter, defaultdict`). Add `"pos": pos,` to the payload dict after `"teams": teams,`. Add a coverage line to the prints (a re-export that loses the column fails loudly here):

```python
    have = sum(1 for p in pos if p)
    print(f"positions for {have:,}/{len(pos):,} players ({have / len(pos):.1%}; blank = never started)")
```

- [ ] **Step 3: Re-export and verify**

Run: `set -a; . ./.env.local; set +a; ml/.venv/bin/python scripts/export_player_rest.py`
Expected: same player/season counts as the 2026-07-30 export (2,837 players · 14,493 player-seasons · 30 seasons, 2019-20 present), plus a coverage line near 86%.

Spot-check known players:

```bash
python3 - <<'EOF'
import json
p = json.load(open("public/data/player-rest.json"))
byname = dict(zip(p["names"], p["pos"]))
print({n: byname[n] for n in ["Nikola Jokić", "Stephen Curry", "LeBron James"]})
EOF
```

Expected: `{'Nikola Jokić': 'C', 'Stephen Curry': 'G', 'LeBron James': 'F'}`.

- [ ] **Step 4: Run the unit suite**

Run: `pnpm test:run src/lib/__tests__/player-rest.test.ts`
Expected: PASS — the drift check now runs against the regenerated payload and still finds exactly 30 franchises.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze_player_shooting.py scripts/export_player_rest.py public/data/player-rest.json
git commit -m "feat(shooting): export each player's modal position for the position filter"
```

---

### Task 3: The three controls in the component

**Files:**
- Modify: `src/components/player-rest-content.tsx`

**Interfaces:**
- Consumes from Task 1: `franchiseOptions(index.teams)`, `BuildOptions.team/pos/evidencedOnly`.
- Produces: `#pr-team` and `#pr-pos` selects and a "Hide noisy rows" checkbox (Task 4's e2e selects on `#pr-team`).

- [ ] **Step 1: Wire state and options**

Add `franchiseOptions` and `type BuildOptions` to the existing import from `@/lib/player-rest`. Below the `minFga` state:

```tsx
  const [team, setTeam] = useState("")          // "" = all teams
  const [pos, setPos] = useState("")            // "" = all positions
  const [evidencedOnly, setEvidencedOnly] = useState(false)
```

Below the `index` memo:

```tsx
  const teamOptions = useMemo(() => (index ? franchiseOptions(index.teams) : []), [index])
```

Extend the `rows` memo — options object gains `team: team || null, pos: (pos || null) as BuildOptions["pos"], evidencedOnly`, and the dependency array gains `team, pos, evidencedOnly`.

- [ ] **Step 2: Render the controls**

After the Volume `</select>` and before the search input, in the same styles as the existing selects:

```tsx
        <label className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--term-text-muted)]" htmlFor="pr-team">
          Team
        </label>
        <select
          id="pr-team"
          className={termSelectClass}
          style={termSelectStyle}
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        >
          <option value="">All teams</option>
          {teamOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--term-text-muted)]" htmlFor="pr-pos">
          Position
        </label>
        <select
          id="pr-pos"
          className={termSelectClass}
          style={termSelectStyle}
          value={pos}
          onChange={(e) => setPos(e.target.value)}
        >
          <option value="">All positions</option>
          <option value="G">Guards</option>
          <option value="F">Forwards</option>
          <option value="C">Centers</option>
        </select>
```

After the search input, before the row-count span:

```tsx
        <label className="mono flex cursor-pointer items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--term-text-muted)]">
          <input
            type="checkbox"
            checked={evidencedOnly}
            onChange={(e) => setEvidencedOnly(e.target.checked)}
            style={{ accentColor: "var(--term-blue)" }}
          />
          Hide noisy rows
        </label>
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/player-rest-content.tsx
git commit -m "feat(shooting): add team, position and hide-noisy-rows controls"
```

---

### Task 4: e2e coverage and full verification

**Files:**
- Modify: `e2e/shooting.spec.ts`

**Interfaces:**
- Consumes: `#pr-team` from Task 3; the season-view team cell is the 3rd `td` of a `player-row`.

- [ ] **Step 1: Add the team-filter test**

Append inside the existing `test.describe("Shooting by Rest", ...)`:

```ts
  test("the team filter narrows the table to one franchise's players", async ({ page }) => {
    await page.goto("/shooting");
    await page.getByTestId("player-row").first().waitFor(READY);

    const all = await page.getByTestId("player-row").count();
    await page.selectOption("#pr-team", "OKC");
    const okc = await page.getByTestId("player-row").count();
    expect(okc).toBeGreaterThan(0);
    expect(okc).toBeLessThan(all);
    // Every visible team cell belongs to the franchise — Seattle years included.
    for (const cell of await page.getByTestId("player-row").locator("td:nth-child(3)").allTextContents()) {
      expect(cell).toMatch(/OKC|SEA/);
    }
  });
```

- [ ] **Step 2: Run the shooting e2e spec**

Run: `pnpm test:e2e e2e/shooting.spec.ts`
Expected: all tests PASS, including the new one.

- [ ] **Step 3: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all PASS, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add e2e/shooting.spec.ts
git commit -m "test(e2e): cover the team filter on /shooting"
```
