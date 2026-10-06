/** Minimal 2D vector toolkit. Plain objects keep the engine allocation-light and serialisable. */
export interface Vec {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec => ({ x, y });
/** Faster than Math.hypot in V8 (no overflow handling needed at pitch scale). */
export const hyp = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec): number => hyp(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => hyp(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec, b: Vec): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function norm(a: Vec): Vec {
  const l = hyp(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export function clampLen(a: Vec, max: number): Vec {
  const l = hyp(a.x, a.y);
  return l > max ? { x: (a.x / l) * max, y: (a.y / l) * max } : a;
}

export const fromAngle = (angle: number, length = 1): Vec => ({ x: Math.cos(angle) * length, y: Math.sin(angle) * length });
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);

export function rotate(a: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** Distance from point p to segment ab, plus the normalised position t of the closest point. */
export function distToSegment(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  return { d: hyp(a.x + abx * t - p.x, a.y + aby * t - p.y), t };
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
