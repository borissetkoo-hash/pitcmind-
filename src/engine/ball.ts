import type { Player } from './player';
import { type Vec, vec, hyp } from './vec';

export const GRAVITY = 9.81;
/** Constant rolling deceleration (m/s²). Constant (not proportional) so ground passes stay analytically predictable. */
export const GROUND_DECEL = 2.6;
/** Horizontal air drag coefficient (1/s). */
export const AIR_DRAG = 0.1;
export const BALL_RADIUS = 0.11;

export type KickKind = 'pass' | 'cross' | 'shot' | 'clear' | 'header' | 'throw' | 'deflection';

export interface Flight {
  kind: KickKind;
  from: Player;
  /** Intended receiver for passes. */
  to: Player | null;
  target: Vec;
  startTime: number;
  xg: number;
  /** Shot id in the stats log so its outcome can be resolved later. */
  shotId: number;
  lofted: boolean;
  /** For shots: was it going in if nobody touched it? */
  onTarget?: boolean;
}

export interface BallState {
  pos: Vec;
  z: number;
  vel: Vec;
  vz: number;
}

export class Ball implements BallState {
  pos: Vec = vec(52.5, 34);
  prev: Vec = vec(52.5, 34);
  z = 0;
  prevZ = 0;
  vel: Vec = vec();
  vz = 0;
  owner: Player | null = null;
  lastTouch: Player | null = null;
  flight: Flight | null = null;

  place(p: Vec): void {
    this.pos = { ...p };
    this.prev = { ...p };
    this.z = 0;
    this.prevZ = 0;
    this.vel = vec();
    this.vz = 0;
    this.flight = null;
  }

  get speed(): number {
    return hyp(this.vel.x, this.vel.y);
  }

  get airborne(): boolean {
    return this.z > 0.05 || this.vz > 0.05;
  }

  update(dt: number): void {
    this.prev = { ...this.pos };
    this.prevZ = this.z;
    if (this.owner) return; // carried; position is driven by the dribbler
    stepBall(this, dt);
  }
}

/** Integrates free ball motion. Shared by the live ball and the AI's trajectory predictor. */
export function stepBall(b: BallState, dt: number): void {
  if (b.z > 0 || b.vz > 0) {
    b.vz -= GRAVITY * dt;
    const drag = 1 - AIR_DRAG * dt;
    b.vel.x *= drag;
    b.vel.y *= drag;
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -2.2) {
        b.vz = -b.vz * 0.45; // bounce
        b.vel.x *= 0.78;
        b.vel.y *= 0.78;
      } else {
        b.vz = 0;
        b.vel.x *= 0.88;
        b.vel.y *= 0.88;
      }
    }
    return;
  }
  const speed = hyp(b.vel.x, b.vel.y);
  if (speed < 1e-3) {
    b.vel.x = 0;
    b.vel.y = 0;
    return;
  }
  const next = Math.max(0, speed - GROUND_DECEL * dt);
  const avg = (speed + next) / 2;
  b.pos.x += (b.vel.x / speed) * avg * dt;
  b.pos.y += (b.vel.y / speed) * avg * dt;
  b.vel.x = (b.vel.x / speed) * next;
  b.vel.y = (b.vel.y / speed) * next;
}

export interface TrajectoryPoint {
  t: number;
  x: number;
  y: number;
  z: number;
  speed: number;
}

/** Forward-simulates a free ball. Used by every player to work out where they can meet it. */
export function predictTrajectory(b: BallState, horizon = 4, step = 0.1): TrajectoryPoint[] {
  const s: BallState = { pos: { ...b.pos }, z: b.z, vel: { ...b.vel }, vz: b.vz };
  const out: TrajectoryPoint[] = [{ t: 0, x: s.pos.x, y: s.pos.y, z: s.z, speed: hyp(s.vel.x, s.vel.y) }];
  const sub = 2;
  for (let t = step; t <= horizon + 1e-9; t += step) {
    for (let i = 0; i < sub; i++) stepBall(s, step / sub);
    out.push({ t, x: s.pos.x, y: s.pos.y, z: s.z, speed: hyp(s.vel.x, s.vel.y) });
  }
  return out;
}

/** Initial speed needed for a ground pass to cover `d` metres and still arrive at `arrive` m/s. */
export function groundPassSpeed(d: number, arrive: number): number {
  return Math.sqrt(arrive * arrive + 2 * GROUND_DECEL * d);
}

/** Time for a ground ball launched at v0 to travel s metres (Infinity if it stops short). */
export function groundTimeAt(v0: number, s: number): number {
  const disc = v0 * v0 - 2 * GROUND_DECEL * s;
  if (disc < 0) return Infinity;
  return (v0 - Math.sqrt(disc)) / GROUND_DECEL;
}

/** Launch velocity for a lofted ball landing at horizontal distance d after `flightTime` seconds. */
export function loftedLaunch(d: number, flightTime: number, landZ = 0): { vh: number; vz: number } {
  const k = AIR_DRAG;
  const effective = (1 - Math.exp(-k * flightTime)) / k;
  return { vh: d / effective, vz: (landZ + 0.5 * GRAVITY * flightTime * flightTime) / flightTime };
}
