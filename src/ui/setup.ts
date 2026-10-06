import { type Coach, coachById, coachTactics } from '../data/coaches';
import { CLUBS, clubById } from '../data/clubs';
import { coachCard, coachSelectHtml } from './coachUi';
import { overall } from '../engine/attributes';
import { FORMATIONS, FORMATION_IDS } from '../engine/formations';
import { pickLineup } from '../engine/team';
import { type ClubData, type FormationId, type Tactics, withDefaults } from '../engine/types';
import { type Key, t } from '../i18n';

export interface MatchSetup {
  home: ClubData;
  away: ClubData;
  homeTactics: Tactics;
  awayTactics: Tactics;
  homeCoach?: Coach;
  awayCoach?: Coach;
  seed: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Team strength summary: average overall of the best XI per line. */
export function strength(club: ClubData, formation: FormationId) {
  const slots = FORMATIONS[formation];
  const { lineup } = pickLineup(club.players, slots);
  const ovr = lineup.map((p, i) => overall(p.attrs, slots[i].role));
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
  const lines = { def: [] as number[], mid: [] as number[], att: [] as number[] };
  slots.forEach((s, i) => {
    if (s.role === 'GK') return;
    const l = ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(s.role) ? 'def' : ['ST', 'LW', 'RW'].includes(s.role) ? 'att' : 'mid';
    lines[l].push(ovr[i]);
  });
  return { ovr: avg(ovr), def: avg(lines.def), mid: avg(lines.mid), att: avg(lines.att) };
}

type SliderKey = 'mentality' | 'pressing' | 'lineHeight' | 'width' | 'directness' | 'shootingRange' | 'tempo' | 'tackling' | 'crossing';
const SLIDERS: { key: SliderKey; min: number; max: number; step: number; ends: [Key, Key] }[] = [
  { key: 'mentality', min: -2, max: 2, step: 0.5, ends: ['defensive', 'attacking'] },
  { key: 'pressing', min: 0, max: 1, step: 0.05, ends: ['calm', 'intense'] },
  { key: 'lineHeight', min: 0, max: 1, step: 0.05, ends: ['low', 'high'] },
  { key: 'width', min: 0, max: 1, step: 0.05, ends: ['narrow', 'wide'] },
  { key: 'directness', min: 0, max: 1, step: 0.05, ends: ['short', 'direct'] },
  { key: 'tempo', min: 0, max: 1, step: 0.05, ends: ['slow', 'fast'] },
  { key: 'shootingRange', min: 0, max: 1, step: 0.05, ends: ['boxOnly', 'onSight'] },
  { key: 'crossing', min: 0, max: 1, step: 0.05, ends: ['rarely', 'often'] },
  { key: 'tackling', min: 0, max: 1, step: 0.05, ends: ['soft', 'hard'] },
];

/** Tactic controls, reused on the setup screen and in the live "Tactics" tab. */
export function tacticsControls(tac: Tactics, onChange: (t: Tactics) => void): HTMLElement {
  const root = document.createElement('div');
  root.className = 'tactics-grid';
  const f = document.createElement('div');
  f.className = 'slider';
  f.innerHTML = `<label>${t('formation')}</label><select>${FORMATION_IDS.map((id) => `<option ${id === tac.formation ? 'selected' : ''}>${id}</option>`).join('')}</select>`;
  f.querySelector('select')!.addEventListener('change', (e) => {
    tac.formation = (e.target as HTMLSelectElement).value as FormationId;
    onChange(tac);
  });
  root.appendChild(f);
  for (const s of SLIDERS) {
    const el = document.createElement('div');
    el.className = 'slider';
    const id = `sl-${Math.random().toString(36).slice(2, 8)}`;
    el.innerHTML = `<label for="${id}">${t(s.key)}</label>
      <input id="${id}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${tac[s.key]}">
      <div class="ends"><span>${t(s.ends[0])}</span><span>${t(s.ends[1])}</span></div>`;
    el.querySelector('input')!.addEventListener('input', (e) => {
      tac[s.key] = Number((e.target as HTMLInputElement).value);
      onChange(tac);
    });
    root.appendChild(el);
  }
  return root;
}

export function renderSetup(container: HTMLElement, initial: Partial<MatchSetup>, onStart: (s: MatchSetup, instant: boolean) => void): void {
  const state = {
    home: initial.home ?? CLUBS[0],
    away: initial.away ?? CLUBS[1],
    homeTactics: withDefaults(initial.homeTactics ?? (initial.home ?? CLUBS[0]).tactics),
    awayTactics: withDefaults(initial.awayTactics ?? (initial.away ?? CLUBS[1]).tactics),
    homeCoach: initial.homeCoach ?? coachById((initial.home ?? CLUBS[0]).coachId),
    awayCoach: initial.awayCoach ?? coachById((initial.away ?? CLUBS[1]).coachId),
    seed: initial.seed ?? Math.floor(Math.random() * 1e6),
  };

  container.innerHTML = `
    <section class="hero">
      <div><h1>PitchMind</h1><p>${t('tagline')}</p></div>
    </section>
    <div class="setup-grid">
      <div class="panel team-card" data-side="home"></div>
      <div class="vs">VS</div>
      <div class="panel team-card" data-side="away"></div>
    </div>
    <div class="setup-actions">
      <label class="toggle">${t('seed')} <input type="number" id="seed" value="${state.seed}" style="width:120px"></label>
      <button class="btn small" id="rnd" type="button">🎲 ${t('random')}</button>
      <button class="btn" id="instant" type="button">⚡ ${t('instant')}</button>
      <button class="btn primary" id="go" type="button">▶ ${t('kickoff')}</button>
    </div>`;

  const renderCard = (side: 'home' | 'away') => {
    const card = container.querySelector<HTMLElement>(`[data-side="${side}"]`)!;
    const club = state[side];
    const tac = side === 'home' ? state.homeTactics : state.awayTactics;
    const coach = side === 'home' ? state.homeCoach : state.awayCoach;
    const st = strength(club, tac.formation);
    card.innerHTML = `
      <div class="team-head">
        <div class="crest" style="background:${club.colors.primary};color:${club.colors.text};border-color:${club.colors.secondary}">${club.short}</div>
        <select class="club-select" aria-label="${t(side)}">${CLUBS.map((c) => `<option value="${c.id}" ${c.id === club.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="squad-strength"><span>${t(side)}</span><span>OVR <b>${st.ovr}</b></span><span>DEF <b>${st.def}</b></span><span>MID <b>${st.mid}</b></span><span>ATT <b>${st.att}</b></span></div>
      <div class="coach-pick"><label class="muted">${t('coach')}</label>${coachSelectHtml(coach?.id)}</div>
      ${coach ? coachCard(coach, true) : ''}`;
    card.querySelector('.club-select')!.addEventListener('change', (e) => {
      const c = clubById((e.target as HTMLSelectElement).value);
      state[side] = c;
      const cc = coachById(c.coachId);
      if (side === 'home') (state.homeTactics = withDefaults(c.tactics)), (state.homeCoach = cc);
      else (state.awayTactics = withDefaults(c.tactics)), (state.awayCoach = cc);
      renderCard(side);
    });
    // Picking a coach brings his preferred formation and instructions with him.
    card.querySelector('.coach-select')!.addEventListener('change', (e) => {
      const cc = coachById((e.target as HTMLSelectElement).value)!;
      if (side === 'home') (state.homeCoach = cc), (state.homeTactics = coachTactics(cc));
      else (state.awayCoach = cc), (state.awayTactics = coachTactics(cc));
      renderCard(side);
    });
    card.appendChild(
      tacticsControls(tac, () => {
        const s2 = strength(club, tac.formation);
        card.querySelector('.squad-strength')!.innerHTML = `<span>${t(side)}</span><span>OVR <b>${s2.ovr}</b></span><span>DEF <b>${s2.def}</b></span><span>MID <b>${s2.mid}</b></span><span>ATT <b>${s2.att}</b></span>`;
      }),
    );
  };
  renderCard('home');
  renderCard('away');

  const seedInput = container.querySelector<HTMLInputElement>('#seed')!;
  container.querySelector('#rnd')!.addEventListener('click', () => (seedInput.value = String(Math.floor(Math.random() * 1e6))));
  const start = (instant: boolean) => onStart({ ...state, seed: Number(seedInput.value) || 1 }, instant);
  container.querySelector('#go')!.addEventListener('click', () => start(false));
  container.querySelector('#instant')!.addEventListener('click', () => start(true));
}
