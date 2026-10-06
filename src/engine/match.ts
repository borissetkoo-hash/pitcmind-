import { decideCarrier, shoot } from './ai/carrier';
import { CONTROL_RADIUS, isInOwnBox, offsideLineLocal, pressureOn, shotXg, threat } from './ai/evaluate';
import { keeperReach, startDive, updateKeeper } from './ai/goalkeeper';
import { type AIContext, computeChasers, updateTeamShape } from './ai/offball';
import { setPieceTargets } from './ai/setpieces';
import type { Option } from './ai/carrier';
import { Ball, type KickKind, predictTrajectory, stepBall } from './ball';
import { overall } from './attributes';
import { roleFit } from './formations';
import { GOAL_BOTTOM, GOAL_TOP, HALF_X, MID_Y, PITCH, clampToPitch, toLocal, toWorld } from './pitch';
import { Player } from './player';
import { computeRatings } from './ratings';
import { Rng } from './rng';
import { Team, type TeamStats } from './team';
import type { ClubData, CoachTraits, Tactics } from './types';
import { type Vec, angleDiff, clamp, dist, distToSegment, fromAngle, norm, sub, hyp } from './vec';

export type RestartType = 'kickoff' | 'throwIn' | 'goalKick' | 'corner' | 'freeKick' | 'penalty';
/** Context a kick is taken in: a set piece, a keeper distributing from his hands, or open play. */
export type KickContext = RestartType | 'hands' | null;
export type Phase = 'restart' | 'play' | 'goal' | 'fulltime';

export type EventType =
  | 'kickoff' | 'goal' | 'ownGoal' | 'shot' | 'save' | 'miss' | 'post' | 'blocked' | 'foul' | 'yellow' | 'red'
  | 'corner' | 'offside' | 'sub' | 'halftime' | 'fulltime' | 'penalty' | 'penaltyMiss' | 'bigChance' | 'secondHalf';

export interface MatchEvent {
  id: number;
  time: number;
  minute: string;
  type: EventType;
  team: 0 | 1 | null;
  player?: string;
  playerNumber?: number;
  other?: string;
  xg?: number;
  score: [number, number];
}

export type ShotOutcome = 'pending' | 'goal' | 'saved' | 'blocked' | 'off' | 'post';

export interface ShotRecord {
  id: number;
  team: 0 | 1;
  player: string;
  playerId: string;
  minute: number;
  x: number;
  y: number;
  xg: number;
  outcome: ShotOutcome;
  header: boolean;
  penalty: boolean;
}

export interface RestartState {
  type: RestartType;
  team: Team;
  spot: Vec;
  taker: Player;
  timer: number;
  minTime: number;
}

export interface KickSpec {
  kind: KickKind;
  to: Player | null;
  target: Vec;
  vel: Vec;
  vz: number;
  lofted: boolean;
  xg?: number;
  header?: boolean;
}

export interface MatchConfig {
  home: ClubData;
  away: ClubData;
  seed: number;
  homeTactics?: Tactics;
  awayTactics?: Tactics;
  /** Head coaches' attributes (1–20); omitted = neutral 10s. */
  homeCoach?: CoachTraits;
  awayCoach?: CoachTraits;
  /** Coarser time step for headless background simulation. */
  fast?: boolean;
}

export interface DebugInfo {
  carrier: Player;
  options: Option[];
  chosen: Option | null;
}

export interface MatchResult {
  home: string;
  away: string;
  score: [number, number];
  stats: [TeamStats, TeamStats];
  possession: [number, number];
  events: MatchEvent[];
  shots: ShotRecord[];
}

export const DT = 1 / 30;
/** Tempo instruction → multiplier on how long carriers take over each decision (0.5 = neutral). */
const tempoFactor = (tempo: number) => 1.3 - tempo * 0.6;
/** Background simulations (league rounds) use a coarser step: ~2x faster, same statistics. */
export const FAST_DT = 1 / 20;
const HALF_LENGTH = 45 * 60;
/** Team AI (shape, pressing, chasing) re-plans every 0.1 s of match time. */
const AI_PERIOD = 0.1;

export class Match {
  readonly dt: number;
  private readonly aiEvery: number;
  private readonly ticksPerSecond: number;
  readonly rng: Rng;
  readonly seed: number;
  readonly ball = new Ball();
  readonly teams: [Team, Team];

  tick = 0;
  /** Displayed match clock in seconds (second half starts at 45:00). */
  clock = 0;
  half: 1 | 2 = 1;
  halfElapsed = 0;
  added: [number, number] = [-1, -1];
  phase: Phase = 'restart';
  restart: RestartState | null = null;
  goalTimer = 0;
  pendingKickoff: Team | null = null;
  firstKickoff: Team;

  events: MatchEvent[] = [];
  shots: ShotRecord[] = [];
  /** Per-minute attacking threat accumulated by each team. */
  momentum: [number, number][] = [];
  debug: DebugInfo | null = null;
  ctx: AIContext = { traj: [], chasers: [null, null] };

  /** Predicted vs. actual outcome of every decided pass: used to calibrate the pass model. */
  passLog: { kind: string; predicted: number; ok: boolean | null }[] = [];
  dribbleLog: { predicted: number; ok: boolean | null }[] = [];
  pendingDribble: { p: Player; entry: { predicted: number; ok: boolean | null } } | null = null;
  private pendingPass: { kind: string; predicted: number; ok: boolean | null; team: Team } | null = null;
  private offsideFlags = new Set<Player>();
  private lastPass: { from: Player; to: Player; time: number } | null = null;
  private restartKick: RestartType | null = null;
  private eventId = 0;
  private listeners: ((e: MatchEvent) => void)[] = [];

  constructor(cfg: MatchConfig) {
    this.dt = cfg.fast ? FAST_DT : DT;
    this.aiEvery = Math.max(1, Math.round(AI_PERIOD / this.dt));
    this.ticksPerSecond = Math.round(1 / this.dt);
    this.seed = cfg.seed;
    this.rng = new Rng(cfg.seed);
    const home = new Team(0, cfg.home, cfg.homeTactics ?? cfg.home.tactics, 1, cfg.homeCoach);
    const away = new Team(1, cfg.away, cfg.awayTactics ?? cfg.away.tactics, -1, cfg.awayCoach);
    home.opponent = away;
    away.opponent = home;
    this.teams = [home, away];
    this.firstKickoff = this.rng.chance(0.5) ? home : away;
    this.setRestart('kickoff', this.firstKickoff, { x: HALF_X, y: MID_Y });
    this.placeForKickoff();
    this.emit('kickoff', this.firstKickoff.index);
  }

