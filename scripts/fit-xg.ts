/**
 * Collects shots from simulated matches, compares conversion by distance with real football,
 * and fits logistic xG coefficients (distance, goal angle, header) to the engine's own outcomes.
 * Usage: npm run fit-xg -- [matches]
 */
import { CLUBS } from '../src/data/clubs';
import { Match, type ShotRecord } from '../src/engine/match';
import { goalAngle, MID_Y, PITCH } from '../src/engine/pitch';

const N = Number(process.argv[2] ?? 40);
const shots: ShotRecord[] = [];
for (let i = 0; i < N; i++) {
  const m = new Match({ home: CLUBS[i % CLUBS.length], away: CLUBS[(i + 1 + (i >> 3)) % CLUBS.length], seed: 9000 + i, fast: true });
  m.runToEnd();
  shots.push(...m.shots.filter((s) => s.outcome !== 'pending' && !s.penalty));
}

const bands: [string, number, number, number][] = [
  ['0-6 m', 0, 6, 0.4], ['6-11 m', 6, 11, 0.21], ['11-16.5 m', 11, 16.5, 0.1], ['16.5-25 m', 16.5, 25, 0.045], ['25+ m', 25, 99, 0.02],
];
const dist = (s: ShotRecord) => Math.hypot(PITCH.length - s.x, MID_Y - s.y);
const rows: Record<string, unknown> = {};
for (const [name, lo, hi, real] of bands) {
  const b = shots.filter((s) => dist(s) >= lo && dist(s) < hi);
  const goals = b.filter((s) => s.outcome === 'goal').length;
  const xg = b.reduce((a, s) => a + s.xg, 0);
  rows[name] = { shots: b.length, share: `${((b.length / shots.length) * 100).toFixed(0)}%`, conversion: (goals / (b.length || 1)).toFixed(3), modelXg: (xg / (b.length || 1)).toFixed(3), realWorld: real };
}
console.log(`${shots.length} open-play shots from ${N} matches`);
console.table(rows);

// Logistic regression by plain gradient descent: xG = σ(b0 + b1·angle + b2·dist + b3·header).
const X = shots.map((s) => [1, goalAngle(s.x, s.y), dist(s) / 10, s.header ? 1 : 0]);
const y = shots.map((s) => (s.outcome === 'goal' ? 1 : 0));
const w = [-2.5, 3.4, -0.8, -0.6];
for (let it = 0; it < 4000; it++) {
  const g = [0, 0, 0, 0];
  for (let i = 0; i < X.length; i++) {
    const z = X[i].reduce((a, v, k) => a + v * w[k], 0);
    const p = 1 / (1 + Math.exp(-z));
    for (let k = 0; k < 4; k++) g[k] += (p - y[i]) * X[i][k];
  }
  for (let k = 0; k < 4; k++) w[k] -= (0.5 * g[k]) / X.length;
}
console.log('fitted: intercept %s, angle %s, per-metre %s, header %s', w[0].toFixed(3), w[1].toFixed(3), (w[2] / 10).toFixed(4), w[3].toFixed(3));
