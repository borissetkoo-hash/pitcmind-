import type { Vec } from './vec';

/** FIFA-standard pitch, metres. x runs along the length (0 → 105), y across (0 → 68). */
export const PITCH = {
  length: 105,
  width: 68,
  goalWidth: 7.32,
  goalHeight: 2.44,
  postRadius: 0.12,
  boxDepth: 16.5,
  boxWidth: 40.32,
  sixDepth: 5.5,
  sixWidth: 18.32,
  penaltySpot: 11,
  centreRadius: 9.15,
} as const;

export const HALF_X = PITCH.length / 2;
export const MID_Y = PITCH.width / 2;
export const GOAL_TOP = MID_Y - PITCH.goalWidth / 2;
export const GOAL_BOTTOM = MID_Y + PITCH.goalWidth / 2;

export const CENTRE: Vec = { x: HALF_X, y: MID_Y };

/**
 * Each team works in a "local" frame where it always attacks toward +x.
 * dir = 1 means the team attacks the x = 105 goal in world space.
 */
export function toLocal(p: Vec, dir: 1 | -1): Vec {
  return dir === 1 ? { x: p.x, y: p.y } : { x: PITCH.length - p.x, y: PITCH.width - p.y };
}

export const toWorld = toLocal; // the mapping is its own inverse

export function inBox(localX: number, localY: number, attackingEnd: boolean): boolean {
  const inY = Math.abs(localY - MID_Y) <= PITCH.boxWidth / 2;
  return inY && (attackingEnd ? localX >= PITCH.length - PITCH.boxDepth : localX <= PITCH.boxDepth);
}

export function clampToPitch(p: Vec, margin = 0.5): Vec {
  return {
    x: Math.min(PITCH.length - margin, Math.max(margin, p.x)),
    y: Math.min(PITCH.width - margin, Math.max(margin, p.y)),
  };
}

/** Angle (radians) subtended by the goal mouth from a local-frame position, attacking +x. */
export function goalAngle(localX: number, localY: number): number {
  const dx = PITCH.length - localX;
  if (dx <= 0) return 0;
  const a1 = Math.atan2(GOAL_TOP - localY, dx);
  const a2 = Math.atan2(GOAL_BOTTOM - localY, dx);
  return Math.abs(a2 - a1);
}
