import { boardTarget, recordResult, seasonComplete, seasonLabel } from '../career/career';
import { matchClub } from '../career/development';
import { ensureMarket, transferWindow, wageBill } from '../career/market';
import { overridesFor } from '../career/sim';
import { LEAGUES } from '../data/clubSeeds';
import { clubById, leagueClubs } from '../data/clubs';
import { crestHtml } from '../data/clubCustom';
import { coachById } from '../data/coaches';
import type { Match } from '../engine/match';
import { computeTable, nextRound } from '../league/league';
import { sharedPool } from '../league/pool';
import { decide } from '../owner/events';
import {
  ARCHETYPE_IDS, ARCHETYPES, type Archetype, COST_KEYS, FACILITIES, FACILITY_KINDS, type FacilityKind, INCOME_KEYS, type LedgerKey,
  type OwnerState, type OwnerSummary, type StaffRole, type Strategy, type TicketPolicy, annualCosts, annualIncome, attendance, borrow, build,
  chooseSponsor, clubValuation, coachCandidates, coachRep, coachWage, coachWilling, currentPosition, dividend, effectiveRate, facilityCost,
  fireCoach, fireStaff, hireCoach, hireStaff, injectCapital, listing, loanRoom, maxLoan, money, netWorth, newOwnerCareer, repay, reservePrice, sellClub, setTransferBudget, staffCandidates, staffWilling,
} from '../owner/owner';
import { afterOwnerRound, blocker, finishOwnerSeason, ownerSave, playOwnerRound, startOwnerSeason } from '../owner/play';
import {
  FFP_LIMIT, type OffshoreShare, ensureCompliance, euroSpots, fairAffiliate, ffpResult, ffpStatus, fringePlayers, inflatedSale, leaseback,
  setAffiliate, setOffshore,
} from '../owner/ffp';
import { marketValue } from '../career/market';
import { getLang, t } from '../i18n';
import { NATIONS, type CareerDeps } from './careerView';
import { coachAvatar, coachName, traitBars } from './coachUi';
import { leagueName, leagueTabsHtml } from './leagueUi';
import { type MatchSetup, strength } from './setup';
import { renderMarketTab, renderSquadTab } from './transfersUi';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const L = {
  ru: {
    title: 'Владелец клуба', loading: 'Загрузка…', setupTitle: 'Станьте владельцем клуба', setupSub: 'Вы не выбираете схему перед матчем — вы строите футбольную империю.',
    name: 'Имя владельца', nation: 'Гражданство', archetype: 'Модель владения', capital: 'Капитал', leverage: 'Кредит на покупку', upTo: 'до',
    next: 'Далее: выбор клуба', nameRequired: 'Введите имя владельца.', pickClub: 'Купить клуб', pickSub: 'Цена, долги, бренд и размер рынка у каждого клуба свои. Маленький клуб — дешёвый старт, гранд — кредит и давление.',
    price: 'Цена', debt: 'Долг', brand: 'Бренд', revenue: 'Выручка в год', stadium: 'Стадион', seats: 'тыс. мест', afford: 'По карману', tooExpensive: 'Не хватает средств',
    negotiate: 'Переговоры о покупке', yourOffer: 'Ваше предложение', loan: 'Кредит банка (ляжет на клуб)', yourMoney: 'Из ваших средств', left: 'Останется у вас',
    makeOffer: 'Сделать предложение', accepted: 'Сделка закрыта! Клуб ваш.', counter: (p: string) => `Продавец отказал, но готов уступить за ${p}.`, rejected: 'Продавец отклонил предложение.',
    walk: 'Продавец прекратил переговоры. Выберите другой клуб.', notEnough: 'Не хватает средств даже с кредитом.', back: 'Назад', buy: 'Купить',
    tabs: { overview: 'Обзор', board: 'Руководство', finance: 'Финансы', infra: 'Инфраструктура', world: 'Мир футбола' },
    cash: 'Касса клуба', budget: 'Трансферы', valuation: 'Стоимость клуба', worth: 'Ваше состояние', fans: 'Болельщики', trust: 'Доверие тренера', share: 'Доля',
    nextMatch: 'Следующий тур', round: 'Тур', home: 'Дома', away: 'В гостях', play: 'Сыграть тур', watch: 'Смотреть матч', simMany: 'Играть до решения', simulating: 'Идёт тур…',
    decision: 'Решение владельца', decisionNeeded: 'Сначала примите решение совета директоров.', needCoach: 'У клуба нет главного тренера — назначьте его во вкладке «Руководство».',
    goal: 'Цель владельца', target: 'Задача по месту', now: 'сейчас', place: 'место', table: 'Таблица', news: 'Новости', lastRound: 'Результаты тура',
    coach: 'Главный тренер', rep: 'Репутация', wage: 'Зарплата', perYear: 'в год', demand: 'Ждёт на трансферы', given: 'выделено', contract: 'Контракт', years: 'г.',
    fire: 'Уволить', hire: 'Нанять', candidates: 'Кандидаты', unwilling: 'Не пойдёт к вам', comp: 'Компенсация', noCoach: 'Тренера нет',
    roles: { sd: 'Спортивный директор', fd: 'Финансовый директор', academy: 'Руководитель академии' } as Record<StaffRole, string>,
    roleHint: { sd: 'Ведёт трансферы в окна по вашей стратегии; торгуется о цене.', fd: 'Растит коммерцию, режет расходы, снижает ставку.', academy: 'Сильнее воспитанники и быстрее рост молодёжи.' } as Record<StaffRole, string>,
    traits: { negotiator: 'Переговорщик', scout: 'Скаут', commercial: 'Коммерсант', costCutter: 'Экономист', developer: 'Наставник', talentSpotter: 'Охотник за талантами' } as Record<string, string>,
    vacant: 'Вакансия', rating: 'Уровень', strategy: 'Трансферная стратегия',
    strategies: { winNow: 'Побеждать сейчас', balanced: 'Баланс', youth: 'Ставка на молодёжь' } as Record<Strategy, string>,
    stratHint: { winNow: 'Опытные игроки, весь бюджет в окно.', balanced: 'Игроки до 29 лет, 70% бюджета.', youth: 'До 23 лет с высоким потенциалом; ветеранов — на продажу.' } as Record<Strategy, string>,
    balance: 'Баланс', wealth: 'Личные средства', rate: 'Ставка', loanRoom: 'Банк ещё даст', inject: 'Вложить в клуб', borrow: 'Взять кредит', repay: 'Погасить долг', dividend: 'Вывести дивиденды',
    transferBudget: 'Трансферный бюджет', setBudget: 'Установить', wageBudget: 'Фонд зарплат, тыс. € в неделю', wageBill: 'сейчас', tickets: 'Цены на билеты',
    ticketNames: { low: 'Низкие', normal: 'Обычные', high: 'Высокие' } as Record<TicketPolicy, string>, attendance: 'Заполняемость',
    sponsor: 'Титульный спонсор', sponsorOffers: 'Предложения спонсоров', choose: 'Подписать', perSeason: 'в сезон', seasonsWord: (n: number) => `${n} ${n === 1 ? 'сезон' : n < 5 ? 'сезона' : 'сезонов'}`,
    bonusFor: (p: number, b: string) => `+${b} за ${p === 1 ? 'чемпионство' : `топ-${p}`}`, noSponsor: 'Нет титульного спонсора', naming: 'Название стадиона',
    ledger: 'Отчёт о прибылях и убытках (сезон)', income: 'Доходы', costs: 'Расходы', other: 'Разовые статьи', profit: 'Операционный результат', forecast: 'Прогноз на год',
    ledgerNames: { matchday: 'Билеты и абонементы', commercial: 'Коммерция и мерч', sponsor: 'Спонсор', broadcast: 'ТВ-права', prize: 'Призовые', europe: 'Еврокубки', affiliate: 'Связанные стороны', wages: 'Зарплаты игроков', staff: 'Тренер и директора', interest: 'Проценты', maintenance: 'Содержание объектов', operations: 'Операционные', other: 'Прочее' } as Record<LedgerKey, string>,
    history: 'История', season: 'Сезон', pos: 'Место', profitShort: 'Прибыль',
    level: 'Уровень', upgrade: 'Улучшить', building: 'Стройка', roundsLeft: (n: number) => `ещё ${n} ${n === 1 ? 'тур' : n < 5 ? 'тура' : 'туров'}`, maxed: 'Максимум', capacity: 'Вместимость',
    squad: 'Состав', market: 'Рынок', clubs: 'Клубы лиги', sellClub: 'Продать клуб', sellConfirm: (p: string) => `Продать вашу долю за ~${p}? Карьера с этим клубом закончится.`, yes: 'Да, продать', cancel: 'Отмена',
    seasonOver: 'Сезон завершён', goalMet: 'Цель владельца выполнена', goalMissed: 'Цель владельца не выполнена', prize: 'Призовые', sponsorBonus: 'Бонус спонсора', startNext: 'Начать сезон',
    over: { sold: 'Клуб продан', bankrupt: 'Клуб обанкротился' }, result: 'Итог', start: 'Начинали с', finalWorth: 'Итоговое состояние', buyAnother: 'Купить новый клуб', newGame: 'Новая игра',
    err: { money: 'Не хватает денег.', bank: 'Банк больше не даёт в долг.', busy: 'Уже строится.', max: 'Максимальный уровень.', unwilling: 'Кандидат не хочет к вам: нужен бренд или репутация выше.', noCoach: 'Нужен тренер.' } as Record<string, string>,
    goals: { president: 'Задача по месту и рост бренда', investor: 'Без убытка и рост стоимости', visionary: 'Не менее 3 молодых (≤21) с 5+ матчами' } as Record<Archetype, string>,
    saved: 'Сохраняется автоматически.', deleteSave: 'Удалить карьеру владельца',
    ffp: {
      title: 'Финансовый фэйр-плей', limitNote: (p: number) => `лимит убытков за 3 сезона — ${p}% выручки`, thisSeason: 'Результат сезона по FFP', threeSeasons: 'За 3 сезона', limit: 'лимит',
      europeIncome: 'Доход от еврокубков', spots: (n: number) => `путёвки: топ-${n}`, breachWarn: (b: string) => `Превышение лимита на ${b}: в конце сезона УЕФА наложит санкции.`,
      europe: 'Еврокубки', euroBan: 'Бан в еврокубках', transferBan: 'Запрет регистрации', investigation: 'Расследование УЕФА',
      greyTitle: 'Серые схемы', greySub: '— необязательно и рискованно',
      disclaimer: 'Вымышленная игровая механика. Схемы обобщены по мотивам обвинений, которые в разные годы выдвигались против клубов, и не являются утверждениями о каком-либо реальном клубе.',
      heat: 'Подозрения УЕФА и прессы', hidden: 'Скрыто денег (улики)', investigationOpen: 'идёт расследование',
      s1: 'Спонсор из окружения владельца', s1d: (fair: string) => `Ваша компания платит клубу как спонсор — из ваших личных денег. Для FFP это доход. Всё, что выше рыночной цены (~${fair} в сезон), — улика.`,
      set: 'Установить, €M/сезон', fromPocket: 'платите вы лично',
      s2: 'Зарплаты через третьи компании', s2d: 'Часть зарплат игрокам и тренерам платится вне клуба (права на изображение, консалтинг). Расходы по отчётности ниже, деньги — ваши. Каждый платёж — улика.',
      s3: 'Продать стадион своей же компании', s3d: 'Разово: компания владельца покупает стадион вдвое дороже рынка, клуб получает доход по FFP и платит аренду.', s3btn: 'Провести сделку', done: 'Сделка проведена', rent: 'аренда в сезон',
      s4: 'Раздутая продажа дружественному клубу', s4d: 'Клуб-партнёр «покупает» игрока втрое дороже, вы тайно компенсируете 70%. Для FFP — прибыль от продажи.', s4btn: 'Продать ×3', worth: 'стоит',
      ffpLine: (r: string, t: string, lim: string) => `FFP: сезон ${r}, за 3 сезона ${t} (лимит ${lim}).`, qualified: 'Путёвка в еврокубки: доход в следующем сезоне.',
      opened: 'УЕФА открыл расследование. Вердикт — через сезон.', verdictNext: 'В начале следующего сезона — решение УЕФА.',
    },
  },
  en: {
    title: 'Club owner', loading: 'Loading…', setupTitle: 'Become a club owner', setupSub: 'You don’t pick the formation — you build a football empire.',
    name: 'Owner’s name', nation: 'Nationality', archetype: 'Ownership model', capital: 'Capital', leverage: 'Acquisition loan', upTo: 'up to',
    next: 'Next: choose a club', nameRequired: 'Enter the owner’s name.', pickClub: 'Buy a club', pickSub: 'Every club has its own price, debt, brand and market size. A small club is a cheap start; a giant means debt and pressure.',
    price: 'Price', debt: 'Debt', brand: 'Brand', revenue: 'Revenue a year', stadium: 'Stadium', seats: 'k seats', afford: 'Affordable', tooExpensive: 'Out of reach',
    negotiate: 'Takeover talks', yourOffer: 'Your offer', loan: 'Bank loan (put on the club)', yourMoney: 'From your pocket', left: 'You keep',
    makeOffer: 'Make the offer', accepted: 'Deal done! The club is yours.', counter: (p: string) => `The seller says no, but would sell for ${p}.`, rejected: 'The seller rejects the offer.',
    walk: 'The seller has walked away. Choose another club.', notEnough: 'Not enough money, even with the loan.', back: 'Back', buy: 'Buy',
    tabs: { overview: 'Overview', board: 'Management', finance: 'Finances', infra: 'Facilities', world: 'Football world' },
    cash: 'Club cash', budget: 'Transfers', valuation: 'Club value', worth: 'Your net worth', fans: 'Fans', trust: 'Coach trust', share: 'Stake',
    nextMatch: 'Next round', round: 'Round', home: 'Home', away: 'Away', play: 'Play round', watch: 'Watch match', simMany: 'Play until a decision', simulating: 'Round in progress…',
    decision: 'Owner’s decision', decisionNeeded: 'Settle the board decision first.', needCoach: 'The club has no head coach — appoint one under “Management”.',
    goal: 'Owner’s goal', target: 'League target', now: 'now', place: 'place', table: 'Table', news: 'News', lastRound: 'Round results',
    coach: 'Head coach', rep: 'Reputation', wage: 'Wage', perYear: 'a year', demand: 'Expects for transfers', given: 'given', contract: 'Contract', years: 'yrs',
    fire: 'Sack', hire: 'Hire', candidates: 'Candidates', unwilling: 'Won’t join you', comp: 'Compensation', noCoach: 'No coach',
    roles: { sd: 'Sporting director', fd: 'Finance director', academy: 'Head of academy' } as Record<StaffRole, string>,
    roleHint: { sd: 'Runs transfers in the windows by your strategy; haggles fees down.', fd: 'Grows commercial income, cuts costs, lowers the rate.', academy: 'Better academy graduates and faster youth development.' } as Record<StaffRole, string>,
    traits: { negotiator: 'Negotiator', scout: 'Scout', commercial: 'Dealmaker', costCutter: 'Cost cutter', developer: 'Mentor', talentSpotter: 'Talent spotter' } as Record<string, string>,
    vacant: 'Vacant', rating: 'Level', strategy: 'Transfer strategy',
    strategies: { winNow: 'Win now', balanced: 'Balanced', youth: 'Youth project' } as Record<Strategy, string>,
    stratHint: { winNow: 'Experienced players, the whole budget each window.', balanced: 'Players up to 29, 70% of the budget.', youth: 'Under-23s with high potential; veterans sold.' } as Record<Strategy, string>,
    balance: 'Balance sheet', wealth: 'Personal wealth', rate: 'Rate', loanRoom: 'Bank will still lend', inject: 'Invest in the club', borrow: 'Borrow', repay: 'Repay debt', dividend: 'Take a dividend',
    transferBudget: 'Transfer budget', setBudget: 'Set', wageBudget: 'Wage budget, €K a week', wageBill: 'now', tickets: 'Ticket prices',
    ticketNames: { low: 'Low', normal: 'Normal', high: 'High' } as Record<TicketPolicy, string>, attendance: 'Attendance',
    sponsor: 'Title sponsor', sponsorOffers: 'Sponsor offers', choose: 'Sign', perSeason: 'a season', seasonsWord: (n: number) => `${n} season${n === 1 ? '' : 's'}`,
    bonusFor: (p: number, b: string) => `+${b} for ${p === 1 ? 'the title' : `top ${p}`}`, noSponsor: 'No title sponsor', naming: 'Stadium name',
    ledger: 'Profit and loss (season)', income: 'Income', costs: 'Costs', other: 'One-off items', profit: 'Operating result', forecast: 'Annual forecast',
    ledgerNames: { matchday: 'Tickets & season tickets', commercial: 'Commercial & merchandise', sponsor: 'Sponsor', broadcast: 'TV rights', prize: 'Prize money', europe: 'European football', affiliate: 'Related parties', wages: 'Player wages', staff: 'Coach & directors', interest: 'Interest', maintenance: 'Facility upkeep', operations: 'Operations', other: 'Other' } as Record<LedgerKey, string>,
    history: 'History', season: 'Season', pos: 'Pos', profitShort: 'Profit',
    level: 'Level', upgrade: 'Upgrade', building: 'Building', roundsLeft: (n: number) => `${n} round${n === 1 ? '' : 's'} left`, maxed: 'Maxed out', capacity: 'Capacity',
    squad: 'Squad', market: 'Market', clubs: 'League clubs', sellClub: 'Sell the club', sellConfirm: (p: string) => `Sell your stake for ~${p}? Your time at this club ends.`, yes: 'Yes, sell', cancel: 'Cancel',
    seasonOver: 'Season over', goalMet: 'Owner’s goal met', goalMissed: 'Owner’s goal missed', prize: 'Prize money', sponsorBonus: 'Sponsor bonus', startNext: 'Start season',
    over: { sold: 'Club sold', bankrupt: 'The club went bust' }, result: 'Outcome', start: 'Started with', finalWorth: 'Final net worth', buyAnother: 'Buy another club', newGame: 'New game',
    err: { money: 'Not enough money.', bank: 'The bank won’t lend more.', busy: 'Already being built.', max: 'Maximum level.', unwilling: 'The candidate won’t join: you need a bigger brand or reputation.', noCoach: 'You need a coach.' } as Record<string, string>,
    goals: { president: 'League target and a growing brand', investor: 'No loss and a rising club value', visionary: 'At least 3 under-22s with 5+ games' } as Record<Archetype, string>,
    saved: 'Saves automatically.', deleteSave: 'Delete owner career',
    ffp: {
      title: 'Financial fair play', limitNote: (p: number) => `3-season loss limit: ${p}% of revenue`, thisSeason: 'Season FFP result', threeSeasons: 'Over 3 seasons', limit: 'limit',
      europeIncome: 'European income', spots: (n: number) => `places: top ${n}`, breachWarn: (b: string) => `Over the limit by ${b}: UEFA will sanction the club at season end.`,
      europe: 'In Europe', euroBan: 'European ban', transferBan: 'Registration ban', investigation: 'UEFA investigation',
      greyTitle: 'Grey schemes', greySub: '— optional and risky',
      disclaimer: 'A fictional game mechanic. The schemes are generalised from the kinds of allegations made against clubs over the years and are not claims about any real club.',
      heat: 'Suspicion (UEFA and the press)', hidden: 'Money concealed (evidence)', investigationOpen: 'under investigation',
      s1: 'Sponsor close to the owner', s1d: (fair: string) => `Your own company sponsors the club — with your personal money. FFP counts it as income. Anything above market rate (~${fair} a season) is evidence.`,
      set: 'Set, €M a season', fromPocket: 'paid by you',
      s2: 'Wages through third parties', s2d: 'Part of the players’ and coach’s pay goes outside the club (image rights, consultancy). Reported costs fall; the money is yours. Every payment is evidence.',
      s3: 'Sell the stadium to your own company', s3d: 'One-off: the owner’s company buys the stadium at about twice its value; the club books FFP income and pays rent.', s3btn: 'Do the deal', done: 'Done', rent: 'rent a season',
      s4: 'Inflated sale to a friendly club', s4d: 'A partner club “buys” a player for three times his value; you secretly cover 70%. FFP sees a profit on the sale.', s4btn: 'Sell ×3', worth: 'worth',
      ffpLine: (r: string, t: string, lim: string) => `FFP: season ${r}, three seasons ${t} (limit ${lim}).`, qualified: 'Qualified for Europe: extra income next season.',
      opened: 'UEFA has opened an investigation. The verdict comes in a season.', verdictNext: 'UEFA’s decision arrives at the start of next season.',
    },
  },
};
const tr = () => L[getLang()];
const lang = () => getLang();

