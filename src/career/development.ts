import { academyPlayer, clubById } from '../data/clubs';
import { coachById } from '../data/coaches';
import { WEIGHTS } from '../engine/attributes';
import type { PlayerReport } from '../engine/match';
import { Rng, hashString } from '../engine/rng';
import type { Attributes, ClubData, CoachTraits, PlayerData } from '../engine/types';
import type { CareerState } from './career';
import { setSquad, squadOf } from './market';
import { potential, rating } from './players';

/**
 * Player condition and development in the manager career.
 *
 * Every round of the season: players who missed it through injury or suspension count it off,
 * the match takes its toll (minutes cost condition, injuries and cards come from the engine's
 * report), and the week of training brings condition back and moves the user's players towards
 * their potential — or, past thirty, slowly away from their peak. Between seasons everyone ages:
 * AI squads develop in one step and veterans retire, replaced by academy players.
 */

export type Intensity = 'low' | 'normal' | 'high';
export type Focus = 'balanced' | 'attack' | 'defence' | 'physical';
export interface Training {
  intensity: Intensity;
  focus: Focus;
}
export const DEFAULT_TRAINING: Training = { intensity: 'normal', focus: 'balanced' };

export type InjuryKind = 'knock' | 'muscle' | 'ankle' | 'hamstring' | 'knee' | 'ligament';

/** Injury types with how many matches they keep a player out, and how common they are. */
export const INJURIES: Record<InjuryKind, { ru: string; en: string; min: number; max: number; w: number }> = {
  knock: { ru: 'Ушиб', en: 'Knock', min: 1, max: 1, w: 38 },
  muscle: { ru: 'Мышечная травма', en: 'Muscle strain', min: 1, max: 3, w: 26 },
  ankle: { ru: 'Травма голеностопа', en: 'Ankle injury', min: 2, max: 4, w: 15 },
  hamstring: { ru: 'Надрыв задней поверхности бедра', en: 'Hamstring tear', min: 3, max: 6, w: 12 },
  knee: { ru: 'Травма колена', en: 'Knee injury', min: 5, max: 9, w: 7 },
  ligament: { ru: 'Разрыв связок', en: 'Ruptured ligament', min: 10, max: 20, w: 2 },
};
const KINDS = Object.keys(INJURIES) as InjuryKind[];

export interface PlayerStatus {
  /** Condition, 30 … 100. */
  c: number;
  inj?: { k: InjuryKind; r: number };
  /** Matches still to serve. */
  ban?: number;
  /** Yellow cards towards the next ban (five = one match). */
  yc?: number;
  /** Fractional attribute points banked by training (negative while declining). */
  prog?: number;
  /** Appearances this season. */
  apps?: number;
  /** Rating at the start of the season (or on arrival), to show progress. */
  r0?: number;
}

const FRESH: PlayerStatus = { c: 100 };
const YELLOW_LIMIT = 5;
/** Rounds in a typical season, to turn the weekly development rate into a yearly one. */
const ROUNDS_PER_SEASON = 18;

export function statusOf(state: CareerState, playerId: string): PlayerStatus {
  return state.fitness?.[playerId] ?? FRESH;
}

function mut(state: CareerState, playerId: string): PlayerStatus {
  state.fitness ??= {};
  return (state.fitness[playerId] ??= { c: 100 });
}

export type Absence = 'injury' | 'ban';

export function absence(state: CareerState, playerId: string): Absence | null {
  const s = statusOf(state, playerId);
  if (s.inj) return 'injury';
  if (s.ban) return 'ban';
  return null;
}

/**
 * The players a club can pick for its next match, carrying their condition into the engine.
 * If injuries and bans leave fewer than eleven (or no keeper), the least-hurt return early.
 */
export function matchSquad(state: CareerState, clubId: string): PlayerData[] {
  const squad = squadOf(state, clubId);
  const withCond = (p: PlayerData, c = statusOf(state, p.id).c) => ({ ...p, condition: c / 100 });
  const fit = squad.filter((p) => !absence(state, p.id)).map((p) => withCond(p));
  const out = [...squad.filter((p) => absence(state, p.id))].sort((a, b) => (statusOf(state, a.id).inj?.r ?? 0) - (statusOf(state, b.id).inj?.r ?? 0));
  while ((fit.length < 11 || !fit.some((p) => p.position === 'GK')) && out.length) {
    const i = fit.some((p) => p.position === 'GK') ? 0 : Math.max(0, out.findIndex((p) => p.position === 'GK'));
    fit.push(withCond(out.splice(i, 1)[0], 60));
  }
  return fit;
}

export function matchClub(state: CareerState, clubId: string): ClubData {
  return { ...clubById(clubId), players: matchSquad(state, clubId) };
}

