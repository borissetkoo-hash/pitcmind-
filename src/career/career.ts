import { type Coach, COACHES, coachById, coachTactics } from '../data/coaches';
import { leagueClubIds, leagueOf } from '../data/clubSeeds';
import { clubById, leagueClubs } from '../data/clubs';
import { overall } from '../engine/attributes';
import { FORMATIONS } from '../engine/formations';
import { Rng } from '../engine/rng';
import { pickLineup } from '../engine/team';
import type { CoachTraits, FormationId, Tactics } from '../engine/types';
import { computeTable, type Fixture, type FixtureResult, newSeason, nextRound, type SeasonState } from '../league/league';
import type { AvatarLook } from './avatar';
import { type MarketState, closeSeasonMarket, initMarket, resetMarketForClub } from './market';
import { DEFAULT_TRAINING, type PlayerStatus, type Training, markSeasonStart, seasonRollover } from './development';
import type { PlayerReport } from '../engine/match';
import type { PlayerData } from '../engine/types';

export const PLAYER_COACH = 'player';
const FIRST_YEAR = 2026;

export type CoachStyleId = 'balanced' | 'possession' | 'pressing' | 'defensive' | 'counter' | 'direct';

/** Starting philosophies for a created coach: a set-up plus modest attributes that grow over a career. */
export const STYLES: Record<CoachStyleId, { formation: FormationId; tactics: Omit<Tactics, 'formation'>; traits: CoachTraits; focus: (keyof CoachTraits)[] }> = {
  balanced: {
    formation: '4-2-3-1',
    tactics: { mentality: 0, pressing: 0.55, lineHeight: 0.55, width: 0.6, directness: 0.45, tempo: 0.55, shootingRange: 0.5, crossing: 0.5, tackling: 0.5 },
    traits: { passing: 12, organisation: 12, pressing: 12, counter: 12, setPieces: 12, aerial: 12, fitness: 12 },
    focus: ['organisation', 'passing'],
  },
  possession: {
    formation: '4-3-3',
    tactics: { mentality: 0.5, pressing: 0.65, lineHeight: 0.65, width: 0.7, directness: 0.2, tempo: 0.45, shootingRange: 0.4, crossing: 0.4, tackling: 0.45 },
    traits: { passing: 15, organisation: 11, pressing: 13, counter: 10, setPieces: 11, aerial: 10, fitness: 12 },
    focus: ['passing', 'pressing'],
  },
  pressing: {
    formation: '4-3-3',
    tactics: { mentality: 0.5, pressing: 0.85, lineHeight: 0.7, width: 0.65, directness: 0.5, tempo: 0.75, shootingRange: 0.5, crossing: 0.5, tackling: 0.65 },
    traits: { passing: 12, organisation: 11, pressing: 15, counter: 13, setPieces: 10, aerial: 11, fitness: 14 },
    focus: ['pressing', 'fitness'],
  },
  defensive: {
    formation: '4-4-2',
    tactics: { mentality: -1, pressing: 0.45, lineHeight: 0.35, width: 0.5, directness: 0.6, tempo: 0.5, shootingRange: 0.55, crossing: 0.6, tackling: 0.65 },
    traits: { passing: 10, organisation: 15, pressing: 11, counter: 13, setPieces: 13, aerial: 13, fitness: 12 },
    focus: ['organisation', 'setPieces'],
  },
  counter: {
    formation: '4-2-3-1',
    tactics: { mentality: -0.5, pressing: 0.5, lineHeight: 0.4, width: 0.6, directness: 0.7, tempo: 0.75, shootingRange: 0.55, crossing: 0.55, tackling: 0.55 },
    traits: { passing: 11, organisation: 13, pressing: 12, counter: 15, setPieces: 11, aerial: 12, fitness: 13 },
    focus: ['counter', 'organisation'],
  },
  direct: {
    formation: '4-4-2',
    tactics: { mentality: 0, pressing: 0.55, lineHeight: 0.45, width: 0.6, directness: 0.85, tempo: 0.6, shootingRange: 0.6, crossing: 0.8, tackling: 0.65 },
    traits: { passing: 9, organisation: 13, pressing: 12, counter: 12, setPieces: 14, aerial: 15, fitness: 13 },
    focus: ['aerial', 'setPieces'],
  },
};
export const STYLE_IDS = Object.keys(STYLES) as CoachStyleId[];

export interface CareerCoach {
  firstName: string;
  lastName: string;
  flag: string;
  look: AvatarLook;
  style: CoachStyleId;
  traits: CoachTraits;
}

