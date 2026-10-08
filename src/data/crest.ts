/**
 * Original club crests, drawn procedurally: a shield shape, a field pattern, a medallion with a
 * simple emblem and a banner with the club's initials, all in the club's colours. Generic
 * heraldry only — no element of any real club's badge is reproduced.
 */
export interface CrestDesign {
  shape: number;
  pattern: number;
  emblem: number;
}

export const CREST_SHAPES = 5;
export const CREST_PATTERNS = 8;
export const CREST_EMBLEMS = 8;

const SHAPES = [
  'M12 8H88V46C88 72 70 87 50 96 30 87 12 72 12 46Z', // classic shield
  'M50 4A46 46 0 1 1 49.9 4Z', // roundel
  'M14 8H86V58Q86 82 50 96 14 82 14 58Z', // french shield
  'M26 8H74Q92 8 92 26V74Q92 92 74 92H26Q8 92 8 74V26Q8 8 26 8Z', // rounded badge
  'M50 4L90 16V52C90 76 70 90 50 97 30 90 10 76 10 52V16Z', // peaked shield
];

function pattern(i: number, b: string): string {
  switch (i) {
    case 1: // vertical stripes
      return [0, 2, 4].map((k) => `<rect x="${10 + k * 16}" y="0" width="16" height="100" fill="${b}"/>`).join('');
    case 2: // horizontal band
      return `<rect x="0" y="38" width="100" height="24" fill="${b}"/>`;
    case 3: // diagonal sash
      return `<path d="M-10 18L18 -10 110 82 82 110Z" fill="${b}"/>`;
    case 4: // halves
      return `<rect x="50" y="0" width="50" height="100" fill="${b}"/>`;
    case 5: // quartered
      return `<rect x="50" y="0" width="50" height="50" fill="${b}"/><rect x="0" y="50" width="50" height="50" fill="${b}"/>`;
    case 6: // chevron
      return `<path d="M0 62L50 30 100 62V80L50 48 0 80Z" fill="${b}"/>`;
    case 7: // hoops
      return [0, 2, 4].map((k) => `<rect x="0" y="${8 + k * 16}" width="100" height="8" fill="${b}"/>`).join('');
    default:
      return '';
  }
}

function emblem(i: number, c: string): string {
  switch (i) {
    case 0: // star
      return `<path fill="${c}" d="M50 30l5.3 11 12 1.7-8.7 8.4 2 12L50 57.4 39.4 63.1l2-12-8.7-8.4 12-1.7z"/>`;
    case 1: // ball
      return `<circle cx="50" cy="46" r="13" fill="none" stroke="${c}" stroke-width="2.6"/><path fill="${c}" d="M50 40l5.7 4.1-2.2 6.7h-7l-2.2-6.7z"/><path stroke="${c}" stroke-width="1.6" d="M50 40v-7M55.7 44.1l6.5-2.3M53.5 50.8l4 5.6M46.5 50.8l-4 5.6M44.3 44.1l-6.5-2.3"/>`;
    case 2: // crown
      return `<path fill="${c}" d="M35 56h30l3-20-9 8-9-12-9 12-9-8z"/><rect x="35" y="58" width="30" height="4" fill="${c}"/>`;
    case 3: // tower
      return `<path fill="${c}" d="M38 60V36h4v4h4v-4h8v4h4v-4h4v24z"/><rect x="47" y="50" width="6" height="10" fill="#00000055"/>`;
    case 4: // waves
      return `<path fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" d="M34 40q4-4 8 0t8 0 8 0 8 0M34 48q4-4 8 0t8 0 8 0 8 0M34 56q4-4 8 0t8 0 8 0 8 0"/>`;
    case 5: // three stars
      return [36, 50, 64].map((x) => `<path fill="${c}" transform="translate(${x - 50} ${x === 50 ? -4 : 2}) scale(1)" d="M50 38l2.6 5.4 6 .9-4.3 4.2 1 5.9L50 51.6l-5.3 2.8 1-5.9-4.3-4.2 6-.9z"/>`).join('');
    case 6: // oak leaf / laurel
      return `<path fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" d="M42 62c-8-8-8-20 0-28M58 62c8-8 8-20 0-28"/><path fill="${c}" d="M40 40l-5-2 2 5zM39 48l-5-1 3 4zM41 56l-4 1 4 3zM60 40l5-2-2 5zM61 48l5-1-3 4zM59 56l4 1-4 3z"/><circle cx="50" cy="47" r="4" fill="${c}"/>`;
    default: // anchor
      return `<path fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" d="M50 34v26M42 40h16M38 52q2 9 12 9t12-9"/><circle cx="50" cy="32" r="3" fill="none" stroke="${c}" stroke-width="2.5"/>`;
  }
}

/** Picks a stable design from a club id, so every club keeps its look. */
export function designFor(id: string): CrestDesign {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return { shape: h % CREST_SHAPES, pattern: (h >>> 8) % CREST_PATTERNS, emblem: (h >>> 16) % CREST_EMBLEMS };
}

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

let uid = 0;

export function crestSvg(d: CrestDesign, colors: { primary: string; secondary: string }, initials: string, size = 44): string {
  const id = `cr${uid++}`;
  const shape = SHAPES[d.shape % SHAPES.length];
  const a = colors.primary;
  const b = colors.secondary;
  // The medallion and banner take whichever colour contrasts with the field.
  const ink = lum(a) > 0.6 ? '#13213a' : '#ffffff';
  const banner = lum(b) > 0.6 ? b : '#ffffff';
  const bannerInk = lum(banner) > 0.6 ? '#13213a' : '#ffffff';
  return `<svg class="crest-svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
    <path d="${shape}" fill="${a}"/>
    <g clip-path="url(#${id})">${pattern(d.pattern % CREST_PATTERNS, b)}</g>
    <circle cx="50" cy="46" r="20" fill="${a}" stroke="${banner}" stroke-width="3"/>
    ${emblem(d.emblem % CREST_EMBLEMS, ink)}
    <g clip-path="url(#${id})"><rect x="0" y="70" width="100" height="14" fill="${banner}"/></g>
    <text x="50" y="80.5" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="10" letter-spacing=".5" fill="${bannerInk}">${initials.slice(0, 4).replace(/[&<>"]/g, '')}</text>
    <path d="${shape}" fill="none" stroke="${b}" stroke-width="4"/>
    <path d="${shape}" fill="none" stroke="#0b1220" stroke-opacity=".35" stroke-width="1"/>
  </svg>`;
}
