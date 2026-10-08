import { DEFAULT_LOOK, LOOK_COUNTS, LOOK_KEYS, LOOK_LABELS, type LookKey, avatarSvg, randomLook } from '../career/avatar';
import {
  type CareerCoach,
  type CareerState,
  type CoachStyleId,
  PLAYER_COACH,
  STYLE_IDS,
  STYLES,
  STYLE_TEXT,
  boardTarget,
  careerTotals,
  clubSide,
  endSeason,
  jobOffers,
  newCareer,
  nextUserFixture,
  playerCoach,
  recordResult,
  seasonComplete,
  seasonLabel,
  startNextSeason,
  userPosition,
} from '../career/career';
import { deleteCareer, loadCareer, saveCareer } from '../career/storage';
import { CLUBS, clubById } from '../data/clubs';
import type { Match } from '../engine/match';
import { computeTable, type Fixture, type FixtureResult } from '../league/league';
import { sharedPool } from '../league/pool';
import { getLang, type Key, t } from '../i18n';
import { installTooltips } from './charts';
import { coachAvatar, coachName, traitBars, traitClass } from './coachUi';
import { type MatchSetup, strength, tacticsControls } from './setup';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Career-only copy lives here so the shared dictionary stays small. */
const L = {
  ru: {
    title: 'Карьера тренера', loading: 'Загрузка карьеры…', createTitle: 'Создайте тренера', createSub: 'Внешность, имя и стиль — дальше всё решают результаты.',
    firstName: 'Имя', lastName: 'Фамилия', nationality: 'Гражданство', appearance: 'Внешность', randomLook: 'Случайная внешность',
    philosophy: 'Футбольная философия', next: 'Далее: выбор клуба', back: 'Назад', chooseClub: 'Выберите клуб', chooseClubSub: 'От клуба зависят задачи правления и уровень игроков.',
    replaces: 'Сейчас тренирует', target: 'Задача', startCareer: 'Начать карьеру', nameRequired: 'Введите имя и фамилию тренера.',
    skin: 'Тон кожи', hair: 'Причёска', hairColor: 'Цвет волос', beard: 'Борода', glasses: 'Очки', outfit: 'Одежда',
    season: 'Сезон', round: 'Тур', nextMatch: 'Следующий матч', home: 'Дома', away: 'В гостях', vs: 'против', opponentCoach: 'Тренер соперника',
    tactics: 'Тактика', hideTactics: 'Скрыть тактику', playLive: 'Играть матч', quick: 'Быстрый результат', simulating: 'Симуляция тура…',
    table: 'Таблица', board: 'Доверие правления', reputation: 'Репутация', objective: 'Задача на сезон', now: 'Сейчас', place: 'место',
    yourCoach: 'Ваш тренер', record: 'Карьера', news: 'Новости', history: 'История сезонов', roundResults: 'Результаты тура',
    deleteCareer: 'Удалить карьеру', confirmDelete: 'Удалить сохранение без возможности восстановления?', yesDelete: 'Да, удалить', cancel: 'Отмена',
    seasonOver: 'Сезон завершён', finished: 'Итоговое место', verdictMet: 'Правление довольно: задача выполнена.', verdictMissed: 'Задача не выполнена — доверие правления падает.',
    champion: 'Чемпион!', growth: 'Рост атрибутов', noGrowth: 'Атрибуты без изменений', startNext: 'Начать сезон', sacked: 'Вас уволили',
    sackedSub: 'Правление потеряло доверие. Есть предложения от клубов поскромнее:', accept: 'Принять предложение', newCareerBtn: 'Начать новую карьеру',
    w: 'В', d: 'Н', l: 'П', titles: 'Титулы', goals: 'Мячи', pos: 'Место', pts: 'О', saved: 'Прогресс сохраняется автоматически.',
    tgt: (n: number) => (n === 1 ? 'чемпионство' : n === CLUBS.length - 1 ? 'не занять последнее место' : `топ-${n}`),
    rep: (r: number) => (r >= 80 ? 'Мировая' : r >= 55 ? 'Континентальная' : r >= 35 ? 'Национальная' : 'Местная'),
    conf: (c: number) => (c >= 70 ? 'Правление довольно' : c >= 40 ? 'Ситуация стабильная' : 'Под давлением'),
  },
  en: {
    title: 'Manager career', loading: 'Loading career…', createTitle: 'Create your manager', createSub: 'Looks, name and philosophy — results decide the rest.',
    firstName: 'First name', lastName: 'Last name', nationality: 'Nationality', appearance: 'Appearance', randomLook: 'Random look',
    philosophy: 'Football philosophy', next: 'Next: choose a club', back: 'Back', chooseClub: 'Choose a club', chooseClubSub: 'The club sets the board’s expectations and the quality of your squad.',
    replaces: 'Current coach', target: 'Objective', startCareer: 'Start career', nameRequired: 'Enter the manager’s first and last name.',
    skin: 'Skin tone', hair: 'Hair', hairColor: 'Hair colour', beard: 'Facial hair', glasses: 'Glasses', outfit: 'Outfit',
    season: 'Season', round: 'Round', nextMatch: 'Next match', home: 'Home', away: 'Away', vs: 'vs', opponentCoach: 'Opposition coach',
    tactics: 'Tactics', hideTactics: 'Hide tactics', playLive: 'Play match', quick: 'Quick result', simulating: 'Simulating the round…',
    table: 'Table', board: 'Board confidence', reputation: 'Reputation', objective: 'Season objective', now: 'Now', place: 'place',
    yourCoach: 'Your manager', record: 'Career', news: 'News', history: 'Season history', roundResults: 'Round results',
    deleteCareer: 'Delete career', confirmDelete: 'Delete this save permanently?', yesDelete: 'Yes, delete', cancel: 'Cancel',
    seasonOver: 'Season over', finished: 'Final position', verdictMet: 'The board is satisfied: objective met.', verdictMissed: 'Objective missed — the board’s confidence drops.',
    champion: 'Champions!', growth: 'Attribute growth', noGrowth: 'No attribute changes', startNext: 'Start season', sacked: 'You have been sacked',
    sackedSub: 'The board has lost confidence. Smaller clubs have made offers:', accept: 'Accept offer', newCareerBtn: 'Start a new career',
    w: 'W', d: 'D', l: 'L', titles: 'Titles', goals: 'Goals', pos: 'Pos', pts: 'Pts', saved: 'Progress saves automatically.',
    tgt: (n: number) => (n === 1 ? 'win the title' : n === CLUBS.length - 1 ? 'avoid finishing bottom' : `top ${n}`),
    rep: (r: number) => (r >= 80 ? 'Worldwide' : r >= 55 ? 'Continental' : r >= 35 ? 'National' : 'Local'),
    conf: (c: number) => (c >= 70 ? 'Board delighted' : c >= 40 ? 'Stable' : 'Under pressure'),
  },
};
const tr = () => L[getLang()];

