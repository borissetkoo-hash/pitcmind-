import { toLocal } from '../engine/pitch';
import { Match, type MatchEvent } from '../engine/match';
import type { Player } from '../engine/player';
import { computeRatings } from '../engine/ratings';
import { commentary, t } from '../i18n';
import { resolveKits } from '../render/kits';
import { type Frame, PitchRenderer } from '../render/renderer';
import { installTooltips, momentumChart, statRows } from './charts';
import { getSettings } from '../settings';
import { coachAvatar, coachName } from './coachUi';
import { renderReport } from './report';
import { type MatchSetup, tacticsControls } from './setup';

const SPEEDS = [1, 2, 4, 8, 16, 32];
const REPLAY_SECONDS = 7;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface MatchViewOptions {
  instant?: boolean;
  /** Called once with the finished match (used by league mode to record the result). */
  onFinish?: (m: Match) => void;
  onNewMatch?: () => void;
}

/** Interactive live match: canvas pitch, broadcast scoreboard and analysis side panel. */
export class MatchView {
  readonly match: Match;
  private renderer!: PitchRenderer;
  private speed = 8;
  private playing = true;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private names: [string, string];
  private opts = { names: false, aiVision: false, trails: true, autoReplay: true };
  private tab: 'feed' | 'stats' | 'lineups' | 'tactics' = 'feed';
  private lineupTeam: 0 | 1 = 0;
  private tacticsTeam: 0 | 1 = 0;
  private frames: Frame[] = [];
  private replay: { frames: Frame[]; i: number } | null = null;
  private lastPanelUpdate = 0;
  private hoverId: string | null = null;
  private finishedHandled = false;
  private destroyed = false;
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private setup: MatchSetup, private options: MatchViewOptions = {}) {
    this.match = new Match({
      home: setup.home, away: setup.away, homeTactics: setup.homeTactics, awayTactics: setup.awayTactics, seed: setup.seed,
      homeCoach: setup.homeCoach?.traits, awayCoach: setup.awayCoach?.traits,
    });
    this.names = [setup.home.short, setup.away.short];
    this.build();
    this.match.onEvent((e) => this.onEvent(e));
    for (const e of this.match.events) this.onEvent(e);
    if (options.instant) this.runInstant();
    else this.start();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
  }

  // ───────────────────────────── layout ──

  private build(): void {
    const { home, away } = this.setup;
    const [hk, ak] = resolveKits(home, away);
    const portrait = getSettings().verticalPitch;
    const scoreboard = `
          <div class="panel scoreboard">
            <div class="sb-team"><span class="sb-kit" style="background:${hk.fill};border-color:${hk.stroke}"></span><span class="name">${esc(home.name)}</span></div>
            <div class="sb-center"><div class="sb-score num" id="score">0 : 0</div><div class="sb-clock" id="clock">0'</div><div class="sb-xg" id="xg">xG 0.00 – 0.00</div></div>
            <div class="sb-team away"><span class="name">${esc(away.name)}</span><span class="sb-kit" style="background:${ak.fill};border-color:${ak.stroke}"></span></div>
          </div>`;
    const pitch = `
          <div class="pitch-wrap ${portrait ? 'portrait' : ''}">
            <canvas id="pitch" aria-label="Pitch"></canvas>
            <div class="replay-badge" id="replayBadge">REPLAY</div>
            <div class="toast" id="toast"><div class="big">${t('goal')}</div><div id="toastText"></div></div>
            <div class="hover-card" id="hover"></div>
          </div>`;
    const controls = `
          <div class="controls">
            <button class="btn small" id="play" type="button"></button>
            <div class="seg" id="speeds" role="group" aria-label="${t('speed')}">${SPEEDS.map((s) => `<button type="button" data-s="${s}">${s}×</button>`).join('')}</div>
            <button class="btn small" id="end" type="button">⏭ ${t('toEnd')}</button>
            <button class="btn small" id="replay" type="button" disabled>↺ ${t('replay')}</button>
            <span class="sep"></span>
            <label class="toggle"><input type="checkbox" data-opt="names"> ${t('names')}</label>
            <label class="toggle"><input type="checkbox" data-opt="aiVision"> ${t('aiVision')}</label>
            <label class="toggle"><input type="checkbox" data-opt="trails" checked> ${t('trails')}</label>
          </div>`;
    const momentum = `<div class="panel below"><div class="card-title"><h3>${t('momentum')}</h3><span class="muted" id="poss"></span></div><div id="momentum"></div></div>`;
    const tabs = `
          <aside class="panel side">
          <div class="tabs" role="tablist">
            <button role="tab" data-tab="feed">${t('commentary')}</button>
            <button role="tab" data-tab="stats">${t('stats')}</button>
            <button role="tab" data-tab="lineups">${t('lineups')}</button>
            <button role="tab" data-tab="tactics">${t('tactics')}</button>
          </div>
          <div class="tab-body" id="tabFeed"><ul class="feed" id="feed"></ul></div>
          <div class="tab-body" id="tabStats" hidden></div>
          <div class="tab-body" id="tabLineups" hidden></div>
          <div class="tab-body" id="tabTactics" hidden></div>
        </aside>`;
    // Portrait follows the design sketch: tall pitch on the left, match info stacked on the right.
    this.root.innerHTML = portrait
      ? `<div class="match-portrait">
          <section class="pitch-col">${pitch}</section>
          <section class="info-col">
            ${scoreboard}
            <div class="panel quick-stats"><div class="card-title"><h3>${t('liveStats')}</h3></div><div id="quickStats"></div></div>
            ${controls}
            ${tabs}
            ${momentum}
          </section>
        </div>
        <div id="report"></div>`
      : `<div class="match-layout">
          <section>${scoreboard}${pitch}${controls}${momentum}<div id="report"></div></section>
          ${tabs}
        </div>`;
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector<T>(sel)!;
    for (const id of ['score', 'clock', 'xg', 'toast', 'toastText', 'hover', 'play', 'end', 'replay', 'replayBadge', 'momentum', 'poss', 'feed', 'tabFeed', 'tabStats', 'tabLineups', 'tabTactics', 'report', 'quickStats']) {
      const found = this.root.querySelector<HTMLElement>(`#${id}`);
      if (found) this.el[id] = found;
    }
    const canvas = q<HTMLCanvasElement>('#pitch');
    this.renderer = new PitchRenderer(canvas);
    this.renderer.setVertical(portrait);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
    installTooltips(this.root);

    this.el.play.addEventListener('click', () => this.setPlaying(!this.playing));
    q('#speeds').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) this.setSpeed(Number(b.dataset.s));
    });
    this.el.end.addEventListener('click', () => this.runInstant());
    this.el.replay.addEventListener('click', () => this.startReplay());
    this.root.querySelectorAll<HTMLInputElement>('[data-opt]').forEach((inp) =>
      inp.addEventListener('change', () => {
        (this.opts as Record<string, boolean>)[inp.dataset.opt!] = inp.checked;
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.tab as typeof this.tab)));
    canvas.addEventListener('pointermove', (e) => this.onHover(e, canvas));
    canvas.addEventListener('pointerleave', () => {
      this.hoverId = null;
      this.el.hover.style.display = 'none';
    });
    this.setTab('feed');
    this.speed = getSettings().defaultSpeed;
    this.opts.autoReplay = getSettings().autoReplay;
    this.setSpeed(this.speed);
    this.setPlaying(true);
  }

  private onResize = () => this.renderer.resize();

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.setPlaying(!this.playing);
    } else if (/^Digit[1-6]$/.test(e.code)) this.setSpeed(SPEEDS[Number(e.code.slice(5)) - 1]);
    else if (e.key === 'v' || e.key === 'V') {
      this.opts.aiVision = !this.opts.aiVision;
      const box = this.root.querySelector<HTMLInputElement>('[data-opt="aiVision"]');
      if (box) box.checked = this.opts.aiVision;
    }
  };

  private setPlaying(p: boolean): void {
    this.playing = p;
    this.el.play.textContent = p ? `⏸ ${t('pause')}` : `▶ ${t('play')}`;
  }

  private setSpeed(s: number): void {
    this.speed = s;
    this.root.querySelectorAll<HTMLButtonElement>('#speeds button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.s) === s)));
  }

  private setTab(tab: typeof this.tab): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.el.tabFeed.hidden = tab !== 'feed';
    this.el.tabStats.hidden = tab !== 'stats';
    this.el.tabLineups.hidden = tab !== 'lineups';
    this.el.tabTactics.hidden = tab !== 'tactics';
    if (tab === 'tactics') this.renderTactics();
    this.updatePanels(true);
  }

  // ───────────────────────────── simulation loop ──

  private start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      const real = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.replay) this.stepReplay();
      else if (this.playing && !this.match.finished) {
        this.acc += real * this.speed;
        let n = 0;
        while (this.acc >= this.match.dt && n < 80 && !this.match.finished && !this.replay) {
          this.match.step();
          this.recordFrame();
          this.acc -= this.match.dt;
          n++;
        }
        if (n >= 80) this.acc = 0;
      }
      if (!this.replay) {
        const alpha = Math.min(1, this.acc / this.match.dt);
        this.renderer.draw(this.match, PitchRenderer.frame(this.match, alpha), this.opts, this.hoverId);
      }
      this.updateScoreboard();
      if (now - this.lastPanelUpdate > 500) {
        this.lastPanelUpdate = now;
        this.updatePanels(false);
      }
      if (this.match.finished) this.handleFinish();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Plays the rest of the match without rendering, in chunks so the page stays responsive. */
  private runInstant(): void {
    this.replay = null;
    this.setPlaying(false);
    const chunk = () => {
      if (this.destroyed) return;
      const t0 = performance.now();
      while (!this.match.finished && performance.now() - t0 < 30) this.match.step();
      this.updateScoreboard();
      if (!this.match.finished) setTimeout(chunk, 0);
      else {
        if (!this.raf) this.start();
        this.handleFinish();
      }
    };
    chunk();
  }

  private recordFrame(): void {
    this.frames.push(PitchRenderer.frame(this.match, 1));
    const max = Math.round(REPLAY_SECONDS / this.match.dt);
    if (this.frames.length > max) this.frames.splice(0, this.frames.length - max);
  }

  private startReplay(): void {
    if (!this.goalFrames.length) return;
    this.replay = { frames: this.goalFrames, i: 0 };
    this.el.replayBadge.classList.add('show');
  }

  private goalFrames: Frame[] = [];

  private stepReplay(): void {
    const r = this.replay!;
    const f = r.frames[Math.floor(r.i)];
    if (!f) {
      this.replay = null;
      this.el.replayBadge.classList.remove('show');
      return;
    }
    this.renderer.draw(this.match, f, { ...this.opts, aiVision: false }, null);
    r.i += 0.5; // half speed
  }

  // ───────────────────────────── events & panels ──

  private onEvent(e: MatchEvent): void {
    const line = commentary(e, [this.setup.home.name, this.setup.away.name], this.match.seed);
    if (line) {
      const li = document.createElement('li');
      const icon: Record<string, string> = {
        goal: '⚽', ownGoal: '⚽', save: '🧤', miss: '↗', post: '🥅', foul: '⚠', offside: '🚩', corner: '⛳', sub: '⇄', penalty: '❗',
        kickoff: '▶', secondHalf: '▶', halftime: '⏸', fulltime: '🏁', blocked: '⛔', bigChance: '🔥',
      };
      li.className = e.type === 'goal' || e.type === 'ownGoal' ? 'goal' : e.type === 'yellow' ? 'card-yellow' : e.type === 'red' ? 'card-red' : '';
      li.innerHTML = `<span class="m">${e.minute}</span><span class="ic">${icon[e.type] ?? ''}</span><span>${esc(line)}</span>`;
      this.el.feed.prepend(li);
    }
    if (e.type === 'goal' || e.type === 'ownGoal') {
      this.el.toastText.textContent = `${e.player ?? ''} ${e.minute} · ${this.names[0]} ${e.score[0]}:${e.score[1]} ${this.names[1]}`;
      this.el.toast.classList.add('show');
      setTimeout(() => this.el.toast.classList.remove('show'), 2600);
      // Keep the frames leading up to the goal for the replay (a little after the ball crosses the line).
      setTimeout(() => {
        this.goalFrames = [...this.frames];
        (this.el.replay as HTMLButtonElement).disabled = false;
        if (this.opts.autoReplay && !this.match.finished && this.playing && this.speed <= 8) this.startReplay();
      }, 0);
    }
  }

  private updateScoreboard(): void {
    const m = this.match;
    this.el.score.textContent = `${m.score[0]} : ${m.score[1]}`;
    this.el.clock.textContent = m.finished ? t('fulltime') : `${m.minuteLabel()}${m.half === 1 ? ' · 1H' : ' · 2H'}`;
    this.el.xg.textContent = `xG ${m.teams[0].stats.xg.toFixed(2)} – ${m.teams[1].stats.xg.toFixed(2)}`;
  }

  private updatePanels(force: boolean): void {
    const m = this.match;
    const [ph, pa] = m.possession();
    this.el.poss.textContent = `${t('possession')} ${ph}% – ${pa}%`;
    this.el.momentum.innerHTML = momentumChart(m.momentum, m.events, [this.setup.home.name, this.setup.away.name], '');
    if (this.tab === 'stats' || force) this.el.tabStats.innerHTML = this.statsHtml();
    if (this.el.quickStats) this.el.quickStats.innerHTML = this.quickStatsHtml();
    if (this.tab === 'lineups') this.renderLineups();
  }

  /** The compact panel at the top-right of the portrait layout. */
  quickStatsHtml(): string {
    const [a, b] = this.match.teams.map((x) => x.stats);
    const [ph, pa] = this.match.possession();
    return statRows([
      { label: t('possession'), a: ph, b: pa, fmt: (v) => `${Math.round(v)}%` },
      { label: t('shots'), a: a.shots, b: b.shots },
      { label: t('onTarget'), a: a.shotsOnTarget, b: b.shotsOnTarget },
      { label: t('xg'), a: a.xg, b: b.xg, fmt: (v) => v.toFixed(2) },
    ]);
  }

  statsHtml(): string {
    const [a, b] = this.match.teams.map((x) => x.stats);
    const [ph, pa] = this.match.possession();
    const pct = (s: typeof a) => (s.passes ? (s.passesCompleted / s.passes) * 100 : 0);
    return statRows([
      { label: t('possession'), a: ph, b: pa, fmt: (v) => `${Math.round(v)}%` },
      { label: t('xg'), a: a.xg, b: b.xg, fmt: (v) => v.toFixed(2) },
      { label: t('shots'), a: a.shots, b: b.shots },
      { label: t('onTarget'), a: a.shotsOnTarget, b: b.shotsOnTarget },
      { label: t('passes'), a: a.passes, b: b.passes },
      { label: t('passAcc'), a: pct(a), b: pct(b), fmt: (v) => `${Math.round(v)}%` },
      { label: t('duels'), a: a.tacklesWon, b: b.tacklesWon },
      { label: t('interceptions'), a: a.interceptions, b: b.interceptions },
      { label: t('saves'), a: a.saves, b: b.saves },
      { label: t('fouls'), a: a.fouls, b: b.fouls },
      { label: t('corners'), a: a.corners, b: b.corners },
      { label: t('offsides'), a: a.offsides, b: b.offsides },
      { label: t('yellows'), a: a.yellows, b: b.yellows },
    ]);
  }

  private renderLineups(): void {
    const m = this.match;
    computeRatings(m);
    const team = m.teams[this.lineupTeam];
    const rows = [...team.players]
      .sort((x, y) => Number(y.onPitch) - Number(x.onPitch) || x.slot - y.slot)
      .map((p) => {
        const r = p.stats.rating;
        const cls = r >= 7.5 ? 'hi' : r < 6 ? 'lo' : '';
        const badges = `${'⚽'.repeat(p.stats.goals)}${p.stats.assists ? ' 🅰'.repeat(p.stats.assists) : ''}${p.yellow ? ' 🟨' : ''}${p.sentOff ? ' 🟥' : ''}`;
        return `<tr class="${p.onPitch ? '' : 'off'}"><td class="n">${p.data.number}</td><td>${esc(p.data.name)} <span class="muted">${badges}</span></td>
          <td class="muted">${p.role}</td><td><div class="energy" title="${Math.round(p.energy * 100)}%"><i style="width:${Math.round(p.energy * 100)}%"></i></div></td>
          <td><span class="rating ${cls}">${r.toFixed(1)}</span></td></tr>`;
      })
      .join('');
    this.el.tabLineups.innerHTML = `<div class="team-switch">${[0, 1]
      .map((i) => `<button class="btn small" type="button" data-team="${i}" aria-pressed="${i === this.lineupTeam}">${esc(m.teams[i].club.name)}</button>`)
      .join('')}</div>
      ${this.coachLine(this.lineupTeam)}
      <table class="lineup"><thead><tr><th>#</th><th>${t('player')}</th><th>${t('pos')}</th><th>${t('energy')}</th><th>${t('rating')}</th></tr></thead><tbody>${rows}</tbody></table>`;
    this.el.tabLineups.querySelectorAll<HTMLButtonElement>('[data-team]').forEach((b) =>
      b.addEventListener('click', () => {
        this.lineupTeam = Number(b.dataset.team) as 0 | 1;
        this.renderLineups();
      }),
    );
  }

  private coachLine(team: 0 | 1): string {
    const c = team === 0 ? this.setup.homeCoach : this.setup.awayCoach;
    return c ? `<div class="coach-line">${coachAvatar(c, 28)}<span><span class="muted">${t('coach')}:</span> <b>${esc(coachName(c))}</b></span></div>` : '';
  }

  private renderTactics(): void {
    const m = this.match;
    const box = this.el.tabTactics;
    box.innerHTML = `<div class="team-switch">${[0, 1]
      .map((i) => `<button class="btn small" type="button" data-team="${i}" aria-pressed="${i === this.tacticsTeam}">${esc(m.teams[i].club.name)}</button>`)
      .join('')}</div><p class="muted" style="margin:0 0 12px;font-size:13px">${t('applyLive')}</p>`;
    const team = m.teams[this.tacticsTeam];
    const tac = { ...team.tactics };
    box.appendChild(tacticsControls(tac, (nt) => m.setTactics(team.index, { ...nt })));
    box.querySelectorAll<HTMLButtonElement>('[data-team]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tacticsTeam = Number(b.dataset.team) as 0 | 1;
        this.renderTactics();
      }),
    );
  }

  private onHover(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const w = this.renderer.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    let best: Player | null = null;
    let bd = 2.2;
    for (const p of this.match.allPlayers) {
      const d = Math.hypot(p.pos.x - w.x, p.pos.y - w.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    const card = this.el.hover;
    if (!best) {
      this.hoverId = null;
      card.style.display = 'none';
      return;
    }
    this.hoverId = best.data.id;
    const a = best.data.attrs;
    const l = toLocal(best.pos, best.team.dir);
    card.innerHTML = `<b>#${best.data.number} ${esc(best.data.name)}</b> · ${best.role} · ${esc(best.team.club.short)}<br>
      ${t('energy')} ${Math.round(best.energy * 100)}% · PAC ${a.pace} PAS ${a.passing} SHO ${a.shooting} DRI ${a.dribbling} TAC ${a.tackling}
      <br><span class="muted">${(best.stats.distance / 1000).toFixed(1)} km · x ${l.x.toFixed(0)} m</span>`;
    card.style.display = 'block';
    const x = Math.min(rect.width - card.offsetWidth - 8, e.clientX - rect.left + 14);
    card.style.left = `${Math.max(8, x)}px`;
    card.style.top = `${Math.min(rect.height - card.offsetHeight - 8, e.clientY - rect.top + 14)}px`;
  }

  private handleFinish(): void {
    if (this.finishedHandled) return;
    this.finishedHandled = true;
    this.updatePanels(true);
    this.options.onFinish?.(this.match);
    renderReport(this.el.report, this.match, {
      onNewMatch: this.options.onNewMatch,
    });
    this.el.report.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
