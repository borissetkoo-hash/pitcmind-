import type { CareerState } from './career';

const KEY = 'pm-career-v1';
/** The cloud store caps a document at 256 KiB; stay safely below it. */
const CLOUD_LIMIT = 240_000;
/** Never keep the career screen waiting on the cloud longer than this. */
const CLOUD_TIMEOUT = 4000;

export type CloudStatus = 'off' | 'saving' | 'saved' | 'tooBig' | 'error';
let status: CloudStatus = 'off';
let statusListener: ((s: CloudStatus) => void) | null = null;
const setStatus = (s: CloudStatus) => {
  status = s;
  statusListener?.(s);
};
export const cloudStatus = () => status;
export const onCloudStatus = (fn: ((s: CloudStatus) => void) | null) => {
  statusListener = fn;
};

const timeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Career saves live in this browser (localStorage) and, when the game runs as a published
 * claude.ai page, also in the viewer's private cloud document — so a save survives cleared
 * site data and follows the person to another device. Off-platform only localStorage is used.
 */
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };

let cloudDoc: Promise<DocRef | null> | null = null;

function cloud(): Promise<DocRef | null> {
  if (cloudDoc) return cloudDoc;
  cloudDoc = (async () => {
    const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
    if (!c?.use) return null;
    try {
      const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
        { doc(path: string): DocRef } | null,
        { id(): Promise<string | null> } | null,
      ];
      if (!db || !user) return null;
      const id = await user.id();
      return id ? db.doc(`data/users/${id}/career`) : null;
    } catch {
      return null;
    }
  })();
  return cloudDoc;
}

function readLocal(): CareerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CareerState) : null;
  } catch {
    return null;
  }
}

export async function loadCareer(): Promise<CareerState | null> {
  const local = readLocal();
  try {
    const doc = await timeout(cloud(), CLOUD_TIMEOUT, null);
    if (doc) {
      const snap = await timeout(doc.get(), CLOUD_TIMEOUT, { exists: false, data: () => undefined });
      const remote = snap.exists ? (snap.data()?.state as CareerState | undefined) : undefined;
      if (remote && (!local || (remote as CareerState & { savedAt?: number }).savedAt! >= ((local as CareerState & { savedAt?: number }).savedAt ?? 0))) {
        return remote;
      }
    }
  } catch {
    /* cloud unavailable: fall back to the local copy */
  }
  return local;
}

export function saveCareer(state: CareerState): void {
  // Pending match reports are transient and large; the cloud copy doesn't need them.
  const json = JSON.stringify({ ...state, savedAt: Date.now() });
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* storage blocked */
  }
  // A JSON round-trip drops `undefined` fields, which the cloud store refuses.
  const plain = JSON.parse(json) as Record<string, unknown>;
  if (json.length > CLOUD_LIMIT) {
    delete plain.reports;
    if (JSON.stringify(plain).length > CLOUD_LIMIT) {
      setStatus('tooBig');
      return;
    }
  }
  // One cloud write at a time; rapid saves collapse into the latest state.
  queued = plain;
  if (!writing) void flush();
}

let queued: Record<string, unknown> | null = null;
let writing = false;

async function flush(): Promise<void> {
  writing = true;
  try {
    const doc = await cloud();
    while (doc && queued) {
      const next = queued;
      queued = null;
      setStatus('saving');
      try {
        await doc.set({ state: next });
        setStatus('saved');
      } catch (e) {
        // Cloud refused (read-only viewer, quota, transient): the local copy still has it.
        console.warn('PitchMind: cloud save failed', e);
        setStatus('error');
        break;
      }
    }
  } finally {
    queued = null;
    writing = false;
  }
}

/** Synchronous peek at the local save, for menu labels. */
export function peekCareer(): CareerState | null {
  return readLocal();
}

export function deleteCareer(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  void cloud()
    .then((doc) => doc?.delete())
    .catch(() => undefined);
}
