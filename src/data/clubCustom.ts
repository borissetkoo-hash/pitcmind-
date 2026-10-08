import type { ClubData } from '../engine/types';
import { createImageStore, type ImportResult } from '../storage/imageStore';
import { CLUBS } from './clubs';
import { crestSvg, designFor } from './crest';

/**
 * Player-made "real name fix": clubs can be renamed, recoloured and given a crest imported
 * from the player's own files. Like FM's community packs, this lives only in this browser:
 * the game itself ships fictional clubs.
 */
export interface ClubOverride {
  name?: string;
  short?: string;
  city?: string;
  primary?: string;
  secondary?: string;
  text?: string;
}

const KEY = 'pm-clubs-v1';
const logos = createImageStore({ db: 'pm-logos', max: 200, size: 192, fit: 'contain', store: 'logos' });

/** The shipped (fictional) identity of every club, for resets. */
const DEFAULTS = new Map(CLUBS.map((c) => [c.id, { name: c.name, short: c.short, city: c.city, colors: { ...c.colors } }]));

function readOverrides(): Record<string, ClubOverride> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeOverrides(o: Record<string, ClubOverride>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage blocked: changes last for this visit */
  }
}

let overrides = readOverrides();

/** Applies saved names and colours to the shared club objects (every view reads these). */
export function applyClubOverrides(): void {
  for (const c of CLUBS) {
    const d = DEFAULTS.get(c.id)!;
    const o = overrides[c.id] ?? {};
    c.name = o.name || d.name;
    c.short = (o.short || d.short).toUpperCase().slice(0, 4);
    c.city = o.city || d.city;
    c.colors = { primary: o.primary || d.colors.primary, secondary: o.secondary || d.colors.secondary, text: o.text || d.colors.text };
  }
}

export function getOverride(id: string): ClubOverride {
  return { ...(overrides[id] ?? {}) };
}

export function setOverride(id: string, patch: ClubOverride): void {
  overrides = { ...overrides, [id]: { ...overrides[id], ...patch } };
  writeOverrides(overrides);
  applyClubOverrides();
}

export async function resetClub(id: string): Promise<void> {
  const { [id]: _, ...rest } = overrides;
  overrides = rest;
  writeOverrides(overrides);
  applyClubOverrides();
  await logos.remove(id);
}

export const defaultIdentity = (id: string) => DEFAULTS.get(id)!;
export const loadLogos = () => logos.load();
export const clubLogo = (id: string) => logos.get(id)?.dataUrl;
export const importLogo = (id: string, file: File): Promise<ImportResult> => logos.import([file], () => id);
export const removeLogo = (id: string) => logos.remove(id);

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** A club's crest: the imported logo when there is one, otherwise the coloured monogram badge. */
export function crestHtml(c: ClubData, size = 44): string {
  const logo = clubLogo(c.id);
  if (logo) return `<span class="crest crest-logo" style="width:${size}px;height:${size}px"><img src="${logo}" alt="${esc(c.name)}" width="${size}" height="${size}"></span>`;
  return `<span class="crest crest-gen" style="width:${size}px;height:${size}px">${crestSvg(designFor(c.id), c.colors, c.short, size)}</span>`;
}
