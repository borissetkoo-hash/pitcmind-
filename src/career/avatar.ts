/**
 * Coach face builder, in the spirit of the old FIFA "create a manager" screen:
 * a handful of drawn assets per category, combined into one SVG portrait.
 */
export interface AvatarLook {
  skin: number;
  hair: number;
  hairColor: number;
  beard: number;
  glasses: number;
  outfit: number;
}

export const SKIN_TONES = ['#f6d5bd', '#eab894', '#d49b6c', '#b47649', '#8c5632', '#5f3a22'];
export const HAIR_COLORS = ['#1d1b1a', '#3d2b1f', '#6c4a2c', '#c9a15a', '#a9532b', '#8f9296', '#e4e4e2'];

export interface Outfit {
  jacket: string;
  shirt: string;
  tie: string | null;
  kind: 'suit' | 'track' | 'knit' | 'coat';
}

export const OUTFITS: Outfit[] = [
  { kind: 'suit', jacket: '#1d2a44', shirt: '#f4f6fa', tie: '#9b1c2c' },
  { kind: 'suit', jacket: '#33363d', shirt: '#dfe7f2', tie: null },
  { kind: 'coat', jacket: '#16181d', shirt: '#2c3e5a', tie: null },
  { kind: 'track', jacket: '#1e5bbf', shirt: '#ffffff', tie: null },
  { kind: 'knit', jacket: '#141414', shirt: '#141414', tie: null },
  { kind: 'track', jacket: '#3a3f47', shirt: '#9be15d', tie: null },
];

/** Option labels for the creator UI (RU / EN). */
export const LOOK_LABELS = {
  skin: { ru: ['Светлый', 'Светлый тёплый', 'Средний', 'Смуглый', 'Тёмный', 'Очень тёмный'], en: ['Fair', 'Light', 'Medium', 'Tan', 'Dark', 'Deep'] },
  hair: {
    ru: ['Лысый', 'Ёжик', 'Короткая с пробором', 'Зачёс назад', 'Кудри', 'Длинные', 'Залысины', 'Седые виски'],
    en: ['Bald', 'Buzz cut', 'Side parting', 'Slicked back', 'Curly', 'Long', 'Receding', 'Horseshoe'],
  },
  hairColor: { ru: ['Чёрные', 'Тёмно-каштановые', 'Каштановые', 'Светлые', 'Рыжие', 'С проседью', 'Седые'], en: ['Black', 'Dark brown', 'Brown', 'Blond', 'Ginger', 'Greying', 'White'] },
  beard: { ru: ['Без бороды', 'Щетина', 'Борода', 'Эспаньолка', 'Усы'], en: ['Clean-shaven', 'Stubble', 'Full beard', 'Goatee', 'Moustache'] },
  glasses: { ru: ['Без очков', 'Прямоугольные', 'Круглые'], en: ['None', 'Rectangular', 'Round'] },
  outfit: { ru: ['Костюм с галстуком', 'Костюм без галстука', 'Пальто', 'Клубный спортивный костюм', 'Водолазка', 'Тренировочная кофта'], en: ['Suit and tie', 'Open-collar suit', 'Overcoat', 'Club tracksuit', 'Turtleneck', 'Training top'] },
} as const;

export type LookKey = keyof AvatarLook;
export const LOOK_KEYS: LookKey[] = ['skin', 'hair', 'hairColor', 'beard', 'glasses', 'outfit'];
export const LOOK_COUNTS: Record<LookKey, number> = {
  skin: SKIN_TONES.length,
  hair: LOOK_LABELS.hair.en.length,
  hairColor: HAIR_COLORS.length,
  beard: LOOK_LABELS.beard.en.length,
  glasses: LOOK_LABELS.glasses.en.length,
  outfit: OUTFITS.length,
};

export const DEFAULT_LOOK: AvatarLook = { skin: 1, hair: 2, hairColor: 1, beard: 1, glasses: 0, outfit: 0 };

export function randomLook(rand: () => number = Math.random): AvatarLook {
  const pick = (k: LookKey) => Math.floor(rand() * LOOK_COUNTS[k]);
  return { skin: pick('skin'), hair: pick('hair'), hairColor: pick('hairColor'), beard: pick('beard'), glasses: rand() < 0.7 ? 0 : pick('glasses'), outfit: pick('outfit') };
}

