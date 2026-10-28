import { absence } from '../career/development';
import {
  acceptOffer, askingPrice, bid, clubLevel, ensureMarket, isLoanedIn, listPlayer, marketValue, potential, rating, squadOf,
  transferWindow, wageBill, wageDemand, willingToJoin,
} from '../career/market';
import { CLUBS, clubById } from '../data/clubs';
import { overall } from '../engine/attributes';
import { FORMATIONS } from '../engine/formations';
import { Rng, hashString } from '../engine/rng';
import { pickLineup } from '../engine/team';
import type { PlayerData } from '../engine/types';
import { type OwnerState, money, ownerNews, round1, sdDiscount } from './owner';

/**
 * The sporting director runs the transfer business the owner delegates: in each window he looks
 * for the weakest place in the starting XI, scouts a shortlist (a better director sees more of the
 * market), signs the best fit he can afford under the owner's strategy, haggles the fee down, and
 * clears out surplus players. Without a director the owner does all of this by hand.
 */

const MAX_SIGNINGS_PER_WINDOW = 3;

export function directorRound(state: OwnerState, round: number): void {
  const o = state.owner;
  const sd = o.staff.sd;
  const m = ensureMarket(state);
  if (!sd || !transferWindow(state).open) return;
  const rng = new Rng(hashString(`sd-${state.seed}-${state.season}-${round}`));
  const squad = squadOf(state, state.clubId);
  const slots = FORMATIONS[state.tactics.formation];
  const { lineup } = pickLineup(squad, slots);
  const xi = new Set(lineup.map((p) => p.id));

  // 1. Offers for players outside the XI: take fair ones.
  for (const off of [...m.offers]) {
    const p = squad.find((x) => x.id === off.playerId);
    if (p && !xi.has(p.id) && off.fee >= marketValue(p) * 0.95) {
      const r = acceptOffer(state, off.id);
      if (r.ok) ownerNews(state, `Спортивный директор продал ${p.name} за ${money(off.fee)}.`, `The sporting director sold ${p.name} for ${money(off.fee)}.`);
    }
  }

  // 2. Surplus: list players who won't play, and veterans under a youth policy.
  const level = clubLevel(state, state.clubId);
  for (const p of squadOf(state, state.clubId)) {
    if (xi.has(p.id) || isLoanedIn(state, p.id) || m.listed[p.id] !== undefined) continue;
    const old = o.strategy === 'youth' && p.age >= 29;
    const weak = rating(p) < level - 10 && p.age >= 24;
    if ((old || weak || squad.length > 24) && rng.chance(0.5)) listPlayer(state, p.id, marketValue(p));
  }

  // 3. Signings.
  const done = m.log.filter((x) => x.season === state.season && x.to === state.clubId && !x.loan && x.fee > 0).length;
  if (done >= MAX_SIGNINGS_PER_WINDOW * 2 || squad.length >= 25) return;
  const spendShare = o.strategy === 'winNow' ? 1 : o.strategy === 'balanced' ? 0.7 : 0.6;
  const budget = m.budget * spendShare;
  if (budget < 0.5) return;

  // The weakest starting slot, by how far below the team's level its player is.
  const gaps = lineup.map((p, i) => ({ slot: slots[i], gap: level - overall(p.attrs, slots[i].role) * (absence(state, p.id) ? 0.8 : 1), p }));
  gaps.sort((a, b) => b.gap - a.gap);
  const need = gaps[0];
  if (!need || need.gap < -2) return;

  const scouting = 40 + sd.rating * 10 + (sd.trait === 'scout' ? 60 : 0);
  const pool: { p: PlayerData; score: number; fee: number }[] = [];
  for (const c of CLUBS) {
    if (c.id === state.clubId) continue;
    for (const p of squadOf(state, c.id)) {
      if (rng.next() > scouting / 1160) continue; // the director only sees part of the market
      if (m.loans.some((l) => l.playerId === p.id)) continue;
      const fit = overall(p.attrs, need.slot.role);
      const gain = fit - overall(need.p.attrs, need.slot.role);
      if (gain < 2) continue;
      if (o.strategy === 'winNow' && p.age > 31) continue;
      if (o.strategy === 'balanced' && p.age > 29) continue;
      if (o.strategy === 'youth' && (p.age > 23 || potential(p) < level)) continue;
      if (!willingToJoin(state, p)) continue;
      const fee = round1(askingPrice(state, p.id) * (1 - sdDiscount(o)));
      if (fee > budget || wageBill(state) + wageDemand(p) > m.wageBudget) continue;
      const youth = o.strategy === 'youth' ? (potential(p) - fit) * 1.5 : o.strategy === 'balanced' ? Math.max(0, 27 - p.age) * 0.4 : 0;
      pool.push({ p, fee, score: gain * 3 + youth - fee / Math.max(1, budget) * 4 });
    }
  }
  if (!pool.length) return;
  pool.sort((a, b) => b.score - a.score);
  const pick = pool[0];
  const ask = askingPrice(state, pick.p.id);
  // The club gets its asking price; the director's haggling comes back as a rebate.
  const from = clubById(CLUBS.find((c) => squadOf(state, c.id).some((x) => x.id === pick.p.id))!.id);
  const r = bid(state, pick.p.id, ask);
  if (!r.ok) return;
  state.news.shift(); // replaced by the director's own, more detailed note
  const saved = round1(ask - pick.fee);
  m.budget = round1(m.budget + saved);
  ownerNews(state,
    `Спортивный директор подписал ${pick.p.name} (${rating(pick.p)}) из «${from.name}» за ${money(pick.fee)}${saved > 0 ? `, сэкономив ${money(saved)} на переговорах` : ''}.`,
    `The sporting director signed ${pick.p.name} (${rating(pick.p)}) from ${from.name} for ${money(pick.fee)}${saved > 0 ? `, saving ${money(saved)} in negotiations` : ''}.`);
}
