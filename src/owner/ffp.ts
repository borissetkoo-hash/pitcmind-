import { boardTarget } from '../career/career';
import { ensureMarket, findPlayer, marketValue, setSquad, squadOf } from '../career/market';
import { CLUB_SEEDS } from '../data/clubSeeds';
import { clubById } from '../data/clubs';
import { FORMATIONS } from '../engine/formations';
import { Rng, hashString } from '../engine/rng';
import { pickLineup } from '../engine/team';
import { type EventDef, opt, registerEvents } from './events';
import { type OwnerState, annualCosts, book, money, ownerNews, round1 } from './owner';

/**
 * Financial fair play — and the optional grey schemes for getting round it.
 *
 * The rule: over three seasons a club may lose at most 30 % of its market size on football
 * business (owner cash injections don't count as income; transfer fees are spread over three
 * seasons). A club that breaks it gets a settlement from UEFA: a fine and, for big breaches,
 * a registration ban.
 *
 * The grey schemes are fictional game mechanics, generalised from the kinds of allegations that
 * have been made against clubs over the years — not a statement about any real club. Each one
 * makes the books look better than they are and leaves evidence ("hidden" money) and suspicion
 * ("heat"). Every season end UEFA may open an investigation; a season later comes the verdict:
 * a fine, a points deduction, a registration ban, a European ban — or an appeal to CAS.
 * Nothing forces the player to use them.
 */

export type OffshoreShare = 0 | 0.1 | 0.2 | 0.3;

export interface Sanctions {
  fine: number;
  points: number;
  transferBan: boolean;
  euroBanSeasons: number;
  /** What the case was about, for the verdict text. */
  hidden: number;
  breach: number;
  plainBreach: boolean;
}

