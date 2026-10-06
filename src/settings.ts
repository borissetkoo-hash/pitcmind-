/** Per-viewer preferences, remembered in this browser only. */
export interface Settings {
  verticalPitch: boolean;
  defaultSpeed: number;
  autoReplay: boolean;
}

const KEY = 'pm-settings-v1';
const DEFAULTS: Settings = { verticalPitch: true, defaultSpeed: 8, autoReplay: true };

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable: keep in memory */
  }
  return cache;
}
