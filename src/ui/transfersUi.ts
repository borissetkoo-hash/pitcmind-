import type { CareerState } from '../career/career';
import {
  SQUAD_MAX, SQUAD_MIN, type DealError, acceptOffer, askingPrice, bid, ensureMarket, fmtMoney,
  fmtWage, isLoanedIn, lineOf, listPlayer, loanFee, loanIn, loanOut, loanable, marketValue, potential, rating, rejectOffer,
  squadOf, transferWindow, wageBill, wageDemand, wageOf, willingToJoin,
} from '../career/market';
import { DEFAULT_TRAINING, type Focus, INJURIES, type Intensity, absence, matchSquad, statusOf } from '../career/development';
import { LEAGUES, leagueOf } from '../data/clubSeeds';
import { FORMATIONS } from '../engine/formations';
import { pickLineup } from '../engine/team';
import { CLUBS, clubById } from '../data/clubs';
import { crestHtml } from '../data/clubCustom';
import { overall } from '../engine/attributes';
import type { Attributes, Line, PlayerData, Role } from '../engine/types';
import { getLang } from '../i18n';
import { leagueName } from './leagueUi';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const L = {
  ru: {
    budget: 'Трансферный бюджет', wages: 'Зарплаты в неделю', squad: 'Игроков в составе', windowOpen: (k: string, n: number) => `${k === 'winter' ? 'Зимнее' : 'Летнее'} трансферное окно открыто · закроется через ${n} ${n === 1 ? 'тур' : n < 5 ? 'тура' : 'туров'}`,
    windowShut: (n: number) => `Трансферное окно закрыто · откроется через ${n} ${n === 1 ? 'тур' : n < 5 ? 'тура' : 'туров'}`, windowSeason: 'Трансферное окно закрыто до конца сезона',
    offers: 'Предложения по игрокам', noOffers: 'Предложений пока нет. Выставьте игроков на трансфер — клубы начнут делать ставки, пока открыто окно.',
    offerText: (club: string, fee: string, p: string) => `«${club}» предлагает ${fee} за ${p}`, until: 'действует до тура', accept: 'Принять', reject: 'Отклонить',
    all: 'Все', name: 'Игрок', pos: 'Поз', age: 'Возр', ovr: 'ОВР', pot: 'ПОТ', value: 'Стоимость', wage: 'Зарплата', club: 'Клуб',
    listed: 'на трансфере', onLoan: 'в аренде', list: 'Выставить на трансфер', unlist: 'Снять с трансфера', price: 'Цена, €M', loanOut: 'Отдать в аренду',
    search: 'Поиск по имени', anyLeague: 'Все лиги', sortBy: 'Сортировка', affordable: 'По карману', more: 'Показать ещё',
    asking: 'Клуб хочет примерно', demand: 'Запрос по зарплате', yourBest: 'Ваш лучший на позиции', compare: 'Сравнение',
    makeBid: 'Сделать предложение', bidLabel: 'Сумма, €M', loanBtn: (f: string) => `Арендовать до конца сезона · ${f}`, unwilling: 'Не хочет переходить: уровень клуба или ваша репутация пока недостаточны.',
    done: (f: string) => `Сделка завершена: ${f}.`, loanDone: 'Аренда оформлена.', loanedTo: (c: string) => `Игрок отправлен в аренду в «${c}».`,
    counter: (f: string) => `Предложение отклонено. Клуб готов отдать игрока за ${f}.`, sold: (f: string) => `Игрок продан за ${f}.`,
    err: {
      banned: 'Клубу запрещено регистрировать новых игроков (санкция УЕФА).', closed: 'Трансферное окно закрыто.', budget: 'Не хватает трансферного бюджета.', wages: 'Зарплата не помещается в зарплатную ведомость.',
      squadFull: `В составе уже ${SQUAD_MAX} игроков.`, squadMin: `В составе должно остаться не меньше ${SQUAD_MIN} игроков.`, unwilling: 'Игрок не хочет переходить в ваш клуб.',
      rejected: 'Предложение отклонено.', patience: 'Клуб больше не хочет вести переговоры в этом окне.', notLoanable: 'Игрок недоступен для аренды.', own: 'Это ваш игрок.',
    } as Record<DealError, string>,
    marketTitle: 'Трансферный рынок', marketSub: 'Игроки всех лиг. Нажмите на игрока, чтобы сравнить его с вашим составом и сделать предложение.',
    recent: 'Последние трансферы', loanTag: 'аренда', none: 'Ничего не найдено.',
    cond: 'Форма', condFull: 'Физическое состояние', apps: 'Матчей', injured: 'Травма', banned: 'Дисквалификация', matches: (n: number) => `${n} ${n === 1 ? 'матч' : n < 5 ? 'матча' : 'матчей'}`,
    yellows: 'Жёлтых до дисквалификации', seasonGrowth: 'Рост за сезон', training: 'Тренировки', intensity: 'Нагрузка', focus: 'Акцент',
    int: { low: 'Лёгкая', normal: 'Обычная', high: 'Интенсивная' } as Record<Intensity, string>,
    foc: { balanced: 'Баланс', attack: 'Атака', defence: 'Оборона', physical: 'Физика' } as Record<Focus, string>,
    intHint: {
      low: 'Игроки быстрее восстанавливаются и реже травмируются, но прогрессируют медленнее.',
      normal: 'Сбалансированная нагрузка: обычное восстановление и рост.',
      high: 'Молодые растут быстрее (+30%), но восстановление медленнее и выше риск травм на тренировках.',
    } as Record<Intensity, string>,
    focHint: {
      balanced: 'Растут атрибуты, важные для позиции игрока.', attack: 'Удар, дриблинг, первое касание, хладнокровие, видение поля.',
      defence: 'Отбор, позиционирование, игра головой.', physical: 'Скорость, ускорение, выносливость; ветераны теряют форму медленнее.',
    } as Record<Focus, string>,
    readiness: 'Готовность состава', xiCond: 'Свежесть основы', out: 'Не сыграют', allFit: 'Все игроки доступны.',
  },
  en: {
    budget: 'Transfer budget', wages: 'Weekly wages', squad: 'Squad size', windowOpen: (k: string, n: number) => `${k === 'winter' ? 'Winter' : 'Summer'} transfer window open · closes in ${n} round${n === 1 ? '' : 's'}`,
    windowShut: (n: number) => `Transfer window shut · opens in ${n} round${n === 1 ? '' : 's'}`, windowSeason: 'Transfer window shut until the end of the season',
    offers: 'Offers for your players', noOffers: 'No offers yet. List players for transfer and clubs will bid while the window is open.',
    offerText: (club: string, fee: string, p: string) => `${club} offer ${fee} for ${p}`, until: 'valid until round', accept: 'Accept', reject: 'Reject',
    all: 'All', name: 'Player', pos: 'Pos', age: 'Age', ovr: 'OVR', pot: 'POT', value: 'Value', wage: 'Wage', club: 'Club',
    listed: 'listed', onLoan: 'on loan', list: 'List for transfer', unlist: 'Remove from list', price: 'Price, €M', loanOut: 'Loan out',
    search: 'Search by name', anyLeague: 'All leagues', sortBy: 'Sort', affordable: 'Affordable', more: 'Show more',
    asking: 'The club wants about', demand: 'Wage demand', yourBest: 'Your best in this position', compare: 'Comparison',
    makeBid: 'Make an offer', bidLabel: 'Fee, €M', loanBtn: (f: string) => `Loan until the end of the season · ${f}`, unwilling: 'Not interested: your club’s level or your reputation is not high enough yet.',
    done: (f: string) => `Deal done: ${f}.`, loanDone: 'Loan agreed.', loanedTo: (c: string) => `Player loaned out to ${c}.`,
    counter: (f: string) => `Offer rejected. The club would sell for ${f}.`, sold: (f: string) => `Player sold for ${f}.`,
    err: {
      banned: 'The club is banned from registering new players (UEFA sanction).', closed: 'The transfer window is shut.', budget: 'Not enough transfer budget.', wages: 'The wage doesn’t fit the wage budget.',
      squadFull: `The squad already has ${SQUAD_MAX} players.`, squadMin: `At least ${SQUAD_MIN} players must remain in the squad.`, unwilling: 'The player doesn’t want to join your club.',
      rejected: 'Offer rejected.', patience: 'The club won’t negotiate again in this window.', notLoanable: 'The player isn’t available on loan.', own: 'He’s your player.',
    } as Record<DealError, string>,
    marketTitle: 'Transfer market', marketSub: 'Players from every league. Tap a player to compare him with your squad and make an offer.',
    recent: 'Recent transfers', loanTag: 'loan', none: 'Nothing found.',
    cond: 'Cond', condFull: 'Condition', apps: 'Apps', injured: 'Injury', banned: 'Suspended', matches: (n: number) => `${n} match${n === 1 ? '' : 'es'}`,
    yellows: 'Yellows towards a ban', seasonGrowth: 'Progress this season', training: 'Training', intensity: 'Intensity', focus: 'Focus',
    int: { low: 'Light', normal: 'Normal', high: 'Intense' } as Record<Intensity, string>,
    foc: { balanced: 'Balanced', attack: 'Attack', defence: 'Defence', physical: 'Physical' } as Record<Focus, string>,
    intHint: {
      low: 'Players recover faster and get injured less, but develop more slowly.',
      normal: 'Balanced load: normal recovery and development.',
      high: 'Young players develop faster (+30%), but recovery is slower and training injuries more likely.',
    } as Record<Intensity, string>,
    focHint: {
      balanced: 'Develops the attributes that matter for each player’s position.', attack: 'Shooting, dribbling, first touch, composure, vision.',
      defence: 'Tackling, positioning, heading.', physical: 'Pace, acceleration, stamina; veterans decline more slowly.',
    } as Record<Focus, string>,
    readiness: 'Squad readiness', xiCond: 'Starting XI freshness', out: 'Unavailable', allFit: 'Everyone is available.',
  },
};
const tr = () => L[getLang()];