export interface SeasonRecord {
  season: number;
  label: string;
  clubId: string;
  position: number;
  pts: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  target: number;
  met: boolean;
  champion: boolean;
}

export interface NewsItem {
  season: number;
  ru: string;
  en: string;
}

export interface SeasonSummary {
  position: number;
  target: number;
  met: boolean;
  champion: boolean;
  growth: Partial<CoachTraits>;
  confidenceDelta: number;
  sacked: boolean;
  /** Prize money paid into the transfer budget (€M). */
  prize?: number;
}

export interface CareerState {
  version: 1;
  seed: number;
  coach: CareerCoach;
  clubId: string;
  season: number;
  league: SeasonState;
  /** Head coach of every club this season (the user's club maps to PLAYER_COACH). */
  coaches: Record<string, string>;
  tactics: Tactics;
  confidence: number;
  reputation: number;
  history: SeasonRecord[];
  news: NewsItem[];
  status: 'active' | 'seasonOver' | 'sacked';
  lastSummary: SeasonSummary | null;
  /** Rosters of clubs that changed since the start (transfers, loans); others use the generated squad. */
  squads?: Record<string, PlayerData[]>;
  market?: MarketState;
  /** Condition, injuries, suspensions and training progress per player (clubs of the career's league). */
  fitness?: Record<string, PlayerStatus>;
  training?: Training;
  /** Last round whose fatigue, injuries and development have been applied. */
  devRound?: number;
  /** Player reports of played fixtures waiting for their round to be processed. */
  reports?: Record<number, PlayerReport[]>;
}

export const seasonLabel = (season: number) => `${FIRST_YEAR + season - 1}/${String((FIRST_YEAR + season) % 100).padStart(2, '0')}`;

/** Clubs ranked by squad strength (best XI in their usual formation), strongest first. */
export function strengthRanking(clubIds: string[]): string[] {
  const score = (id: string) => {
    const c = clubById(id);
    const slots = FORMATIONS[c.tactics.formation];
    const { lineup } = pickLineup(c.players, slots);
    return lineup.reduce((s, p, i) => s + overall(p.attrs, slots[i].role), 0) / lineup.length;
  };
  return [...clubIds].sort((a, b) => score(b) - score(a));
}

/** The board's minimum acceptable league position for a club, from its standing in its league. */
export function boardTarget(clubId: string, clubIds: string[] = leagueClubIds(leagueOf(clubId))): number {
  const rank = strengthRanking(clubIds).indexOf(clubId) + 1;
  if (rank <= 1) return 1;
  if (rank <= 2) return 2;
  if (rank <= 4) return 4;
  if (rank <= 6) return 6;
  return clubIds.length - 1; // avoid finishing bottom
}

export function newCareer(coach: CareerCoach, clubId: string, seed: number): CareerState {
  const leagueId = leagueOf(clubId);
  const clubs = leagueClubs(leagueId);
  const coaches: Record<string, string> = {};
  for (const c of clubs) coaches[c.id] = c.coachId ?? 'ancelotti';
  const replaced = coaches[clubId];
  coaches[clubId] = PLAYER_COACH;
  const club = clubById(clubId);
  const style = STYLES[coach.style];
  const old = coachById(replaced);
  const state: CareerState = {
    version: 1,
    seed,
    coach,
    clubId,
    season: 1,
    league: newSeason(clubs, seed, leagueId),
    coaches,
    tactics: { formation: style.formation, ...style.tactics },
    confidence: 60,
    reputation: 20,
    history: [],
    news: [
      {
        season: 1,
        ru: `${coach.firstName} ${coach.lastName} назначен главным тренером «${club.name}»${old ? ` вместо ${old.nameRu}` : ''}.`,
        en: `${coach.firstName} ${coach.lastName} appointed head coach of ${club.name}${old ? `, replacing ${old.name}` : ''}.`,
      },
    ],
    status: 'active',
    lastSummary: null,
    squads: {},
    fitness: {},
    training: { ...DEFAULT_TRAINING },
    devRound: 0,
    reports: {},
  };
  state.market = initMarket(state);
  markSeasonStart(state);
  return state;
}

/** The created coach as a regular Coach, so every existing coach UI and the engine accept him. */
export function playerCoach(state: CareerState): Coach & { look: AvatarLook } {
  const c = state.coach;
  const name = `${c.firstName} ${c.lastName}`.trim();
  return {
    id: PLAYER_COACH,
    name,
    nameRu: name,
    flag: c.flag,
    group: 'custom',
    formations: [state.tactics.formation],
    tactics: { ...state.tactics },
    traits: { ...c.traits },
    style: { ru: STYLE_TEXT[c.style].ru, en: STYLE_TEXT[c.style].en },
    look: c.look,
  };
}

