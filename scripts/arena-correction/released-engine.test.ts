import { describe, expect, it } from 'vitest';
import { ENGINE_ENTRY, collectSources, verifyOldCheckout } from './sources';
import { replayReleasedEngine } from './replay';
import { fixtureSnapshot } from './test-fixture';

const root = process.env.ARENA_RELEASED_CHECKOUT;
describe.skipIf(!root)('immutable released-engine bridge (unmocked tiny replay)', () => {
  it('pins actual released Git bytes and proves the replay reaches a fixed point', () => {
    const sources = collectSources(root!, [ENGINE_ENTRY]);
    verifyOldCheckout(sources);
    const snapshot = fixtureSnapshot();
    const first = replayReleasedEngine(sources, snapshot, '2026-10-20T00:00:00', '2026-10-20T00:00:00Z');
    expect(first.changed.length).toBeGreaterThan(0);
    snapshot.fatigue_scores = first.rows;
    const second = replayReleasedEngine(sources, snapshot, '2026-10-20T00:00:00', '2026-10-20T00:00:00Z');
    expect(second.changed).toEqual([]);
    expect(second.rows).toEqual(first.rows);
  }, 15000);
  it('refuses the dirty implementation checkout as an old released engine', () => {
    const sources = collectSources(process.cwd(), [ENGINE_ENTRY]);
    expect(() => verifyOldCheckout(sources)).toThrow(/immutable|closure/);
  });
});
