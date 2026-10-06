import { Rng, hashString } from '../engine/rng';
import type { Attributes, ClubData, PlayerData, Role, Tactics } from '../engine/types';
import { FIRST_NAMES, LAST_NAMES } from './names';

interface ClubSeed {
  id: string;
  name: string;
  short: string;
  city: string;
  strength: number;
  primary: string;
  secondary: string;
  text: string;
  tactics: Tactics;
}

/** Fictional league. Strength is the average attribute level the squad is generated around. */
const SEEDS: ClubSeed[] = [
  { id: 'nrd', name: 'Nordhavn Athletic', short: 'NOR', city: 'Nordhavn', strength: 78, primary: '#1d4ed8', secondary: '#ffffff', text: '#ffffff',
    tactics: { formation: '4-3-3', mentality: 1, pressing: 0.8, lineHeight: 0.75, width: 0.75, directness: 0.3, shootingRange: 0.5, tempo: 0.75, tackling: 0.55, crossing: 0.4 } },
  { id: 'vlr', name: 'Valoria FC', short: 'VAL', city: 'Valoria', strength: 77, primary: '#b91c1c', secondary: '#fbbf24', text: '#ffffff',
    tactics: { formation: '4-2-3-1', mentality: 0.5, pressing: 0.6, lineHeight: 0.6, width: 0.6, directness: 0.45, shootingRange: 0.65, tempo: 0.6, tackling: 0.5, crossing: 0.5 } },
  { id: 'kst', name: 'Kestrel United', short: 'KES', city: 'Kestrel', strength: 74, primary: '#111827', secondary: '#f59e0b', text: '#f59e0b',
    tactics: { formation: '3-5-2', mentality: 0.5, pressing: 0.55, lineHeight: 0.55, width: 0.7, directness: 0.5, shootingRange: 0.45, tempo: 0.55, tackling: 0.6, crossing: 0.65 } },
  { id: 'arg', name: 'Argent City', short: 'ARG', city: 'Argent', strength: 72, primary: '#7dd3fc', secondary: '#0c4a6e', text: '#0c4a6e',
    tactics: { formation: '4-3-3', mentality: 0, pressing: 0.5, lineHeight: 0.5, width: 0.65, directness: 0.25, shootingRange: 0.35, tempo: 0.35, tackling: 0.4, crossing: 0.35 } },
  { id: 'brk', name: 'Brakwater Rovers', short: 'BRK', city: 'Brakwater', strength: 70, primary: '#15803d', secondary: '#ffffff', text: '#ffffff',
    tactics: { formation: '4-4-2', mentality: 0, pressing: 0.45, lineHeight: 0.45, width: 0.6, directness: 0.65, shootingRange: 0.6, tempo: 0.5, tackling: 0.6, crossing: 0.75 } },
  { id: 'ost', name: 'Ostmark Sporting', short: 'OST', city: 'Ostmark', strength: 69, primary: '#7c3aed', secondary: '#e9d5ff', text: '#ffffff',
    tactics: { formation: '4-1-4-1', mentality: -0.5, pressing: 0.4, lineHeight: 0.4, width: 0.5, directness: 0.45, shootingRange: 0.5, tempo: 0.4, tackling: 0.45, crossing: 0.5 } },
  { id: 'ptr', name: 'Port Rhenna', short: 'PRH', city: 'Rhenna', strength: 67, primary: '#ea580c', secondary: '#1f2937', text: '#ffffff',
    tactics: { formation: '4-4-2', mentality: 0.5, pressing: 0.65, lineHeight: 0.55, width: 0.7, directness: 0.7, shootingRange: 0.7, tempo: 0.7, tackling: 0.7, crossing: 0.6 } },
  { id: 'hlm', name: 'Holmgard Town', short: 'HOL', city: 'Holmgard', strength: 65, primary: '#facc15', secondary: '#1e3a8a', text: '#1e3a8a',
    tactics: { formation: '5-3-2', mentality: -1, pressing: 0.35, lineHeight: 0.3, width: 0.45, directness: 0.7, shootingRange: 0.55, tempo: 0.35, tackling: 0.65, crossing: 0.7 } },
];

