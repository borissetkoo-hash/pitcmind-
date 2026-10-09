import { CLUB_SEEDS, leagueOf } from '../data/clubSeeds';
import { CLUBS, SQUAD, academyPlayer, clubById } from '../data/clubs';
import { overall } from '../engine/attributes';
import { FORMATIONS } from '../engine/formations';
import { Rng, hashString } from '../engine/rng';
import { pickLineup } from '../engine/team';
import { type ClubData, type PlayerData, ROLE_LINE, type Role } from '../engine/types';
import type { CareerState } from './career';

/**
 * Transfer market for the manager career.
 *
 * Squads start as the deterministic ones generated from each club's seed; as soon as a club's
 * roster changes (a transfer, a loan, an academy call-up) the whole roster is stored in the
 * career save, and every match — live, quick or simulated in a worker — is played with it.
 * Money is in millions of euros, wages in thousands of euros a week.
 */

export interface Offer {
  id: number;
  playerId: string;
  club: string;
  fee: number;
  /** Last round of the user's season in which the offer can still be accepted. */
  expires: number;
}

export interface Loan {
  playerId: string;
  from: string;
  to: string;
  season: number;
}

export interface TransferRecord {
  season: number;
  player: string;
  from: string;
  to: string;
  fee: number;
  loan?: boolean;
}

export interface MarketState {
  budget: number;
  wageBudget: number;
  /** Transfer-listed players of the user's club and their asking price. */
  listed: Record<string, number>;
  offers: Offer[];
  loans: Loan[];
  log: TransferRecord[];
  /** Bids made per player in the current window (clubs lose patience after three). */
  bids: Record<string, number>;
  seq: number;
  /** Last round already processed by the market (offers, AI deals). */
  tickRound: number;
}

export const SQUAD_MIN = 16;
export const SQUAD_MAX = 26;
const MAX_BIDS = 3;

/** League wealth: how much money its clubs have relative to squad value. */
const WEALTH: Record<string, number> = { eng: 1.35, esp: 1, ita: 0.95, ger: 1, bra: 0.65, nor: 0.8 };

// ───────────────────────────── player valuation ──

export const rating = (p: PlayerData) => overall(p.attrs, p.position);

const unit = (s: string) => hashString(s) / 4294967296;

/** Ceiling the player can grow to; young players have more headroom. */
export function potential(p: PlayerData): number {
  const u = unit(`pot-${p.id}`);
  const r = rating(p);
  const room = p.age <= 21 ? 4 + u * 14 : p.age <= 24 ? 2 + u * 8 : p.age <= 27 ? u * 4 : 0;
  // The closer to the top of the scale, the less room is left.
  return Math.min(99, r + Math.round(room * Math.min(1, (99 - r) / 25)));
}

const ageFactor = (age: number) => (age <= 21 ? 1.25 : age <= 24 ? 1.15 : age <= 27 ? 1 : age <= 29 ? 0.8 : age <= 31 ? 0.55 : age <= 33 ? 0.35 : 0.2);
const baseValue = (r: number) => 2 * Math.exp(0.14 * (r - 70));
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Market value in €M: driven by ability, then age and growth potential. */
export function marketValue(p: PlayerData): number {
  const r = rating(p);
  const grow = p.age <= 24 ? Math.exp(0.07 * (potential(p) - r)) : 1;
  return Math.max(0.1, round1(baseValue(r) * ageFactor(p.age) * grow));
}

/** Weekly wage in €K, from ability (older stars still earn well). */
export function wageOf(p: PlayerData): number {
  return Math.round(4 + 2.6 * baseValue(rating(p)) ** 0.85);
}

export const fmtMoney = (m: number) => (m >= 1 ? `€${m >= 100 ? Math.round(m) : round1(m)}M` : `€${Math.round(m * 1000)}K`);
export const fmtWage = (k: number) => `€${k}K`;

// ───────────────────────────── squads ──