const ROLE_RU: Record<Role, string> = {
  GK: 'ВРТ', CB: 'ЦЗ', LB: 'ЛЗ', RB: 'ПЗ', LWB: 'ЛФЗ', RWB: 'ПФЗ', DM: 'ОП', CM: 'ЦП', LM: 'ЛП', RM: 'ПП', AM: 'АП', LW: 'ЛВ', RW: 'ПВ', ST: 'НАП',
};
export const roleLabel = (r: Role) => (getLang() === 'ru' ? ROLE_RU[r] : r);
const LINES: { id: Line | 'all'; ru: string; en: string }[] = [
  { id: 'all', ru: 'Все', en: 'All' }, { id: 'gk', ru: 'ВРТ', en: 'GK' }, { id: 'def', ru: 'ЗАЩ', en: 'DEF' }, { id: 'mid', ru: 'ПЗ', en: 'MID' }, { id: 'att', ru: 'НАП', en: 'ATT' },
];
const ovrClass = (r: number) => (r >= 86 ? 'tv-hi' : r >= 79 ? 'tv-good' : r >= 70 ? 'tv-mid' : 'tv-lo');

/** Key attributes shown when a player is opened, per line. */
const KEY_ATTRS: Record<Line, (keyof Attributes)[]> = {
  gk: ['goalkeeping', 'positioning', 'composure', 'passing'],
  def: ['tackling', 'positioning', 'heading', 'pace', 'passing'],
  mid: ['passing', 'vision', 'firstTouch', 'tackling', 'stamina'],
  att: ['shooting', 'dribbling', 'pace', 'composure', 'firstTouch'],
};
const ATTR_RU: Record<keyof Attributes, string> = {
  pace: 'Скорость', acceleration: 'Ускорение', stamina: 'Выносливость', passing: 'Пас', vision: 'Видение', shooting: 'Удар', dribbling: 'Дриблинг',
  firstTouch: 'Первое касание', tackling: 'Отбор', positioning: 'Позиционирование', heading: 'Игра головой', composure: 'Хладнокровие', goalkeeping: 'Вратарская игра',
};
const ATTR_EN: Record<keyof Attributes, string> = {
  pace: 'Pace', acceleration: 'Acceleration', stamina: 'Stamina', passing: 'Passing', vision: 'Vision', shooting: 'Shooting', dribbling: 'Dribbling',
  firstTouch: 'First touch', tackling: 'Tackling', positioning: 'Positioning', heading: 'Heading', composure: 'Composure', goalkeeping: 'Goalkeeping',
};
const attrName = (k: keyof Attributes) => (getLang() === 'ru' ? ATTR_RU : ATTR_EN)[k];

