import { GRAVITY, loftedLaunch } from '../ball';
import type { KickContext, Match } from '../match';
import { GOAL_BOTTOM, GOAL_TOP, MID_Y, PITCH, clampToPitch, toLocal, toWorld } from '../pitch';
import { type Player, dribbleFactor } from '../player';
import { type Vec, add, clamp, dist, distToSegment, fromAngle, norm, sub, hyp } from '../vec';
import {
  groundPassSuccess,
  lossCost,
  loftedPassSuccess,
  nearestOpponentDistance,
  positionValue,
  pressureOn,
  shotXg,
  xgModel,
} from './evaluate';

export type OptionKind = 'pass' | 'through' | 'lofted' | 'cross' | 'shot' | 'dribble' | 'hold' | 'clear';

export interface Option {
  kind: OptionKind;
  target: Vec;
  receiver: Player | null;
  success: number;
  utility: number;
  speed?: number;
  flightTime?: number;
  xg?: number;
}

const inBoxLocal = (l: Vec) => l.x >= PITCH.length - PITCH.boxDepth && Math.abs(l.y - MID_Y) <= PITCH.boxWidth / 2;

/** Every option the ball carrier can see, scored as expected change in possession value. */
export function generateOptions(match: Match, p: Player, restart: KickContext): Option[] {
  const team = p.team;
  const dir = team.dir;
  const me = toLocal(p.pos, dir);
  const t = team.tactics;
  const opts: Option[] = [];
  const pressure = pressureOn(p);
  const currentValue = positionValue(me.x, me.y);
  const visionNoise = (100 - p.a.vision) / 100;

  const addPass = (o: Option) => {
    // Tactical flavour: direct teams like vertical balls, possession teams like safe ones.
    const prog = (toLocal(o.target, dir).x - me.x) / 50;
    o.utility += prog * (t.directness - 0.35) * 0.012;
    if (o.success > 0.85) o.utility += (1 - t.directness) * 0.004;
    opts.push(o);
  };

  const teammates = team.active.filter((m) => m !== p);
  for (const r of teammates) {
    const rl = toLocal(r.pos, dir);
    const d = dist(p.pos, r.pos);
    if (d < 3 || d > 60) continue;
    if (restart === 'kickoff' && rl.x > PITCH.length / 2 + 1) continue;
    if (restart === 'throwIn' && d > 28) continue;
    if ((restart === 'goalKick' || restart === 'hands') && r.isGK) continue;
    if (r.isGK && me.x > 40) continue;
    // Players the carrier "doesn't see" (poor vision, behind his back) are sometimes skipped.
    if (match.rng.chance(visionNoise * 0.25)) continue;

    const space = clamp(nearestOpponentDistance(r) / 7, 0, 1);
    const value = positionValue(rl.x, rl.y) * (0.65 + 0.35 * space);

    if (restart !== 'throwIn' && restart !== 'corner') {
      const lead = add(r.pos, { x: r.vel.x * 0.5, y: r.vel.y * 0.5 });
      const g = groundPassSuccess(p, r, lead);
      addPass({
        kind: 'pass', target: lead, receiver: r, success: g.p, speed: g.speed,
        utility: g.p * value - (1 - g.p) * lossCost((me.x + rl.x) / 2, (me.y + rl.y) / 2),
      });

      // Through ball into space behind for forward-facing runners.
      if (rl.x > me.x + 5 && rl.x > 45 && r.role !== 'CB' && !r.isGK) {
        const leadDist = 6 + (r.a.pace / 100) * 6;
        const tl = { x: Math.min(rl.x + leadDist, PITCH.length - 4), y: clamp(rl.y + (MID_Y - rl.y) * 0.15, 3, PITCH.width - 3) };
        const tw = toWorld(tl, dir);
        const g2 = groundPassSuccess(p, r, tw);
        const v2 = positionValue(tl.x, tl.y) * (0.75 + 0.25 * clamp(nearestOpponentDistance(r, tw) / 7, 0, 1));
        addPass({
          kind: 'through', target: tw, receiver: r, success: g2.p, speed: g2.speed,
          utility: g2.p * v2 - (1 - g2.p) * lossCost((me.x + tl.x) / 2, (me.y + tl.y) / 2),
        });
      }
    }

    // Lofted ball / cross / throw.
    if (d > 18 || restart === 'throwIn' || restart === 'corner' || (inBoxLocal(rl) && Math.abs(me.y - MID_Y) > 14)) {
      const tgt = add(r.pos, { x: r.vel.x * 0.6, y: r.vel.y * 0.6 });
      const tl = toLocal(tgt, dir);
      const flight = restart === 'throwIn' ? clamp(0.45 + d / 30, 0.5, 1.2) : clamp(0.6 + d / 26, 0.8, 2.6);
      const pl = loftedPassSuccess(p, r, tgt, flight);
      const isCross = inBoxLocal(tl) && Math.abs(me.y - MID_Y) > 12 && me.x > 70;
      // Wide teams love a cross; a blocked or cleared cross often still earns a corner.
      const crossBonus = isCross ? 0.008 + t.width * 0.018 : 0;
      const header = isCross ? 0.55 : 0.8; // aerial balls are harder to use
      addPass({
        kind: isCross ? 'cross' : 'lofted', target: tgt, receiver: r, success: pl, flightTime: flight,
        utility: pl * positionValue(tl.x, tl.y) * header * (isCross ? 1.15 : 1) - (1 - pl) * lossCost(tl.x, tl.y) * 0.8 + crossBonus,
      });
    }
  }

  // Shooting.
  const canShoot = restart === null || restart === 'penalty' || restart === 'freeKick';
  if (canShoot && me.x > 68 && !(restart === 'freeKick' && Math.abs(me.y - MID_Y) >= 18)) {
    let xg = restart === 'penalty' ? 0.76 : shotXg(p);
    // Direct free kicks: the wall and a set keeper make them roughly half as good as open play.
    if (restart === 'freeKick') xg = Math.abs(me.y - MID_Y) < 18 ? xgModel(me.x, me.y) * 0.5 : 0;
    const bias = 1.25 + t.mentality * 0.06 + (p.a.shooting - 60) / 250;
    const goal = toWorld({ x: PITCH.length, y: MID_Y }, dir);
    // Edge-of-the-box shooters: with a clear sight of goal, good strikers let fly.
    const distToGoal = Math.hypot(PITCH.length - me.x, MID_Y - me.y);
    const longShot = restart === null && distToGoal > 16 && distToGoal < 28 && nearestOpponentDistance(p) > 2
      ? 0.008 + (p.a.shooting - 50) / 2500 : 0;
    opts.push({ kind: 'shot', target: goal, receiver: null, success: xg, xg, utility: xg * bias - (1 - xg) * 0.012 + longShot });
  }

  if (restart === null) {
    // Dribbling: a fan of directions biased towards goal.
    const goalDir = Math.atan2(MID_Y - me.y, PITCH.length - me.x) * 0.6;
    const angles = [0, 0.55, -0.55, 1.1, -1.1, goalDir];
    const dribbleSpeed = p.maxSpeed * dribbleFactor(p.a.dribbling);
    for (const a of angles) {
      const stepLocal = add(me, fromAngle(a, 5));
      if (stepLocal.x < 1 || stepLocal.x > PITCH.length - 1 || stepLocal.y < 1.5 || stepLocal.y > PITCH.width - 1.5) continue;
      const tw = toWorld(stepLocal, dir);
      let keep = 1;
      for (const o of team.opponent.active) {
        if (dist(o.pos, p.pos) > 14) continue;
        // Where along my path can this defender meet me, and who gets there first?
        const seg = distToSegment(o.pos, p.pos, tw);
        const myT = (seg.t * 5) / dribbleSpeed;
        const margin = o.timeToCover(Math.max(0, seg.d - 0.9)) - myT;
        const duel = 0.62 + (o.a.tackling - p.a.dribbling) / 200;
        keep *= 1 - (1 / (1 + Math.exp(margin * 3.5))) * clamp(duel, 0.25, 0.9);
      }
      const v = positionValue(stepLocal.x, stepLocal.y);
      opts.push({ kind: 'dribble', target: tw, receiver: null, success: keep, utility: keep * v - (1 - keep) * lossCost(me.x, me.y) * 0.9 });
    }
    // Shield / hold up the ball, moving away from the nearest opponent.
    let away = { x: -dir, y: 0 };
    let nd = Infinity;
    for (const o of team.opponent.active) {
      const d = dist(o.pos, p.pos);
      if (d < nd) {
        nd = d;
        away = norm(sub(p.pos, o.pos));
      }
    }
    // Shielding: every opponent who can arrive within the next ~0.6 s is a threat.
    let keepHold = 1;
    for (const o of team.opponent.active) {
      if (dist(o.pos, p.pos) > 8) continue;
      const margin = o.timeTo(p.pos) - 0.6;
      const duel = 0.6 + (o.a.tackling - p.a.dribbling) / 220;
      keepHold *= 1 - (1 / (1 + Math.exp(margin * 3.5))) * clamp(duel, 0.25, 0.9);
    }
    keepHold = clamp(keepHold, 0.05, 0.98);
    opts.push({
      kind: 'hold', target: clampToPitch(add(p.pos, { x: away.x * 2, y: away.y * 2 }), 2), receiver: null,
      success: keepHold, utility: keepHold * currentValue * 0.97 - (1 - keepHold) * lossCost(me.x, me.y),
    });
    // Clearance: a safe-ish hoof upfield when in trouble near our goal.
    if (me.x < 35 && pressure > 0.3) {
      const tl = { x: Math.min(me.x + 45, 75), y: me.y < MID_Y ? 4 : PITCH.width - 4 };
      opts.push({ kind: 'clear', target: toWorld(tl, dir), receiver: null, success: 0.45, utility: 0.45 * positionValue(tl.x, tl.y) - 0.55 * lossCost(tl.x, tl.y) * 0.6 + pressure * 0.01 });
    }
  }
  return opts;
}

