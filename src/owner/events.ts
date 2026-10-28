import { boardTarget } from '../career/career';
import { academyPlayer, clubById, CLUBS, SQUAD } from '../data/clubs';
import { coachById } from '../data/coaches';
import {
  bid, clubLevel, ensureMarket, findPlayer, listPlayer, marketValue, rating, setSquad, squadOf, transferWindow, wageOf,
} from '../career/market';
import { Rng, hashString } from '../engine/rng';
import {
  type Decision, type DecisionOption, type OwnerState, clubValuation, currentPosition, fireCoach, money, ownerNews, round1,
} from './owner';

/**
 * Boardroom decisions. Each event is triggered by the club's actual situation (a losing run,
 * an unhappy coach, debt, a bid for the best player…) and every option has lasting effects on
 * money, the coach's trust, the fans, the brand or the squad — the consequences are systemic,
 * not a one-off number.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface EventDef {
  kind: string;
  /** Relative weight when several events are possible. */
  weight: number;
  when(state: OwnerState): boolean;
  make(state: OwnerState, rng: Rng): Decision | null;
  resolve(state: OwnerState, d: Decision, option: 'a' | 'b' | 'c', rng: Rng): void;
}

const opt = (id: DecisionOption['id'], ru: string, en: string, hintRu: string, hintEn: string, disabled = false): DecisionOption => ({ id, ru, en, hintRu, hintEn, disabled });

function form(state: OwnerState, n = 5): number[] {
  return state.league.fixtures
    .filter((f) => f.result && (f.home === state.clubId || f.away === state.clubId))
    .sort((a, b) => a.round - b.round)
    .slice(-n)
    .map((f) => {
      const mine = f.home === state.clubId ? 0 : 1;
      const d = f.result!.score[mine] - f.result!.score[1 - mine];
      return Math.sign(d);
    });
}

const losses = (state: OwnerState, n = 5) => form(state, n).filter((x) => x < 0).length;

function starPlayer(state: OwnerState) {
  const squad = squadOf(state, state.clubId);
  return squad.reduce((a, b) => (marketValue(a) > marketValue(b) ? a : b));
}

/** A club rich and strong enough to bid for the user's best player. */
function suitor(state: OwnerState, rng: Rng): string {
  const rich = CLUBS.filter((c) => c.id !== state.clubId && clubLevel(state, c.id) >= clubLevel(state, state.clubId) - 2);
  const pool = rich.length ? rich : CLUBS.filter((c) => c.id !== state.clubId);
  return rng.pick(pool).id;
}