const NATIONS: [string, string, string][] = [
  ['🇷🇺', 'Россия', 'Russia'], ['🇧🇾', 'Беларусь', 'Belarus'], ['🇰🇿', 'Казахстан', 'Kazakhstan'], ['🇺🇦', 'Украина', 'Ukraine'],
  ['🇺🇿', 'Узбекистан', 'Uzbekistan'], ['🇦🇲', 'Армения', 'Armenia'], ['🇬🇪', 'Грузия', 'Georgia'], ['🇦🇿', 'Азербайджан', 'Azerbaijan'],
  ['🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Англия', 'England'], ['🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Шотландия', 'Scotland'], ['🇮🇪', 'Ирландия', 'Ireland'], ['🇪🇸', 'Испания', 'Spain'],
  ['🇮🇹', 'Италия', 'Italy'], ['🇩🇪', 'Германия', 'Germany'], ['🇫🇷', 'Франция', 'France'], ['🇵🇹', 'Португалия', 'Portugal'],
  ['🇳🇱', 'Нидерланды', 'Netherlands'], ['🇧🇪', 'Бельгия', 'Belgium'], ['🇭🇷', 'Хорватия', 'Croatia'], ['🇷🇸', 'Сербия', 'Serbia'],
  ['🇵🇱', 'Польша', 'Poland'], ['🇹🇷', 'Турция', 'Turkey'], ['🇸🇪', 'Швеция', 'Sweden'], ['🇩🇰', 'Дания', 'Denmark'],
  ['🇳🇴', 'Норвегия', 'Norway'], ['🇧🇷', 'Бразилия', 'Brazil'], ['🇦🇷', 'Аргентина', 'Argentina'], ['🇺🇾', 'Уругвай', 'Uruguay'],
  ['🇲🇽', 'Мексика', 'Mexico'], ['🇺🇸', 'США', 'USA'], ['🇯🇵', 'Япония', 'Japan'], ['🇰🇷', 'Корея', 'Korea'],
];