/** Coaching attributes of whoever runs a club this season (the created coach for the user's club). */
function coachTraits(state: CareerState, clubId: string): CoachTraits | undefined {
  const id = state.coaches[clubId];
  return id === 'player' ? state.coach.traits : coachById(id)?.traits;
}

function rollInjury(rng: Rng, minor = false): { k: InjuryKind; r: number } {
  const kinds = minor ? KINDS.slice(0, 2) : KINDS;
  const k = kinds[rng.weighted(kinds.map((x) => INJURIES[x].w))];
  return { k, r: rng.int(INJURIES[k].min, INJURIES[k].max) };
}

const matchesWord = (n: number) => (n === 1 ? 'матч' : n < 5 ? 'матча' : 'матчей');

function news(state: CareerState, ru: string, en: string) {
  state.news.unshift({ season: state.season, ru, en });
  state.news = state.news.slice(0, 30);
}

// ───────────────────────────── one round ──

/** Highest round whose fixtures have all been played. */
export function completeRound(state: CareerState): number {
  const pending = state.league.fixtures.filter((f) => !f.result);
  const firstPending = pending.length ? Math.min(...pending.map((f) => f.round)) : Infinity;
  return Math.min(firstPending - 1, Math.max(...state.league.fixtures.map((f) => f.round)));
}

/** Processes every fully played round not yet processed. Safe to call any time. */
export function processRounds(state: CareerState): void {
  const upTo = completeRound(state);
  for (let r = (state.devRound ?? 0) + 1; r <= upTo; r++) {
    const fixtures = state.league.fixtures.filter((f) => f.round === r);
    const played = new Set<string>();
    serveAbsences(state);
    for (const f of fixtures) {
      const report = state.reports?.[f.id];
      if (report) applyReport(state, report, r, played);
      if (state.reports) delete state.reports[f.id];
    }
    recover(state, r);
    developWeek(state, r, played);
    state.devRound = r;
  }
}

/** Injured and suspended players have missed this round: one match less to go. */
function serveAbsences(state: CareerState): void {
  const ids = new Set(state.league.clubs.flatMap((c) => squadOf(state, c).map((p) => p.id)));
  for (const [id, s] of Object.entries(state.fitness ?? {})) {
    if (!ids.has(id)) continue;
    if (s.inj) {
      s.inj.r--;
      if (s.inj.r <= 0) {
        delete s.inj;
        s.c = Math.min(s.c, 72); // back in training, short of match sharpness
      }
    } else if (s.ban) {
      s.ban--;
      if (s.ban <= 0) delete s.ban;
    }
  }
}

function applyReport(state: CareerState, report: PlayerReport[], round: number, played: Set<string>): void {
  const mine = new Map(squadOf(state, state.clubId).map((p) => [p.id, p]));
  const all = new Map<string, PlayerData>();
  for (const c of state.league.clubs) for (const p of squadOf(state, c)) all.set(p.id, p);
  for (const r of report) {
    const p = all.get(r.id);
    if (!p) continue;
    const s = mut(state, r.id);
    if (r.minutes > 0) {
      played.add(r.id);
      s.apps = (s.apps ?? 0) + 1;
      // A full match costs ~20–25 points of condition; fitter players lose less.
      s.c = Math.max(30, s.c - (r.minutes / 90) * (34 - p.attrs.stamina * 0.15));
    }
    const user = mine.has(r.id);
    if (r.injured) {
      s.inj = rollInjury(new Rng(hashString(`inj-${state.seed}-${state.season}-${round}-${r.id}`)));
      // A better medical centre gets players back sooner (owner mode).
      if (user && state.boosts?.injury) s.inj.r = Math.max(1, Math.round(s.inj.r * state.boosts.injury));
      const k = INJURIES[s.inj.k];
      if (user) news(state, `${p.name}: ${k.ru.toLowerCase()}, пропустит ${s.inj.r} ${matchesWord(s.inj.r)}.`, `${p.name}: ${k.en.toLowerCase()}, out for ${s.inj.r} match${s.inj.r === 1 ? '' : 'es'}.`);
    }
    if (r.red) {
      s.ban = (s.ban ?? 0) + (r.red === 2 ? 2 : 1);
      if (user) news(state, `${p.name} дисквалифицирован на ${s.ban} ${matchesWord(s.ban)} после удаления.`, `${p.name} is suspended for ${s.ban} match${s.ban === 1 ? '' : 'es'} after his red card.`);
    }
    if (r.yellows) {
      s.yc = (s.yc ?? 0) + r.yellows;
      if (s.yc >= YELLOW_LIMIT) {
        s.yc -= YELLOW_LIMIT;
        s.ban = (s.ban ?? 0) + 1;
        if (user) news(state, `${p.name} пропустит матч из-за перебора жёлтых карточек.`, `${p.name} will miss a match through yellow-card accumulation.`);
      }
    }
  }
}

