import { describe, expect, it } from 'vitest';
import { computeTable, roundRobin, topScorers, type Fixture } from '../src/league/league';

const clubs = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('league', () => {
  it('builds a double round-robin where every pair meets home and away', () => {
    const fx = roundRobin(clubs, 1);
    expect(fx.length).toBe(clubs.length * (clubs.length - 1));
    const pairs = new Set(fx.map((f) => `${f.home}-${f.away}`));
    expect(pairs.size).toBe(fx.length);
    for (const r of new Set(fx.map((f) => f.round))) {
      const teams = fx.filter((f) => f.round === r).flatMap((f) => [f.home, f.away]);
      expect(new Set(teams).size).toBe(teams.length); // nobody plays twice in a round
    }
  });

  it('handles an odd number of clubs with byes', () => {
    const fx = roundRobin(['a', 'b', 'c', 'd', 'e'], 3);
    expect(fx.length).toBe(20);
  });

  it('computes points, goal difference and ordering', () => {
    const fx: Fixture[] = [
      { id: 0, round: 1, home: 'a', away: 'b', seed: 0, result: { score: [2, 0], xg: [1.5, 0.5], goals: [{ player: 'X', club: 'a', minute: "10'" }, { player: 'X', club: 'a', minute: "50'" }] } },
      { id: 1, round: 1, home: 'c', away: 'd', seed: 0, result: { score: [1, 1], xg: [1, 1], goals: [{ player: 'Y', club: 'c', minute: "5'" }, { player: 'Z', club: 'd', minute: "7'" }] } },
      { id: 2, round: 2, home: 'b', away: 'c', seed: 0 },
    ];
    const t = computeTable(['a', 'b', 'c', 'd'], fx);
    expect(t[0]).toMatchObject({ club: 'a', pts: 3, gf: 2, ga: 0, w: 1 });
    expect(t[t.length - 1]).toMatchObject({ club: 'b', pts: 0, l: 1 });
    expect(t.find((r) => r.club === 'c')!.pts).toBe(1);
    expect(topScorers(fx)[0]).toEqual({ player: 'X', club: 'a', goals: 2 });
  });
});
