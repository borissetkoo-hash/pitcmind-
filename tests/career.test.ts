import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, avatarSvg, randomLook } from '../src/career/avatar';
import {
  PLAYER_COACH, STYLES, boardTarget, clubSide, endSeason, newCareer, nextUserFixture, playerCoach, seasonComplete,
  startNextSeason, type CareerCoach,
} from '../src/career/career';
import { CLUBS } from '../src/data/clubs';
import { Rng } from '../src/engine/rng';

const coach = (): CareerCoach => ({ firstName: 'Boris', lastName: 'Setkov', flag: '🇷🇺', look: { ...DEFAULT_LOOK }, style: 'pressing', traits: { ...STYLES.pressing.traits } });

/** Fills every fixture with a synthetic result; `userWins` decides the user's matches. */
function finishSeason(state: ReturnType<typeof newCareer>, userWins: boolean) {
  const rng = new Rng(3);
  for (const f of state.league.fixtures) {
    const mine = f.home === state.clubId || f.away === state.clubId;
    let score: [number, number] = [rng.int(0, 3), rng.int(0, 3)];
    if (mine) score = (f.home === state.clubId) === userWins ? [3, 0] : [0, 3];
    f.result = { score, xg: [1, 1], goals: [] };
  }
}

describe('career mode', () => {
  it('starts with the created coach in charge of the chosen club', () => {
    const s = newCareer(coach(), 'ost', 42);
    expect(s.coaches.ost).toBe(PLAYER_COACH);
    expect(Object.values(s.coaches).filter((c) => c === PLAYER_COACH)).toHaveLength(1);
    expect(s.tactics.formation).toBe(STYLES.pressing.formation);
    expect(playerCoach(s).name).toBe('Boris Setkov');
    expect(clubSide(s, 'ost').coach.id).toBe(PLAYER_COACH);
    expect(nextUserFixture(s)!.round).toBe(1);
  });

  it('sets tougher objectives for stronger clubs', () => {
    const targets = CLUBS.map((c) => boardTarget(c.id));
    expect(Math.min(...targets)).toBe(1);
    expect(Math.max(...targets)).toBe(CLUBS.length - 1);
  });

  it('rewards a title-winning season with growth and confidence, then moves on', () => {
    const s = newCareer(coach(), 'hlm', 7);
    finishSeason(s, true);
    expect(seasonComplete(s)).toBe(true);
    const before = { ...s.coach.traits };
    const sum = endSeason(s);
    expect(sum.position).toBe(1);
    expect(sum.champion).toBe(true);
    expect(s.status).toBe('seasonOver');
    expect(Object.values(s.coach.traits).reduce((a, b) => a + b, 0)).toBeGreaterThan(Object.values(before).reduce((a, b) => a + b, 0));
    const coachesBefore = { ...s.coaches };
    startNextSeason(s);
    expect(s.season).toBe(2);
    expect(s.status).toBe('active');
    expect(s.league.fixtures.every((f) => !f.result)).toBe(true);
    expect(Object.keys(s.coaches).filter((k) => s.coaches[k] !== coachesBefore[k]).length).toBeGreaterThanOrEqual(1);
    expect(new Set(Object.values(s.coaches)).size).toBe(CLUBS.length); // nobody coaches two clubs
  });

  it('sacks a coach after repeated failure and offers a smaller club', () => {
    const s = newCareer(coach(), 'nrd', 9);
    finishSeason(s, false);
    endSeason(s);
    if (s.status !== 'sacked') {
      startNextSeason(s);
      finishSeason(s, false);
      endSeason(s);
    }
    expect(s.status).toBe('sacked');
    startNextSeason(s, 'hlm');
    expect(s.clubId).toBe('hlm');
    expect(s.coaches.hlm).toBe(PLAYER_COACH);
    expect(s.coaches.nrd).not.toBe(PLAYER_COACH);
  });

  it('renders every avatar combination', () => {
    for (let i = 0; i < 50; i++) expect(avatarSvg(randomLook(new Rng(i).next.bind(new Rng(i))))).toContain('<svg');
  });
});