function lineSeg(current: string): string {
  const lang = getLang();
  return `<div class="seg" role="group">${LINES.map((x) => `<button type="button" data-line="${x.id}" aria-pressed="${current === x.id}">${x[lang]}</button>`).join('')}</div>`;
}

/** Budget, wages, squad size and the window — shown on both tabs. */
export function financeStrip(state: CareerState): string {
  const l = tr();
  const m = ensureMarket(state);
  const bill = wageBill(state);
  const w = transferWindow(state);
  const size = squadOf(state, state.clubId).length;
  const pct = Math.min(100, (bill / m.wageBudget) * 100);
  const winText = w.open ? l.windowOpen(w.kind!, w.rounds) : w.next === 'winter' ? l.windowShut(w.rounds) : l.windowSeason;
  return `<section class="panel pad fin-strip">
    <div><span class="muted">${l.budget}</span><b class="num big">${fmtMoney(m.budget)}</b></div>
    <div><span class="muted">${l.wages}</span><b class="num">${fmtWage(bill)} / ${fmtWage(m.wageBudget)}</b>
      <div class="meter ${pct > 95 ? 'bad' : pct > 85 ? 'mid' : 'good'}"><i style="width:${pct}%"></i></div></div>
    <div><span class="muted">${l.squad}</span><b class="num">${size} / ${SQUAD_MAX}</b></div>
    <div class="win ${w.open ? 'open' : ''}">${w.open ? '🟢' : '⏸'} ${winText}</div>
  </section>`;
}

