import { STAFF } from './staff';
import type { AvatarLook } from '../career/avatar';
import type { CoachTraits, FormationId, Tactics } from '../engine/types';

export type { CoachTraits };

export type CoachGroup = 'legends' | 'epl' | 'custom' | 'staff';

export interface Coach {
  id: string;
  name: string;
  nameRu: string;
  flag: string;
  group: CoachGroup;
  /** Formation the coach sets up in by default, plus the ones he also uses. */
  formations: FormationId[];
  tactics: Omit<Tactics, 'formation'>;
  traits: CoachTraits;
  style: { ru: string; en: string };
  /** Drawn portrait for coaches created in career mode (real coaches use initials). */
  look?: AvatarLook;
}

type Row = [
  id: string, name: string, nameRu: string, flag: string, group: CoachGroup, formations: FormationId[],
  // mentality, pressing, line, width, directness, tempo, shootingRange, crossing, tackling
  t: [number, number, number, number, number, number, number, number, number],
  // passing, organisation, pressing, counter, setPieces, aerial, fitness
  a: [number, number, number, number, number, number, number],
  ru: string, en: string,
];

const ROWS: Row[] = [
  ['guardiola', 'Pep Guardiola', 'Пеп Гвардиола', '🇪🇸', 'epl', ['4-3-3', '4-1-4-1', '3-4-3'],
    [1.5, 0.85, 0.8, 0.8, 0.15, 0.55, 0.3, 0.3, 0.45], [20, 15, 18, 10, 13, 9, 14],
    'Позиционная игра (juego de posición): терпеливое владение, перегрузки между линиями, мгновенный контрпрессинг и высокая линия.',
    'Juego de posición: patient possession, overloads between the lines, instant counter-pressing and a high line.'],
  ['ancelotti', 'Carlo Ancelotti', 'Карло Анчелотти', '🇮🇹', 'legends', ['4-3-3', '4-4-2', '4-2-3-1'],
    [0.5, 0.5, 0.5, 0.6, 0.5, 0.55, 0.55, 0.5, 0.45], [15, 14, 11, 17, 13, 11, 13],
    'Гибкий прагматик и мастер управления звёздами: даёт свободу таланту, смертоносен в переходах.',
    'Flexible pragmatist and man-manager: gives talent freedom, lethal in transition.'],
  ['allegri', 'Massimiliano Allegri', 'Массимилиано Аллегри', '🇮🇹', 'legends', ['3-5-2', '4-3-3'],
    [-0.5, 0.4, 0.4, 0.5, 0.55, 0.45, 0.55, 0.55, 0.55], [12, 17, 9, 15, 15, 13, 12],
    'Итальянский прагматизм: компактный средний блок, контроль счёта, игра «на результат».',
    'Italian pragmatism: compact mid-block, game management, results over style.'],
  ['conte', 'Antonio Conte', 'Антонио Конте', '🇮🇹', 'legends', ['3-4-3', '3-5-2', '3-4-2-1'],
    [0.5, 0.65, 0.55, 0.7, 0.55, 0.65, 0.55, 0.6, 0.65], [13, 18, 15, 15, 14, 13, 18],
    'Три центральных защитника и мощные вингбеки, заученные атакующие схемы, железная дисциплина и физика.',
    'Back three with powerful wing-backs, drilled attacking patterns, iron discipline and conditioning.'],
  ['luis-enrique', 'Luis Enrique', 'Луис Энрике', '🇪🇸', 'legends', ['4-3-3'],
    [1, 0.85, 0.75, 0.75, 0.3, 0.7, 0.45, 0.4, 0.55], [18, 14, 18, 13, 11, 10, 16],
    'Позиционное владение плюс агрессивный прессинг всей командой, высочайшая интенсивность.',
    'Positional possession plus aggressive whole-team pressing at very high intensity.'],
  ['jardim', 'Leonardo Jardim', 'Леонарду Жардим', '🇵🇹', 'legends', ['4-4-2', '4-3-3'],
    [0, 0.55, 0.5, 0.6, 0.65, 0.7, 0.55, 0.6, 0.55], [13, 15, 13, 18, 12, 12, 15],
    'Компактный 4-4-2 и молниеносные переходы в атаку — «Монако» образца чемпионского сезона.',
    'Compact 4-4-2 and lightning transitions — the title-winning Monaco blueprint.'],
  ['low', 'Joachim Löw', 'Йоахим Лёв', '🇩🇪', 'legends', ['4-2-3-1', '4-3-3'],
    [0.5, 0.55, 0.6, 0.6, 0.35, 0.55, 0.55, 0.5, 0.45], [16, 13, 13, 13, 12, 12, 13],
    'Техничный комбинационный футбол через владение с акцентом на треугольники в центре поля.',
    'Technical combination football built on possession and midfield triangles.'],
  ['mourinho', 'José Mourinho', 'Жозе Моуринью', '🇵🇹', 'legends', ['4-2-3-1', '4-3-3'],
    [-1, 0.4, 0.35, 0.5, 0.65, 0.5, 0.6, 0.6, 0.65], [12, 19, 11, 17, 16, 15, 13],
    'Организация обороны превыше всего: низкий блок, контратаки и стандарты, умение «закрыть» матч.',
    'Defensive organisation above all: low block, counters and set pieces, closing games out.'],
  ['pochettino', 'Mauricio Pochettino', 'Маурисио Почеттино', '🇦🇷', 'legends', ['4-2-3-1', '4-3-3'],
    [0.5, 0.8, 0.7, 0.75, 0.45, 0.65, 0.55, 0.55, 0.6], [14, 14, 17, 14, 12, 12, 18],
    'Высокий прессинг, атакующие крайние защитники и изнурительная физическая подготовка.',
    'High pressing, attacking full-backs and gruelling physical preparation.'],
  ['simeone', 'Diego Simeone', 'Диего Симеоне', '🇦🇷', 'legends', ['4-4-2', '5-3-2'],
    [-1.5, 0.5, 0.25, 0.4, 0.7, 0.5, 0.6, 0.65, 0.8], [10, 20, 13, 17, 17, 16, 17],
    'Чолизм: две плотные линии по четыре, борьба за каждый мяч, жёсткий отбор, контратаки и стандарты.',
    'Cholismo: two compact banks of four, fight for every ball, hard tackling, counters and set pieces.'],
  ['tite', 'Tite', 'Тите', '🇧🇷', 'legends', ['4-1-4-1', '4-3-3'],
    [0, 0.5, 0.5, 0.6, 0.4, 0.5, 0.5, 0.45, 0.45], [15, 16, 12, 13, 12, 11, 13],
    'Сбалансированная, хорошо организованная команда с аккуратным владением и чёткими ролями.',
    'Balanced, well-organised side with tidy possession and clear roles.'],
  ['zidane', 'Zinedine Zidane', 'Зинедин Зидан', '🇫🇷', 'legends', ['4-3-3', '4-4-2'],
    [0.5, 0.5, 0.55, 0.7, 0.45, 0.55, 0.6, 0.65, 0.45], [15, 14, 12, 16, 13, 13, 13],
    'Управление звёздами и гибкость: игра через фланги и навесы, умение побеждать в больших матчах.',
    'Star management and flexibility: wide play and crosses, a winner of big games.'],
  ['arteta', 'Mikel Arteta', 'Микель Артета', '🇪🇸', 'epl', ['4-3-3', '4-2-3-1'],
    [0.5, 0.75, 0.7, 0.7, 0.3, 0.5, 0.4, 0.45, 0.55], [17, 18, 16, 12, 19, 14, 15],
    'Позиционная игра, одна из лучших оборон лиги и лучшие в АПЛ стандарты.',
    'Positional play, one of the league’s best defences and elite set-piece routines.'],
  ['maresca', 'Enzo Maresca', 'Энцо Мареска', '🇮🇹', 'epl', ['4-2-3-1', '4-3-3'],
    [0.5, 0.65, 0.65, 0.65, 0.2, 0.35, 0.4, 0.35, 0.45], [18, 12, 14, 11, 11, 10, 13],
    'Неторопливое владение с инвертированными защитниками и построением 3-2-4-1 в атаке.',
    'Patient possession with inverted full-backs and a 3-2-4-1 shape in possession.'],
  ['slot', 'Arne Slot', 'Арне Слот', '🇳🇱', 'epl', ['4-2-3-1', '4-3-3'],
    [0.5, 0.75, 0.65, 0.7, 0.4, 0.55, 0.5, 0.5, 0.5], [17, 15, 17, 15, 13, 12, 15],
    'Контролируемое владение и сильный организованный прессинг, баланс между риском и контролем.',
    'Controlled possession with a strong organised press; a balance of risk and control.'],
  ['postecoglou', 'Ange Postecoglou', 'Анж Постекоглу', '🇦🇺', 'epl', ['4-3-3'],
    [2, 0.8, 0.95, 0.8, 0.35, 0.8, 0.45, 0.45, 0.55], [15, 8, 16, 12, 9, 10, 15],
    '«Мы всегда атакуем»: сверхвысокая линия, инвертированные защитники, бешеный темп — и риск сзади.',
    '“We always attack”: an ultra-high line, inverted full-backs, frantic tempo — and risk at the back.'],
  ['ten-hag', 'Erik ten Hag', 'Эрик тен Хаг', '🇳🇱', 'epl', ['4-2-3-1', '4-3-3'],
    [0.5, 0.65, 0.6, 0.65, 0.45, 0.6, 0.5, 0.5, 0.55], [15, 12, 14, 15, 11, 11, 14],
    'Голландская школа владения и прессинга с ставкой на быстрые переходы.',
    'Dutch possession-and-press schooling with an emphasis on quick transitions.'],
  ['howe', 'Eddie Howe', 'Эдди Хау', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'epl', ['4-3-3'],
    [0.5, 0.8, 0.6, 0.65, 0.6, 0.75, 0.55, 0.55, 0.65], [13, 15, 17, 15, 13, 14, 19],
    'Интенсивный прессинг, вертикальные атаки и лучшая в лиге физическая готовность.',
    'Intense pressing, vertical attacks and some of the fittest players in the league.'],
  ['emery', 'Unai Emery', 'Унаи Эмери', '🇪🇸', 'epl', ['4-4-2', '4-2-3-1'],
    [0.5, 0.55, 0.8, 0.6, 0.5, 0.55, 0.55, 0.5, 0.5], [15, 17, 13, 17, 15, 12, 14],
    'Скрупулёзная подготовка, агрессивная офсайдная ловушка и убийственные контратаки.',
    'Meticulous preparation, an aggressive offside trap and deadly counter-attacks.'],
  ['lopetegui', 'Julen Lopetegui', 'Хулен Лопетеги', '🇪🇸', 'epl', ['4-3-3', '4-2-3-1'],
    [0, 0.55, 0.55, 0.65, 0.35, 0.45, 0.45, 0.45, 0.5], [15, 15, 12, 12, 12, 11, 13],
    'Испанская школа владения в сочетании с компактной организованной обороной.',
    'Spanish possession schooling combined with a compact, organised defence.'],
  ['hurzeler', 'Fabian Hürzeler', 'Фабиан Хюрцелер', '🇩🇪', 'epl', ['4-2-3-1', '3-4-3'],
    [1, 0.8, 0.75, 0.7, 0.3, 0.6, 0.45, 0.45, 0.55], [17, 12, 16, 13, 11, 10, 15],
    'Самый молодой тренер АПЛ: смелое владение от вратаря и агрессивный высокий прессинг.',
    'The league’s youngest manager: brave build-up from the keeper and an aggressive high press.'],
  ['glasner', 'Oliver Glasner', 'Оливер Гласнер', '🇦🇹', 'epl', ['3-4-2-1', '3-4-3'],
    [0.5, 0.8, 0.6, 0.65, 0.7, 0.8, 0.6, 0.55, 0.65], [13, 15, 17, 18, 13, 13, 16],
    'Схема 3-4-2-1, агрессивный прессинг и стремительные вертикальные переходы.',
    '3-4-2-1, aggressive pressing and rapid vertical transitions.'],
  ['frank', 'Thomas Frank', 'Томас Франк', '🇩🇰', 'epl', ['4-3-3', '3-5-2'],
    [0, 0.6, 0.5, 0.6, 0.65, 0.6, 0.55, 0.7, 0.6], [12, 15, 14, 15, 19, 17, 14],
    'Аналитика и стандарты: прямой футбол, сильная игра в воздухе и лучшие розыгрыши угловых.',
    'Analytics and set pieces: direct football, aerial strength and elite corner routines.'],
  ['oneil', "Gary O'Neil", 'Гари О’Нил', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'epl', ['3-4-2-1', '3-4-3'],
    [-0.5, 0.5, 0.45, 0.6, 0.65, 0.65, 0.55, 0.55, 0.6], [12, 14, 13, 16, 12, 12, 14],
    'Компактная схема с тремя центральными защитниками и быстрыми контратаками.',
    'A compact back-three system built for fast counter-attacks.'],
  ['nuno', 'Nuno Espírito Santo', 'Нуну Эшпириту Санту', '🇵🇹', 'epl', ['3-4-3', '4-2-3-1', '5-3-2'],
    [-1, 0.4, 0.3, 0.5, 0.75, 0.7, 0.55, 0.55, 0.6], [11, 17, 11, 18, 14, 14, 15],
    'Низкий плотный блок и смертоносные контратаки — максимум из минимума владения.',
    'A deep, compact block and deadly counters — maximum output from minimal possession.'],
  ['iraola', 'Andoni Iraola', 'Андони Ираола', '🇪🇸', 'epl', ['4-2-3-1'],
    [1, 0.9, 0.7, 0.65, 0.7, 0.85, 0.55, 0.55, 0.7], [13, 13, 19, 16, 12, 13, 18],
    'Неистовый персональный прессинг по всему полю, вертикальность и высочайшая интенсивность.',
    'Relentless man-oriented pressing all over the pitch, verticality and huge intensity.'],
  ['dyche', 'Sean Dyche', 'Шон Дайч', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'epl', ['4-4-2', '4-1-4-1'],
    [-1, 0.4, 0.35, 0.5, 0.85, 0.5, 0.6, 0.8, 0.7], [8, 18, 11, 13, 18, 19, 16],
    'Классический английский стиль: низкий блок 4-4-2, длинные передачи, борьба в воздухе и стандарты.',
    'Classic English style: a deep 4-4-2, long balls, aerial battles and set pieces.'],
  ['silva', 'Marco Silva', 'Марку Силва', '🇵🇹', 'epl', ['4-2-3-1'],
    [0.5, 0.6, 0.55, 0.75, 0.45, 0.55, 0.5, 0.7, 0.5], [15, 13, 13, 13, 13, 14, 14],
    'Атакующее владение через фланги: крайние защитники в атаке и много навесов.',
    'Attacking possession through the flanks: overlapping full-backs and lots of crosses.'],
  ['martin', 'Russell Martin', 'Расселл Мартин', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'epl', ['4-3-3'],
    [0.5, 0.6, 0.6, 0.65, 0.1, 0.3, 0.35, 0.35, 0.4], [17, 9, 12, 9, 10, 9, 13],
    'Принципиальное владение любой ценой: розыгрыш от вратаря даже под давлением.',
    'Possession on principle: building from the keeper even under heavy pressure.'],
  ['cooper', 'Steve Cooper', 'Стив Купер', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'epl', ['3-4-2-1', '5-3-2'],
    [-0.5, 0.5, 0.4, 0.55, 0.6, 0.6, 0.55, 0.55, 0.55], [12, 15, 13, 15, 13, 13, 15],
    'Компактная пятёрка в обороне, командный дух и контратаки.',
    'A compact back five, team spirit and counter-attacks.'],
  ['mckenna', 'Kieran McKenna', 'Киран Маккенна', '🇬🇧', 'epl', ['4-2-3-1'],
    [1, 0.7, 0.65, 0.75, 0.35, 0.6, 0.45, 0.55, 0.5], [16, 13, 15, 13, 12, 11, 14],
    'Современное владение с перегрузками и атакующими крайними защитниками.',
    'Modern possession with overloads and attacking full-backs.'],
];

