import type { TrajectoryPoint } from '../ball';
import type { Match } from '../match';
import { MID_Y, PITCH, clampToPitch, toLocal, toWorld } from '../pitch';
import type { Player } from '../player';
import type { Team } from '../team';
import { ROLE_LINE } from '../types';
import { type Vec, clamp, dist, distToSegment, lerp, norm, sub, hyp } from '../vec';
import { CONTROL_RADIUS, offsideLineLocal } from './evaluate';

export interface AIContext {
  traj: TrajectoryPoint[];
  /** Fastest player of each team to a loose ball, with where/when they meet it. */
  chasers: [Intercept | null, Intercept | null];
}

export interface Intercept {
  player: Player;
  t: number;
  point: Vec;
}

/** Earliest point on the predicted ball path this player can reach in time. */
export function interceptFor(p: Player, traj: TrajectoryPoint[], maxZ: number): Intercept {
  // Inlined Player.reachDistance with the kinematics hoisted out of the loop (hot path).
  const v0 = Math.min(p.speed, p.maxSpeed);
  const vmax = p.maxSpeed;
  const a = p.accel;
  const tA = (vmax - v0) / a;
  const dA = v0 * tA + 0.5 * a * tA * tA;
  const px = p.pos.x;
  const py = p.pos.y;
  // Cheap reject: can't reach any point of the path within the horizon.
  const end = traj[traj.length - 1];
  const maxReach = dA + vmax * Math.max(0, end.t - 0.2 - tA) + CONTROL_RADIUS + 2;
  const d0 = hyp(traj[0].x - px, traj[0].y - py);
  const d1 = hyp(end.x - px, end.y - py);
  if (d0 > maxReach + 40 && d1 > maxReach) {
    return { player: p, t: end.t + (d1 - maxReach) / vmax + 1, point: { x: end.x, y: end.y } };
  }
  for (let i = 0; i < traj.length; i++) {
    const s = traj[i];
    if (s.z > maxZ) continue;
    const d = hyp(s.x - px, s.y - py) - CONTROL_RADIUS;
    const avail = s.t - 0.2;
    let reach = 0;
    if (avail > 0) reach = avail < tA ? v0 * avail + 0.5 * a * avail * avail : dA + vmax * (avail - tA);
    if (d <= reach) return { player: p, t: s.t, point: { x: s.x, y: s.y } };
  }
  const last = traj[traj.length - 1];
  const point = { x: last.x, y: last.y };
  return { player: p, t: Math.max(last.t, p.timeTo(point)), point };
}

export function computeChasers(match: Match, traj: TrajectoryPoint[]): [Intercept | null, Intercept | null] {
  const ball = match.ball;
  const out: [Intercept | null, Intercept | null] = [null, null];
  if (ball.owner) return out;
  for (const team of match.teams) {
    let best: Intercept | null = null;
    const designated = ball.flight?.to && ball.flight.to.team === team && ball.flight.kind !== 'shot' ? ball.flight.to : null;
    for (const p of team.active) {
      if (p.kickCooldown > 0.15 && p === ball.lastTouch) continue;
      const ic = interceptFor(p, traj, p.isGK ? 2.4 : 2.0);
      if (p.isGK) {
        const l = toLocal(ic.point, team.dir);
        const inBox = l.x < PITCH.boxDepth && Math.abs(l.y - MID_Y) < PITCH.boxWidth / 2;
        if (!inBox) continue;
        ic.t -= 0.3; // keepers command their box
      }
      if (designated === p) ic.t -= 0.6; // the intended receiver goes for it
      if (!best || ic.t < best.t) best = ic;
    }
    out[team.index] = best;
  }
  return out;
}

/**
 * The team's block: formation slots stretched/compressed and slid towards the ball.
 * Returned in the team's local frame.
 */
