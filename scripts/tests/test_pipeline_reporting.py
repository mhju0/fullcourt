import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import daily_update


class ReportingTests(unittest.TestCase):
    def pipeline(self, codes, payload=None, initial=None, environment=None):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / 'summary.json'
            if initial is not None:
                summary.write_text(json.dumps(initial))
            def child(*args, **kwargs):
                Path(kwargs['env']['DAILY_STAGE_SUMMARY_DIR'], 'freshness.json').write_text(json.dumps({
                    'status': 'estimated', 'session_timezone': 'UTC', 'eligible_games': 1,
                    'present_rows': 2, 'expected_rows': 2, 'missing_rows': 0,
                    'oldest_age_seconds': 2, 'latest_age_seconds': 1,
                    'observed_at': '2026-10-15T21:20:00Z',
                    'oldest_computed_at': '2026-10-15 21:19:58',
                    'latest_computed_at': '2026-10-15 21:19:59',
                    'error': 'postgres://secret',
                }))
                if payload:
                    target = Path(kwargs['env']['DAILY_STAGE_SUMMARY_DIR']) / 'context.json'
                    target.write_text(json.dumps(payload))
                return SimpleNamespace(returncode=next(values))
            values = iter(codes)
            with patch.dict(os.environ, {'DAILY_SUMMARY_PATH': str(summary), 'GITHUB_ACTIONS': 'false',
                                          'GITHUB_EVENT_NAME': 'local', **(environment or {})}, clear=False), \
                 patch.object(daily_update, 'is_in_season', return_value=True), \
                 patch.object(daily_update, 'resolve_database_url', return_value='postgres://secret'), \
                 patch.object(daily_update.subprocess, 'run', side_effect=child) as run:
                try:
                    daily_update.main()
                    code = 0
                except SystemExit as error:
                    code = error.code
            return code, run.call_count, json.loads(summary.read_text())

    def test_interrupted_local_retry_clears_prior_success_before_score_failure(self):
        from pipeline_summary import new_summary
        old = new_summary(event='local', start=datetime(2026, 1, 1, tzinfo=timezone.utc))
        for stage in ('context', 'projection', 'fatigue', 'predictions'):
            old['stages'][stage] = {'status': 'success', 'exit_code': 0, 'counts': {'rows_written': 123}}
        old['providers'] = {'espn_context': 'success'}
        old['data_freshness'] = {'status': 'estimated', 'present_rows': 123}
        old['data_window_et'] = {'scores_from': '2026-01-01', 'scores_to': '2026-01-08'}
        code, calls, result = self.pipeline([1], initial=old)
        self.assertEqual((code, calls), (1, 1))
        self.assertEqual(result['status'], 'failed')
        for stage in ('context', 'projection', 'fatigue', 'predictions'):
            self.assertEqual(result['stages'][stage], {'status': 'not_run', 'exit_code': None, 'counts': {}})
        self.assertEqual(result['providers'], {'espn_scores': 'failed'})
        self.assertEqual(result['data_freshness'], {'status': 'unknown'})
        self.assertNotEqual(result['started_at'], old['started_at'])
        self.assertNotEqual(result['data_window_et'], old['data_window_et'])

    def initialized_workflow(self):
        from pipeline_summary import new_summary
        environment = {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'schedule',
                       'GITHUB_RUN_ID': '12345', 'GITHUB_RUN_ATTEMPT': '2'}
        with patch.dict(os.environ, environment):
            old = new_summary(start=datetime(2026, 1, 1, 22, 0, tzinfo=timezone.utc),
                              created=datetime(2026, 1, 1, 21, 17, tzinfo=timezone.utc))
        old['workflow_initialized'] = True
        return old, environment

    def test_fresh_matching_workflow_initialization_preserves_only_timing(self):
        old, environment = self.initialized_workflow()
        old['stages']['context'] = {'status': 'success', 'exit_code': 0, 'counts': {'rows_written': 123}}
        _, _, result = self.pipeline([1], initial=old, environment=environment)
        for key in ('started_at', 'expected_at', 'lateness_seconds', 'timing_status'):
            self.assertEqual(result[key], old[key])
        self.assertEqual(result['stages']['context']['status'], 'not_run')
        self.assertEqual(result['stages']['context']['counts'], {})
        self.assertFalse(result['workflow_initialized'])
        self.assertEqual(result['workflow_identity'], {'run_id': '12345', 'run_attempt': '2'})

    def test_previous_workflow_attempt_cannot_supply_timing_to_rerun(self):
        old, environment = self.initialized_workflow()
        environment['GITHUB_RUN_ATTEMPT'] = '3'
        _, _, result = self.pipeline([1], initial=old, environment=environment)
        self.assertNotEqual(result['started_at'], old['started_at'])
        self.assertIsNone(result['expected_at'])
        self.assertEqual(result['timing_status'], 'unknown')

    def test_already_started_workflow_cannot_supply_initialization_timing_again(self):
        old, environment = self.initialized_workflow()
        old['pipeline_started_at'] = old['started_at']
        _, _, result = self.pipeline([1], initial=old, environment=environment)
        self.assertNotEqual(result['started_at'], old['started_at'])
        self.assertIsNone(result['expected_at'])

    def test_optional_partial_context_is_visible_and_preserves_downstream(self):
        code, calls, result = self.pipeline([0, 2, 0, 0])
        self.assertEqual((code, calls), (0, 4))
        self.assertEqual(result['status'], 'degraded')
        self.assertEqual(result['stages']['context']['status'], 'degraded')
        self.assertEqual(result['stages']['predictions']['status'], 'success')

    def test_success_reports_estimated_scoped_freshness(self):
        code, _, result = self.pipeline([0, 0, 0, 0])
        self.assertEqual(code, 0)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['data_freshness']['status'], 'estimated')
        self.assertEqual(result['data_freshness']['present_rows'], 2)
        self.assertNotIn('secret', json.dumps(result))

    def test_fatal_context_retains_downstream_but_fails_final_status(self):
        code, calls, result = self.pipeline([0, 1, 0, 0])
        self.assertEqual((code, calls), (1, 4))
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['stages']['context']['status'], 'failed')

    def test_critical_scores_stop_and_mark_not_run(self):
        code, calls, result = self.pipeline([1])
        self.assertEqual((code, calls), (1, 1))
        self.assertEqual(result['stages']['predictions']['status'], 'not_run')
        self.assertIsNotNone(result['completed_at'])

    def test_payload_allowlist_drops_errors_urls_and_arbitrary_keys(self):
        payload = {'rows_written': 3, 'date_errors': 1, 'error': 'postgres://password', 'url': 'https://secret', 'rows_injected': 'password'}
        _, _, result = self.pipeline([0, 2, 0, 0], payload)
        encoded = json.dumps(result)
        self.assertNotIn('password', encoded)
        self.assertNotIn('https://', encoded)
        self.assertEqual(result['stages']['context']['counts']['rows_written'], 3)

    def test_expected_time_uses_dispatch_creation_not_late_midnight_start(self):
        from pipeline_summary import expected_schedule_time
        actual = datetime(2026, 10, 16, 22, 0, tzinfo=timezone.utc)
        created = datetime(2026, 10, 16, 1, 0, tzinfo=timezone.utc)
        self.assertEqual(expected_schedule_time(actual, created).isoformat(), '2026-10-15T21:17:00+00:00')

    def test_manual_dispatch_has_no_expected_schedule(self):
        from pipeline_summary import new_summary
        result = new_summary(event='workflow_dispatch')
        self.assertIsNone(result['expected_at'])
        self.assertIsNone(result['lateness_seconds'])

    def test_install_failure_finalizes_summary_without_claiming_stages_ran(self):
        import pipeline_summary
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory, 'summary.json')
            with patch.dict(os.environ, {'DAILY_SUMMARY_PATH': str(target), 'WORKFLOW_JOB_STATUS': 'failure'}), \
                 patch.object(sys, 'argv', ['pipeline_summary.py', 'finalize']):
                pipeline_summary.save(pipeline_summary.new_summary(event='workflow_dispatch'))
                pipeline_summary.main()
                result = json.loads(target.read_text())
        self.assertEqual(result['status'], 'failed')
        self.assertIsNotNone(result['completed_at'])
        self.assertTrue(all(stage['status'] == 'not_run' for stage in result['stages'].values()))
        self.assertIsNone(result['data_window_et'])

    def test_offseason_skips_database_resolution_and_all_writers(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory, 'summary.json')
            with patch.dict(os.environ, {'DAILY_SUMMARY_PATH': str(target)}), \
                 patch.object(daily_update, 'is_in_season', return_value=False), \
                 patch.object(daily_update, 'resolve_database_url') as resolver, \
                 patch.object(daily_update.subprocess, 'run') as run:
                daily_update.main()
                resolver.assert_not_called()
                run.assert_not_called()
                result = json.loads(target.read_text())
        self.assertEqual(result['status'], 'skipped')
        self.assertTrue(all(stage['status'] == 'skipped' for stage in result['stages'].values()))

    def test_unavailable_actions_timing_does_not_invent_schedule_lateness(self):
        from pipeline_summary import new_summary
        result = new_summary(event='schedule')
        self.assertIsNone(result['expected_at'])
        self.assertIsNone(result['lateness_seconds'])
        self.assertEqual(result['timing_status'], 'unknown')

    def test_missing_actions_secret_fails_before_python_dependencies(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'DATABASE_URL': ''}):
            with self.assertRaises(SystemExit) as error:
                daily_update.resolve_database_url()
            self.assertEqual(error.exception.code, 1)

    def test_non_utc_freshness_does_not_publish_ages_or_untrusted_timezone(self):
        from pipeline_summary import read_freshness
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'freshness.json').write_text(json.dumps({
                'status': 'estimated', 'session_timezone': 'https://secret',
                'oldest_age_seconds': 10, 'latest_age_seconds': 5,
                'observed_at': 'https://secret', 'error': 'password',
            }))
            result = read_freshness(directory)
        self.assertEqual(result['status'], 'unknown')
        self.assertIsNone(result['oldest_age_seconds'])
        self.assertNotIn('secret', json.dumps(result))
        self.assertNotIn('password', json.dumps(result))

    def test_workflow_rejects_manual_before_dependencies_and_has_no_manual_writer(self):
        text = (Path(__file__).resolve().parents[2] / '.github/workflows/daily-update.yml').read_text()
        self.assertLess(text.index('Reject blocked manual source tasks'), text.index('Install pnpm'))
        self.assertNotIn('pip install', text)
        self.assertNotIn('python scripts/fetch_schedule.py', text)
        self.assertIn('cancel-in-progress: false', text)
        self.assertIn('17 21 * * *', text)
        self.assertIn('timeout-minutes:', text)


if __name__ == '__main__':
    unittest.main()
