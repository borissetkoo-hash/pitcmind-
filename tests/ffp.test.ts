import { describe, expect, it } from 'vitest';
import { bid, ensureMarket, squadOf } from '../src/career/market';
import { Rng } from '../src/engine/rng';
import { computeTable, type FixtureResult } from '../src/league/league';
import type { SimRequest } from '../src/league/worker';
import { decide } from '../src/owner/events';
import {
  applySanctions, ensureCompliance, ffpResult, fringePlayers, inflatedSale, leaseback, sanctionsFor, setAffiliate, setOffshore,
} from '../src/owner/ffp';
import { coachCandidates, coachWilling, hireCoach, listing, newOwnerCareer, type OwnerState } from '../src/owner/owner';
import { blocker, finishOwnerSeason, playOwnerRound, startOwnerSeason } from '../src/owner/play';

const fakeRun = async (req: SimRequest): Promise<FixtureResult> => {
  const r = new Rng(req.seed);
  return { score: [r.int(0, 3), r.int(0, 2)], xg: [1, 1], goals: [], report: [] };
};

const buy = (clubId = 'mnr') => {
  const l = listing(clubId);
  return newOwnerCareer({ name: 'Test', flag: '🌐', archetype: 'president', clubId, price: l.asking, loan: 0, seed: 5, wealth: 20000 });
};

/** Plays the season, answering every ordinary decision with its first option. */
async function playSeason(s: OwnerState, answer: 'a' | 'b' | 'c' = 'a') {
  for (let guard = 0; guard < 80; guard++) {
    const b = blocker(s);
    if (b === 'decision') {
      const d = s.owner.decision!;
      const pick = d.kind === 'uefaVerdict' ? answer : d.options.find((o) => !o.disabled)!.id;
      decide(s, pick);
      continue;
    }
    if (b === 'coach') {
      hireCoach(s, coachCandidates(s).find((c) => coachWilling(s.owner, c))!.id);
      continue;
    }
    if (b) break;
    await playOwnerRound(s, fakeRun);
  }
}

describe('financial fair play and grey schemes', () => {
  it('related-party money flatters the FFP result and leaves evidence', async () => {
    const honest = buy();
    const shady = buy();
    setAffiliate(shady, shady.owner.size * 0.5);
    setOffshore(shady, 0.3);
    await playSeason(honest);
    await playSeason(shady);
    expect(ffpResult(shady).result).toBeGreaterThan(ffpResult(honest).result + honest.owner.size * 0.3);
    const c = ensureCompliance(shady);
    expect(c.hidden).toBeGreaterThan(0);
    expect(c.heat).toBeGreaterThan(ensureCompliance(honest).heat);
    expect(shady.owner.wealth).toBeLessThan(honest.owner.wealth);
  });

  it('an honest overspend ends in a settlement: a fine at the start of next season', async () => {
    const s = buy();
    await playSeason(s);
    // Spend far beyond the limit on wages-equivalent costs.
    s.owner.ledger.wages += s.owner.size * 1.5;
    const sum = finishOwnerSeason(s);
    expect(sum.ffp!.breach).toBeGreaterThan(0);
    expect(sum.ffp!.verdictComing).toBe(true);
    const cash = s.owner.cash;
    startOwnerSeason(s);
    expect(s.owner.decision?.kind).toBe('uefaVerdict');
    decide(s, 'a');
    expect(s.owner.cash).toBeLessThan(cash);
    expect(ensureCompliance(s).verdict).toBeNull();
  });

  it('sanctions bite: points off the table, a registration ban, no European money', () => {
    const s = buy();
    const x = sanctionsFor(s.owner.size, s.owner.size * 0.9, 0, false);
    expect(x.points).toBeGreaterThan(0);
    expect(x.transferBan).toBe(true);
    expect(x.euroBanSeasons).toBe(2);
    ensureCompliance(s).europe = true;
    applySanctions(s, x);
    const row = computeTable(s.league.clubs, s.league.fixtures, s.league.penalties).find((r) => r.club === s.clubId)!;
    expect(row.pts).toBe(-x.points);
    expect(ensureCompliance(s).europe).toBe(false);
    const target = squadOf(s, 'mnb')[10];
    expect(bid(s, target.id, 9999)).toMatchObject({ ok: false, reason: 'banned' });
    expect(ensureMarket(s).banUntil).toBe(s.season);
  });

  it('an investigation leads to a verdict a season later, which can be appealed', async () => {
    const s = buy();
    const c = ensureCompliance(s);
    c.hidden = s.owner.size * 0.5;
    c.investigation = s.season; // already caught
    await playSeason(s);
    const sum = finishOwnerSeason(s);
    expect(sum.ffp!.verdictComing).toBe(true);
    startOwnerSeason(s);
    expect(s.owner.decision?.kind).toBe('uefaVerdict');
    const cash = s.owner.cash;
    decide(s, 'b'); // appeal to CAS: fees always, outcome either way
    expect(s.owner.cash).toBeLessThan(cash);
    expect(ensureCompliance(s).hidden).toBe(0);
    expect(s.news.some((n) => n.en.includes('CAS'))).toBe(true);
  });

  it('one-off schemes: a stadium leaseback once, an inflated sale of a fringe player', () => {
    const s = buy();
    const cash = s.owner.cash;
    expect(leaseback(s).ok).toBe(true);
    expect(s.owner.cash).toBeGreaterThan(cash);
    expect(leaseback(s)).toMatchObject({ ok: false, reason: 'done' });
    const p = fringePlayers(s)[0];
    const budget = ensureMarket(s).budget;
    expect(inflatedSale(s, p.id).ok).toBe(true);
    expect(ensureMarket(s).budget).toBeGreaterThan(budget);
    expect(squadOf(s, s.clubId).some((x) => x.id === p.id)).toBe(false);
    expect(ensureCompliance(s).hidden).toBeGreaterThan(0);
  });
});