export function baseShape(team: Team, ballPos: Vec, inPoss: boolean, offLine: number): Map<Player, Vec> {
  const t = team.tactics;
  const m = t.mentality;
  const ballL = toLocal(ballPos, team.dir);
  let anchor: number;
  let depth: number;
  let width: number;
  let shift: number;
  if (inPoss) {
    anchor = clamp(ballL.x + 4 + m * 3, 30, 80);
    depth = 50 + m * 3;
    width = 44 + t.width * 20;
    shift = 0.22;
  } else {
    // Well-organised teams defend in a tighter, narrower block.
    const org = team.coaching.organisation;
    anchor = clamp(ballL.x - 12 + t.lineHeight * 14 + m * 3, 22, 66);
    depth = 31 + (1 - t.pressing) * 4 - org * 3;
    // Near our own box the block narrows to protect the goal mouth.
    width = 36 + t.width * 4 - (ballL.x < 35 ? 8 : 0) - org * 6;
    shift = ballL.x < 35 ? 0.3 : 0.42;
  }
  const shape = new Map<Player, Vec>();
  for (const p of team.active) {
    if (p.isGK) continue;
    const s = team.slots[p.slot] ?? { x: 0.5, y: 0.5 };
    let x = anchor + (s.x - 0.5) * depth;
    let y = MID_Y + (s.y - 0.5) * width + (ballL.y - MID_Y) * shift;
    const line = ROLE_LINE[p.role];
    if (inPoss && (p.role === 'LB' || p.role === 'RB' || p.role === 'LWB' || p.role === 'RWB')) x += 3 + m * 3;
    if (!inPoss && line === 'def') x = Math.min(x, Math.max(ballL.x - 2, 5));
    if (inPoss && (line === 'att' || line === 'mid')) x = Math.min(x, offLine - 0.8);
    x = clamp(x, 4, PITCH.length - 3);
    y = clamp(y, 2, PITCH.width - 2);
    shape.set(p, { x, y });
  }
  return shape;
}

/** Updates targets for every outfield player of a team (keepers are handled separately). */
export function updateTeamShape(match: Match, team: Team, ctx: AIContext): void {
  const ball = match.ball;
  const dir = team.dir;
  const ballL = toLocal(ball.pos, dir);
  const carrier = ball.owner;
  const flightFromUs = ball.flight && ball.flight.from.team === team && ball.flight.kind !== 'shot';
  const inPoss = carrier ? carrier.team === team : !!flightFromUs;
  const opp = team.opponent;
  const offLine = offsideLineLocal(dir, opp.active, ball.pos);

  const outfield = team.active.filter((p) => !p.isGK);
  const shape = baseShape(team, ball.pos, inPoss, offLine);

  // A flat back line out of possession: defenders step up/drop together.
  if (!inPoss) {
    const defs = outfield.filter((p) => ROLE_LINE[p.role] === 'def');
    if (defs.length) {
      const line = Math.min(...defs.map((p) => shape.get(p)!.x));
      for (const p of defs) shape.get(p)!.x = line + (p.role === 'LWB' || p.role === 'RWB' ? 1.5 : 0);
    }
  }

  // Crosses incoming: attackers attack the box.
  const wideFinalThird = inPoss && ballL.x > 76 && Math.abs(ballL.y - MID_Y) > 13;
  if (wideFinalThird) {
    const nearSide = ballL.y < MID_Y ? -1 : 1;
    const spots: Vec[] = [
      { x: 99.5, y: MID_Y + nearSide * 3 },
      { x: 93.5, y: MID_Y },
      { x: 98.5, y: MID_Y - nearSide * 4.5 },
      { x: 88, y: MID_Y - nearSide * 6 },
    ];
    const attackers = outfield
      .filter((p) => p !== carrier && (ROLE_LINE[p.role] === 'att' || p.role === 'AM' || p.role === 'CM'))
      .sort((a, b) => toLocal(b.pos, dir).x - toLocal(a.pos, dir).x);
    attackers.slice(0, spots.length).forEach((p, i) => shape.set(p, spots[i]));
  }

  for (const p of outfield) {
    const sl = shape.get(p)!;
    p.target = toWorld(sl, dir);
    const d = dist(p.pos, p.target);
    // Walk when roughly in position, jog to adjust, run only when badly out of shape.
    p.intensity = inPoss
      ? d > 15 ? 0.75 : d > 7 ? 0.5 : d > 2.5 ? 0.33 : 0.18
      : d > 10 ? 0.85 : d > 4 ? 0.62 : d > 1.5 ? 0.42 : 0.22; // out of possession: shuffle actively
    // Recovery runs: get goal-side of the ball quickly when we lose it.
    if (!inPoss && toLocal(p.pos, dir).x > ballL.x + 5 && ROLE_LINE[p.role] !== 'att') p.intensity = 0.95;
  }

  if (inPoss) attackingMovement(match, team, ctx, outfield, offLine);
  else defendingMovement(match, team, outfield);

  // Loose ball: our fastest man goes for it.
  const chase = ctx.chasers[team.index];
  if (!carrier && chase && !chase.player.isGK) {
    chase.player.target = clampToPitch(chase.point, -0.5);
    chase.player.intensity = 1;
  }
}

