import { CLUBS, clubById } from '../data/clubs';
import { clubLogo, crestHtml, defaultIdentity, getOverride, importLogo, loadLogos, removeLogo, resetClub, setOverride } from '../data/clubCustom';
import { getLang } from '../i18n';

const L = {
  ru: {
    title: 'Редактор клубов', sub: 'Переименуйте клубы, поменяйте цвета и загрузите эмблемы из своих файлов — как «real name fix» в Football Manager.',
    note: 'Названия, цвета и эмблемы хранятся только в этом браузере: они никуда не загружаются и не попадают в публикацию игры.',
    name: 'Название', short: 'Сокращение', city: 'Город', colors: 'Цвета формы', primary: 'Основной', secondary: 'Отделка', text: 'Номера',
    upload: 'Загрузить эмблему', replace: 'Заменить эмблему', removeLogo: 'Убрать эмблему', reset: 'Вернуть исходный клуб', original: 'Исходно',
    bad: 'Не удалось прочитать картинку. Подойдут PNG, JPG, WebP или SVG.',
  },
  en: {
    title: 'Club editor', sub: 'Rename clubs, change their colours and add crests from your own files — like a “real name fix” in Football Manager.',
    note: 'Names, colours and crests stay in this browser only: they are never uploaded and are not part of the published game.',
    name: 'Name', short: 'Short name', city: 'City', colors: 'Kit colours', primary: 'Main', secondary: 'Trim', text: 'Numbers',
    upload: 'Upload crest', replace: 'Replace crest', removeLogo: 'Remove crest', reset: 'Restore original club', original: 'Originally',
    bad: 'Could not read that image. PNG, JPG, WebP or SVG work.',
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderClubs(root: HTMLElement): void {
  const l = L[getLang()];
  const card = (id: string, msg = '') => {
    const c = clubById(id);
    const o = getOverride(id);
    const d = defaultIdentity(id);
    const custom = Object.keys(o).length > 0 || !!clubLogo(id);
    return `<article class="panel club-edit" data-id="${id}">
      <div class="ce-head">${crestHtml(c, 64)}<div><b class="ce-name">${esc(c.name)}</b>
        ${custom ? `<div class="muted">${l.original}: ${esc(d.name)}</div>` : `<div class="muted">${esc(c.city)}</div>`}</div></div>
      <div class="ce-fields">
        <label class="field"><span>${l.name}</span><input id="name-${id}" data-f="name" maxlength="32" value="${esc(c.name)}"></label>
        <label class="field ce-short"><span>${l.short}</span><input id="short-${id}" data-f="short" maxlength="4" value="${esc(c.short)}"></label>
        <label class="field"><span>${l.city}</span><input id="city-${id}" data-f="city" maxlength="24" value="${esc(c.city)}"></label>
      </div>
      <div class="ce-colors"><span class="muted">${l.colors}</span>
        ${(['primary', 'secondary', 'text'] as const)
          .map((k) => `<label class="swatch"><input id="${k}-${id}" type="color" data-f="${k}" value="${c.colors[k]}"><span>${l[k]}</span></label>`)
          .join('')}</div>
      <div class="ce-actions">
        <label class="btn small primary" for="logo-${id}">${clubLogo(id) ? l.replace : l.upload}</label>
        <input id="logo-${id}" type="file" accept="image/*" hidden>
        ${clubLogo(id) ? `<button class="btn small" type="button" data-act="unlogo">${l.removeLogo}</button>` : ''}
        <span class="sep"></span>
        ${custom ? `<button class="btn small" type="button" data-act="reset">${l.reset}</button>` : ''}
      </div>
      <p class="form-error" role="alert">${esc(msg)}</p>
    </article>`;
  };

  const bind = (el: HTMLElement) => {
    const id = el.dataset.id!;
    const redraw = (msg = '') => {
      el.outerHTML = card(id, msg);
      bind(root.querySelector<HTMLElement>(`.club-edit[data-id="${id}"]`)!);
    };
    el.querySelectorAll<HTMLInputElement>('input[data-f]').forEach((inp) => {
      // Live preview while typing; save when the field is committed.
      if (inp.dataset.f === 'name') inp.addEventListener('input', () => (el.querySelector('.ce-name')!.textContent = inp.value || '—'));
      inp.addEventListener('change', () => {
        setOverride(id, { [inp.dataset.f!]: inp.value.trim() });
        redraw();
      });
    });
    el.querySelector<HTMLInputElement>(`#logo-${id}`)!.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const r = await importLogo(id, file);
      redraw(r.added ? '' : l.bad);
    });
    el.querySelector('[data-act="unlogo"]')?.addEventListener('click', async () => {
      await removeLogo(id);
      redraw();
    });
    el.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
      await resetClub(id);
      redraw();
    });
  };

  root.innerHTML = `<section class="hero"><div><h1>${l.title}</h1><p>${l.sub}</p></div></section>
    <p class="muted club-note">${l.note}</p>
    <div class="club-edit-grid">${CLUBS.map((c) => card(c.id)).join('')}</div>`;
  root.querySelectorAll<HTMLElement>('.club-edit').forEach(bind);
  void loadLogos();
}