export interface CareerDeps {
  /** Opens a live match; `onFinish` receives the result, `onBack` returns to the career hub. */
  playLive(setup: MatchSetup, focusTeam: 0 | 1, onFinish: (m: Match) => void): void;
}

function matchToResult(m: Match, f: Fixture): FixtureResult {
  return {
    score: m.score,
    xg: [m.teams[0].stats.xg, m.teams[1].stats.xg],
    goals: m.events.filter((e) => e.type === 'goal').map((e) => ({ player: e.player ?? '?', club: e.team === 0 ? f.home : f.away, minute: e.minute })),
  };
}

function overridesFor(state: CareerState, f: Fixture) {
  const h = clubSide(state, f.home);
  const a = clubSide(state, f.away);
  return { homeCoach: h.coach.traits, awayCoach: a.coach.traits, homeTactics: h.tactics, awayTactics: a.tactics };
}

/** Fixtures that should already have been played: every round up to the user's latest result. */
function backlog(state: CareerState): Fixture[] {
  const played = state.league.fixtures.filter((f) => f.result && (f.home === state.clubId || f.away === state.clubId));
  const upTo = played.length ? Math.max(...played.map((f) => f.round)) : 0;
  return state.league.fixtures.filter((f) => !f.result && f.round <= upTo);
}

async function catchUp(state: CareerState, onProgress: () => void): Promise<void> {
  const pending = backlog(state);
  if (!pending.length) return;
  const pool = sharedPool();
  await Promise.all(
    pending.map(async (f) => {
      f.result = await pool.run({ id: f.id, home: f.home, away: f.away, seed: f.seed, overrides: overridesFor(state, f) });
      onProgress();
    }),
  );
  saveCareer(state);
}

export function renderCareer(root: HTMLElement, deps: CareerDeps): void {
  root.innerHTML = `<p class="muted" style="padding:40px 0">${tr().loading}</p>`;
  void loadCareer().then((state) => {
    if (!root.isConnected) return;
    if (state) showCareer(root, state, deps);
    else renderCreator(root, deps);
  });
}

function showCareer(root: HTMLElement, state: CareerState, deps: CareerDeps): void {
  if (state.status === 'active' && seasonComplete(state)) {
    endSeason(state);
    saveCareer(state);
  }
  if (state.status === 'active') renderHub(root, state, deps);
  else renderSeasonEnd(root, state, deps);
}

// ───────────────────────────── creator ──

