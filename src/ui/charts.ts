import type { MatchEvent, ShotRecord } from '../engine/match';
import { MID_Y, PITCH } from '../engine/pitch';

/** Chart series colours: validated categorical slots 1 & 2 for the dark surface. */
export const SERIES = ['var(--series-1)', 'var(--series-2)'] as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One floating tooltip for every chart; marks carry their text in data-tip. */
export function installTooltips(root: HTMLElement): void {
  let tip = document.querySelector<HTMLDivElement>('.viz-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  const el = tip;
  root.addEventListener('pointermove', (ev) => {
    const target = (ev.target as Element).closest('[data-tip]');
    if (!target) {
      el.style.opacity = '0';
      return;
    }
    el.innerHTML = target.getAttribute('data-tip')!;
    el.style.opacity = '1';
    const w = el.offsetWidth;
    const x = Math.min(window.innerWidth - w - 8, ev.clientX + 14);
    el.style.transform = `translate(${Math.max(8, x)}px, ${ev.clientY + 14}px)`;
  });
  root.addEventListener('pointerleave', () => (el.style.opacity = '0'));
}

function pitchMarkings(w: number, h: number): string {
  const sx = w / PITCH.length;
  const sy = h / PITCH.width;
  const X = (x: number) => (x * sx).toFixed(1);
  const Y = (y: number) => (y * sy).toFixed(1);
  const box = (x: number, depth: number, width: number) =>
    `<rect x="${X(x)}" y="${Y(MID_Y - width / 2)}" width="${(depth * sx).toFixed(1)}" height="${(width * sy).toFixed(1)}"/>`;
  return `<g class="pitch-lines">
    <rect x="0" y="0" width="${w}" height="${h}"/>
    <line x1="${X(PITCH.length / 2)}" y1="0" x2="${X(PITCH.length / 2)}" y2="${h}"/>
    <ellipse cx="${X(PITCH.length / 2)}" cy="${Y(MID_Y)}" rx="${(PITCH.centreRadius * sx).toFixed(1)}" ry="${(PITCH.centreRadius * sy).toFixed(1)}"/>
    ${box(0, PITCH.boxDepth, PITCH.boxWidth)}${box(PITCH.length - PITCH.boxDepth, PITCH.boxDepth, PITCH.boxWidth)}
    ${box(0, PITCH.sixDepth, PITCH.sixWidth)}${box(PITCH.length - PITCH.sixDepth, PITCH.sixDepth, PITCH.sixWidth)}
  </g>`;
}

/**
 * Shot map on a full pitch: home attacks right, away attacks left.
 * Circle area ∝ xG, filled = goal, hollow = no goal.
 */
export function shotMap(shots: ShotRecord[], names: [string, string], labels: { goal: string; shot: string; size: string }): string {
  const w = 525;
  const h = 340;
  const sx = w / PITCH.length;
  const sy = h / PITCH.width;
  const marks = shots
    .map((s) => {
      const x = s.team === 0 ? s.x : PITCH.length - s.x;
      const y = s.team === 0 ? s.y : PITCH.width - s.y;
      const r = 3.5 + Math.sqrt(s.xg) * 16;
      const goal = s.outcome === 'goal';
      const tip = `<b>${esc(s.player)}</b> · ${s.minute + 1}'<br>${names[s.team]}<br>xG ${s.xg.toFixed(2)} · ${s.outcome}${s.header ? ' · header' : ''}${s.penalty ? ' · pen' : ''}`;
      return `<circle class="shot ${goal ? 'goal' : ''}" cx="${(x * sx).toFixed(1)}" cy="${(y * sy).toFixed(1)}" r="${r.toFixed(1)}"
        style="--c:${SERIES[s.team]}" data-tip="${esc(tip)}"/>`;
    })
    .join('');
  return `<figure class="chart">
    <svg viewBox="-2 -2 ${w + 4} ${h + 4}" class="pitch-svg" role="img" aria-label="Shot map">
      ${pitchMarkings(w, h)}${marks}
    </svg>
    <figcaption class="legend">
      <span><i class="dot" style="background:${SERIES[0]}"></i>${esc(names[0])} →</span>
      <span>← ${esc(names[1])} <i class="dot" style="background:${SERIES[1]}"></i></span>
      <span><i class="dot filled"></i>${labels.goal}</span><span><i class="dot hollow"></i>${labels.shot}</span><span class="muted">${labels.size}</span>
    </figcaption>
  </figure>`;
}

/** Positional heat map (local frame: the player's team attacks to the right). */
export function heatMap(grid: number[], title: string): string {
  const cols = 21;
  const rows = 14;
  const w = 525;
  const h = 340;
  const cw = w / cols;
  const ch = h / rows;
  const total = grid.reduce((a, b) => a + b, 0) || 1;
  // Light 3×3 blur so the picture reads as zones rather than pixels.
  const blur = grid.map((_, i) => {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    let s = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const wgt = dx === 0 && dy === 0 ? 4 : 1;
        s += (grid[y * cols + x] ?? 0) * wgt;
        n += wgt;
      }
    return s / n;
  });
  const bmax = Math.max(1e-9, ...blur);
  const cells = blur
    .map((v, i) => {
      if (v <= 0) return '';
      const q = v / bmax;
      const x = (i % cols) * cw;
      const y = Math.floor(i / cols) * ch;
      const pct = ((grid[i] / total) * 100).toFixed(1);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cw - 1).toFixed(1)}" height="${(ch - 1).toFixed(1)}" rx="2"
        style="fill:var(--seq-hue);fill-opacity:${(0.08 + q * 0.85).toFixed(2)}" data-tip="${pct}% ${esc(title)}"/>`;
    })
    .join('');
  return `<figure class="chart">
    <svg viewBox="-2 -2 ${w + 4} ${h + 4}" class="pitch-svg" role="img" aria-label="${esc(title)}">${cells}${pitchMarkings(w, h)}
      <text x="${w - 8}" y="${h - 8}" class="axis-label" text-anchor="end">→</text></svg>
  </figure>`;
}

/** Diverging per-minute bars: home pressure up, away down, goals marked on the axis. */
export function momentumChart(momentum: [number, number][], events: MatchEvent[], names: [string, string], minuteLabel: string): string {
  const w = 640;
  const h = 170;
  const padL = 8;
  const padR = 8;
  const mid = h / 2;
  const minutes = Math.max(90, momentum.length);
  // 3-minute rolling sum so the shape is readable.
  const smooth = momentum.map((_, i) => {
    let a = 0;
    let b = 0;
    for (let k = Math.max(0, i - 1); k <= Math.min(momentum.length - 1, i + 1); k++) {
      a += momentum[k][0];
      b += momentum[k][1];
    }
    return [a, b] as [number, number];
  });
  const max = Math.max(0.01, ...smooth.map((m) => Math.max(m[0], m[1])));
  const bw = (w - padL - padR) / minutes;
  const bars = smooth
    .map((m, i) => {
      const x = padL + i * bw;
      const hh = (m[0] / max) * (mid - 14);
      const ha = (m[1] / max) * (mid - 14);
      const tip = `${i + 1}'<br>${esc(names[0])}: ${m[0].toFixed(2)}<br>${esc(names[1])}: ${m[1].toFixed(2)}`;
      return `<g data-tip="${tip}"><rect x="${x}" y="0" width="${bw}" height="${h}" fill="transparent"/>
        ${hh > 0.5 ? `<rect x="${(x + 1).toFixed(1)}" y="${(mid - 1 - hh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${hh.toFixed(1)}" rx="2" fill="${SERIES[0]}"/>` : ''}
        ${ha > 0.5 ? `<rect x="${(x + 1).toFixed(1)}" y="${(mid + 1).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${ha.toFixed(1)}" rx="2" fill="${SERIES[1]}"/>` : ''}</g>`;
    })
    .join('');
  const goals = events
    .filter((e) => e.type === 'goal' || e.type === 'ownGoal')
    .map((e) => {
      const x = padL + Math.min(minutes - 1, Math.floor(e.time / 60)) * bw + bw / 2;
      const y = e.team === 0 ? 10 : h - 10;
      return `<g data-tip="⚽ ${e.minute} ${esc(e.player ?? '')}"><circle cx="${x}" cy="${y}" r="7" class="goal-pin" style="--c:${SERIES[e.team ?? 0]}"/>
        <text x="${x}" y="${y + 3.5}" text-anchor="middle" class="goal-pin-text">⚽</text></g>`;
    })
    .join('');
  const ticks = [0, 15, 30, 45, 60, 75, 90]
    .map((m) => `<text x="${padL + m * bw}" y="${mid + 4}" class="axis-label" text-anchor="middle" dy="0">${m ? m + "'" : ''}</text>`)
    .join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Momentum">
      <line x1="${padL}" x2="${w - padR}" y1="${mid}" y2="${mid}" class="baseline"/>
      ${bars}${goals}${ticks}
    </svg>
    <figcaption class="legend"><span><i class="dot" style="background:${SERIES[0]}"></i>${esc(names[0])}</span>
      <span><i class="dot" style="background:${SERIES[1]}"></i>${esc(names[1])}</span><span class="muted">${minuteLabel}</span></figcaption>
  </figure>`;
}

/** Cumulative xG step lines with goal markers. */
export function xgTimeline(shots: ShotRecord[], events: MatchEvent[], names: [string, string], endMinute: number): string {
  const w = 640;
  const h = 200;
  const pad = { l: 34, r: 60, t: 12, b: 24 };
  const maxMin = Math.max(90, endMinute);
  const series = [0, 1].map((team) => {
    let acc = 0;
    const pts: [number, number][] = [[0, 0]];
    for (const s of shots.filter((x) => x.team === team).sort((a, b) => a.minute - b.minute)) {
      pts.push([s.minute, acc]);
      acc += s.xg;
      pts.push([s.minute, acc]);
    }
    pts.push([maxMin, acc]);
    return pts;
  });
  const maxY = Math.max(1, ...series.map((s) => s[s.length - 1][1])) * 1.1;
  const X = (m: number) => pad.l + (m / maxMin) * (w - pad.l - pad.r);
  const Y = (v: number) => h - pad.b - (v / maxY) * (h - pad.t - pad.b);
  const grid = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]
    .filter((v) => v <= maxY)
    .map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="axis-label">${v}</text>`)
    .join('');
  const lines = series
    .map((pts, i) => {
      const d = pts.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      const last = pts[pts.length - 1];
      return `<path d="${d}" fill="none" stroke="${SERIES[i]}" stroke-width="2" stroke-linejoin="round"/>
        <text x="${X(last[0]) + 6}" y="${Y(last[1]) + 4}" class="direct-label">${esc(names[i])} ${last[1].toFixed(2)}</text>`;
    })
    .join('');
  const goalDots = events
    .filter((e) => e.type === 'goal')
    .map((e) => {
      const team = e.team ?? 0;
      const m = Math.floor(e.time / 60);
      let acc = 0;
      for (const s of shots) if (s.team === team && s.minute <= m) acc += s.xg;
      return `<circle cx="${X(m)}" cy="${Y(acc)}" r="5" class="goal-dot" style="--c:${SERIES[team]}" data-tip="⚽ ${e.minute} ${esc(e.player ?? '')}"/>`;
    })
    .join('');
  const xt = [0, 15, 30, 45, 60, 75, 90].map((m) => `<text x="${X(m)}" y="${h - 6}" text-anchor="middle" class="axis-label">${m}'</text>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cumulative xG">${grid}${lines}${goalDots}${xt}</svg></figure>`;
}

/** Side-by-side comparison rows (one shared scale per row). */
export function statRows(rows: { label: string; a: number; b: number; fmt?: (v: number) => string }[]): string {
  return `<div class="stat-rows">${rows
    .map((r) => {
      const tot = r.a + r.b || 1;
      const f = r.fmt ?? ((v: number) => String(Math.round(v)));
      return `<div class="stat-row">
        <span class="v">${f(r.a)}</span><span class="label">${r.label}</span><span class="v">${f(r.b)}</span>
        <div class="bar"><i style="width:${((r.a / tot) * 100).toFixed(1)}%;background:${SERIES[0]}"></i><i style="width:${((r.b / tot) * 100).toFixed(1)}%;background:${SERIES[1]}"></i></div>
      </div>`;
    })
    .join('')}</div>`;
}
