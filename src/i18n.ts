import type { MatchEvent } from './engine/match';

export type Lang = 'ru' | 'en';

const STRINGS = {
  ru: {
    tagline: 'Агентный симулятор футбола: физика мяча, тактический ИИ, xG',
    navMatch: 'Матч', navLeague: 'Лига', navAbout: 'Как это работает',
    home: 'Хозяева', away: 'Гости', formation: 'Схема', mentality: 'Настрой', pressing: 'Прессинг',
    lineHeight: 'Линия обороны', width: 'Ширина атаки', directness: 'Вертикальность',
    seed: 'Сид', random: 'Случайный', kickoff: 'Начать матч', instant: 'Мгновенный результат',
    play: 'Играть', pause: 'Пауза', speed: 'Скорость', toEnd: 'В конец', newMatch: 'Новый матч',
    names: 'Имена', aiVision: 'Мысли ИИ', trails: 'След мяча', replay: 'Повтор гола', live: 'В эфире',
    commentary: 'Комментарий', stats: 'Статистика', lineups: 'Составы', tactics: 'Тактика',
    possession: 'Владение', shots: 'Удары', onTarget: 'В створ', xg: 'xG', passes: 'Передачи',
    passAcc: 'Точность передач', tackles: 'Отборы', duels: 'Выигр. единоборства', interceptions: 'Перехваты', fouls: 'Фолы',
    corners: 'Угловые', offsides: 'Офсайды', yellows: 'Жёлтые', reds: 'Красные', saves: 'Сейвы',
    momentum: 'Давление по ходу матча', shotMap: 'Карта ударов', heatmap: 'Тепловая карта',
    ratings: 'Оценки игроков', motm: 'Игрок матча', fulltime: 'Финальный свисток', halftime: 'Перерыв',
    report: 'Отчёт о матче', backToMatch: 'Смотреть заново', energy: 'Свежесть',
    player: 'Игрок', pos: 'Поз', min: 'Мин', rating: 'Оценка', goalsShort: 'Г', assistsShort: 'П',
    goal: 'ГОЛ!', defensive: 'Оборона', attacking: 'Атака', low: 'Низко', high: 'Высоко',
    narrow: 'Узко', wide: 'Широко', short: 'Короткий пас', direct: 'Вертикально', calm: 'Спокойно', intense: 'Агрессивно',
    applyLive: 'Изменения применяются сразу', season: 'Сезон', table: 'Таблица', fixtures: 'Календарь',
    scorers: 'Бомбардиры', simRound: 'Сыграть тур', simSeason: 'Доиграть сезон', newSeason: 'Новый сезон',
    round: 'Тур', watch: 'Смотреть', played: 'И', won: 'В', drawn: 'Н', lost: 'П', gd: 'РМ', pts: 'О',
    club: 'Клуб', goalsCol: 'Голы', simulating: 'Симуляция…', champion: 'Чемпион',
    legendGoal: 'гол', legendShot: 'удар', legendSize: 'размер = xG', table_view: 'Таблицей',
    goalsFor: 'Голы', minute: 'Минута', xgTimeline: 'Накопленный xG', selectPlayer: 'Игрок для тепловой карты',
    about: 'О движке',
  },
  en: {
    tagline: 'Agent-based football simulator: ball physics, tactical AI, xG',
    navMatch: 'Match', navLeague: 'League', navAbout: 'How it works',
    home: 'Home', away: 'Away', formation: 'Formation', mentality: 'Mentality', pressing: 'Pressing',
    lineHeight: 'Defensive line', width: 'Width', directness: 'Directness',
    seed: 'Seed', random: 'Random', kickoff: 'Kick off', instant: 'Instant result',
    play: 'Play', pause: 'Pause', speed: 'Speed', toEnd: 'Skip to end', newMatch: 'New match',
    names: 'Names', aiVision: 'AI vision', trails: 'Ball trail', replay: 'Goal replay', live: 'Live',
    commentary: 'Commentary', stats: 'Stats', lineups: 'Line-ups', tactics: 'Tactics',
    possession: 'Possession', shots: 'Shots', onTarget: 'On target', xg: 'xG', passes: 'Passes',
    passAcc: 'Pass accuracy', tackles: 'Tackles', duels: 'Duels won', interceptions: 'Interceptions', fouls: 'Fouls',
    corners: 'Corners', offsides: 'Offsides', yellows: 'Yellow cards', reds: 'Red cards', saves: 'Saves',
    momentum: 'Match momentum', shotMap: 'Shot map', heatmap: 'Heat map',
    ratings: 'Player ratings', motm: 'Player of the match', fulltime: 'Full time', halftime: 'Half time',
    report: 'Match report', backToMatch: 'Watch again', energy: 'Energy',
    player: 'Player', pos: 'Pos', min: 'Min', rating: 'Rating', goalsShort: 'G', assistsShort: 'A',
    goal: 'GOAL!', defensive: 'Defensive', attacking: 'Attacking', low: 'Deep', high: 'High',
    narrow: 'Narrow', wide: 'Wide', short: 'Short passing', direct: 'Direct', calm: 'Passive', intense: 'Intense',
    applyLive: 'Changes apply instantly', season: 'Season', table: 'Table', fixtures: 'Fixtures',
    scorers: 'Top scorers', simRound: 'Play round', simSeason: 'Finish season', newSeason: 'New season',
    round: 'Round', watch: 'Watch', played: 'P', won: 'W', drawn: 'D', lost: 'L', gd: 'GD', pts: 'Pts',
    club: 'Club', goalsCol: 'Goals', simulating: 'Simulating…', champion: 'Champions',
    legendGoal: 'goal', legendShot: 'shot', legendSize: 'size = xG', table_view: 'As table',
    goalsFor: 'Goals', minute: 'Minute', xgTimeline: 'Cumulative xG', selectPlayer: 'Heat map player',
    about: 'About the engine',
  },
} as const;

