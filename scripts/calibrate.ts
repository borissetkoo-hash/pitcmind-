/**
 * Headless calibration run: plays many matches and compares aggregate numbers with
 * real top-flight football. Usage: npm run calibrate -- [matches]
 */
import { CLUBS } from '../src/data/clubs';
import { Match } from '../src/engine/match';

const N = Number(process.argv[2] ?? 40);
const agg = {
  goals: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, completed: 0, fouls: 0, corners: 0, offsides: 0, yellows: 0, reds: 0,
  saves: 0, homeWins: 0, draws: 0, pens: 0, tackles: 0,
};
const goalDist = new Map<number, number>();
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const home = CLUBS[i % CLUBS.length];
  const away = CLUBS[(i * 3 + 1) % CLUBS.length === i % CLUBS.length ? (i + 1) % CLUBS.length : (i * 3 + 1) % CLUBS.length];
  const m = new Match({ home, away, seed: 1000 + i, fast: process.argv.includes('--fast') });
  const r = m.runToEnd();
  const g = r.score[0] + r.score[1];
  goalDist.set(g, (goalDist.get(g) ?? 0) + 1);
  agg.goals += g;
  if (r.score[0] > r.score[1]) agg.homeWins++;
  else if (r.score[0] === r.score[1]) agg.draws++;
  for (const s of r.stats) {
    agg.shots += s.shots; agg.onTarget += s.shotsOnTarget; agg.xg += s.xg; agg.passes += s.passes; agg.completed += s.passesCompleted;
    agg.fouls += s.fouls; agg.corners += s.corners; agg.offsides += s.offsides; agg.yellows += s.yellows; agg.reds += s.reds; agg.saves += s.saves;
    agg.tackles += s.tackles;
  }
  agg.pens += r.shots.filter((s) => s.penalty).length;
  if (process.argv.includes('-v')) console.log(`${r.home} ${r.score[0]}-${r.score[1]} ${r.away}  poss ${r.possession.join('/')}  shots ${r.stats[0].shots}-${r.stats[1].shots}  xg ${r.stats[0].xg.toFixed(2)}-${r.stats[1].xg.toFixed(2)}`);
}
const ms = performance.now() - t0;
const per = (v: number) => (v / N).toFixed(2);
console.log(`\n${N} matches in ${(ms / 1000).toFixed(1)}s (${(ms / N).toFixed(0)} ms/match)`);
console.table({
  'goals / match': [per(agg.goals), '2.7'],
  'shots / match': [per(agg.shots), '25'],
  'on target / match': [per(agg.onTarget), '8.5'],
  'xG / match': [per(agg.xg), '2.6'],
  'goals / xG': [(agg.goals / agg.xg).toFixed(2), '1.0'],
  'passes / match': [per(agg.passes), '900'],
  'pass completion %': [((agg.completed / agg.passes) * 100).toFixed(1), '82'],
  'tackles / match': [per(agg.tackles), '35'],
  'fouls / match': [per(agg.fouls), '22'],
  'corners / match': [per(agg.corners), '10'],
  'offsides / match': [per(agg.offsides), '4'],
  'yellows / match': [per(agg.yellows), '4'],
  'reds / match': [per(agg.reds), '0.12'],
  'penalties / match': [per(agg.pens), '0.3'],
  'home win %': [((agg.homeWins / N) * 100).toFixed(0), '45'],
  'draw %': [((agg.draws / N) * 100).toFixed(0), '25'],
});
console.log('total goals distribution', [...goalDist.entries()].sort((a, b) => a[0] - b[0]));
