import type { Fixture } from '../league/league';
import type { SideOverrides } from '../league/simulate';
import { type CareerState, clubSide } from './career';
import { matchSquad } from './development';

/** Everything a fixture needs from a career: both coaches, their tactics and the available squads. */
export function overridesFor(state: CareerState, f: Fixture): SideOverrides {
  const h = clubSide(state, f.home);
  const a = clubSide(state, f.away);
  return {
    homeCoach: h.coach.traits, awayCoach: a.coach.traits, homeTactics: h.tactics, awayTactics: a.tactics,
    homePlayers: matchSquad(state, f.home), awayPlayers: matchSquad(state, f.away), report: true,
  };
}
