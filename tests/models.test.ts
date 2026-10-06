import { describe, expect, it } from 'vitest';
import { offsideLineLocal, threat, xgModel } from '../src/engine/ai/evaluate';
import { CLUBS } from '../src/data/clubs';
import { Match } from '../src/engine/match';
import { PITCH } from '../src/engine/pitch';

describe('xG model', () => {
  it('matches public open-play benchmarks', () => {
    expect(xgModel(PITCH.length - 11, 34)).toBeGreaterThan(0.15);
    expect(xgModel(PITCH.length - 11, 34)).toBeLessThan(0.35);
    expect(xgModel(PITCH.length - 5, 34)).toBeGreaterThan(0.5);
    expect(xgModel(PITCH.length - 25, 34)).toBeLessThan(0.05);
  });

  it('decreases with distance and with tighter angles', () => {
    expect(xgModel(95, 34)).toBeGreaterThan(xgModel(85, 34));
    expect(xgModel(95, 34)).toBeGreaterThan(xgModel(95, 15));
    expect(xgModel(95, 34, true)).toBeLessThan(xgModel(95, 34));
  });
});

describe('threat surface', () => {
  it('is monotonic towards goal along the centre line', () => {
    let prev = -1;
    for (let x = 0; x <= 104; x += 4) {
      const v = threat(x, 34);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('offside line', () => {
  it('is the second-last defender, never inside the attacker’s own half', () => {
    const m = new Match({ home: CLUBS[0], away: CLUBS[1], seed: 1 });
    const def = m.teams[1].active;
    // Away team defends x = 105 for a home side attacking +x.
    def.forEach((p, i) => (p.pos = { x: 60 + i, y: 34 }));
    def[0].pos = { x: 104, y: 34 }; // keeper deepest
    def[1].pos = { x: 90, y: 30 }; // last outfield defender
    const line = offsideLineLocal(1, def, { x: 50, y: 34 });
    expect(line).toBeCloseTo(90);
    def.forEach((p) => (p.pos = { x: 40, y: 34 }));
    expect(offsideLineLocal(1, def, { x: 30, y: 34 })).toBe(PITCH.length / 2);
  });
});
