import { describe, expect, it } from 'vitest';
import { CLUBS } from '../src/data/clubs';
import { Match } from '../src/engine/match';

const play = (seed: number, fast = true) => new Match({ home: CLUBS[2], away: CLUBS[3], seed, fast }).runToEnd();

describe('match engine', () => {
  it('is fully deterministic for a given seed', () => {
    const a = play(123);
    const b = play(123);
    expect(a.score).toEqual(b.score);
    expect(a.events.map((e) => `${e.type}${e.time.toFixed(3)}`)).toEqual(b.events.map((e) => `${e.type}${e.time.toFixed(3)}`));
  });

  it('plays two halves with stoppage time and ends with a full-time event', () => {
    const r = play(7);
    const types = r.events.map((e) => e.type);
    expect(types[0]).toBe('kickoff');
    expect(types).toContain('halftime');
    expect(types).toContain('secondHalf');
    expect(types[types.length - 1]).toBe('fulltime');
    const ft = r.events[r.events.length - 1];
    expect(ft.time).toBeGreaterThanOrEqual(90 * 60);
    expect(ft.time).toBeLessThan(100 * 60);
  });

  it('keeps score, goal events and shot outcomes consistent', () => {
    const r = play(99);
    const goals = (team: number) => r.events.filter((e) => (e.type === 'goal' || e.type === 'ownGoal') && e.team === team).length;
    expect(goals(0)).toBe(r.score[0]);
    expect(goals(1)).toBe(r.score[1]);
    for (const [i, s] of r.stats.entries()) {
      expect(s.shotsOnTarget).toBeLessThanOrEqual(s.shots);
      expect(s.passesCompleted).toBeLessThanOrEqual(s.passes);
      expect(r.shots.filter((x) => x.team === i).length).toBe(s.shots);
    }
    const [h, a] = r.possession;
    expect(h + a).toBe(100);
  });

  it('produces football-like aggregate numbers', () => {
    let goals = 0;
    let shots = 0;
    let passes = 0;
    const N = 8;
    for (let i = 0; i < N; i++) {
      const r = new Match({ home: CLUBS[i % 8], away: CLUBS[(i + 3) % 8], seed: 500 + i, fast: true }).runToEnd();
      goals += r.score[0] + r.score[1];
      shots += r.stats[0].shots + r.stats[1].shots;
      passes += r.stats[0].passes + r.stats[1].passes;
    }
    expect(goals / N).toBeGreaterThan(1);
    expect(goals / N).toBeLessThan(6);
    expect(shots / N).toBeGreaterThan(12);
    expect(shots / N).toBeLessThan(45);
    expect(passes / N).toBeGreaterThan(500);
    expect(passes / N).toBeLessThan(1800);
  });

  it('never has more than 11 players per side and respects substitution limits', () => {
    const m = new Match({ home: CLUBS[0], away: CLUBS[5], seed: 31, fast: true });
    let max = 0;
    while (!m.finished) {
      m.step();
      for (const t of m.teams) max = Math.max(max, t.active.length);
    }
    expect(max).toBeLessThanOrEqual(11);
    for (const t of m.teams) expect(t.players.length - 11).toBeLessThanOrEqual(5);
  });

  it('changes formation mid-match without losing players', () => {
    const m = new Match({ home: CLUBS[0], away: CLUBS[1], seed: 2 });
    for (let i = 0; i < 300; i++) m.step();
    m.setTactics(0, { ...m.teams[0].tactics, formation: '5-3-2' });
    const roles = m.teams[0].active.map((p) => p.role);
    expect(roles.filter((r) => r === 'CB').length).toBe(3);
    expect(roles.filter((r) => r === 'GK').length).toBe(1);
    for (let i = 0; i < 300; i++) m.step();
    expect(m.teams[0].active.length).toBe(11);
  });
});