export function squadOf(state: CareerState, clubId: string): PlayerData[] {
  return state.squads?.[clubId] ?? clubById(clubId).players;
}

/** A club as the engine needs it, with its current career roster. */
export function clubFor(state: CareerState, clubId: string): ClubData {
  const players = state.squads?.[clubId];
  return players ? { ...clubById(clubId), players } : clubById(clubId);
}

function setSquad(state: CareerState, clubId: string, players: PlayerData[]): void {
  state.squads ??= {};
  state.squads[clubId] = players;
}

export function findPlayer(state: CareerState, playerId: string): { player: PlayerData; clubId: string } | null {
  for (const c of CLUBS) {
    const player = squadOf(state, c.id).find((p) => p.id === playerId);
    if (player) return { player, clubId: c.id };
  }
  return null;
}

/** Average rating of a club's best XI in its usual shape. */
export function clubLevel(state: CareerState, clubId: string): number {
  const club = clubFor(state, clubId);
  const slots = FORMATIONS[club.tactics.formation];
  const { lineup } = pickLineup(club.players, slots);
  return lineup.reduce((s, p, i) => s + overall(p.attrs, slots[i].role), 0) / lineup.length;
}

/** Players who start for their club: they cost more and AI clubs don't loan them out. */
function starters(state: CareerState, clubId: string): Set<string> {
  const club = clubFor(state, clubId);
  return new Set(pickLineup(club.players, FORMATIONS[club.tactics.formation]).lineup.map((p) => p.id));
}

const freeNumber = (squad: PlayerData[], wanted: number) => {
  const used = new Set(squad.map((p) => p.number));
  if (!used.has(wanted)) return wanted;
  let n = 2;
  while (used.has(n)) n++;
  return n;
};

function movePlayer(state: CareerState, playerId: string, from: string, to: string): PlayerData {
  const src = squadOf(state, from);
  const player = src.find((p) => p.id === playerId)!;
  setSquad(state, from, src.filter((p) => p.id !== playerId));
  const dst = squadOf(state, to);
  setSquad(state, to, [...dst, { ...player, number: freeNumber(dst, player.number) }]);
  if (from !== state.clubId) refill(state, from);
  if (to !== state.clubId) trim(state, to);
  return player;
}

/** AI clubs keep a 20-man squad: academy players fill the positions they sold. */
function refill(state: CareerState, clubId: string): void {
  const squad = [...squadOf(state, clubId)];
  const rng = new Rng(hashString(`academy-${clubId}-${state.season}-${state.market!.seq}`));
  while (squad.length < SQUAD.length) {
    const need = (r: Role) => SQUAD.filter((x) => x === r).length - squad.filter((p) => p.position === r).length;
    const role = [...new Set(SQUAD)].sort((a, b) => need(b) - need(a))[0];
    const id = `${clubId}-a${state.season}-${++state.market!.seq}`;
    squad.push(academyPlayer(clubId, role, rng, freeNumber(squad, 30 + rng.int(0, 19)), id));
  }
  setSquad(state, clubId, squad);
}

/** AI clubs that bought release their weakest player when the squad gets too big. */
function trim(state: CareerState, clubId: string): void {
  const squad = [...squadOf(state, clubId)];
  while (squad.length > 22) {
    let worst = 0;
    squad.forEach((p, i) => {
      if (rating(p) - p.age * 0.2 < rating(squad[worst]) - squad[worst].age * 0.2) worst = i;
    });
    squad.splice(worst, 1);
  }
  setSquad(state, clubId, squad);
}

// ───────────────────────────── finances ──

export const squadValue = (players: PlayerData[]) => players.reduce((s, p) => s + marketValue(p), 0);
export const wageBill = (state: CareerState) => squadOf(state, state.clubId).reduce((s, p) => s + wageOf(p), 0);

function wealth(clubId: string) {
  return WEALTH[leagueOf(clubId)] ?? 1;
}