function renderCreator(root: HTMLElement, deps: CareerDeps): void {
  const draft: CareerCoach = {
    firstName: '',
    lastName: '',
    flag: getLang() === 'ru' ? '🇷🇺' : '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    look: { ...DEFAULT_LOOK },
    style: 'balanced',
    traits: { ...STYLES.balanced.traits },
  };
  const l = tr();
  const lang = getLang();

  const draw = () => {
    root.innerHTML = `
      <section class="hero"><div><h1>${l.createTitle}</h1><p>${l.createSub}</p></div></section>
      <div class="creator">
        <aside class="panel creator-preview">
          <div class="creator-portrait" id="portrait">${avatarSvg(draft.look, 220)}</div>
          <div class="creator-name" id="previewName">${esc(`${draft.firstName} ${draft.lastName}`.trim() || '—')}</div>
          <div class="muted" id="previewMeta">${draft.flag} · ${lang === 'ru' ? STYLE_TEXT[draft.style].nameRu : STYLE_TEXT[draft.style].nameEn}</div>
          <button class="btn small" type="button" id="randomLook">🎲 ${l.randomLook}</button>
        </aside>
        <div class="creator-form">
          <section class="panel creator-section">
            <div class="field-row">
              <label class="field"><span>${l.firstName}</span><input id="firstName" maxlength="20" autocomplete="off" value="${esc(draft.firstName)}"></label>
              <label class="field"><span>${l.lastName}</span><input id="lastName" maxlength="24" autocomplete="off" value="${esc(draft.lastName)}"></label>
              <label class="field"><span>${l.nationality}</span><select id="nation">${NATIONS.map(([f, ru, en]) => `<option value="${f}" ${f === draft.flag ? 'selected' : ''}>${f} ${lang === 'ru' ? ru : en}</option>`).join('')}</select></label>
            </div>
          </section>
          <section class="panel creator-section">
            <h3>${l.appearance}</h3>
            <div class="look-grid">${LOOK_KEYS.map(
              (k) => `<div class="look-row"><span class="look-label">${l[k]}</span>
                <button class="btn small arrow" type="button" data-look="${k}" data-step="-1" aria-label="${l[k]} −">◀</button>
                <span class="look-value" id="lv-${k}">${LOOK_LABELS[k][lang][draft.look[k]]}</span>
                <button class="btn small arrow" type="button" data-look="${k}" data-step="1" aria-label="${l[k]} +">▶</button></div>`,
            ).join('')}</div>
          </section>
          <section class="panel creator-section">
            <h3>${l.philosophy}</h3>
            <div class="style-grid">${STYLE_IDS.map(
              (id) => `<button type="button" class="style-card ${id === draft.style ? 'on' : ''}" data-style="${id}" aria-pressed="${id === draft.style}">
                <b>${lang === 'ru' ? STYLE_TEXT[id].nameRu : STYLE_TEXT[id].nameEn}</b><span>${lang === 'ru' ? STYLE_TEXT[id].ru : STYLE_TEXT[id].en}</span>
                <span class="chip">${STYLES[id].formation}</span></button>`,
            ).join('')}</div>
            <div class="creator-traits">${traitBars({ ...playerCoachPreview(draft) })}</div>
          </section>
          <div class="creator-actions"><span class="form-error" id="err" role="alert"></span><button class="btn primary" type="button" id="toClubs">${l.next} →</button></div>
        </div>
      </div>`;

    const refreshPreview = () => {
      root.querySelector('#portrait')!.innerHTML = avatarSvg(draft.look, 220);
      root.querySelector('#previewName')!.textContent = `${draft.firstName} ${draft.lastName}`.trim() || '—';
      root.querySelector('#previewMeta')!.textContent = `${draft.flag} · ${lang === 'ru' ? STYLE_TEXT[draft.style].nameRu : STYLE_TEXT[draft.style].nameEn}`;
      for (const k of LOOK_KEYS) root.querySelector(`#lv-${k}`)!.textContent = LOOK_LABELS[k][lang][draft.look[k]];
    };
    root.querySelector<HTMLInputElement>('#firstName')!.addEventListener('input', (e) => {
      draft.firstName = (e.target as HTMLInputElement).value.trim();
      refreshPreview();
    });
    root.querySelector<HTMLInputElement>('#lastName')!.addEventListener('input', (e) => {
      draft.lastName = (e.target as HTMLInputElement).value.trim();
      refreshPreview();
    });
    root.querySelector<HTMLSelectElement>('#nation')!.addEventListener('change', (e) => {
      draft.flag = (e.target as HTMLSelectElement).value;
      refreshPreview();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.look as LookKey;
        const n = LOOK_COUNTS[k];
        draft.look[k] = (draft.look[k] + Number(b.dataset.step) + n) % n;
        refreshPreview();
      }),
    );
    root.querySelector('#randomLook')!.addEventListener('click', () => {
      draft.look = randomLook();
      refreshPreview();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) =>
      b.addEventListener('click', () => {
        draft.style = b.dataset.style as CoachStyleId;
        draft.traits = { ...STYLES[draft.style].traits };
        draw();
      }),
    );
    root.querySelector('#toClubs')!.addEventListener('click', () => {
      if (!draft.firstName || !draft.lastName) {
        root.querySelector('#err')!.textContent = l.nameRequired;
        root.querySelector<HTMLInputElement>(draft.firstName ? '#lastName' : '#firstName')!.focus();
        return;
      }
      renderClubPick(root, draft, deps, () => draw());
    });
  };
  draw();
}