/** Softmax pick: better players choose the best option more consistently. */
export function chooseOption(match: Match, p: Player, opts: Option[]): Option | null {
  if (opts.length === 0) return null;
  const temp = 0.0008 + (1 - (p.a.vision * 0.5 + p.a.composure * 0.5) / 100) * 0.003;
  const best = Math.max(...opts.map((o) => o.utility));
  const weights = opts.map((o) => Math.exp((o.utility - best) / temp));
  return opts[match.rng.weighted(weights)];
}

/** Runs one decision for the ball carrier and executes it. */
export function decideCarrier(match: Match, p: Player, restart: KickContext): void {
  let opts = generateOptions(match, p, restart);
  if (restart === 'penalty') opts = opts.filter((o) => o.kind === 'shot');
  if (opts.length === 0 && restart) {
    // Nothing sensible available on a set piece: play it to the nearest teammate.
    const mates = p.team.active.filter((m) => m !== p).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
    if (mates[0]) opts = [{ kind: 'lofted', target: mates[0].pos, receiver: mates[0], success: 0.5, utility: 0, flightTime: 1 }];
  }
  const choice = chooseOption(match, p, opts);
  // Calibration log: a dribble "succeeds" if the carrier still has the ball at his next decision.
  if (match.pendingDribble) {
    if (match.pendingDribble.p === p) match.pendingDribble.entry.ok = true;
    match.pendingDribble = null;
  }
  if (choice && choice.kind === 'dribble') {
    const entry = { predicted: choice.success, ok: null };
    match.dribbleLog.push(entry);
    match.pendingDribble = { p, entry };
  }
  match.debug = { carrier: p, options: [...opts].sort((a, b) => b.utility - a.utility).slice(0, 10), chosen: choice };
  if (!choice) return;
  execute(match, p, choice, restart);
}