/** A fresh market for the user's club: budget from the squad's value and the league's wealth. */
export function initMarket(state: CareerState): MarketState {
  const value = squadValue(squadOf(state, state.clubId));
  const bill = squadOf(state, state.clubId).reduce((s, p) => s + wageOf(p), 0);
  return {
    budget: round1(value * 0.18 * wealth(state.clubId)),
    wageBudget: Math.round(bill * 1.12),
    listed: {}, offers: [], loans: [], log: [], bids: {}, seq: 0, tickRound: userRoundsPlayed(state),
  };
}

/** Older saves had no market: add one (and keep using the generated squads). */
export function ensureMarket(state: CareerState): MarketState {
  state.market ??= initMarket(state);
  return state.market;
}

// ───────────────────────────── transfer windows ──

export function userRoundsPlayed(state: CareerState): number {
  const played = state.league.fixtures.filter((f) => f.result && (f.home === state.clubId || f.away === state.clubId));
  return played.length ? Math.max(...played.map((f) => f.round)) : 0;
}

export const totalRounds = (state: CareerState) => Math.max(...state.league.fixtures.map((f) => f.round));

export interface WindowInfo {
  open: boolean;
  kind: 'summer' | 'winter' | null;
  /** While open: rounds still to play before it shuts. While shut: rounds until it opens. */
  rounds: number;
  /** While shut: whether it reopens this season (winter) or only next summer. */
  next?: 'winter' | 'summer';
}

/** Summer window: pre-season and the first three rounds. Winter window: around the halfway point. */
export function transferWindow(state: CareerState): WindowInfo {
  const done = userRoundsPlayed(state);
  const half = Math.floor(totalRounds(state) / 2);
  if (done < 3) return { open: true, kind: 'summer', rounds: 3 - done };
  if (done >= half - 1 && done <= half + 1) return { open: true, kind: 'winter', rounds: half + 2 - done };
  if (done < half - 1) return { open: false, kind: null, rounds: half - 1 - done, next: 'winter' };
  return { open: false, kind: null, rounds: totalRounds(state) - done, next: 'summer' };
}

// ───────────────────────────── buying ──

export type DealError = 'closed' | 'budget' | 'wages' | 'squadFull' | 'squadMin' | 'unwilling' | 'rejected' | 'patience' | 'notLoanable' | 'own';

export type DealResult = { ok: true; fee: number } | { ok: false; reason: DealError; counter?: number };

/** What the selling club wants: value plus a premium for starters and for the team's best player. */
export function askingPrice(state: CareerState, playerId: string): number {
  const found = findPlayer(state, playerId);
  if (!found) return 0;
  const { player, clubId } = found;
  const squad = squadOf(state, clubId);
  const best = Math.max(...squad.map(rating));
  let k = 1.1;
  if (starters(state, clubId).has(playerId)) k += 0.3;
  if (rating(player) >= best) k += 0.3;
  return round1(marketValue(player) * k);
}

/** Would the player join? Stars want a club at their level (or a coach with a name). */
export function willingToJoin(state: CareerState, p: PlayerData): boolean {
  return rating(p) <= clubLevel(state, state.clubId) + 5 + state.reputation / 12;
}

/** Wage the player asks for to move. */
export const wageDemand = (p: PlayerData) => Math.round(wageOf(p) * 1.1);

function checkSigning(state: CareerState, p: PlayerData, wage: number): DealError | null {
  const m = ensureMarket(state);
  if (!transferWindow(state).open) return 'closed';
  if (squadOf(state, state.clubId).length >= SQUAD_MAX) return 'squadFull';
  if (wageBill(state) + wage > m.wageBudget) return 'wages';
  if (!willingToJoin(state, p)) return 'unwilling';
  return null;
}

function news(state: CareerState, ru: string, en: string) {
  state.news.unshift({ season: state.season, ru, en });
  state.news = state.news.slice(0, 30);
}