/** A week of training: condition comes back; hard sessions bring it back slower and risk knocks. */
function recover(state: CareerState, round: number): void {
  const intensity = (state.training ?? DEFAULT_TRAINING).intensity;
  for (const clubId of state.league.clubs) {
    const user = clubId === state.clubId;
    const fit = coachTraits(state, clubId)?.fitness ?? 10;
    const rng = new Rng(hashString(`week-${state.seed}-${state.season}-${round}-${clubId}`));
    const risk = user ? { low: 0.001, normal: 0.003, high: 0.008 }[intensity] : 0.003;
    for (const p of squadOf(state, clubId)) {
      const cur = statusOf(state, p.id);
      const rec = 13 + p.attrs.stamina * 0.07 + (fit - 10) * 0.5 - Math.max(0, p.age - 30) * 0.6 + (user ? { low: 4, normal: 0, high: -3 }[intensity] : 0) + (user ? state.boosts?.recovery ?? 0 : 0);
      const hurt = !cur.inj && rng.chance(risk * (cur.c < 60 ? 2 : 1));
      if (cur === FRESH && !hurt) continue;
      const s = mut(state, p.id);
      if (!s.inj) s.c = Math.min(100, s.c + rec);
      if (hurt) {
        s.inj = rollInjury(rng, true);
        if (user) news(state, `${p.name} травмировался на тренировке (${INJURIES[s.inj.k].ru.toLowerCase()}).`, `${p.name} picked up a ${INJURIES[s.inj.k].en.toLowerCase()} in training.`);
      }
    }
  }
}

// ───────────────────────────── development ──

/** Attribute points a player gains (or loses) per week of training at a given age. */
export function ageRate(age: number): number {
  return age <= 20 ? 0.5 : age <= 23 ? 0.35 : age <= 26 ? 0.18 : age <= 29 ? 0.05 : age <= 31 ? -0.12 : age <= 33 ? -0.25 : -0.4;
}

const FOCUS: Record<Focus, (keyof Attributes)[]> = {
  balanced: [],
  attack: ['shooting', 'dribbling', 'firstTouch', 'composure', 'vision'],
  defence: ['tackling', 'positioning', 'heading'],
  physical: ['pace', 'acceleration', 'stamina'],
};
const PHYSICAL: (keyof Attributes)[] = ['pace', 'acceleration', 'stamina'];

/** Which attribute moves: growth follows the position (and the training focus); decline hits the legs first. */
function pickAttr(p: PlayerData, rng: Rng, focus: Focus, decline: boolean): keyof Attributes {
  if (decline && rng.chance(0.65)) return rng.pick(PHYSICAL);
  const w = { ...WEIGHTS[p.position] } as Partial<Record<keyof Attributes, number>>;
  if (!decline) for (const k of FOCUS[focus]) w[k] = (w[k] ?? 0.6) * 2.5;
  const keys = Object.keys(w) as (keyof Attributes)[];
  return keys[rng.weighted(keys.map((k) => w[k]!))];
}

/** Applies whole attribute points; growth never pushes the rating past the potential. */
function applyPoints(p: PlayerData, points: number, rng: Rng, focus: Focus): PlayerData {
  const attrs = { ...p.attrs };
  const q = { ...p, attrs };
  const pot = potential(p);
  for (let i = 0; i < Math.abs(points); i++) {
    if (points > 0 && rating(q) >= pot) break;
    const k = pickAttr(q, rng, focus, points < 0);
    attrs[k] = Math.max(10, Math.min(97, attrs[k] + Math.sign(points)));
  }
  return q;
}

/** Weekly rate for one player: age, room to grow, training and match minutes. */
function weeklyRate(p: PlayerData, training: Training, playedThisRound: boolean, coachBoost: number): number {
  let rate = ageRate(p.age);
  if (rate > 0) {
    rate *= Math.max(0, Math.min(1, (potential(p) - rating(p)) / 5));
    rate *= { low: 0.75, normal: 1, high: 1.3 }[training.intensity];
    rate *= (playedThisRound ? 1.25 : 1) * coachBoost;
  } else if (training.focus === 'physical') {
    rate *= 0.75; // conditioning work slows the decline
  }
  return rate;
}