export function execute(match: Match, p: Player, o: Option, restart: KickContext): void {
  const rng = match.rng;
  const pressure = pressureOn(p);
  switch (o.kind) {
    case 'pass':
    case 'through': {
      const d = dist(p.pos, o.target);
      const err = 0.02 + (1 - p.a.passing / 100) * 0.06 + pressure * 0.04;
      const dirV = norm(sub(o.target, p.pos));
      const ang = Math.atan2(dirV.y, dirV.x) + rng.normal(0, err);
      const speed = (o.speed ?? 12) * (1 + rng.normal(0, 0.05));
      match.kick(p, { kind: 'pass', to: o.receiver, target: o.target, vel: fromAngle(ang, speed), vz: d > 25 ? 0.6 : 0, lofted: false });
      return;
    }
    case 'lofted':
    case 'cross':
    case 'clear': {
      const kind = o.kind === 'cross' ? 'cross' : o.kind === 'clear' ? 'clear' : restart === 'throwIn' ? 'throw' : 'pass';
      const d0 = dist(p.pos, o.target);
      const spread = d0 * (0.02 + (1 - p.a.passing / 100) * 0.07) + (o.kind === 'clear' ? 6 : 0);
      const landing = clampToPitch(add(o.target, fromAngle(rng.range(0, Math.PI * 2), Math.abs(rng.normal(0, spread)))), -1);
      const d = dist(p.pos, landing);
      const flight = o.flightTime ?? clamp(0.7 + d / 24, 0.9, 2.8);
      const launch = loftedLaunch(d, flight, kind === 'cross' ? 1.4 : 0.4);
      const v = norm(sub(landing, p.pos));
      match.kick(p, { kind, to: o.receiver, target: landing, vel: { x: v.x * launch.vh, y: v.y * launch.vh }, vz: launch.vz, lofted: true });
      return;
    }
    case 'shot':
      shoot(match, p, restart === 'penalty', o.xg ?? 0.05, restart === 'freeKick');
      return;
    case 'dribble':
    case 'hold':
      p.action = { type: o.kind, target: o.target };
      return;
  }
}

