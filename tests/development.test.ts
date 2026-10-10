import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../src/career/avatar';
import { type CareerCoach, STYLES, endSeason, newCareer, recordResult, startNextSeason } from '../src/career/career';
import { absence, agedSquad, matchSquad, processRounds, statusOf } from '../src/career/development';
import { squadOf } from '../src/career/market';
import { rating } from '../src/career/players';
import { CLUBS, clubById } from '../src/data/clubs';
import { FORMATIONS } from '../src/engine/formations';
import { Match, type PlayerReport } from '../src/engine/match';
import { pickLineup } from '../src/engine/team';

const coach = (): CareerCoach => ({ firstName: 'Ana', lastName: 'Test', flag: '🇪🇸', look: { ...DEFAULT_LOOK }, style: 'balanced', traits: { ...STYLES.balanced.traits } });

/** Plays the next round with synthetic results: the first eleven available players of each side play 90 minutes. */
function playRound(s: ReturnType<typeof newCareer>, extra: (clubId: string, report: PlayerReport[]) => void = () => {}) {
  const round = s.league.fixtures.filter((f) => !f.result).reduce((m, f) => Math.min(m, f.round), Infinity);
  for (const f of s.league.fixtures.filter((x) => x.round === round)) {
    const report: PlayerReport[] = [];
    for (const club of [f.home, f.away]) {
      const { lineup } = pickLineup(matchSquad(s, club), FORMATIONS[clubById(club).tactics.formation]);
      for (const p of lineup) report.push({ id: p.id, minutes: 90 });
      extra(club, report);
    }
    recordResult(s, f.id, { score: [1, 1], xg: [1, 1], goals: [], report });
  }
  processRounds(s);
}

describe('player condition in the match engine', () => {
  it('starts tired players with less energy and benches them when fresher options exist', () => {
    const club = CLUBS[0];
    const tired = club.players.map((p) => ({ ...p, condition: 0.5 }));
    const m = new Match({ home: { ...club, players: tired }, away: CLUBS[1], seed: 1, fast: true });
    expect(Math.max(...m.teams[0].players.map((p) => p.energy))).toBeCloseTo(0.85, 5);
    expect(Math.min(...m.teams[1].players.map((p) => p.energy))).toBe(1);
    const slots = FORMATIONS[club.tactics.formation];
    const fresh = pickLineup(club.players, slots).lineup.map((p) => p.id);
    const star = fresh.find((id) => club.players.find((p) => p.id === id)!.position !== 'GK')!;
    const mixed = club.players.map((p) => (p.id === star ? { ...p, condition: 0.45 } : p));
    expect(pickLineup(mixed, slots).lineup.map((p) => p.id)).not.toContain(star);
  });

  it('produces injuries at a realistic rate and replaces the injured player', () => {
    let injuries = 0;
    let replaced = 0;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const m = new Match({ home: CLUBS[i % 10], away: CLUBS[(i + 4) % 10], seed: 500 + i, fast: true });
      m.runToEnd();
      const report = m.playerReport();
      const hurt = report.filter((r) => r.injured);
      injuries += hurt.length;
      for (const h of hurt) {
        const p = m.teams.flatMap((t) => t.players).find((x) => x.data.id === h.id)!;
        if (!p.onPitch) replaced++;
      }
      expect(report.every((r) => r.minutes >= 0 && r.minutes <= 95)).toBe(true);
    }
    const perMatch = injuries / n;
    expect(perMatch).toBeGreaterThan(0.1);
    expect(perMatch).toBeLessThan(1);
    expect(replaced).toBe(injuries);
  }, 120000);
});

