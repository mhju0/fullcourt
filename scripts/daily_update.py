#!/usr/bin/env python3
"""
Daily NBA pipeline for GitHub Actions (and local runs):

0. **Season gate** (see ``season_window.is_in_season``): if today (ET) is in the NBA
   offseason, log and ``sys.exit(0)`` immediately — before importing DB-coupled
   modules, resolving DATABASE_URL, or hitting any NBA API. The offseason path needs
   no secret. A genuine in-season failure still exits non-zero so the job fails loudly.

1. Sync **scores, status and overtime** for **[today − LOOKBACK_DAYS, today]** from ESPN via
   `scripts/sync_scores_espn.ts`, matched on (date, away, home).

   This step used to read `cdn.nba.com` and `stats.nba.com`. Both are blocked from GitHub's
   runners — a datacenter block, not a geo one, re-probed 2026-08-18 (see
   `.github/workflows/probe-data-sources.yml`) — and the CDN call was the FIRST network call
   of the run, so it raised `HTTPError: 403` before a single score was updated, before
   overtime was read, and before any fatigue was recomputed. **Every in-season run from at
   least 2026-05-11 to the end of the season failed there.** The green runs either side of
   that are offseason no-ops from the season gate above.

   Matching on the pairing rather than on `external_id` is deliberate: 2026-27 rows are keyed
   `espn-<eventId>`, `external_id` is the table's only uniqueness guard, and an id-keyed
   writer fed from a different source would insert duplicates instead of updating.

   It does not seed new fixtures — it reports ESPN events with no stored row and leaves
   seeding to `scripts/seed_upcoming_season_espn.ts`, which has its own invariants.

2. Refresh **game context** (overtime periods, tip-off time, neutral-site flag) for
   **[today − LOOKBACK_DAYS, today]** via `scripts/fetch_game_context.ts`. This replaced a
   stats.nba.com BoxScoreSummary loop that could never have worked from here: stats.nba.com
   times out from this network and from CI, so `overtime_periods` sat at 0 for all 49,353
   games and the fatigue model's overtime term never fired once. ESPN is reachable.

   Step 1 already wrote `overtime_periods` from the same scoreboard, so this step is a
   belt-and-braces refresh for OT plus the sole writer of tip-off and neutral-site. That
   ordering is why step 1 has to run first: this script only reads games already marked
   `final`.

3. Run `pnpm exec tsx scripts/run-daily.ts <today ET>` to refresh fatigue for today's
   slate and regenerate open predictions. It recomputes `[today, today + 14]`, so an
   overtime game finalized in step 1 feeds the overtime penalty into the fatigue of the
   affected teams' next games before they are played.

Requires DATABASE_URL in the environment (e.g. GitHub Actions secret) for the
in-season path; the offseason gate runs without it.
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

# season_window is stdlib-only by design: the offseason gate runs before DATABASE_URL is
# resolved and before any third-party import, so an offseason run needs no secret and no deps.
from season_window import is_in_season

REPO_ROOT = Path(__file__).resolve().parent.parent

# How many ET calendar days back the nightly score sync re-checks. Wider than one day so a
# night that failed, or a game finalized late, is repaired by the next run rather than lost.
LOOKBACK_DAYS = 7


def resolve_database_url() -> str:
    """
    Prefer DATABASE_URL from the process environment (GitHub Actions, shell export).
    If unset or blank, load repo-root .env.local then scripts/.env and read again.
    """
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    from dotenv import load_dotenv  # lazy: only the local .env fallback needs it

    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        print(
            "ERROR: DATABASE_URL is not set. "
            "Set it in the environment (e.g. GitHub Actions secret DATABASE_URL) "
            "or add it to .env.local or scripts/.env for local development.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def main() -> None:
    et = ZoneInfo("America/New_York")
    now_et = datetime.now(et)
    today = now_et.date()

    # ── Season gate ──────────────────────────────────────────────────────────
    # Skip cleanly during the offseason BEFORE resolving DATABASE_URL, importing
    # DB-coupled modules, or hitting any NBA API. An offseason skip is a success
    # (exit 0); genuine in-season failures below still exit non-zero.
    if not is_in_season(today):
        print(f"[daily_update] Offseason ({today.isoformat()} ET) — skipping daily update.")
        sys.exit(0)

    database_url = resolve_database_url()

    window_start = today - timedelta(days=LOOKBACK_DAYS)
    start_str = window_start.isoformat()
    today_str = today.isoformat()

    print(
        f"[daily_update] ET now={now_et.isoformat(timespec='seconds')} "
        f"window={start_str}..{today_str}"
    )

    # Scores, status and overtime from ESPN. Fatal on failure: this is the step the run
    # exists for, and a silent skip would leave the site showing an unplayed slate.
    print(f"[daily_update] syncing scores for {start_str}..{today_str} …")
    scores = subprocess.run(
        ["pnpm", "exec", "tsx", "scripts/sync_scores_espn.ts", start_str, today_str],
        cwd=str(REPO_ROOT),
        env={**os.environ, "DATABASE_URL": database_url},
        check=False,
    )
    if scores.returncode != 0:
        print("[daily_update] ERROR: score sync failed.", file=sys.stderr)
        sys.exit(scores.returncode)

    # Game context (overtime periods, tip-off, neutral site) for the lookback window.
    # Must follow the score sync — it only reads games already marked 'final' — and must
    # precede run-daily.ts, which reads overtime_periods when scoring fatigue.
    # --refresh because a scoreboard cached mid-game carries no final line score.
    print(f"[daily_update] refreshing game context for the {LOOKBACK_DAYS}d lookback …")
    ctx = subprocess.run(
        [
            "pnpm", "exec", "tsx", "scripts/fetch_game_context.ts",
            (today - timedelta(days=LOOKBACK_DAYS)).isoformat(),
            today_str,
            "--refresh",
        ],
        cwd=str(REPO_ROOT),
        env={**os.environ, "DATABASE_URL": database_url},
        check=False,
    )
    if ctx.returncode != 0:
        # Non-fatal, and cheaper to lose than it used to be: step 1 already wrote
        # overtime_periods from the same scoreboard, so a failure here costs tip-off times
        # and the neutral-site flag for these few games, not the fatigue model's OT term.
        print("[daily_update] WARNING: game context refresh failed; continuing.")

    print(f"[daily_update] running Node pipeline for {today_str} …")
    result = subprocess.run(
        ["pnpm", "exec", "tsx", "scripts/run-daily.ts", today_str],
        cwd=str(REPO_ROOT),
        env={**os.environ, "DATABASE_URL": database_url},
        check=False,
    )
    if result.returncode != 0:
        sys.exit(result.returncode)

    print("[daily_update] completed successfully.")


if __name__ == "__main__":
    main()
