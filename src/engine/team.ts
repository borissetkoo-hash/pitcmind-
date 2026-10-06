import { FORMATIONS, type Slot, roleFit } from './formations';
import { Player } from './player';
import { PITCH, toWorld } from './pitch';
import { type ClubData, type CoachTraits, type PlayerData, type Tactics, withDefaults } from './types';
import { overall } from './attributes';

export interface TeamStats {
  possessionTicks: number;
  shots: number;
  shotsOnTarget: number;
  xg: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  fouls: number;
  corners: number;
  offsides: number;
  yellows: number;
  reds: number;
  saves: number;
}

export const emptyTeamStats = (): TeamStats => ({
  possessionTicks: 0, shots: 0, shotsOnTarget: 0, xg: 0, passes: 0, passesCompleted: 0, tackles: 0,
  tacklesWon: 0, interceptions: 0, fouls: 0, corners: 0, offsides: 0, yellows: 0, reds: 0, saves: 0,
});

/** Picks the strongest XI for a formation: greedy over slots, scarcest positions first. */
export function pickLineup(players: PlayerData[], slots: Slot[]): { lineup: PlayerData[]; bench: PlayerData[] } {
  const remaining = [...players];
  const lineup: PlayerData[] = new Array(slots.length);
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => (a.s.role === 'GK' ? -1 : b.s.role === 'GK' ? 1 : 0));
  for (const { s, i } of order) {
    let best = 0;
    let bestScore = -Infinity;
    remaining.forEach((p, idx) => {
      const score = overall(p.attrs, s.role) * roleFit(p.position, s.role);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    });
    lineup[i] = remaining.splice(best, 1)[0];
  }
  return { lineup, bench: remaining };
}

export class Team {
  readonly index: 0 | 1;
  readonly club: ClubData;
  tactics: Tactics;
  dir: 1 | -1;
  players: Player[] = [];
  bench: PlayerData[];
  subsLeft = 5;
  goals = 0;
  stats: TeamStats = emptyTeamStats();
  opponent!: Team;
  /** Coaching modifiers: 0.07 per attribute point away from 10, so 0 is neutral and 0.7 elite. */
  readonly coaching: Record<keyof CoachTraits, number>;
  /** Match clock when this team last won the ball back (drives counter-attacks). */
  wonBallAt = -99;

  constructor(index: 0 | 1, club: ClubData, tactics: Tactics, dir: 1 | -1, coach?: CoachTraits) {
    const c = coach ?? { passing: 10, organisation: 10, pressing: 10, counter: 10, setPieces: 10, aerial: 10, fitness: 10 };
    // A great coach matters, but less than the players: an elite attribute (20) gives k = 0.7.
    const k = (v: number) => ((v - 10) / 10) * 0.7;
    this.coaching = {
      passing: k(c.passing), organisation: k(c.organisation), pressing: k(c.pressing), counter: k(c.counter),
      setPieces: k(c.setPieces), aerial: k(c.aerial), fitness: k(c.fitness),
    };
    this.index = index;
    this.club = club;
    this.tactics = withDefaults(tactics);
    this.dir = dir;
    const slots = FORMATIONS[this.tactics.formation];
    const { lineup, bench } = pickLineup(club.players, slots);
    this.bench = bench;
    this.players = lineup.map((pd, i) => {
      const s = slots[i];
      const local = { x: 3 + s.x * 45, y: s.y * PITCH.width };
      return new Player(pd, this, s.role, i, toWorld(local, dir));
    });
  }

  get slots(): Slot[] {
    return FORMATIONS[this.tactics.formation];
  }

  /** Bumped whenever the set of players on the pitch changes (subs, red cards). */
  rosterVersion = 0;
  private activeCache: Player[] | null = null;
  private keeperCache: Player | undefined;

  /** Players currently on the pitch (cached: this is read in every hot loop of the AI). */
  get active(): Player[] {
    if (!this.activeCache) {
      this.activeCache = this.players.filter((p) => p.onPitch);
      this.keeperCache = this.activeCache.find((p) => p.isGK);
    }
    return this.activeCache;
  }

  get keeper(): Player | undefined {
    this.active;
    return this.keeperCache;
  }

  rosterChanged(): void {
    this.activeCache = null;
    this.rosterVersion++;
  }

  /** Switch formation mid-match: players keep their order but take the new slots' roles. */
  setTactics(t: Tactics): void {
    const changed = t.formation !== this.tactics.formation;
    this.tactics = withDefaults(t);
    if (!changed) return;
    const slots = this.slots;
    const outfield = this.players.filter((p) => !p.isGK);
    const freeSlots = slots.map((s, i) => ({ s, i })).filter((x) => x.s.role !== 'GK');
    // Assign each outfield player to the best remaining slot by fit.
    for (const p of [...outfield].sort((a, b) => a.slot - b.slot)) {
      let bi = 0;
      let bs = -Infinity;
      freeSlots.forEach((fs, k) => {
        const sc = roleFit(p.data.position, fs.s.role) - Math.abs(fs.s.y - (slots[p.slot]?.y ?? 0.5)) * 0.3;
        if (sc > bs) {
          bs = sc;
          bi = k;
        }
      });
      const chosen = freeSlots.splice(bi, 1)[0];
      if (chosen) {
        p.slot = chosen.i;
        p.role = chosen.s.role;
      }
    }
  }
}