describe('career fatigue, injuries and suspensions', () => {
  it('wears down players who play every week and recovers those who rest', () => {
    const s = newCareer(coach(), 'mnr', 4);
    for (let i = 0; i < 5; i++) playRound(s);
    const squad = squadOf(s, 'mnr');
    const conds = squad.map((p) => statusOf(s, p.id).c);
    expect(Math.min(...conds)).toBeLessThan(92);
    expect(Math.max(...conds)).toBe(100); // the reserves are fresh
    // Rotation: the XI picked for the next match isn't simply the five-match regulars.
    expect(new Set(squad.filter((p) => (statusOf(s, p.id).apps ?? 0) > 0).map((p) => p.id)).size).toBeGreaterThan(11);
  });

  it('keeps injured and suspended players out for the right number of matches', () => {
    const s = newCareer(coach(), 'mnr', 8);
    const [a, b, c] = pickLineup(matchSquad(s, 'mnr'), FORMATIONS[clubById('mnr').tactics.formation]).lineup.filter((p) => p.position !== 'GK');
    playRound(s, (club, rep) => {
      if (club !== 'mnr') return;
      rep.find((r) => r.id === a.id)!.injured = true;
      rep.find((r) => r.id === b.id)!.red = 2;
      rep.find((r) => r.id === c.id)!.yellows = 5;
    });
    const inj = { ...statusOf(s, a.id).inj! };
    expect(inj.r).toBeGreaterThanOrEqual(1);
    expect(statusOf(s, b.id).ban).toBe(2);
    expect(statusOf(s, c.id).ban).toBe(1);
    const ids = () => matchSquad(s, 'mnr').map((p) => p.id);
    expect(ids()).not.toContain(a.id);
    expect(ids()).not.toContain(b.id);
    expect(ids()).not.toContain(c.id);
    playRound(s);
    expect(ids()).toContain(c.id); // one-match ban served
    expect(ids()).not.toContain(b.id);
    playRound(s);
    expect(ids()).toContain(b.id);
    for (let i = 1; i < inj.r; i++) playRound(s);
    expect(absence(s, a.id)).toBeNull();
    expect(statusOf(s, a.id).c).toBeLessThanOrEqual(100);
    expect(s.news.some((n) => n.ru.includes(a.name))).toBe(true);
  });

  it('always fields eleven, even in an injury crisis', () => {
    const s = newCareer(coach(), 'mnr', 9);
    for (const p of squadOf(s, 'mnr').slice(0, 12)) (s.fitness ??= {})[p.id] = { c: 100, inj: { k: 'knee', r: 5 } };
    const squad = matchSquad(s, 'mnr');
    expect(squad.length).toBeGreaterThanOrEqual(11);
    expect(squad.some((p) => p.position === 'GK')).toBe(true);
  });
});

describe('development and ageing', () => {
  it('grows young players towards their potential and wears down veterans over a season', () => {
    const s = newCareer(coach(), 'mnr', 12);
    s.training = { intensity: 'high', focus: 'balanced' };
    const before = new Map(squadOf(s, 'mnr').map((p) => [p.id, { r: rating(p), age: p.age }]));
    for (let i = 0; i < 18; i++) playRound(s);
    const after = squadOf(s, 'mnr');
    const delta = (pred: (age: number) => boolean) => {
      const ps = after.filter((p) => before.has(p.id) && pred(before.get(p.id)!.age));
      return ps.reduce((a, p) => a + rating(p) - before.get(p.id)!.r, 0) / Math.max(1, ps.length);
    };
    expect(delta((a) => a <= 22)).toBeGreaterThan(0.5);
    expect(delta((a) => a >= 31)).toBeLessThan(0);
    for (const p of after) expect(rating(p)).toBeLessThanOrEqual(Math.max(p.potential!, before.get(p.id)?.r ?? 0));
  });

  it('ages every squad between seasons, retires veterans and keeps AI squads deterministic', () => {
    const s = newCareer(coach(), 'mnr', 3);
    const ageBefore = new Map(squadOf(s, 'mnr').map((p) => [p.id, p.age]));
    const aiBefore = squadOf(s, 'mdb');
    for (let i = 0; i < 18; i++) playRound(s);
    endSeason(s);
    startNextSeason(s);
    for (const p of squadOf(s, 'mnr')) if (ageBefore.has(p.id)) expect(p.age).toBe(ageBefore.get(p.id)! + 1);
    expect(squadOf(s, 'mnr').length).toBeGreaterThanOrEqual(18);
    const ai = squadOf(s, 'mdb');
    expect(ai).not.toEqual(aiBefore);
    expect(agedSquad(s, 'mdb')).toBe(agedSquad(s, 'mdb'));
    // Ten seasons on, nobody from the original squads is still playing at 40.
    const far = { ...s, season: 11 };
    expect(Math.max(...agedSquad(far, 'mdb').map((p) => p.age))).toBeLessThan(39);
    expect(agedSquad(far, 'mdb')).toHaveLength(20);
  });
});