const ATTR_KEYS: (keyof Attributes)[] = [
  'pace', 'acceleration', 'stamina', 'passing', 'vision', 'shooting', 'dribbling', 'firstTouch', 'tackling', 'positioning',
  'heading', 'composure', 'goalkeeping',
];

/** Attribute emphasis per position: offsets around the player's base level. */
const PROFILE: Record<Role, Partial<Attributes>> = {
  GK: { goalkeeping: 14, positioning: 6, composure: 4, pace: -20, shooting: -35, dribbling: -25, tackling: -30, heading: -15 },
  CB: { tackling: 10, positioning: 9, heading: 10, shooting: -18, dribbling: -10, vision: -6, goalkeeping: -60 },
  LB: { pace: 6, stamina: 7, tackling: 4, shooting: -14, heading: -4, goalkeeping: -60 },
  RB: { pace: 6, stamina: 7, tackling: 4, shooting: -14, heading: -4, goalkeeping: -60 },
  LWB: { pace: 7, stamina: 9, dribbling: 2, shooting: -12, goalkeeping: -60 },
  RWB: { pace: 7, stamina: 9, dribbling: 2, shooting: -12, goalkeeping: -60 },
  DM: { tackling: 8, positioning: 7, passing: 4, stamina: 4, shooting: -8, goalkeeping: -60 },
  CM: { passing: 7, vision: 6, firstTouch: 4, stamina: 5, goalkeeping: -60 },
  LM: { pace: 6, passing: 4, dribbling: 4, tackling: -6, goalkeeping: -60 },
  RM: { pace: 6, passing: 4, dribbling: 4, tackling: -6, goalkeeping: -60 },
  AM: { vision: 9, passing: 7, dribbling: 6, firstTouch: 6, tackling: -14, heading: -6, goalkeeping: -60 },
  LW: { pace: 9, acceleration: 9, dribbling: 9, shooting: 3, tackling: -18, heading: -8, goalkeeping: -60 },
  RW: { pace: 9, acceleration: 9, dribbling: 9, shooting: 3, tackling: -18, heading: -8, goalkeeping: -60 },
  ST: { shooting: 11, composure: 7, heading: 5, firstTouch: 3, tackling: -22, passing: -4, goalkeeping: -60 },
};

const SQUAD: Role[] = [
  'GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'LWB', 'DM', 'CM', 'CM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'ST',
];

export function generatePlayer(rng: Rng, role: Role, level: number, number: number, clubId: string): PlayerData {
  const base = level + rng.normal(0, 4);
  const prof = PROFILE[role];
  const attrs = {} as Attributes;
  for (const k of ATTR_KEYS) {
    const v = base + (prof[k] ?? 0) + rng.normal(0, 6);
    attrs[k] = Math.round(Math.min(97, Math.max(12, v)));
  }
  const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
  return { id: `${clubId}-${number}`, name, number, position: role, age: rng.int(18, 34), attrs };
}

function buildClub(s: ClubSeed): ClubData {
  const rng = new Rng(hashString(s.id));
  const used = new Set<number>();
  const preferred: Partial<Record<Role, number[]>> = {
    GK: [1, 12], CB: [4, 5, 15], LB: [3], RB: [2], LWB: [21], DM: [6], CM: [8, 14, 16], AM: [10], LM: [11], RM: [7],
    LW: [17], RW: [19], ST: [9, 18, 20],
  };
  const players = SQUAD.map((role, i) => {
    let n = preferred[role]?.find((x) => !used.has(x)) ?? 22 + i;
    while (used.has(n)) n++;
    used.add(n);
    // First-choice players are a bit better than the back-ups.
    const level = s.strength + (i < 2 ? 0 : 0) + (i % 3 === 2 ? -4 : 0);
    return generatePlayer(rng, role, level, n, s.id);
  });
  return {
    id: s.id, name: s.name, short: s.short, city: s.city,
    colors: { primary: s.primary, secondary: s.secondary, text: s.text },
    keeperColors: { primary: '#10b981', text: '#052e16' },
    tactics: s.tactics, players,
  };
}

export const CLUBS: ClubData[] = SEEDS.map(buildClub);

export function clubById(id: string): ClubData {
  const c = CLUBS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown club ${id}`);
  return c;
}
