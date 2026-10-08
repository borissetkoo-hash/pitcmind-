import { describe, expect, it } from 'vitest';
import { CLUB_SEEDS, LEAGUES, leagueClubIds } from '../src/data/clubSeeds';
import { ALL_COACHES, coachById } from '../src/data/coaches';
import { CLUBS } from '../src/data/clubs';
import { crestSvg, designFor } from '../src/data/crest';
import { STAFF } from '../src/data/staff';

describe('leagues and clubs', () => {
  it('every league has an even, realistic number of clubs with unique ids and short names', () => {
    for (const lg of LEAGUES) {
      const ids = leagueClubIds(lg.id);
      expect(ids.length).toBeGreaterThanOrEqual(8);
      const shorts = ids.map((id) => CLUBS.find((c) => c.id === id)!.short);
      expect(new Set(shorts).size).toBe(shorts.length);
    }
    expect(new Set(CLUB_SEEDS.map((c) => c.id)).size).toBe(CLUB_SEEDS.length);
  });

  it('every club has exactly one head coach and no real coach runs two clubs', () => {
    const coaches = CLUBS.map((c) => c.coachId!);
    for (const id of coaches) expect(coachById(id)).toBeDefined();
    expect(new Set(coaches).size).toBe(coaches.length);
  });

  it('generated club coaches are deterministic and look like real profiles', () => {
    expect(STAFF.length).toBe(CLUB_SEEDS.filter((c) => !c.coach).length);
    for (const c of STAFF) {
      expect(c.name.split(' ').length).toBeGreaterThanOrEqual(2);
      for (const v of Object.values(c.traits)) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(20);
    }
    expect(new Set(ALL_COACHES.map((c) => c.id)).size).toBe(ALL_COACHES.length);
  });

  it('draws a crest for every club', () => {
    for (const c of CLUBS) expect(crestSvg(designFor(c.id), c.colors, c.short)).toContain('<svg');
  });
});
