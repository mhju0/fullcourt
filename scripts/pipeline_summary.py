"""Allowlisted daily telemetry; never copy child stderr or provider payloads."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

STAGES = ('scores', 'context', 'projection', 'fatigue', 'predictions')
COUNTS = {'rows_written', 'games_refreshed', 'date_errors', 'unmatched', 'matched',
          'failed_games', 'deferred_games', 'skipped_games', 'no_line_score', 'stored_games'}


def utc_now():
    return datetime.now(timezone.utc)


def expected_schedule_time(start, created=None):
    anchor = created or start
    expected = anchor.replace(hour=21, minute=17, second=0, microsecond=0)
    return expected if expected <= anchor else expected - timedelta(days=1)


def workflow_identity():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        return None
    identity = {key: os.environ.get(env, '') for key, env in
                (('run_id', 'GITHUB_RUN_ID'), ('run_attempt', 'GITHUB_RUN_ATTEMPT'))}
    if not all(value.isascii() and value.isdigit() for value in identity.values()):
        return None
    return identity


def new_summary(event=None, start=None, created=None):
    start = start or utc_now()
    event = event or os.environ.get('GITHUB_EVENT_NAME', 'local')
    expected = expected_schedule_time(start, created) if event == 'schedule' and created is not None else None
    return {
        'schema_version': 1, 'status': 'running',
        'workflow_identity': workflow_identity(), 'workflow_initialized': False,
        'event': event if event in ('schedule', 'workflow_dispatch', 'local') else 'unknown',
        'timing_status': 'unknown' if event == 'schedule' and created is None else 'available',
        'expected_at': expected.isoformat() if expected else None,
        'started_at': start.isoformat(), 'completed_at': None,
        'lateness_seconds': max(0, int((start - expected).total_seconds())) if expected else None,
        'duration_seconds': None, 'data_window_et': None,
        'data_freshness': {'status': 'unknown'},
        'stages': {name: {'status': 'not_run', 'exit_code': None, 'counts': {}} for name in STAGES},
        'providers': {},
    }


def summary_path():
    return Path(os.environ.get('DAILY_SUMMARY_PATH', 'daily-summary.json'))


def save(summary):
    path = summary_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(summary, indent=2) + '\n')
    temporary.replace(path)


def load_or_new():
    if summary_path().exists():
        return json.loads(summary_path().read_text())
    return new_summary()


def start_invocation():
    previous = load_or_new()
    fresh = new_summary()
    if (fresh['workflow_identity'] is not None
            and previous.get('workflow_identity') == fresh['workflow_identity']
            and previous.get('workflow_initialized') is True
            and previous.get('status') == 'running'
            and previous.get('pipeline_started_at') is None
            and previous.get('event') == fresh['event']):
        for key in ('timing_status', 'expected_at', 'started_at', 'lateness_seconds'):
            if key in previous:
                fresh[key] = previous[key]
    return fresh


def stage_result(directory, name, code, status):
    counts = {}
    path = Path(directory) / f'{name}.json'
    try:
        payload = json.loads(path.read_text())
        counts = {key: value for key, value in payload.items()
                  if key in COUNTS and type(value) is int and value >= 0}
    except (OSError, ValueError, AttributeError):
        pass
    return {'status': status, 'exit_code': code, 'counts': counts}


def read_freshness(directory):
    safe = {'status': 'unknown'}
    try:
        payload = json.loads((Path(directory) / 'freshness.json').read_text())
        if payload.get('status') in ('estimated', 'incomplete', 'no_data', 'unknown'):
            safe['status'] = payload['status']
        if payload.get('reason') in ('invalid_counts', 'future_computed_at', 'invalid_age', 'non_utc_session', 'unverified_historical_timezone'):
            safe['reason'] = payload['reason']
        for key in ('eligible_games', 'expected_rows', 'present_rows', 'missing_rows',
                    'oldest_age_seconds', 'latest_age_seconds'):
            value = payload.get(key)
            if type(value) is int and value >= 0:
                safe[key] = value
            elif value is None:
                safe[key] = None
        for key in ('observed_at', 'oldest_computed_at', 'latest_computed_at',
                    'window_from_et', 'window_to_et'):
            value = payload.get(key)
            if isinstance(value, str):
                try:
                    datetime.fromisoformat(value.replace('Z', '+00:00'))
                    safe[key] = value
                except ValueError:
                    pass
        safe['scope'] = 'latest fatigue row for each side of scheduled games before known future tip'
        safe['timestamp_interpretation'] = 'stored timestamp interpreted as UTC; historical writer session timezone unverified'
        safe['session_timezone'] = payload.get('session_timezone') if payload.get('session_timezone') in ('UTC', 'Etc/UTC') else 'unverified_non_utc'
        if safe['session_timezone'] == 'unverified_non_utc':
            safe['oldest_age_seconds'] = safe['latest_age_seconds'] = None
            safe['status'] = 'unknown'
    except (OSError, ValueError, AttributeError):
        pass
    return safe


def complete(summary, status):
    now = utc_now()
    summary['status'] = status
    summary['completed_at'] = now.isoformat()
    summary['duration_seconds'] = max(0, int((now - datetime.fromisoformat(summary['started_at'])).total_seconds()))
    save(summary)


def render(summary):
    lines = ['## Daily pipeline', f"Status: {summary['status']}",
             f"Expected UTC: {summary['expected_at'] or 'not scheduled'}",
             f"Started UTC: {summary['started_at']}",
             f"Completed UTC: {summary['completed_at'] or 'not completed'}",
             f"Lateness seconds: {summary['lateness_seconds']}",
             'Scoped fatigue freshness: ' + json.dumps(summary['data_freshness']),
             '', '| Stage | Status | Exit | Counts |', '| --- | --- | --- | --- |']
    for name, stage in summary['stages'].items():
        counts = ', '.join(f'{key}={value}' for key, value in stage['counts'].items()) or 'not reported'
        lines.append(f"| {name} | {stage['status']} | {stage['exit_code']} | {counts} |")
    lines.extend(['', 'Provider diagnostics: ' + json.dumps(summary['providers'])])
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['initialize', 'finalize'])
    args = parser.parse_args()
    if args.action == 'initialize':
        timing = json.loads(os.environ.get('WORKFLOW_TIMING', '{}'))
        created, started = timing.get('created_at'), timing.get('run_started_at')
        parsed = datetime.fromisoformat(created.replace('Z', '+00:00')) if created else None
        actual = datetime.fromisoformat(started.replace('Z', '+00:00')) if started else None
        summary = new_summary(created=parsed, start=actual)
        summary['workflow_initialized'] = True
        save(summary)
    else:
        summary = load_or_new()
        if summary['completed_at'] is None or os.environ.get('WORKFLOW_JOB_STATUS') == 'failure':
            complete(summary, 'failed')
        target = os.environ.get('GITHUB_STEP_SUMMARY')
        if target:
            with open(target, 'a') as output:
                output.write(render(summary))


if __name__ == '__main__':
    main()