function playerRow(p: PlayerData, first: string, extra: string, cols: string, open: boolean, cls = ''): string {
  const r = rating(p);
  return `<button type="button" class="prow ${open ? 'open' : ''} ${cls}" data-pid="${esc(p.id)}" aria-expanded="${open}">
    <span class="pnum num">${first}</span>
    <span class="pname"><b>${esc(p.name)}</b>${extra}</span>
    <span class="ppos">${roleLabel(p.position)}</span>
    <span class="num">${p.age}</span>
    <span class="num ${ovrClass(r)}"><b>${r}</b></span>
    <span class="num muted pcol">${potential(p)}</span>
    ${cols}
  </button>`;
}

const condClass = (c: number) => (c >= 85 ? 'good' : c >= 70 ? 'mid' : 'bad');

function condCell(c: number): string {
  const v = Math.round(c);
  return `<span class="cond" title="${tr().condFull}: ${v}%"><i class="${condClass(v)}" style="width:${v}%"></i><b class="num">${v}</b></span>`;
}

/** Injury, suspension and development badges for a squad row. */
function statusTags(state: CareerState, p: PlayerData): string {
  const l = tr();
  const s = statusOf(state, p.id);
  let out = '';
  if (s.inj) out += `<span class="tag inj" title="${esc(INJURIES[s.inj.k][getLang()])}">✚ ${s.inj.r}</span>`;
  if (s.ban) out += `<span class="tag ban" title="${l.banned}">▮ ${s.ban}</span>`;
  const d = s.r0 !== undefined ? rating(p) - s.r0 : 0;
  if (d) out += `<span class="tag ${d > 0 ? 'grow' : 'fall'}" title="${l.seasonGrowth}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>`;
  return out;
}

/** Next-match readiness: freshness of the likely XI and who is missing. */
export function readinessHtml(state: CareerState): string {
  const l = tr();
  const lang = getLang();
  const fit = matchSquad(state, state.clubId);
  const { lineup } = pickLineup(fit, FORMATIONS[state.tactics.formation]);
  const avg = Math.round((lineup.reduce((a, p) => a + (p.condition ?? 1), 0) / lineup.length) * 100);
  const out = squadOf(state, state.clubId).filter((p) => absence(state, p.id));
  return `<div class="readiness">
    <div class="meter-label"><span>${l.xiCond}</span><b class="num">${avg}%</b></div>
    <div class="meter ${condClass(avg)}"><i style="width:${avg}%"></i></div>
    <div class="muted">${out.length
      ? `${l.out}: ${out
          .map((p) => {
            const s = statusOf(state, p.id);
            return `<b>${esc(p.name)}</b> (${s.inj ? `${esc(INJURIES[s.inj.k][lang].toLowerCase())}, ${l.matches(s.inj.r)}` : `${l.banned.toLowerCase()}, ${l.matches(s.ban!)}`})`;
          })
          .join(', ')}`
      : l.allFit}</div>
  </div>`;
}

