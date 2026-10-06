import { COACHES, type Coach, TRAIT_KEYS, coachById } from '../data/coaches';
import { getLang, type Key, t } from '../i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const coachName = (c: Coach) => (getLang() === 'ru' ? c.nameRu : c.name);

/** Initials avatar with the coach's flag — no photos (likeness rights). */
export function coachAvatar(c: Coach, size = 44): string {
  const initials = c.name
    .split(/\s+/)
    .filter((w) => /^[A-ZÀ-Ž]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  // Stable hue per coach so avatars are distinguishable.
  let h = 0;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="coach-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px;background:hsl(${h} 35% 28%);border-color:hsl(${h} 45% 52%)">${initials}<i>${c.flag}</i></span>`;
}

/** FM-style colouring of a 1–20 attribute (text colour carries the value band, the number is always shown). */
export const traitClass = (v: number) => (v >= 16 ? 'tv-hi' : v >= 13 ? 'tv-good' : v >= 9 ? 'tv-mid' : 'tv-lo');

export function traitBars(c: Coach): string {
  return `<div class="trait-bars">${TRAIT_KEYS.map((k) => {
    const v = c.traits[k];
    return `<div class="trait" data-tip="${esc(t(`ef_${k}` as Key))}"><span>${t(`tr_${k}` as Key)}</span>
      <div class="trait-bar"><i style="width:${(v / 20) * 100}%"></i></div><b class="num ${traitClass(v)}">${v}</b></div>`;
  }).join('')}</div>`;
}

export function coachCard(c: Coach, compact = false): string {
  return `<div class="coach-card ${compact ? 'compact' : ''}">
    <div class="coach-head">${coachAvatar(c, compact ? 40 : 56)}
      <div><div class="coach-name">${esc(coachName(c))}</div>
      <div class="muted coach-meta">${t(`grp_${c.group}` as Key)} · ${t('favFormations')}: ${c.formations.map((f) => `<span class="chip">${f}</span>`).join(' ')}</div></div>
    </div>
    <p class="coach-style">${esc(c.style[getLang()])}</p>
    ${traitBars(c)}
  </div>`;
}

/** Coach picker grouped like the source material: legends and the 2024/25 Premier League. */
export function coachSelectHtml(selected: string | undefined): string {
  const group = (g: Coach['group']) =>
    `<optgroup label="${t(`grp_${g}` as Key)}">${COACHES.filter((c) => c.group === g)
      .sort((a, b) => coachName(a).localeCompare(coachName(b)))
      .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.flag} ${esc(coachName(c))}</option>`)
      .join('')}</optgroup>`;
  return `<select class="coach-select" aria-label="${t('coach')}">${group('epl')}${group('legends')}</select>`;
}

// ───────────────────────────── coaches page ──

const SHORT: Record<'ru' | 'en', Record<(typeof TRAIT_KEYS)[number], string>> = {
  ru: { passing: 'Пас', organisation: 'Орг', pressing: 'Пресс', counter: 'Контр', setPieces: 'Станд', aerial: 'Возд', fitness: 'Физ' },
  en: { passing: 'Pas', organisation: 'Org', pressing: 'Prs', counter: 'Cnt', setPieces: 'SP', aerial: 'Air', fitness: 'Fit' },
};

export function renderCoaches(root: HTMLElement): void {
  let filter: 'all' | Coach['group'] = 'all';
  let sortKey: (typeof TRAIT_KEYS)[number] | 'name' = 'name';
  let selected = COACHES[0].id;

  const draw = () => {
    const rows = COACHES.filter((c) => filter === 'all' || c.group === filter).sort((a, b) =>
      sortKey === 'name' ? coachName(a).localeCompare(coachName(b)) : b.traits[sortKey] - a.traits[sortKey],
    );
    const sel = coachById(selected) ?? rows[0];
    const head = TRAIT_KEYS.map(
      (k) => `<th><button type="button" class="th-sort ${sortKey === k ? 'on' : ''}" data-sort="${k}" title="${t(`tr_${k}` as Key)}">${SHORT[getLang()][k]}</button></th>`,
    ).join('');
    root.innerHTML = `
      <section class="hero"><div><h1>${t('coaches')}</h1><p>${t('menuCoachesSub')}</p></div>
        <div class="seg" role="group">${(['all', 'epl', 'legends'] as const)
          .map((g) => `<button type="button" data-filter="${g}" aria-pressed="${filter === g}">${g === 'all' ? t('all') : t(`grp_${g}` as Key)}</button>`)
          .join('')}</div></section>
      <div class="coaches-grid">
        <div class="panel" style="padding:12px;overflow-x:auto">
          <table class="table coach-table"><thead><tr><th class="name-cell"><button type="button" class="th-sort ${sortKey === 'name' ? 'on' : ''}" data-sort="name">${t('nameCol')}</button></th><th class="name-cell">${t('formation')}</th>${head}</tr></thead>
          <tbody>${rows
            .map(
              (c) => `<tr class="${c.id === sel.id ? 'sel' : ''}" data-id="${c.id}"><td class="name-cell"><span class="cell-flex">${coachAvatar(c, 26)}${esc(coachName(c))}</span></td>
              <td class="name-cell muted num">${c.formations[0]}</td>${TRAIT_KEYS.map((k) => `<td class="${traitClass(c.traits[k])}">${c.traits[k]}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody></table>
        </div>
        <div class="panel" style="padding:16px;align-self:start;position:sticky;top:76px">${coachCard(sel)}
          <h3 style="margin-top:14px">${t('coachEffect')}</h3>
          <ul class="effects">${TRAIT_KEYS.map((k) => `<li><b>${t(`tr_${k}` as Key)}</b> — ${t(`ef_${k}` as Key)}</li>`).join('')}</ul>
        </div>
      </div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        filter = b.dataset.filter as typeof filter;
        draw();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) =>
      b.addEventListener('click', () => {
        sortKey = b.dataset.sort as typeof sortKey;
        draw();
      }),
    );
    root.querySelectorAll<HTMLTableRowElement>('tr[data-id]').forEach((tr) =>
      tr.addEventListener('click', () => {
        selected = tr.dataset.id!;
        draw();
      }),
    );
  };
  draw();
}
