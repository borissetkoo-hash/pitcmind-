import type { Match, RestartState } from '../match';
import { HALF_X, MID_Y, PITCH, toLocal, toWorld } from '../pitch';
import type { Player } from '../player';
import type { Team } from '../team';
import { ROLE_LINE } from '../types';
import { type Vec, clamp, dist, hyp } from '../vec';
import { offsideLineLocal } from './evaluate';
import { baseShape } from './offball';

/** Positions every player for a dead-ball situation. */
export function setPieceTargets(match: Match, r: RestartState): void {
  for (const team of match.teams) {
    const attacking = team === r.team;
    const local = new Map<Player, Vec>();
    const spotL = toLocal(r.spot, team.dir);
    switch (r.type) {
      case 'kickoff':
        kickoff(team, attacking, local);
        break;
      case 'corner':
        corner(team, attacking, spotL, local);
        break;
      case 'penalty':
        penalty(team, attacking, local);
        break;
      default: {
        const offLine = offsideLineLocal(team.dir, team.opponent.active, r.spot);
        const shape = baseShape(team, r.spot, attacking, offLine);
        shape.forEach((v, p) => local.set(p, v));
      }
    }
    const gk = team.keeper;
    if (gk && !local.has(gk)) local.set(gk, { x: r.type === 'penalty' && !attacking ? 0.3 : 1.5, y: MID_Y });

    for (const p of team.active) {
      let tl = local.get(p) ?? toLocal(p.pos, team.dir);
      // Respect distance from the ball for the defending side.
      if (!attacking) {
        const minD = r.type === 'throwIn' ? 2.5 : r.type === 'kickoff' ? 9.4 : 9.4;
        const d = dist(tl, spotL);
        if (d < minD && r.type !== 'penalty') {
          const away = d > 0.01 ? { x: (tl.x - spotL.x) / d, y: (tl.y - spotL.y) / d } : { x: -1, y: 0 };
          tl = { x: spotL.x + away.x * minD, y: spotL.y + away.y * minD };
        }
        if (r.type === 'goalKick' && tl.x > PITCH.length - PITCH.boxDepth - 1 && Math.abs(tl.y - MID_Y) < PITCH.boxWidth / 2 + 1) {
          tl = { x: PITCH.length - PITCH.boxDepth - 1.5, y: tl.y };
        }
      }
      p.target = toWorld({ x: clamp(tl.x, 0.3, PITCH.length - 0.3), y: clamp(tl.y, 0.5, PITCH.width - 0.5) }, team.dir);
      p.intensity = 0.7;
    }

    if (attacking && r.taker.onPitch) {
      r.taker.target = { x: r.spot.x - team.dir * 0.4, y: r.spot.y };
      r.taker.intensity = 0.9;
    }
    if (!attacking && r.type === 'freeKick') wall(team, r.spot, match);
  }
}

function kickoff(team: Team, attacking: boolean, out: Map<Player, Vec>): void {
  for (const p of team.active) {
    if (p.isGK) continue;
    const s = team.slots[p.slot];
    let x = 18 + s.x * 34;
    const y = 4 + s.y * (PITCH.width - 8);
    x = Math.min(x, HALF_X - 1);
    if (!attacking) {
      const d = hyp(HALF_X - x, MID_Y - y);
      if (d < PITCH.centreRadius + 0.5) x = HALF_X - Math.sqrt(Math.max(0, (PITCH.centreRadius + 0.6) ** 2 - (MID_Y - y) ** 2));
    }
    out.set(p, { x, y });
  }
  if (attacking) {
    const partner = team.active.filter((p) => ROLE_LINE[p.role] === 'att' || p.role === 'AM').sort((a, b) => b.slot - a.slot)[1];
    if (partner) out.set(partner, { x: HALF_X - 1.5, y: MID_Y - 6 });
  }
}

