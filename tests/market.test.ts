import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../src/career/avatar';
import { type CareerCoach, STYLES, endSeason, newCareer, startNextSeason } from '../src/career/career';
import {
  SQUAD_MIN, acceptOffer, askingPrice, bid, clubFor, listPlayer, loanIn, loanOut, loanable, marketTick, marketValue, rating,
  squadOf, transferWindow, wageOf,
} from '../src/career/market';
import { Match } from '../src/engine/match';
import { playFixture } from '../src/league/simulate';

const coach = (): CareerCoach => ({ firstName: 'Ana', lastName: 'Test', flag: '🇪🇸', look: { ...DEFAULT_LOOK }, style: 'balanced', traits: { ...STYLES.balanced.traits } });

/** A rich career at a top club, so stars are willing and money isn't the constraint. */
function richCareer() {
  const s = newCareer(coach(), 'mnb', 5);
  s.market!.budget = 1000;
  s.market!.wageBudget = 100000;
  s.reputation = 100;
  return s;
}

/** Plays the user's next `n` rounds with a draw and lets the market react after each one. */
function playRounds(s: ReturnType<typeof newCareer>, n: number) {
  for (let i = 0; i < n; i++) {
    const round = s.league.fixtures.filter((f) => !f.result).reduce((m, f) => Math.min(m, f.round), Infinity);
    for (const f of s.league.fixtures) if (f.round === round) f.result = { score: [1, 1], xg: [1, 1], goals: [] };
    marketTick(s);
  }
}

describe('transfer market', () => {
  it('values better and younger players higher, and pays them more', () => {
    const s = newCareer(coach(), 'mnr', 1);
    const players = squadOf(s, 'mnr');
    const best = players.reduce((a, b) => (rating(a) > rating(b) ? a : b));
    const worst = players.reduce((a, b) => (rating(a) < rating(b) ? a : b));
    expect(marketValue(best)).toBeGreaterThan(marketValue(worst));
    expect(wageOf(best)).toBeGreaterThan(wageOf(worst));
    expect(marketValue({ ...best, age: 22 })).toBeGreaterThan(marketValue({ ...best, age: 33 }));
    expect(s.market!.budget).toBeGreaterThan(0);
  });

  it('rejects low bids with a counter-offer and completes a deal at the asking price', () => {
    const s = richCareer();
    const target = squadOf(s, 'mdb').reduce((a, b) => (rating(a) > rating(b) ? a : b));
    const ask = askingPrice(s, target.id);
    const low = bid(s, target.id, Math.round(ask * 0.9 * 10) / 10);
    expect(low).toEqual({ ok: false, reason: 'rejected', counter: ask });
    const budget = s.market!.budget;
    expect(bid(s, target.id, ask)).toEqual({ ok: true, fee: ask });
    expect(squadOf(s, 'mnb').some((p) => p.id === target.id)).toBe(true);
    expect(squadOf(s, 'mdb').some((p) => p.id === target.id)).toBe(false);
    expect(squadOf(s, 'mdb')).toHaveLength(20); // academy call-up fills the gap
    expect(s.market!.budget).toBeCloseTo(budget - ask, 5);
  });

  it('plays matches with the career roster, in the live engine and in the simulator', () => {
    const s = richCareer();
    const star = squadOf(s, 'mdb').reduce((a, b) => (rating(a) > rating(b) ? a : b));
    bid(s, star.id, askingPrice(s, star.id));
    const m = new Match({ home: clubFor(s, 'mnb'), away: clubFor(s, 'mdb'), seed: 3, fast: true });
    expect(m.teams[0].players.some((p) => p.data.id === star.id)).toBe(true);
    expect(m.teams[1].players.some((p) => p.data.id === star.id)).toBe(false);
    // Same seed, different squads → the simulator really uses the override.
    const base = playFixture('mnb', 'mdb', 11, true);
    const weak = squadOf(s, 'mnb').map((p) => ({ ...p, attrs: Object.fromEntries(Object.entries(p.attrs).map(([k, v]) => [k, Math.max(12, v - 40)])) as unknown as typeof p.attrs }));
    const changed = playFixture('mnb', 'mdb', 11, true, { homePlayers: weak });
    expect(changed).not.toEqual(base);
  });

  it('survives a save round-trip with squads and market intact', () => {
    const s = richCareer();
    const t = squadOf(s, 'lnw')[3];
    bid(s, t.id, askingPrice(s, t.id));
    const copy = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(squadOf(copy, 'mnb').some((p) => p.id === t.id)).toBe(true);
    expect(copy.market!.budget).toBe(s.market!.budget);
  });

  it('brings offers for listed players during the window and sells on acceptance', () => {
    const s = newCareer(coach(), 'mnr', 21);
    const squad = squadOf(s, 'mnr');
    for (const p of squad.slice(0, 5)) listPlayer(s, p.id, marketValue(p) * 0.8);
    playRounds(s, 2);
    expect(s.market!.offers.length).toBeGreaterThan(0);
    const o = s.market!.offers[0];
    const budget = s.market!.budget;
    expect(acceptOffer(s, o.id).ok).toBe(true);
    expect(squadOf(s, 'mnr').some((p) => p.id === o.playerId)).toBe(false);
    expect(squadOf(s, o.club).some((p) => p.id === o.playerId)).toBe(true);
    expect(s.market!.budget).toBeGreaterThan(budget);
  });

  it('opens a summer and a winter window and shuts it in between', () => {
    const s = newCareer(coach(), 'mnr', 2);
    expect(transferWindow(s)).toMatchObject({ open: true, kind: 'summer' });
    playRounds(s, 4);
    expect(transferWindow(s)).toMatchObject({ open: false, next: 'winter' });
    const p = squadOf(s, 'lnw')[5];
    expect(bid(s, p.id, 999).ok).toBe(false);
    playRounds(s, 4); // round 8 of 18: winter window
    expect(transferWindow(s)).toMatchObject({ open: true, kind: 'winter' });
  });

  it('returns loaned players at the end of the season and keeps a minimum squad', () => {
    const s = richCareer();
    const inId = squadOf(s, 'lnw').find((p) => loanable(s, p.id))!.id;
    expect(loanIn(s, inId).ok).toBe(true);
    const outId = squadOf(s, 'mnb')[19].id;
    const r = loanOut(s, outId);
    expect(r.ok).toBe(true);
    for (const f of s.league.fixtures) f.result = { score: [2, 0], xg: [1, 1], goals: [] };
    endSeason(s);
    expect(squadOf(s, 'lnw').some((p) => p.id === inId)).toBe(true);
    expect(squadOf(s, 'mnb').some((p) => p.id === outId)).toBe(true);
    expect(squadOf(s, 'mnb').some((p) => p.id === inId)).toBe(false);
    startNextSeason(s);
    // Can't strip the squad below the minimum.
    let last = { ok: true } as { ok: boolean; reason?: string };
    for (const p of [...squadOf(s, 'mnb')]) {
      last = loanOut(s, p.id);
      if (!last.ok) break;
    }
    expect(last).toMatchObject({ ok: false, reason: 'squadMin' });
    expect(squadOf(s, 'mnb')).toHaveLength(SQUAD_MIN);
  });
});
