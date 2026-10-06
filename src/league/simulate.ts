import { coachById } from '../data/coaches';
import { clubById } from '../data/clubs';
import { Match } from '../engine/match';
import type { FixtureResult } from './league';

/** Plays one fixture headlessly and condenses it to what the league needs. */
export function playFixture(home: string, away: string, seed: number, fast = true): FixtureResult {
  const h = clubById(home);
  const a = clubById(away);
  const m = new Match({ home: h, away: a, seed, fast, homeCoach: coachById(h.coachId)?.traits, awayCoach: coachById(a.coachId)?.traits });
  const r = m.runToEnd();
  return {
    score: r.score,
    xg: [r.stats[0].xg, r.stats[1].xg],
    goals: r.events
      .filter((e) => e.type === 'goal')
      .map((e) => ({ player: e.player ?? '?', club: e.team === 0 ? home : away, minute: e.minute })),
  };
}