export const COACHES: Coach[] = ROWS.map(([id, name, nameRu, flag, group, formations, t, a, ru, en]) => ({
  id, name, nameRu, flag, group, formations,
  tactics: {
    mentality: t[0], pressing: t[1], lineHeight: t[2], width: t[3], directness: t[4],
    tempo: t[5], shootingRange: t[6], crossing: t[7], tackling: t[8],
  },
  traits: { passing: a[0], organisation: a[1], pressing: a[2], counter: a[3], setPieces: a[4], aerial: a[5], fitness: a[6] },
  style: { ru, en },
}));

export const NEUTRAL_TRAITS: CoachTraits = { passing: 10, organisation: 10, pressing: 10, counter: 10, setPieces: 10, aerial: 10, fitness: 10 };

/** Real coaches plus the generated head coaches of clubs without one. */
export const ALL_COACHES: Coach[] = [...COACHES, ...STAFF];

export function coachById(id: string | undefined): Coach | undefined {
  return ALL_COACHES.find((c) => c.id === id);
}

/** A coach's preferred set-up as full match tactics. */
export function coachTactics(c: Coach, formation: FormationId = c.formations[0]): Tactics {
  return { formation, ...c.tactics };
}

export const TRAIT_KEYS: (keyof CoachTraits)[] = ['passing', 'organisation', 'pressing', 'counter', 'setPieces', 'aerial', 'fitness'];
