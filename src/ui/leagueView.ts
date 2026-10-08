import { LEAGUES } from '../data/clubSeeds';
import { CLUBS, clubById, leagueClubs } from '../data/clubs';
import { leagueName, leagueTabsHtml } from './leagueUi';
import { crestHtml } from '../data/clubCustom';
import { type Fixture, type SeasonState, computeTable, newSeason, nextRound, topScorers } from '../league/league';
import { type SimPool, sharedPool } from '../league/pool';
import { t } from '../i18n';

const KEY = 'pm-seasons-v2';
const LEGACY_KEY = 'pm-season-v1';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One season in progress per league, plus which league was open last. */
interface Store {
  current: string;
  seasons: Record<string, SeasonState>;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
    // Saves from before leagues existed belong to the Northern League.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const s = JSON.parse(legacy) as SeasonState;
      return { current: 'nor', seasons: { nor: { ...s, leagueId: 'nor' } } };
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return { current: LEAGUES[0].id, seasons: {} };
}

const valid = (s: SeasonState | undefined) => !!s?.fixtures?.length && s.clubs.every((c) => CLUBS.some((x) => x.id === c));

export function seasonFor(leagueId: string): SeasonState {
  const s = readStore().seasons[leagueId];
  return valid(s) ? s : newSeason(leagueClubs(leagueId), Math.floor(Math.random() * 1e6), leagueId);
}

export function loadSeason(): SeasonState {
  return seasonFor(readStore().current);
}

