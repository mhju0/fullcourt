import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyProbe, summarizeProbes } from '../probe-data-sources.mjs';

test('NBA blocked hosts are diagnostic and ESPN Node success keeps probe healthy', () => {
  const results = [classifyProbe('nba_cdn', { status: 403 }), classifyProbe('nba_stats_schedule', { timedOut: true }), classifyProbe('espn_node', { status: 200, events: 8 })];
  assert.equal(results[0].status, 'expected_block');
  assert.equal(results[1].status, 'expected_block');
  assert.equal(summarizeProbes(results).status, 'success');
});

test('required Node ESPN path failure is actionable; chrome UA remains diagnostic', () => {
  const optional = classifyProbe('espn_chrome', { status: 403 });
  assert.equal(optional.status, 'diagnostic_failure');
  const result = summarizeProbes([optional, classifyProbe('espn_node', { status: 403 })]);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.actionable, ['espn_node']);
});

test('successful HTTP with malformed or empty ESPN payload is actionable', () => {
  assert.equal(classifyProbe('espn_node', { status: 200 }).status, 'actionable_failure');
  assert.equal(classifyProbe('espn_node', { status: 200, events: 0 }).status, 'actionable_failure');
});

test('probe artifact drops untrusted payload and errors', () => {
  const encoded = JSON.stringify(classifyProbe('espn_node', { status: 500, error: 'https://token:secret', body: 'password' }));
  assert.ok(!encoded.includes('secret'));
  assert.ok(!encoded.includes('password'));
});