/** A bid for a player of another club. At or above the asking price it's accepted; close to it, the club counters. */
export function bid(state: CareerState, playerId: string, fee: number): DealResult {
  const m = ensureMarket(state);
  const found = findPlayer(state, playerId);
  if (!found || found.clubId === state.clubId) return { ok: false, reason: 'own' };
  const { player, clubId } = found;
  const err = checkSigning(state, player, wageDemand(player));
  if (err) return { ok: false, reason: err };
  if (fee > m.budget) return { ok: false, reason: 'budget' };
  if ((m.bids[playerId] ?? 0) >= MAX_BIDS) return { ok: false, reason: 'patience' };
  m.bids[playerId] = (m.bids[playerId] ?? 0) + 1;
  const ask = askingPrice(state, playerId);
  if (fee < ask) return { ok: false, reason: 'rejected', counter: fee >= ask * 0.8 ? ask : undefined };
  m.budget = round1(m.budget - fee);
  movePlayer(state, playerId, clubId, state.clubId);
  m.log.unshift({ season: state.season, player: player.name, from: clubId, to: state.clubId, fee });
  const club = clubById(clubId);
  const mine = clubById(state.clubId);
  news(state, `${player.name} переходит из «${club.name}» в «${mine.name}» за ${fmtMoney(fee)}.`, `${player.name} joins ${mine.name} from ${club.name} for ${fmtMoney(fee)}.`);
  return { ok: true, fee };
}

/** Loan fee: a tenth of the player's value; the user's club pays his wages until the end of the season. */
export const loanFee = (p: PlayerData) => round1(Math.max(0.1, marketValue(p) * 0.1));

/** Only squad players (not starters) are available on loan. */
export function loanable(state: CareerState, playerId: string): boolean {
  const found = findPlayer(state, playerId);
  if (!found || found.clubId === state.clubId) return false;
  if (state.market?.loans.some((l) => l.playerId === playerId)) return false;
  return !starters(state, found.clubId).has(playerId);
}

export function loanIn(state: CareerState, playerId: string): DealResult {
  const m = ensureMarket(state);
  const found = findPlayer(state, playerId);
  if (!found || found.clubId === state.clubId) return { ok: false, reason: 'own' };
  const { player, clubId } = found;
  if (!loanable(state, playerId)) return { ok: false, reason: 'notLoanable' };
  const err = checkSigning(state, player, wageOf(player));
  if (err) return { ok: false, reason: err };
  const fee = loanFee(player);
  if (fee > m.budget) return { ok: false, reason: 'budget' };
  m.budget = round1(m.budget - fee);
  // A loaned player doesn't trigger an academy call-up: he's coming back.
  const src = squadOf(state, clubId);
  setSquad(state, clubId, src.filter((p) => p.id !== playerId));
  const dst = squadOf(state, state.clubId);
  setSquad(state, state.clubId, [...dst, { ...player, number: freeNumber(dst, player.number) }]);
  m.loans.push({ playerId, from: clubId, to: state.clubId, season: state.season });
  m.log.unshift({ season: state.season, player: player.name, from: clubId, to: state.clubId, fee, loan: true });
  const club = clubById(clubId);
  news(state, `${player.name} арендован у «${club.name}» до конца сезона.`, `${player.name} joins on loan from ${club.name} until the end of the season.`);
  return { ok: true, fee };
}

// ───────────────────────────── selling ──

export const isLoanedIn = (state: CareerState, playerId: string) => !!state.market?.loans.some((l) => l.playerId === playerId && l.to === state.clubId);

export function listPlayer(state: CareerState, playerId: string, price: number | null): void {
  const m = ensureMarket(state);
  if (price === null) delete m.listed[playerId];
  else m.listed[playerId] = round1(Math.max(0.1, price));
}

