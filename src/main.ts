import './styles.css';
import { clubById } from './data/clubs';
import { type Lang, getLang, setLang, t } from './i18n';
import type { Fixture } from './league/league';
import { coachById } from './data/coaches';
import { renderAbout } from './ui/about';
import { installTooltips } from './ui/charts';
import { renderCoaches } from './ui/coachUi';
import { bootScreen } from './ui/boot';
import { renderMenu } from './ui/menu';
import { loadSeason, renderLeague, saveSeason } from './ui/leagueView';
import { MatchView } from './ui/matchView';
import { type MatchSetup, renderSetup } from './ui/setup';

const view = document.getElementById('view')!;
const nav = document.getElementById('nav')!;
const langBtn = document.getElementById('lang')!;

let current: MatchView | null = null;
let lastSetup: Partial<MatchSetup> = {};
const season = loadSeason();

function teardown(): void {
  current?.destroy();
  current = null;
  view.innerHTML = '';
}

function drawNav(route: string): void {
  const items: [string, string][] = [
    ['#/menu', t('navMenu')],
    ['#/match', t('navMatch')],
    ['#/league', t('navLeague')],
    ['#/coaches', t('coaches')],
    ['#/about', t('navAbout')],
  ];
  nav.innerHTML = items.map(([href, label]) => `<a href="${href}" class="${route.startsWith(href.slice(1)) ? 'active' : ''}">${label}</a>`).join('');
  langBtn.textContent = getLang() === 'ru' ? 'EN' : 'RU';
  document.documentElement.lang = getLang();
}

function startMatch(setup: MatchSetup, instant: boolean, fixture?: Fixture): void {
  teardown();
  lastSetup = setup;
  current = new MatchView(view, setup, {
    instant,
    onNewMatch: () => {
      location.hash = fixture ? '#/league' : '#/match';
      if (!fixture) route();
    },
    onFinish: (m) => {
      if (!fixture) return;
      fixture.result = {
        score: m.score,
        xg: [m.teams[0].stats.xg, m.teams[1].stats.xg],
        goals: m.events.filter((e) => e.type === 'goal').map((e) => ({ player: e.player ?? '?', club: e.team === 0 ? fixture.home : fixture.away, minute: e.minute })),
      };
      saveSeason(season);
    },
  });
}

function route(): void {
  const r = location.hash.replace(/^#/, '') || '/menu';
  drawNav(r);
  if (r.startsWith('/match/live') && current) return;
  teardown();
  if (r.startsWith('/league')) {
    renderLeague(view, season, (f) => {
      const home = clubById(f.home);
      const away = clubById(f.away);
      history.pushState(null, '', '#/match/live');
      drawNav('/match');
      startMatch({
        home, away, homeTactics: { ...home.tactics }, awayTactics: { ...away.tactics }, seed: f.seed,
        homeCoach: coachById(home.coachId), awayCoach: coachById(away.coachId),
      }, false, f);
    });
  } else if (r.startsWith('/about')) {
    renderAbout(view);
  } else if (r.startsWith('/coaches')) {
    renderCoaches(view);
    installTooltips(view);
  } else if (r.startsWith('/match')) {
    renderSetup(view, lastSetup, (s, instant) => {
      history.pushState(null, '', '#/match/live');
      startMatch(s, instant);
    });
  } else {
    renderMenu(view, season, route);
  }
  window.scrollTo(0, 0);
}

langBtn.addEventListener('click', () => {
  setLang((getLang() === 'ru' ? 'en' : 'ru') as Lang);
  // A live match keeps running; everything else re-renders in the new language.
  if (current) drawNav('/match');
  else route();
});
window.addEventListener('hashchange', route);
// Loading screen first; the menu renders underneath so it is ready when the splash fades.
route();
void bootScreen();