export interface Compliance {
  /** Inflated sponsorship from a company close to the owner, €M a season (paid from the owner's pocket). */
  affiliate: number;
  /** Share of wages paid off the books through third-party companies. */
  offshore: OffshoreShare;
  /** Stadium sold to the owner's own company (once): annual rent the club pays back. */
  leasebackRent: number;
  leasebackDone: boolean;
  /** Concealed money the investigators could find, €M. */
  hidden: number;
  /** 0–100: how much UEFA and the press suspect. */
  heat: number;
  /** FFP result per season (football income − football costs, transfers amortised). */
  results: { season: number; result: number }[];
  /** Transfer fees still being written off: amount per season and seasons left. */
  amort: { perSeason: number; left: number }[];
  /** Qualified for European football this season (and its income). */
  europe: boolean;
  euroBanUntil: number;
  /** Season in which an investigation was opened, or null. */
  investigation: number | null;
  /** A verdict waiting for the owner's response at the start of the next season. */
  verdict: Sanctions | null;
  history: { season: number; ru: string; en: string }[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const FFP_LIMIT = 0.3;
const EURO_SHARE = 0.14;

export function euroSpots(state: OwnerState): number {
  return state.league.clubs.length >= 10 ? 3 : 2;
}

/** Adds compliance to older owner saves; a club that "finished" in the European places starts qualified. */
export function ensureCompliance(state: OwnerState): Compliance {
  const o = state.owner;
  for (const k of ['europe', 'affiliate'] as const) o.ledger[k] ??= 0;
  o.compliance ??= {
    affiliate: 0, offshore: 0, leasebackRent: 0, leasebackDone: false, hidden: 0, heat: 0, results: [], amort: [],
    europe: boardTarget(state.clubId, state.league.clubs) <= euroSpots(state), euroBanUntil: 0, investigation: null, verdict: null, history: [],
  };
  return o.compliance;
}

/** What a related-party sponsor deal is plausibly worth: anything above it is inflation. */
export const fairAffiliate = (state: OwnerState) => round1(0.05 * state.owner.size * (state.owner.brand / state.owner.brand0) ** 1.3);

const addHeat = (c: Compliance, hidden: number, size: number, k = 60) => {
  c.hidden = round1(c.hidden + hidden);
  c.heat = clamp(c.heat + (hidden / size) * k, 0, 100);
};

// ───────────────────────────── per round ──

/** Runs after the club's ordinary books for a round: European income and the schemes' cash flows. */
export function complianceRound(state: OwnerState, round: number): void {
  const o = state.owner;
  const c = ensureCompliance(state);
  const R = Math.max(...state.league.fixtures.map((f) => f.round));
  if (c.europe && c.euroBanUntil < state.season) {
    const e = (o.size * EURO_SHARE) / R;
    book(o, 'europe', e);
    o.cash = round1(o.cash + e);
  }
  if (c.affiliate > 0) {
    const pay = c.affiliate / R;
    if (pay > o.wealth) {
      c.affiliate = 0;
      ownerNews(state, 'Связанный спонсор прекратил платежи: у владельца кончились личные средства.', 'The related-party sponsor stops paying: the owner has run out of money.');
    } else {
      o.wealth = round1(o.wealth - pay);
      o.cash = round1(o.cash + pay);
      book(o, 'affiliate', pay);
      addHeat(c, Math.max(0, c.affiliate - fairAffiliate(state)) / R, o.size);
    }
  }
  if (c.offshore > 0) {
    // Part of the wage bill is paid from the owner's pocket and kept out of the club's books.
    const hiddenWages = (annualCosts(state).wages * c.offshore) / R;
    if (hiddenWages > o.wealth) {
      c.offshore = 0;
    } else {
      o.wealth = round1(o.wealth - hiddenWages);
      o.cash = round1(o.cash + hiddenWages);
      book(o, 'wages', -hiddenWages);
      addHeat(c, hiddenWages, o.size, 70);
    }
  }
  if (c.leasebackRent > 0) {
    book(o, 'operations', c.leasebackRent / R);
    o.cash = round1(o.cash - c.leasebackRent / R);
  }
  // Suspicion fades slowly while nothing new happens.
  if (!c.affiliate && !c.offshore) c.heat = clamp(c.heat - 0.6, 0, 100);
  void round;
}

// ───────────────────────────── one-off schemes ──

export type SchemeResult = { ok: true; amount: number } | { ok: false; reason: 'money' | 'done' | 'player' };

/** Sells the stadium to a company the owner controls, at an inflated price; the club rents it back. */
export function leaseback(state: OwnerState): SchemeResult {
  const o = state.owner;
  const c = ensureCompliance(state);
  if (c.leasebackDone) return { ok: false, reason: 'done' };
  const fair = o.size * 0.25 * (o.facilities.stadium / 3);
  const price = round1(fair * 1.8);
  if (price > o.wealth) return { ok: false, reason: 'money' };
  o.wealth = round1(o.wealth - price);
  o.cash = round1(o.cash + price);
  book(o, 'affiliate', price);
  c.leasebackDone = true;
  c.leasebackRent = round1(price * 0.05);
  addHeat(c, price - fair, o.size, 45);
  ownerNews(state, `Стадион продан компании, близкой к владельцу, за ${money(price)}; клуб будет его арендовать.`, `The stadium is sold to a company close to the owner for ${money(price)}; the club will rent it back.`);
  return { ok: true, amount: price };
}

/** A friendly club "buys" a fringe player for triple his value; the owner quietly covers most of it. */
export function inflatedSale(state: OwnerState, playerId: string): SchemeResult {
  const o = state.owner;
  const c = ensureCompliance(state);
  const found = findPlayer(state, playerId);
  if (!found || found.clubId !== state.clubId || squadOf(state, state.clubId).length <= 16) return { ok: false, reason: 'player' };
  const { player } = found;
  const fee = round1(Math.max(1, marketValue(player) * 3));
  const covered = round1(fee * 0.7);
  if (covered > o.wealth) return { ok: false, reason: 'money' };
  const rng = new Rng(hashString(`friend-${state.seed}-${state.season}-${playerId}`));
  const friends = CLUB_SEEDS.filter((s) => s.league !== state.league.leagueId).map((s) => s.id);
  const buyer = rng.pick(friends);
  o.wealth = round1(o.wealth - covered);
  const m = ensureMarket(state);
  m.budget = round1(m.budget + fee);
  setSquad(state, state.clubId, squadOf(state, state.clubId).filter((p) => p.id !== playerId));
  setSquad(state, buyer, [...squadOf(state, buyer), player]);
  m.log.unshift({ season: state.season, player: player.name, from: state.clubId, to: buyer, fee });
  addHeat(c, fee - marketValue(player), o.size, 50);
  ownerNews(state, `${player.name} неожиданно продан в «${clubById(buyer).name}» за ${money(fee)}.`, `${player.name} is surprisingly sold to ${clubById(buyer).name} for ${money(fee)}.`);
  return { ok: true, amount: fee };
}

/** Players the friendly-club scheme can use: outside the likely XI. */
export function fringePlayers(state: OwnerState) {
  const squad = squadOf(state, state.clubId);
  const xi = new Set(pickLineup(squad, FORMATIONS[state.tactics.formation]).lineup.map((p) => p.id));
  return squad.filter((p) => !xi.has(p.id)).sort((a, b) => marketValue(b) - marketValue(a));
}

// ───────────────────────────── season end ──

/** Football business this season as UEFA counts it. */
export function ffpResult(state: OwnerState): { result: number; sales: number; amortisation: number } {
  const o = state.owner;
  const c = ensureCompliance(state);
  const m = ensureMarket(state);
  const mine = m.log.filter((x) => x.season === state.season && !x.loan);
  const sales = mine.filter((x) => x.from === state.clubId).reduce((s, x) => s + x.fee, 0);
  const buys = mine.filter((x) => x.to === state.clubId).reduce((s, x) => s + x.fee, 0);
  const amortisation = c.amort.reduce((s, a) => s + a.perSeason, 0) + buys / 3;
  const income = ['matchday', 'commercial', 'sponsor', 'broadcast', 'prize', 'europe', 'affiliate'].reduce((s, k) => s + (o.ledger[k as keyof typeof o.ledger] ?? 0), 0);
  const costs = ['wages', 'staff', 'interest', 'maintenance', 'operations'].reduce((s, k) => s + (o.ledger[k as keyof typeof o.ledger] ?? 0), 0);
  return { result: round1(income - costs + o.ledger.other + sales - amortisation), sales: round1(sales), amortisation: round1(amortisation) };
}

/** Sum of the last three FFP results (this one included) and how far past the limit that is. */
export function ffpStatus(state: OwnerState, current = ffpResult(state).result) {
  const c = ensureCompliance(state);
  const past = c.results.filter((r) => r.season >= state.season - 2 && r.season < state.season).reduce((s, r) => s + r.result, 0);
  const total = round1(past + current);
  const limit = round1(-FFP_LIMIT * state.owner.size);
  return { total, limit, breach: round1(Math.max(0, limit - total)) };
}

export interface ComplianceSummary {
  result: number;
  total: number;
  limit: number;
  breach: number;
  europe: boolean;
  investigationOpened: boolean;
  verdictComing: boolean;
}

/** Closes the season's books for UEFA: FFP result, European qualification, investigations. */
export function complianceSeasonEnd(state: OwnerState, position: number): ComplianceSummary {
  const o = state.owner;
  const c = ensureCompliance(state);
  const m = ensureMarket(state);
  const { result } = ffpResult(state);
  const { total, limit, breach } = ffpStatus(state, result);
  c.results.push({ season: state.season, result });
  c.results = c.results.slice(-6);
  // This season's signings start being written off.
  const buys = m.log.filter((x) => x.season === state.season && !x.loan && x.to === state.clubId).reduce((s, x) => s + x.fee, 0);
  c.amort = c.amort.map((a) => ({ ...a, left: a.left - 1 })).filter((a) => a.left > 0);
  if (buys) c.amort.push({ perSeason: round1(buys / 3), left: 2 });

  const rng = new Rng(hashString(`uefa-${state.seed}-${state.season}`));
  let investigationOpened = false;
  let verdictComing = false;
  const fd = o.staff.fd?.rating ?? 6;
  if (c.investigation !== null) {
    // A year of investigation is over: the verdict.
    c.verdict = sanctionsFor(o.size, c.hidden, breach, false);
    c.investigation = null;
    verdictComing = true;
  } else if (c.hidden > 0) {
    const p = clamp((c.heat / 100) * 0.75 + (breach > 0 ? 0.3 : 0), 0, 0.9) * (1 - (fd - 10) * 0.025);
    if (rng.chance(p)) {
      c.investigation = state.season;
      investigationOpened = true;
      c.heat = clamp(c.heat + 15, 0, 100);
      ownerNews(state, 'УЕФА открывает расследование в отношении финансов клуба.', 'UEFA opens an investigation into the club’s finances.');
      c.history.unshift({ season: state.season, ru: 'Открыто расследование УЕФА', en: 'UEFA investigation opened' });
    }
  }
  if (!c.verdict && c.investigation === null && breach > 0) {
    // An honest overspend: a settlement agreement rather than a case.
    c.verdict = sanctionsFor(o.size, 0, breach, true);
    verdictComing = true;
  }
  const qualified = position <= euroSpots(state);
  c.europe = qualified;
  if (qualified && c.euroBanUntil <= state.season) ownerNews(state, 'Клуб квалифицировался в еврокубки: дополнительный доход в следующем сезоне.', 'The club has qualified for Europe: extra income next season.');
  return { result, total, limit, breach, europe: qualified, investigationOpened, verdictComing };
}

/** The punishment fits the money concealed and the size of the breach. */
export function sanctionsFor(size: number, hidden: number, breach: number, plainBreach: boolean): Sanctions {
  const s = (hidden + breach) / size;
  if (plainBreach) {
    return { fine: round1(0.02 * size + 0.3 * breach), points: 0, transferBan: breach > 0.3 * size, euroBanSeasons: 0, hidden, breach, plainBreach };
  }
  return {
    fine: round1(0.04 * size + 0.6 * hidden + 0.4 * breach),
    points: s > 0.35 ? Math.round(clamp(6 + 12 * s, 6, 30)) : 0,
    transferBan: s > 0.25,
    euroBanSeasons: s > 0.6 ? 2 : s > 0.3 ? 1 : 0,
    hidden, breach, plainBreach,
  };
}

/** Applies a sanction at the start of the season after the verdict. */
export function applySanctions(state: OwnerState, x: Sanctions): void {
  const o = state.owner;
  const c = ensureCompliance(state);
  if (x.fine) {
    o.cash = round1(o.cash - x.fine);
    book(o, 'other', -x.fine);
  }
  if (x.points) {
    state.league.penalties ??= {};
    state.league.penalties[state.clubId] = (state.league.penalties[state.clubId] ?? 0) + x.points;
  }
  if (x.transferBan) ensureMarket(state).banUntil = state.season;
  if (x.euroBanSeasons) {
    c.euroBanUntil = state.season + x.euroBanSeasons - 1;
    c.europe = false;
  }
  o.brand = clamp(o.brand - (x.plainBreach ? 1 : 4 + x.euroBanSeasons * 2), 10, 99);
  o.reputation = clamp(o.reputation - (x.plainBreach ? 2 : 8), 0, 100);
  c.hidden = x.plainBreach ? c.hidden : 0;
  c.heat = x.plainBreach ? c.heat : clamp(c.heat * 0.5, 0, 100);
  const parts = sanctionText(x);
  ownerNews(state, `Санкции УЕФА: ${parts.ru}.`, `UEFA sanctions: ${parts.en}.`);
  c.history.unshift({ season: state.season, ru: `Санкции: ${parts.ru}`, en: `Sanctions: ${parts.en}` });
}

export function sanctionText(x: Sanctions): { ru: string; en: string } {
  const ru: string[] = [];
  const en: string[] = [];
  if (x.fine) {
    ru.push(`штраф ${money(x.fine)}`);
    en.push(`a ${money(x.fine)} fine`);
  }
  if (x.points) {
    ru.push(`−${x.points} очков`);
    en.push(`a ${x.points}-point deduction`);
  }
  if (x.transferBan) {
    ru.push('запрет на регистрацию игроков на сезон');
    en.push('a one-season registration ban');
  }
  if (x.euroBanSeasons) {
    ru.push(`отстранение от еврокубков на ${x.euroBanSeasons} ${x.euroBanSeasons === 1 ? 'сезон' : 'сезона'}`);
    en.push(`a ${x.euroBanSeasons}-season European ban`);
  }
  return { ru: ru.join(', ') || 'предупреждение', en: en.join(', ') || 'a warning' };
}

/** At the start of the next season a pending verdict becomes a boardroom decision. */
export function complianceSeasonStart(state: OwnerState): void {
  const c = ensureCompliance(state);
  if (!c.verdict) return;
  const x = c.verdict;
  const t = sanctionText(x);
  const size = state.owner.size;
  state.owner.decision = {
    kind: 'uefaVerdict', round: 0, data: {},
    titleRu: x.plainBreach ? 'УЕФА: нарушение финансового фэйр-плей' : 'Вердикт УЕФА по делу клуба',
    titleEn: x.plainBreach ? 'UEFA: financial fair play breach' : 'UEFA verdict in the club’s case',
    textRu: x.plainBreach
      ? `Клуб превысил допустимые убытки за три сезона на ${money(x.breach)}. УЕФА предлагает мировое соглашение: ${t.ru}.`
      : `Комитет финансового контроля установил скрытые платежи на ${money(x.hidden)}${x.breach ? ` и превышение убытков на ${money(x.breach)}` : ''}. Санкции: ${t.ru}.`,
    textEn: x.plainBreach
      ? `The club exceeded the three-season loss limit by ${money(x.breach)}. UEFA offers a settlement: ${t.en}.`
      : `The financial control body found concealed payments of ${money(x.hidden)}${x.breach ? ` and losses ${money(x.breach)} over the limit` : ''}. Sanctions: ${t.en}.`,
    options: [
      opt('a', 'Принять санкции', 'Accept the sanctions', 'Санкции вступают в силу сразу.', 'The sanctions take effect at once.'),
      opt('b', 'Подать апелляцию в CAS', 'Appeal to CAS', `Юристы: −${money(size * 0.02)}. Шанс ~45%: баны и снятие очков отменят, штраф уменьшат вдвое. Иначе — всё в силе.`, `Lawyers: −${money(size * 0.02)}. ~45% chance: bans and deduction overturned, fine halved. Otherwise everything stands.`, x.plainBreach),
      opt('c', 'Сотрудничать со следствием', 'Cooperate with the investigators', 'Санкции мягче на 40%, но все схемы закрываются, бренд страдает.', 'Sanctions 40% lighter, but every scheme is shut down and the brand suffers.', x.plainBreach),
    ],
  };
}

const VERDICT: EventDef = {
  kind: 'uefaVerdict',
  weight: 0,
  when: () => false,
  make: () => null,
  resolve(s, _d, o, rng) {
    const c = ensureCompliance(s);
    const x = c.verdict;
    if (!x) return;
    c.verdict = null;
    if (o === 'a') return applySanctions(s, x);
    if (o === 'c') {
      c.affiliate = 0;
      c.offshore = 0;
      s.owner.brand = clamp(s.owner.brand - 3, 10, 99);
      return applySanctions(s, { ...x, fine: round1(x.fine * 0.6), points: Math.round(x.points * 0.6), euroBanSeasons: Math.max(0, x.euroBanSeasons - 1), transferBan: x.transferBan && x.points > 12 });
    }
    const fees = round1(s.owner.size * 0.02);
    s.owner.cash = round1(s.owner.cash - fees);
    book(s.owner, 'other', -fees);
    const fd = s.owner.staff.fd?.rating ?? 6;
    if (rng.chance(clamp(0.45 + (fd - 10) * 0.02, 0.2, 0.65))) {
      ownerNews(s, 'CAS частично удовлетворил апелляцию: баны отменены, штраф снижен.', 'CAS partly upholds the appeal: bans lifted, fine reduced.');
      applySanctions(s, { ...x, fine: round1(x.fine / 2), points: 0, transferBan: false, euroBanSeasons: 0 });
    } else {
      ownerNews(s, 'CAS отклонил апелляцию клуба.', 'CAS dismisses the club’s appeal.');
      applySanctions(s, x);
    }
  },
};

const LEAK: EventDef = {
  kind: 'financeLeak',
  weight: 6,
  when: (s) => (s.owner.compliance?.heat ?? 0) >= 30 && (s.owner.compliance?.hidden ?? 0) > 0,
  make(s) {
    const c = ensureCompliance(s);
    const hush = round1(s.owner.size * 0.03);
    return {
      kind: 'financeLeak', round: 0, data: { hush },
      titleRu: 'Утечка документов', titleEn: 'Leaked documents',
      textRu: `Журналисты получили внутреннюю переписку клуба о платежах через третьи компании (подозрения: ${Math.round(c.heat)}/100). Публикация выйдет через неделю.`,
      textEn: `Journalists have obtained internal club emails about payments through third parties (suspicion: ${Math.round(c.heat)}/100). The story runs next week.`,
      options: [
        opt('a', 'Всё отрицать', 'Deny everything', 'Подозрения растут; если дело откроют, будет тяжелее.', 'Suspicion grows; if a case opens it will be worse.'),
        opt('b', 'Тихо свернуть схемы', 'Quietly wind the schemes down', 'Схемы закрыты, подозрения снижаются.', 'Schemes closed, suspicion falls.'),
        opt('c', 'Выкупить источник', 'Pay off the source', `−${money(hush)} личных денег. Подозрения резко падают, но доказательств становится больше.`, `−${money(hush)} of your own money. Suspicion drops sharply, but the evidence grows.`, s.owner.wealth < hush),
      ],
    };
  },
  resolve(s, d, o) {
    const c = ensureCompliance(s);
    if (o === 'a') {
      c.heat = clamp(c.heat + 12, 0, 100);
      s.owner.fanMood = clamp(s.owner.fanMood + 2, 0, 100);
    } else if (o === 'b') {
      c.affiliate = 0;
      c.offshore = 0;
      c.heat = clamp(c.heat - 15, 0, 100);
    } else {
      const hush = Number(d.data.hush);
      s.owner.wealth = round1(s.owner.wealth - hush);
      c.heat = clamp(c.heat - 25, 0, 100);
      c.hidden = round1(c.hidden + hush);
    }
  },
};

registerEvents([VERDICT, LEAK]);

/** Owner sets the related-party sponsorship (0 = none). */
export function setAffiliate(state: OwnerState, amount: number): void {
  const c = ensureCompliance(state);
  c.affiliate = round1(clamp(amount, 0, state.owner.size));
  if (c.affiliate) ownerNews(state, `Новый спонсор — компания из окружения владельца: ${money(c.affiliate)} в сезон.`, `New sponsor: a company close to the owner, ${money(c.affiliate)} a season.`);
}

export function setOffshore(state: OwnerState, share: OffshoreShare): void {
  ensureCompliance(state).offshore = share;
}


