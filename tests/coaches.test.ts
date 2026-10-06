import { describe, expect, it } from 'vitest';
import { COACHES, NEUTRAL_TRAITS, coachById, coachTactics } from '../src/data/coaches';
import { CLUBS } from '../src/data/clubs';
import { FORMATIONS } from '../src/engine/formations';
import { Match } from '../src/engine/match';

describe('coaches', () => {
  it('every coach has a valid profile', () => {
    expect(COACHES.length).toBe(31);
    for (const c of COACHES) {
      for (const f of c.formations) expect(FORMATIONS[f]).toBeDefined();
      for (const v of Object.values(c.traits)) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(20);
      for (const v of Object.values(c.tactics)) expect(Number.isFinite(v)).toBe(true);
      expect(c.style.ru.length).toBeGreaterThan(20);
      expect(c.style.en.length).toBeGreaterThan(20);
    }
    expect(new Set(COACHES.map((c) => c.id)).size).toBe(COACHES.length);
  });

  it('a neutral coach changes nothing (all-10 attributes are a no-op)', () => {
    const a = new Match({ home: CLUBS[2], away: CLUBS[3], seed: 5, fast: true }).runToEnd();
    const b = new Match({ home: CLUBS[2], away: CLUBS[3], seed: 5, fast: true, homeCoach: NEUTRAL_TRAITS, awayCoach: NEUTRAL_TRAITS }).runToEnd();
    expect(b.score).toEqual(a.score);
    expect(b.stats[0].passes).toBe(a.stats[0].passes);
  });

  it('maps attributes to engine modifiers and applies the coach’s preferred set-up', () => {
    const simeone = coachById('simeone')!;
    const pep = coachById('guardiola')!;
    const m = new Match({ home: CLUBS[0], away: CLUBS[1], seed: 1, homeCoach: pep.traits, awayCoach: simeone.traits, homeTactics: coachTactics(pep), awayTactics: coachTactics(simeone) });
    expect(m.teams[0].coaching.passing).toBeCloseTo(0.7);
    expect(m.teams[1].coaching.organisation).toBeCloseTo(0.7);
    expect(m.teams[1].coaching.passing).toBeCloseTo(0);
    expect(m.teams[1].tactics.formation).toBe('4-4-2');
    expect(m.teams[1].tactics.lineHeight).toBeLessThan(m.teams[0].tactics.lineHeight);
  });

  it('every club in the league has a head coach', () => {
    for (const c of CLUBS) expect(coachById(c.coachId)).toBeDefined();
  });
});
