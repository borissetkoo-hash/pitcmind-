import type { ClubData } from '../engine/types';
import { Rng } from '../engine/rng';

export interface GoalRecord {
  player: string;
  club: string;
  minute: string;
}

export interface FixtureResult {
  score: [number, number];
  xg: [number, number];
  goals: GoalRecord[];
}

export interface Fixture {
  id: number;
  round: number;
  home: string;
  away: string;
  seed: number;
  result?: FixtureResult;
}

export interface TableRow {
  club: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  pts: number;
  form: ('W' | 'D' | 'L')[];
}

/** Double round-robin fixtures by the circle method: every club meets every other home and away. */
export function roundRobin(clubIds: string[], seed: number): Fixture[] {
  const ids = [...clubIds];
  const rng = new Rng(seed);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (ids.length % 2) ids.push('BYE');
  const n = ids.length;
  const firstLeg: [string, string][][] = [];
  const rot = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    const cur = [ids[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = cur[i];
      const b = cur[n - 1 - i];
      if (a === 'BYE' || b === 'BYE') continue;
      // Alternate home advantage so nobody plays five home games in a row.
      round.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    firstLeg.push(round);
    rot.unshift(rot.pop()!);
  }
  const all = [...firstLeg, ...firstLeg.map((rd) => rd.map(([a, b]) => [b, a] as [string, string]))];
  let id = 0;
  return all.flatMap((rd, r) => rd.map(([home, away]) => ({ id: id++, round: r + 1, home, away, seed: (seed * 7919 + id * 104729) >>> 0 })));
}

export function computeTable(clubIds: string[], fixtures: Fixture[]): TableRow[] {
  const rows = new Map<string, TableRow>(
    clubIds.map((c) => [c, { club: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, xgf: 0, xga: 0, pts: 0, form: [] }]),
  );
  for (const f of [...fixtures].sort((a, b) => a.round - b.round)) {
    if (!f.result) continue;
    const h = rows.get(f.home)!;
    const a = rows.get(f.away)!;
    const [gh, ga] = f.result.score;
    h.p++;
    a.p++;
    h.gf += gh;
    h.ga += ga;
    a.gf += ga;
    a.ga += gh;
    h.xgf += f.result.xg[0];
    h.xga += f.result.xg[1];
    a.xgf += f.result.xg[1];
    a.xga += f.result.xg[0];
    if (gh > ga) {
      h.w++; a.l++; h.pts += 3; h.form.push('W'); a.form.push('L');
    } else if (gh < ga) {
      a.w++; h.l++; a.pts += 3; a.form.push('W'); h.form.push('L');
    } else {
      h.d++; a.d++; h.pts++; a.pts++; h.form.push('D'); a.form.push('D');
    }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.club.localeCompare(y.club));
}

export function topScorers(fixtures: Fixture[], limit = 10): { player: string; club: string; goals: number }[] {
  const m = new Map<string, { player: string; club: string; goals: number }>();
  for (const f of fixtures) {
    for (const g of f.result?.goals ?? []) {
      const k = `${g.club}|${g.player}`;
      const e = m.get(k) ?? { player: g.player, club: g.club, goals: 0 };
      e.goals++;
      m.set(k, e);
    }
  }
  return [...m.values()].sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player)).slice(0, limit);
}

export interface SeasonState {
  seed: number;
  clubs: string[];
  fixtures: Fixture[];
}

export function newSeason(clubs: ClubData[], seed: number): SeasonState {
  const ids = clubs.map((c) => c.id);
  return { seed, clubs: ids, fixtures: roundRobin(ids, seed) };
}

export function nextRound(s: SeasonState): number | null {
  const pending = s.fixtures.filter((f) => !f.result);
  return pending.length ? Math.min(...pending.map((f) => f.round)) : null;
}