export type Key = keyof (typeof STRINGS)['en'];

let lang: Lang = (() => {
  try {
    const saved = localStorage.getItem('pm-lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.startsWith('ru') ? 'ru' : 'en';
})();

export const getLang = () => lang;
export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem('pm-lang', l);
  } catch {
    /* ignore */
  }
}

export const t = (k: Key): string => STRINGS[lang][k];

// ───────────────────────────────────────────── commentary ──

type Templates = Partial<Record<MatchEvent['type'] | 'goalAssist', string[]>>;

const COMMENTARY: Record<Lang, Templates> = {
  ru: {
    kickoff: ['Стартовый свисток! {team} начинают матч.', 'Поехали! Мяч в игре, разыгрывают {team}.'],
    secondHalf: ['Начался второй тайм. Разыгрывают {team}.'],
    goal: ['ГОЛ! {player} ({team}) забивает! {score}', 'ГОООЛ! {player} не оставляет шансов вратарю! {score}', 'Мяч в сетке! {player} отличается для {team}. {score}'],
    goalAssist: ['ГОЛ! {player} замыкает передачу {other}! {score}', 'ГОЛ! {other} выкладывает мяч, {player} забивает! {score}'],
    ownGoal: ['Автогол! {player} срезает мяч в свои ворота. {score}'],
    save: ['Сейв! {player} выручает после удара {other}.', '{player} тащит! Удар {other} отражён.', 'Отличная реакция вратаря {player}!'],
    miss: ['{player} бьёт — мимо ворот.', 'Удар {player} проходит выше перекладины.', '{player} пытался, но не попал в створ.'],
    post: ['Штанга! {player} был в сантиметрах от гола!', 'Каркас ворот спасает! Удар {player} в штангу.'],
    blocked: ['Удар {player} заблокирован — {other} бросается под мяч.'],
    bigChance: ['Опасно! {player} выходит на ударную позицию…', 'Момент у {player}!'],
    foul: ['Фол: {player} сбивает {other}.', '{player} нарушает правила против {other}.'],
    yellow: ['Жёлтая карточка: {player}.', 'Арбитр показывает {player} жёлтую.'],
    red: ['КРАСНАЯ! {player} удалён с поля!', 'Удаление! {player} покидает поле.'],
    corner: ['Угловой для {team}.'],
    offside: ['Офсайд. {player} был в положении вне игры.', 'Флажок поднят — {player} в офсайде.'],
    sub: ['Замена у {team}: выходит {player}, уходит {other}.'],
    penalty: ['ПЕНАЛЬТИ! Фол на {player} в штрафной!'],
    halftime: ['Свисток на перерыв. {score}'],
    fulltime: ['Финальный свисток! {score}'],
  },
  en: {
    kickoff: ['And we are under way! {team} get us started.', 'Kick-off! {team} set the ball rolling.'],
    secondHalf: ['The second half is under way, {team} kick off.'],
    goal: ['GOAL! {player} scores for {team}! {score}', 'GOAL! {player} gives the keeper no chance! {score}', 'It is in! {player} finds the net for {team}. {score}'],
    goalAssist: ['GOAL! {player} finishes off {other}\'s pass! {score}', 'GOAL! {other} lays it on a plate and {player} scores! {score}'],
    ownGoal: ['Own goal! {player} turns it into his own net. {score}'],
    save: ['Save! {player} denies {other}.', 'What a stop from {player}! {other} can\'t believe it.', 'Sharp reflexes from {player}!'],
    miss: ['{player} shoots — wide.', '{player} blazes it over the bar.', '{player} tries his luck but misses the target.'],
    post: ['Off the post! {player} so close!', 'The woodwork denies {player}!'],
    blocked: ['{player}\'s shot is blocked by {other}.'],
    bigChance: ['Danger! {player} is in a great position…', 'Chance for {player}!'],
    foul: ['Foul by {player} on {other}.', '{player} brings down {other}.'],
    yellow: ['Yellow card for {player}.', 'The referee books {player}.'],
    red: ['RED CARD! {player} is sent off!', '{player} has to go — red card!'],
    corner: ['Corner to {team}.'],
    offside: ['Offside, {player} was too early.', 'The flag is up — {player} offside.'],
    sub: ['Substitution for {team}: {player} on, {other} off.'],
    penalty: ['PENALTY! {player} is brought down in the box!'],
    halftime: ['Half time. {score}'],
    fulltime: ['Full time! {score}'],
  },
};

/** Turns an engine event into a line of commentary (or null for events we keep quiet about). */
export function commentary(e: MatchEvent, teamNames: [string, string], seed: number): string | null {
  const set = COMMENTARY[lang];
  let key: string = e.type;
  if (e.type === 'goal' && e.other) key = 'goalAssist';
  const list = (set as Record<string, string[] | undefined>)[key];
  if (!list) return null;
  const tpl = list[(e.id * 7 + seed) % list.length];
  const team = e.team !== null ? teamNames[e.team] : '';
  const score = `${teamNames[0]} ${e.score[0]}:${e.score[1]} ${teamNames[1]}`;
  return tpl
    .replace('{player}', e.player ?? '')
    .replace('{other}', e.other ?? '')
    .replace('{team}', team)
    .replace('{score}', score);
}
