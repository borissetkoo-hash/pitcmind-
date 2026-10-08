import type { CareerState } from './career';

const KEY = 'pm-career-v1';

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
    const doc = await cloud();
    if (doc) {
      const snap = await doc.get();
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
  const stamped = { ...state, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(stamped));
  } catch {
    /* storage blocked */
  }
  // One cloud write at a time; rapid saves collapse into the latest state.
  queued = stamped;
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
      try {
        await doc.set({ state: next });
      } catch {
        break; // cloud refused (read-only viewer, quota): the local copy still has it
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