  onEvent(fn: (e: MatchEvent) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  get finished(): boolean {
    return this.phase === 'fulltime';
  }

  private allCache: Player[] = [];
  private allKey = '';

  get allPlayers(): Player[] {
    const key = `${this.teams[0].rosterVersion}:${this.teams[1].rosterVersion}`;
    if (key !== this.allKey || this.allCache.length === 0) {
      this.allCache = [...this.teams[0].active, ...this.teams[1].active];
      this.allKey = key;
    }
    return this.allCache;
  }

  get score(): [number, number] {
    return [this.teams[0].goals, this.teams[1].goals];
  }

  get minute(): number {
    return Math.floor(this.clock / 60);
  }

  minuteLabel(): string {
    const base = this.half === 1 ? 45 : 90;
    const m = Math.floor(this.clock / 60) + 1;
    if (m > base) return `${base}+${m - base}'`;
    return `${m}'`;
  }

  /** Possession share per team, 0 … 100. */
  possession(): [number, number] {
    const a = this.teams[0].stats.possessionTicks;
    const b = this.teams[1].stats.possessionTicks;
    const tot = a + b || 1;
    const h = Math.round((a / tot) * 100);
    return [h, 100 - h];
  }

  runToEnd(maxTicks = 400_000): MatchResult {
    let n = 0;
    while (!this.finished && n++ < maxTicks) this.step();
    return this.result();
  }

  result(): MatchResult {
    return {
      home: this.teams[0].club.id,
      away: this.teams[1].club.id,
      score: this.score,
      stats: [this.teams[0].stats, this.teams[1].stats],
      possession: this.possession(),
      events: this.events,
      shots: this.shots,
    };
  }

  setTactics(teamIndex: 0 | 1, t: Tactics): void {
    this.teams[teamIndex].setTactics(t);
  }

  // ───────────────────────────────────────────── main loop ──

  step(): void {
    if (this.phase === 'fulltime') return;
    const dt = this.dt;
    this.tick++;
    this.clock += dt;
    this.halfElapsed += dt;

    if (this.tick % this.aiEvery === 0) this.updateAI();

    if (this.phase === 'goal') {
      this.goalTimer -= dt;
      this.moveAll(dt);
      if (this.goalTimer <= 0 && this.pendingKickoff) {
        this.setRestart('kickoff', this.pendingKickoff, { x: HALF_X, y: MID_Y });
        this.pendingKickoff = null;
      }
    } else if (this.phase === 'restart') {
      this.stepRestart(dt);
    } else {
      this.stepPlay(dt);
    }

    this.sampleStats();
    this.checkClock();
  }

  private updateAI(): void {
    const ball = this.ball;
    if (this.phase === 'play') {
      this.ctx.traj = predictTrajectory(ball, 4, 0.1);
      this.ctx.chasers = computeChasers(this, this.ctx.traj);
      for (const team of this.teams) {
        updateTeamShape(this, team, this.ctx);
        const gk = team.keeper;
        if (gk) updateKeeper(this, gk, this.ctx);
      }
    } else if (this.phase === 'restart' && this.restart) {
      this.ctx.traj = [];
      this.ctx.chasers = [null, null];
      setPieceTargets(this, this.restart);
    } else if (this.phase === 'goal') {
      for (const p of this.allPlayers) {
        const l = toLocal(p.pos, p.team.dir);
        p.target = toWorld({ x: Math.min(l.x, HALF_X - 6), y: l.y }, p.team.dir);
        p.intensity = 0.35;
      }
    }
  }

  private moveAll(dt: number, carrier: Player | null = null): void {
    for (const p of this.allPlayers) {
      p.move(dt, p === carrier, this.ball.pos);
      if (p !== carrier) {
        p.pos.x = clamp(p.pos.x, -3, PITCH.length + 3);
        p.pos.y = clamp(p.pos.y, -3, PITCH.width + 3);
      }
    }
    this.separatePlayers();
  }

  /** Soft collision so players don't stack on top of each other. */
  private separatePlayers(): void {
    const ps = this.allPlayers;
    const minD = 0.75;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / 2;
          const ox = (dx / d) * push;
          const oy = (dy / d) * push;
          a.pos.x -= ox;
          a.pos.y -= oy;
          b.pos.x += ox;
          b.pos.y += oy;
        }
      }
    }
  }

  // ───────────────────────────────────────────── open play ──

  private stepPlay(dt: number): void {
    const ball = this.ball;
    const carrier = ball.owner;

    if (carrier) {
      carrier.possessionTime += dt;
      carrier.decisionTimer -= dt;
      const hands = carrier.isGK && isInOwnBox(carrier);
      if (carrier.decisionTimer <= 0) {
        const ctx: KickContext = this.restartKick ?? (hands ? 'hands' : null);
        decideCarrier(this, carrier, ctx);
        this.restartKick = null;
        if (ball.owner === carrier) carrier.decisionTimer = (0.4 + this.rng.next() * 0.5 - carrier.a.vision * 0.001) * tempoFactor(carrier.team.tactics.tempo) * this.counterTempo(carrier.team);
      }
      if (ball.owner === carrier) {
        if (hands) {
          carrier.target = { ...carrier.pos };
          carrier.intensity = 0.2;
        } else if (carrier.action) {
          carrier.target = carrier.action.target;
          carrier.intensity = carrier.action.type === 'hold' ? 0.4 : 0.95;
          if (dist(carrier.pos, carrier.action.target) < 1) carrier.decisionTimer = Math.min(carrier.decisionTimer, 0);
        }
      }
    }

    const owner = ball.owner;
    if (owner) this.applyBlocking(owner);
    this.moveAll(dt, owner);

    if (owner) {
      owner.pos.x = clamp(owner.pos.x, 0.4, PITCH.length - 0.4);
      owner.pos.y = clamp(owner.pos.y, 0.4, PITCH.width - 0.4);
      const f = fromAngle(owner.facing, 0.55);
      ball.prev = { ...ball.pos };
      ball.pos = { x: owner.pos.x + f.x, y: owner.pos.y + f.y };
      ball.vel = { ...owner.vel };
      ball.z = 0;
      ball.vz = 0;
      this.resolveTackles(owner, dt);
    } else {
      ball.update(dt);
      this.resolveContacts();
      if (this.phase === 'play' && !ball.owner) this.checkBallOut();
    }
  }

  /** True for a few seconds after a team wins the ball: the counter-attack window. */
  onCounter(team: Team): boolean {
    return this.clock - team.wonBallAt < 8;
  }

  /** Counter-attacking coaches release the ball quicker right after a turnover. */
  private counterTempo(team: Team): number {
    return this.onCounter(team) ? 1 - 0.2 * team.coaching.counter : 1;
  }

  /** A defender standing in the dribbler's path forces him to slow down and beat him. */
  private applyBlocking(carrier: Player): void {
    const fx = Math.cos(carrier.facing);
    const fy = Math.sin(carrier.facing);
    for (const o of carrier.team.opponent.active) {
      const dx = o.pos.x - carrier.pos.x;
      const dy = o.pos.y - carrier.pos.y;
      const d = hyp(dx, dy);
      if (d > 1.8 || d < 1e-6) continue;
      const ahead = (dx * fx + dy * fy) / d;
      if (ahead > 0.3) {
        const slow = 0.45 + (carrier.a.dribbling - o.a.tackling) / 300 + (1.8 - d) * -0.05;
        carrier.intensity = Math.min(carrier.intensity, clamp(slow, 0.25, 0.8));
      }
    }
  }

  kick(p: Player, spec: KickSpec): void {
    const ball = this.ball;
    const team = p.team;
    ball.owner = null;
    ball.vel = { ...spec.vel };
    ball.vz = spec.vz;
    ball.lastTouch = p;
    p.kickCooldown = 0.35;
    p.action = null;
    p.stats.touches++;
    const isShot = spec.kind === 'shot';
    let shotId = -1;
    if (isShot) {
      const xg = spec.xg ?? shotXg(p, !!spec.header);
      const l = toLocal(p.pos, team.dir);
      shotId = this.shots.length;
      this.shots.push({
        id: shotId, team: team.index, player: p.data.name, playerId: p.data.id, minute: this.minute, x: l.x, y: l.y,
        xg, outcome: 'pending', header: !!spec.header, penalty: this.restartKick === 'penalty',
      });
      team.stats.shots++;
      team.stats.xg += xg;
      p.stats.shots++;
      p.stats.xg += xg;
      if (this.lastPass && this.lastPass.to === p && this.clock - this.lastPass.time < 8) this.lastPass.from.stats.keyPasses++;
      if (xg > 0.3 && this.restartKick !== 'penalty') this.emit('bigChance', team.index, p, undefined, xg);
      if (this.restartKick === 'penalty') this.penaltyGuess(team.opponent.keeper);
    } else if (spec.kind === 'pass' || spec.kind === 'cross') {
      team.stats.passes++;
      p.stats.passes++;
    }
    this.settlePass(false);
    const chosen = this.debug?.carrier === p ? this.debug.chosen : null;
    if (chosen && !isShot && chosen.receiver) {
      const entry = { kind: chosen.kind, predicted: chosen.success, ok: null };
      this.passLog.push(entry);
      this.pendingPass = Object.assign(entry, { team });
    }
    ball.flight = {
      kind: isShot ? 'shot' : spec.kind, from: p, to: spec.to, target: spec.target, startTime: this.clock,
      xg: spec.xg ?? 0, shotId, lofted: spec.lofted, onTarget: isShot && this.headingIntoGoal(team.opponent),
    };
    // Offside is judged at the moment of the pass (never from throw-ins, corners or goal kicks).
    this.offsideFlags.clear();
    const exempt = this.restartKick === 'throwIn' || this.restartKick === 'corner' || this.restartKick === 'goalKick';
    if (!isShot && !exempt) {
      const line = offsideLineLocal(team.dir, team.opponent.active, ball.pos);
      for (const m of team.active) {
        if (m !== p && toLocal(m.pos, team.dir).x > line + 0.25) this.offsideFlags.add(m);
      }
    }
  }

  /** Would the ball, untouched, end up in `defending`'s net? (Decides "on target" for shots.) */
  private headingIntoGoal(defending: Team): boolean {
    const b = this.ball;
    const s = { pos: { ...b.pos }, z: b.z, vel: { ...b.vel }, vz: b.vz };
    const lineX = defending.dir === 1 ? 0 : PITCH.length;
    for (let i = 0; i < 120; i++) {
      const px = s.pos.x;
      const py = s.pos.y;
      const pz = s.z;
      stepBall(s, 1 / 60);
      if ((px - lineX) * (s.pos.x - lineX) <= 0) {
        const t = (lineX - px) / (s.pos.x - px || 1e-9);
        const y = py + (s.pos.y - py) * t;
        const z = pz + (s.z - pz) * t;
        return y > GOAL_TOP && y < GOAL_BOTTOM && z < PITCH.goalHeight;
      }
    }
    return false;
  }

  private penaltyGuess(gk: Player | undefined): void {
    if (!gk) return;
    const r = this.rng.next();
    if (r < 0.12) return; // stays in the middle
    const side = r < 0.56 ? GOAL_TOP + 1 : GOAL_BOTTOM - 1;
    const l = toLocal(gk.pos, gk.team.dir);
    startDive(gk, toWorld({ x: l.x, y: side }, gk.team.dir));
    gk.target = toWorld({ x: l.x, y: side }, gk.team.dir);
  }

  /** Defenders that were goal-side of the dribbler last tick (for take-on duels). */
  private goalSide = new Set<Player>();

  private resolveTackles(carrier: Player, dt: number): void {
    if (carrier.isGK && isInOwnBox(carrier)) return; // ball in the keeper's hands
    const ownGoal = toWorld({ x: 0, y: MID_Y }, carrier.team.opponent.dir);
    const gx = ownGoal.x - carrier.pos.x;
    const gy = ownGoal.y - carrier.pos.y;
    const gd = hyp(gx, gy) || 1;
    for (const o of carrier.team.opponent.active) {
      if (o.isGK) continue;
      // Take-on: the dribbler tries to go past a defender who was standing between him and goal.
      const dx = o.pos.x - carrier.pos.x;
      const dy = o.pos.y - carrier.pos.y;
      const od = hyp(dx, dy);
      const isGoalSide = od < 2.2 && (dx * gx + dy * gy) / (od * gd + 1e-9) > 0.2;
      const was = this.goalSide.has(o);
      if (isGoalSide) this.goalSide.add(o);
      else this.goalSide.delete(o);
      if (was && !isGoalSide && od < 2.4 && o.tackleCooldown <= 0) {
        const pBeat = clamp(0.42 + (carrier.a.dribbling - o.a.tackling) / 220 + (carrier.speed - o.speed) * 0.02 - o.team.coaching.organisation * 0.08, 0.15, 0.75);
        o.stats.tackles++;
        o.team.stats.tackles++;
        if (this.rng.chance(pBeat)) {
          carrier.stats.dribbles++;
          o.tackleCooldown = 1.2;
          o.vel = { x: o.vel.x * 0.3, y: o.vel.y * 0.3 };
        } else if (this.rng.chance(0.08 * (isInOwnBox(o, carrier.pos) ? 0.3 : 1))) {
          this.foul(o, carrier, true);
          return;
        } else {
          o.stats.tacklesWon++;
          o.team.stats.tacklesWon++;
          carrier.kickCooldown = 0.5;
          carrier.tackleCooldown = 0.6;
          this.gainPossession(o);
          return;
        }
      }
      if (o.tackleCooldown > 0) continue;
      // Tackles go for the ball, which sits half a metre in front of the dribbler.
      const d = Math.min(dist(o.pos, this.ball.pos), dist(o.pos, carrier.pos) + 0.3);
      if (d > 1.6) continue;
      const aggression = o.team.tactics.tackling;
      const rate = (0.35 + o.team.tactics.pressing * 0.15) * (0.6 + aggression * 0.8) * (1 + 0.2 * o.team.coaching.pressing) * dt;
      if (!this.rng.chance(rate)) continue;
      o.stats.tackles++;
      o.team.stats.tackles++;
      const toO = Math.atan2(o.pos.y - carrier.pos.y, o.pos.x - carrier.pos.x);
      const behind = Math.abs(angleDiff(carrier.facing, toO)) > 2.1;
      const pWin = clamp(0.58 + (aggression - 0.5) * 0.08 + o.team.coaching.pressing * 0.04 + (o.a.tackling - carrier.a.dribbling) / 260 - (behind ? 0.1 : 0) + (carrier.possessionTime < 0.4 ? 0.08 : 0), 0.15, 0.85);
      const careful = isInOwnBox(o, carrier.pos) ? 0.12 : 1; // nobody wants to give away a penalty
      const pFoul = clamp(0.025 + (behind ? 0.07 : 0) + (100 - o.a.tackling) / 1000 + (o.energy < 0.5 ? 0.03 : 0), 0.015, 0.3) * careful * (0.6 + aggression * 0.8);
      const r = this.rng.next();
      if (r < pFoul) {
        this.foul(o, carrier, behind);
        return;
      }
      if (r < pFoul + pWin) {
        o.stats.tacklesWon++;
        o.team.stats.tacklesWon++;
        carrier.tackleCooldown = 0.6;
        carrier.kickCooldown = 0.5;
        if (this.rng.chance(0.65)) {
          this.gainPossession(o);
        } else {
          this.ball.owner = null;
          this.ball.lastTouch = o;
          this.ball.flight = null;
          const a = this.rng.range(0, Math.PI * 2);
          this.ball.vel = fromAngle(a, this.rng.range(3, 7));
          o.kickCooldown = 0.25;
        }
        return;
      }
      o.tackleCooldown = 1.1;
      o.vel = { x: o.vel.x * 0.2, y: o.vel.y * 0.2 };
      carrier.stats.dribbles++;
    }
  }

  private foul(offender: Player, victim: Player, fromBehind: boolean): void {
    offender.stats.fouls++;
    offender.team.stats.fouls++;
    this.emit('foul', offender.team.index, offender, victim.data.name);
    const vl = toLocal(victim.pos, victim.team.dir);
    const dangerous = vl.x > 75 && Math.abs(vl.y - MID_Y) < 22;
    // Denying an obvious goal-scoring opportunity: central, near goal, no covering defender.
    const lastMan = vl.x > 82 && Math.abs(vl.y - MID_Y) < 14 &&
      offender.team.active.filter((p) => !p.isGK && p !== offender && toLocal(p.pos, victim.team.dir).x > vl.x).length === 0;
    const yellowP = (0.06 + (fromBehind ? 0.09 : 0) + (dangerous ? 0.07 : 0)) * (offender.yellow ? 0.4 : 1);
    const redP = 0.002 + (lastMan ? 0.1 : 0);
    if (this.rng.chance(redP)) this.sendOff(offender, false);
    else if (this.rng.chance(yellowP)) {
      offender.yellow++;
      offender.team.stats.yellows++;
      this.emit('yellow', offender.team.index, offender);
      if (offender.yellow >= 2) this.sendOff(offender, true);
    }
    const inBox = isInOwnBox(offender, victim.pos);
    if (inBox) {
      const spot = toWorld({ x: PITCH.length - PITCH.penaltySpot, y: MID_Y }, victim.team.dir);
      this.emit('penalty', victim.team.index, victim);
      this.setRestart('penalty', victim.team, spot);
    } else {
      this.setRestart('freeKick', victim.team, clampToPitch(victim.pos, 0.5));
    }
  }

  private sendOff(p: Player, secondYellow: boolean): void {
    p.onPitch = false;
    p.sentOff = true;
    p.leftAt = this.clock;
    p.team.rosterChanged();
    if (this.ball.owner === p) this.ball.owner = null;
    p.team.stats.reds++;
    this.emit('red', p.team.index, p, secondYellow ? 'second' : undefined);
  }

  /** Ball-player contacts for a free ball: controls, interceptions, headers, blocks and saves. */
  private resolveContacts(): void {
    const ball = this.ball;
    let best: { p: Player; t: number; d: number; z: number } | null = null;
    for (const p of this.allPlayers) {
      if (p.kickCooldown > 0) continue;
      const keeperZone = p.isGK && isInOwnBox(p, ball.pos);
      // Defenders throw bodies in front of shots: a slightly bigger blocking radius.
      const shotIncoming = this.ball.flight?.kind === 'shot' && this.ball.flight.from.team !== p.team;
      // Organised defences read passes and throw bodies in front of shots: a slightly bigger reach.
      const opponentBall = this.ball.flight && this.ball.flight.from.team !== p.team && this.ball.flight.kind !== 'deflection';
      const anticipation = opponentBall ? Math.max(0, 0.15 * p.team.coaching.organisation) : 0;
      const reach = keeperZone ? keeperReach(p) : (shotIncoming ? CONTROL_RADIUS + 0.1 : CONTROL_RADIUS) + anticipation;
      const seg = distToSegment(p.pos, ball.prev, ball.pos);
      if (seg.d > reach) continue;
      const z = ball.prevZ + (ball.z - ball.prevZ) * seg.t;
      const maxZ = keeperZone ? 2.7 : 2.1;
      if (z > maxZ) continue;
      if (!best || seg.t < best.t - 1e-6 || (Math.abs(seg.t - best.t) < 1e-6 && seg.d < best.d)) best = { p, t: seg.t, d: seg.d, z };
    }
    if (!best) return;
    const p = best.p;
    const f = ball.flight;
    const fromOpponentShot = f && f.kind === 'shot' && f.from.team !== p.team;

    if (p.isGK && isInOwnBox(p, ball.pos)) {
      this.keeperContact(p, !!fromOpponentShot && !!f?.onTarget);
      return;
    }

    if (fromOpponentShot) {
      // Outfield block.
      if (this.rng.chance(clamp(0.8 + 0.1 * p.team.coaching.organisation, 0.6, 0.95))) {
        this.resolveShot('blocked');
        this.emit('blocked', f.from.team.index, f.from, p.data.name);
        this.deflect(p, 0.35);
        return;
      }
      p.kickCooldown = 0.5;
      return;
    }

    if (best.z > 1.0) {
      this.header(p);
      return;
    }

    const rel = hyp(ball.vel.x - p.vel.x, ball.vel.y - p.vel.y);
    const hard = Math.max(0, (rel - 7) / 12);
    const fail = (0.02 + hard * hard * 0.28 + best.z * 0.12) * (1.45 - p.a.firstTouch / 100) * (1 - 0.25 * p.team.coaching.passing);
    const pControl = clamp(1 - fail, 0.1, 0.99);
    if (this.rng.chance(pControl)) this.gainPossession(p);
    else this.deflect(p, 0.45);
  }

  private keeperContact(gk: Player, isShot: boolean): void {
    const ball = this.ball;
    const speed = ball.speed;
    if (isShot) {
      const skill = gk.a.goalkeeping;
      // Reaction time is everything: close-range shots give the keeper almost no time.
      const flightTime = this.clock - ball.flight!.startTime;
      const reaction = 0.99 - 0.46 * Math.exp(-(flightTime - 0.08) / 0.3);
      const atBody = dist(gk.pos, ball.pos) < 0.7 ? 0.15 : 0;
      const pSave = clamp(reaction + atBody + (skill - 75) / 100 - (gk.dive ? 0.04 : 0), 0.08, 0.97);
      if (this.rng.chance(pSave)) {
        gk.stats.saves++;
        gk.team.stats.saves++;
        const shooter = ball.flight!.from;
        this.resolveShot('saved');
        this.emit('save', gk.team.index, gk, shooter.data.name);
        const pCatch = clamp(0.4 + skill / 250 - (speed - 15) * 0.025 + (ball.z < 1.4 ? 0.1 : 0), 0.1, 0.9);
        if (this.rng.chance(pCatch)) {
          this.gainPossession(gk, true);
        } else {
          // Parry: pushed away from goal, often wide.
          const base = gk.team.dir === 1 ? 0 : Math.PI;
          const side = ball.pos.y < MID_Y ? -1 : 1;
          const ang = base + side * gk.team.dir * this.rng.range(0.7, 1.45);
          ball.vel = fromAngle(ang, speed * this.rng.range(0.3, 0.5));
          ball.vz = this.rng.range(1, 4);
          ball.lastTouch = gk;
          ball.flight = { kind: 'deflection', from: gk, to: null, target: ball.pos, startTime: this.clock, xg: 0, shotId: -1, lofted: true };
          gk.kickCooldown = 0.6;
        }
      } else {
        gk.kickCooldown = 1; // beaten
      }
      return;
    }
    // Crosses and loose balls: claim most of them.
    const contested = this.teams[1 - gk.team.index].active.some((o) => dist(o.pos, ball.pos) < 1.5);
    if (this.rng.chance(contested ? 0.72 : 0.94)) this.gainPossession(gk, true);
    else this.deflect(gk, 0.6);
  }

  private header(first: Player): void {
    // Aerial duel with a nearby opponent: the better header (plus luck) wins it.
    let p = first;
    const rival = first.team.opponent.active.find((o) => !o.isGK && dist(o.pos, first.pos) < 1.6 && o.kickCooldown <= 0);
    if (rival) {
      const mine = first.a.heading + first.team.coaching.aerial * 8 + this.rng.normal(0, 18);
      const theirs = rival.a.heading + rival.team.coaching.aerial * 8 + this.rng.normal(0, 18);
      const loser = theirs > mine ? first : rival;
      p = theirs > mine ? rival : first;
      loser.kickCooldown = 0.5;
    }
    const team = p.team;
    const l = toLocal(p.pos, team.dir);
    if (this.offsideFlags.has(p)) {
      this.callOffside(p);
      return;
    }
    if (this.rng.chance(0.15 + (100 - p.a.heading) / 400 - team.coaching.aerial * 0.05)) {
      this.deflect(p, 0.5);
      return;
    }
    const inAttBox = l.x > PITCH.length - PITCH.boxDepth - 1 && Math.abs(l.y - MID_Y) < PITCH.boxWidth / 2;
    this.completePassIfAny(p);
    if (inAttBox) {
      const xg = shotXg(p, true);
      // Only go for goal with a real chance; otherwise nod it down for a teammate.
      if (xg > 0.06 || this.rng.chance(xg * 8)) {
        shoot(this, p, false, xg, false, true);
        return;
      }
    }
    if (l.x < PITCH.boxDepth + 2 && this.rng.chance(0.3)) {
      // Glancing defensive header: often ends up behind for a corner.
      const behind = toWorld({ x: -5, y: l.y + this.rng.normal(0, 8) }, team.dir);
      const v = norm(sub(behind, p.pos));
      this.kick(p, { kind: 'clear', to: null, target: behind, vel: { x: v.x * 15, y: v.y * 15 }, vz: 4, lofted: true });
      return;
    }
    if (l.x < 35) {
      // Defensive header: clear it high and wide.
      const tgt = toWorld({ x: l.x + 25, y: l.y < MID_Y ? l.y - 8 : l.y + 8 }, team.dir);
      const v = norm(sub(tgt, p.pos));
      this.kick(p, { kind: 'clear', to: null, target: tgt, vel: { x: v.x * 13, y: v.y * 13 }, vz: 6, lofted: true });
      return;
    }
    // Knock it down / on to a teammate ahead.
    const mates = team.active.filter((m) => m !== p && !m.isGK && dist(m.pos, p.pos) < 22);
    mates.sort((a, b) => toLocal(b.pos, team.dir).x - toLocal(a.pos, team.dir).x);
    const tgt = mates[0]?.pos ?? toWorld({ x: l.x + 15, y: l.y }, team.dir);
    const v = norm(sub(tgt, p.pos));
    const sp = clamp(dist(tgt, p.pos) * 0.7, 6, 13);
    this.kick(p, { kind: 'pass', to: mates[0] ?? null, target: tgt, vel: { x: v.x * sp, y: v.y * sp }, vz: 2.5, lofted: true });
  }

  private deflect(p: Player, keep: number): void {
    const ball = this.ball;
    const sp = ball.speed * keep;
    const ang = Math.atan2(ball.vel.y, ball.vel.x) + this.rng.normal(0, 0.9);
    if (ball.flight?.kind === 'shot') this.resolveShot(p.isGK ? 'off' : 'blocked');
    // Defenders blocking crosses and shots near their own goal mostly send it behind.
    const own = toLocal(p.pos, p.team.dir);
    const fk = ball.flight?.kind;
    if ((fk === 'cross' || fk === 'shot') && ball.flight!.from.team !== p.team && own.x < 25 && this.rng.chance(0.55)) {
      const target = toWorld({ x: -4, y: own.y + this.rng.normal(0, 6) }, p.team.dir);
      const v = norm(sub(target, ball.pos));
      ball.vel = { x: v.x * Math.max(6, sp), y: v.y * Math.max(6, sp) };
      ball.vz = this.rng.range(0.5, 3);
      ball.lastTouch = p;
      p.kickCooldown = 0.4;
      ball.flight = { kind: 'deflection', from: p, to: null, target, startTime: this.clock, xg: 0, shotId: -1, lofted: true };
      this.settlePass(false);
      return;
    }
    if (this.pendingPass && this.pendingPass.team !== p.team) this.settlePass(false);
    ball.vel = fromAngle(ang, sp);
    ball.vz = Math.max(ball.vz * 0.3, this.rng.range(0, 1.5));
    ball.lastTouch = p;
    p.kickCooldown = 0.4;
    p.stats.touches++;
    if (ball.flight && ball.flight.from.team !== p.team) this.offsideFlags.clear();
    ball.flight = { kind: 'deflection', from: p, to: null, target: ball.pos, startTime: this.clock, xg: 0, shotId: -1, lofted: false };
  }

  private settlePass(ok: boolean): void {
    if (this.pendingPass && this.pendingPass.ok === null) this.pendingPass.ok = ok;
    this.pendingPass = null;
  }

  private completePassIfAny(p: Player): void {
    const f = this.ball.flight;
    if (f && f.from.team === p.team && f.from !== p) this.settlePass(true);
    else this.settlePass(false);
    if (!f || f.kind === 'shot' || f.kind === 'deflection') return;
    if (f.from.team === p.team && f.from !== p) {
      if (f.kind === 'pass' || f.kind === 'cross') {
        f.from.stats.passesCompleted++;
        p.team.stats.passesCompleted++;
      }
      this.lastPass = { from: f.from, to: p, time: this.clock };
    } else if (f.from.team !== p.team && (f.kind === 'pass' || f.kind === 'cross')) {
      p.stats.interceptions++;
      p.team.stats.interceptions++;
    }
  }

  private gainPossession(p: Player, hands = false): void {
    const ball = this.ball;
    if (this.pendingDribble && this.pendingDribble.p !== p) {
      if (this.pendingDribble.p.team !== p.team) this.pendingDribble.entry.ok = false;
      this.pendingDribble = null;
    }
    if (this.offsideFlags.has(p)) {
      this.callOffside(p);
      return;
    }
    this.completePassIfAny(p);
    if (ball.flight?.kind === 'shot') this.resolveShot('off');
    if (ball.lastTouch && ball.lastTouch.team !== p.team) {
      this.lastPass = null;
      p.team.wonBallAt = this.clock;
    }
    ball.owner = p;
    ball.lastTouch = p;
    ball.flight = null;
    ball.z = 0;
    ball.vz = 0;
    this.offsideFlags.clear();
    p.possessionTime = 0;
    p.stats.touches++;
    // Time to control and look up; good first touch buys time, pressure forces a quicker release.
    const settle = 0.25 + this.rng.next() * 0.55 * (1.3 - p.a.firstTouch / 100);
    p.decisionTimer = hands ? 1.2 + this.rng.next() * 1.5 : settle * (1 - pressureOn(p) * 0.5) * tempoFactor(p.team.tactics.tempo);
    p.action = { type: 'dribble', target: toWorld({ x: toLocal(p.pos, p.team.dir).x + 4, y: toLocal(p.pos, p.team.dir).y }, p.team.dir) };
    p.dive = null;
  }

  private callOffside(p: Player): void {
    p.team.stats.offsides++;
    this.emit('offside', p.team.index, p);
    this.offsideFlags.clear();
    this.setRestart('freeKick', p.team.opponent, clampToPitch(p.pos, 0.5));
  }

  private resolveShot(outcome: ShotOutcome): void {
    const f = this.ball.flight;
    if (!f || f.shotId < 0) return;
    const s = this.shots[f.shotId];
    if (s.outcome !== 'pending') return;
    s.outcome = outcome;
    if (outcome === 'goal' || outcome === 'saved') {
      this.teams[s.team].stats.shotsOnTarget++;
      f.from.stats.shotsOnTarget++;
    }
  }

  private checkBallOut(): void {
    const ball = this.ball;
    const { pos, prev } = ball;
    if (pos.x < 0 || pos.x > PITCH.length) {
      const lineX = pos.x < 0 ? 0 : PITCH.length;
      const tt = (lineX - prev.x) / (pos.x - prev.x || 1e-9);
      const yc = prev.y + (pos.y - prev.y) * tt;
      const zc = ball.prevZ + (ball.z - ball.prevZ) * tt;
      // Woodwork.
      const nearPost = Math.min(Math.abs(yc - GOAL_TOP), Math.abs(yc - GOAL_BOTTOM)) < PITCH.postRadius + 0.11;
      const nearBar = yc > GOAL_TOP && yc < GOAL_BOTTOM && Math.abs(zc - PITCH.goalHeight) < 0.14;
      if ((nearPost && zc < PITCH.goalHeight) || nearBar) {
        const f = ball.flight;
        if (f?.kind === 'shot') {
          this.resolveShot('post');
          this.emit('post', f.from.team.index, f.from);
        }
        ball.pos.x = lineX + (lineX === 0 ? 0.2 : -0.2);
        ball.vel.x = -ball.vel.x * 0.55;
        ball.vel.y += this.rng.normal(0, 2);
        if (nearBar) ball.vz = -Math.abs(ball.vz) * 0.4;
        ball.flight = { kind: 'deflection', from: ball.lastTouch!, to: null, target: ball.pos, startTime: this.clock, xg: 0, shotId: -1, lofted: true };
        this.offsideFlags.clear();
        return;
      }
      const defending = this.teams.find((t) => toLocal({ x: lineX, y: 0 }, t.dir).x === 0)!;
      const attacking = defending.opponent;
      if (yc > GOAL_TOP && yc < GOAL_BOTTOM && zc < PITCH.goalHeight) {
        this.goal(attacking);
        return;
      }
      if (ball.flight?.kind === 'shot') {
        const f = ball.flight;
        this.resolveShot('off');
        this.emit('miss', f.from.team.index, f.from, undefined, this.shots[f.shotId]?.xg);
      }
      const last = ball.lastTouch;
      if (last && last.team === defending) {
        attacking.stats.corners++;
        const cy = yc < MID_Y ? 0.6 : PITCH.width - 0.6;
        const cx = lineX === 0 ? 0.6 : PITCH.length - 0.6;
        this.emit('corner', attacking.index, null);
        this.setRestart('corner', attacking, { x: cx, y: cy });
      } else {
        const gx = toWorld({ x: PITCH.sixDepth, y: yc < MID_Y ? MID_Y - 7 : MID_Y + 7 }, defending.dir);
        this.setRestart('goalKick', defending, gx);
      }
      return;
    }
    if (pos.y < 0 || pos.y > PITCH.width) {
      const last = ball.lastTouch;
      const team = last ? last.team.opponent : this.teams[0];
      if (ball.flight?.kind === 'shot') this.resolveShot('off');
      this.setRestart('throwIn', team, { x: clamp(pos.x, 1, PITCH.length - 1), y: pos.y < 0 ? 0.2 : PITCH.width - 0.2 });
    }
  }

  private goal(scoringTeam: Team): void {
    const ball = this.ball;
    const last = ball.lastTouch;
    const own = !!last && last.team !== scoringTeam;
    if (ball.flight?.kind === 'shot' && !own) this.resolveShot('goal');
    scoringTeam.goals++;
    if (last && !own) {
      last.stats.goals++;
      let assist: Player | undefined;
      if (this.lastPass && this.lastPass.to === last && this.lastPass.from.team === scoringTeam && this.clock - this.lastPass.time < 12) {
        assist = this.lastPass.from;
        assist.stats.assists++;
      }
      this.emit('goal', scoringTeam.index, last, assist?.data.name);
    } else if (last) {
      this.emit('ownGoal', scoringTeam.index, last);
    }
    this.lastPass = null;
    this.offsideFlags.clear();
    ball.flight = null;
    ball.vel = { x: ball.vel.x * 0.1, y: ball.vel.y * 0.1 };
    ball.vz = 0;
    ball.z = 0;
    this.phase = 'goal';
    this.goalTimer = 4.5;
    this.pendingKickoff = scoringTeam.opponent;
    for (const p of this.allPlayers) p.dive = null;
  }

  // ───────────────────────────────────────────── set pieces ──

  setRestart(type: RestartType, team: Team, spot: Vec): void {
    const ball = this.ball;
    this.settlePass(false);
    ball.owner = null;
    ball.place(spot);
    this.offsideFlags.clear();
    this.phase = 'restart';
    for (const p of this.allPlayers) {
      p.action = null;
      p.dive = null;
      p.runTimer = 0;
    }
    if (type !== 'penalty' && type !== 'kickoff' && this.half === 2) {
      for (const t of this.teams) this.autoSubs(t);
    }
    // Real football loses ~35 minutes to dead balls. Instead of simulating players standing around,
    // the clock skips that time, so ball-in-play minutes and event rates stay realistic.
    this.skipDeadTime(type);
    const taker = this.chooseTaker(type, team, spot);
    const minTime = { kickoff: 1.5, throwIn: 1.2, goalKick: 2.2, corner: 3.2, freeKick: 2.2, penalty: 3.5 }[type];
    this.restart = { type, team, spot, taker, timer: 0, minTime };
    if (type === 'kickoff') this.lastPass = null;
  }

  private skipDeadTime(type: RestartType): void {
    const ranges: Record<RestartType, [number, number]> = {
      kickoff: [0, 0], throwIn: [8, 18], goalKick: [18, 32], corner: [24, 40], freeKick: [18, 40], penalty: [50, 80],
    };
    let [lo, hi] = ranges[type];
    if (type === 'kickoff' && this.events.length && this.events[this.events.length - 1].type.endsWith('oal')) [lo, hi] = [40, 65];
    const skip = this.rng.range(lo, hi);
    this.clock += skip;
    this.halfElapsed += skip;
  }

  private chooseTaker(type: RestartType, team: Team, spot: Vec): Player {
    const field = team.active.filter((p) => !p.isGK);
    const by = (score: (p: Player) => number) => [...field].sort((a, b) => score(b) - score(a))[0] ?? team.active[0];
    switch (type) {
      case 'goalKick':
        return team.keeper ?? by((p) => -dist(p.pos, spot));
      case 'penalty':
        return by((p) => p.a.shooting + p.a.composure);
      case 'corner':
        return by((p) => p.a.passing + p.a.vision - (p.role === 'CB' || p.role === 'ST' ? 60 : 0));
      case 'kickoff':
        return by((p) => (p.role === 'ST' || p.role === 'AM' ? 100 : 0) - dist(p.pos, spot));
      case 'freeKick': {
        const l = toLocal(spot, team.dir);
        if (PITCH.length - l.x < 32 && Math.abs(l.y - MID_Y) < 18) return by((p) => p.a.shooting + p.a.passing * 0.5 - dist(p.pos, spot) * 0.5);
        return by((p) => -dist(p.pos, spot) + (p.role === 'CB' && l.x < 40 ? 6 : 0));
      }
      default:
        return by((p) => -dist(p.pos, spot) + (['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM'].includes(p.role) ? 5 : 0));
    }
  }

  private stepRestart(dt: number): void {
    const r = this.restart!;
    r.timer += dt;
    this.moveAll(dt);
    this.ball.pos = { ...r.spot };
    this.ball.prev = { ...r.spot };
    const ready = r.timer >= r.minTime && dist(r.taker.pos, r.spot) < 1.2;
    if (r.timer > r.minTime + 5 && !ready) r.taker.pos = { ...r.spot };
    if (ready || r.timer > r.minTime + 5) {
      const taker = r.taker;
      this.phase = 'play';
      this.restart = null;
      this.ball.owner = taker;
      this.ball.lastTouch = taker;
      this.restartKick = r.type;
      taker.possessionTime = 0;
      taker.decisionTimer = 0;
      const ctx: KickContext = r.type;
      decideCarrier(this, taker, ctx);
      this.restartKick = null;
      if (this.ball.owner === taker) {
        // Defensive fallback: never leave a set piece hanging.
        this.ball.owner = null;
        this.ball.vel = { x: taker.team.dir * 8, y: 0 };
      }
    }
  }

  /** Sets every player to a legal kick-off position instantly (start of each half). */
  placeForKickoff(): void {
    if (!this.restart) return;
    setPieceTargets(this, this.restart);
    for (const p of this.allPlayers) {
      p.pos = { ...p.target };
      p.prev = { ...p.target };
      p.vel = { x: 0, y: 0 };
    }
    this.restart.taker.pos = { x: this.restart.spot.x - this.restart.team.dir * 0.4, y: this.restart.spot.y };
  }

  private autoSubs(team: Team): void {
    if (team.subsLeft <= 0 || this.minute < 56) return;
    let made = 0;
    const tired = team.active.filter((p) => !p.isGK && p.enteredAt === 0).sort((a, b) => a.energy - b.energy);
    for (const p of tired) {
      if (made >= 2 || team.subsLeft <= 0) break;
      const late = this.minute >= 70 && this.rng.chance(0.25);
      if (p.energy > 0.66 && !late) continue;
      const bench = team.bench.filter((b) => b.position !== 'GK');
      if (!bench.length) return;
      bench.sort((a, b) => overall(b.attrs, p.role) * roleFit(b.position, p.role) - overall(a.attrs, p.role) * roleFit(a.position, p.role));
      const inData = bench[0];
      team.bench = team.bench.filter((b) => b !== inData);
      const np = new Player(inData, team, p.role, p.slot, { ...p.pos });
      np.enteredAt = this.clock;
      p.onPitch = false;
      p.leftAt = this.clock;
      team.players.push(np);
      team.rosterChanged();
      team.subsLeft--;
      made++;
      this.emit('sub', team.index, np, p.data.name);
    }
  }

  // ───────────────────────────────────────────── clock & stats ──

  private checkClock(): void {
    if (this.halfElapsed >= HALF_LENGTH && this.added[this.half - 1] < 0) {
      const goals = this.events.filter((e) => e.type === 'goal' && (this.half === 1 ? e.time < HALF_LENGTH : true)).length;
      const subs = this.events.filter((e) => e.type === 'sub').length;
      const base = this.half === 1 ? 1 : 2;
      this.added[this.half - 1] = Math.min(8, Math.round(base + goals * 0.4 + subs * 0.25 + this.rng.range(0, 2)));
    }
    const add = this.added[this.half - 1];
    if (add < 0 || this.halfElapsed < HALF_LENGTH + add * 60) return;
    // Don't blow the whistle in the middle of an attack in the box.
    if (this.phase === 'play' && this.ball.owner) {
      const l = toLocal(this.ball.pos, this.ball.owner.team.dir);
      if (l.x > 80 && this.halfElapsed < HALF_LENGTH + add * 60 + 20) return;
    }
    if (this.phase === 'goal') return;
    if (this.half === 1) {
      this.emit('halftime', null);
      this.half = 2;
      this.halfElapsed = 0;
      this.clock = HALF_LENGTH;
      for (const t of this.teams) {
        t.dir = t.dir === 1 ? -1 : 1;
        for (const p of t.active) p.energy = Math.min(1, p.energy + 0.12);
      }
      this.ball.flight = null;
      this.setRestart('kickoff', this.firstKickoff.opponent, { x: HALF_X, y: MID_Y });
      this.placeForKickoff();
      this.emit('secondHalf', this.firstKickoff.opponent.index);
    } else {
      this.phase = 'fulltime';
      this.ball.owner = null;
      for (const t of this.teams) for (const p of t.players) p.stats.minutes = Math.round(((p.leftAt ?? this.clock) - p.enteredAt) / 60);
      computeRatings(this);
      this.emit('fulltime', null);
    }
  }

  private sampleStats(): void {
    if (this.phase !== 'play') return;
    const ball = this.ball;
    const holder = ball.owner?.team ?? ball.lastTouch?.team;
    if (holder) holder.stats.possessionTicks++;
    if (this.tick % (this.ticksPerSecond / 2) === 0 && holder) {
      const m = Math.min(this.minute, 120);
      while (this.momentum.length <= m) this.momentum.push([0, 0]);
      const l = toLocal(ball.pos, holder.dir);
      this.momentum[m][holder.index] += threat(l.x, l.y);
    }
    if (this.tick % this.ticksPerSecond === 0) {
      for (const p of this.allPlayers) {
        const l = toLocal(p.pos, p.team.dir);
        const gx = clamp(Math.floor((l.x / PITCH.length) * 21), 0, 20);
        const gy = clamp(Math.floor((l.y / PITCH.width) * 14), 0, 13);
        if (p.heat.length === 0) p.heat = new Array(21 * 14).fill(0);
        p.heat[gy * 21 + gx]++;
      }
    }
  }

  emit(type: EventType, team: 0 | 1 | null, p?: Player | null, other?: string, xg?: number): void {
    const e: MatchEvent = {
      id: this.eventId++,
      time: this.clock,
      minute: this.minuteLabel(),
      type,
      team,
      player: p?.data.name,
      playerNumber: p?.data.number,
      other,
      xg,
      score: this.score,
    };
    this.events.push(e);
    for (const l of this.listeners) l(e);
  }
}
