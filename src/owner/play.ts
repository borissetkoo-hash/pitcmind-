import { recordResult, seasonComplete } from '../career/career';
import { processRounds } from '../career/development';
import { marketTick } from '../career/market';
import { overridesFor } from '../career/sim';
import { createSaveSlot } from '../career/storage';
import { type FixtureResult, nextRound } from '../league/league';
import type { SimRequest } from '../league/worker';
import { directorRound } from './director';
import { coachWalksOut, maybeDecision } from './events';
import { complianceRound, complianceSeasonEnd, complianceSeasonStart, ensureCompliance } from './ffp';
import { type OwnerState, type OwnerSummary, bookRound, ownerNextSeason, ownerSeasonEnd } from './owner';

export const ownerSave = createSaveSlot<OwnerState>('pm-owner-v1', 'owner');

export type Runner = (req: SimRequest) => Promise<FixtureResult>;

/** Why the next round can't be played yet. */
export function blocker(state: OwnerState): 'decision' | 'coach' | 'over' | 'season' | null {
  const o = state.owner;
  if (o.over) return 'over';
  if (o.decision) return 'decision';
  if (!o.coach) return 'coach';
  if (seasonComplete(state)) return 'season';
  return null;
}

/** Plays every fixture of the next round (all in parallel), then runs the club for a week. */
export async function playOwnerRound(state: OwnerState, run: Runner): Promise<void> {
  if (blocker(state)) return;
  const r = nextRound(state.league);
  if (r === null) return;
  const pending = state.league.fixtures.filter((f) => f.round === r && !f.result);
  const results = await Promise.all(pending.map((f) => run({ id: f.id, home: f.home, away: f.away, seed: f.seed, overrides: overridesFor(state, f) })));
  pending.forEach((f, i) => recordResult(state, f.id, results[i]));
  afterOwnerRound(state);
}

/**
 * After results are in: fatigue, injuries and development (shared with the coach career), then
 * the club's week — finances, construction, mood — the director's business and maybe a decision.
 */
export function afterOwnerRound(state: OwnerState): void {
  processRounds(state);
  const done = state.devRound ?? 0;
  for (let r = state.owner.finRound + 1; r <= done; r++) {
    bookRound(state, r);
    complianceRound(state, r);
    if (state.owner.over) return;
    directorRound(state, r);
    maybeDecision(state, r);
  }
  marketTick(state);
  coachWalksOut(state);
}

/** Season end: the club's accounts, then UEFA's view of them (FFP, Europe, investigations). */
export function finishOwnerSeason(state: OwnerState): OwnerSummary {
  ensureCompliance(state);
  const summary = ownerSeasonEnd(state);
  summary.ffp = complianceSeasonEnd(state, summary.position);
  return summary;
}

/** Next season; a pending UEFA verdict opens it as a boardroom decision. */
export function startOwnerSeason(state: OwnerState): void {
  ownerNextSeason(state);
  complianceSeasonStart(state);
}
