import { offsideLineLocal } from '../engine/ai/evaluate';
import type { Match } from '../engine/match';
import { GOAL_TOP, HALF_X, MID_Y, PITCH, toWorld } from '../engine/pitch';
import type { Player } from '../engine/player';
import { type Kit, resolveKits } from './kits';

export interface RenderOptions {
  names: boolean;
  aiVision: boolean;
  trails: boolean;
}

/** A frozen copy of everything needed to draw one frame (used for replays). */
export interface Frame {
  players: { id: string; team: 0 | 1; x: number; y: number; f: number; gk: boolean; num: number; owner: boolean }[];
  ball: { x: number; y: number; z: number };
}

const MARGIN = 4;

export class PitchRenderer {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private w = 0;
  private h = 0;
  private pitchCache: HTMLCanvasElement | null = null;
  private trail: { x: number; y: number; z: number }[] = [];
  private kits: [Kit, Kit] | null = null;
  private kitsFor: Match | null = null;
  /** Portrait pitch (goals top and bottom) with the home side attacking upwards. */
  private vertical = true;
  /** Set after half-time in portrait mode so the home side keeps attacking upwards. */
  private flip = false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vw = this.vertical ? PITCH.width : PITCH.length;
    const vh = this.vertical ? PITCH.length : PITCH.width;
    this.scale = Math.min(this.w / (vw + MARGIN * 2), this.h / (vh + MARGIN * 2));
    this.ox = (this.w - vw * this.scale) / 2;
    this.oy = (this.h - vh * this.scale) / 2;
    this.pitchCache = null;
  }

  setVertical(v: boolean): void {
    this.vertical = v;
    this.trail.length = 0;
    this.resize();
  }

  get isVertical(): boolean {
    return this.vertical;
  }

  /** World metres → canvas pixels (handles the portrait rotation). */
  sx(x: number, y: number): number {
    const vx = !this.vertical ? x : this.flip ? PITCH.width - y : y;
    return this.ox + vx * this.scale;
  }
  sy(x: number, y: number): number {
    const vy = !this.vertical ? y : this.flip ? x : PITCH.length - x;
    return this.oy + vy * this.scale;
  }

  /** World heading → screen heading. */
  private angle(f: number): number {
    return !this.vertical ? f : this.flip ? f + Math.PI / 2 : f - Math.PI / 2;
  }

  /** Canvas pixels → world metres (for hover tooltips). */
  toWorld(cx: number, cy: number): { x: number; y: number } {
    const vx = (cx - this.ox) / this.scale;
    const vy = (cy - this.oy) / this.scale;
    if (!this.vertical) return { x: vx, y: vy };
    return this.flip ? { x: vy, y: PITCH.width - vx } : { x: PITCH.length - vy, y: vx };
  }

  private drawPitch(): void {
    if (!this.pitchCache) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // The pitch is always painted landscape, then rotated for portrait mode.
      const cw = this.vertical ? this.h : this.w;
      const ch = this.vertical ? this.w : this.h;
      const c = document.createElement('canvas');
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.paintPitch(g, cw, ch);
      this.pitchCache = c;
    }
    if (!this.vertical) {
      this.ctx.drawImage(this.pitchCache, 0, 0, this.w, this.h);
      return;
    }
    const g = this.ctx;
    g.save();
    g.translate(this.w / 2, this.h / 2);
    g.rotate(this.flip ? Math.PI / 2 : -Math.PI / 2);
    g.drawImage(this.pitchCache, -this.h / 2, -this.w / 2, this.h, this.w);
    g.restore();
  }

  private paintPitch(g: CanvasRenderingContext2D, cw: number, ch: number): void {
    const s = this.scale;
    const hox = (cw - PITCH.length * s) / 2;
    const hoy = (ch - PITCH.width * s) / 2;
    const X = (x: number) => hox + x * s;
    const Y = (y: number) => hoy + y * s;
    g.fillStyle = '#1f6b35';
    g.fillRect(0, 0, cw, ch);
    // Mowing stripes.
    const stripes = 14;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#2a7d40' : '#26763b';
      g.fillRect(X((PITCH.length / stripes) * i), Y(0), (PITCH.length / stripes) * s + 0.5, PITCH.width * s);
    }
    // Vignette.
    const grad = g.createRadialGradient(cw / 2, ch / 2, ch * 0.2, cw / 2, ch / 2, cw * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = grad;
    g.fillRect(0, 0, cw, ch);

    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = Math.max(1, s * 0.12);
    g.strokeRect(X(0), Y(0), PITCH.length * s, PITCH.width * s);
    g.beginPath();
    g.moveTo(X(HALF_X), Y(0));
    g.lineTo(X(HALF_X), Y(PITCH.width));
    g.stroke();
    g.beginPath();
    g.arc(X(HALF_X), Y(MID_Y), PITCH.centreRadius * s, 0, Math.PI * 2);
    g.stroke();
    const dot = (x: number, y: number) => {
      g.beginPath();
      g.arc(X(x), Y(y), Math.max(1.5, s * 0.25), 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fill();
    };
    dot(HALF_X, MID_Y);
    for (const side of [0, 1]) {
      const x0 = side ? PITCH.length : 0;
      const sgn = side ? -1 : 1;
      const box = (depth: number, width: number) => {
        g.strokeRect(Math.min(X(x0), X(x0 + sgn * depth)), Y(MID_Y - width / 2), depth * s, width * s);
      };
      box(PITCH.boxDepth, PITCH.boxWidth);
      box(PITCH.sixDepth, PITCH.sixWidth);
      const spotX = x0 + sgn * PITCH.penaltySpot;
      dot(spotX, MID_Y);
      // Penalty arc (only the part outside the box).
      const a = Math.acos((PITCH.boxDepth - PITCH.penaltySpot) / PITCH.centreRadius);
      g.beginPath();
      if (side === 0) g.arc(X(spotX), Y(MID_Y), PITCH.centreRadius * s, -a, a);
      else g.arc(X(spotX), Y(MID_Y), PITCH.centreRadius * s, Math.PI - a, Math.PI + a);
      g.stroke();
      // Corner arcs.
      for (const cy of [0, PITCH.width]) {
        g.beginPath();
        const start = side === 0 ? (cy === 0 ? 0 : -Math.PI / 2) : cy === 0 ? Math.PI / 2 : Math.PI;
        g.arc(X(x0), Y(cy), s, start, start + Math.PI / 2);
        g.stroke();
      }
      // Goal + net.
      const gx = side ? X(PITCH.length) : X(-2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(gx, Y(GOAL_TOP), 2 * s, PITCH.goalWidth * s);
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 1;
      for (let i = 0; i <= 6; i++) {
        g.beginPath();
        g.moveTo(gx, Y(GOAL_TOP + (PITCH.goalWidth / 6) * i));
        g.lineTo(gx + 2 * s, Y(GOAL_TOP + (PITCH.goalWidth / 6) * i));
        g.stroke();
      }
      g.restore();
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(2, s * 0.2);
      g.strokeRect(gx, Y(GOAL_TOP), 2 * s, PITCH.goalWidth * s);
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = Math.max(1, s * 0.12);
    }
  }

  /** Build a frame from the live match, interpolated between the last two ticks. */
  static frame(match: Match, alpha: number): Frame {
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const ball = match.ball;
    return {
      players: match.allPlayers.map((p) => ({
        id: p.data.id,
        team: p.team.index,
        x: lerp(p.prev.x, p.pos.x),
        y: lerp(p.prev.y, p.pos.y),
        f: p.facing,
        gk: p.isGK,
        num: p.data.number,
        owner: ball.owner === p,
      })),
      ball: { x: lerp(ball.prev.x, ball.pos.x), y: lerp(ball.prev.y, ball.pos.y), z: lerp(ball.prevZ, ball.z) },
    };
  }

  draw(match: Match, frame: Frame, opts: RenderOptions, highlight: string | null = null): void {
    const g = this.ctx;
    const s = this.scale;
    g.clearRect(0, 0, this.w, this.h);
    const flip = this.vertical && match.teams[0].dir === -1;
    if (flip !== this.flip) {
      this.flip = flip;
      this.trail.length = 0;
    }
    this.drawPitch();

    if (opts.aiVision && match.phase === 'play') this.drawAIVision(match);

    // Ball trail.
    if (opts.trails) {
      this.trail.push({ ...frame.ball });
      if (this.trail.length > 24) this.trail.shift();
      g.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        if (Math.hypot(a.x - b.x, a.y - b.y) > 4) continue;
        g.strokeStyle = `rgba(255,255,255,${(i / this.trail.length) * 0.35})`;
        g.lineWidth = s * 0.25 * (i / this.trail.length);
        g.beginPath();
        g.moveTo(this.sx(a.x, a.y), this.sy(a.x, a.y) - a.z * 0.35 * s);
        g.lineTo(this.sx(b.x, b.y), this.sy(b.x, b.y) - b.z * 0.35 * s);
        g.stroke();
      }
    } else this.trail.length = 0;

    if (!this.kits || this.kitsFor !== match) {
      this.kits = resolveKits(match.teams[0].club, match.teams[1].club);
      this.kitsFor = match;
    }
    const kits = this.kits;
    const r = 0.95 * s;
    // Shadows first so they sit under everyone.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (const p of frame.players) {
      g.beginPath();
      g.ellipse(this.sx(p.x, p.y) + r * 0.25, this.sy(p.x, p.y) + r * 0.35, r, r * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (const p of frame.players) {
      const kit = kits[p.team];
      const fill = p.gk ? kit.gkFill : kit.fill;
      const stroke = p.gk ? kit.gkText : kit.stroke;
      const text = p.gk ? kit.gkText : kit.text;
      const x = this.sx(p.x, p.y);
      const y = this.sy(p.x, p.y);
      const f = this.angle(p.f);
      if (p.owner) {
        g.beginPath();
        g.arc(x, y, r * 1.6, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = Math.max(1.5, s * 0.15);
        g.stroke();
      }
      if (highlight === p.id) {
        g.beginPath();
        g.arc(x, y, r * 2.2, 0, Math.PI * 2);
        g.strokeStyle = '#fde047';
        g.lineWidth = 2;
        g.stroke();
      }
      // Facing wedge.
      g.beginPath();
      g.moveTo(x + Math.cos(f) * r * 1.45, y + Math.sin(f) * r * 1.45);
      g.lineTo(x + Math.cos(f + 0.55) * r * 0.9, y + Math.sin(f + 0.55) * r * 0.9);
      g.lineTo(x + Math.cos(f - 0.55) * r * 0.9, y + Math.sin(f - 0.55) * r * 0.9);
      g.closePath();
      g.fillStyle = stroke;
      g.fill();
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = Math.max(1, s * 0.14);
      g.strokeStyle = stroke;
      g.stroke();
      if (s > 5) {
        g.fillStyle = text;
        g.font = `700 ${Math.round(r * 1.05)}px Inter, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(p.num), x, y + 0.5);
      }
    }
    if (opts.names) {
      g.font = `600 ${Math.max(9, Math.round(s * 0.9))}px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      for (const p of frame.players) {
        const pl = match.allPlayers.find((q) => q.data.id === p.id);
        if (!pl) continue;
        const last = pl.data.name.split(' ').slice(-1)[0];
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(last, this.sx(p.x, p.y) + 1, this.sy(p.x, p.y) + r * 1.3 + 1);
        g.fillStyle = '#fff';
        g.fillText(last, this.sx(p.x, p.y), this.sy(p.x, p.y) + r * 1.3);
      }
    }

    // Ball: shadow on the ground, ball lifted by its height.
    const b = frame.ball;
    const br = Math.max(3, s * 0.42) * (1 + b.z * 0.09);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(this.sx(b.x, b.y) + b.z * s * 0.15, this.sy(b.x, b.y) + b.z * s * 0.1, br * 0.9, br * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    const bx = this.sx(b.x, b.y);
    const by = this.sy(b.x, b.y) - b.z * 0.35 * s;
    const bg = g.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#cbd5e1');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#0f172a';
    g.lineWidth = 1;
    g.stroke();
  }

  /** Overlays what the AI is "thinking": the carrier's options, offside lines and movement targets. */
  private drawAIVision(match: Match): void {
    const g = this.ctx;
    const s = this.scale;
    // Offside lines for each attacking team.
    for (const team of match.teams) {
      const lx = offsideLineLocal(team.dir, team.opponent.active, match.ball.pos);
      const wx = toWorld({ x: lx, y: 0 }, team.dir).x;
      g.setLineDash([6, 6]);
      g.strokeStyle = team.index === 0 ? '#7db5ff' : '#ffab7a';
      g.globalAlpha = 0.8;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(this.sx(wx, 0), this.sy(wx, 0));
      g.lineTo(this.sx(wx, PITCH.width), this.sy(wx, PITCH.width));
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    // Movement targets.
    for (const p of match.allPlayers) {
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(this.sx(p.pos.x, p.pos.y), this.sy(p.pos.x, p.pos.y));
      g.lineTo(this.sx(p.target.x, p.target.y), this.sy(p.target.x, p.target.y));
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(this.sx(p.target.x, p.target.y) - 2, this.sy(p.target.x, p.target.y) - 2, 4, 4);
    }
    // Ball carrier's evaluated options, coloured by utility.
    const dbg = match.debug;
    if (dbg && match.ball.owner === dbg.carrier) {
      const opts = dbg.options;
      const maxU = Math.max(...opts.map((o) => o.utility), 1e-6);
      const minU = Math.min(...opts.map((o) => o.utility), 0);
      opts.forEach((o) => {
        const q = (o.utility - minU) / (maxU - minU || 1);
        const hue = 10 + q * 120;
        g.strokeStyle = `hsla(${hue}, 85%, 55%, ${0.35 + q * 0.6})`;
        g.lineWidth = 1 + q * 3;
        if (o.kind === 'lofted' || o.kind === 'cross') g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(this.sx(dbg.carrier.pos.x, dbg.carrier.pos.y), this.sy(dbg.carrier.pos.x, dbg.carrier.pos.y));
        g.lineTo(this.sx(o.target.x, o.target.y), this.sy(o.target.x, o.target.y));
        g.stroke();
        g.setLineDash([]);
        if (q > 0.6) {
          g.fillStyle = `hsla(${hue}, 85%, 60%, 1)`;
          g.font = `600 ${Math.max(9, Math.round(s * 0.8))}px Inter, system-ui, sans-serif`;
          g.textAlign = 'left';
          g.fillText(`${o.kind} ${(o.success * 100).toFixed(0)}%`, this.sx(o.target.x, o.target.y) + 6, this.sy(o.target.x, o.target.y) - 6);
        }
      });
    }
  }

  static capture(match: Match): Frame {
    return PitchRenderer.frame(match, 1);
  }
}

export function findPlayer(match: Match, id: string): Player | undefined {
  for (const t of match.teams) for (const p of t.players) if (p.data.id === id) return p;
  return undefined;
}
