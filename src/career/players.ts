import { overall } from '../engine/attributes';
import { hashString } from '../engine/rng';
import type { PlayerData } from '../engine/types';

/** Overall rating in the player's natural position. */
export const rating = (p: PlayerData) => overall(p.attrs, p.position);

const unit = (s: string) => hashString(s) / 4294967296;

/**
 * Ceiling the player can grow to; young players have more headroom. Once a player starts
 * developing in a career the value is frozen on the player (`p.potential`).
 */
export function potential(p: PlayerData): number {
  if (p.potential !== undefined) return p.potential;
  const u = unit(`pot-${p.id}`);
  const r = rating(p);
  const room = p.age <= 21 ? 4 + u * 14 : p.age <= 24 ? 2 + u * 8 : p.age <= 27 ? u * 4 : 0;
  // The closer to the top of the scale, the less room is left.
  return Math.min(99, r + Math.round(room * Math.min(1, (99 - r) / 25)));
}