/** Sends a squad player out on loan to a club that needs him; he returns at the end of the season. */
export function loanOut(state: CareerState, playerId: string): { ok: true; club: string } | { ok: false; reason: DealError } {
  const m = ensureMarket(state);
  if (!transferWindow(state).open) return { ok: false, reason: 'closed' };
  const squad = squadOf(state, state.clubId);
  const p = squad.find((x) => x.id === playerId);
  if (!p || isLoanedIn(state, playerId)) return { ok: false, reason: 'notLoanable' };
  if (squad.length <= SQUAD_MIN) return { ok: false, reason: 'squadMin' };
  const r = rating(p);
  const rng = new Rng(hashString(`loan-${playerId}-${state.season}`));
  const fits = CLUBS.filter((c) => c.id !== state.clubId && Math.abs(clubLevel(state, c.id) - r) < 6);
  const to = (fits.length ? rng.pick(fits) : rng.pick(CLUBS.filter((c) => c.id !== state.clubId))).id;
  setSquad(state, state.clubId, squad.filter((x) => x.id !== playerId));
  const dst = squadOf(state, to);
  setSquad(state, to, [...dst, { ...p, number: freeNumber(dst, p.number) }]);
  m.loans.push({ playerId, from: state.clubId, to, season: state.season });
  delete m.listed[playerId];
  m.offers = m.offers.filter((o) => o.playerId !== playerId);
  m.log.unshift({ season: state.season, player: p.name, from: state.clubId, to, fee: 0, loan: true });
  news(state, `${p.name} отправлен в аренду в «${clubById(to).name}».`, `${p.name} goes out on loan to ${clubById(to).name}.`);
  return { ok: true, club: to };
}

export function acceptOffer(state: CareerState, offerId: number): DealResult {
  const m = ensureMarket(state);
  const o = m.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'rejected' };
  if (!transferWindow(state).open) return { ok: false, reason: 'closed' };
  if (squadOf(state, state.clubId).length <= SQUAD_MIN) return { ok: false, reason: 'squadMin' };
  const p = squadOf(state, state.clubId).find((x) => x.id === o.playerId);
  if (!p) return { ok: false, reason: 'rejected' };
  m.budget = round1(m.budget + o.fee);
  movePlayer(state, p.id, state.clubId, o.club);
  delete m.listed[p.id];
  m.offers = m.offers.filter((x) => x.playerId !== p.id);
  m.log.unshift({ season: state.season, player: p.name, from: state.clubId, to: o.club, fee: o.fee });
  news(state, `${p.name} продан в «${clubById(o.club).name}» за ${fmtMoney(o.fee)}.`, `${p.name} sold to ${clubById(o.club).name} for ${fmtMoney(o.fee)}.`);
  return { ok: true, fee: o.fee };
}

export function rejectOffer(state: CareerState, offerId: number): void {
  const m = ensureMarket(state);
  m.offers = m.offers.filter((x) => x.id !== offerId);
}

/** A club that could afford and would use the player: around his level, any league. */
function suitor(state: CareerState, p: PlayerData, rng: Rng): string | null {
  const r = rating(p);
  const fits = CLUB_SEEDS.filter((c) => c.id !== state.clubId && c.strength >= r - 12 && c.strength <= r);
  return fits.length ? rng.pick(fits).id : null;
}

/**
 * Runs once per round the user plays: offers expire, clubs bid for listed players (and now and
 * then for an unlisted star), and AI clubs do business among themselves — all only while a
 * window is open, and deterministic for a given save.
 */
