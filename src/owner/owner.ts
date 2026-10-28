import { DEFAULT_LOOK } from '../career/avatar';
import { type CareerState, boardTarget, seasonLabel, startNextSeason } from '../career/career';
import { DEFAULT_TRAINING, markSeasonStart, statusOf } from '../career/development';
import { closeSeasonMarket, ensureMarket, initMarket, leagueWealth, rating, setSquad, squadOf, squadValue, wageBill, wageOf } from '../career/market';
import type { PlayerData } from '../engine/types';
import { CLUB_SEEDS, leagueOf } from '../data/clubSeeds';
import { academyPlayer, clubById, leagueClubs, SQUAD } from '../data/clubs';
import { ALL_COACHES, type Coach, COACHES, coachById } from '../data/coaches';
import { FIRST_NAMES, LAST_NAMES, NAMES_BY_COUNTRY } from '../data/names';
import { Rng, hashString } from '../engine/rng';
import { computeTable, newSeason, nextRound } from '../league/league';

/**
 * Club Owner mode: the player is not the coach but the person who owns the club — buys it,
 * hires and fires the head coach and the directors, sets budgets and ticket prices, builds
 * facilities, signs sponsors and lives with the consequences. Matches are played by the same
 * engine; the club's coach (a real or generated one) picks the team and the tactics.
 *
 * Money is in €M. A club's economy is anchored to its "market size" M (annual revenue at the
 * time of purchase, ~1.8× its wage bill), so a small Nordic club and an English giant both start
 * roughly break-even — and every decision moves revenue and costs away from that baseline.
 */

export type Archetype = 'president' | 'investor' | 'visionary';
export type StaffRole = 'sd' | 'fd' | 'academy';
export type FacilityKind = 'stadium' | 'training' | 'academy' | 'medical' | 'commercial';
export type Strategy = 'winNow' | 'balanced' | 'youth';
export type TicketPolicy = 'low' | 'normal' | 'high';

