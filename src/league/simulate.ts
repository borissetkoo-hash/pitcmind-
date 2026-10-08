import { coachById } from '../data/coaches';
import type { CoachTraits, Tactics } from '../engine/types';
import { clubById } from '../data/clubs';
import { Match } from '../engine/match';
import type { FixtureResult } from './league';

/** Plays one fixture headlessly and condenses it to what the league needs. */
/** Who is in charge of each side when it differs from the club's default (career mode). */
export interface SideOverrides {
  homeCoach?: CoachTraits;
  awayCoach?: CoachTraits;
  homeTactics?: Tactics;
  awayTactics?: Tactics;
}

export function playFixture(home: string, away: string, seed: number, fast = true, o: SideOverrides = {}): FixtureResult {
  const h = clubById(home);
  const a = clubById(away);
  const m = new Match({
    home: h, away: a, seed, fast,
    homeCoach: o.homeCoach ?? coachById(h.coachId)?.traits,
    awayCoach: o.awayCoach ?? coachById(a.coachId)?.traits,
    homeTactics: o.homeTactics, awayTactics: o.awayTactics,
  });
  const r = m.runToEnd();
  return {
    score: r.score,
    xg: [r.stats[0].xg, r.stats[1].xg],
    goals: r.events
      .filter((e) => e.type === 'goal')
      .map((e) => ({ player: e.player ?? '?', club: e.team === 0 ? home : away, minute: e.minute })),
  };
}