/** Darkens a #rrggbb colour by a factor (0..1). */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hairPath(style: number, color: string): string {
  const fill = `fill="${color}"`;
  switch (style) {
    case 1: // buzz cut
      return `<path ${fill} opacity=".82" d="M38.5 50c-1-17 9-27 21.5-27s22.5 10 21.5 27c-3-9-10-14-21.5-14s-18.5 5-21.5 14z"/>`;
    case 2: // side parting
      return `<path ${fill} d="M37.5 52c-3-21 8-31 23-31 16 0 26 10 23 31-2-7-4-11-7-13-9 2-20 1-28-4-5 3-9 9-11 17z"/>`;
    case 3: // slicked back
      return `<path ${fill} d="M38 49c-1-19 9-28 22-28s23 9 22 28c-3-6-8-10-14-11-5-1-11-1-16 0-6 1-11 5-14 11z"/><path fill="none" stroke="${shade(color, 1.35)}" stroke-width=".8" opacity=".5" d="M47 30c5-3 21-3 26 0M45 34c7-3 23-3 30 0"/>`;
    case 4: // curly
      return `<g ${fill}>${[
        [42, 40], [47, 32], [54, 27], [62, 26], [70, 29], [76, 35], [79, 43], [40, 47], [50, 36], [60, 33], [69, 36], [80, 50],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.2"/>`)
        .join('')}</g>`;
    case 5: // long
      return `<path ${fill} d="M36 70c-4-12-3-24-1-32 4-12 13-17 25-17s21 5 25 17c2 8 3 20-1 32-2-10-3-18-4-24-7-6-12-9-20-9s-13 3-20 9c-1 6-2 14-4 24z"/>`;
    case 6: // receding
      return `<path ${fill} d="M38.5 54c-2-14 2-23 9-27-2 6-3 12-2 18-3 2-5 5-7 9zM81.5 54c2-14-2-23-9-27 2 6 3 12 2 18 3 2 5 5 7 9z"/><path ${fill} opacity=".75" d="M52 26c5-2 11-2 16 0-3 3-5 6-8 6s-5-3-8-6z"/>`;
    case 7: // horseshoe: sides only
      return `<path ${fill} d="M38.5 58c-2-9-1-15 2-19 1 6 2 11 5 14-3 1-5 3-7 5zM81.5 58c2-9 1-15-2-19-1 6-2 11-5 14 3 1 5 3 7 5z"/>`;
    default:
      return '';
  }
}

function beardPath(style: number, color: string): string {
  switch (style) {
    case 1:
      return `<path fill="${color}" opacity=".28" d="M40 56c1 15 9 25 20 25s19-10 20-25c-3 8-6 13-9 15-3-2-7-3-11-3s-8 1-11 3c-3-2-6-7-9-15z"/>`;
    case 2:
      return `<path fill="${color}" d="M39.5 54c-1 19 9 30 20.5 30s21.5-11 20.5-30c-2 7-5 12-9 15-3-3-7-4-11.5-4s-8.5 1-11.5 4c-4-3-7-8-9-15z"/>`;
    case 3:
      return `<path fill="${color}" d="M53 69c2-2 4-3 7-3s5 1 7 3c-1 6-3 10-7 10s-6-4-7-10z"/><path fill="${color}" d="M52 67c3-3 13-3 16 0-3-1-13-1-16 0z"/>`;
    case 4:
      return `<path fill="${color}" d="M51 67.5c3-3 15-3 18 0 1 1 0 2-1 2-4-1-12-1-16 0-1 0-2-1-1-2z"/>`;
    default:
      return '';
  }
}

function outfitPath(o: Outfit): string {
  const body = `<path fill="${o.jacket}" d="M8 120c3-22 17-33 34-36l18 6 18-6c17 3 31 14 34 36z"/>`;
  switch (o.kind) {
    case 'suit':
      return `${body}<path fill="${o.shirt}" d="M48 84l12 22 12-22-12 5z"/>${
        o.tie ? `<path fill="${o.tie}" d="M57.5 89h5l1.5 4-2 15-2.5 3-2.5-3-2-15z"/>` : `<path fill="${shade(o.shirt, 0.85)}" d="M56 89l4 7 4-7z"/>`
      }<path fill="${shade(o.jacket, 0.7)}" d="M42 84l18 26-10-4-6-6zM78 84l-18 26 10-4 6-6z"/>`;
    case 'coat':
      return `${body}<path fill="${o.shirt}" d="M46 84c4 6 9 9 14 9s10-3 14-9l-3 12c-4 2-7 3-11 3s-7-1-11-3z"/><path fill="${shade(o.jacket, 1.6)}" d="M42 84l10 30-6-2-8-20z" opacity=".5"/>`;
    case 'track':
      return `${body}<path fill="${o.shirt}" d="M48 84c3 4 7 6 12 6s9-2 12-6l2 3c-4 5-9 7-14 7s-10-2-14-7z"/><path stroke="${o.shirt}" stroke-width="1.5" d="M60 94v26"/><path stroke="${o.shirt}" stroke-width="2.5" opacity=".7" d="M20 104l10 16M100 104l-10 16"/>`;
    default: // knit / turtleneck
      return `${body}<path fill="${shade(o.jacket, 1.25)}" d="M48 78h24v10c-4 3-8 4-12 4s-8-1-12-4z"/>`;
  }
}

/** Renders the coach portrait as an inline SVG string. */
export function avatarSvg(look: AvatarLook, size = 96, background = '#1c2940'): string {
  const skin = SKIN_TONES[look.skin % SKIN_TONES.length];
  const skinShade = shade(skin, 0.82);
  const hair = HAIR_COLORS[look.hairColor % HAIR_COLORS.length];
  const brow = look.hairColor >= 5 ? shade(hair, 0.7) : shade(hair, 0.9);
  const outfit = OUTFITS[look.outfit % OUTFITS.length];
  const glasses =
    look.glasses === 1
      ? `<g fill="none" stroke="#151515" stroke-width="1.6"><rect x="45" y="48.5" width="12" height="8" rx="1.5"/><rect x="63" y="48.5" width="12" height="8" rx="1.5"/><path d="M57 52h6M45 51l-5-1M75 51l5-1"/></g>`
      : look.glasses === 2
        ? `<g fill="none" stroke="#3a2a1a" stroke-width="1.5"><circle cx="51" cy="53" r="6"/><circle cx="69" cy="53" r="6"/><path d="M57 52.5h6M45 52l-5-1M75 52l5-1"/></g>`
        : '';
  return `<svg class="avatar-svg" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-hidden="true">
    <defs><clipPath id="avc"><circle cx="60" cy="60" r="60"/></clipPath></defs>
    <g clip-path="url(#avc)">
      <rect width="120" height="120" fill="${background}"/>
      <circle cx="60" cy="44" r="46" fill="#ffffff" opacity=".04"/>
      ${outfitPath(outfit)}
      <path fill="${skinShade}" d="M51 68h18v16c-3 4-6 6-9 6s-6-2-9-6z"/>
      <ellipse cx="38.5" cy="55" rx="4" ry="6.5" fill="${skinShade}"/>
      <ellipse cx="81.5" cy="55" rx="4" ry="6.5" fill="${skinShade}"/>
      <ellipse cx="60" cy="52" rx="21.5" ry="26" fill="${skin}"/>
      ${hairPath(look.hair, hair)}
      <path stroke="${brow}" stroke-width="2.4" stroke-linecap="round" d="M46 45.5l9-1.5M65 44l9 1.5"/>
      <ellipse cx="51" cy="53" rx="2.3" ry="2.6" fill="#1b1b1b"/>
      <ellipse cx="69" cy="53" rx="2.3" ry="2.6" fill="#1b1b1b"/>
      <path fill="none" stroke="${shade(skin, 0.68)}" stroke-width="1.4" stroke-linecap="round" d="M60 55l-3 8.5h5"/>
      ${beardPath(look.beard, hair)}
      <path fill="none" stroke="#7d3b2f" stroke-width="1.8" stroke-linecap="round" d="M54 71q6 3 12 0"/>
      ${glasses}
    </g>
  </svg>`;
}
