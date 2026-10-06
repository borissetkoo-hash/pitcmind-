export type Role = 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB' | 'DM' | 'CM' | 'LM' | 'RM' | 'AM' | 'LW' | 'RW' | 'ST';

export type Line = 'gk' | 'def' | 'mid' | 'att';

export const ROLE_LINE: Record<Role, Line> = {
  GK: 'gk',
  CB: 'def', LB: 'def', RB: 'def', LWB: 'def', RWB: 'def',
  DM: 'mid', CM: 'mid', LM: 'mid', RM: 'mid', AM: 'mid',
  LW: 'att', RW: 'att', ST: 'att',
};

/** Attributes on a 1–99 scale. */
export interface Attributes {
  pace: number;
  acceleration: number;
  stamina: number;
  passing: number;
  vision: number;
  shooting: number;
  dribbling: number;
  firstTouch: number;
  tackling: number;
  positioning: number;
  heading: number;
  composure: number;
  goalkeeping: number;
}

export interface PlayerData {
  id: string;
  name: string;
  number: number;
  position: Role;
  age: number;
  attrs: Attributes;
}

export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2' | '4-1-4-1';

export interface Tactics {
  formation: FormationId;
  /** -2 (park the bus) … +2 (all-out attack). */
  mentality: number;
  /** 0 … 1: how eagerly the team presses the ball carrier. */
  pressing: number;
  /** 0 … 1: how high the defensive line sits. */
  lineHeight: number;
  /** 0 … 1: width in possession. */
  width: number;
  /** 0 … 1: short build-up (0) vs. direct, vertical play (1). */
  directness: number;
  /** 0 … 1: only shoot from inside the box (0) … shoot on sight from distance (1). */
  shootingRange: number;
  /** 0 … 1: patient, slow circulation (0) … quick release, high tempo (1). */
  tempo: number;
  /** 0 … 1: stay on your feet (0) … fly into tackles (1): more ball wins, more fouls. */
  tackling: number;
  /** 0 … 1: how often wide players put the ball into the box. */
  crossing: number;
}

export interface ClubData {
  id: string;
  name: string;
  short: string;
  city: string;
  colors: { primary: string; secondary: string; text: string };
  keeperColors: { primary: string; text: string };
  tactics: Tactics;
  players: PlayerData[];
}

export const DEFAULT_TACTICS: Tactics = {
  formation: '4-3-3',
  mentality: 0,
  pressing: 0.5,
  lineHeight: 0.5,
  width: 0.6,
  directness: 0.4,
  shootingRange: 0.5,
  tempo: 0.5,
  tackling: 0.5,
  crossing: 0.5,
};

/** Fills in any tactic not specified (older saves, partial presets) with the neutral 0.5 default. */
export const withDefaults = (t: Partial<Tactics>): Tactics => ({ ...DEFAULT_TACTICS, ...t });
