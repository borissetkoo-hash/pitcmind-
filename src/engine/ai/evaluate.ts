import { GROUND_DECEL, groundPassSpeed, groundTimeAt } from '../ball';
import { MID_Y, PITCH, goalAngle, toLocal } from '../pitch';
import type { Player } from '../player';
import { type Vec, clamp, dist, distToSegment, hyp } from '../vec';

export const CONTROL_RADIUS = 0.9;
/** Baseline value of simply having the ball (possession has worth even far from goal). */
export const POSSESSION_VALUE = 0.02;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Expected-threat style value of a position in the attacking team's local frame:
 * probability-ish that possession here leads to a goal soon. Smooth and cheap.
 */
export function threat(lx: number, ly: number): number {
  const dx = PITCH.length - lx;
  const dy = Math.abs(ly - MID_Y);
  const d = hyp(Math.max(0, dx), dy * 1.35);
  const progress = clamp(lx / PITCH.length, 0, 1);
  return 0.4 * Math.exp(-d / 9) + 0.025 * progress * progress;
}

export const positionValue = (lx: number, ly: number) => POSSESSION_VALUE + threat(lx, ly);

/** Value lost if the ball is turned over at local point (lx, ly): it is the opponent's value there. */
export const lossCost = (lx: number, ly: number) => positionValue(PITCH.length - lx, PITCH.width - ly);

/**
 * Logistic xG model on distance and goal-mouth angle (fitted by eye to public open-play data):
 * ~0.75 from 5 m central, ~0.25 from the penalty spot, ~0.03 from 25 m.
 */
export function xgModel(lx: number, ly: number, header = false): number {
  const d = hyp(PITCH.length - lx, ly - MID_Y);
  const ang = goalAngle(lx, ly);
  let xg = sigmoid(-2.5 + 3.4 * ang - 0.08 * d);
  if (header) xg *= 0.55;
  return clamp(xg, 0.003, 0.95);
}

/** Shot quality once defenders in the shooting cone and pressure on the shooter are considered. */
export function shotXg(shooter: Player, header = false): number {
  const team = shooter.team;
  const local = toLocal(shooter.pos, team.dir);
  let xg = xgModel(local.x, local.y, header);
  const goalY1 = MID_Y - PITCH.goalWidth / 2;
  const goalY2 = MID_Y + PITCH.goalWidth / 2;
  for (const o of team.opponent.active) {
    if (o.isGK) continue;
    const ol = toLocal(o.pos, team.dir);
    if (ol.x <= local.x + 0.3 || ol.x > PITCH.length) continue;
    // Is the defender inside the triangle shooter → posts (with a small body margin)?
    const f = (ol.x - local.x) / (PITCH.length - local.x);
    const yMin = local.y + (goalY1 - local.y) * f - 0.5;
    const yMax = local.y + (goalY2 - local.y) * f + 0.5;
    if (ol.y >= yMin && ol.y <= yMax) xg *= ol.x - local.x < 4 ? 0.55 : 0.75;
  }
  const pressure = nearestOpponentDistance(shooter);
  if (pressure < 1.5) xg *= 0.7;
  else if (pressure < 3) xg *= 0.88;
  return xg;
}

export function nearestOpponentDistance(p: Player, at: Vec = p.pos): number {
  let best = Infinity;
  for (const o of p.team.opponent.active) {
    const d = dist(o.pos, at);
    if (d < best) best = d;
  }
  return best;
}

/** Pressure 0 … 1 felt by a player from nearby opponents. */
export function pressureOn(p: Player): number {
  let pr = 0;
  for (const o of p.team.opponent.active) {
    const d = dist(o.pos, p.pos);
    if (d < 4) pr += (4 - d) / 4;
  }
  return clamp(pr, 0, 1);
}

export interface PassPlan {
  receiver: Player;
  target: Vec;
  lofted: boolean;
  speed: number;
  flightTime: number;
  kind: 'pass' | 'through' | 'cross';
  success: number;
  value: number;
  utility: number;
}