function corner(team: Team, attacking: boolean, spotL: Vec, out: Map<Player, Vec>): void {
  const outfield = team.active.filter((p) => !p.isGK);
  if (attacking) {
    const near = spotL.y < MID_Y ? -1 : 1;
    const spots: Vec[] = [
      { x: 99.5, y: MID_Y + near * 2.5 },
      { x: 97, y: MID_Y },
      { x: 93.5, y: MID_Y + near * 1 },
      { x: 99, y: MID_Y - near * 3.5 },
      { x: 91, y: MID_Y - near * 6 },
      { x: 86, y: MID_Y + near * 3 },
    ];
    const keen = [...outfield].sort((a, b) => score(b) - score(a));
    keen.slice(0, spots.length).forEach((p, i) => out.set(p, spots[i]));
    keen.slice(spots.length).forEach((p, i) => out.set(p, { x: i === 0 ? 70 : 55, y: MID_Y + (i % 2 ? 12 : -12) }));
  } else {
    // Defending: zones at the near post, six-yard line and penalty spot, the rest mark.
    const zones: Vec[] = [
      { x: 0.8, y: spotL.y < MID_Y ? MID_Y - 3.2 : MID_Y + 3.2 },
      { x: 5, y: MID_Y - 2.5 },
      { x: 5, y: MID_Y + 2.5 },
      { x: 10.5, y: MID_Y },
    ];
    const sorted = [...outfield].sort((a, b) => b.a.heading + b.a.positioning - (a.a.heading + a.a.positioning));
    const outlet = outfield.find((p) => p.role === 'ST' || p.role === 'LW' || p.role === 'RW');
    const opponentsInBox = team.opponent.active
      .filter((o) => !o.isGK)
      .map((o) => ({ o, l: toLocal(o.pos, team.dir) }))
      .filter((x) => x.l.x < 22)
      .sort((a, b) => a.l.x - b.l.x);
    let zi = 0;
    let mi = 0;
    for (const p of sorted) {
      if (p === outlet) {
        out.set(p, { x: 40, y: MID_Y });
        continue;
      }
      if (zi < zones.length) {
        out.set(p, zones[zi++]);
      } else if (mi < opponentsInBox.length) {
        const ol = opponentsInBox[mi++].l;
        out.set(p, { x: Math.max(1, ol.x - 1.2), y: ol.y + (MID_Y - ol.y) * 0.08 });
      } else {
        out.set(p, { x: 17, y: MID_Y + (mi++ % 2 ? 8 : -8) });
      }
    }
  }
}

const score = (p: Player) => p.a.heading * 1.2 + (p.role === 'CB' ? 30 : 0) + (p.role === 'ST' ? 40 : 0) - (p.role === 'LB' || p.role === 'RB' ? 40 : 0);

function penalty(team: Team, attacking: boolean, out: Map<Player, Vec>): void {
  const outfield = team.active.filter((p) => !p.isGK);
  outfield.forEach((p, i) => {
    const y = 18 + (i / Math.max(1, outfield.length - 1)) * 32;
    const x = attacking ? PITCH.length - PITCH.boxDepth - 1.5 : PITCH.boxDepth + 1.5;
    out.set(p, { x: attacking ? x : x + (i % 2), y });
  });
  const gk = team.keeper;
  if (gk) out.set(gk, attacking ? { x: 3, y: MID_Y } : { x: 0.3, y: MID_Y });
}

/** Builds a defensive wall 9.15 m from a dangerous free kick. */
function wall(team: Team, spot: Vec, _match: Match): void {
  const own = toWorld({ x: 0, y: MID_Y }, team.dir);
  const d = dist(spot, own);
  if (d > 32) return;
  const n = d < 22 ? 4 : 3;
  const ux = (own.x - spot.x) / d;
  const uy = (own.y - spot.y) / d;
  const centre = { x: spot.x + ux * 9.15, y: spot.y + uy * 9.15 };
  const wallers = team.active.filter((p) => !p.isGK).sort((a, b) => dist(a.pos, centre) - dist(b.pos, centre)).slice(0, n);
  wallers.forEach((p, i) => {
    const off = (i - (n - 1) / 2) * 0.65;
    p.target = { x: centre.x - uy * off, y: centre.y + ux * off };
    p.intensity = 0.8;
  });
}
