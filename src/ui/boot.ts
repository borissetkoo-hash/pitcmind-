import { CLUBS } from '../data/clubs';
import { Match } from '../engine/match';
import { t } from '../i18n';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/**
 * Splash screen with a loading bar. The steps do real work (fonts, squads, warming up the
 * match engine's JIT) and each is given a minimum duration so the bar reads as a progression.
 */
export async function bootScreen(): Promise<void> {
  const el = document.createElement('div');
  el.className = 'boot';
  el.innerHTML = `
    <div class="boot-inner">
      <div class="boot-logo"><span class="brand-mark">◉</span> PitchMind</div>
      <div class="boot-sub">${t('bootSub')}</div>
      <div class="boot-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <div class="boot-row"><span class="boot-status"></span><span class="boot-pct num">0%</span></div>
    </div>
    <div class="boot-pitch" aria-hidden="true"></div>`;
  document.body.appendChild(el);
  const bar = el.querySelector<HTMLElement>('.boot-bar i')!;
  const status = el.querySelector<HTMLElement>('.boot-status')!;
  const pct = el.querySelector<HTMLElement>('.boot-pct')!;
  const progress = el.querySelector<HTMLElement>('.boot-bar')!;

  let shown = 0;
  /** Animates the bar from its current value to `to` over `ms`. */
  const fill = async (to: number, ms: number) => {
    const from = shown;
    const t0 = performance.now();
    for (;;) {
      await frame();
      const k = Math.min(1, (performance.now() - t0) / ms);
      const eased = 1 - (1 - k) * (1 - k);
      shown = from + (to - from) * eased;
      bar.style.width = `${shown}%`;
      pct.textContent = `${Math.round(shown)}%`;
      progress.setAttribute('aria-valuenow', String(Math.round(shown)));
      if (k >= 1) return;
    }
  };

  const steps: [string, number, number, () => unknown][] = [
    [t('bootFonts'), 18, 450, () => document.fonts?.ready],
    [t('bootClubs'), 42, 550, () => CLUBS.reduce((n, c) => n + c.players.length, 0)],
    [t('bootEngine'), 78, 700, () => {
      // Warm up the engine (JIT) with a few seconds of a throwaway match.
      const m = new Match({ home: CLUBS[0], away: CLUBS[1], seed: 1, fast: true });
      for (let i = 0; i < 600; i++) m.step();
    }],
    [t('bootPitch'), 100, 450, () => null],
  ];
  for (const [label, to, ms, work] of steps) {
    status.textContent = label;
    await Promise.all([Promise.resolve(work()), fill(to, ms)]);
  }
  status.textContent = t('bootReady');
  await wait(250);
  el.classList.add('done');
  await wait(450);
  el.remove();
}