function developWeek(state: CareerState, round: number, played: Set<string>): void {
  const training = state.training ?? DEFAULT_TRAINING;
  const t = state.coach.traits;
  // Coaches who are good at conditioning and organisation get more out of training.
  const coachBoost = (1 + ((t.fitness + t.organisation) / 2 - 12) * 0.03) * (state.boosts?.dev ?? 1);
  const rng = new Rng(hashString(`dev-${state.seed}-${state.season}-${round}`));
  let changed = false;
  const squad = squadOf(state, state.clubId).map((p0) => {
    const p = p0.potential === undefined ? { ...p0, potential: potential(p0) } : p0;
    const s = mut(state, p.id);
    s.r0 ??= rating(p);
    if (s.inj) return p;
    s.prog = (s.prog ?? 0) + weeklyRate(p, training, played.has(p.id), coachBoost);
    const whole = Math.trunc(s.prog);
    if (!whole) return p;
    s.prog -= whole;
    changed = true;
    return applyPoints(p, whole, rng, training.focus);
  });
  if (changed || squad.some((p, i) => p !== squadOf(state, state.clubId)[i])) setSquad(state, state.clubId, squad);
}

/**
 * A year passes for one squad: everyone ages, AI players develop in one step and veterans
 * retire (replaced from the academy). The user's players develop week by week instead.
 */
function yearlyStep(players: PlayerData[], clubId: string, season: number, seed: number, user: boolean): { players: PlayerData[]; retired: PlayerData[]; promoted: PlayerData[] } {
  const rng = new Rng(hashString(`year-${seed}-${clubId}-${season}`));
  const retired: PlayerData[] = [];
  const kept: PlayerData[] = [];
  for (const p0 of players) {
    const p = p0.potential === undefined ? { ...p0, potential: potential(p0) } : p0;
    const age = p.age + 1;
    const retire = age >= 38 || (age >= 35 && rng.chance(age === 35 ? 0.35 : age === 36 ? 0.6 : 0.85));
    if (retire && (!user || age >= 36)) {
      retired.push(p);
      continue;
    }
    if (user) {
      kept.push({ ...p, age });
      continue;
    }
    const pts = Math.round(ageRate(p.age) * ROUNDS_PER_SEASON * (0.6 + rng.next() * 0.8) * (ageRate(p.age) > 0 ? Math.max(0, Math.min(1, (potential(p) - rating(p)) / 5)) : 1));
    kept.push({ ...applyPoints(p, pts, rng, 'balanced'), age });
  }
  const promoted: PlayerData[] = [];
  const target = user ? 18 : 20;
  let i = 0;
  while (kept.length < target) {
    const role = retired[i]?.position ?? 'CM';
    const used = new Set(kept.map((p) => p.number));
    let n = retired[i]?.number ?? 30;
    while (used.has(n)) n++;
    const y = academyPlayer(clubId, role, rng, n, `${clubId}-y${season}-${i}`);
    kept.push(y);
    promoted.push(y);
    i++;
  }
  return { players: kept, retired, promoted };
}

const agedCache = new Map<string, PlayerData[]>();

/** The generated squad of a club nobody has traded with, aged to the current season. */
export function agedSquad(state: CareerState, clubId: string): PlayerData[] {
  let players = clubById(clubId).players;
  if (state.season <= 1) return players;
  const key = `${state.seed}|${clubId}|${state.season}`;
  const hit = agedCache.get(key);
  if (hit) return hit;
  for (let k = 1; k < state.season; k++) players = yearlyStep(players, clubId, k, state.seed, false).players;
  if (agedCache.size > 400) agedCache.clear();
  agedCache.set(key, players);
  return players;
}

/** End of season → start of the next: squads age, condition resets after the break, cards are wiped. */
export function seasonRollover(state: CareerState): void {
  for (const clubId of Object.keys(state.squads ?? {})) {
    const user = clubId === state.clubId;
    const { players, retired, promoted } = yearlyStep(state.squads![clubId], clubId, state.season, state.seed, user);
    state.squads![clubId] = players;
    if (user) {
      for (const p of retired) news(state, `${p.name} (${p.age + 1}) завершил карьеру.`, `${p.name} (${p.age + 1}) has retired.`);
      for (const p of promoted) news(state, `${p.name} переведён из академии в основную команду.`, `${p.name} promoted from the academy.`);
    }
  }
  // The summer break: everyone is fit again, long injuries shrink by the weeks off, cards are forgotten.
  for (const s of Object.values(state.fitness ?? {})) {
    s.c = 100;
    if (s.inj) {
      s.inj.r -= 4;
      if (s.inj.r <= 0) delete s.inj;
    }
    delete s.yc;
    delete s.apps;
    delete s.r0;
  }
  state.devRound = 0;
  state.reports = {};
}

/** Seeds the "rating at season start" marks for the user's squad. */
export function markSeasonStart(state: CareerState): void {
  for (const p of squadOf(state, state.clubId)) mut(state, p.id).r0 = rating(p);
}