export const STYLE_TEXT: Record<CoachStyleId, { ru: string; en: string; nameRu: string; nameEn: string }> = {
  balanced: { nameRu: 'Универсал', nameEn: 'All-rounder', ru: 'Сбалансированный подход без явных слабостей.', en: 'A balanced approach with no obvious weaknesses.' },
  possession: { nameRu: 'Владение', nameEn: 'Possession', ru: 'Контроль мяча, короткий пас и терпеливое построение атак.', en: 'Ball control, short passing and patient build-up.' },
  pressing: { nameRu: 'Прессинг', nameEn: 'Pressing', ru: 'Высокий прессинг и интенсивность на всём поле.', en: 'High pressing and intensity all over the pitch.' },
  defensive: { nameRu: 'Оборона', nameEn: 'Defensive', ru: 'Надёжная организация обороны и стандарты.', en: 'Solid defensive organisation and set pieces.' },
  counter: { nameRu: 'Контратаки', nameEn: 'Counter-attack', ru: 'Компактный блок и быстрые переходы в атаку.', en: 'A compact block and quick transitions.' },
  direct: { nameRu: 'Английский стиль', nameEn: 'Direct', ru: 'Длинные передачи, навесы и борьба в воздухе.', en: 'Long balls, crosses and aerial battles.' },
};

/** Coach and tactics for a club in the current career season. */
export function clubSide(state: CareerState, clubId: string): { coach: Coach; tactics: Tactics } {
  const id = state.coaches[clubId];
  if (id === PLAYER_COACH) return { coach: playerCoach(state), tactics: { ...state.tactics } };
  const coach = coachById(id) ?? COACHES[0];
  return { coach, tactics: coachTactics(coach) };
}

/** The user's next unplayed fixture this season, if any. */
export function nextUserFixture(state: CareerState): Fixture | null {
  const pending = state.league.fixtures.filter((f) => !f.result && (f.home === state.clubId || f.away === state.clubId));
  pending.sort((a, b) => a.round - b.round);
  return pending[0] ?? null;
}

/** Fixtures of the given round still to be played, excluding the user's. */
export function otherFixtures(state: CareerState, round: number): Fixture[] {
  return state.league.fixtures.filter((f) => f.round === round && !f.result && f.home !== state.clubId && f.away !== state.clubId);
}

export function recordResult(state: CareerState, fixtureId: number, result: FixtureResult): void {
  const f = state.league.fixtures.find((x) => x.id === fixtureId);
  if (!f) return;
  // The player report only lives until its round is processed (fatigue, injuries, cards).
  const { report, ...rest } = result;
  f.result = rest;
  if (report) (state.reports ??= {})[fixtureId] = report;
}

export const seasonComplete = (state: CareerState) => nextRound(state.league) === null;

export function userRecord(state: CareerState) {
  return computeTable(state.league.clubs, state.league.fixtures).find((r) => r.club === state.clubId)!;
}

export function userPosition(state: CareerState): number {
  return computeTable(state.league.clubs, state.league.fixtures).findIndex((r) => r.club === state.clubId) + 1;
}

/** Board verdict, reputation and attribute growth at the end of a season. */
export function endSeason(state: CareerState): SeasonSummary {
  const table = computeTable(state.league.clubs, state.league.fixtures);
  const position = table.findIndex((r) => r.club === state.clubId) + 1;
  const row = table[position - 1];
  const target = boardTarget(state.clubId, state.league.clubs);
  const met = position <= target;
  const champion = position === 1;
  const confidenceDelta = champion ? 35 : met ? 20 : position - target === 1 ? -15 : -35;
  state.confidence = Math.max(0, Math.min(100, state.confidence + confidenceDelta));
  state.reputation = Math.min(100, state.reputation + (champion ? 18 : met ? 8 : position <= state.league.clubs.length / 2 ? 3 : 0));

  // Coaching attributes grow with experience: the style's focus areas every season,
  // plus extra points for a successful one.
  const growth: Partial<CoachTraits> = {};
  const bump = (k: keyof CoachTraits) => {
    if (state.coach.traits[k] >= 20) return;
    state.coach.traits[k]++;
    growth[k] = (growth[k] ?? 0) + 1;
  };
  const rng = new Rng(state.seed * 31 + state.season);
  if (position - target <= 2) for (const k of STYLES[state.coach.style].focus) bump(k);
  const keys = Object.keys(state.coach.traits) as (keyof CoachTraits)[];
  if (met) bump(keys[rng.int(0, keys.length - 1)]);
  if (champion) {
    bump(keys[rng.int(0, keys.length - 1)]);
    bump(keys[rng.int(0, keys.length - 1)]);
  }

  state.history.push({
    season: state.season, label: seasonLabel(state.season), clubId: state.clubId, position, pts: row.pts,
    w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, target, met, champion,
  });
  const club = clubById(state.clubId);
  state.news.unshift(
    champion
      ? { season: state.season, ru: `«${club.name}» — чемпион сезона ${seasonLabel(state.season)}!`, en: `${club.name} are champions of ${seasonLabel(state.season)}!` }
      : { season: state.season, ru: `Сезон ${seasonLabel(state.season)} завершён: ${position}-е место.`, en: `Season ${seasonLabel(state.season)} over: finished ${position}${ordinal(position)}.` },
  );
  const sacked = state.confidence < 15;
  const prize = closeSeasonMarket(state, position);
  state.status = sacked ? 'sacked' : 'seasonOver';
  state.lastSummary = { position, target, met, champion, growth, confidenceDelta, sacked, prize };
  return state.lastSummary;
}