const EVENTS: EventDef[] = [
  {
    kind: 'coachMoney',
    weight: 3,
    when: (s) => !!s.owner.coach && s.owner.coach.given < s.owner.coach.demand * 0.5 && transferWindow(s).open && s.owner.coach.trust < 75,
    make(s) {
      const c = s.owner.coach!;
      const ask = round1(Math.max(1, c.demand - c.given));
      const coach = coachById(c.id)!;
      return {
        kind: 'coachMoney', round: 0, data: { ask },
        titleRu: 'Тренер требует денег на трансферы', titleEn: 'The coach wants transfer money',
        textRu: `${coach.nameRu} говорит, что без усиления состав не выполнит задачу. Он просит ${money(ask)} на трансферы.`,
        textEn: `${coach.name} says the squad won't meet its target without reinforcements. He asks for ${money(ask)} for transfers.`,
        options: [
          opt('a', 'Дать деньги', 'Give him the money', `Из кассы клуба в трансферный бюджет: −${money(ask)}. Доверие тренера растёт.`, `${money(ask)} from the club's accounts to the transfer budget. Coach trust rises.`, s.owner.cash < ask),
          opt('b', 'Отказать', 'Refuse', 'Деньги остаются в клубе, но тренер теряет доверие.', 'The money stays in the bank, but the coach loses faith.'),
          opt('c', 'Уволить тренера', 'Sack the coach', `Компенсация ≈ ${money(c.wage * Math.max(0.5, c.years))}. Нужно будет сразу найти нового.`, `Compensation ≈ ${money(c.wage * Math.max(0.5, c.years))}. You must hire a replacement right away.`),
        ],
      };
    },
    resolve(s, d, o) {
      const c = s.owner.coach!;
      const ask = Number(d.data.ask);
      if (o === 'a') {
        s.owner.cash = round1(s.owner.cash - ask);
        const m = ensureMarket(s);
        m.budget = round1(m.budget + ask);
        c.given = round1(c.given + ask);
        c.trust = clamp(c.trust + 18, 0, 100);
      } else if (o === 'b') {
        c.trust = clamp(c.trust - 18, 0, 100);
        s.owner.fanMood = clamp(s.owner.fanMood - 3, 0, 100);
      } else fireCoach(s);
    },
  },
  {
    kind: 'fanProtest',
    weight: 4,
    when: (s) => s.owner.fanMood < 35 || losses(s) >= 3,
    make(s) {
      return {
        kind: 'fanProtest', round: 0, data: {},
        titleRu: 'Протест болельщиков', titleEn: 'Fan protest',
        textRu: 'После серии неудач фанаты вывесили баннеры против руководства и требуют перемен. Пресса ждёт реакции владельца.',
        textEn: 'After a poor run the fans have unfurled banners against the board and demand change. The press wants the owner’s response.',
        options: [
          opt('a', 'Снизить цены на билеты', 'Cut ticket prices', 'Настроение болельщиков заметно растёт, доход от билетов падает.', 'The mood lifts markedly; matchday income falls.'),
          opt('b', 'Публично поддержать тренера', 'Back the coach publicly', 'Тренер ценит поддержку, но фанаты недовольны.', 'The coach appreciates it; the fans don’t.'),
          opt('c', 'Уволить тренера', 'Sack the coach', 'Фанаты получают перемены, клуб — расходы и нового тренера.', 'The fans get their change; the club gets a bill and a new coach.', !s.owner.coach),
        ],
      };
    },
    resolve(s, _d, o) {
      if (o === 'a') {
        s.owner.tickets = 'low';
        s.owner.fanMood = clamp(s.owner.fanMood + 14, 0, 100);
      } else if (o === 'b') {
        if (s.owner.coach) s.owner.coach.trust = clamp(s.owner.coach.trust + 12, 0, 100);
        s.owner.fanMood = clamp(s.owner.fanMood - 6, 0, 100);
      } else {
        fireCoach(s);
        s.owner.fanMood = clamp(s.owner.fanMood + 10, 0, 100);
      }
    },
  },
  {
    kind: 'bigOffer',
    weight: 3,
    when: (s) => transferWindow(s).open && squadOf(s, s.clubId).length > 16,
    make(s, rng) {
      const p = starPlayer(s);
      const club = suitor(s, rng);
      const fee = round1(marketValue(p) * (1.4 + rng.next() * 0.3));
      return {
        kind: 'bigOffer', round: 0, data: { player: p.id, club, fee },
        titleRu: `Рекордное предложение за ${p.name}`, titleEn: `Record bid for ${p.name}`,
        textRu: `«${clubById(club).name}» предлагает ${money(fee)} за лучшего игрока команды (стоимость ${money(marketValue(p))}).`,
        textEn: `${clubById(club).name} offer ${money(fee)} for the team’s best player (valued at ${money(marketValue(p))}).`,
        options: [
          opt('a', 'Продать', 'Sell', `+${money(fee)} в трансферный бюджет. Болельщики и тренер расстроены.`, `+${money(fee)} to the transfer budget. Fans and coach are upset.`),
          opt('b', 'Отказать', 'Refuse', 'Звезда остаётся, фанаты довольны.', 'The star stays; the fans approve.'),
          opt('c', 'Потребовать больше', 'Hold out for more', 'Шанс получить ещё +15% — или предложение отзовут.', 'A chance of +15% more — or the bid is withdrawn.'),
        ],
      };
    },
    resolve(s, d, o, rng) {
      const pid = String(d.data.player);
      const fee = Number(d.data.fee);
      const sell = (amount: number) => {
        const found = findPlayer(s, pid);
        if (!found || found.clubId !== s.clubId) return;
        const m = ensureMarket(s);
        const { player } = found;
        m.budget = round1(m.budget + amount);
        m.offers = m.offers.filter((x) => x.playerId !== pid);
        const src = squadOf(s, s.clubId).filter((x) => x.id !== pid);
        setSquad(s, s.clubId, src);
        const dst = squadOf(s, String(d.data.club));
        setSquad(s, String(d.data.club), [...dst, player]);
        m.log.unshift({ season: s.season, player: player.name, from: s.clubId, to: String(d.data.club), fee: amount });
        ownerNews(s, `${player.name} продан в «${clubById(String(d.data.club)).name}» за ${money(amount)}.`, `${player.name} sold to ${clubById(String(d.data.club)).name} for ${money(amount)}.`);
        s.owner.fanMood = clamp(s.owner.fanMood - 10, 0, 100);
        if (s.owner.coach) s.owner.coach.trust = clamp(s.owner.coach.trust - 8, 0, 100);
        s.owner.brand = clamp(s.owner.brand - 1, 10, 99);
      };
      if (o === 'a') sell(fee);
      else if (o === 'b') s.owner.fanMood = clamp(s.owner.fanMood + 5, 0, 100);
      else if (rng.chance(0.5)) sell(round1(fee * 1.15));
      else ownerNews(s, 'Покупатель отозвал предложение — игрок остаётся.', 'The buyer walks away — the player stays.');
    },
  },
  {
    kind: 'starUnhappy',
    weight: 2,
    when: (s) => s.season > 1 || (s.owner.finRound ?? 0) > 4,
    make(s) {
      const p = starPlayer(s);
      const bonus = round1(wageOf(p) * 52 / 1000 * 0.5);
      return {
        kind: 'starUnhappy', round: 0, data: { player: p.id, bonus },
        titleRu: `${p.name} недоволен контрактом`, titleEn: `${p.name} wants a new deal`,
        textRu: `Агент лидера команды намекает на интерес других клубов и требует улучшить условия.`,
        textEn: `The team leader’s agent hints at interest from other clubs and wants better terms.`,
        options: [
          opt('a', 'Выплатить бонус лояльности', 'Pay a loyalty bonus', `−${money(bonus)} из кассы. Игрок и болельщики довольны.`, `−${money(bonus)} from the accounts. Player and fans are happy.`, s.owner.cash < bonus),
          opt('b', 'Отказать', 'Refuse', 'Экономия, но игрок может попроситься на трансфер.', 'Money saved, but he may ask to leave.'),
          opt('c', 'Выставить на трансфер', 'Put him up for sale', 'Сигнал всем: незаменимых нет. Болельщики против.', 'A signal that nobody is bigger than the club. The fans disagree.'),
        ],
      };
    },
    resolve(s, d, o, rng) {
      const pid = String(d.data.player);
      if (o === 'a') {
        s.owner.cash = round1(s.owner.cash - Number(d.data.bonus));
        s.owner.ledger.other = round1(s.owner.ledger.other - Number(d.data.bonus));
        s.owner.fanMood = clamp(s.owner.fanMood + 3, 0, 100);
      } else if (o === 'b') {
        if (rng.chance(0.5)) {
          const p = findPlayer(s, pid)?.player;
          if (p) listPlayer(s, pid, marketValue(p));
          ownerNews(s, 'Обиженный игрок попросил выставить его на трансфер.', 'The disgruntled player has handed in a transfer request.');
        }
        if (s.owner.coach) s.owner.coach.trust = clamp(s.owner.coach.trust - 5, 0, 100);
      } else {
        const p = findPlayer(s, pid)?.player;
        if (p) listPlayer(s, pid, round1(marketValue(p) * 1.1));
        s.owner.fanMood = clamp(s.owner.fanMood - 8, 0, 100);
      }
    },
  },
  {
    kind: 'stakeOffer',
    weight: 1,
    when: (s) => s.owner.share > 0.5,
    make(s, rng) {
      const pct = 20;
      const price = round1(clubValuation(s) * 0.2 * (1.05 + rng.next() * 0.15));
      return {
        kind: 'stakeOffer', round: 0, data: { price },
        titleRu: 'Инвестор хочет войти в клуб', titleEn: 'An investor wants in',
        textRu: `Инвестиционный фонд предлагает ${money(price)} за ${pct}% акций. Деньги пойдут в кассу клуба, но ваша доля уменьшится.`,
        textEn: `An investment fund offers ${money(price)} for ${pct}% of the club. The money goes to the club, but your stake shrinks.`,
        options: [
          opt('a', 'Продать 20%', 'Sell 20%', `+${money(price)} в кассу клуба, ваша доля −20%.`, `+${money(price)} to the club, your stake −20%.`),
          opt('b', 'Отказать', 'Decline', 'Клуб остаётся полностью вашим.', 'The club stays entirely yours.'),
          opt('c', 'Продать 10%', 'Sell 10%', `+${money(price / 2)} в кассу, доля −10%.`, `+${money(price / 2)} to the club, stake −10%.`),
        ],
      };
    },
    resolve(s, d, o) {
      const price = Number(d.data.price);
      if (o === 'a' || o === 'c') {
        const part = o === 'a' ? 1 : 0.5;
        s.owner.cash = round1(s.owner.cash + price * part);
        s.owner.share = round1(s.owner.share - 0.2 * part);
        ownerNews(s, `Фонд выкупил ${o === 'a' ? 20 : 10}% клуба за ${money(price * part)}.`, `A fund buys ${o === 'a' ? 20 : 10}% of the club for ${money(price * part)}.`);
      }
    },
  },
  {
    kind: 'naming',
    weight: 1,
    when: (s) => !s.owner.naming && s.owner.facilities.stadium >= 2,
    make(s, rng) {
      const per = round1(s.owner.size * (0.03 + rng.next() * 0.02));
      return {
        kind: 'naming', round: 0, data: { per },
        titleRu: 'Права на название стадиона', titleEn: 'Stadium naming rights',
        textRu: `Корпорация предлагает ${money(per)} в сезон на 5 лет за своё имя на стадионе. Традиционалисты будут против.`,
        textEn: `A corporation offers ${money(per)} a season for 5 years to put its name on the stadium. Traditionalists will object.`,
        options: [
          opt('a', 'Согласиться', 'Accept', `+${money(per)} коммерческого дохода в сезон. Болельщики недовольны.`, `+${money(per)} commercial income a season. The fans are unhappy.`),
          opt('b', 'Отказать', 'Decline', 'Сохранить историческое название. Болельщики ценят.', 'Keep the historic name. The fans appreciate it.'),
        ],
      };
    },
    resolve(s, d, o) {
      if (o === 'a') {
        s.owner.naming = { perSeason: Number(d.data.per), seasons: 5 };
        s.owner.fanMood = clamp(s.owner.fanMood - 9, 0, 100);
      } else s.owner.fanMood = clamp(s.owner.fanMood + 3, 0, 100);
    },
  },
  {
    kind: 'prodigy',
    weight: 2,
    when: (s) => s.owner.facilities.academy >= 2 && squadOf(s, s.clubId).length < 26,
    make(s, rng) {
      const fee = round1(s.owner.size * (0.03 + rng.next() * 0.03));
      return {
        kind: 'prodigy', round: 0, data: { fee },
        titleRu: 'В академии растёт вундеркинд', titleEn: 'A prodigy in the academy',
        textRu: `Руководитель академии докладывает о 16-летнем таланте. Гранд готов заплатить ${money(fee)} уже сейчас.`,
        textEn: `The academy head reports a 16-year-old talent. A giant would pay ${money(fee)} for him right now.`,
        options: [
          opt('a', 'Перевести в первую команду', 'Promote him', 'Талант с высоким потенциалом пополняет состав.', 'A high-potential youngster joins the squad.'),
          opt('b', 'Продать гранду', 'Sell to the giant', `+${money(fee)} в кассу. Академия теряет авторитет у родителей.`, `+${money(fee)} to the accounts. The academy loses standing with parents.`),
        ],
      };
    },
    resolve(s, d, o, rng) {
      if (o === 'b') {
        s.owner.cash = round1(s.owner.cash + Number(d.data.fee));
        s.owner.ledger.other = round1(s.owner.ledger.other + Number(d.data.fee));
        return;
      }
      const squad = [...squadOf(s, s.clubId)];
      const used = new Set(squad.map((p) => p.number));
      let n = 40;
      while (used.has(n)) n++;
      const p = academyPlayer(s.clubId, rng.pick(SQUAD.filter((r) => r !== 'GK')), rng, n, `${s.clubId}-pr${s.season}-${++s.owner.seq}`);
      const young = { ...p, age: 16 };
      const pot = clamp(rating(young) + 18 + rng.int(0, 8), 70, 97);
      squad.push({ ...young, potential: pot });
      setSquad(s, s.clubId, squad);
      ownerNews(s, `${young.name} (16) переведён в первую команду. Потенциал — ${pot}.`, `${young.name} (16) is promoted to the first team. Potential: ${pot}.`);
      s.owner.fanMood = clamp(s.owner.fanMood + 4, 0, 100);
    },
  },
  {
    kind: 'debtCall',
    weight: 4,
    when: (s) => s.owner.debt > s.owner.size * 1.4,
    make(s) {
      const part = round1(s.owner.debt * 0.12);
      return {
        kind: 'debtCall', round: 0, data: { part },
        titleRu: 'Банк требует сократить долг', titleEn: 'The bank wants the debt cut',
        textRu: `Долг клуба (${money(s.owner.debt)}) превышает допустимый уровень. Банк требует досрочно погасить ${money(part)}.`,
        textEn: `The club’s debt (${money(s.owner.debt)}) is above the covenant. The bank demands early repayment of ${money(part)}.`,
        options: [
          opt('a', 'Погасить из кассы клуба', 'Repay from the club', `−${money(part)} из кассы.`, `−${money(part)} from the accounts.`, s.owner.cash < part),
          opt('b', 'Погасить из личных средств', 'Repay from your own pocket', `−${money(part)} личного капитала.`, `−${money(part)} of your own money.`, s.owner.wealth < part),
          opt('c', 'Рефинансировать', 'Refinance', 'Долг остаётся, ставка растёт на 1,5 п.п.', 'The debt stays; the rate rises by 1.5 pp.'),
        ],
      };
    },
    resolve(s, d, o) {
      const part = Number(d.data.part);
      if (o === 'a') s.owner.cash = round1(s.owner.cash - part);
      else if (o === 'b') s.owner.wealth = round1(s.owner.wealth - part);
      if (o !== 'c') s.owner.debt = round1(s.owner.debt - part);
      else s.owner.rate = Math.min(0.15, s.owner.rate + 0.015);
    },
  },
  {
    kind: 'superstar',
    weight: 2,
    when: (s) => transferWindow(s).open,
    make(s, rng) {
      const level = clubLevel(s, s.clubId);
      const pool: { id: string; club: string }[] = [];
      for (const c of CLUBS) {
        if (c.id === s.clubId) continue;
        for (const p of squadOf(s, c.id)) if (rating(p) >= level + 4 && p.age <= 30) pool.push({ id: p.id, club: c.id });
      }
      if (!pool.length) return null;
      const pick = rng.pick(pool);
      const p = findPlayer(s, pick.id)!.player;
      const fee = round1(marketValue(p) * 1.25);
      return {
        kind: 'superstar', round: 0, data: { player: p.id, fee },
        titleRu: `Агент предлагает ${p.name}`, titleEn: `An agent offers ${p.name}`,
        textRu: `${p.name} (${rating(p)}, ${p.age} лет) готов перейти из «${clubById(pick.club).name}». Сделка: ${money(fee)} плюс высокая зарплата.`,
        textEn: `${p.name} (${rating(p)}, aged ${p.age}) is ready to leave ${clubById(pick.club).name}. The deal: ${money(fee)} plus big wages.`,
        options: [
          opt('a', 'Подписать звезду', 'Sign the star', `−${money(fee)}: из трансферного бюджета, недостающее — из кассы. Бренд и болельщики в восторге.`, `−${money(fee)} from the transfer budget, the rest from the accounts. Brand and fans soar.`, ensureMarket(s).budget + s.owner.cash < fee),
          opt('b', 'Отказаться', 'Pass', 'Финансовая дисциплина.', 'Financial discipline.'),
        ],
      };
    },
    resolve(s, d, o) {
      if (o !== 'a') return;
      const fee = Number(d.data.fee);
      const m = ensureMarket(s);
      const top = round1(Math.max(0, fee - m.budget));
      s.owner.cash = round1(s.owner.cash - top);
      m.budget = round1(m.budget + top);
      // The agent has arranged it: no haggling, he wants to come, the wage is found.
      const pid = String(d.data.player);
      const wantWage = m.wageBudget;
      m.wageBudget = Math.max(m.wageBudget, 1e9);
      m.bids[pid] = 0;
      const rep = s.reputation;
      s.reputation = 100;
      const r = bid(s, pid, fee);
      s.reputation = rep;
      m.wageBudget = wantWage;
      if (r.ok) {
        s.owner.brand = clamp(s.owner.brand + 3, 10, 99);
        s.owner.fanMood = clamp(s.owner.fanMood + 10, 0, 100);
        if (s.owner.coach) s.owner.coach.trust = clamp(s.owner.coach.trust + 8, 0, 100);
      } else {
        m.budget = round1(m.budget - top);
        s.owner.cash = round1(s.owner.cash + top);
        ownerNews(s, 'Сделка сорвалась в последний момент.', 'The deal collapsed at the last minute.');
      }
    },
  },
  {
    kind: 'pressConference',
    weight: 3,
    when: (s) => !!s.owner.coach && losses(s, 4) >= 2,
    make(s) {
      return {
        kind: 'pressConference', round: 0, data: {},
        titleRu: 'Пресс-конференция владельца', titleEn: 'Owner’s press conference',
        textRu: `Журналисты спрашивают о будущем тренера после неудачных матчей. Клуб сейчас на ${currentPosition(s)}-м месте при задаче — ${boardTarget(s.clubId, s.league.clubs)}-е.`,
        textEn: `Reporters ask about the coach’s future after poor results. The club is ${currentPosition(s)}th; the target is ${boardTarget(s.clubId, s.league.clubs)}th.`,
        options: [
          opt('a', '«Полностью доверяю тренеру»', '“Full confidence in the coach”', 'Доверие тренера растёт, часть болельщиков недовольна.', 'Coach trust rises; some fans are annoyed.'),
          opt('b', '«Результаты должны улучшиться»', '“Results must improve”', 'Давление на тренера, болельщики ценят требовательность.', 'Pressure on the coach; fans like the demand.'),
          opt('c', '«Зимой усилим состав»', '“We will strengthen in January”', 'Все довольны — но обещание надо будет выполнить деньгами.', 'Everyone is pleased — but the promise must be backed with money.'),
        ],
      };
    },
    resolve(s, _d, o) {
      const c = s.owner.coach!;
      if (o === 'a') {
        c.trust = clamp(c.trust + 12, 0, 100);
        s.owner.fanMood = clamp(s.owner.fanMood - 3, 0, 100);
      } else if (o === 'b') {
        c.trust = clamp(c.trust - 8, 0, 100);
        s.owner.fanMood = clamp(s.owner.fanMood + 4, 0, 100);
      } else {
        c.trust = clamp(c.trust + 6, 0, 100);
        s.owner.fanMood = clamp(s.owner.fanMood + 4, 0, 100);
        c.demand = round1(c.demand * 1.25); // the promise raises expectations
      }
    },
  },
  {
    kind: 'coachConflict',
    weight: 2,
    when: (s) => !!s.owner.coach && !!s.owner.staff.sd && s.owner.coach.trust < 50,
    make(s) {
      const coach = coachById(s.owner.coach!.id)!;
      const sd = s.owner.staff.sd!;
      return {
        kind: 'coachConflict', round: 0, data: {},
        titleRu: 'Конфликт тренера и спортивного директора', titleEn: 'Coach and sporting director clash',
        textRu: `${coach.nameRu} публично критикует трансферы, которые провёл ${sd.name}. Раздевалка следит, чью сторону займёт владелец.`,
        textEn: `${coach.name} publicly criticises the signings made by ${sd.name}. The dressing room watches whose side the owner takes.`,
        options: [
          opt('a', 'Поддержать тренера', 'Back the coach', 'Спортивный директор уходит (компенсация), доверие тренера растёт.', 'The director leaves (compensation); the coach’s trust rises.'),
          opt('b', 'Поддержать директора', 'Back the director', 'Тренер теряет доверие.', 'The coach loses faith.'),
          opt('c', 'Помирить за закрытыми дверями', 'Mediate behind closed doors', `−${money(s.owner.size * 0.01)} на тимбилдинг и бонусы, небольшой плюс к доверию.`, `−${money(s.owner.size * 0.01)} on bonuses and a retreat; a little more trust.`),
        ],
      };
    },
    resolve(s, _d, o) {
      const c = s.owner.coach!;
      if (o === 'a') {
        const sd = s.owner.staff.sd!;
        s.owner.cash = round1(s.owner.cash - sd.wage);
        delete s.owner.staff.sd;
        c.trust = clamp(c.trust + 15, 0, 100);
      } else if (o === 'b') c.trust = clamp(c.trust - 15, 0, 100);
      else {
        const cost = round1(s.owner.size * 0.01);
        s.owner.cash = round1(s.owner.cash - cost);
        s.owner.ledger.other = round1(s.owner.ledger.other - cost);
        c.trust = clamp(c.trust + 6, 0, 100);
      }
    },
  },
];

