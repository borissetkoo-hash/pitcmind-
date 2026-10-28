import type { CareerState } from './career';

/** The cloud store caps a document at 256 KiB; stay safely below it. */
const CLOUD_LIMIT = 240_000;
/** Never keep a screen waiting on the cloud longer than this. */
const CLOUD_TIMEOUT = 4000;

export type CloudStatus = 'off' | 'saving' | 'saved' | 'tooBig' | 'error';

const timeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Saves live in this browser (localStorage) and, when the game runs as a published claude.ai
 * page, also in the viewer's private cloud document — so a save survives cleared site data and
 * follows the person to another device. Off-platform only localStorage is used.
 */
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };

let userDocs: Promise<{ doc(path: string): DocRef; id: string } | null> | null = null;

function cloudRoot() {
  userDocs ??= (async () => {
    const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
    if (!c?.use) return null;
    try {
      const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
        { doc(path: string): DocRef } | null,
        { id(): Promise<string | null> } | null,
      ];
      if (!db || !user) return null;
      const id = await user.id();
      return id ? { doc: (p: string) => db.doc(p), id } : null;
    } catch {
      return null;
    }
  })();
  return userDocs;
}

type Stamped = { savedAt?: number };

/** One save slot: a localStorage key plus a private cloud document of the same name. */
export function createSaveSlot<T extends object>(key: string, docName: string) {
  let status: CloudStatus = 'off';
  let listener: ((s: CloudStatus) => void) | null = null;
  const setStatus = (s: CloudStatus) => {
    status = s;
    listener?.(s);
  };
  let docRef: Promise<DocRef | null> | null = null;
  const cloud = () => (docRef ??= cloudRoot().then((r) => (r ? r.doc(`data/users/${r.id}/${docName}`) : null)));

  const readLocal = (): T | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };

  let queued: Record<string, unknown> | null = null;
  let writing = false;
  const flush = async () => {
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
          console.warn(`PitchMind: cloud save (${docName}) failed`, e);
          setStatus('error');
          break;
        }
      }
    } finally {
      queued = null;
      writing = false;
    }
  };

  return {
    async load(): Promise<T | null> {
      const local = readLocal();
      try {
        const doc = await timeout(cloud(), CLOUD_TIMEOUT, null);
        if (doc) {
          const snap = await timeout(doc.get(), CLOUD_TIMEOUT, { exists: false, data: () => undefined });
          const remote = snap.exists ? (snap.data()?.state as (T & Stamped) | undefined) : undefined;
          if (remote && (!local || (remote.savedAt ?? 0) >= ((local as T & Stamped).savedAt ?? 0))) return remote;
        }
      } catch {
        /* cloud unavailable: fall back to the local copy */
      }
      return local;
    },
    save(state: T): void {
      const json = JSON.stringify({ ...state, savedAt: Date.now() });
      try {
        localStorage.setItem(key, json);
      } catch {
        /* storage blocked */
      }
      // A JSON round-trip drops `undefined` fields, which the cloud store refuses.
      const plain = JSON.parse(json) as Record<string, unknown>;
      if (json.length > CLOUD_LIMIT) {
        // Pending match reports are transient and large; the cloud copy can do without them.
        delete plain.reports;
        if (JSON.stringify(plain).length > CLOUD_LIMIT) {
          setStatus('tooBig');
          return;
        }
      }
      // One cloud write at a time; rapid saves collapse into the latest state.
      queued = plain;
      if (!writing) void flush();
    },
    /** Synchronous peek at the local save, for menu labels. */
    peek: readLocal,
    remove(): void {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      void cloud()
        .then((doc) => doc?.delete())
        .catch(() => undefined);
    },
    status: () => status,
    onStatus(fn: ((s: CloudStatus) => void) | null) {
      listener = fn;
    },
  };
}

const career = createSaveSlot<CareerState>('pm-career-v1', 'career');

export const loadCareer = () => career.load();
export const saveCareer = (s: CareerState) => career.save(s);
export const peekCareer = () => career.peek();
export const deleteCareer = () => career.remove();
export const cloudStatus = () => career.status();
export const onCloudStatus = (fn: ((s: CloudStatus) => void) | null) => career.onStatus(fn);