type Tab = 'overview' | 'board' | 'finance' | 'infra' | 'world';

// ───────────────────────────── entry ──

export function renderOwner(root: HTMLElement, deps: CareerDeps): void {
  root.innerHTML = `<p class="muted" style="padding:40px 0">${tr().loading}</p>`;
  void ownerSave.load().catch(() => null).then((state) => {
    if (!root.isConnected) return;
    if (!state || state.mode !== 'owner') renderSetup(root, deps);
    else showOwner(root, state, deps);
  });
}

function showOwner(root: HTMLElement, state: OwnerState, deps: CareerDeps): void {
  if (state.owner.over) return renderOver(root, state, deps);
  if (state.status === 'seasonOver' && state.owner.summary) return renderSeasonEnd(root, state, state.owner.summary, deps);
  if (seasonComplete(state) && !state.owner.decision) {
    const summary = finishOwnerSeason(state);
    ownerSave.save(state);
    return renderSeasonEnd(root, state, summary, deps);
  }
  renderHub(root, state, deps);
}

// ───────────────────────────── setup ──

interface Draft {
  name: string;
  flag: string;
  archetype: Archetype;
  wealth?: number;
}

function renderSetup(root: HTMLElement, deps: CareerDeps, carry?: Draft): void {
  const l = tr();
  const draft: Draft = carry ?? { name: '', flag: NATIONS[0][0], archetype: 'president' };
  const draw = () => {
    root.innerHTML = `
      <section class="hero"><div><h1>${l.setupTitle}</h1><p>${l.setupSub}</p></div></section>
      <div class="creator-form">
        <section class="panel creator-section">
          <label class="field">${l.name}<input id="oName" maxlength="40" value="${esc(draft.name)}" autocomplete="off"></label>
          <label class="field">${l.nation}<select id="oFlag">${NATIONS.map(([f, ru, en]) => `<option value="${f}" ${f === draft.flag ? 'selected' : ''}>${f} ${lang() === 'ru' ? ru : en}</option>`).join('')}</select></label>
        </section>
        <section class="panel creator-section">
          <h3>${l.archetype}</h3>
          <div class="style-grid">${ARCHETYPE_IDS.map((id) => {
            const a = ARCHETYPES[id];
            return `<button type="button" class="style-card ${draft.archetype === id ? 'on' : ''}" data-arch="${id}" aria-pressed="${draft.archetype === id}">
              <b>${lang() === 'ru' ? a.nameRu : a.nameEn}</b><span>${lang() === 'ru' ? a.ru : a.en}</span>
              <span>${l.capital}: <b class="num">${money(draft.wealth ?? a.capital)}</b> · ${l.leverage}: <b class="num">${l.upTo} ${Math.round(a.leverage * 100)}%</b></span>
              <span>${l.goal}: ${lang() === 'ru' ? a.goalRu : a.goalEn}</span></button>`;
          }).join('')}</div>
        </section>
        <p class="risk" id="err" role="alert"></p>
        <div class="creator-actions"><button class="btn primary" type="button" id="toClubs">${l.next} →</button></div>
      </div>`;
    root.querySelector<HTMLInputElement>('#oName')!.addEventListener('input', (e) => (draft.name = (e.target as HTMLInputElement).value.trim()));
    root.querySelector<HTMLSelectElement>('#oFlag')!.addEventListener('change', (e) => (draft.flag = (e.target as HTMLSelectElement).value));
    root.querySelectorAll<HTMLButtonElement>('[data-arch]').forEach((b) =>
      b.addEventListener('click', () => {
        draft.archetype = b.dataset.arch as Archetype;
        draw();
      }),
    );
    root.querySelector('#toClubs')!.addEventListener('click', () => {
      if (!draft.name) {
        root.querySelector('#err')!.textContent = l.nameRequired;
        root.querySelector<HTMLInputElement>('#oName')!.focus();
        return;
      }
      renderPurchase(root, deps, draft, () => draw());
    });
  };
  draw();
}

