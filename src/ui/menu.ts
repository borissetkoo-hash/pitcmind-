import { portraitHtml } from '../career/avatar';
import { crestHtml } from '../data/clubCustom';
import { seasonLabel } from '../career/career';
import { peekCareer } from '../career/storage';
import { LEAGUES } from '../data/clubSeeds';
import { clubById, leagueClubs } from '../data/clubs';
import { leagueName } from './leagueUi';
import { computeTable, nextRound, type SeasonState } from '../league/league';
import { type Lang, getLang, setLang, t } from '../i18n';
import { getSettings, updateSettings } from '../settings';
import { ownerMenuLabel } from './ownerView';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Main menu: the game's hub, Football-Manager style. */
export function renderMenu(root: HTMLElement, season: SeasonState, onLangChange: () => void): void {
  const round = nextRound(season);
  const table = computeTable(season.clubs, season.fixtures);
  const played = season.fixtures.filter((f) => f.result).length;
  const next = round ? season.fixtures.filter((f) => f.round === round && !f.result)[0] : null;
  const leader = played ? clubById(table[0].club) : null;
  const s = getSettings();
  const career = peekCareer();
  const owner = ownerMenuLabel();

  root.innerHTML = `
    <div class="menu">
      <nav class="menu-list" aria-label="Main menu">
        <div class="menu-title"><span class="brand-mark">◉</span> PitchMind</div>
        <a class="menu-item primary career-tile" href="#/career">${career ? `<span class="tile-portrait">${portraitHtml(career.coach.look, 52)}</span>` : ''}<b>👔 ${career ? t('menuCareerCont') : t('menuCareer')}</b><span>${career ? `${esc(career.coach.firstName)} ${esc(career.coach.lastName)} · ${esc(clubById(career.clubId).name)} · ${seasonLabel(career.season)}` : t('menuCareerSub')}</span></a>
        <a class="menu-item primary owner-tile" href="#/owner"><b>💼 ${owner ? t('menuOwnerCont') : t('menuOwner')}</b><span>${owner ? esc(owner) : t('menuOwnerSub')}</span></a>
        <a class="menu-item" href="#/match"><b>⚽ ${t('menuQuick')}</b><span>${t('menuQuickSub')}</span></a>
        <a class="menu-item" href="#/league"><b>🏆 ${played ? t('menuContinue') : t('menuSeason')}</b><span>${t('menuSeasonSub')}</span></a>
        <a class="menu-item" href="#/coaches"><b>👔 ${t('menuCoaches')}</b><span>${t('menuCoachesSub')}</span></a>
        <a class="menu-item" href="#/clubs"><b>🛡 ${t('menuClubs')}</b><span>${t('menuClubsSub')}</span></a>
        <a class="menu-item" href="#/about"><b>🧠 ${t('navAbout')}</b><span>${t('menuAboutSub')}</span></a>
        <button class="menu-item" type="button" id="openSettings"><b>⚙ ${t('settings')}</b><span>${t('settingsSub')}</span></button>
      </nav>
      <section class="menu-side">
        <div class="panel menu-card">
          <h3>${t('season')}</h3>
          <div class="menu-stat"><span>${t('round')}</span><b class="num">${round ?? '—'}</b></div>
          <div class="menu-stat"><span>${t('matchesPlayed')}</span><b class="num">${played}/${season.fixtures.length}</b></div>
          ${leader ? `<div class="menu-stat"><span>${t('leader')}</span><b>${esc(leader.name)} · ${table[0].pts}</b></div>` : ''}
          ${next ? `<div class="menu-next">${t('nextMatch')}: <b>${esc(clubById(next.home).name)}</b> – <b>${esc(clubById(next.away).name)}</b></div>` : ''}
        </div>
        <div class="panel menu-card">
          <h3>${t('leagues')}</h3>
          ${LEAGUES.map((lg) => `<div class="menu-league"><span class="ml-name">${esc(leagueName(lg.id))}</span><div class="menu-clubs">${leagueClubs(lg.id).map((c) => `<span title="${esc(c.name)}">${crestHtml(c, 26)}</span>`).join('')}</div></div>`).join('')}
        </div>
        <div class="panel menu-card" id="settingsCard" hidden>
          <h3>${t('settings')}</h3>
          <label class="setting"><span>${t('language')}</span>
            <select id="setLang"><option value="ru" ${getLang() === 'ru' ? 'selected' : ''}>Русский</option><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option></select></label>
          <label class="setting"><span>${t('pitchOrientation')}</span>
            <select id="setOrient"><option value="v" ${s.verticalPitch ? 'selected' : ''}>${t('vertical')}</option><option value="h" ${s.verticalPitch ? '' : 'selected'}>${t('horizontal')}</option></select></label>
          <label class="setting"><span>${t('defaultSpeed')}</span>
            <select id="setSpeed">${[1, 2, 4, 8, 16, 32].map((v) => `<option ${v === s.defaultSpeed ? 'selected' : ''} value="${v}">${v}×</option>`).join('')}</select></label>
          <label class="setting"><span>${t('autoReplay')}</span><input type="checkbox" id="setReplay" ${s.autoReplay ? 'checked' : ''}></label>
        </div>
      </section>
    </div>`;

  const card = root.querySelector<HTMLElement>('#settingsCard')!;
  root.querySelector('#openSettings')!.addEventListener('click', () => {
    card.hidden = !card.hidden;
    if (!card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  root.querySelector<HTMLSelectElement>('#setLang')!.addEventListener('change', (e) => {
    setLang((e.target as HTMLSelectElement).value as Lang);
    onLangChange();
  });
  root.querySelector<HTMLSelectElement>('#setOrient')!.addEventListener('change', (e) => updateSettings({ verticalPitch: (e.target as HTMLSelectElement).value === 'v' }));
  root.querySelector<HTMLSelectElement>('#setSpeed')!.addEventListener('change', (e) => updateSettings({ defaultSpeed: Number((e.target as HTMLSelectElement).value) }));
  root.querySelector<HTMLInputElement>('#setReplay')!.addEventListener('change', (e) => updateSettings({ autoReplay: (e.target as HTMLInputElement).checked }));
}