export const ARCHETYPES: Record<Archetype, { capital: number; leverage: number; rate: number; rep: number; ru: string; en: string; nameRu: string; nameEn: string; goalRu: string; goalEn: string }> = {
  president: {
    capital: 1300, leverage: 0.3, rate: 0.06, rep: 40, nameRu: 'Президент-строитель', nameEn: 'Galáctico president',
    ru: 'Глобальный бренд, суперзвёзды и большие трофеи. Коммерция растёт быстрее, но болельщики ждут титулов.',
    en: 'A global brand, superstars and the biggest trophies. Commercial income grows faster, but the fans expect titles.',
    goalRu: 'Выполнить задачу по месту и вырастить бренд', goalEn: 'Meet the league target and grow the brand',
  },
  investor: {
    capital: 600, leverage: 0.65, rate: 0.045, rep: 25, nameRu: 'Владелец-инвестор', nameEn: 'Leveraged investor',
    ru: 'Покупка в долг, денежные потоки и стоимость клуба. Дешёвые кредиты, но спортивный крах обойдётся дорого.',
    en: 'A leveraged buyout, cash flow and club value. Cheap credit — but a sporting collapse costs dearly.',
    goalRu: 'Сезон без убытка и рост стоимости клуба', goalEn: 'No loss this season and a higher club value',
  },
  visionary: {
    capital: 850, leverage: 0.4, rate: 0.055, rep: 30, nameRu: 'Амбициозный проект', nameEn: 'Long-term project',
    ru: 'Молодые таланты, инфраструктура и спортивный отдел. Стройка дешевле на 20%, академия сильнее.',
    en: 'Young talent, infrastructure and a modern football department. Building is 20% cheaper, the academy stronger.',
    goalRu: 'Дать игровое время молодёжи и развить базу', goalEn: 'Play the young players and grow the facilities',
  },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as Archetype[];

export const FACILITIES: Record<FacilityKind, { cost: number; rounds: number; ru: string; en: string; effRu: string; effEn: string }> = {
  stadium: { cost: 0.3, rounds: 14, ru: 'Стадион', en: 'Stadium', effRu: '+15% мест — больше дохода от билетов', effEn: '+15% seats — more matchday income' },
  training: { cost: 0.09, rounds: 6, ru: 'Тренировочная база', en: 'Training ground', effRu: 'Быстрее рост игроков и восстановление', effEn: 'Faster development and recovery' },
  academy: { cost: 0.07, rounds: 6, ru: 'Академия', en: 'Academy', effRu: 'Сильнее и талантливее воспитанники', effEn: 'Better, more talented youngsters' },
  medical: { cost: 0.05, rounds: 5, ru: 'Медицинский центр', en: 'Medical centre', effRu: 'Короче травмы, быстрее восстановление', effEn: 'Shorter injuries, faster recovery' },
  commercial: { cost: 0.08, rounds: 6, ru: 'Коммерция и магазины', en: 'Megastore & hospitality', effRu: '+7% коммерческого дохода за уровень', effEn: '+7% commercial income per level' },
};
export const FACILITY_KINDS = Object.keys(FACILITIES) as FacilityKind[];

export interface StaffMember {
  id: string;
  role: StaffRole;
  name: string;
  flag: string;
  age: number;
  /** 1–20. */
  rating: number;
  /** €M a year. */
  wage: number;
  trait: 'negotiator' | 'scout' | 'commercial' | 'costCutter' | 'developer' | 'talentSpotter';
}

export interface CoachContract {
  id: string;
  wage: number;
  years: number;
  /** 0–100: how much the coach trusts the owner (and vice versa). */
  trust: number;
  /** Transfer money (€M) he expects to be given per season. */
  demand: number;
  /** Transfer money handed to him this season. */
  given: number;
}

export interface Project {
  kind: FacilityKind;
  roundsLeft: number;
  cost: number;
}

export interface Sponsor {
  name: string;
  /** €M per season. */
  perSeason: number;
  seasons: number;
  /** Bonus paid for finishing at or above this position. */
  bonusPos: number;
  bonus: number;
}

export type LedgerKey = 'matchday' | 'commercial' | 'sponsor' | 'broadcast' | 'prize' | 'wages' | 'staff' | 'interest' | 'maintenance' | 'operations' | 'other';
export type Ledger = Record<LedgerKey, number>;
export const INCOME_KEYS: LedgerKey[] = ['matchday', 'commercial', 'sponsor', 'broadcast', 'prize'];
export const COST_KEYS: LedgerKey[] = ['wages', 'staff', 'interest', 'maintenance', 'operations'];

export interface OwnerSeason {
  season: number;
  label: string;
  clubId: string;
  position: number;
  target: number;
  revenue: number;
  costs: number;
  profit: number;
  valuation: number;
  goalMet: boolean;
}

export interface DecisionOption {
  id: 'a' | 'b' | 'c';
  ru: string;
  en: string;
  hintRu: string;
  hintEn: string;
  disabled?: boolean;
}

export interface Decision {
  kind: string;
  round: number;
  titleRu: string;
  titleEn: string;
  textRu: string;
  textEn: string;
  options: DecisionOption[];
  data: Record<string, number | string>;
}

export interface OwnerData {
  name: string;
  flag: string;
  archetype: Archetype;
  /** Personal fortune outside the club. */
  wealth: number;
  startWealth: number;
  /** Club bank balance (the transfer budget is kept apart, in the market state). */
  cash: number;
  debt: number;
  /** Annual interest rate on the club's debt. */
  rate: number;
  /** Owner's stake, 0–1. */
  share: number;
  /** Annual revenue at the time of purchase: the yardstick for everything else. */
  size: number;
  /** Matchday reference points from the purchase. */
  capacity0: number;
  capacity: number;
  brand0: number;
  brand: number;
  fanMood: number;
  reputation: number;
  coach: CoachContract | null;
  staff: Partial<Record<StaffRole, StaffMember>>;
  strategy: Strategy;
  tickets: TicketPolicy;
  facilities: Record<FacilityKind, number>;
  projects: Project[];
  sponsor: Sponsor | null;
  sponsorOffers: Sponsor[];
  /** Extra commercial income (naming rights) per season and seasons left. */
  naming: { perSeason: number; seasons: number } | null;
  ledger: Ledger;
  history: OwnerSeason[];
  decision: Decision | null;
  /** Event kinds already seen this season (most fire at most once a season). */
  seen: string[];
  log: { season: number; ru: string; en: string }[];
  /** Last round whose finances were booked. */
  finRound: number;
  seq: number;
  over: null | { reason: 'sold' | 'bankrupt'; season: number; price: number };
  /** The finished season's summary, kept until the next season starts (so a reload can't pay out twice). */
  summary?: OwnerSummary | null;
}

export type OwnerState = CareerState & { mode: 'owner'; owner: OwnerData };

// ───────────────────────────── club profile ──

const seedOf = (clubId: string) => CLUB_SEEDS.find((s) => s.id === clubId)!;
const unit = (s: string) => hashString(s) / 4294967296;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const round1 = (x: number) => Math.round(x * 10) / 10;

export function baseBrand(clubId: string): number {
  return Math.round(clamp(18 + (seedOf(clubId).strength - 65) * 5 + (leagueWealth(clubId) - 1) * 25, 12, 97));
}

export function baseCapacity(clubId: string): number {
  return Math.round(clamp(16 + (seedOf(clubId).strength - 65) * 3.6, 9, 82) * (0.75 + 0.25 * leagueWealth(clubId)));
}

function baseFacilities(clubId: string): Record<FacilityKind, number> {
  const st = seedOf(clubId).strength;
  const base = st >= 80 ? 4 : st >= 74 ? 3 : 2;
  const out = {} as Record<FacilityKind, number>;
  for (const k of FACILITY_KINDS) out[k] = clamp(base + Math.round(unit(`fac-${clubId}-${k}`) * 2 - 1), 1, 5);
  return out;
}

/** Annual revenue of a club as generated: ~1.8× its wage bill. */
export function clubSize(players: PlayerData[]): number {
  const bill = players.reduce((s, p) => s + wageOf(p), 0);
  return round1(((bill * 52) / 1000) * 1.8);
}

/** What a club is worth: revenue times a brand multiple, plus players and facilities, minus debt. */
export function valuation(size: number, brand: number, squad: number, facilities: Record<FacilityKind, number>, debt: number): number {
  const fac = FACILITY_KINDS.reduce((s, k) => s + facilities[k], 0) * size * 0.04;
  return Math.max(5, round1(size * (2.2 + brand / 60) + squad * 0.35 + fac - debt));
}

/** A club on the market before purchase: price, debt it carries, and its profile. */
export function listing(clubId: string) {
  const players = clubById(clubId).players;
  const size = clubSize(players);
  const brand = baseBrand(clubId);
  const facilities = baseFacilities(clubId);
  const debt = round1(size * unit(`debt-${clubId}`) * 0.6);
  const value = valuation(size, brand, squadValue(players), facilities, debt);
  return { clubId, size, brand, facilities, debt, value, asking: round1(value * (1.05 + unit(`ask-${clubId}`) * 0.12)), capacity: baseCapacity(clubId) };
}

/** The seller's walk-away price; offers above it are accepted. */
export const reservePrice = (clubId: string) => round1(listing(clubId).value * (0.93 + unit(`res-${clubId}`) * 0.1));

export function maxLoan(archetype: Archetype, price: number) {
  return round1(price * ARCHETYPES[archetype].leverage);
}

// ───────────────────────────── people ──

const FLAGS: Record<string, string> = { eng: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', esp: '🇪🇸', ita: '🇮🇹', ger: '🇩🇪', bra: '🇧🇷' };

/** Reputation of a coach, 20–99, from his attributes and standing. */
export function coachRep(c: Coach): number {
  const t = c.traits;
  const avg = (t.passing + t.organisation + t.pressing + t.counter + t.setPieces + t.aerial + t.fitness) / 7;
  const bonus = c.group === 'legends' ? 14 : c.group === 'epl' ? 6 : 0;
  return Math.round(clamp((avg - 8) * 8 + bonus, 20, 99));
}

/** Coach's annual wage, €M. */
export const coachWage = (c: Coach) => round1(0.5 + (coachRep(c) / 100) ** 2.2 * 22);

/** Would this coach take the job? The best want a big club or an owner with a name. */
export function coachWilling(o: OwnerData, c: Coach): boolean {
  return coachRep(c) <= o.brand + 25 + o.reputation / 3;
}

/** Free coaches: real ones not working in this league, and generated club coaches from other leagues. */
export function coachCandidates(state: OwnerState): Coach[] {
  const busy = new Set(Object.values(state.coaches));
  const league = state.league.leagueId ?? leagueOf(state.clubId);
  const free = COACHES.filter((c) => !busy.has(c.id));
  const others = ALL_COACHES.filter((c) => c.group === 'staff' && !busy.has(c.id) && leagueOf(c.id.replace('staff-', '')) !== league);
  const rng = new Rng(hashString(`coaches-${state.seed}-${state.season}`));
  const picks = [...others].sort(() => rng.next() - 0.5).slice(0, 6);
  return [...free, ...picks].sort((a, b) => coachRep(b) - coachRep(a));
}

const TRAITS: Record<StaffRole, StaffMember['trait'][]> = {
  sd: ['negotiator', 'scout'],
  fd: ['commercial', 'costCutter'],
  academy: ['developer', 'talentSpotter'],
};

export const staffWage = (rating: number) => round1(0.2 + (rating / 20) ** 3 * 4);

function makeStaff(rng: Rng, role: StaffRole, rating: number, id: string, country: string): StaffMember {
  const pool = NAMES_BY_COUNTRY[country as keyof typeof NAMES_BY_COUNTRY] ?? { first: FIRST_NAMES, last: LAST_NAMES };
  const r = clamp(Math.round(rating), 4, 20);
  return {
    id, role, rating: r, wage: staffWage(r), age: rng.int(34, 66),
    name: `${rng.pick(pool.first)} ${rng.pick(pool.last)}`, flag: FLAGS[country] ?? '🌐', trait: rng.pick(TRAITS[role]),
  };
}

const COUNTRIES = ['eng', 'esp', 'ita', 'ger', 'bra'];

/** Five candidates per role each season, from journeymen to the best in the business. */
export function staffCandidates(state: OwnerState, role: StaffRole): StaffMember[] {
  const rng = new Rng(hashString(`staff-${state.seed}-${state.season}-${role}`));
  return [7, 10, 12, 15, 18].map((r, i) => makeStaff(rng, role, r + rng.int(-1, 2), `${role}-${state.season}-${i}`, rng.pick(COUNTRIES)));
}

/** Top directors only join clubs with a brand (or an owner) to match. */
export const staffWilling = (o: OwnerData, s: StaffMember) => s.rating <= 8 + o.brand / 8 + o.reputation / 12;

// ───────────────────────────── new game ──

export interface OwnerSetup {
  name: string;
  flag: string;
  archetype: Archetype;
  clubId: string;
  price: number;
  loan: number;
  seed: number;
  /** Personal wealth carried over from a club sold earlier. */
  wealth?: number;
}

const emptyLedger = (): Ledger => ({ matchday: 0, commercial: 0, sponsor: 0, broadcast: 0, prize: 0, wages: 0, staff: 0, interest: 0, maintenance: 0, operations: 0, other: 0 });

function mirrorCoach(state: CareerState, coach: Coach): void {
  state.coach = { firstName: coach.name, lastName: '', flag: coach.flag, look: coach.look ?? { ...DEFAULT_LOOK }, style: 'balanced', traits: { ...coach.traits } };
  state.tactics = { formation: coach.formations[0], ...coach.tactics };
}

export function newOwnerCareer(s: OwnerSetup): OwnerState {
  const l = listing(s.clubId);
  const leagueId = leagueOf(s.clubId);
  const clubs = leagueClubs(leagueId);
  const coaches: Record<string, string> = {};
  for (const c of clubs) coaches[c.id] = c.coachId ?? 'ancelotti';
  const rng = new Rng(s.seed);
  const country = leagueId === 'nor' ? rng.pick(COUNTRIES) : leagueId;
  const a = ARCHETYPES[s.archetype];
  const wealth = (s.wealth ?? a.capital) - (s.price - s.loan);
  const incumbent = coachById(coaches[s.clubId])!;
  const state = {
    version: 1, mode: 'owner', seed: s.seed, clubId: s.clubId, season: 1,
    coach: { firstName: '', lastName: '', flag: '', look: { ...DEFAULT_LOOK }, style: 'balanced', traits: { ...incumbent.traits } },
    league: newSeason(clubs, s.seed, leagueId), coaches, tactics: { formation: incumbent.formations[0], ...incumbent.tactics },
    confidence: 60, reputation: a.rep, history: [], news: [], status: 'active', lastSummary: null,
    squads: {}, fitness: {}, training: { ...DEFAULT_TRAINING }, devRound: 0, reports: {},
    owner: {
      name: s.name, flag: s.flag, archetype: s.archetype, wealth: round1(wealth), startWealth: s.wealth ?? a.capital,
      cash: round1(l.size * 0.12), debt: round1(l.debt + s.loan), rate: a.rate, share: 1,
      size: l.size, capacity0: l.capacity, capacity: l.capacity, brand0: l.brand, brand: l.brand,
      fanMood: 55, reputation: a.rep,
      coach: { id: incumbent.id, wage: coachWage(incumbent), years: 2, trust: 60, demand: coachDemand(l.size, incumbent), given: 0 },
      staff: {
        sd: makeStaff(rng, 'sd', 8 + rng.int(0, 3), 'sd-0', country),
        fd: makeStaff(rng, 'fd', 8 + rng.int(0, 3), 'fd-0', country),
        academy: makeStaff(rng, 'academy', 8 + rng.int(0, 3), 'academy-0', country),
      },
      strategy: 'balanced', tickets: 'normal', facilities: l.facilities, projects: [],
      sponsor: null, sponsorOffers: [], naming: null, ledger: emptyLedger(), history: [], decision: null, seen: [], log: [],
      finRound: 0, seq: 0, over: null,
    },
  } as OwnerState;
  mirrorCoach(state, incumbent);
  state.market = initMarket(state);
  // The transfer budget is the owner's to set; the club starts with what the old regime left.
  state.market.budget = round1(l.size * 0.1);
  state.owner.sponsorOffers = sponsorOffers(state);
  markSeasonStart(state);
  applyBoosts(state);
  const club = clubById(s.clubId);
  ownerNews(state, `${s.name} приобретает «${club.name}» за ${money(s.price)}${s.loan ? ` (${money(s.loan)} в долг)` : ''}.`, `${s.name} buys ${club.name} for ${money(s.price)}${s.loan ? ` (${money(s.loan)} borrowed)` : ''}.`);
  return state;
}

export const money = (m: number) => {
  const a = Math.abs(m);
  if (a < 0.0005) return '€0';
  const s = a >= 1000 ? `€${round1(a / 1000)}B` : a >= 1 ? `€${a >= 100 ? Math.round(a) : round1(a)}M` : `€${Math.round(a * 1000)}K`;
  return m < 0 ? `−${s}` : s;
};

export function ownerNews(state: OwnerState, ru: string, en: string): void {
  state.news.unshift({ season: state.season, ru, en });
  state.news = state.news.slice(0, 40);
}

// ───────────────────────────── staff effects ──

const staffRating = (o: OwnerData, role: StaffRole) => o.staff[role]?.rating ?? 6;
const hasTrait = (o: OwnerData, role: StaffRole, t: StaffMember['trait']) => o.staff[role]?.trait === t;

/** Negotiation discount the sporting director gets on transfer fees. */
export const sdDiscount = (o: OwnerData) => clamp((staffRating(o, 'sd') - 8) * 0.012 + (hasTrait(o, 'sd', 'negotiator') ? 0.04 : 0), 0, 0.2);

/** Facilities and the academy head turn into the development module's multipliers. */
export function applyBoosts(state: OwnerState): void {
  const f = state.owner.facilities;
  const vision = state.owner.archetype === 'visionary' ? 0.06 : 0;
  const dev = hasTrait(state.owner, 'academy', 'developer') ? 0.05 : 0;
  state.boosts = {
    dev: 1 + 0.08 * (f.training - 3) + vision + dev + (staffRating(state.owner, 'academy') - 10) * 0.01,
    recovery: 1.2 * (f.training - 3) + 0.8 * (f.medical - 3),
    injury: clamp(1 - 0.08 * (f.medical - 3), 0.7, 1.25),
  };
}

// ───────────────────────────── economy ──

const TICKET: Record<TicketPolicy, { price: number; att: number; mood: number }> = {
  low: { price: 0.8, att: 0.08, mood: 0.35 },
  normal: { price: 1, att: 0, mood: 0 },
  high: { price: 1.25, att: -0.09, mood: -0.45 },
};

export const attendance = (o: OwnerData) => clamp(0.58 + o.fanMood / 250 + TICKET[o.tickets].att + (o.brand - 50) / 500, 0.35, 1);

/** Annual income streams at the current brand, stadium and prices (before results). */
export function annualIncome(state: OwnerState) {
  const o = state.owner;
  const M = o.size;
  const att0 = clamp(0.58 + 55 / 250 + (o.brand0 - 50) / 500, 0.35, 1);
  const matchday = 0.22 * M * (o.capacity / o.capacity0) * (attendance(o) / att0) * TICKET[o.tickets].price * (0.7 + 0.3 * (o.brand / o.brand0));
  const fd = 1 + (staffRating(o, 'fd') - 10) * 0.012 + (hasTrait(o, 'fd', 'commercial') ? 0.05 : 0);
  const pres = o.archetype === 'president' ? 1.1 : 1;
  const commercial = 0.3 * M * (o.brand / o.brand0) ** 1.5 * (1 + 0.07 * (o.facilities.commercial - 3)) * fd * pres + (o.naming?.perSeason ?? 0);
  const broadcast = 0.32 * M;
  return { matchday, commercial, sponsor: o.sponsor?.perSeason ?? 0.04 * M, broadcast };
}

/** Annual running costs at the current squad, staff and debt. */
export function annualCosts(state: OwnerState) {
  const o = state.owner;
  const wages = (wageBill(state) * 52) / 1000;
  const staff = (o.coach?.wage ?? 0) + Object.values(o.staff).reduce((s, x) => s + (x?.wage ?? 0), 0);
  const interest = o.debt * effectiveRate(o);
  const maintenance = FACILITY_KINDS.reduce((s, k) => s + o.facilities[k], 0) * o.size * 0.0025;
  const operations = o.size * 0.2 * (1 - (staffRating(o, 'fd') - 10) * 0.01 - (hasTrait(o, 'fd', 'costCutter') ? 0.04 : 0));
  return { wages, staff, interest, maintenance, operations };
}

export const effectiveRate = (o: OwnerData) => Math.max(0.01, o.rate - (staffRating(o, 'fd') - 10) * 0.0005 + Math.max(0, o.debt / o.size - 1.5) * 0.01);

/** How much more the bank will lend. */
export const loanRoom = (o: OwnerData) => round1(Math.max(0, o.size * 3 - o.debt));

export function clubValuation(state: OwnerState): number {
  const o = state.owner;
  return valuation(revenueRunRate(state), o.brand, squadValue(squadOf(state, state.clubId)), o.facilities, o.debt);
}

/** Revenue this club earns a year at its current state (for valuation). */
export function revenueRunRate(state: OwnerState): number {
  const i = annualIncome(state);
  return round1(i.matchday + i.commercial + i.sponsor + i.broadcast + 0.06 * state.owner.size);
}

/** Owner's net worth: personal fortune plus his stake in the club. */
export const netWorth = (state: OwnerState) => round1(state.owner.wealth + state.owner.share * clubValuation(state));

const book = (o: OwnerData, k: LedgerKey, v: number) => {
  o.ledger[k] = round1(o.ledger[k] + v);
};

export function homeGames(state: CareerState): number {
  return state.league.fixtures.filter((f) => f.home === state.clubId).length;
}

/**
 * Books one round: income (matchday only after home games), wages, staff, interest, upkeep;
 * moves construction along; updates fan mood and the coach's trust from the result.
 */
export function bookRound(state: OwnerState, round: number): void {
  const o = state.owner;
  const R = Math.max(...state.league.fixtures.map((f) => f.round));
  const inc = annualIncome(state);
  const cost = annualCosts(state);
  const f = state.league.fixtures.find((x) => x.round === round && (x.home === state.clubId || x.away === state.clubId));
  if (f?.home === state.clubId) book(o, 'matchday', inc.matchday / homeGames(state));
  book(o, 'commercial', inc.commercial / R);
  book(o, 'sponsor', inc.sponsor / R);
  book(o, 'broadcast', inc.broadcast / R);
  book(o, 'wages', cost.wages / R);
  book(o, 'staff', cost.staff / R);
  book(o, 'interest', cost.interest / R);
  book(o, 'maintenance', cost.maintenance / R);
  book(o, 'operations', cost.operations / R);
  o.cash = round1(o.cash + (inc.matchday * (f?.home === state.clubId ? 1 / homeGames(state) : 0)) + (inc.commercial + inc.sponsor + inc.broadcast) / R
    - (cost.wages + cost.staff + cost.interest + cost.maintenance + cost.operations) / R);

  // Construction.
  for (const p of o.projects) p.roundsLeft--;
  for (const p of o.projects.filter((x) => x.roundsLeft <= 0)) {
    o.facilities[p.kind]++;
    if (p.kind === 'stadium') o.capacity = Math.round(o.capacity + o.capacity0 * 0.15);
    ownerNews(state, `Завершено строительство: ${FACILITIES[p.kind].ru.toLowerCase()} — уровень ${o.facilities[p.kind]}.`, `Construction complete: ${FACILITIES[p.kind].en.toLowerCase()} — level ${o.facilities[p.kind]}.`);
  }
  o.projects = o.projects.filter((x) => x.roundsLeft > 0);
  applyBoosts(state);

  // The mood in the stands and in the dressing room follows results against expectations.
  if (f?.result) {
    const mine = f.home === state.clubId ? 0 : 1;
    const gf = f.result.score[mine];
    const ga = f.result.score[1 - mine];
    const res = gf > ga ? 1 : gf === ga ? 0 : -1;
    const pos = currentPosition(state);
    const target = boardTarget(state.clubId, state.league.clubs);
    o.fanMood = clamp(o.fanMood + res * 3 - (res < 0 ? 1 : 0) + TICKET[o.tickets].mood + (pos <= target ? 0.4 : -0.6), 0, 100);
    if (o.coach) o.coach.trust = clamp(o.coach.trust + res * 1.2 + (pos <= target ? 0.3 : -0.5), 0, 100);
  }

  // Short of cash: the bank covers the gap with an emergency loan while it still can.
  if (o.cash < 0) {
    const need = round1(-o.cash + o.size * 0.02);
    if (need <= loanRoom(o)) {
      o.debt = round1(o.debt + need);
      o.cash = round1(o.cash + need);
      o.rate = Math.min(0.15, o.rate + 0.005);
      ownerNews(state, `Кассовый разрыв: банк выдал экстренный кредит ${money(need)}.`, `Cash shortfall: the bank lends an emergency ${money(need)}.`);
    } else {
      o.over = { reason: 'bankrupt', season: state.season, price: 0 };
      ownerNews(state, 'Клуб не может платить по счетам и переходит под внешнее управление.', 'The club can no longer pay its bills and goes into administration.');
    }
  }
  o.finRound = round;
}

export function currentPosition(state: CareerState): number {
  return computeTable(state.league.clubs, state.league.fixtures).findIndex((r) => r.club === state.clubId) + 1;
}

// ───────────────────────────── owner actions ──

export type ActionResult = { ok: true } | { ok: false; reason: 'money' | 'bank' | 'busy' | 'max' | 'unwilling' | 'noCoach' };

export function injectCapital(state: OwnerState, amount: number): ActionResult {
  const o = state.owner;
  if (amount <= 0 || amount > o.wealth) return { ok: false, reason: 'money' };
  o.wealth = round1(o.wealth - amount);
  o.cash = round1(o.cash + amount);
  o.fanMood = clamp(o.fanMood + Math.min(6, (amount / o.size) * 10), 0, 100);
  return { ok: true };
}

export function borrow(state: OwnerState, amount: number): ActionResult {
  const o = state.owner;
  if (amount <= 0 || amount > loanRoom(o)) return { ok: false, reason: 'bank' };
  o.debt = round1(o.debt + amount);
  o.cash = round1(o.cash + amount);
  return { ok: true };
}

export function repay(state: OwnerState, amount: number): ActionResult {
  const o = state.owner;
  const a = Math.min(amount, o.debt);
  if (a <= 0 || a > o.cash) return { ok: false, reason: 'money' };
  o.debt = round1(o.debt - a);
  o.cash = round1(o.cash - a);
  return { ok: true };
}

/** Takes money out of the club. Fans notice. */
export function dividend(state: OwnerState, amount: number): ActionResult {
  const o = state.owner;
  if (amount <= 0 || amount > o.cash) return { ok: false, reason: 'money' };
  o.cash = round1(o.cash - amount);
  o.wealth = round1(o.wealth + amount * o.share);
  o.fanMood = clamp(o.fanMood - (amount / o.size) * 30, 0, 100);
  ownerNews(state, `Владелец выводит из клуба ${money(amount)} — болельщики недовольны.`, `The owner takes ${money(amount)} out of the club — the fans are unhappy.`);
  return { ok: true };
}

/** Moves money between the club's accounts and the transfer budget (negative = back to the accounts). */
export function setTransferBudget(state: OwnerState, budget: number): ActionResult {
  const o = state.owner;
  const m = ensureMarket(state);
  const delta = round1(budget - m.budget);
  if (delta > o.cash) return { ok: false, reason: 'money' };
  o.cash = round1(o.cash - delta);
  m.budget = round1(m.budget + delta);
  if (delta > 0 && o.coach) {
    o.coach.given = round1(o.coach.given + delta);
    o.coach.trust = clamp(o.coach.trust + Math.min(12, (delta / Math.max(1, o.coach.demand)) * 15), 0, 100);
  }
  return { ok: true };
}

export function facilityCost(state: OwnerState, kind: FacilityKind): number {
  const o = state.owner;
  const lvl = o.facilities[kind] + 1;
  return round1(FACILITIES[kind].cost * o.size * lvl * (o.archetype === 'visionary' ? 0.8 : 1));
}

export function build(state: OwnerState, kind: FacilityKind): ActionResult {
  const o = state.owner;
  if (o.facilities[kind] >= 5) return { ok: false, reason: 'max' };
  if (o.projects.some((p) => p.kind === kind)) return { ok: false, reason: 'busy' };
  const cost = facilityCost(state, kind);
  if (cost > o.cash) return { ok: false, reason: 'money' };
  o.cash = round1(o.cash - cost);
  o.projects.push({ kind, roundsLeft: FACILITIES[kind].rounds, cost });
  ownerNews(state, `Старт стройки: ${FACILITIES[kind].ru.toLowerCase()}, ${money(cost)}.`, `Construction starts: ${FACILITIES[kind].en.toLowerCase()}, ${money(cost)}.`);
  return { ok: true };
}

export function coachDemand(size: number, c: Coach) {
  return round1(size * 0.2 * (coachRep(c) / 65));
}

/** Pays off the current coach's contract. Returns the compensation paid. */
export function fireCoach(state: OwnerState): number {
  const o = state.owner;
  if (!o.coach) return 0;
  const comp = round1(o.coach.wage * Math.max(0.5, o.coach.years));
  o.cash = round1(o.cash - comp);
  book(o, 'other', -comp);
  const c = coachById(o.coach.id);
  ownerNews(state, `${c?.nameRu ?? 'Тренер'} уволен. Компенсация — ${money(comp)}.`, `${c?.name ?? 'The coach'} is sacked. Compensation: ${money(comp)}.`);
  o.coach = null;
  return comp;
}

export function hireCoach(state: OwnerState, coachId: string): ActionResult {
  const o = state.owner;
  const c = coachById(coachId);
  if (!c) return { ok: false, reason: 'unwilling' };
  if (!coachWilling(o, c)) return { ok: false, reason: 'unwilling' };
  if (o.coach) fireCoach(state);
  o.coach = { id: c.id, wage: coachWage(c), years: 3, trust: 65, demand: coachDemand(o.size, c), given: 0 };
  state.coaches[state.clubId] = c.id;
  mirrorCoach(state, c);
  o.fanMood = clamp(o.fanMood + (coachRep(c) > 75 ? 6 : 2), 0, 100);
  ownerNews(state, `Новый главный тренер «${clubById(state.clubId).name}» — ${c.nameRu}.`, `${c.name} is the new head coach of ${clubById(state.clubId).name}.`);
  return { ok: true };
}

export function hireStaff(state: OwnerState, member: StaffMember): ActionResult {
  const o = state.owner;
  if (!staffWilling(o, member)) return { ok: false, reason: 'unwilling' };
  const old = o.staff[member.role];
  if (old) {
    const comp = round1(old.wage);
    o.cash = round1(o.cash - comp);
    book(o, 'other', -comp);
  }
  o.staff[member.role] = { ...member };
  applyBoosts(state);
  return { ok: true };
}

export function fireStaff(state: OwnerState, role: StaffRole): void {
  const o = state.owner;
  const old = o.staff[role];
  if (!old) return;
  o.cash = round1(o.cash - old.wage);
  book(o, 'other', -old.wage);
  delete o.staff[role];
  applyBoosts(state);
}

export function chooseSponsor(state: OwnerState, index: number): void {
  const o = state.owner;
  const s = o.sponsorOffers[index];
  if (!s) return;
  o.sponsor = { ...s };
  o.sponsorOffers = [];
  ownerNews(state, `${s.name} — новый титульный спонсор: ${money(s.perSeason)} в сезон на ${s.seasons} ${s.seasons === 1 ? 'год' : s.seasons < 5 ? 'года' : 'лет'}.`, `${s.name} become title sponsor: ${money(s.perSeason)} a season for ${s.seasons} year${s.seasons === 1 ? '' : 's'}.`);
}

const SPONSOR_NAMES = ['Nordwave Energy', 'Aurum Bank', 'Kinetix Air', 'Vela Telecom', 'Orion Motors', 'Helix Pay', 'Solstice Resorts', 'Polar Logistics', 'Zenko Electronics', 'Atlas Insurance', 'Brightline Rail', 'Cobalt Cloud'];

/** Three title-sponsor offers: safe and long, big and short, or bonus-driven. */
export function sponsorOffers(state: OwnerState): Sponsor[] {
  const o = state.owner;
  const rng = new Rng(hashString(`sponsor-${state.seed}-${state.season}`));
  const base = 0.06 * o.size * (o.brand / o.brand0) ** 1.3 * (1 + o.reputation / 300);
  const target = boardTarget(state.clubId, state.league.clubs);
  const names = [...SPONSOR_NAMES].sort(() => rng.next() - 0.5);
  return [
    { name: names[0], perSeason: round1(base * 0.95), seasons: 4, bonusPos: 1, bonus: round1(base * 0.2) },
    { name: names[1], perSeason: round1(base * 1.2), seasons: 1, bonusPos: target, bonus: 0 },
    { name: names[2], perSeason: round1(base * 0.7), seasons: 2, bonusPos: Math.max(1, target - 1), bonus: round1(base * 1.1) },
  ];
}

// ───────────────────────────── season ──

export interface OwnerSummary {
  position: number;
  target: number;
  prize: number;
  sponsorBonus: number;
  revenue: number;
  costs: number;
  profit: number;
  valuation: number;
  valuationBefore: number;
  goalMet: boolean;
  champion: boolean;
}

export function ownerGoalMet(state: OwnerState, position: number, target: number, profit: number, valuationNow: number, valuationBefore: number): boolean {
  const o = state.owner;
  if (o.archetype === 'president') return position <= target && o.brand >= o.brand0;
  if (o.archetype === 'investor') return profit >= 0 && valuationNow >= valuationBefore;
  const young = squadOf(state, state.clubId).filter((p) => p.age <= 21 && (statusOf(state, p.id).apps ?? 0) >= 5).length;
  return young >= 3 && position <= target + 1;
}

export function ownerSeasonEnd(state: OwnerState): OwnerSummary {
  const o = state.owner;
  const table = computeTable(state.league.clubs, state.league.fixtures);
  const position = table.findIndex((r) => r.club === state.clubId) + 1;
  const target = boardTarget(state.clubId, state.league.clubs);
  const n = state.league.clubs.length;
  const prize = round1(o.size * 0.16 * (1 - (position - 1) / (n - 1)) + o.size * 0.04);
  const sponsorBonus = o.sponsor && position <= o.sponsor.bonusPos ? o.sponsor.bonus : 0;
  book(o, 'prize', prize + sponsorBonus);
  o.cash = round1(o.cash + prize + sponsorBonus);
  closeSeasonMarket(state, position, false);

  const champion = position === 1;
  const met = position <= target;
  o.brand = Math.round(clamp(o.brand + (champion ? 6 : met ? 2 : -2) + (o.facilities.commercial - 3) * 0.5 + (o.archetype === 'president' ? 1 : 0), 10, 99));
  if (o.coach) o.coach.trust = clamp(o.coach.trust + (o.coach.given >= o.coach.demand * 0.6 ? 6 : -12), 0, 100);

  const revenue = round1(INCOME_KEYS.reduce((s, k) => s + o.ledger[k], 0));
  const costs = round1(COST_KEYS.reduce((s, k) => s + o.ledger[k], 0));
  // Operating result; one-off items (compensation, fees for events) are booked under "other".
  const profit = round1(revenue - costs + o.ledger.other);
  const before = o.history.length ? o.history[o.history.length - 1].valuation : valuation(o.size, o.brand0, squadValue(clubById(state.clubId).players), o.facilities, o.debt);
  const val = clubValuation(state);
  const goalMet = ownerGoalMet(state, position, target, profit, val, before);
  o.reputation = clamp(o.reputation + (champion ? 10 : 0) + (goalMet ? 5 : -5), 0, 100);
  state.reputation = o.reputation;
  o.history.push({ season: state.season, label: seasonLabel(state.season), clubId: state.clubId, position, target, revenue, costs, profit, valuation: val, goalMet });
  ownerNews(state,
    champion ? `«${clubById(state.clubId).name}» — чемпион сезона ${seasonLabel(state.season)}!` : `Сезон ${seasonLabel(state.season)} завершён: ${position}-е место, ${profit >= 0 ? 'прибыль' : 'убыток'} ${money(Math.abs(profit))}.`,
    champion ? `${clubById(state.clubId).name} are champions of ${seasonLabel(state.season)}!` : `Season ${seasonLabel(state.season)} over: ${position}th, ${profit >= 0 ? 'profit' : 'loss'} of ${money(Math.abs(profit))}.`);
  state.status = 'seasonOver';
  o.summary = { position, target, prize, sponsorBonus, revenue, costs, profit, valuation: val, valuationBefore: before, goalMet, champion };
  return o.summary;
}

/** Next season: everyone ages (shared with the coach career), contracts run down, academy intake, sponsors. */
export function ownerNextSeason(state: OwnerState): void {
  const o = state.owner;
  startNextSeason(state);
  if (o.sponsor) {
    o.sponsor.seasons--;
    if (o.sponsor.seasons <= 0) o.sponsor = null;
  }
  if (o.naming) {
    o.naming.seasons--;
    if (o.naming.seasons <= 0) o.naming = null;
  }
  if (!o.sponsor) o.sponsorOffers = sponsorOffers(state);
  if (o.coach) {
    o.coach.years = Math.max(1, o.coach.years - 1);
    o.coach.given = 0;
  }
  o.ledger = emptyLedger();
  o.summary = null;
  o.seen = [];
  o.decision = null;
  o.finRound = 0;
  academyIntake(state);
  applyBoosts(state);
}

/** Every summer the academy promotes youngsters: better facilities and a better head, better talents. */
export function academyIntake(state: OwnerState): void {
  const o = state.owner;
  const rng = new Rng(hashString(`intake-${state.seed}-${state.season}`));
  const n = 1 + (o.facilities.academy >= 4 ? 1 : 0) + (hasTrait(o, 'academy', 'talentSpotter') ? 1 : 0);
  const squad = [...squadOf(state, state.clubId)];
  const boost = (o.facilities.academy - 3) * 2 + (staffRating(o, 'academy') - 10) * 0.4 + (o.archetype === 'visionary' ? 2 : 0);
  for (let i = 0; i < n && squad.length < 26; i++) {
    const role = rng.pick(SQUAD);
    const used = new Set(squad.map((p) => p.number));
    let num = 30 + i;
    while (used.has(num)) num++;
    const p = academyPlayer(state.clubId, role, rng, num, `${state.clubId}-ac${state.season}-${i}`);
    const attrs = { ...p.attrs };
    for (const k of Object.keys(attrs) as (keyof typeof attrs)[]) attrs[k] = clamp(Math.round(attrs[k] + boost), 10, 95);
    const youth = { ...p, attrs };
    const r = rating(youth);
    const pot = clamp(Math.round(r + 8 + rng.next() * 10 + boost), r, 97);
    squad.push({ ...youth, potential: pot });
    ownerNews(state, `Академия: ${youth.name} (${youth.age}, потенциал ${pot}) подписал первый контракт.`, `Academy: ${youth.name} (${youth.age}, potential ${pot}) signs his first contract.`);
  }
  setSquad(state, state.clubId, squad);
}

/** Selling the club ends this ownership; the stake is paid out to the owner. */
export function sellClub(state: OwnerState): number {
  const o = state.owner;
  const price = round1(clubValuation(state) * o.share * (0.95 + o.fanMood / 1000));
  o.wealth = round1(o.wealth + price);
  o.over = { reason: 'sold', season: state.season, price };
  ownerNews(state, `${o.name} продаёт «${clubById(state.clubId).name}» за ${money(price)}.`, `${o.name} sells ${clubById(state.clubId).name} for ${money(price)}.`);
  return price;
}

export const ownerRoundsLeft = (state: CareerState) => (nextRound(state.league) === null ? 0 : state.league.fixtures.filter((f) => !f.result).length);

