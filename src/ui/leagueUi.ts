import { LEAGUES, leagueById } from '../data/clubSeeds';
import { leagueClubs } from '../data/clubs';
import { getLang } from '../i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const leagueName = (id: string) => {
  const l = leagueById(id);
  return `${l.flag} ${getLang() === 'ru' ? l.ru : l.en}`;
};

/** Country part of the league name ("England"), for compact tabs. */
const shortName = (id: string) => {
  const l = leagueById(id);
  return (getLang() === 'ru' ? l.ru : l.en).split(' · ')[0];
};

/** Segmented league switcher; buttons carry data-league. */
export function leagueTabsHtml(selected: string): string {
  return `<div class="seg league-tabs" role="group" aria-label="League">${LEAGUES.map(
    (l) => `<button type="button" data-league="${l.id}" aria-pressed="${l.id === selected}">${l.flag} ${esc(shortName(l.id))}</button>`,
  ).join('')}</div>`;
}

/** Club <option>s grouped by league. */
export function clubOptionsHtml(selectedId: string): string {
  return LEAGUES.map(
    (l) => `<optgroup label="${esc(leagueName(l.id))}">${leagueClubs(l.id)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('')}</optgroup>`,
  ).join('');
}