export function marketTick(state: CareerState): void {
  const m = ensureMarket(state);
  const done = userRoundsPlayed(state);
  const win = transferWindow(state);
  for (let r = m.tickRound + 1; r <= done; r++) {
    m.offers = m.offers.filter((o) => o.expires >= r);
    const rng = new Rng(hashString(`market-${state.seed}-${state.season}-${r}`));
    if (!win.open) continue;
    const squad = squadOf(state, state.clubId);
    for (const p of squad) {
      if (isLoanedIn(state, p.id) || m.offers.some((o) => o.playerId === p.id)) continue;
      const asking = m.listed[p.id];
      const listedChance = asking !== undefined ? Math.min(0.75, 0.55 * (marketValue(p) / asking) ** 2) : 0;
      const starChance = rating(p) >= clubLevel(state, state.clubId) + 2 ? 0.06 : 0;
      if (!rng.chance(listedChance || starChance)) continue;
      const club = suitor(state, p, rng);
      if (!club) continue;
      const base = asking !== undefined ? Math.min(asking, marketValue(p) * 1.15) : marketValue(p) * (1.25 + rng.next() * 0.35);
      const fee = round1(base * (0.85 + rng.next() * 0.2));
      m.offers.push({ id: ++m.seq, playerId: p.id, club, fee, expires: r + 2 });
    }
    aiDeal(state, rng);
  }
  m.tickRound = Math.max(m.tickRound, done);
  // Offers for players no longer at the club are void.
  const ids = new Set(squadOf(state, state.clubId).map((p) => p.id));
  m.offers = m.offers.filter((o) => ids.has(o.playerId));
}

/** One transfer between AI clubs of the user's league, now and then, so rivals strengthen too. */
function aiDeal(state: CareerState, rng: Rng): void {
  if (!rng.chance(0.4)) return;
  const buyers = state.league.clubs.filter((id) => id !== state.clubId);
  const buyer = rng.pick(buyers);
  const level = clubLevel(state, buyer);
  const pool: { p: PlayerData; club: string }[] = [];
  for (const c of CLUBS) {
    if (c.id === buyer || c.id === state.clubId) continue;
    const start = starters(state, c.id);
    for (const p of squadOf(state, c.id)) {
      if (state.market!.loans.some((l) => l.playerId === p.id)) continue;
      const r = rating(p);
      if (r > level + 1 && r <= level + 6 && p.age <= 29 && !start.has(p.id)) pool.push({ p, club: c.id });
    }
  }
  if (!pool.length) return;
  const { p, club } = rng.pick(pool);
  const fee = round1(marketValue(p) * (1.1 + rng.next() * 0.3));
  movePlayer(state, p.id, club, buyer);
  state.market!.log.unshift({ season: state.season, player: p.name, from: club, to: buyer, fee });
  news(state, `«${clubById(buyer).name}» подписал ${p.name} из «${clubById(club).name}» за ${fmtMoney(fee)}.`, `${clubById(buyer).name} sign ${p.name} from ${clubById(club).name} for ${fmtMoney(fee)}.`);
}

// ───────────────────────────── season end ──

/** Prize money by final position, scaled by league wealth and club size. */
export function prizeMoney(state: CareerState, position: number): number {
  const n = state.league.clubs.length;
  const share = 1 - (position - 1) / (n - 1);
  const size = squadValue(squadOf(state, state.clubId));
  return round1(size * (0.06 + 0.1 * share) * wealth(state.clubId));
}

/** Loans end, prize money arrives, a new wage budget is set and the bid counters reset. */
export function closeSeasonMarket(state: CareerState, position: number): number {
  const m = ensureMarket(state);
  for (const l of m.loans) {
    const squad = squadOf(state, l.to);
    const p = squad.find((x) => x.id === l.playerId);
    if (!p) continue;
    setSquad(state, l.to, squad.filter((x) => x.id !== l.playerId));
    const home = squadOf(state, l.from);
    setSquad(state, l.from, [...home, { ...p, number: freeNumber(home, p.number) }]);
  }
  m.loans = [];
  const prize = prizeMoney(state, position);
  m.budget = round1(m.budget + prize);
  m.wageBudget = Math.max(m.wageBudget, Math.round(wageBill(state) * 1.08));
  m.offers = [];
  m.bids = {};
  m.tickRound = 0;
  m.log = m.log.slice(0, 60);
  return prize;
}

/** Called when the user changes club after a sacking: a new board, a new budget. */
export function resetMarketForClub(state: CareerState): void {
  const old = state.market;
  state.market = { ...initMarket(state), seq: old?.seq ?? 0, log: old?.log ?? [], loans: [], tickRound: 0 };
}

export const lineOf = (r: Role) => ROLE_LINE[r];
