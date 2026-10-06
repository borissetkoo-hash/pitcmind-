import type { Match } from '../match';
import { GOAL_BOTTOM, GOAL_TOP, MID_Y, PITCH, toLocal, toWorld } from '../pitch';
import type { Player } from '../player';
import { clamp, dist, hyp } from '../vec';
import type { AIContext } from './offball';

/** Keeper reach (m) from body centre: standing vs. full-stretch dive. */
export function keeperReach(gk: Player): number {
  const base = 1.15;
  return gk.dive ? base + 0.9 + (gk.a.goalkeeping / 100) * 1.0 : base;
}

export function updateKeeper(match: Match, gk: Player, ctx: AIContext): void {
  const ball = match.ball;
  const dir = gk.team.dir;
  const gl = toLocal(gk.pos, dir);
  const ballL = toLocal(ball.pos, dir);
  if (ball.owner === gk) return;

  if (gk.dive) {
    gk.dive.timer -= 0.1;
    if (gk.dive.timer <= 0) gk.dive = null;
  }

  // 1) Shot on the way: find where it crosses our line and get there.
  const f = ball.flight;
  if (f && (f.kind === 'shot' || f.kind === 'header') && f.from.team !== gk.team) {
    const lineX = Math.max(gl.x, 0.2);
    for (const s of ctx.traj) {
      const sl = toLocal({ x: s.x, y: s.y }, dir);
      if (sl.x <= lineX) {
        if (sl.y > GOAL_TOP - 1.5 && sl.y < GOAL_BOTTOM + 1.5 && s.z < 3) {
          const tgt = toWorld({ x: lineX, y: clamp(sl.y, GOAL_TOP - 0.5, GOAL_BOTTOM + 0.5) }, dir);
          gk.target = tgt;
          gk.intensity = 1;
          const lateral = Math.abs(sl.y - gl.y);
          const reaction = 0.28 - gk.a.goalkeeping * 0.0015;
          if (!gk.dive && lateral > 0.9 && s.t > reaction) startDive(gk, tgt);
        }
        return;
      }
    }
  }

  // 2) Loose ball in our box that we can reach first: come and claim it.
  const chase = ctx.chasers[gk.team.index];
  if (!ball.owner && chase && chase.player === gk) {
    gk.target = chase.point;
    gk.intensity = 1;
    return;
  }

  // 3) Positioning on the bisector between ball and goal, sweeping higher when the ball is far away.
  const goal = { x: 0, y: MID_Y };
  const dx = ballL.x - goal.x;
  const dy = ballL.y - goal.y;
  const d = hyp(dx, dy) || 1;
  let off: number;
  if (ballL.x > 60) off = 9 + gk.team.tactics.lineHeight * 9;
  else if (ballL.x > 35) off = 5 + (ballL.x - 35) * 0.15;
  else off = clamp(d * 0.11, 0.8, 4.5);
  const tl = { x: clamp(goal.x + (dx / d) * off, 0.4, PITCH.boxDepth + 6), y: clamp(goal.y + (dy / d) * off * 0.85, GOAL_TOP - 1.5, GOAL_BOTTOM + 1.5) };
  gk.target = toWorld(tl, dir);
  gk.intensity = dist(gk.pos, gk.target) > 5 ? 0.8 : 0.5;
}

export function startDive(gk: Player, towards: { x: number; y: number }): void {
  gk.dive = { timer: 0.9, reach: keeperReach(gk) };
  const dx = towards.x - gk.pos.x;
  const dy = towards.y - gk.pos.y;
  const d = hyp(dx, dy) || 1;
  const burst = 3.5 + gk.a.goalkeeping * 0.02;
  gk.vel = { x: (dx / d) * burst, y: (dy / d) * burst };
}
