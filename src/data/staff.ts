import { type AvatarLook } from '../career/avatar';
import { Rng, hashString } from '../engine/rng';
import type { CoachTraits } from '../engine/types';
import { CLUB_SEEDS, leagueById } from './clubSeeds';
import type { Coach } from './coaches';
import { FIRST_NAMES, LAST_NAMES, NAMES_BY_COUNTRY } from './names';

/** Set-ups a generated club coach can have (mirrors the career philosophies). */
const PRESETS: { formation: Coach['formations'][number]; tactics: Coach['tactics']; focus: (keyof CoachTraits)[]; ru: string; en: string }[] = [
  { formation: '4-2-3-1', tactics: { mentality: 0, pressing: 0.55, lineHeight: 0.55, width: 0.6, directness: 0.45, tempo: 0.55, shootingRange: 0.5, crossing: 0.5, tackling: 0.5 }, focus: ['organisation', 'passing'],
    ru: 'Сбалансированный подход без явных слабостей.', en: 'A balanced approach with no obvious weaknesses.' },
  { formation: '4-3-3', tactics: { mentality: 0.5, pressing: 0.65, lineHeight: 0.65, width: 0.7, directness: 0.25, tempo: 0.45, shootingRange: 0.4, crossing: 0.4, tackling: 0.45 }, focus: ['passing', 'pressing'],
    ru: 'Контроль мяча и терпеливое построение атак.', en: 'Ball control and patient build-up.' },
  { formation: '4-3-3', tactics: { mentality: 0.5, pressing: 0.85, lineHeight: 0.7, width: 0.65, directness: 0.5, tempo: 0.75, shootingRange: 0.5, crossing: 0.5, tackling: 0.65 }, focus: ['pressing', 'fitness'],
    ru: 'Высокий прессинг и интенсивность.', en: 'High pressing and intensity.' },
  { formation: '4-4-2', tactics: { mentality: -1, pressing: 0.45, lineHeight: 0.35, width: 0.5, directness: 0.6, tempo: 0.5, shootingRange: 0.55, crossing: 0.6, tackling: 0.65 }, focus: ['organisation', 'setPieces'],
    ru: 'Надёжная оборона и стандарты.', en: 'A solid defence and set pieces.' },
  { formation: '3-4-2-1', tactics: { mentality: -0.5, pressing: 0.5, lineHeight: 0.4, width: 0.6, directness: 0.7, tempo: 0.75, shootingRange: 0.55, crossing: 0.55, tackling: 0.55 }, focus: ['counter', 'organisation'],
    ru: 'Компактный блок и быстрые контратаки.', en: 'A compact block and quick counter-attacks.' },
  { formation: '4-4-2', tactics: { mentality: 0, pressing: 0.55, lineHeight: 0.45, width: 0.65, directness: 0.85, tempo: 0.6, shootingRange: 0.6, crossing: 0.8, tackling: 0.65 }, focus: ['aerial', 'setPieces'],
    ru: 'Прямой футбол: навесы и борьба в воздухе.', en: 'Direct football: crosses and aerial battles.' },
];

const FLAGS = { eng: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', esp: '🇪🇸', ita: '🇮🇹', ger: '🇩🇪', bra: '🇧🇷', intl: '🌐' } as const;

/** Deterministic coach for a club that has no real-world coach assigned. */
function generate(clubId: string, strength: number, country: keyof typeof FLAGS): Coach {
  const rng = new Rng(hashString(`coach-${clubId}`));
  const pool = country === 'intl' ? { first: FIRST_NAMES, last: LAST_NAMES } : NAMES_BY_COUNTRY[country];
  const name = `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
  const preset = PRESETS[rng.int(0, PRESETS.length - 1)];
  // Bigger clubs hire better coaches: base 10–13, plus the preset's specialities.
  const base = 10 + Math.max(0, Math.round((strength - 68) / 4));
  const traits = {} as CoachTraits;
  for (const k of ['passing', 'organisation', 'pressing', 'counter', 'setPieces', 'aerial', 'fitness'] as (keyof CoachTraits)[]) {
    traits[k] = Math.max(6, Math.min(18, base + rng.int(-2, 1) + (preset.focus.includes(k) ? 3 : 0)));
  }
  const look: AvatarLook = {
    skin: country === 'bra' ? rng.int(1, 5) : rng.int(0, 3),
    hair: rng.int(0, 7),
    hairColor: rng.int(0, 6),
    beard: rng.int(0, 4),
    glasses: rng.chance(0.25) ? rng.int(1, 2) : 0,
    outfit: rng.int(0, 5),
  };
  return {
    id: `staff-${clubId}`, name, nameRu: name, flag: FLAGS[country], group: 'staff',
    formations: [preset.formation], tactics: preset.tactics, traits, style: { ru: preset.ru, en: preset.en }, look,
  };
}

export const STAFF: Coach[] = CLUB_SEEDS.filter((s) => !s.coach).map((s) => generate(s.id, s.strength, leagueById(s.league).country));