/** Places a shot: picks a corner away from the keeper, then adds skill-dependent error. */
export function shoot(match: Match, p: Player, penalty: boolean, xg: number, freeKick = false, header = false): void {
  const rng = match.rng;
  const dir = p.team.dir;
  const me = toLocal(p.pos, dir);
  const gk = p.team.opponent.keeper;
  const gkY = gk ? toLocal(gk.pos, dir).y : MID_Y;
  const inset = 0.25;
  const left = GOAL_TOP + inset;
  const right = GOAL_BOTTOM - inset;
  const preferFar = Math.abs(gkY - left) > Math.abs(gkY - right) ? left : right;
  const other = preferFar === left ? right : left;
  let aimY = rng.chance(0.55 + p.a.composure / 250) ? preferFar : other;
  if (!penalty && rng.chance(0.18)) aimY = MID_Y + rng.normal(0, 1.2); // power down the middle
  const high = header ? rng.chance(0.3) : rng.chance(freeKick ? 0.85 : 0.45);
  let aimZ = high ? rng.range(1.5, 2.2) : rng.range(0.15, 0.7);
  const d = hyp(PITCH.length - me.x, MID_Y - me.y);
  const skill = (header ? p.a.heading : p.a.shooting) / 100;
  const pressure = pressureOn(p);
  const sdY = (penalty ? 0.55 : 1.7 + d * 0.12 * (1.3 - skill)) + pressure * 1.0;
  const sdZ = (penalty ? 0.35 : 0.4 + d * 0.05 * (1.3 - skill)) + pressure * 0.45;
  aimY += rng.normal(0, sdY);
  aimZ = Math.max(0.05, aimZ + rng.normal(0, sdZ));
  const vh = header ? 11 + skill * 6 : penalty ? 22 + skill * 5 : clamp(17 + skill * 12 - (d < 10 ? 3 : 0), 15, 31);
  const target = toWorld({ x: PITCH.length + 0.5, y: aimY }, dir);
  const dd = dist(p.pos, target);
  const T = dd / vh;
  const vz = (aimZ + 0.5 * GRAVITY * T * T) / T;
  const v = norm(sub(target, p.pos));
  match.kick(p, { kind: 'shot', header, to: null, target, vel: { x: v.x * vh, y: v.y * vh }, vz, lofted: false, xg });
}
