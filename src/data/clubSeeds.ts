/**
 * Club and league definitions. Clubs from real countries use altered, unlicensed-style
 * names (city plus colours or nickname) and original procedural crests — no real club
 * names or badges are reproduced. Strength is the average attribute level of the squad.
 */
export interface ClubSeed {
  id: string;
  name: string;
  short: string;
  city: string;
  strength: number;
  primary: string;
  secondary: string;
  text: string;
  /** Head coach id; clubs without one get a generated coach (see staff.ts). */
  coach?: string;
  league: string;
}

export interface LeagueDef {
  id: string;
  flag: string;
  ru: string;
  en: string;
  /** Used for generated players' and coaches' names. */
  country: 'eng' | 'esp' | 'ita' | 'ger' | 'bra' | 'intl';
}

export const LEAGUES: LeagueDef[] = [
  { id: 'eng', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ru: 'Англия · Высший дивизион', en: 'England · Top Division', country: 'eng' },
  { id: 'esp', flag: '🇪🇸', ru: 'Испания · Высший дивизион', en: 'Spain · Top Division', country: 'esp' },
  { id: 'ita', flag: '🇮🇹', ru: 'Италия · Высший дивизион', en: 'Italy · Top Division', country: 'ita' },
  { id: 'ger', flag: '🇩🇪', ru: 'Германия · Высший дивизион', en: 'Germany · Top Division', country: 'ger' },
  { id: 'bra', flag: '🇧🇷', ru: 'Бразилия · Высший дивизион', en: 'Brazil · Top Division', country: 'bra' },
  { id: 'nor', flag: '🌐', ru: 'Северная лига', en: 'Northern League', country: 'intl' },
];

type Row = [id: string, name: string, short: string, city: string, strength: number, primary: string, secondary: string, text: string, coach?: string];

