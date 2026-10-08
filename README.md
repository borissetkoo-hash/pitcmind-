# ◉ PitchMind — agent-based football simulator

> 🇷🇺 **Кратко:** браузерный 2D-симулятор футбола, где счёт — не случайное число, а следствие решений 22 автономных ИИ-агентов и физики мяча. Тактика (схема, прессинг, линия обороны, ширина, вертикальность) реально меняет игру, движок откалиброван по статистике топ-лиг (голы, удары, xG, фолы, карточки). Есть live-трансляция с комментариями на русском/английском, повторы голов, режим «мысли ИИ», отчёт с картой ударов, xG и тепловыми картами, и полноценный сезон лиги с параллельной симуляцией в Web Workers.

PitchMind is a 2D football (soccer) match engine and web app written in TypeScript with **zero runtime dependencies**. Twenty-two autonomous agents perceive the pitch, evaluate options and act ten times a second; a 3D ball obeys physics; the laws of the game are enforced. The score is an emergent outcome — which is why tactics matter and why the numbers can be calibrated against real football.

## Features

- **Loading screen and main menu** — a game hub with season status, clubs and settings (language, pitch orientation, match speed, auto replays).
- **Portrait match view** (default): a tall pitch with your team attacking upwards, match stats and controls stacked on the right; landscape view available in settings.
- **Six leagues, 58 clubs**: England, Spain, Italy, Germany and Brazil (10 clubs each) plus the fictional Northern League. Clubs from real countries carry unlicensed-style names (“Manchester”, “Madrid Rojiblanco”, “Rio Rubro-Negro”) and **original procedural crests** (shield shape, field pattern, emblem, initials in club colours) — no real club names or badges are reproduced. Real coaches sit at their 2024/25 clubs; the rest get generated coaches with drawn portraits and country-appropriate names, as do the players.
- **Manager career**: create your own coach FIFA-style (drawn face assets — skin, hair, facial hair, glasses, outfit — plus name, nationality and philosophy), take a club, meet the real coaches week by week, grow your attributes, survive the board and the coaching carousel. You can also import face images from your own files (for example a Football Manager face pack you own): they are downscaled and kept in your browser's IndexedDB only, never uploaded, bundled or synced.
- **Club editor** (“real name fix”): rename any club, change its kit colours and add a crest from your own image files. Like the face import, names, colours and crests stay in your browser only; the game ships fictional clubs because real names and crests are trademarks.
- **Live match** on Canvas with smooth interpolation, 1×–32× speed, instant result, broadcast scoreboard, auto **goal replays**.
- **AI vision overlay** (`V`): see the ball carrier's evaluated options coloured by utility with success probabilities, both offside lines and every player's movement target.
- **Tactics that matter** — formation (6 shapes), mentality, pressing, defensive line, width, directness, tempo, shooting range, crossing and tackling — editable *during* the match. Each instruction has a measurable effect, e.g. shooting range 0 → 0 % of shots from outside the box, 1 → 47 %; crossing 0 → ~1 cross a match, 1 → ~23; tackling 0 → 7 fouls, 1 → 14.
- **31 real-world coaches** with Football-Manager-style coaching attributes (1–20): passing, defensive organisation, pressing, counter-attacks, set pieces, aerial game, conditioning. Each attribute drives a specific engine mechanic, and picking a coach brings his preferred formation and instructions — Simeone's sides defend in a tight 4-4-2 and win more duels, Guardiola's pass more accurately and choose better on the ball. In a controlled test (same squads, same tactics, 20 matches), Simeone's attributes cut goals conceded from 1.05 to 0.75 and Guardiola's held the opponent to 6.8 shots instead of 9.8. Coaches appear as initials avatars, no photos.
- **Commentary** in Russian and English, live stats, line-ups with fatigue and live ratings, hover cards with player attributes.
- **Match report**: momentum chart, cumulative xG race, shot map (size = xG), per-player heat maps, ratings and player of the match.
- **League mode**: double round-robin season, table with xG difference and form, top scorers; rounds are simulated in parallel in a **Web Worker pool**; any fixture can be watched live instead.
- **Deterministic**: a seed fully determines a match (fixed time step + seeded PRNG), which makes bugs reproducible and tests exact.

## How the engine works

```
src/engine/
  ball.ts        3D ball: rolling with constant deceleration, flight with gravity + drag, bounces; trajectory predictor
  player.ts      kinematics (accel-limited steering, arrival braking, turn rate), fatigue, reach-time model
  match.ts       the referee: phases, contacts, tackles & take-ons, fouls/cards, offside, set pieces, saves, stats
  ai/evaluate.ts xT-style threat surface, xG model, interception-based pass success, offside line
  ai/carrier.ts  on-ball decisions: options → expected value → softmax choice → execution with skill noise
  ai/offball.ts  team shape, pressing, marking, support angles, runs in behind, box filling
  ai/goalkeeper.ts, ai/setpieces.ts
src/data/coaches.ts  coach profiles: formations, instructions, 1–20 attributes, style notes (RU/EN)
```