const ordinal = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/**
 * Starts the next season: a fresh fixture list, and a few AI clubs change their head coach,
 * so over a career the user meets most of the coaching pool.
 */
export function startNextSeason(state: CareerState, newClubId?: string): void {
  const rng = new Rng(state.seed * 7 + state.season * 104729);
  seasonRollover(state);
  if (newClubId && newClubId !== state.clubId) {
    // Fresh start elsewhere after a sacking: the user's old club hires someone new.
    const free = COACHES.filter((c) => !Object.values(state.coaches).includes(c.id));
    state.coaches[state.clubId] = free[rng.int(0, free.length - 1)].id;
    const displaced = state.coaches[newClubId];
    state.coaches[newClubId] = PLAYER_COACH;
    state.clubId = newClubId;
    state.confidence = 55;
    resetMarketForClub(state);
    const club = clubById(newClubId);
    const old = coachById(displaced);
    state.news.unshift({
      season: state.season + 1,
      ru: `Новый вызов: ${state.coach.firstName} ${state.coach.lastName} возглавил «${club.name}»${old ? ` вместо ${old.nameRu}` : ''}.`,
      en: `A new challenge: ${state.coach.firstName} ${state.coach.lastName} takes over at ${club.name}${old ? `, replacing ${old.name}` : ''}.`,
    });
  }
  const aiClubs = state.league.clubs.filter((id) => state.coaches[id] !== PLAYER_COACH);
  const changes = 2 + rng.int(0, 1);
  for (let i = 0; i < changes; i++) {
    const clubId = aiClubs[rng.int(0, aiClubs.length - 1)];
    const free = COACHES.filter((c) => !Object.values(state.coaches).includes(c.id));
    if (!free.length) break;
    const incoming = free[rng.int(0, free.length - 1)];
    const outgoing = coachById(state.coaches[clubId]);
    state.coaches[clubId] = incoming.id;
    const club = clubById(clubId);
    state.news.unshift({
      season: state.season + 1,
      ru: `«${club.name}» меняет тренера: ${outgoing?.nameRu ?? '—'} уходит, приходит ${incoming.nameRu}.`,
      en: `${club.name} change coach: ${outgoing?.name ?? '—'} leaves, ${incoming.name} arrives.`,
    });
  }
  state.season++;
  state.league = newSeason(state.league.clubs.map(clubById), (state.seed + state.season * 7919) >>> 0, state.league.leagueId);
  state.status = 'active';
  state.lastSummary = null;
  markSeasonStart(state);
  state.news = state.news.slice(0, 30);
}

/** Clubs that would hire a sacked coach: those with modest expectations. */
export function jobOffers(state: CareerState): string[] {
  const ranking = strengthRanking(state.league.clubs);
  return ranking.slice(-4).filter((id) => id !== state.clubId).slice(-2);
}

export function careerTotals(state: CareerState) {
  const all = [...state.history];
  const cur = state.status === 'active' ? userRecord(state) : null;
  const sum = (k: 'w' | 'd' | 'l' | 'gf' | 'ga') => all.reduce((a, h) => a + h[k], 0) + (cur ? cur[k] : 0);
  return { w: sum('w'), d: sum('d'), l: sum('l'), gf: sum('gf'), ga: sum('ga'), titles: all.filter((h) => h.champion).length };
}