const ROWS: Record<string, Row[]> = {
  eng: [
    ['mnr', 'Manchester', 'MNR', 'Manchester', 76, '#da291c', '#ffffff', '#ffffff', 'ten-hag'],
    ['mnb', 'Manchester Blue', 'MNB', 'Manchester', 80, '#6cabdd', '#1c2c5b', '#1c2c5b', 'guardiola'],
    ['mrr', 'Merseyside Red', 'MRR', 'Liverpool', 80, '#c8102e', '#ffffff', '#ffffff', 'slot'],
    ['lnb', 'London Blue', 'LNB', 'London', 76, '#034694', '#ffffff', '#ffffff', 'maresca'],
    ['nln', 'North London', 'NLN', 'London', 79, '#ef0107', '#ffffff', '#ffffff', 'arteta'],
    ['lnw', 'London White', 'LNW', 'London', 74, '#ffffff', '#132257', '#132257', 'postecoglou'],
    ['tyn', 'Tyneside', 'TYN', 'Newcastle', 75, '#241f20', '#ffffff', '#ffffff', 'howe'],
    ['bhm', 'Birmingham Claret', 'BHC', 'Birmingham', 74, '#670e36', '#95bfe5', '#ffffff', 'emery'],
    ['eln', 'East London', 'ELN', 'London', 71, '#7a263a', '#1bb1e7', '#ffffff', 'lopetegui'],
    ['mrb', 'Merseyside Blue', 'MRB', 'Liverpool', 69, '#003399', '#ffffff', '#ffffff', 'dyche'],
  ],
  esp: [
    ['mdb', 'Madrid Blanco', 'MDB', 'Madrid', 81, '#ffffff', '#febe10', '#1a237e', 'ancelotti'],
    ['cat', 'Catalunya', 'CAT', 'Barcelona', 80, '#a50044', '#004d98', '#ffffff'],
    ['mdr', 'Madrid Rojiblanco', 'MDR', 'Madrid', 77, '#cb3524', '#ffffff', '#ffffff', 'simeone'],
    ['vlc', 'Valencia Ciutat', 'VLC', 'Valencia', 68, '#ffffff', '#111111', '#111111'],
    ['svr', 'Sevilla Rojo', 'SVR', 'Sevilla', 71, '#d4021d', '#ffffff', '#ffffff'],
    ['svv', 'Sevilla Verde', 'SVV', 'Sevilla', 72, '#00954c', '#ffffff', '#ffffff'],
    ['bzk', 'Bizkaia', 'BZK', 'Bilbao', 74, '#ee2523', '#ffffff', '#ffffff'],
    ['dns', 'Donostia', 'DNS', 'San Sebastián', 73, '#0067b1', '#ffffff', '#ffffff'],
    ['cst', 'Castellón Amarillo', 'CAM', 'Vila-real', 73, '#ffe667', '#005187', '#005187'],
    ['vgo', 'Vigo Celeste', 'VGO', 'Vigo', 69, '#8ac3ee', '#ffffff', '#0a2a4a'],
  ],
  ita: [
    ['tbn', 'Torino Bianconero', 'TBN', 'Torino', 77, '#111111', '#ffffff', '#ffffff', 'allegri'],
    ['mnz', 'Milano Nerazzurro', 'MNZ', 'Milano', 80, '#0068a8', '#111111', '#ffffff'],
    ['mrn', 'Milano Rossonero', 'MRN', 'Milano', 76, '#fb090b', '#111111', '#ffffff'],
    ['nap', 'Napoli Azzurro', 'NAP', 'Napoli', 77, '#12a0d7', '#ffffff', '#ffffff', 'conte'],
    ['rgr', 'Roma Giallorossa', 'RGR', 'Roma', 73, '#8e1f2f', '#f0bc42', '#f0bc42'],
    ['rbc', 'Roma Biancoceleste', 'RBC', 'Roma', 73, '#87d8f7', '#ffffff', '#0b2c5f'],
    ['brg', 'Bergamo', 'BRG', 'Bergamo', 76, '#1e71b8', '#111111', '#ffffff'],
    ['fir', 'Firenze Viola', 'FIR', 'Firenze', 72, '#482e92', '#ffffff', '#ffffff'],
    ['blg', 'Bologna Rossoblù', 'BLG', 'Bologna', 71, '#a21c26', '#1a2f48', '#ffffff'],
    ['tgr', 'Torino Granata', 'TGR', 'Torino', 68, '#8a1e03', '#ffffff', '#ffffff'],
  ],
  ger: [
    ['mnc', 'München Rot', 'MÜR', 'München', 82, '#dc052d', '#0066b2', '#ffffff'],
    ['dtm', 'Dortmund Gelb', 'DTM', 'Dortmund', 77, '#fde100', '#111111', '#111111'],
    ['lvk', 'Leverkusen', 'LEV', 'Leverkusen', 79, '#e32221', '#111111', '#ffffff'],
    ['lpz', 'Leipzig', 'LPZ', 'Leipzig', 75, '#ffffff', '#dd0741', '#0c2043'],
    ['frk', 'Frankfurt', 'FRK', 'Frankfurt', 73, '#111111', '#e1000f', '#ffffff'],
    ['stg', 'Stuttgart', 'STG', 'Stuttgart', 73, '#ffffff', '#e32219', '#e32219'],
    ['wob', 'Wolfsburg', 'WOB', 'Wolfsburg', 70, '#65b32e', '#ffffff', '#ffffff'],
    ['mgb', 'Mönchengladbach', 'MGB', 'Mönchengladbach', 70, '#ffffff', '#00a443', '#111111'],
    ['frb', 'Freiburg', 'FRB', 'Freiburg', 70, '#e2001a', '#111111', '#ffffff'],
    ['shm', 'Sinsheim', 'SHM', 'Sinsheim', 69, '#1961b5', '#ffffff', '#ffffff'],
  ],
  bra: [
    ['rrn', 'Rio Rubro-Negro', 'RRN', 'Rio de Janeiro', 75, '#c3281e', '#111111', '#ffffff', 'tite'],
    ['rtr', 'Rio Tricolor', 'RTR', 'Rio de Janeiro', 71, '#870a28', '#00613c', '#ffffff'],
    ['rcm', 'Rio Cruzmaltino', 'RCM', 'Rio de Janeiro', 69, '#111111', '#ffffff', '#ffffff'],
    ['res', 'Rio Estrela', 'RES', 'Rio de Janeiro', 73, '#2b2b2b', '#e9e9e9', '#ffffff'],
    ['spv', 'São Paulo Verde', 'SPV', 'São Paulo', 75, '#006437', '#ffffff', '#ffffff'],
    ['spa', 'São Paulo Alvinegro', 'SPA', 'São Paulo', 71, '#ffffff', '#111111', '#111111'],
    ['spt', 'São Paulo Tricolor', 'SPT', 'São Paulo', 72, '#fe0000', '#ffffff', '#ffffff'],
    ['pab', 'Porto Alegre Azul', 'PAA', 'Porto Alegre', 71, '#0d80bf', '#111111', '#ffffff'],
    ['pac', 'Porto Alegre Colorado', 'PAC', 'Porto Alegre', 72, '#e5050f', '#ffffff', '#ffffff'],
    ['bha', 'Belo Horizonte Azul', 'BHA', 'Belo Horizonte', 70, '#2f529e', '#ffffff', '#ffffff'],
  ],
  nor: [
    ['nrd', 'Nordhavn Athletic', 'NOR', 'Nordhavn', 78, '#1d4ed8', '#ffffff', '#ffffff', 'luis-enrique'],
    ['vlr', 'Valoria FC', 'VAL', 'Valoria', 77, '#b91c1c', '#fbbf24', '#ffffff', 'zidane'],
    ['kst', 'Kestrel United', 'KES', 'Kestrel', 74, '#111827', '#f59e0b', '#f59e0b', 'pochettino'],
    ['arg', 'Argent City', 'ARG', 'Argent', 72, '#7dd3fc', '#0c4a6e', '#0c4a6e', 'low'],
    ['brk', 'Brakwater Rovers', 'BRK', 'Brakwater', 70, '#15803d', '#ffffff', '#ffffff', 'frank'],
    ['ost', 'Ostmark Sporting', 'OST', 'Ostmark', 69, '#7c3aed', '#e9d5ff', '#ffffff', 'jardim'],
    ['ptr', 'Port Rhenna', 'PRH', 'Rhenna', 67, '#ea580c', '#1f2937', '#ffffff', 'iraola'],
    ['hlm', 'Holmgard Town', 'HOL', 'Holmgard', 65, '#facc15', '#1e3a8a', '#1e3a8a', 'nuno'],
  ],
};

export const CLUB_SEEDS: ClubSeed[] = Object.entries(ROWS).flatMap(([league, rows]) =>
  rows.map(([id, name, short, city, strength, primary, secondary, text, coach]) => ({ id, name, short, city, strength, primary, secondary, text, coach, league })),
);

export const leagueOf = (clubId: string): string => CLUB_SEEDS.find((c) => c.id === clubId)?.league ?? 'nor';
export const leagueClubIds = (leagueId: string): string[] => CLUB_SEEDS.filter((c) => c.league === leagueId).map((c) => c.id);
export const leagueById = (id: string): LeagueDef => LEAGUES.find((l) => l.id === id) ?? LEAGUES[LEAGUES.length - 1];