function renderPurchase(root: HTMLElement, deps: CareerDeps, draft: Draft, onBack: () => void): void {
  const l = tr();
  const capital = draft.wealth ?? ARCHETYPES[draft.archetype].capital;
  let league = LEAGUES[0].id;
  let chosen: string | null = null;
  let offer = 0;
  let loan = 0;
  let msg = '';
  const attempts: Record<string, number> = {};
  const draw = () => {
    const clubs = leagueClubs(league);
    const pick = chosen ? listing(chosen) : null;
    const loanMax = pick ? Math.min(maxLoan(draft.archetype, offer || pick.asking), offer || pick.asking) : 0;
    const own = round(offer - loan);
    root.innerHTML = `
      <section class="hero"><div><h1>${l.pickClub}</h1><p>${l.pickSub}</p></div>
        <div class="hero-coach"><div><b>${draft.flag} ${esc(draft.name)}</b><div class="muted">${l.capital}: <b class="num">${money(capital)}</b></div></div></div></section>
      <div class="league-bar">${leagueTabsHtml(league)}</div>
      ${pick ? `<section class="panel pad buy-panel" id="deal">
        <div class="card-title"><h3>${l.negotiate}: ${esc(clubById(pick.clubId).name)}</h3><button class="btn small" type="button" id="closeDeal">✕</button></div>
        <div class="kpis">
          <div><span class="muted">${l.price}</span><b class="num">${money(pick.asking)}</b></div>
          <div><span class="muted">${l.debt}</span><b class="num">${money(pick.debt)}</b></div>
          <div><span class="muted">${l.revenue}</span><b class="num">${money(pick.size)}</b></div>
          <div><span class="muted">${l.brand}</span><b class="num">${pick.brand}</b></div>
        </div>
        <label class="field">${l.yourOffer}: <b class="num" id="offerVal">${money(offer)}</b><input type="range" id="offer" min="${round(pick.asking * 0.7)}" max="${round(pick.asking * 1.1)}" step="${Math.max(0.5, round(pick.asking / 200))}" value="${offer}"></label>
        <label class="field">${l.loan}: <b class="num" id="loanVal">${money(loan)}</b><input type="range" id="loan" min="0" max="${loanMax}" step="${Math.max(0.5, round(loanMax / 100))}" value="${Math.min(loan, loanMax)}"></label>
        <div class="kpis">
          <div><span class="muted">${l.yourMoney}</span><b class="num ${own > capital ? 'risk' : ''}" id="ownVal">${money(own)}</b></div>
          <div><span class="muted">${l.left}</span><b class="num" id="leftVal">${money(capital - own)}</b></div>
        </div>
        ${msg ? `<p class="deal-msg" role="status">${esc(msg)}</p>` : ''}
        <div class="next-actions"><button class="btn primary" type="button" id="makeOffer" ${(attempts[pick.clubId] ?? 0) >= 3 ? 'disabled' : ''}>${l.makeOffer}</button></div>
      </section>` : ''}
      <div class="club-grid">${clubs.map((c) => {
        const x = listing(c.id);
        const ok = x.asking <= capital + maxLoan(draft.archetype, x.asking);
        return `<button type="button" class="panel club-card ${c.id === chosen ? 'on' : ''}" data-club="${c.id}" aria-pressed="${c.id === chosen}">
          ${crestHtml(c, 44)}<b>${esc(c.name)}</b>
          <span class="muted">${l.price}: <b class="num">${money(x.asking)}</b></span>
          <span class="muted">${l.revenue}: <b class="num">${money(x.size)}</b> · ${l.brand} <b class="num">${x.brand}</b></span>
          <span class="muted">${l.debt}: <b class="num">${money(x.debt)}</b> · ${l.stadium}: <b class="num">${x.capacity}</b> ${l.seats}</span>
          <span class="chip ${ok ? 'up' : ''}">${ok ? l.afford : l.tooExpensive}</span></button>`;
      }).join('')}</div>
      <div class="creator-actions"><button class="btn" type="button" id="back">← ${l.back}</button></div>`;

    root.querySelector('#back')!.addEventListener('click', onBack);
    root.querySelectorAll<HTMLButtonElement>('[data-league]').forEach((b) =>
      b.addEventListener('click', () => {
        league = b.dataset.league!;
        draw();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-club]').forEach((b) =>
      b.addEventListener('click', () => {
        chosen = b.dataset.club!;
        const x = listing(chosen);
        offer = x.asking;
        loan = Math.min(maxLoan(draft.archetype, offer), Math.max(0, offer - capital * 0.85));
        msg = '';
        draw();
        root.querySelector('#deal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }),
    );
    root.querySelector('#closeDeal')?.addEventListener('click', () => {
      chosen = null;
      draw();
    });
    const sync = () => {
      const own2 = round(offer - loan);
      root.querySelector('#offerVal')!.textContent = money(offer);
      root.querySelector('#loanVal')!.textContent = money(loan);
      const ov = root.querySelector('#ownVal')!;
      ov.textContent = money(own2);
      ov.classList.toggle('risk', own2 > capital);
      root.querySelector('#leftVal')!.textContent = money(capital - own2);
    };
    root.querySelector<HTMLInputElement>('#offer')?.addEventListener('input', (e) => {
      offer = Number((e.target as HTMLInputElement).value);
      loan = Math.min(loan, maxLoan(draft.archetype, offer), offer);
      sync();
    });
    root.querySelector<HTMLInputElement>('#offer')?.addEventListener('change', () => draw());
    root.querySelector<HTMLInputElement>('#loan')?.addEventListener('input', (e) => {
      loan = Number((e.target as HTMLInputElement).value);
      sync();
    });
    root.querySelector('#makeOffer')?.addEventListener('click', () => {
      if (!chosen) return;
      if (offer - loan > capital) {
        msg = l.notEnough;
        return draw();
      }
      const reserve = reservePrice(chosen);
      attempts[chosen] = (attempts[chosen] ?? 0) + 1;
      if (offer >= reserve) {
        const state = newOwnerCareer({ name: draft.name, flag: draft.flag, archetype: draft.archetype, clubId: chosen, price: offer, loan, seed: Math.floor(Math.random() * 1e9), wealth: draft.wealth });
        ownerSave.save(state);
        renderHub(root, state, deps, l.accepted);
        window.scrollTo(0, 0);
        return;
      }
      if (attempts[chosen] >= 3) msg = l.walk;
      else if (offer >= reserve * 0.9) msg = l.counter(money(Math.ceil(reserve * 10) / 10));
      else msg = l.rejected;
      draw();
    });
  };
  draw();
}

const round = (x: number) => Math.round(x * 10) / 10;

// ───────────────────────────── hub ──

function meter(label: string, v: number, extra = ''): string {
  const cls = v >= 65 ? 'good' : v >= 35 ? 'mid' : 'bad';
  return `<div class="o-meter"><div class="meter-label"><span>${label}</span><b class="num">${Math.round(v)}${extra}</b></div><div class="meter ${cls}"><i style="width:${clamp(v, 0, 100)}%"></i></div></div>`;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function renderHub(root: HTMLElement, state: OwnerState, deps: CareerDeps, flash = ''): void {
  const l = tr();
  let tab: Tab = 'overview';
  let busy = false;
  let msg = flash;
  let openRole: StaffRole | 'coach' | null = null;
  let worldTab: 'squad' | 'market' | 'clubs' = 'squad';
  let confirmSell = false;
  const club = clubById(state.clubId);

  const save = () => ownerSave.save(state);
  const say = (r: { ok: boolean; reason?: string }) => {
    msg = r.ok ? '' : l.err[r.reason ?? 'money'] ?? '';
  };

  const header = () => {
    const o = state.owner;
    const m = ensureMarket(state);
    const a = ARCHETYPES[o.archetype];
    return `<section class="panel owner-head">
      <div class="oh-id">${crestHtml(club, 52)}<div><div class="ch-name">${esc(club.name)}</div>
        <div class="muted">${o.flag} ${esc(o.name)} · ${lang() === 'ru' ? a.nameRu : a.nameEn}${o.share < 1 ? ` · ${l.share} ${Math.round(o.share * 100)}%` : ''}</div>
        <div class="muted">${esc(leagueName(state.league.leagueId ?? 'nor'))} · ${seasonLabel(state.season)}</div>${uefaChips()}</div></div>
      <div class="kpis">
        <div><span class="muted">${l.cash}</span><b class="num ${o.cash < 0 ? 'risk' : ''}">${money(o.cash)}</b></div>
        <div><span class="muted">${l.budget}</span><b class="num">${money(m.budget)}</b></div>
        <div><span class="muted">${l.debt}</span><b class="num">${money(o.debt)}</b></div>
        <div><span class="muted">${l.valuation}</span><b class="num">${money(clubValuation(state))}</b></div>
      </div>
      <div class="oh-meters">${meter(l.fans, o.fanMood)}${meter(l.trust, o.coach?.trust ?? 0)}${meter(l.brand, o.brand)}</div>
    </section>`;
  };

  const uefaChips = () => {
    const c = ensureCompliance(state);
    const chips: string[] = [];
    if (c.europe && c.euroBanUntil < state.season) chips.push(`<span class="chip up">★ ${l.ffp.europe}</span>`);
    if (c.euroBanUntil >= state.season) chips.push(`<span class="chip bad">${l.ffp.euroBan}</span>`);
    if ((ensureMarket(state).banUntil ?? 0) >= state.season) chips.push(`<span class="chip bad">${l.ffp.transferBan}</span>`);
    if (c.investigation !== null) chips.push(`<span class="chip bad">⚖ ${l.ffp.investigation}</span>`);
    return chips.length ? `<div class="uefa-chips">${chips.join('')}</div>` : '';
  };

  const tabs = () => `<nav class="career-tabs" role="tablist">${(Object.keys(l.tabs) as Tab[])
    .map((id) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}">${l.tabs[id]}${id === 'overview' && state.owner.decision ? '<span class="badge">!</span>' : ''}${id === 'board' && !state.owner.coach ? '<span class="badge">!</span>' : ''}</button>`)
    .join('')}</nav>`;

  // ── overview ──
  const decisionHtml = () => {
    const d = state.owner.decision;
    if (!d) return '';
    const ru = lang() === 'ru';
    return `<section class="panel pad decision" role="dialog" aria-labelledby="decTitle">
      <div class="card-title"><h3>${l.decision} · ${seasonLabel(state.season)}</h3><span class="muted">${l.round} ${d.round}</span></div>
      <h2 id="decTitle">${esc(ru ? d.titleRu : d.titleEn)}</h2>
      <p>${esc(ru ? d.textRu : d.textEn)}</p>
      <div class="dec-options">${d.options
        .map((x) => `<button type="button" class="dec-opt" data-decide="${x.id}" ${x.disabled ? 'disabled' : ''}><b>${x.id.toUpperCase()} — ${esc(ru ? x.ru : x.en)}</b><span>${esc(ru ? x.hintRu : x.hintEn)}</span></button>`)
        .join('')}</div>
    </section>`;
  };

  const overview = () => {
    const o = state.owner;
    const r = nextRound(state.league);
    const f = r ? state.league.fixtures.find((x) => x.round === r && (x.home === state.clubId || x.away === state.clubId)) : null;
    const block = blocker(state);
    const table = computeTable(state.league.clubs, state.league.fixtures, state.league.penalties);
    const pos = currentPosition(state);
    const target = boardTarget(state.clubId, state.league.clubs);
    const lastR = (state.devRound ?? 0);
    const results = lastR
      ? state.league.fixtures.filter((x) => x.round === lastR).map((x) => `<div class="fixture ${x.home === state.clubId || x.away === state.clubId ? 'mine' : ''}"><span class="h">${esc(clubById(x.home).name)}</span><span class="s">${x.result ? `${x.result.score[0]} : ${x.result.score[1]}` : '…'}</span><span>${esc(clubById(x.away).name)}</span></div>`).join('')
      : '';
    const next = f
      ? (() => {
          const homeGame = f.home === state.clubId;
          const opp = clubById(homeGame ? f.away : f.home);
          const st = strength(matchClub(state, opp.id), opp.tactics.formation);
          const coach = o.coach ? coachById(o.coach.id) : null;
          return `<section class="panel next-match">
            <div class="card-title"><h3>${l.nextMatch}</h3><span class="muted">${l.round} ${f.round}/${Math.max(...state.league.fixtures.map((x) => x.round))} · ${homeGame ? l.home : l.away}</span></div>
            <div class="versus"><div class="vs-side">${crestHtml(club, 44)}<b>${esc(club.name)}</b>${coach ? `<span class="muted">${esc(coachName(coach))}</span>` : ''}</div><span class="vs-mark">vs</span>
              <div class="vs-side">${crestHtml(opp, 44)}<b>${esc(opp.name)}</b><span class="muted num">OVR ${st.ovr}</span></div></div>
            ${block === 'decision' ? `<p class="risk">${l.decisionNeeded}</p>` : block === 'coach' ? `<p class="risk">${l.needCoach}</p>` : ''}
            <div class="next-actions">
              <button class="btn" type="button" id="many" ${busy || block ? 'disabled' : ''}>⏩ ${l.simMany}</button>
              <span class="sep"></span>
              <button class="btn" type="button" id="watch" ${busy || block ? 'disabled' : ''}>▶ ${l.watch}</button>
              <button class="btn primary" type="button" id="play" ${busy || block ? 'disabled' : ''}>⚡ ${l.play}</button>
            </div>
            ${busy ? `<p class="muted">${l.simulating}</p>` : ''}
          </section>`;
        })()
      : '';
    return `${decisionHtml()}${next}
      <section class="panel pad goals"><div class="card-title"><h3>${l.goal}</h3></div>
        <p>${l.goals[o.archetype]}</p>
        <p class="muted">${l.target}: <b>${target}</b> · ${l.now}: <b class="${pos <= target ? 'ok' : 'risk'}">${pos} ${l.place}</b></p></section>
      ${results ? `<section class="panel pad"><div class="card-title"><h3>${l.lastRound} · ${l.round} ${lastR}</h3></div>${results}</section>` : ''}
      <section class="panel pad"><div class="card-title"><h3>${l.news}</h3></div><ul class="news">${state.news.slice(0, 10).map((n) => `<li><span class="muted num">${seasonLabel(n.season)}</span> ${esc(lang() === 'ru' ? n.ru : n.en)}</li>`).join('')}</ul></section>
      <section class="panel pad"><div class="card-title"><h3>${l.table}</h3></div><div style="overflow-x:auto"><table class="table"><thead><tr><th>#</th><th class="name-cell">${t('club')}</th><th>${t('played')}</th><th>${t('goalsCol')}</th><th>${t('pts')}</th></tr></thead><tbody>
        ${table.map((row, i) => `<tr class="${row.club === state.clubId ? 'me' : ''}"><td>${i + 1}</td><td class="name-cell"><span class="cell-flex">${crestHtml(clubById(row.club), 20)}${esc(clubById(row.club).name)}</span></td><td>${row.p}</td><td>${row.gf}:${row.ga}</td><td><b>${row.pts}</b>${state.league.penalties?.[row.club] ? ` <span class="risk num">−${state.league.penalties[row.club]}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  };

  // ── management ──
  const board = () => {
    const o = state.owner;
    const c = o.coach ? coachById(o.coach.id) : null;
    const coachCard = c && o.coach
      ? `<section class="panel pad staff-card">
          <div class="card-title"><h3>${l.coach}</h3><button class="btn small danger" type="button" id="fireCoach">${l.fire} · ${money(o.coach.wage * Math.max(0.5, o.coach.years))}</button></div>
          <div class="coach-head">${coachAvatar(c, 56)}<div><div class="coach-name">${esc(coachName(c))}</div>
            <div class="muted">${l.rep} <b class="num">${coachRep(c)}</b> · ${l.wage} <b class="num">${money(o.coach.wage)}</b> ${l.perYear} · ${l.contract} <b class="num">${o.coach.years}</b> ${l.years}</div>
            <div class="muted">${l.demand}: <b class="num">${money(o.coach.demand)}</b> · ${l.given} <b class="num">${money(o.coach.given)}</b></div></div></div>
          ${meter(l.trust, o.coach.trust)}
          <p class="coach-style">${esc(c.style[lang()])}</p>
          ${traitBars(c)}
          <button class="btn small" type="button" data-open="coach">${l.candidates} ${openRole === 'coach' ? '▴' : '▾'}</button>
          ${openRole === 'coach' ? coachList() : ''}
        </section>`
      : `<section class="panel pad staff-card"><div class="card-title"><h3>${l.coach}</h3></div><p class="risk">${l.needCoach}</p>${coachList()}</section>`;
    const staff = (['sd', 'fd', 'academy'] as StaffRole[]).map((role) => {
      const s = o.staff[role];
      return `<section class="panel pad staff-card">
        <div class="card-title"><h3>${l.roles[role]}</h3>${s ? `<button class="btn small" type="button" data-fire="${role}">${l.fire} · ${money(s.wage)}</button>` : ''}</div>
        <p class="muted">${l.roleHint[role]}</p>
        ${s ? `<div class="staff-row"><b>${s.flag} ${esc(s.name)}</b><span class="chip">${l.traits[s.trait]}</span><span class="muted">${l.rating} <b class="num">${s.rating}</b>/20 · ${money(s.wage)} ${l.perYear}</span></div>` : `<p class="risk">${l.vacant}</p>`}
        <button class="btn small" type="button" data-open="${role}">${l.candidates} ${openRole === role ? '▴' : '▾'}</button>
        ${openRole === role ? staffCandidates(state, role).map((x) => {
          const ok = staffWilling(o, x);
          return `<div class="cand"><div><b>${x.flag} ${esc(x.name)}</b> <span class="chip">${l.traits[x.trait]}</span><div class="muted">${l.rating} <b class="num">${x.rating}</b>/20 · ${x.age} · ${money(x.wage)} ${l.perYear}</div></div>
            <button class="btn small ${ok ? 'primary' : ''}" type="button" data-hire-staff="${x.id}" ${ok ? '' : 'disabled'}>${ok ? l.hire : l.unwilling}</button></div>`;
        }).join('') : ''}
      </section>`;
    }).join('');
    return `${coachCard}
      <section class="panel pad"><div class="card-title"><h3>${l.strategy}</h3></div>
        <div class="seg" role="group">${(['winNow', 'balanced', 'youth'] as Strategy[]).map((s) => `<button type="button" data-strategy="${s}" aria-pressed="${o.strategy === s}">${l.strategies[s]}</button>`).join('')}</div>
        <p class="muted">${l.stratHint[o.strategy]}</p></section>
      ${staff}`;
  };

  const coachList = () => {
    const o = state.owner;
    return `<div class="cand-list">${coachCandidates(state).slice(0, 14).map((c) => {
      const ok = coachWilling(o, c);
      return `<div class="cand">${coachAvatar(c, 34)}<div><b>${esc(coachName(c))}</b> <span class="chip">${c.formations[0]}</span>
        <div class="muted">${l.rep} <b class="num">${coachRep(c)}</b> · ${money(coachWage(c))} ${l.perYear}</div></div>
        <button class="btn small ${ok ? 'primary' : ''}" type="button" data-hire-coach="${c.id}" ${ok ? '' : 'disabled'}>${ok ? l.hire : l.unwilling}</button></div>`;
    }).join('')}</div>`;
  };

  // ── finances ──
  const finance = () => {
    const o = state.owner;
    const m = ensureMarket(state);
    const inc = annualIncome(state);
    const cost = annualCosts(state);
    const yearIn = inc.matchday + inc.commercial + inc.sponsor + inc.broadcast;
    const yearOut = cost.wages + cost.staff + cost.interest + cost.maintenance + cost.operations;
    const row = (k: LedgerKey, v: number, sign: 1 | -1) => `<div class="led-row"><span>${l.ledgerNames[k]}</span><b class="num ${sign < 0 && v ? 'down' : ''}">${sign < 0 && v ? '−' : ''}${money(Math.abs(v))}</b></div>`;
    const totalIn = INCOME_KEYS.reduce((s, k) => s + o.ledger[k], 0);
    const totalOut = COST_KEYS.reduce((s, k) => s + o.ledger[k], 0);
    const profit = totalIn - totalOut + o.ledger.other;
    const amount = (id: string, def: number) => `<input type="number" id="${id}" min="0" step="1" inputmode="decimal" value="${round(def)}">`;
    return `<section class="panel pad"><div class="card-title"><h3>${l.balance}</h3></div>
        <div class="kpis">
          <div><span class="muted">${l.cash}</span><b class="num">${money(o.cash)}</b></div>
          <div><span class="muted">${l.debt}</span><b class="num">${money(o.debt)}</b><span class="muted">${l.rate} ${(effectiveRate(o) * 100).toFixed(1)}%</span></div>
          <div><span class="muted">${l.wealth}</span><b class="num">${money(o.wealth)}</b></div>
          <div><span class="muted">${l.worth}</span><b class="num">${money(netWorth(state))}</b></div>
        </div>
        <div class="fin-actions">
          <div class="fa">${amount('aInject', Math.min(o.wealth, o.size * 0.1))}<button class="btn small" type="button" id="doInject">${l.inject}</button></div>
          <div class="fa">${amount('aBorrow', Math.min(loanRoom(o), o.size * 0.1))}<button class="btn small" type="button" id="doBorrow">${l.borrow}</button><span class="muted">${l.loanRoom} ${money(loanRoom(o))}</span></div>
          <div class="fa">${amount('aRepay', Math.min(o.cash, o.debt))}<button class="btn small" type="button" id="doRepay">${l.repay}</button></div>
          <div class="fa">${amount('aDiv', 0)}<button class="btn small" type="button" id="doDiv">${l.dividend}</button></div>
        </div></section>
      <section class="panel pad"><div class="card-title"><h3>${l.transferBudget}</h3><span class="muted">${transferWindow(state).open ? '🟢' : '⏸'}</span></div>
        <div class="fin-actions">
          <div class="fa">${amount('aBudget', m.budget)}<button class="btn small primary" type="button" id="doBudget">${l.setBudget}</button>${o.coach ? `<span class="muted">${l.demand}: ${money(o.coach.demand)}</span>` : ''}</div>
          <div class="fa">${amount('aWages', m.wageBudget)}<button class="btn small" type="button" id="doWages">${l.wageBudget}</button><span class="muted">${l.wageBill}: ${Math.round(wageBill(state))}</span></div>
        </div></section>
      <section class="panel pad"><div class="card-title"><h3>${l.tickets}</h3><span class="muted">${l.attendance} ${Math.round(attendance(o) * 100)}% · ${o.capacity} ${l.seats}</span></div>
        <div class="seg" role="group">${(['low', 'normal', 'high'] as TicketPolicy[]).map((p) => `<button type="button" data-tickets="${p}" aria-pressed="${o.tickets === p}">${l.ticketNames[p]}</button>`).join('')}</div></section>
      <section class="panel pad"><div class="card-title"><h3>${l.sponsor}</h3></div>
        ${o.sponsor ? `<p><b>${esc(o.sponsor.name)}</b> · <b class="num">${money(o.sponsor.perSeason)}</b> ${l.perSeason} · ${l.seasonsWord(o.sponsor.seasons)}${o.sponsor.bonus ? ` · ${l.bonusFor(o.sponsor.bonusPos, money(o.sponsor.bonus))}` : ''}</p>` : `<p class="muted">${l.noSponsor}</p>`}
        ${o.naming ? `<p class="muted">${l.naming}: ${money(o.naming.perSeason)} ${l.perSeason} · ${l.seasonsWord(o.naming.seasons)}</p>` : ''}
        ${o.sponsorOffers.length ? `<h3>${l.sponsorOffers}</h3><div class="cand-list">${o.sponsorOffers.map((s, i) => `<div class="cand"><div><b>${esc(s.name)}</b><div class="muted"><b class="num">${money(s.perSeason)}</b> ${l.perSeason} · ${l.seasonsWord(s.seasons)}${s.bonus ? ` · ${l.bonusFor(s.bonusPos, money(s.bonus))}` : ''}</div></div><button class="btn small primary" type="button" data-sponsor="${i}">${l.choose}</button></div>`).join('')}</div>` : ''}
      </section>
      <section class="panel pad"><div class="card-title"><h3>${l.ledger}</h3><span class="muted">${l.forecast}: ${money(yearIn - yearOut)}</span></div>
        <div class="ledger"><div><h4>${l.income}</h4>${INCOME_KEYS.map((k) => row(k, o.ledger[k], 1)).join('')}</div>
          <div><h4>${l.costs}</h4>${COST_KEYS.map((k) => row(k, o.ledger[k], -1)).join('')}${o.ledger.other ? row('other', o.ledger.other, o.ledger.other < 0 ? -1 : 1) : ''}</div></div>
        <div class="led-row total"><span>${l.profit}</span><b class="num ${profit < 0 ? 'down' : 'up'}">${money(profit)}</b></div></section>
      ${greySection()}
      ${o.history.length ? `<section class="panel pad"><div class="card-title"><h3>${l.history}</h3></div><div style="overflow-x:auto"><table class="table"><thead><tr><th class="name-cell">${l.season}</th><th>${l.pos}</th><th>${l.revenue}</th><th>${l.profitShort}</th><th>${l.valuation}</th><th></th></tr></thead><tbody>
        ${[...o.history].reverse().map((h) => `<tr><td class="name-cell num">${h.label}</td><td>${h.position}</td><td>${money(h.revenue)}</td><td class="${h.profit < 0 ? 'down' : 'up'}">${money(h.profit)}</td><td>${money(h.valuation)}</td><td>${h.goalMet ? '✓' : '✗'}</td></tr>`).join('')}
      </tbody></table></div></section>` : ''}`;
  };

  // ── financial fair play & grey schemes ──
  const greySection = () => {
    const o = state.owner;
    const c = ensureCompliance(state);
    const f = l.ffp;
    const now = ffpResult(state);
    const st = ffpStatus(state, now.result);
    const fair = fairAffiliate(state);
    const fringe = fringePlayers(state).slice(0, 6);
    const heatCls = c.heat >= 60 ? 'bad' : c.heat >= 30 ? 'mid' : 'good';
    return `<section class="panel pad ffp">
        <div class="card-title"><h3>${f.title}</h3><span class="muted">${f.limitNote(Math.round(FFP_LIMIT * 100))}</span></div>
        <div class="kpis">
          <div><span class="muted">${f.thisSeason}</span><b class="num ${now.result < 0 ? 'down' : 'up'}">${money(now.result)}</b></div>
          <div><span class="muted">${f.threeSeasons}</span><b class="num ${st.breach ? 'down' : ''}">${money(st.total)}</b><span class="muted">${f.limit} ${money(st.limit)}</span></div>
          <div><span class="muted">${f.europeIncome}</span><b class="num">${c.europe && c.euroBanUntil < state.season ? money(o.size * 0.14) : '—'}</b><span class="muted">${f.spots(euroSpots(state))}</span></div>
        </div>
        ${st.breach ? `<p class="risk">${f.breachWarn(money(st.breach))}</p>` : ''}
      </section>
      <details class="panel pad grey" ${c.affiliate || c.offshore || c.leasebackDone || c.hidden ? 'open' : ''}>
        <summary><b>🕶 ${f.greyTitle}</b> <span class="muted">${f.greySub}</span></summary>
        <p class="muted disclaimer">${f.disclaimer}</p>
        <div class="o-meter"><div class="meter-label"><span>${f.heat}</span><b class="num">${Math.round(c.heat)}</b></div><div class="meter ${heatCls}"><i style="width:${c.heat}%"></i></div></div>
        <p class="muted">${f.hidden}: <b class="num">${money(c.hidden)}</b>${c.investigation !== null ? ` · <span class="risk">⚖ ${f.investigationOpen}</span>` : ''}</p>
        <div class="scheme"><h4>${f.s1}</h4><p class="muted">${f.s1d(money(fair))}</p>
          <div class="fa"><input type="number" id="aAff" min="0" step="1" value="${c.affiliate}"><button class="btn small" type="button" id="doAff">${f.set}</button><span class="muted">${f.fromPocket}</span></div></div>
        <div class="scheme"><h4>${f.s2}</h4><p class="muted">${f.s2d}</p>
          <div class="seg" role="group">${([0, 0.1, 0.2, 0.3] as OffshoreShare[]).map((v) => `<button type="button" data-offshore="${v}" aria-pressed="${c.offshore === v}">${Math.round(v * 100)}%</button>`).join('')}</div></div>
        <div class="scheme"><h4>${f.s3}</h4><p class="muted">${f.s3d}</p>
          ${c.leasebackDone ? `<p class="muted">${f.done} · ${f.rent} ${money(c.leasebackRent)}</p>` : `<button class="btn small" type="button" id="doLease">${f.s3btn}</button>`}</div>
        <div class="scheme"><h4>${f.s4}</h4><p class="muted">${f.s4d}</p>
          <div class="cand-list">${fringe.map((p) => `<div class="cand"><div><b>${esc(p.name)}</b><div class="muted">${f.worth} ${money(marketValue(p))} → ${money(Math.max(1, marketValue(p) * 3))}</div></div><button class="btn small" type="button" data-inflate="${esc(p.id)}">${f.s4btn}</button></div>`).join('')}</div></div>
        ${c.history.length ? `<ul class="news">${c.history.slice(0, 5).map((h) => `<li><span class="muted num">${seasonLabel(h.season)}</span> ${esc(lang() === 'ru' ? h.ru : h.en)}</li>`).join('')}</ul>` : ''}
      </details>`;
  };

  // ── facilities ──
  const infra = () => {
    const o = state.owner;
    return `<div class="fac-grid">${FACILITY_KINDS.map((k) => {
      const f = FACILITIES[k];
      const lvl = o.facilities[k];
      const proj = o.projects.find((p) => p.kind === k);
      const cost = facilityCost(state, k);
      return `<section class="panel pad fac">
        <div class="card-title"><h3>${lang() === 'ru' ? f.ru : f.en}</h3><span class="dots" aria-label="${l.level} ${lvl}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span></div>
        <p class="muted">${lang() === 'ru' ? f.effRu : f.effEn}</p>
        ${k === 'stadium' ? `<p class="muted">${l.capacity}: <b class="num">${o.capacity}</b> ${l.seats} · ${l.attendance} ${Math.round(attendance(o) * 100)}%</p>` : ''}
        ${proj ? `<p class="ok">🏗 ${l.building}: ${l.roundsLeft(proj.roundsLeft)}</p>`
          : lvl >= 5 ? `<p class="muted">${l.maxed}</p>`
          : `<button class="btn small primary" type="button" data-build="${k}" ${cost > o.cash ? 'disabled' : ''}>${l.upgrade} → ${lvl + 1} · ${money(cost)} · ${l.roundsLeft(f.rounds)}</button>`}
      </section>`;
    }).join('')}</div>`;
  };

  // ── world ──
  const world = () => {
    const o = state.owner;
    const sub = `<div class="seg" role="group">${(['squad', 'market', 'clubs'] as const).map((w) => `<button type="button" data-world="${w}" aria-pressed="${worldTab === w}">${l[w]}</button>`).join('')}</div>`;
    if (worldTab !== 'clubs') return `${sub}<div id="worldBox" class="tab-box"></div>`;
    const rows = state.league.clubs.map((id) => {
      const c = clubById(id);
      const coach = coachById(state.coaches[id]);
      const x = listing(id);
      return `<tr class="${id === state.clubId ? 'me' : ''}"><td class="name-cell"><span class="cell-flex">${crestHtml(c, 20)}${esc(c.name)}</span></td><td class="name-cell">${coach ? esc(coachName(coach)) : '—'}</td><td>${id === state.clubId ? money(clubValuation(state)) : money(x.value)}</td><td>${id === state.clubId ? Math.round(o.brand) : x.brand}</td></tr>`;
    }).join('');
    const price = clubValuation(state) * o.share;
    return `${sub}
      <section class="panel pad"><div class="card-title"><h3>${l.clubs}</h3></div><div style="overflow-x:auto"><table class="table"><thead><tr><th class="name-cell">${t('club')}</th><th class="name-cell">${t('coach')}</th><th>${l.valuation}</th><th>${l.brand}</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <section class="panel pad danger-zone">
        ${confirmSell
          ? `<p>${l.sellConfirm(money(price))}</p><div class="next-actions"><button class="btn" type="button" id="cancelSell">${l.cancel}</button><button class="btn danger" type="button" id="yesSell">${l.yes}</button></div>`
          : `<p class="muted">${l.saved}</p><button class="btn small" type="button" id="sell">${l.sellClub} · ~${money(price)}</button>`}
      </section>`;
  };

  // ── draw & wire ──
  const draw = () => {
    if (state.owner.over) return renderOver(root, state, deps);
    root.innerHTML = `${header()}${tabs()}${msg ? `<p class="deal-msg" role="status">${esc(msg)}</p>` : ''}
      <div class="tab-box owner-body">${tab === 'overview' ? overview() : tab === 'board' ? board() : tab === 'finance' ? finance() : tab === 'infra' ? infra() : world()}</div>`;
    const redraw = () => {
      save();
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    };
    const on = (sel: string, fn: (el: HTMLElement) => void) => root.querySelectorAll<HTMLElement>(sel).forEach((el) => el.addEventListener('click', () => fn(el)));
    const num = (id: string) => Number(root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? 0);

    on('[data-tab]', (el) => {
      tab = el.dataset.tab as Tab;
      msg = '';
      draw();
    });
    on('[data-decide]', (el) => {
      decide(state, el.dataset.decide as 'a' | 'b' | 'c');
      msg = '';
      if (!state.owner.coach) tab = 'board';
      save();
      if (state.owner.over || (seasonComplete(state) && !state.owner.decision)) return showOwner(root, state, deps);
      redraw();
    });
    on('#play', () => void playRounds(1));
    on('#many', () => void playRounds(40));
    on('#watch', () => watch());
    on('#fireCoach', () => {
      fireCoach(state);
      openRole = 'coach';
      redraw();
    });
    on('[data-open]', (el) => {
      const r = el.dataset.open as StaffRole | 'coach';
      openRole = openRole === r ? null : r;
      draw();
    });
    on('[data-hire-coach]', (el) => {
      say(hireCoach(state, el.dataset.hireCoach!));
      openRole = null;
      redraw();
    });
    on('[data-hire-staff]', (el) => {
      const role = openRole as StaffRole;
      const cand = staffCandidates(state, role).find((x) => x.id === el.dataset.hireStaff);
      if (cand) say(hireStaff(state, cand));
      openRole = null;
      redraw();
    });
    on('[data-fire]', (el) => {
      fireStaff(state, el.dataset.fire as StaffRole);
      redraw();
    });
    on('[data-strategy]', (el) => {
      state.owner.strategy = el.dataset.strategy as Strategy;
      redraw();
    });
    on('#doInject', () => {
      say(injectCapital(state, num('aInject')));
      redraw();
    });
    on('#doBorrow', () => {
      say(borrow(state, num('aBorrow')));
      redraw();
    });
    on('#doRepay', () => {
      say(repay(state, num('aRepay')));
      redraw();
    });
    on('#doDiv', () => {
      say(dividend(state, num('aDiv')));
      redraw();
    });
    on('#doBudget', () => {
      say(setTransferBudget(state, Math.max(0, num('aBudget'))));
      redraw();
    });
    on('#doWages', () => {
      ensureMarket(state).wageBudget = Math.max(0, Math.round(num('aWages')));
      redraw();
    });
    on('#doAff', () => {
      setAffiliate(state, Math.max(0, num('aAff')));
      redraw();
    });
    on('[data-offshore]', (el) => {
      setOffshore(state, Number(el.dataset.offshore) as OffshoreShare);
      redraw();
    });
    on('#doLease', () => {
      const r = leaseback(state);
      msg = r.ok ? '' : l.err[r.reason === 'money' ? 'money' : 'busy'];
      redraw();
    });
    on('[data-inflate]', (el) => {
      const r = inflatedSale(state, el.dataset.inflate!);
      msg = r.ok ? '' : l.err.money;
      redraw();
    });
    on('[data-tickets]', (el) => {
      state.owner.tickets = el.dataset.tickets as TicketPolicy;
      redraw();
    });
    on('[data-sponsor]', (el) => {
      chooseSponsor(state, Number(el.dataset.sponsor));
      redraw();
    });
    on('[data-build]', (el) => {
      say(build(state, el.dataset.build as FacilityKind));
      redraw();
    });
    on('[data-world]', (el) => {
      worldTab = el.dataset.world as typeof worldTab;
      draw();
    });
    on('#sell', () => {
      confirmSell = true;
      draw();
    });
    on('#cancelSell', () => {
      confirmSell = false;
      draw();
    });
    on('#yesSell', () => {
      sellClub(state);
      save();
      renderOver(root, state, deps);
    });
    const box = root.querySelector<HTMLElement>('#worldBox');
    if (box) (worldTab === 'squad' ? renderSquadTab : renderMarketTab)(box, state, redraw);
  };

  const finishRoundUi = () => {
    save();
    if (!root.isConnected) return;
    if (state.owner.over || seasonComplete(state)) return showOwner(root, state, deps);
    draw();
  };

  const playRounds = async (max: number) => {
    if (busy) return;
    busy = true;
    msg = '';
    draw();
    const run = (req: Parameters<ReturnType<typeof sharedPool>['run']>[0]) => sharedPool().run(req);
    for (let i = 0; i < max && !blocker(state); i++) {
      await playOwnerRound(state, run);
      save();
      if (root.isConnected) draw();
    }
    busy = false;
    finishRoundUi();
  };

  const watch = () => {
    const r = nextRound(state.league);
    if (r === null || blocker(state)) return;
    const f = state.league.fixtures.find((x) => x.round === r && (x.home === state.clubId || x.away === state.clubId));
    if (!f) return void playRounds(1);
    const ov = overridesFor(state, f);
    const setup: MatchSetup = {
      home: matchClub(state, f.home), away: matchClub(state, f.away), homeTactics: ov.homeTactics!, awayTactics: ov.awayTactics!,
      homeCoach: coachById(state.coaches[f.home]), awayCoach: coachById(state.coaches[f.away]), seed: f.seed,
    };
    deps.playLive(setup, f.home === state.clubId ? 0 : 1, (m: Match) => {
      recordResult(state, f.id, {
        score: m.score, xg: [m.teams[0].stats.xg, m.teams[1].stats.xg],
        goals: m.events.filter((e) => e.type === 'goal').map((e) => ({ player: e.player ?? '?', club: e.team === 0 ? f.home : f.away, minute: e.minute })),
        report: m.playerReport(),
      });
      const others = state.league.fixtures.filter((x) => x.round === r && !x.result);
      void Promise.all(others.map((x) => sharedPool().run({ id: x.id, home: x.home, away: x.away, seed: x.seed, overrides: overridesFor(state, x) }).then((res) => recordResult(state, x.id, res)))).then(() => {
        afterOwnerRound(state);
        save();
      });
      save();
    });
  };

  draw();
}

// ───────────────────────────── season end / game over ──

function renderSeasonEnd(root: HTMLElement, state: OwnerState, s: OwnerSummary, deps: CareerDeps): void {
  const l = tr();
  const club = clubById(state.clubId);
  root.innerHTML = `
    <section class="panel season-end">
      ${crestHtml(club, 72)}
      <h3>${l.seasonOver} · ${seasonLabel(state.season)}</h3>
      ${s.champion ? `<div class="trophy">🏆 ${t('champion')}</div>` : ''}
      <div class="final-pos"><span class="num">${s.position}</span><span class="muted">${esc(club.name)} · ${l.target} ${s.target}</span></div>
      <p class="${s.goalMet ? 'ok' : 'risk'}">${s.goalMet ? l.goalMet : l.goalMissed}: ${l.goals[state.owner.archetype]}</p>
      <div class="kpis">
        <div><span class="muted">${l.revenue}</span><b class="num">${money(s.revenue)}</b></div>
        <div><span class="muted">${l.costs}</span><b class="num">${money(s.costs)}</b></div>
        <div><span class="muted">${l.profit}</span><b class="num ${s.profit < 0 ? 'down' : 'up'}">${money(s.profit)}</b></div>
        <div><span class="muted">${l.valuation}</span><b class="num">${money(s.valuation)}</b><span class="muted ${s.valuation >= s.valuationBefore ? 'up' : 'down'}">${s.valuation >= s.valuationBefore ? '▲' : '▼'} ${money(Math.abs(s.valuation - s.valuationBefore))}</span></div>
      </div>
      <p class="muted">${l.prize}: ${money(s.prize)}${s.sponsorBonus ? ` · ${l.sponsorBonus}: ${money(s.sponsorBonus)}` : ''}</p>
      ${s.ffp ? `<div class="ffp-end">
        <p>${l.ffp.ffpLine(money(s.ffp.result), money(s.ffp.total), money(s.ffp.limit))}</p>
        ${s.ffp.europe ? `<p class="ok">★ ${l.ffp.qualified}</p>` : ''}
        ${s.ffp.investigationOpened ? `<p class="risk">⚖ ${l.ffp.opened}</p>` : ''}
        ${s.ffp.verdictComing ? `<p class="risk">⚖ ${l.ffp.verdictNext}</p>` : ''}
      </div>` : ''}
      <button class="btn primary" type="button" id="nextSeason">${l.startNext} ${seasonLabel(state.season + 1)} →</button>
    </section>`;
  root.querySelector('#nextSeason')!.addEventListener('click', () => {
    startOwnerSeason(state);
    ownerSave.save(state);
    renderHub(root, state, deps);
    window.scrollTo(0, 0);
  });
}

function renderOver(root: HTMLElement, state: OwnerState, deps: CareerDeps): void {
  const l = tr();
  const o = state.owner;
  const club = clubById(state.clubId);
  const over = o.over!;
  const worth = o.wealth;
  root.innerHTML = `
    <section class="panel season-end">
      ${crestHtml(club, 72)}
      <h1>${l.over[over.reason]}</h1>
      <p>${esc(club.name)} · ${seasonLabel(over.season)}${over.price ? ` · ${money(over.price)}` : ''}</p>
      <div class="kpis">
        <div><span class="muted">${l.start}</span><b class="num">${money(o.startWealth)}</b></div>
        <div><span class="muted">${l.finalWorth}</span><b class="num ${worth >= o.startWealth ? 'up' : 'down'}">${money(worth)}</b></div>
      </div>
      <div class="next-actions">
        ${worth > 1 ? `<button class="btn primary" type="button" id="again">${l.buyAnother}</button>` : ''}
        <button class="btn" type="button" id="fresh">${l.newGame}</button>
      </div>
    </section>`;
  root.querySelector('#again')?.addEventListener('click', () => {
    ownerSave.remove();
    renderSetup(root, deps, { name: o.name, flag: o.flag, archetype: o.archetype, wealth: worth });
  });
  root.querySelector('#fresh')!.addEventListener('click', () => {
    ownerSave.remove();
    renderSetup(root, deps);
  });
}

/** Menu label for a saved owner career. */
export function ownerMenuLabel(): string | null {
  const s = ownerSave.peek();
  if (!s || s.mode !== 'owner') return null;
  return `${s.owner.name} · ${clubById(s.clubId).name} · ${seasonLabel(s.season)}`;
}

