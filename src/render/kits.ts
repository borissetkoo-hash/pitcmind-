import type { ClubData } from '../engine/types';

export interface Kit {
  fill: string;
  stroke: string;
  text: string;
  gkFill: string;
  gkText: string;
}

const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const distance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ink = (bg: string) => (luminance(bg) > 0.55 ? '#0b1220' : '#ffffff');

const KEEPER_SHIRTS = ['#10b981', '#f472b6', '#facc15', '#a3a3a3', '#22d3ee'];

/** Resolves shirts so the two teams (and both keepers) are always distinguishable. */
export function resolveKits(home: ClubData, away: ClubData): [Kit, Kit] {
  const h: Kit = { fill: home.colors.primary, stroke: home.colors.secondary, text: home.colors.text, gkFill: '', gkText: '' };
  let a: Kit = { fill: away.colors.primary, stroke: away.colors.secondary, text: away.colors.text, gkFill: '', gkText: '' };
  if (distance(h.fill, a.fill) < 140) {
    // Away team switches to its change strip.
    a = { ...a, fill: away.colors.secondary, stroke: away.colors.primary, text: ink(away.colors.secondary) };
  }
  const used = [h.fill, a.fill];
  for (const k of [h, a]) {
    const shirt = KEEPER_SHIRTS.find((c) => used.every((u) => distance(u, c) > 120)) ?? '#a3a3a3';
    used.push(shirt);
    k.gkFill = shirt;
    k.gkText = ink(shirt);
  }
  return [h, a];
}