function playerCoachPreview(c: CareerCoach) {
  return { id: PLAYER_COACH, name: '', nameRu: '', flag: c.flag, group: 'custom' as const, formations: [STYLES[c.style].formation], tactics: STYLES[c.style].tactics, traits: c.traits, style: { ru: '', en: '' } };
}

function renderClubPick(root: HTMLElement, coach: CareerCoach, deps: CareerDeps, onBack: () => void): void {
  const l = tr();
  let chosen = CLUBS[CLUBS.length - 1].id;
  const draw = () => {
    root.innerHTML = `
      <section class="hero"><div><h1>${l.chooseClub}</h1><p>${l.chooseClubSub}</p></div>
        <div class="hero-coach">${avatarSvg(coach.look, 56)}<div><b>${esc(coach.firstName)} ${esc(coach.lastName)}</b><div class="muted">${coach.flag}</div></div></div></section>
      <div class="club-grid">${CLUBS.map((c) => {
        const st = strength(c, c.tactics.formation);
        return `<button type="button" class="panel club-card ${c.id === chosen ? 'on' : ''}" data-club="${c.id}" aria-pressed="${c.id === chosen}">
          <span class="crest" style="background:${c.colors.primary};color:${c.colors.text};border-color:${c.colors.secondary}">${c.short}</span>
          <b>${esc(c.name)}</b>
          <span class="club-ovr num">OVR ${st.ovr}</span>
          <span class="muted">${l.target}: <b class="tgt">${l.tgt(boardTarget(c.id))}</b></span>
        </button>`;
      }).join('')}</div>
      <div class="creator-actions"><button class="btn" type="button" id="back">← ${l.back}</button><button class="btn primary" type="button" id="start">${l.startCareer}</button></div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-club]').forEach((b) =>
      b.addEventListener('click', () => {
        chosen = b.dataset.club!;
        draw();
      }),
    );
    root.querySelector('#back')!.addEventListener('click', onBack);
    root.querySelector('#start')!.addEventListener('click', () => {
      const state = newCareer(coach, chosen, Math.floor(Math.random() * 1e9));
      saveCareer(state);
      renderHub(root, state, deps);
      window.scrollTo(0, 0);
    });
  };
  draw();
}

// ───────────────────────────── hub ──

function renderHub(root: HTMLElement, state: CareerState, deps: CareerDeps): void {
  const l = tr();
  const lang = getLang();
  const me = playerCoach(state);
  const club = clubById(state.clubId);
  let showTactics = false;
  let busy = false;
  let confirmDelete = false;

  const draw = () => {
    const f = nextUserFixture(state);
    const table = computeTable(state.league.clubs, state.league.fixtures);
    const pos = userPosition(state);
    const target = boardTarget(state.clubId);
    const totals = careerTotals(state);
    const played = state.league.fixtures.filter((x) => x.result && (x.home === state.clubId || x.away === state.clubId));
    const lastRound = played.length ? Math.max(...played.map((x) => x.round)) : 0;
    const confClass = state.confidence >= 70 ? 'good' : state.confidence >= 40 ? 'mid' : 'bad';
    const onTrack = pos <= target;

    const nextCard = f
      ? (() => {
          const homeGame = f.home === state.clubId;
          const oppId = homeGame ? f.away : f.home;
          const opp = clubById(oppId);
          const oc = clubSide(state, oppId).coach;
          const st = strength(opp, clubSide(state, oppId).tactics.formation);
          return `<section class="panel next-match">
            <div class="card-title"><h3>${l.nextMatch}</h3><span class="muted">${l.round} ${f.round}/${Math.max(...state.league.fixtures.map((x) => x.round))} · ${homeGame ? l.home : l.away}</span></div>
            <div class="versus">
              <div class="vs-side"><span class="crest" style="background:${club.colors.primary};color:${club.colors.text};border-color:${club.colors.secondary}">${club.short}</span><b>${esc(club.name)}</b></div>
              <span class="vs-mark">${l.vs}</span>
              <div class="vs-side"><span class="crest" style="background:${opp.colors.primary};color:${opp.colors.text};border-color:${opp.colors.secondary}">${opp.short}</span><b>${esc(opp.name)}</b><span class="muted num">OVR ${st.ovr}</span></div>
            </div>
            <div class="opp-coach">${coachAvatar(oc, 48)}<div><span class="muted">${l.opponentCoach}</span><div><b>${esc(coachName(oc))}</b> · <span class="chip">${oc.formations[0]}</span></div><p>${esc(oc.style[lang])}</p></div></div>
            <div class="next-actions">
              <button class="btn" type="button" id="tacticsBtn" aria-expanded="${showTactics}">${showTactics ? l.hideTactics : l.tactics} · <span class="num">${state.tactics.formation}</span></button>
              <span class="sep"></span>
              <button class="btn" type="button" id="quick" ${busy ? 'disabled' : ''}>⚡ ${l.quick}</button>
              <button class="btn primary" type="button" id="live" ${busy ? 'disabled' : ''}>▶ ${l.playLive}</button>
            </div>
            <div id="tacticsBox" ${showTactics ? '' : 'hidden'}></div>
            ${busy ? `<p class="muted">${l.simulating}</p>` : ''}
          </section>`;
        })()
      : `<section class="panel next-match"><p class="muted">${l.simulating}</p></section>`;

    const roundResults = lastRound
      ? state.league.fixtures
          .filter((x) => x.round === lastRound)
          .map((x) => {
            const mine = x.home === state.clubId || x.away === state.clubId;
            return `<div class="fixture ${mine ? 'mine' : ''}"><span class="h">${esc(clubById(x.home).name)}</span><span class="s">${x.result ? `${x.result.score[0]} : ${x.result.score[1]}` : '…'}</span><span>${esc(clubById(x.away).name)}</span></div>`;
          })
          .join('')
      : '';

    root.innerHTML = `
      <section class="panel career-head">
        <div class="ch-coach">${coachAvatar(me, 76)}<div><div class="ch-name">${esc(me.name)}</div>
          <div class="muted">${lang === 'ru' ? STYLE_TEXT[state.coach.style].nameRu : STYLE_TEXT[state.coach.style].nameEn} · ${l.reputation}: ${l.rep(state.reputation)}</div></div></div>
        <div class="ch-club"><span class="crest" style="background:${club.colors.primary};color:${club.colors.text};border-color:${club.colors.secondary}">${club.short}</span>
          <div><b>${esc(club.name)}</b><div class="muted">${l.season} ${seasonLabel(state.season)}</div></div></div>
        <div class="ch-board">
          <div class="meter-label"><span>${l.board}</span><b class="state ${confClass}">${l.conf(state.confidence)}</b></div>
          <div class="meter ${confClass}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.confidence}"><i style="width:${state.confidence}%"></i></div>
          <div class="muted">${l.objective}: <b>${l.tgt(target)}</b> · ${l.now}: <b class="${onTrack ? 'ok' : 'risk'}">${pos} ${l.place}</b></div>
        </div>
      </section>
      <div class="career-grid">
        <div class="career-main">
          ${nextCard}
          ${roundResults ? `<section class="panel pad"><div class="card-title"><h3>${l.roundResults} · ${l.round} ${lastRound}</h3></div>${roundResults}</section>` : ''}
          <section class="panel pad"><div class="card-title"><h3>${l.table}</h3><span class="muted">${l.season} ${seasonLabel(state.season)}</span></div>
            <div style="overflow-x:auto"><table class="table"><thead><tr><th>#</th><th class="name-cell">${t('club')}</th><th>${l.w}</th><th>${l.d}</th><th>${l.l}</th><th>${t('goalsCol')}</th><th>${l.pts}</th><th class="name-cell">${t('coach')}</th></tr></thead><tbody>
            ${table
              .map((r, i) => {
                const c = clubById(r.club);
                const coach = clubSide(state, r.club).coach;
                return `<tr class="${r.club === state.clubId ? 'me' : ''}"><td>${i + 1}</td><td class="name-cell"><span class="cell-flex"><i class="kit-dot" style="background:${c.colors.primary};outline:2px solid ${c.colors.secondary};outline-offset:-2px"></i>${esc(c.name)}</span></td>
                  <td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}:${r.ga}</td><td><b>${r.pts}</b></td><td class="name-cell"><span class="cell-flex">${coachAvatar(coach, 22)}<span class="muted">${esc(coachName(coach))}</span></span></td></tr>`;
              })
              .join('')}</tbody></table></div></section>
        </div>
        <aside class="career-side">
          <section class="panel pad"><div class="card-title"><h3>${l.yourCoach}</h3></div>${traitBars(me)}
            <div class="totals"><span>${l.w} <b class="num">${totals.w}</b></span><span>${l.d} <b class="num">${totals.d}</b></span><span>${l.l} <b class="num">${totals.l}</b></span><span>${l.goals} <b class="num">${totals.gf}:${totals.ga}</b></span><span>🏆 <b class="num">${totals.titles}</b></span></div></section>
          <section class="panel pad"><div class="card-title"><h3>${l.news}</h3></div><ul class="news">${state.news
            .slice(0, 8)
            .map((n) => `<li><span class="muted num">${seasonLabel(n.season)}</span> ${esc(lang === 'ru' ? n.ru : n.en)}</li>`)
            .join('')}</ul></section>
          ${historyHtml(state)}
          <section class="panel pad danger-zone">
            ${confirmDelete
              ? `<p>${l.confirmDelete}</p><div class="next-actions"><button class="btn" type="button" id="cancelDel">${l.cancel}</button><button class="btn danger" type="button" id="yesDel">${l.yesDelete}</button></div>`
              : `<p class="muted">${l.saved}</p><button class="btn small" type="button" id="delete">${l.deleteCareer}</button>`}
          </section>
        </aside>
      </div>`;

    if (showTactics) {
      root.querySelector('#tacticsBox')!.appendChild(
        tacticsControls(state.tactics, (nt) => {
          state.tactics = { ...nt };
          saveCareer(state);
          const btn = root.querySelector('#tacticsBtn .num');
          if (btn) btn.textContent = state.tactics.formation;
        }),
      );
    }
    root.querySelector('#tacticsBtn')?.addEventListener('click', () => {
      showTactics = !showTactics;
      draw();
    });
    root.querySelector('#quick')?.addEventListener('click', () => void quick());
    root.querySelector('#live')?.addEventListener('click', () => live());
    root.querySelector('#delete')?.addEventListener('click', () => {
      confirmDelete = true;
      draw();
    });
    root.querySelector('#cancelDel')?.addEventListener('click', () => {
      confirmDelete = false;
      draw();
    });
    root.querySelector('#yesDel')?.addEventListener('click', () => {
      deleteCareer();
      renderCreator(root, deps);
    });
    installTooltips(root);
  };

  const afterResult = async () => {
    busy = true;
    draw();
    await catchUp(state, () => root.isConnected && draw());
    busy = false;
    saveCareer(state);
    if (!root.isConnected) return;
    showCareer(root, state, deps);
  };

  const quick = async () => {
    const f = nextUserFixture(state);
    if (!f || busy) return;
    busy = true;
    draw();
    const result = await sharedPool().run({ id: f.id, home: f.home, away: f.away, seed: f.seed, overrides: overridesFor(state, f) });
    recordResult(state, f.id, result);
    saveCareer(state);
    await afterResult();
  };

  const live = () => {
    const f = nextUserFixture(state);
    if (!f) return;
    const h = clubSide(state, f.home);
    const a = clubSide(state, f.away);
    const setup: MatchSetup = {
      home: clubById(f.home), away: clubById(f.away), homeTactics: h.tactics, awayTactics: a.tactics,
      homeCoach: h.coach, awayCoach: a.coach, seed: f.seed,
    };
    deps.playLive(setup, f.home === state.clubId ? 0 : 1, (m) => {
      recordResult(state, f.id, matchToResult(m, f));
      saveCareer(state);
      // The rest of the round plays in the background while the report is on screen.
      void catchUp(state, () => undefined);
    });
  };

  // Rounds the user already played may still have unplayed fixtures (e.g. left mid-simulation).
  if (backlog(state).length) void afterResult();
  else draw();
}

function historyHtml(state: CareerState): string {
  const l = tr();
  if (!state.history.length) return '';
  return `<section class="panel pad"><div class="card-title"><h3>${l.history}</h3></div><table class="table"><thead><tr><th class="name-cell">${l.season}</th><th class="name-cell">${t("club")}</th><th>${l.pos}</th><th>${l.pts}</th><th></th></tr></thead><tbody>${[...state.history]
    .reverse()
    .map((h) => `<tr><td class="name-cell num">${h.label}</td><td class="name-cell">${esc(clubById(h.clubId).short)}</td><td>${h.position}</td><td>${h.pts}</td><td>${h.champion ? '🏆' : h.met ? '✓' : '✗'}</td></tr>`)
    .join('')}</tbody></table></section>`;
}

// ───────────────────────────── season end / sacking ──

function renderSeasonEnd(root: HTMLElement, state: CareerState, deps: CareerDeps): void {
  const l = tr();
  const s = state.lastSummary!;
  const me = playerCoach(state);
  const growth = Object.entries(s.growth) as [keyof CareerCoach['traits'], number][];
  const club = clubById(state.clubId);
  if (state.status === 'sacked') {
    const offers = jobOffers(state);
    root.innerHTML = `
      <section class="panel season-end">
        ${coachAvatar(me, 96)}
        <h1>${l.sacked}</h1>
        <p>${esc(club.name)} · ${l.finished}: <b>${s.position}</b> · ${l.target}: ${l.tgt(s.target)}</p>
        <p class="muted">${l.sackedSub}</p>
        <div class="club-grid">${offers
          .map((id) => {
            const c = clubById(id);
            return `<button type="button" class="panel club-card" data-offer="${id}"><span class="crest" style="background:${c.colors.primary};color:${c.colors.text};border-color:${c.colors.secondary}">${c.short}</span><b>${esc(c.name)}</b><span class="muted">${l.target}: <b>${l.tgt(boardTarget(id))}</b></span><span class="btn small primary">${l.accept}</span></button>`;
          })
          .join('')}</div>
        <button class="btn" type="button" id="restart">${l.newCareerBtn}</button>
      </section>
      ${historyHtml(state)}`;
    root.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach((b) =>
      b.addEventListener('click', () => {
        startNextSeason(state, b.dataset.offer);
        saveCareer(state);
        renderHub(root, state, deps);
      }),
    );
    root.querySelector('#restart')!.addEventListener('click', () => {
      deleteCareer();
      renderCreator(root, deps);
    });
    return;
  }
  root.innerHTML = `
    <section class="panel season-end">
      ${coachAvatar(me, 96)}
      <h3>${l.seasonOver} · ${seasonLabel(state.season)}</h3>
      ${s.champion ? `<div class="trophy">🏆 ${l.champion}</div>` : ''}
      <div class="final-pos"><span class="num">${s.position}</span><span class="muted">${l.finished} · ${esc(club.name)}</span></div>
      <p class="${s.met ? 'ok' : 'risk'}">${s.met ? l.verdictMet : l.verdictMissed} (${s.confidenceDelta > 0 ? '+' : ''}${s.confidenceDelta})</p>
      <div><h3>${l.growth}</h3>
        <div class="growth">${growth.length
          ? growth.map(([k, v]) => `<span class="chip up">${t(`tr_${k}` as Key)} <b class="${traitClass(state.coach.traits[k])}">${state.coach.traits[k]}</b> (+${v})</span>`).join('')
          : `<span class="muted">${l.noGrowth}</span>`}</div></div>
      <button class="btn primary" type="button" id="nextSeason">${l.startNext} ${seasonLabel(state.season + 1)} →</button>
    </section>
    ${historyHtml(state)}`;
  root.querySelector('#nextSeason')!.addEventListener('click', () => {
    startNextSeason(state);
    saveCareer(state);
    renderHub(root, state, deps);
    window.scrollTo(0, 0);
  });
}
