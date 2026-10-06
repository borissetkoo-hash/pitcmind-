import { getLang } from '../i18n';

const RU = `
<h1>Как это работает</h1>
<p>PitchMind — это не «генератор случайного счёта», а агентная симуляция: 22 автономных игрока принимают решения 10 раз в секунду, мяч подчиняется физике, а счёт — лишь следствие тысяч микрорешений.</p>
<h2>Физика</h2>
<ul>
<li>Фиксированный шаг 1/30 с, детерминированный ГПСЧ (mulberry32): один и тот же сид всегда даёт тот же матч.</li>
<li>Мяч — 3D: качение с постоянным замедлением (позволяет ИИ предсказывать траекторию аналитически), полёт с гравитацией и сопротивлением воздуха, отскоки, штанги и перекладина.</li>
<li>Игроки — кинематика с ограничением ускорения, торможением при подходе, ограниченной скоростью поворота и усталостью, влияющей на скорость.</li>
</ul>
<h2>ИИ с мячом</h2>
<p>Каждый вариант — пас в ноги, пас на ход, заброс, навес, удар, дриблинг в 6 направлениях, укрывание, вынос — оценивается как <b>ожидаемое изменение ценности владения</b>: <code>P(успех) × V(цель) − P(потеря) × V_соперника(точка потери)</code>. V — гладкая xT-подобная модель угрозы. Вероятность паса считается через время перехвата каждым соперником вдоль траектории мяча. Выбор — softmax с «температурой», зависящей от видения и хладнокровия игрока.</p>
<h2>ИИ без мяча</h2>
<ul>
<li>Блок команды: слоты схемы растягиваются в атаке и сжимаются в обороне, смещаясь за мячом; единая линия обороны.</li>
<li>Прессинг (первый — атакует мяч, второй — перекрывает ближайшую передачу), зонная опека «между соперником и воротами».</li>
<li>Открывания: ближайшие игроки ищут открытые углы для паса, нападающие делают забегания за линию, держась в рамках офсайда; при фланговой атаке — заполнение штрафной.</li>
<li>Вратарь: позиция на биссектрисе, предсказание точки пересечения линии ворот, прыжок; вероятность сейва зависит от времени реакции.</li>
</ul>
<h2>Правила</h2>
<p>Ауты, угловые, удары от ворот, штрафные со стенкой, пенальти, офсайд (фиксируется в момент паса), фолы, жёлтые и красные карточки, автозамены уставших, компенсированное время. Время «мёртвого мяча» прокручивается, поэтому чистое время ~60 минут, как в реальном футболе.</p>
<h2>Калибровка</h2>
<p>Движок откалиброван по агрегированной статистике топ-лиг скриптами <code>npm run calibrate</code> и <code>npm run fit-xg</code>: модель паса и модель удара проверяются на сотнях симулированных матчей (предсказанная vs фактическая вероятность), реализация ударов по дистанциям сверяется с реальной.</p>
<div id="calib"></div>
<h2>Стек</h2>
<p>TypeScript, Canvas 2D, SVG-графики без библиотек, Web Workers для параллельной симуляции тура, Vite, Vitest. Ноль runtime-зависимостей.</p>`;

const EN = `
<h1>How it works</h1>
<p>PitchMind is not a random score generator — it is an agent-based simulation. 22 autonomous players make decisions ten times a second, the ball obeys physics, and the scoreline is just the consequence of thousands of micro-decisions.</p>
<h2>Physics</h2>
<ul>
<li>Fixed 1/30 s time step and a seeded PRNG (mulberry32): the same seed always replays the same match.</li>
<li>A 3D ball: rolling with constant deceleration (so the AI can predict it analytically), flight with gravity and drag, bounces, posts and crossbar.</li>
<li>Players: acceleration-limited kinematics, arrival braking, limited turn rate and fatigue that saps top speed.</li>
</ul>
<h2>On-ball AI</h2>
<p>Every option — pass to feet, through ball, long ball, cross, shot, dribble in six directions, shielding, clearance — is scored as the <b>expected change in possession value</b>: <code>P(success) × V(target) − P(loss) × V_opponent(loss point)</code>, where V is a smooth xT-style threat surface. Pass success comes from each opponent's interception time along the ball's path. The choice is a softmax whose temperature depends on the player's vision and composure.</p>
<h2>Off-ball AI</h2>
<ul>
<li>Team block: formation slots stretch in possession and compress out of it, sliding with the ball; a flat back line.</li>
<li>Pressing (first man attacks the ball, second cuts the nearest passing lane) and goal-side zonal marking.</li>
<li>Support play: nearby teammates find open passing angles, forwards run in behind while staying onside, wide attacks fill the box.</li>
<li>Keeper: positions on the angle bisector, predicts where the shot crosses the line, dives; save probability depends on reaction time.</li>
</ul>
<h2>Laws of the game</h2>
<p>Throw-ins, corners, goal kicks, free kicks with a wall, penalties, offside judged at the moment of the pass, fouls, yellow and red cards, fatigue-driven substitutions and stoppage time. Dead-ball time is fast-forwarded, giving ~60 minutes of ball-in-play like real football.</p>
<h2>Calibration</h2>
<p>The engine is calibrated against aggregate top-flight numbers with <code>npm run calibrate</code> and <code>npm run fit-xg</code>: the pass and shot models are checked over hundreds of simulated matches (predicted vs observed probability) and conversion by distance is compared with real football.</p>
<div id="calib"></div>
<h2>Stack</h2>
<p>TypeScript, Canvas 2D, dependency-free SVG charts, Web Workers to simulate league rounds in parallel, Vite, Vitest. Zero runtime dependencies.</p>`;

export function renderAbout(root: HTMLElement): void {
  root.innerHTML = `<article class="prose">${getLang() === 'ru' ? RU : EN}</article>`;
}
