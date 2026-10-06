import { clubById } from '../data/clubs';
import { Match } from '../engine/match';
import type { FixtureResult } from './league';

/** Plays one fixture headlessly and condenses it to what the league needs. */
export function playFixture(home: string, away: string, seed: number, fast = true): FixtureResult {
  const m = new Match({ home: clubById(home), away: clubById(away), seed, fast });
  const r = m.runToEnd();
  return {
    score: r.score,
    xg: [r.stats[0].xg, r.stats[1].xg],
    goals: r.events
      .filter((e) => e.type === 'goal')
      .map((e) => ({ player: e.player ?? '?', club: e.team === 0 ? home : away, minute: e.minute })),
  };
}
