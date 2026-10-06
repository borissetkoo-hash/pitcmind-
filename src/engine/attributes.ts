import type { Attributes, Role } from './types';

type W = Partial<Record<keyof Attributes, number>>;

const WEIGHTS: Record<Role, W> = {
  GK: { goalkeeping: 6, positioning: 1.5, composure: 1, passing: 0.5 },
  CB: { tackling: 3, positioning: 3, heading: 2, pace: 1, composure: 1, passing: 0.7 },
  LB: { tackling: 2, positioning: 1.5, pace: 2, stamina: 1.5, passing: 1, dribbling: 0.6 },
  RB: { tackling: 2, positioning: 1.5, pace: 2, stamina: 1.5, passing: 1, dribbling: 0.6 },
  LWB: { pace: 2, stamina: 2, passing: 1.2, tackling: 1.2, dribbling: 1, positioning: 0.8 },
  RWB: { pace: 2, stamina: 2, passing: 1.2, tackling: 1.2, dribbling: 1, positioning: 0.8 },
  DM: { tackling: 2.5, positioning: 2.5, passing: 2, stamina: 1, composure: 1 },
  CM: { passing: 3, vision: 2, stamina: 1.2, firstTouch: 1.5, tackling: 1, composure: 1 },
  LM: { pace: 2, passing: 2, dribbling: 1.5, stamina: 1.2, vision: 1 },
  RM: { pace: 2, passing: 2, dribbling: 1.5, stamina: 1.2, vision: 1 },
  AM: { vision: 3, passing: 2.5, dribbling: 2, firstTouch: 1.5, shooting: 1.5, composure: 1 },
  LW: { pace: 2.5, dribbling: 3, shooting: 1.5, passing: 1.2, acceleration: 1.5 },
  RW: { pace: 2.5, dribbling: 3, shooting: 1.5, passing: 1.2, acceleration: 1.5 },
  ST: { shooting: 3.5, composure: 2, heading: 1.2, pace: 1.5, firstTouch: 1.2, dribbling: 0.8 },
};

/** Position-aware overall rating (1–99). */
export function overall(a: Attributes, role: Role): number {
  const w = WEIGHTS[role];
  let sum = 0;
  let total = 0;
  for (const k of Object.keys(w) as (keyof Attributes)[]) {
    sum += a[k] * (w[k] ?? 0);
    total += w[k] ?? 0;
  }
  return Math.round(sum / total);
}
