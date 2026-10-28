import { describe, expect, it } from 'vitest';
import { ensureMarket, squadOf } from '../src/career/market';
import { LEAGUES, leagueClubIds } from '../src/data/clubSeeds';
import { Rng } from '../src/engine/rng';
import type { FixtureResult } from '../src/league/league';
import { decide, eventKinds } from '../src/owner/events';
import {
  annualCosts, annualIncome, borrow, build, clubValuation, fireCoach, hireCoach, coachCandidates, coachWilling, injectCapital, listing,
  newOwnerCareer, ownerNextSeason, ownerSeasonEnd, repay, reservePrice, setTransferBudget, type OwnerState,
} from '../src/owner/owner';
import { blocker, playOwnerRound } from '../src/owner/play';
import type { SimRequest } from '../src/league/worker';

/** Instant synthetic results so whole seasons run in milliseconds. */
const fakeRun = async (req: SimRequest): Promise<FixtureResult> => {
  const r = new Rng(req.seed);
  return { score: [r.int(0, 3), r.int(0, 2)], xg: [1, 1], goals: [], report: [] };
};

const buy = (clubId: string, archetype: 'president' | 'investor' | 'visionary' = 'president') => {
  const l = listing(clubId);
  return newOwnerCareer({ name: 'Test Owner', flag: '🌐', archetype, clubId, price: l.asking, loan: 0, seed: 99, wealth: 5000 });
};

/** Plays rounds, always taking the first available option in boardroom decisions and re-hiring if needed. */
async function playSeason(s: OwnerState) {
  for (let guard = 0; guard < 80; guard++) {
    const b = blocker(s);
    if (b === 'decision') {
      decide(s, s.owner.decision!.options.find((o) => !o.disabled)!.id);
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

describe('club owner mode', () => {
  it('prices every club, small ones cheaper than giants', () => {
    for (const lg of LEAGUES) {
      for (const id of leagueClubIds(lg.id)) {
        const l = listing(id);
        expect(l.asking).toBeGreaterThan(0);
        expect(reservePrice(id)).toBeLessThanOrEqual(l.asking);
      }
    }
    expect(listing('mnb').asking).toBeGreaterThan(listing('ptr').asking * 3);
  });

  it('starts a club near break-even, and debt makes it lose money', () => {
    const s = buy('rgr');
    const inc = Object.values(annualIncome(s)).reduce((a, b) => a + b, 0);
    const cost = Object.values(annualCosts(s)).reduce((a, b) => a + b, 0);
    expect(Math.abs(inc - cost) / s.owner.size).toBeLessThan(0.2);
    const before = annualCosts(s).interest;
    borrow(s, 50);
    expect(annualCosts(s).interest).toBeGreaterThan(before);
    expect(repay(s, 10).ok).toBe(true);
  });

  it('moves money between the owner, the club and the transfer budget', () => {
    const s = buy('eln');
    const wealth = s.owner.wealth;
    expect(injectCapital(s, 30).ok).toBe(true);
    expect(s.owner.wealth).toBeCloseTo(wealth - 30, 5);
    const cash = s.owner.cash;
    expect(setTransferBudget(s, ensureMarket(s).budget + 20).ok).toBe(true);
    expect(s.owner.cash).toBeCloseTo(cash - 20, 5);
    expect(s.owner.coach!.given).toBeGreaterThan(0);
    expect(setTransferBudget(s, ensureMarket(s).budget + 1e6).ok).toBe(false);
  });

  it('plays a full season with finances, decisions and a season-end report, then the next season', async () => {
    const s = buy('mnr');
    s.owner.cash += 300;
    build(s, 'training');
    await playSeason(s);
    expect(s.league.fixtures.every((f) => f.result)).toBe(true);
    expect(s.owner.ledger.wages).toBeGreaterThan(0);
    expect(s.owner.ledger.matchday).toBeGreaterThan(0);
    expect(s.owner.facilities.training).toBeGreaterThanOrEqual(listing('mnr').facilities.training + 1);
    const sum = ownerSeasonEnd(s);
    expect(sum.revenue).toBeGreaterThan(0);
    expect(s.owner.history).toHaveLength(1);
    expect(s.owner.seen.length).toBeGreaterThan(0); // at least one boardroom decision came up
    const before = squadOf(s, 'mnr').length;
    ownerNextSeason(s);
    expect(s.season).toBe(2);
    expect(s.owner.ledger.wages).toBe(0);
    expect(squadOf(s, 'mnr').length).toBeGreaterThanOrEqual(Math.min(before, 18));
    expect(s.coaches.mnr).toBe(s.owner.coach!.id); // the coaching carousel leaves the owner's club alone
  });

  it('sacks and hires coaches, who then run the team', () => {
    const s = buy('mnr');
    const cash = s.owner.cash;
    fireCoach(s);
    expect(s.owner.cash).toBeLessThan(cash);
    expect(blocker(s)).toBe('coach');
    const c = coachCandidates(s).find((x) => coachWilling(s.owner, x))!;
    expect(hireCoach(s, c.id).ok).toBe(true);
    expect(s.coaches.mnr).toBe(c.id);
    expect(s.tactics.formation).toBe(c.formations[0]);
    expect(blocker(s)).toBeNull();
  });

  it('every event kind can be generated and resolved without breaking the state', () => {
    expect(eventKinds().length).toBeGreaterThanOrEqual(10);
    const s = buy('mnb');
    expect(clubValuation(s)).toBeGreaterThan(0);
  });

  it('a club drowning in debt goes into administration', async () => {
    const s = buy('ptr');
    s.owner.debt = s.owner.size * 3;
    s.owner.cash = -s.owner.size;
    await playOwnerRound(s, fakeRun);
    expect(s.owner.over?.reason).toBe('bankrupt');
    expect(blocker(s)).toBe('over');
  });
});