**On-ball decisions.** Every option — pass to feet, through ball, lofted ball, cross, shot, six dribble directions, shielding, clearance — is scored as an expected change in possession value:

```
utility = P(success) · V(target) − P(loss) · V_opponent(loss point)
```

`V` is a smooth expected-threat (xT-like) surface. Pass success comes from each opponent's *time to intercept* along the ball's analytic path; dribble success from where defenders can meet the carrier on his path. The choice is a softmax whose temperature depends on the player's vision and composure, so great players pick the best option more consistently.

**Off-ball behaviour.** Formation slots stretch in possession and compress out of it while sliding with the ball; the back line holds a common height; the nearest defender engages the ball (a beaten defender drops out and the next one steps in), the second covers or cuts a lane; markers stay goal-side; supporting players search for open passing angles; forwards time runs on the offside line; wide attacks fill the box.

**Goalkeepers** position on the angle bisector, predict where a shot crosses their line and dive. Save probability is driven by reaction time — a close-range shot gives the keeper ~0.2 s, a 25-yard drive almost a second.

**Dead-ball time** (throw-ins, goal kicks, celebrations…) is fast-forwarded on the clock instead of simulated, so the ball is in play ~60 of the 90 minutes, as in real football.

## Calibration

Engines like this are easy to make *look* plausible and hard to make *statistically* plausible. Two scripts drive the tuning:

```bash
npm run calibrate -- 60 --fast   # aggregate match numbers vs. top-flight averages
npm run fit-xg -- 60             # conversion by distance vs. real football + logistic xG fit
```

Latest run (48 matches, all eight clubs with their head coaches):

| per match | PitchMind | real top-flight |
|---|---:|---:|
| Goals | 3.15 | ~2.7 |
| Shots | 26.8 | ~25 |
| Shots on target | 10.3 | ~8.5 |
| Goals / xG | 0.78 | 1.0 |
| Fouls | 27.5 | ~22 |
| Yellow cards | 3.8 | ~4 |
| Penalties | 0.46 | ~0.3 |
| Offsides | 7.0 | ~4 |
| Draws | 15 % | ~25 % |

Open-play conversion by distance (1,205 shots):

| distance | share of shots | PitchMind conversion | model xG | real football |
|---|---:|---:|---:|---:|
| 0–6 m | 5 % | 0.23 | 0.41 | ~0.40 |
| 6–11 m | 46 % | 0.13 | 0.16 | ~0.21 |
| 11–16.5 m | 31 % | 0.07 | 0.09 | ~0.10 |
| 16.5–25 m | 14 % | 0.04 | 0.04 | ~0.045 |
| 25 m + | 4 % | 0.00 | 0.02 | ~0.02 |

The pass model is checked for reliability too (predicted vs. observed success): 20–40 % → 30 %, 40–60 % → 47 %, 60–80 % → 70 %, 80–100 % → 96 %.

Known deviations (honest list): the AI completes too many short passes (~1,200 passes at 92 % vs. ~900 at 82 %); corners are rare (~5 vs. ~10); chances are created too close to goal (46 % of shots from 6–11 m) while close-range finishing is below real-world rates, the two roughly cancelling out in the goal totals.

Findings from tuning that shaped the design:
- A first version produced 40+ goals a match. Film-strip debugging (rendering frames headlessly with Playwright) showed attackers shadowed by defenders who never engaged — arrival braking towards a moving target. Pressers now attack the ball and a beaten defender hands over to the next.
- The decision softmax temperature was larger than the utility gaps between options deep in a team's own half, so defenders chose almost randomly. Lowering it fixed reckless build-up play.
- Shots per minute *of ball in play* matched reality long before shots per match did: the missing piece was dead-ball time.
- Tactics initially had no trade-offs (high pressing was simply better). Calibrated fatigue made pressing cost energy, so intense teams now both score and concede more.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: physics, rules, determinism, league, models
npm run build      # static site in dist/
# film-strip debugger: open http://localhost:5173/filmstrip.html?seed=7&t=120&n=12&dt=0.7&names
```

Deployment to GitHub Pages is automated by `.github/workflows/deploy.yml` (enable *Settings → Pages → Source: GitHub Actions*).

## Tech

TypeScript (strict), Canvas 2D renderer with a cached pitch layer and interpolation, hand-written SVG charts with tooltips (colour palette validated for colour-vision deficiency), Web Workers, Vite, Vitest, GitHub Actions. All clubs and players are fictional and procedurally generated from a seed.

## License

MIT
