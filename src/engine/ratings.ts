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
      r += s.goals * 1.0 + s.assists * 0.6 + s.keyPasses * 0.12;
      r += s.shotsOnTarget * 0.08 - (s.shots - s.shotsOnTarget) * 0.04;
      r += Math.min(0.6, s.passesCompleted * 0.006) - (s.passes - s.passesCompleted) * 0.03;
      r += Math.min(0.8, s.tacklesWon * 0.035 + s.interceptions * 0.05 + s.dribbles * 0.03) - s.fouls * 0.06;
      r += s.saves * 0.18;
      if (p.isGK || p.role === 'CB' || p.role === 'LB' || p.role === 'RB' || p.role === 'LWB' || p.role === 'RWB') {
        r += conceded === 0 ? 0.4 : -conceded * 0.3;
      }
      if (team.goals > team.opponent.goals) r += 0.25;
      else if (team.goals < team.opponent.goals) r -= 0.2;
      if (p.yellow) r -= 0.3;
      if (p.sentOff) r -= 1.5;
      s.rating = Math.round(Math.min(10, Math.max(3, r)) * 10) / 10;
    }
  }
}
