"""Recompute every series feature read-only and require parity with the persisted model inputs."""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
from decimal import Decimal
from pathlib import Path

import psycopg2

import compute_prior_grind as grind
import compute_series_features as features

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-file", required=True)
    args = parser.parse_args()
    conn = psycopg2.connect(features.resolve_database_url())
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT external_series_key, seed_diff, win_pct_diff, entry_rest_diff, h2h_diff, prior_grind_diff FROM playoff_series ORDER BY external_series_key")
            stored = {row[0]: row[1:] for row in cursor.fetchall()}
        teams = features.load_teams(conn)
        rows = features.load_series(conn)
        records, h2h = features.load_regular_records(conn)
        dates = features.load_final_game_dates(conn)
        openers = features.load_series_game1(conn)
        seeds, flags = features.derive_seeds(rows, records, h2h, teams)
        features.compute_features(rows, records, h2h, dates, openers, seeds, flags)
        prior = grind.build_prior_grind(grind.load_series(conn))
        differences = []
        fields = ["seed_diff", "win_pct_diff", "entry_rest_diff", "h2h_diff", "prior_grind_diff"]
        calculated = []
        for row in sorted(rows, key=lambda item: item.external_series_key):
            values = [row.seed_diff, row.win_pct_diff, row.entry_rest_diff, row.h2h_diff, prior[row.external_series_key]]
            for name, before, after in zip(fields, stored[row.external_series_key], values):
                equal = before is None and after is None
                if before is not None and after is not None:
                    equal = Decimal(str(before)).quantize(Decimal("0.000001")) == Decimal(str(after)).quantize(Decimal("0.000001"))
                if not equal:
                    differences.append({"series": row.external_series_key, "field": name, "stored": str(before), "computed": after})
            calculated.append([row.external_series_key, *values])
        report = {"series": len(rows), "excludesSeason": features.EXCLUDED_SEASON,
                  "fields": fields, "differences": differences,
                  "computedSha256": hashlib.sha256(json.dumps(calculated, sort_keys=True).encode()).hexdigest(),
                  "writes": 0}
        Path(args.report_file).write_text(json.dumps(report, indent=2) + "\n")
        log.info("checked %d series, %d feature differences; wrote %s", len(rows), len(differences), args.report_file)
        if differences:
            raise ValueError("Stored playoff features differ; prepare a reviewed correction, do not refit against stale rows")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