function trainingPanel(state: CareerState): string {
  const l = tr();
  const t = state.training ?? DEFAULT_TRAINING;
  const seg = (name: string, keys: string[], cur: string, labels: Record<string, string>) =>
    `<div class="seg" role="group" aria-label="${name}">${keys.map((k) => `<button type="button" data-${name}="${k}" aria-pressed="${cur === k}">${labels[k]}</button>`).join('')}</div>`;
  return `<section class="panel pad training">
    <div class="card-title"><h3>${l.training}</h3></div>
    <div class="train-row"><span class="muted">${l.intensity}</span>${seg('intensity', ['low', 'normal', 'high'], t.intensity, l.int)}<p class="muted">${l.intHint[t.intensity]}</p></div>
    <div class="train-row"><span class="muted">${l.focus}</span>${seg('focus', ['balanced', 'attack', 'defence', 'physical'], t.focus, l.foc)}<p class="muted">${l.focHint[t.focus]}</p></div>
  </section>`;
}

function attrsHtml(p: PlayerData, vs?: PlayerData): string {
  return `<div class="pattrs">${KEY_ATTRS[lineOf(p.position)]
    .map((k) => {
      const d = vs ? p.attrs[k] - vs.attrs[k] : 0;
      return `<span>${attrName(k)} <b class="num ${ovrClass(p.attrs[k])}">${p.attrs[k]}</b>${vs ? ` <i class="num ${d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}">${d > 0 ? '+' : ''}${d}</i>` : ''}</span>`;
    })
    .join('')}</div>`;
}

// ───────────────────────────── squad tab ──

const squadUi = { line: 'all' as Line | 'all', open: '' as string, msg: '' };

