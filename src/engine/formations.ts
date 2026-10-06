import type { FormationId, Role } from './types';

/**
 * A formation slot in the local frame: x is depth (0 = own goal line, 1 = opponent goal line)
 * expressed as a *relative* shape coordinate, y is width (0 = left touchline from the team's view).
 */
export interface Slot {
  role: Role;
  x: number;
  y: number;
}

const GK: Slot = { role: 'GK', x: 0.02, y: 0.5 };

export const FORMATIONS: Record<FormationId, Slot[]> = {
  '4-4-2': [
    GK,
    { role: 'LB', x: 0.2, y: 0.12 }, { role: 'CB', x: 0.17, y: 0.38 }, { role: 'CB', x: 0.17, y: 0.62 }, { role: 'RB', x: 0.2, y: 0.88 },
    { role: 'LM', x: 0.5, y: 0.12 }, { role: 'CM', x: 0.46, y: 0.38 }, { role: 'CM', x: 0.46, y: 0.62 }, { role: 'RM', x: 0.5, y: 0.88 },
    { role: 'ST', x: 0.8, y: 0.38 }, { role: 'ST', x: 0.8, y: 0.62 },
  ],
  '4-3-3': [
    GK,
    { role: 'LB', x: 0.2, y: 0.12 }, { role: 'CB', x: 0.17, y: 0.38 }, { role: 'CB', x: 0.17, y: 0.62 }, { role: 'RB', x: 0.2, y: 0.88 },
    { role: 'CM', x: 0.48, y: 0.28 }, { role: 'DM', x: 0.38, y: 0.5 }, { role: 'CM', x: 0.48, y: 0.72 },
    { role: 'LW', x: 0.76, y: 0.14 }, { role: 'ST', x: 0.84, y: 0.5 }, { role: 'RW', x: 0.76, y: 0.86 },
  ],
  '4-2-3-1': [
    GK,
    { role: 'LB', x: 0.2, y: 0.12 }, { role: 'CB', x: 0.17, y: 0.38 }, { role: 'CB', x: 0.17, y: 0.62 }, { role: 'RB', x: 0.2, y: 0.88 },
    { role: 'DM', x: 0.38, y: 0.38 }, { role: 'DM', x: 0.38, y: 0.62 },
    { role: 'LW', x: 0.66, y: 0.15 }, { role: 'AM', x: 0.64, y: 0.5 }, { role: 'RW', x: 0.66, y: 0.85 },
    { role: 'ST', x: 0.86, y: 0.5 },
  ],
  '3-5-2': [
    GK,
    { role: 'CB', x: 0.17, y: 0.27 }, { role: 'CB', x: 0.15, y: 0.5 }, { role: 'CB', x: 0.17, y: 0.73 },
    { role: 'LWB', x: 0.45, y: 0.08 }, { role: 'CM', x: 0.46, y: 0.33 }, { role: 'DM', x: 0.38, y: 0.5 }, { role: 'CM', x: 0.46, y: 0.67 }, { role: 'RWB', x: 0.45, y: 0.92 },
    { role: 'ST', x: 0.8, y: 0.38 }, { role: 'ST', x: 0.8, y: 0.62 },
  ],
  '5-3-2': [
    GK,
    { role: 'LWB', x: 0.26, y: 0.08 }, { role: 'CB', x: 0.16, y: 0.3 }, { role: 'CB', x: 0.15, y: 0.5 }, { role: 'CB', x: 0.16, y: 0.7 }, { role: 'RWB', x: 0.26, y: 0.92 },
    { role: 'CM', x: 0.46, y: 0.3 }, { role: 'CM', x: 0.42, y: 0.5 }, { role: 'CM', x: 0.46, y: 0.7 },
    { role: 'ST', x: 0.8, y: 0.38 }, { role: 'ST', x: 0.8, y: 0.62 },
  ],
  '4-1-4-1': [
    GK,
    { role: 'LB', x: 0.2, y: 0.12 }, { role: 'CB', x: 0.17, y: 0.38 }, { role: 'CB', x: 0.17, y: 0.62 }, { role: 'RB', x: 0.2, y: 0.88 },
    { role: 'DM', x: 0.34, y: 0.5 },
    { role: 'LM', x: 0.55, y: 0.12 }, { role: 'CM', x: 0.52, y: 0.38 }, { role: 'CM', x: 0.52, y: 0.62 }, { role: 'RM', x: 0.55, y: 0.88 },
    { role: 'ST', x: 0.84, y: 0.5 },
  ],
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

/** How well a player whose natural position is `natural` fits `slot` (1 = perfect). */
export function roleFit(natural: Role, slot: Role): number {
  if (natural === slot) return 1;
  if (natural === 'GK' || slot === 'GK') return 0.1;
  const groups: Role[][] = [
    ['CB'],
    ['LB', 'LWB', 'LM'],
    ['RB', 'RWB', 'RM'],
    ['DM', 'CM'],
    ['CM', 'AM'],
    ['LW', 'LM', 'AM'],
    ['RW', 'RM', 'AM'],
    ['ST', 'AM'],
    ['LW', 'RW', 'ST'],
  ];
  for (const g of groups) if (g.includes(natural) && g.includes(slot)) return 0.88;
  const sameLine = ['DM', 'CB'].includes(natural) && ['DM', 'CB'].includes(slot);
  return sameLine ? 0.82 : 0.65;
}
