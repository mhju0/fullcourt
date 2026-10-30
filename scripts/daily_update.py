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

3. Fill fatigue for any **scheduled** game that has none, via `scripts/project_fatigue.ts`
   (no season argument — it resolves the season whose games are ahead). Gap-only, so an
   ordinary night is one indexed query that returns nothing. It exists for the fixtures the
   league adds mid-season: only 80 of each team's 82 games are published at release, and the
   rest arrive once Cup group play resolves in December. Those rows would otherwise carry no
   rest advantage until someone ran the projection by hand. Non-fatal.

4. Run `pnpm exec tsx scripts/run-daily.ts <today ET>` to refresh fatigue for today's
   slate and regenerate open predictions. It recomputes `[today, today + 14]` against the
   schedule: a prior game counts whether or not it has been played, and a finished one brings
   its real overtime and margin. So an overtime game finalized in step 1 reaches the affected
   teams' next games, and a game still ahead is not dropped from anyone's rest count.

Requires DATABASE_URL in the environment (e.g. GitHub Actions secret) for the
in-season path; the offseason gate runs without it.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from uuid import uuid4

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

# season_window is stdlib-only by design: the offseason gate runs before DATABASE_URL is
# resolved and before any third-party import, so an offseason run needs no secret and no deps.
from season_window import is_in_season
from pipeline_summary import complete, read_freshness, save, stage_result, start_invocation

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
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("ERROR: DATABASE_URL is not set for the in-season workflow.", file=sys.stderr)
        sys.exit(1)
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
    summary = start_invocation()
    summary["pipeline_started_at"] = datetime.now(ZoneInfo("UTC")).isoformat()
    now_et = datetime.now(ZoneInfo("America/New_York"))
    today = now_et.date()
    if not is_in_season(today):
        print(f"[daily_update] Offseason ({today.isoformat()} ET) — skipping daily update.")
        for stage in summary["stages"].values():
            stage["status"] = "skipped"
        complete(summary, "skipped")
        return

    window_start = today - timedelta(days=LOOKBACK_DAYS)
    start_str, today_str = window_start.isoformat(), today.isoformat()
    summary["data_window_et"] = {"scores_from": start_str, "scores_to": today_str,
                                  "prospective_from": today_str,
                                  "prospective_to": (today + timedelta(days=14)).isoformat()}
    save(summary)
    final_code = 0
    try:
        database_url = resolve_database_url()
        with tempfile.TemporaryDirectory(prefix="fullcourt-stages-") as directory:
            env = {**os.environ, "DATABASE_URL": database_url, "DAILY_STAGE_SUMMARY_DIR": directory,
                   "DAILY_SCOREBOARD_RUN_ID": uuid4().hex}

            def run(name, args, optional=False, optional_partial=False):
                nonlocal final_code
                try:
                    result = subprocess.run(["pnpm", "exec", "tsx", *args],
                                            cwd=str(REPO_ROOT), env=env, check=False)
                    code = result.returncode
                except OSError:
                    code = 1
                status = "success" if code == 0 else "degraded" if (optional or code == 2) else "failed"
                summary["stages"][name] = stage_result(directory, name, code, status)
                if name in ("scores", "context"):
                    summary["providers"][f"espn_{name}"] = status
                save(summary)
                print(f"[daily_update] {name}: {status} (exit {code})")
                if code and not optional and not (optional_partial and code == 2):
                    final_code = 1 if code != 2 else (final_code or 2)
                return code

            scores = run("scores", ["scripts/sync_scores_espn.ts", start_str, today_str])
            if scores not in (0, 2):
                complete(summary, "failed")
                sys.exit(final_code)

            # Score sync supplied overtime; missing context remains optional, DB failure does not.
            run("context", ["scripts/fetch_game_context.ts", start_str, today_str, "--refresh"], optional_partial=True)
            run("projection", ["scripts/project_fatigue.ts"], optional=True)
            run("fatigue", ["scripts/run-daily.ts", today_str])
            fatigue = summary["stages"]["fatigue"]
            summary["stages"]["predictions"] = stage_result(directory, "predictions",
                                                            fatigue["exit_code"], fatigue["status"])
            summary["data_freshness"] = read_freshness(directory)
    except SystemExit:
        complete(summary, "failed")
        raise
    except Exception:
        # Exception text can contain connection URLs. Only the status goes into the artifact.
        complete(summary, "failed")
        raise

    status = "failed" if final_code else "degraded" if any(
        stage["status"] == "degraded" for stage in summary["stages"].values()
    ) or summary["data_freshness"]["status"] in ("unknown", "incomplete") or summary["timing_status"] == "unknown" else "success"
    complete(summary, status)
    if final_code:
        sys.exit(final_code)


if __name__ == "__main__":
    main()