export function saveSeason(s: SeasonState): void {
  const store = readStore();
  const id = s.leagueId ?? 'nor';
  store.seasons[id] = s;
  store.current = id;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

let pool: SimPool | null = null;

export function renderLeague(root: HTMLElement, season: SeasonState, onWatch: (f: Fixture) => void): void {
  pool ??= sharedPool();
  const totalRounds = () => Math.max(...season.fixtures.map((f) => f.round));
  let viewRound = nextRound(season) ?? totalRounds();
  let busy = false;

  const kit = (id: string) => {
    const c = clubById(id);
    return crestHtml(c, 22);
  };

  const draw = () => {
    const table = computeTable(season.clubs, season.fixtures);
    const done = season.fixtures.filter((f) => f.result).length;
    const finished = done === season.fixtures.length;
    const rows = table
      .map((r, i) => {
        const c = clubById(r.club);
        return `<tr class="${i === 0 && r.p ? 'leader' : ''}"><td>${i + 1}</td><td class="club">${kit(r.club)}${esc(c.name)}</td>
          <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
          <td>${(r.xgf - r.xga).toFixed(1)}</td><td><b>${r.pts}</b></td>
          <td><span class="form">${r.form.slice(-5).map((x) => `<i class="${x}">${x}</i>`).join('')}</span></td></tr>`;
      })
      .join('');
    const fixtures = season.fixtures
      .filter((f) => f.round === viewRound)
      .map((f) => {
        const h = clubById(f.home);
        const a = clubById(f.away);
        const s = f.result ? `${f.result.score[0]} : ${f.result.score[1]}` : '–';
        return `<div class="fixture"><span class="h">${esc(h.name)}</span><span class="s">${s}</span><span>${esc(a.name)}</span>
          ${f.result ? `<span class="muted num" style="font-size:11px">xG ${f.result.xg[0].toFixed(1)}–${f.result.xg[1].toFixed(1)}</span>` : `<button class="btn small" data-watch="${f.id}" type="button" ${busy ? 'disabled' : ''}>▶ ${t('watch')}</button>`}</div>`;
      })
      .join('');
    const scorers = topScorers(season.fixtures, 10)
      .map((s, i) => `<tr><td>${i + 1}</td><td class="club">${kit(s.club)}${esc(s.player)}</td><td class="muted" style="font-family:inherit">${esc(clubById(s.club).short)}</td><td><b>${s.goals}</b></td></tr>`)
      .join('');
    const champion = finished ? clubById(table[0].club) : null;

    root.innerHTML = `
      <section class="hero"><div><h1>${esc(leagueName(season.leagueId ?? 'nor'))}</h1><p>${t('season')} · ${t('tagline')}</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="simRound" type="button" ${busy || finished ? 'disabled' : ''}>⏩ ${t('simRound')}</button>
          <button class="btn" id="simAll" type="button" ${busy || finished ? 'disabled' : ''}>⏭ ${t('simSeason')}</button>
          <button class="btn" id="reset" type="button" ${busy ? 'disabled' : ''}>↺ ${t('newSeason')}</button>
        </div></section>
      <div class="league-bar">${leagueTabsHtml(season.leagueId ?? 'nor')}</div>
      ${champion ? `<div class="panel" style="padding:16px;margin-bottom:16px;text-align:center;font-size:18px">🏆 ${t('champion')}: <b>${esc(champion.name)}</b></div>` : ''}
      <div class="league-grid">
        <div class="panel"><div class="card-title"><h3>${t('table')}</h3><span class="muted num">${done}/${season.fixtures.length}</span></div>
          <div style="overflow-x:auto"><table class="table"><thead><tr><th>#</th><th class="club">${t('club')}</th><th>${t('played')}</th><th>${t('won')}</th><th>${t('drawn')}</th><th>${t('lost')}</th>
          <th>${t('goalsCol')}</th><th>${t('gd')}</th><th>xGD</th><th>${t('pts')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="progress"><i id="prog" style="width:${(done / season.fixtures.length) * 100}%"></i></div>
        </div>
        <div style="display:grid;gap:16px;align-content:start">
          <div class="panel"><div class="card-title"><h3>${t('fixtures')}</h3>
            <div class="round-nav"><button class="btn small" id="prev" type="button" aria-label="previous">◀</button><span class="num">${t('round')} ${viewRound}/${totalRounds()}</span><button class="btn small" id="next" type="button" aria-label="next">▶</button></div></div>
            ${fixtures}${busy ? `<p class="muted">${t('simulating')}</p>` : ''}</div>
          <div class="panel"><div class="card-title"><h3>${t('scorers')}</h3></div>
            ${scorers ? `<table class="table"><tbody>${scorers}</tbody></table>` : '<p class="muted">—</p>'}</div>
        </div>
      </div>`;

    root.querySelector('#prev')!.addEventListener('click', () => {
      viewRound = Math.max(1, viewRound - 1);
      draw();
    });
    root.querySelector('#next')!.addEventListener('click', () => {
      viewRound = Math.min(totalRounds(), viewRound + 1);
      draw();
    });
    root.querySelector('#simRound')!.addEventListener('click', () => simulate(false));
    root.querySelector('#simAll')!.addEventListener('click', () => simulate(true));
    root.querySelector('#reset')!.addEventListener('click', () => {
      const id = season.leagueId ?? 'nor';
      Object.assign(season, newSeason(leagueClubs(id), Math.floor(Math.random() * 1e6), id));
      saveSeason(season);
      viewRound = 1;
      draw();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-league]').forEach((b) =>
      b.addEventListener('click', () => {
        if (busy) return;
        saveSeason(season);
        Object.assign(season, seasonFor(b.dataset.league!));
        saveSeason(season);
        viewRound = nextRound(season) ?? totalRounds();
        draw();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-watch]').forEach((b) =>
      b.addEventListener('click', () => onWatch(season.fixtures.find((f) => f.id === Number(b.dataset.watch))!)),
    );
  };

  const simulate = async (all: boolean) => {
    busy = true;
    draw();
    do {
      const r = nextRound(season);
      if (r === null) break;
      viewRound = r;
      const pending = season.fixtures.filter((f) => f.round === r && !f.result);
      await Promise.all(
        pending.map(async (f) => {
          f.result = await pool!.run({ id: f.id, home: f.home, away: f.away, seed: f.seed });
          saveSeason(season);
          if (root.isConnected) draw();
        }),
      );
    } while (all && root.isConnected);
    busy = false;
    if (root.isConnected) draw();
  };

  draw();
}