/** Rolls for a boardroom event after a round: roughly one every three rounds, at most once per kind a season. */
export function maybeDecision(state: OwnerState, round: number): void {
  const o = state.owner;
  if (o.decision || o.over || !o.coach) return;
  const rng = new Rng(hashString(`event-${state.seed}-${state.season}-${round}`));
  if (!rng.chance(0.34)) return;
  const eligible = EVENTS.filter((e) => !o.seen.includes(e.kind) && e.when(state));
  if (!eligible.length) return;
  const e = eligible[rng.weighted(eligible.map((x) => x.weight))];
  const d = e.make(state, rng);
  if (!d) return;
  d.round = round;
  o.decision = d;
  o.seen.push(e.kind);
}

/** Applies the owner's choice. Returns false if that option isn't available. */
export function decide(state: OwnerState, option: 'a' | 'b' | 'c'): boolean {
  const o = state.owner;
  const d = o.decision;
  if (!d) return false;
  const choice = d.options.find((x) => x.id === option);
  if (!choice || choice.disabled) return false;
  const e = EVENTS.find((x) => x.kind === d.kind)!;
  e.resolve(state, d, option, new Rng(hashString(`resolve-${state.seed}-${state.season}-${d.round}-${option}`)));
  o.log.unshift({ season: state.season, ru: `${d.titleRu}: ${choice.ru}`, en: `${d.titleEn}: ${choice.en}` });
  o.log = o.log.slice(0, 30);
  o.decision = null;
  return true;
}

/** A coach who has lost all faith walks out. */
export function coachWalksOut(state: OwnerState): boolean {
  const c = state.owner.coach;
  if (!c || c.trust > 8) return false;
  const coach = coachById(c.id);
  ownerNews(state, `${coach?.nameRu ?? 'Тренер'} подал в отставку: «Я больше не чувствую поддержки владельца».`, `${coach?.name ?? 'The coach'} resigns: “I no longer feel the owner’s support.”`);
  state.owner.coach = null;
  return true;
}

export const eventKinds = () => EVENTS.map((e) => e.kind);

