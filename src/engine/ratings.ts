import type { Match } from './match';

/**
 * Event-based player ratings on the familiar 1–10 scale. Every player starts at 6.0
 * and is nudged up or down by what he actually did in the simulation.
 */
export function computeRatings(match: Match): void {
  for (const team of match.teams) {
    const conceded = team.opponent.goals;
    for (const p of team.players) {
      const s = p.stats;
      if (s.minutes <= 0 && p.enteredAt === 0 && p.leftAt === null) s.minutes = Math.round(match.clock / 60);
      let r = 6.0;
      r += s.goals * 1.0 + s.assists * 0.6 + s.keyPasses * 0.15;
      r += s.shotsOnTarget * 0.1 - (s.shots - s.shotsOnTarget) * 0.04;
      r += s.passesCompleted * 0.012 - (s.passes - s.passesCompleted) * 0.035;
      r += s.tacklesWon * 0.12 + s.interceptions * 0.1 + s.dribbles * 0.08 - s.fouls * 0.06;
      r += s.saves * 0.3;
      if (p.isGK || p.role === 'CB' || p.role === 'LB' || p.role === 'RB' || p.role === 'LWB' || p.role === 'RWB') {
        r += conceded === 0 ? 0.5 : -conceded * 0.25;
      }
      if (team.goals > team.opponent.goals) r += 0.25;
      else if (team.goals < team.opponent.goals) r -= 0.2;
      if (p.yellow) r -= 0.3;
      if (p.sentOff) r -= 1.5;
      s.rating = Math.round(Math.min(10, Math.max(3, r)) * 10) / 10;
    }
  }
}
