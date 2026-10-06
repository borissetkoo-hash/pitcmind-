import { describe, expect, it } from 'vitest';
import { GROUND_DECEL, groundPassSpeed, groundTimeAt, loftedLaunch, predictTrajectory, stepBall } from '../src/engine/ball';
import { Rng } from '../src/engine/rng';

describe('ball physics', () => {
  it('ground pass speed formula delivers the ball at the requested speed', () => {
    const d = 25;
    const v0 = groundPassSpeed(d, 7);
    const ball = { pos: { x: 0, y: 0 }, z: 0, vel: { x: v0, y: 0 }, vz: 0 };
    const t = groundTimeAt(v0, d);
    const dt = 1 / 240;
    for (let s = 0; s < t; s += dt) stepBall(ball, dt);
    expect(ball.pos.x).toBeCloseTo(d, 0);
    expect(ball.vel.x).toBeCloseTo(7, 0);
  });

  it('a rolling ball stops after v²/2a metres', () => {
    const ball = { pos: { x: 0, y: 0 }, z: 0, vel: { x: 10, y: 0 }, vz: 0 };
    for (let i = 0; i < 2000; i++) stepBall(ball, 1 / 100);
    expect(ball.vel.x).toBe(0);
    expect(ball.pos.x).toBeCloseTo(100 / (2 * GROUND_DECEL), 1);
  });

  it('lofted launch lands close to the target after the requested flight time', () => {
    const { vh, vz } = loftedLaunch(30, 1.6);
    const ball = { pos: { x: 0, y: 0 }, z: 0, vel: { x: vh, y: 0 }, vz };
    let landed = 0;
    for (let i = 1; i < 2000; i++) {
      stepBall(ball, 1 / 500);
      if (ball.z === 0) {
        landed = i / 500;
        break;
      }
    }
    expect(landed).toBeCloseTo(1.6, 1);
    expect(ball.pos.x).toBeGreaterThan(28.5);
    expect(ball.pos.x).toBeLessThan(31.5);
  });

  it('trajectory prediction matches direct integration', () => {
    const b = { pos: { x: 10, y: 10 }, z: 0, vel: { x: 12, y: 5 }, vz: 4 };
    const traj = predictTrajectory(b, 2, 0.1);
    const direct = { pos: { ...b.pos }, z: b.z, vel: { ...b.vel }, vz: b.vz };
    for (let i = 0; i < 40; i++) stepBall(direct, 0.05);
    const last = traj[traj.length - 1];
    expect(last.x).toBeCloseTo(direct.pos.x, 5);
    expect(last.y).toBeCloseTo(direct.pos.y, 5);
  });
});

describe('rng', () => {
  it('is deterministic per seed and roughly uniform', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 10000 }, () => a.next());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b.next()));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});
