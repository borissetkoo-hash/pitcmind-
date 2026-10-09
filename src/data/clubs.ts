import { Rng, hashString } from '../engine/rng';
import type { Attributes, ClubData, PlayerData, Role } from '../engine/types';
import { coachById, coachTactics } from './coaches';
import { type ClubSeed, CLUB_SEEDS, leagueById, leagueClubIds } from './clubSeeds';
import { FIRST_NAMES, LAST_NAMES, NAMES_BY_COUNTRY } from './names';

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

/** Squad template: 20 players by position. */
export const SQUAD: Role[] = [
  'GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'LWB', 'DM', 'CM', 'CM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'ST',
];

export function generatePlayer(rng: Rng, role: Role, level: number, number: number, clubId: string, names = { first: FIRST_NAMES, last: LAST_NAMES }): PlayerData {
  const base = level + rng.normal(0, 4);
  const prof = PROFILE[role];
  const attrs = {} as Attributes;
  for (const k of ATTR_KEYS) {
    const v = base + (prof[k] ?? 0) + rng.normal(0, 6);
    attrs[k] = Math.round(Math.min(97, Math.max(12, v)));
  }
  const name = `${rng.pick(names.first)} ${rng.pick(names.last)}`;
  return { id: `${clubId}-${number}`, name, number, position: role, age: rng.int(18, 34), attrs };
}

function buildClub(s: ClubSeed): ClubData {
  const coach = s.coach ?? `staff-${s.id}`;
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
    // Mostly local names, with a few signings from abroad.
    const country = leagueById(s.league).country;
    const pool = country !== 'intl' && rng.chance(0.7) ? NAMES_BY_COUNTRY[country] : undefined;
    return generatePlayer(rng, role, level, n, s.id, pool);
  });
  return {
    id: s.id, name: s.name, short: s.short, city: s.city,
    colors: { primary: s.primary, secondary: s.secondary, text: s.text },
    keeperColors: { primary: '#10b981', text: '#052e16' },
    tactics: coachTactics(coachById(coach)!), coachId: coach, players,
  };
}

/** A youngster from the club's academy (refills a squad that sold players). */
export function academyPlayer(clubId: string, role: Role, rng: Rng, number: number, id: string): PlayerData {
  const s = CLUB_SEEDS.find((x) => x.id === clubId)!;
  const country = leagueById(s.league).country;
  const pool = country !== 'intl' ? NAMES_BY_COUNTRY[country] : undefined;
  const p = generatePlayer(rng, role, s.strength - 7, number, clubId, pool);
  return { ...p, id, age: rng.int(17, 19) };
}

/** Every club in the game, across all leagues. */
export const CLUBS: ClubData[] = CLUB_SEEDS.map(buildClub);

/** Clubs of one league. */
export const leagueClubs = (leagueId: string): ClubData[] => leagueClubIds(leagueId).map(clubById);

export function clubById(id: string): ClubData {
  const c = CLUBS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown club ${id}`);
  return c;
}