export function renderSquadTab(box: HTMLElement, state: CareerState, changed: () => void): void {
  const l = tr();
  const m = ensureMarket(state);
  const squad = [...squadOf(state, state.clubId)]
    .filter((p) => squadUi.line === 'all' || lineOf(p.position) === squadUi.line)
    .sort((a, b) => ['gk', 'def', 'mid', 'att'].indexOf(lineOf(a.position)) - ['gk', 'def', 'mid', 'att'].indexOf(lineOf(b.position)) || rating(b) - rating(a));
  const offers = m.offers
    .map((o) => {
      const p = squadOf(state, state.clubId).find((x) => x.id === o.playerId);
      if (!p) return '';
      const c = clubById(o.club);
      return `<div class="offer">${crestHtml(c, 28)}<div><b>${esc(l.offerText(c.name, fmtMoney(o.fee), p.name))}</b>
        <div class="muted">${l.value}: ${fmtMoney(marketValue(p))} · ${l.until} ${o.expires}</div></div>
        <div class="offer-actions"><button class="btn small" type="button" data-reject="${o.id}">${l.reject}</button><button class="btn small primary" type="button" data-accept="${o.id}">${l.accept}</button></div></div>`;
    })
    .join('');

  box.innerHTML = `${trainingPanel(state)}
    ${financeStrip(state)}
    <section class="panel pad"><div class="card-title"><h3>${l.offers}</h3></div>${offers || `<p class="muted">${l.noOffers}</p>`}</section>
    ${squadUi.msg ? `<p class="deal-msg" role="status">${esc(squadUi.msg)}</p>` : ''}
    <section class="panel pad">
      <div class="card-title">${lineSeg(squadUi.line)}</div>
      <div class="plist">
        <div class="prow head"><span>#</span><span>${l.name}</span><span>${l.pos}</span><span>${l.age}</span><span>${l.ovr}</span><span class="pcol">${l.pot}</span><span>${l.cond}</span><span class="wcol">${l.value}</span></div>
        ${squad
          .map((p) => {
            const listed = m.listed[p.id];
            const loan = isLoanedIn(state, p.id);
            const st = statusOf(state, p.id);
            const tags = `${statusTags(state, p)}${listed !== undefined ? `<span class="tag sell">${l.listed} ${fmtMoney(listed)}</span>` : ''}${loan ? `<span class="tag loan">${l.onLoan}</span>` : ''}`;
            const row = playerRow(p, String(p.number), tags, `${condCell(st.c)}<span class="num wcol">${fmtMoney(marketValue(p))}</span>`, squadUi.open === p.id, absence(state, p.id) ? 'out' : '');
            if (squadUi.open !== p.id) return row;
            const facts = [
              `${l.condFull}: <b class="num">${Math.round(st.c)}%</b>`,
              st.inj ? `<span class="risk">${l.injured}: ${esc(INJURIES[st.inj.k][getLang()])}, ${l.matches(st.inj.r)}</span>` : '',
              st.ban ? `<span class="risk">${l.banned}: ${l.matches(st.ban)}</span>` : '',
              `${l.apps}: <b class="num">${st.apps ?? 0}</b>`,
              `${l.yellows}: <b class="num">${st.yc ?? 0}/5</b>`,
              st.r0 !== undefined ? `${l.seasonGrowth}: <b class="num">${st.r0} → ${rating(p)}</b>` : '',
              `${l.value}: <b class="num">${fmtMoney(marketValue(p))}</b> · ${l.wage}: <b class="num">${fmtWage(wageOf(p))}</b>`,
            ].filter(Boolean);
            return `${row}<div class="pdetail"><div class="pfacts">${facts.map((f) => `<span>${f}</span>`).join('')}</div>${attrsHtml(p)}
              ${loan
                ? ''
                : `<div class="deal">${listed !== undefined
                    ? `<button class="btn small" type="button" data-unlist="${esc(p.id)}">${l.unlist}</button>`
                    : `<label>${l.price} <input type="number" min="0.1" step="0.1" inputmode="decimal" value="${marketValue(p)}" data-price></label><button class="btn small" type="button" data-list="${esc(p.id)}">${l.list}</button>`}
                  <button class="btn small" type="button" data-loanout="${esc(p.id)}">${l.loanOut}</button></div>`}
            </div>`;
          })
          .join('')}
      </div>
    </section>`;

  const redraw = (msg = '') => {
    squadUi.msg = msg;
    changed();
  };
  box.querySelectorAll<HTMLButtonElement>('[data-intensity],[data-focus]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = { ...(state.training ?? DEFAULT_TRAINING) };
      if (b.dataset.intensity) t.intensity = b.dataset.intensity as Intensity;
      if (b.dataset.focus) t.focus = b.dataset.focus as Focus;
      state.training = t;
      redraw();
    }),
  );
  box.querySelectorAll<HTMLButtonElement>('[data-line]').forEach((b) =>
    b.addEventListener('click', () => {
      squadUi.line = b.dataset.line as Line | 'all';
      redraw();
    }),
  );
  box.querySelectorAll<HTMLButtonElement>('.prow[data-pid]').forEach((b) =>
    b.addEventListener('click', () => {
      squadUi.open = squadUi.open === b.dataset.pid ? '' : b.dataset.pid!;
      redraw();
    }),
  );
  box.querySelector<HTMLButtonElement>('[data-list]')?.addEventListener('click', (e) => {
    const price = Number(box.querySelector<HTMLInputElement>('[data-price]')!.value);
    if (price > 0) listPlayer(state, (e.currentTarget as HTMLElement).dataset.list!, price);
    redraw();
  });
  box.querySelector<HTMLButtonElement>('[data-unlist]')?.addEventListener('click', (e) => {
    listPlayer(state, (e.currentTarget as HTMLElement).dataset.unlist!, null);
    redraw();
  });
  box.querySelector<HTMLButtonElement>('[data-loanout]')?.addEventListener('click', (e) => {
    const r = loanOut(state, (e.currentTarget as HTMLElement).dataset.loanout!);
    if (r.ok) squadUi.open = '';
    redraw(r.ok ? l.loanedTo(clubById(r.club).name) : l.err[r.reason]);
  });
  box.querySelectorAll<HTMLButtonElement>('[data-accept]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = acceptOffer(state, Number(b.dataset.accept));
      redraw(r.ok ? l.sold(fmtMoney(r.fee)) : l.err[r.reason]);
    }),
  );
  box.querySelectorAll<HTMLButtonElement>('[data-reject]').forEach((b) =>
    b.addEventListener('click', () => {
      rejectOffer(state, Number(b.dataset.reject));
      redraw();
    }),
  );
}

// ───────────────────────────── market tab ──