/** Estimates how likely a ground pass from `from` to `target` is to reach `receiver`. */
export function groundPassSuccess(passer: Player, receiver: Player, target: Vec): { p: number; speed: number; time: number } {
  const from = passer.pos;
  const d = dist(from, target);
  const speed = clamp(groundPassSpeed(d, 6 + d * 0.06), 6, 27);
  const total = groundTimeAt(speed, d);
  const dx = (target.x - from.x) / (d || 1);
  const dy = (target.y - from.y) / (d || 1);
  let pSafe = 1;
  const totalT = isFinite(total) ? total : speed / GROUND_DECEL;
  for (const o of passer.team.opponent.active) {
    // Quick reject: opponent can't get near the line before the ball has gone past.
    const seg = distToSegment(o.pos, from, target);
    if (seg.d - CONTROL_RADIUS - 0.6 > o.reachDistance(totalT) + 2) continue;
    let worst = 0;
    for (const f of SAMPLES) {
      const s = d * f;
      const t = groundTimeAt(speed, s);
      if (!isFinite(t)) break;
      const px = from.x + dx * s;
      const py = from.y + dy * s;
      const need = hyp(o.pos.x - px, o.pos.y - py) - CONTROL_RADIUS - (o.isGK ? 0.6 : 0);
      const margin = need - o.reachDistance(t);
      if (margin > 4) continue;
      const p = sigmoid(-margin * 1.7);
      if (p > worst) worst = p;
    }
    pSafe *= 1 - worst * 0.9;
  }
  const rTime = isFinite(total) ? total : speed / GROUND_DECEL;
  const rMargin = receiver.reachDistance(rTime + 0.4) + CONTROL_RADIUS - dist(receiver.pos, target);
  const pReceive = sigmoid(rMargin * 1.5 + 1.5);
  const skill = passer.a.passing / 100;
  const pAcc = clamp(1 - d * (0.002 + (1 - skill) * 0.006) - pressureOn(passer) * 0.06, 0.3, 1);
  return { p: pSafe * pReceive * pAcc, speed, time: rTime };
}

const SAMPLES = [0.1, 0.22, 0.35, 0.5, 0.65, 0.8, 0.92, 1];

/** Lofted balls fly over the lines: only the take-off and the landing zone can be contested. */
export function loftedPassSuccess(passer: Player, receiver: Player, target: Vec, flightTime: number): number {
  const d = dist(passer.pos, target);
  let pStart = 1;
  for (const o of passer.team.opponent.active) {
    const dd = dist(o.pos, passer.pos);
    if (dd < 1.6) pStart *= 0.75; // could be charged down
  }
  let oppBest = Infinity;
  for (const o of passer.team.opponent.active) {
    const t = o.timeTo(target) - (o.isGK && isInOwnBox(o, target) ? 0.5 : 0);
    if (t < oppBest) oppBest = t;
  }
  const recT = receiver.timeTo(target);
  // Whoever is there first (relative to the landing time) wins the aerial duel.
  const lead = Math.max(oppBest, flightTime) - Math.max(recT, flightTime);
  const pWin = sigmoid(lead * 2.0 - 0.7 + (receiver.a.heading - 60) / 40);
  const skill = passer.a.passing / 100;
  const pAcc = clamp(1 - d * (0.006 + (1 - skill) * 0.01), 0.2, 1);
  // Crowded box: defenders and the keeper attack crosses, second balls are a lottery.
  const tl = toLocal(target, passer.team.dir);
  const boxCrowd = tl.x > PITCH.length - PITCH.boxDepth && Math.abs(tl.y - MID_Y) < PITCH.boxWidth / 2 ? 0.55 : 1;
  return pStart * pWin * pAcc * boxCrowd;
}

export function isInOwnBox(p: Player, at: Vec = p.pos): boolean {
  const l = toLocal(at, p.team.dir);
  return l.x <= PITCH.boxDepth + 0.5 && Math.abs(l.y - MID_Y) <= PITCH.boxWidth / 2 + 0.5;
}

/** The x (local, attacking team frame) beyond which an attacker would be offside right now. */
export function offsideLineLocal(attackingTeamDir: 1 | -1, defenders: Player[], ballPos: Vec): number {
  const xs = defenders.filter((d) => d.onPitch).map((d) => toLocal(d.pos, attackingTeamDir).x).sort((a, b) => b - a);
  const secondLast = xs.length >= 2 ? xs[1] : xs[0] ?? PITCH.length;
  const ballX = toLocal(ballPos, attackingTeamDir).x;
  return Math.max(secondLast, ballX, PITCH.length / 2);
}
