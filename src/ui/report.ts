import type { Match } from '../engine/match';
import type { Player } from '../engine/player';
import { computeRatings } from '../engine/ratings';
import { t } from '../i18n';
import { SERIES, heatMap, installTooltips, shotMap, statRows, xgTimeline } from './charts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderReport(root: HTMLElement, m: Match, opts: { onNewMatch?: () => void; nextLabel?: string } = {}): void {
  computeRatings(m);
  const [home, away] = m.teams;
  const names: [string, string] = [home.club.name, away.club.name];
  const all = [...home.players, ...away.players].filter((p) => p.stats.minutes > 0 || p.onPitch);
  const motm = [...all].sort((a, b) => b.stats.rating - a.stats.rating)[0];
  const scorers = (team: 0 | 1) =>
    m.events
      .filter((e) => (e.type === 'goal' || e.type === 'ownGoal') && e.team === team)
      .map((e) => `${esc(e.player ?? '')} ${e.minute}${e.type === 'ownGoal' ? ' (o.g.)' : ''}`)
      .join('<br>');
  const [ph, pa] = m.possession();
  const a = home.stats;
  const b = away.stats;
  const pct = (s: typeof a) => (s.passes ? (s.passesCompleted / s.passes) * 100 : 0);
  const heatCandidates = all.filter((p) => p.heat.length);
  let heatPlayer: Player | undefined = motm && motm.heat.length ? motm : heatCandidates[0];

  const ratingRows = (team: typeof home) =>
    [...team.players]
      .filter((p) => p.stats.minutes > 0)
      .sort((x, y) => y.stats.rating - x.stats.rating)
      .map((p) => {
        const r = p.stats.rating;
        return `<tr><td class="n">${p.data.number}</td><td>${esc(p.data.name)}</td><td class="muted">${p.role}</td><td class="num">${p.stats.minutes}</td>
          <td class="num">${p.stats.goals || ''}</td><td class="num">${p.stats.assists || ''}</td>
          <td><span class="rating ${r >= 7.5 ? 'hi' : r < 6 ? 'lo' : ''}">${r.toFixed(1)}</span></td></tr>`;
      })
      .join('');
  const ratingTable = (team: typeof home, i: 0 | 1) => `
    <div><div class="card-title"><h3><i class="kit-dot" style="display:inline-block;background:${SERIES[i]};margin-right:6px"></i>${esc(team.club.name)}</h3></div>
    <table class="lineup"><thead><tr><th>#</th><th>${t('player')}</th><th>${t('pos')}</th><th>${t('min')}</th><th>${t('goalsShort')}</th><th>${t('assistsShort')}</th><th>${t('rating')}</th></tr></thead>
    <tbody>${ratingRows(team)}</tbody></table></div>`;

  root.innerHTML = `
    <div class="report">
      <div class="panel final wide">
        <h3>${t('report')} · ${t('fulltime')}</h3>
        <div class="teams" style="margin-top:10px"><span>${esc(names[0])}</span><span class="score">${m.score[0]} : ${m.score[1]}</span><span>${esc(names[1])}</span></div>
        <div class="muted num">xG ${a.xg.toFixed(2)} – ${b.xg.toFixed(2)}</div>
        <div class="scorers"><div style="text-align:right">${scorers(0) || '—'}</div><div>${scorers(1) || '—'}</div></div>
        ${motm ? `<div class="motm">⭐ ${t('motm')}: <b>${esc(motm.data.name)}</b> (${esc(motm.team.club.short)}) <span class="rating hi">${motm.stats.rating.toFixed(1)}</span></div>` : ''}
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          ${opts.onNewMatch ? `<button class="btn primary" id="newMatch" type="button">${opts.nextLabel ?? t('newMatch')}</button>` : ''}
        </div>
      </div>
      <div class="panel"><div class="card-title"><h3>${t('stats')}</h3></div>${statRows([
        { label: t('possession'), a: ph, b: pa, fmt: (v) => `${Math.round(v)}%` },
        { label: t('xg'), a: a.xg, b: b.xg, fmt: (v) => v.toFixed(2) },
        { label: t('shots'), a: a.shots, b: b.shots },
        { label: t('onTarget'), a: a.shotsOnTarget, b: b.shotsOnTarget },
        { label: t('passes'), a: a.passes, b: b.passes },
        { label: t('passAcc'), a: pct(a), b: pct(b), fmt: (v) => `${Math.round(v)}%` },
        { label: t('duels'), a: a.tacklesWon, b: b.tacklesWon },
        { label: t('saves'), a: a.saves, b: b.saves },
        { label: t('corners'), a: a.corners, b: b.corners },
        { label: t('fouls'), a: a.fouls, b: b.fouls },
        { label: t('yellows'), a: a.yellows, b: b.yellows },
      ])}</div>
      <div class="panel"><div class="card-title"><h3>${t('xgTimeline')}</h3></div>${xgTimeline(m.shots, m.events, [home.club.short, away.club.short], Math.ceil(m.clock / 60))}</div>
      <div class="panel"><div class="card-title"><h3>${t('shotMap')}</h3><span class="muted num">${m.shots.length}</span></div>
        ${shotMap(m.shots, names, { goal: t('legendGoal'), shot: t('legendShot'), size: t('legendSize') })}</div>
      <div class="panel"><div class="card-title"><h3>${t('heatmap')}</h3>
        <select id="heatSel" aria-label="${t('selectPlayer')}">${heatCandidates
          .map((p) => `<option value="${p.data.id}" ${p === heatPlayer ? 'selected' : ''}>${esc(p.team.club.short)} · ${esc(p.data.name)}</option>`)
          .join('')}</select></div><div id="heat"></div></div>
      <div class="panel wide"><div class="card-title"><h3>${t('ratings')}</h3></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px">${ratingTable(home, 0)}${ratingTable(away, 1)}</div></div>
    </div>`;

  const drawHeat = () => {
    root.querySelector('#heat')!.innerHTML = heatPlayer ? heatMap(heatPlayer.heat, heatPlayer.data.name) : '';
  };
  drawHeat();
  root.querySelector<HTMLSelectElement>('#heatSel')?.addEventListener('change', (e) => {
    const id = (e.target as HTMLSelectElement).value;
    heatPlayer = heatCandidates.find((p) => p.data.id === id);
    drawHeat();
  });
  root.querySelector('#newMatch')?.addEventListener('click', () => opts.onNewMatch?.());
  installTooltips(root);
}