type SortKey = 'ovr' | 'value' | 'age' | 'pot';
const marketUi = { line: 'all' as Line | 'all', league: 'all', q: '', sort: 'ovr' as SortKey, affordable: false, limit: 30, open: '', msg: '' };

export function renderMarketTab(box: HTMLElement, state: CareerState, changed: () => void): void {
  const l = tr();
  const m = ensureMarket(state);
  const q = marketUi.q.trim().toLowerCase();
  const pool: { p: PlayerData; club: string; value: number }[] = [];
  for (const c of CLUBS) {
    if (c.id === state.clubId) continue;
    if (marketUi.league !== 'all' && leagueOf(c.id) !== marketUi.league) continue;
    for (const p of squadOf(state, c.id)) {
      if (marketUi.line !== 'all' && lineOf(p.position) !== marketUi.line) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      if (m.loans.some((x) => x.playerId === p.id)) continue;
      const value = marketValue(p);
      if (marketUi.affordable && value > m.budget) continue;
      pool.push({ p, club: c.id, value });
    }
  }
  const key: Record<SortKey, (x: (typeof pool)[number]) => number> = {
    ovr: (x) => -rating(x.p), value: (x) => -x.value, age: (x) => x.p.age, pot: (x) => -potential(x.p),
  };
  pool.sort((a, b) => key[marketUi.sort](a) - key[marketUi.sort](b));
  const shown = pool.slice(0, marketUi.limit);
  const mine = squadOf(state, state.clubId);
  const bestAt = (r: Role) => [...mine].sort((a, b) => overall(b.attrs, r) - overall(a.attrs, r))[0];

  const detail = (p: PlayerData) => {
    const best = bestAt(p.position);
    const diff = rating(p) - overall(best.attrs, p.position);
    const willing = willingToJoin(state, p);
    const canLoan = loanable(state, p.id);
    return `<div class="pdetail">
      <div class="cmp"><span class="muted">${l.yourBest}:</span> <b>${esc(best.name)}</b> · <span class="num ${ovrClass(overall(best.attrs, p.position))}">${overall(best.attrs, p.position)}</span>
        <b class="num ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'muted'}">${diff > 0 ? '+' : ''}${diff}</b></div>
      ${attrsHtml(p, best)}
      <div class="muted">${l.asking}: <b>${fmtMoney(askingPrice(state, p.id))}</b> · ${l.demand}: <b>${fmtWage(wageDemand(p))}</b></div>
      ${willing ? '' : `<p class="risk">${l.unwilling}</p>`}
      <div class="deal">
        <label>${l.bidLabel} <input type="number" min="0.1" step="0.1" inputmode="decimal" value="${marketValue(p)}" data-fee></label>
        <button class="btn small primary" type="button" data-bid="${esc(p.id)}" ${willing ? '' : 'disabled'}>${l.makeBid}</button>
        ${canLoan ? `<button class="btn small" type="button" data-loanin="${esc(p.id)}" ${willing ? '' : 'disabled'}>${l.loanBtn(fmtMoney(loanFee(p)))}</button>` : ''}
      </div>
    </div>`;
  };

  const recent = m.log
    .slice(0, 6)
    .map((x) => `<li><b>${esc(x.player)}</b> <span class="muted">${esc(clubById(x.from).short)} → ${esc(clubById(x.to).short)}</span> <span class="num">${x.loan ? l.loanTag : fmtMoney(x.fee)}</span></li>`)
    .join('');

  box.innerHTML = `${financeStrip(state)}
    ${marketUi.msg ? `<p class="deal-msg" role="status">${esc(marketUi.msg)}</p>` : ''}
    <section class="panel pad">
      <div class="card-title"><h3>${l.marketTitle}</h3><span class="muted num">${pool.length}</span></div>
      <p class="muted" style="margin-top:0">${l.marketSub}</p>
      <div class="mfilters">
        ${lineSeg(marketUi.line)}
        <select id="mLeague" aria-label="${l.anyLeague}"><option value="all">${l.anyLeague}</option>${LEAGUES.map((x) => `<option value="${x.id}" ${marketUi.league === x.id ? 'selected' : ''}>${x.flag} ${esc(leagueName(x.id))}</option>`).join('')}</select>
        <select id="mSort" aria-label="${l.sortBy}">${(['ovr', 'value', 'pot', 'age'] as SortKey[])
          .map((k) => `<option value="${k}" ${marketUi.sort === k ? 'selected' : ''}>${l.sortBy}: ${{ ovr: l.ovr, value: l.value, pot: l.pot, age: l.age }[k]}</option>`)
          .join('')}</select>
        <input id="mSearch" type="search" placeholder="${l.search}" value="${esc(marketUi.q)}">
        <label class="check"><input id="mAfford" type="checkbox" ${marketUi.affordable ? 'checked' : ''}> ${l.affordable}</label>
      </div>
      <div class="plist market">
        <div class="prow head"><span></span><span>${l.name}</span><span>${l.pos}</span><span>${l.age}</span><span>${l.ovr}</span><span class="pcol">${l.pot}</span><span>${l.value}</span><span class="wcol">${l.club}</span></div>
        ${shown.length
          ? shown
              .map(({ p, club, value }) => {
                const c = clubById(club);
                const row = playerRow(p, crestHtml(c, 20), '', `<span class="num">${fmtMoney(value)}</span><span class="wcol cell-flex">${crestHtml(c, 18)}<span class="muted">${esc(c.short)}</span></span>`, marketUi.open === p.id);
                return marketUi.open === p.id ? row + detail(p) : row;
              })
              .join('')
          : `<p class="muted">${l.none}</p>`}
      </div>
      ${pool.length > shown.length ? `<button class="btn" type="button" id="mMore" style="margin-top:10px;width:100%">${l.more}</button>` : ''}
    </section>
    ${recent ? `<section class="panel pad"><div class="card-title"><h3>${l.recent}</h3></div><ul class="news">${recent}</ul></section>` : ''}`;

  const redraw = (msg = '') => {
    marketUi.msg = msg;
    changed();
  };
  box.querySelectorAll<HTMLButtonElement>('[data-line]').forEach((b) =>
    b.addEventListener('click', () => {
      marketUi.line = b.dataset.line as Line | 'all';
      marketUi.limit = 30;
      redraw();
    }),
  );
  box.querySelector<HTMLSelectElement>('#mLeague')!.addEventListener('change', (e) => {
    marketUi.league = (e.target as HTMLSelectElement).value;
    marketUi.limit = 30;
    redraw();
  });
  box.querySelector<HTMLSelectElement>('#mSort')!.addEventListener('change', (e) => {
    marketUi.sort = (e.target as HTMLSelectElement).value as SortKey;
    redraw();
  });
  const search = box.querySelector<HTMLInputElement>('#mSearch')!;
  let timer = 0;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      marketUi.q = search.value;
      marketUi.limit = 30;
      redraw();
      const again = box.querySelector<HTMLInputElement>('#mSearch');
      again?.focus();
      again?.setSelectionRange(again.value.length, again.value.length);
    }, 250);
  });
  box.querySelector<HTMLInputElement>('#mAfford')!.addEventListener('change', (e) => {
    marketUi.affordable = (e.target as HTMLInputElement).checked;
    redraw();
  });
  box.querySelector('#mMore')?.addEventListener('click', () => {
    marketUi.limit += 30;
    redraw();
  });
  box.querySelectorAll<HTMLButtonElement>('.prow[data-pid]').forEach((b) =>
    b.addEventListener('click', () => {
      marketUi.open = marketUi.open === b.dataset.pid ? '' : b.dataset.pid!;
      redraw();
    }),
  );
  box.querySelector<HTMLButtonElement>('[data-bid]')?.addEventListener('click', (e) => {
    const fee = Number(box.querySelector<HTMLInputElement>('[data-fee]')!.value);
    const r = bid(state, (e.currentTarget as HTMLElement).dataset.bid!, fee);
    if (r.ok) marketUi.open = '';
    redraw(r.ok ? l.done(fmtMoney(r.fee)) : r.counter ? l.counter(fmtMoney(r.counter)) : l.err[r.reason]);
  });
  box.querySelector<HTMLButtonElement>('[data-loanin]')?.addEventListener('click', (e) => {
    const r = loanIn(state, (e.currentTarget as HTMLElement).dataset.loanin!);
    if (r.ok) marketUi.open = '';
    redraw(r.ok ? l.loanDone : l.err[r.reason]);
  });
}