function attackingMovement(match: Match, team: Team, _ctx: AIContext, outfield: Player[], offLine: number): void {
  const ball = match.ball;
  const carrier = ball.owner;
  const dir = team.dir;
  if (!carrier || carrier.team !== team) return;
  const cl = toLocal(carrier.pos, dir);
  const opp = team.opponent.active;

  // Forward runs in behind, timed off the offside line.
  for (const p of outfield) {
    if (p === carrier) continue;
    const line = ROLE_LINE[p.role];
    const runner = line === 'att' || p.role === 'AM' || ((p.role === 'LWB' || p.role === 'RWB') && team.tactics.mentality > 0);
    if (!runner || cl.x < 35) continue;
    const counterRuns = match.onCounter(team) ? 1 + 0.8 * team.coaching.counter : 1;
    if (p.runTimer <= 0 && match.rng.chance((0.012 + team.tactics.mentality * 0.003) * Math.max(0.2, counterRuns))) p.runTimer = 2.2 + match.rng.next();
    if (p.runTimer > 0) {
      const pl = toLocal(p.pos, dir);
      const goalPull = (MID_Y - pl.y) * 0.25;
      const tl = { x: Math.min(offLine + 14, PITCH.length - 6), y: clamp(pl.y + goalPull, 4, PITCH.width - 4) };
      p.target = toWorld(tl, dir);
      p.intensity = 1;
    }
  }

  // Two nearest teammates offer short options at open angles.
  const supporters = outfield
    .filter((p) => p !== carrier && p.runTimer <= 0)
    .sort((a, b) => dist(a.pos, carrier.pos) - dist(b.pos, carrier.pos))
    .slice(0, 2);
  const taken: Vec[] = [];
  for (const s of supporters) {
    let best: Vec | null = null;
    let bestScore = -Infinity;
    for (const ang of [-2.1, -1.2, -0.6, 0, 0.6, 1.2, 2.1]) {
      const r = 11;
      const cand = clampToPitch({ x: cl.x + Math.cos(ang) * r, y: cl.y + Math.sin(ang) * r }, 2);
      if (cand.x > offLine - 0.8) continue;
      const cw = toWorld(cand, dir);
      let open = 8;
      let lane = 8;
      for (const o of opp) {
        open = Math.min(open, dist(o.pos, cw));
        lane = Math.min(lane, distToSegment(o.pos, carrier.pos, cw).d);
      }
      const shapeW = s.target;
      const drift = dist(cw, shapeW);
      const crowd = taken.reduce((acc, tk) => acc + (dist(tk, cw) < 6 ? 5 : 0), 0);
      const score = open * 0.6 + lane * 0.9 + (cand.x - cl.x) * 0.08 - drift * 0.12 - crowd;
      if (score > bestScore) {
        bestScore = score;
        best = cw;
      }
    }
    if (best) {
      taken.push(best);
      s.target = lerp(s.target, best, 0.75);
      s.intensity = Math.max(s.intensity, 0.7);
    }
  }
}

