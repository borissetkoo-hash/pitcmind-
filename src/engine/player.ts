import type { Team } from './team';
import type { PlayerData, Role } from './types';
import { type Vec, angleDiff, angleOf, clamp, clampLen, vec, hyp } from './vec';

export type CarrierAction =
  | { type: 'dribble'; target: Vec }
  | { type: 'hold'; target: Vec };

export interface PlayerMatchStats {
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  passesCompleted: number;
  keyPasses: number;
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  fouls: number;
  saves: number;
  dribbles: number;
  distance: number;
  touches: number;
  rating: number;
}

export const emptyPlayerStats = (): PlayerMatchStats => ({
  minutes: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, xg: 0, passes: 0, passesCompleted: 0,
  keyPasses: 0, tackles: 0, tacklesWon: 0, interceptions: 0, fouls: 0, saves: 0, dribbles: 0,
  distance: 0, touches: 0, rating: 6,
});

const REACTION = 0.2;

/** Fraction of top speed a player keeps while running with the ball. */
export const dribbleFactor = (dribbling: number) => 0.72 + dribbling * 0.0012;

export class Player {
  readonly data: PlayerData;
  readonly team: Team;
  role: Role;
  slot: number;

  pos: Vec;
  prev: Vec;
  vel: Vec = vec();
  facing = 0;

  /** Where the AI wants to be, and how hard to run there (0 … 1). */
  target: Vec;
  intensity = 0.5;

  energy = 1;
  onPitch = true;
  sentOff = false;
  /** Picked up an injury: limps on until the next stoppage, then is replaced. */
  injured = false;
  yellow = 0;
  enteredAt = 0;
  leftAt: number | null = null;

  kickCooldown = 0;
  tackleCooldown = 0;
  decisionTimer = 0;
  possessionTime = 0;
  action: CarrierAction | null = null;
  runTimer = 0;
  /** Goalkeeper dive state. */
  dive: { timer: number; reach: number } | null = null;

  stats: PlayerMatchStats = emptyPlayerStats();
  /** Coarse positional samples for the heat map (local frame, one per second). */
  heat: number[] = [];

  constructor(data: PlayerData, team: Team, role: Role, slot: number, pos: Vec) {
    this.data = data;
    this.team = team;
    this.role = role;
    this.slot = slot;
    this.pos = { ...pos };
    this.prev = { ...pos };
    this.target = { ...pos };
    // A tired squad player starts the match with less in the tank.
    this.energy = 0.7 + 0.3 * Math.max(0, Math.min(1, data.condition ?? 1));
  }

  get a() {
    return this.data.attrs;
  }

  get isGK(): boolean {
    return this.role === 'GK';
  }

  /** Top speed in m/s, reduced by fatigue. */
  get maxSpeed(): number {
    return (5.7 + this.a.pace * 0.036) * (0.78 + 0.22 * this.energy);
  }

  get accel(): number {
    return (3.2 + this.a.acceleration * 0.038) * (0.85 + 0.15 * this.energy);
  }

  get speed(): number {
    return hyp(this.vel.x, this.vel.y);
  }

  /** How far this player can travel in `t` seconds from a standing-ish start (optimistic, direction-agnostic). */
  reachDistance(t: number): number {
    const avail = t - REACTION;
    if (avail <= 0) return 0;
    const s = Math.min(this.speed, this.maxSpeed);
    const vmax = this.maxSpeed;
    const a = this.accel;
    const tA = (vmax - s) / a;
    if (avail < tA) return s * avail + 0.5 * a * avail * avail;
    return s * tA + 0.5 * a * tA * tA + vmax * (avail - tA);
  }

  /** Inverse of reachDistance: seconds needed to cover `d` metres. */
  timeToCover(d: number): number {
    const s = Math.min(this.speed, this.maxSpeed);
    const vmax = this.maxSpeed;
    const a = this.accel;
    const tA = (vmax - s) / a;
    const dA = s * tA + 0.5 * a * tA * tA;
    if (d <= dA) return REACTION + (-s + Math.sqrt(s * s + 2 * a * d)) / a;
    return REACTION + tA + (d - dA) / vmax;
  }

  timeTo(p: Vec): number {
    return this.timeToCover(hyp(p.x - this.pos.x, p.y - this.pos.y));
  }

  /** Steering towards `target` with acceleration limits and arrival braking. */
  move(dt: number, carrying: boolean, lookAt: Vec | null): void {
    this.prev = { ...this.pos };
    const dx = this.target.x - this.pos.x;
    const dy = this.target.y - this.pos.y;
    const d = hyp(dx, dy);
    let top = this.maxSpeed * clamp(this.intensity, 0.15, 1);
    if (carrying) top *= dribbleFactor(this.a.dribbling);
    const accel = this.accel;
    let desiredSpeed = Math.min(top, Math.sqrt(2 * accel * Math.max(0, d - 0.15)) * 0.95);
    if (d < 0.25) desiredSpeed = 0;
    const desired = d > 1e-6 ? { x: (dx / d) * desiredSpeed, y: (dy / d) * desiredSpeed } : vec();
    const dv = clampLen({ x: desired.x - this.vel.x, y: desired.y - this.vel.y }, accel * 1.4 * dt);
    this.vel.x += dv.x;
    this.vel.y += dv.y;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    const sp = this.speed;
    this.stats.distance += sp * dt;

    // Facing: along movement when running, towards the ball otherwise. Turning is rate-limited.
    const wanted = sp > 1.2 ? angleOf(this.vel) : lookAt ? Math.atan2(lookAt.y - this.pos.y, lookAt.x - this.pos.x) : this.facing;
    const maxTurn = (carrying ? 5 : 9) * dt;
    this.facing += clamp(angleDiff(this.facing, wanted), -maxTurn, maxTurn);

    // Fatigue: sprinting drains, walking recovers a little.
    const effort = sp / 7.5;
    const drain = 0.0009 * effort * effort * effort * (1.55 - this.a.stamina / 100) * (1 - 0.3 * this.team.coaching.fitness);
    this.energy = clamp(this.energy - drain * dt + (sp < 2 ? 0.00004 * dt : 0), 0.2, 1);

    if (this.kickCooldown > 0) this.kickCooldown -= dt;
    if (this.tackleCooldown > 0) this.tackleCooldown -= dt;
    if (this.runTimer > 0) this.runTimer -= dt;
  }
}