function defendingMovement(match: Match, team: Team, outfield: Player[]): void {
  const ball = match.ball;
  const carrier = ball.owner;
  const dir = team.dir;
  const t = team.tactics;
  const ownGoal = toWorld({ x: 0, y: MID_Y }, dir);
  const assigned = new Set<Player>();

  // Pressing the ball carrier.
  if (carrier && carrier.team !== team) {
    const ballL = toLocal(carrier.pos, dir);
    // A defender who has just been beaten (tackle cooldown) can't press: the next man steps in.
    const cost = (p: Player) => p.timeTo(carrier.pos) + (p.tackleCooldown > 0 ? 1.5 : 0);
    const candidates = [...outfield].sort((a, b) => cost(a) - cost(b));
    const p1 = candidates[0];
    if (p1) {
      const deep = ballL.x > 60; // carrier is deep in his own half
      const standOff = deep ? 2.5 + (1 - t.pressing) * 5 : 0.7;
      const toGoal = norm(sub(ownGoal, carrier.pos));
      const close = dist(p1.pos, carrier.pos) < 4.5 + 1.5 * team.coaching.pressing;
      if (close && !deep) {
        // Engage: attack the ball where it will be in a moment rather than shadowing the dribbler.
        p1.target = { x: ball.pos.x + carrier.vel.x * 0.35, y: ball.pos.y + carrier.vel.y * 0.35 };
      } else {
        p1.target = { x: carrier.pos.x + toGoal.x * standOff, y: carrier.pos.y + toGoal.y * standOff };
      }
      p1.intensity = deep ? 0.6 + t.pressing * 0.4 : 1;
      assigned.add(p1);
    }
    const p2 = candidates[1];
    if (p2 && ballL.x < 36) {
      // Near our goal the second man covers goal-side, ready to step in.
      const toGoal = norm(sub(ownGoal, carrier.pos));
      p2.target = { x: carrier.pos.x + toGoal.x * 3, y: carrier.pos.y + toGoal.y * 3 };
      p2.intensity = 1;
      assigned.add(p2);
    } else if (p2 && t.pressing > 0.55) {
      // Cut the passing lane to the carrier's nearest teammate.
      const mates = carrier.team.active.filter((m) => m !== carrier && !m.isGK);
      mates.sort((a, b) => dist(a.pos, carrier.pos) - dist(b.pos, carrier.pos));
      if (mates[0]) {
        p2.target = lerp(carrier.pos, mates[0].pos, 0.55);
        p2.intensity = 0.85;
        assigned.add(p2);
      }
    }
  }

  // Zonal marking: defenders and midfielders pick up runners in their zone, goal-side.
  const opponents = team.opponent.active.filter((o) => !o.isGK && o !== carrier);
  const markers = outfield.filter((p) => !assigned.has(p) && ROLE_LINE[p.role] !== 'att');
  const marked = new Set<Player>();
  const pairs: { m: Player; o: Player; d: number }[] = [];
  for (const mk of markers) {
    for (const o of opponents) {
      const d = dist(mk.target, o.pos);
      if (d < 13) pairs.push({ m: mk, o, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const used = new Set<Player>();
  for (const { m: mk, o } of pairs) {
    if (used.has(mk) || marked.has(o)) continue;
    used.add(mk);
    marked.add(o);
    const goalSide = norm(sub(ownGoal, o.pos));
    const ballSide = norm(sub(ball.pos, o.pos));
    const danger = toLocal(o.pos, dir).x < 25; // in or around our box: get touch-tight
    const gap = danger ? 1.0 : 1.6;
    const markPos = {
      x: o.pos.x + goalSide.x * gap + ballSide.x * 0.6,
      y: o.pos.y + goalSide.y * gap + ballSide.y * 0.6,
    };
    const tight = Math.min(0.97, (danger ? 0.9 : ROLE_LINE[mk.role] === 'def' ? 0.7 : 0.55) + 0.08 * team.coaching.organisation);
    mk.target = lerp(mk.target, markPos, tight);
    mk.intensity = Math.max(mk.intensity, 0.75);
  }
}
