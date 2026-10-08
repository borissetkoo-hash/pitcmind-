/**
 * Face packs imported by the player (e.g. their own Football Manager "faces" folder).
 * Images are downscaled in the browser and kept ONLY in this browser's IndexedDB:
 * they are never uploaded, bundled or synced, because such packs are licensed for
 * personal use and show real people.
 */
export interface Face {
  id: string;
  name: string;
  dataUrl: string;
}

const DB_NAME = 'pm-faces';
const STORE = 'faces';
export const MAX_FACES = 300;
const SIZE = 160;

/** In-memory copy so portraits can render synchronously. */
const cache = new Map<string, Face>();
let loaded: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null); // IndexedDB unavailable (private mode, blocked storage): faces live for this visit only
    }
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/** Loads saved faces into memory once (call early; portraits fall back to drawings until then). */
export function loadFaces(): Promise<void> {
  loaded ??= tx<Face[]>('readonly', (s) => s.getAll() as IDBRequest<Face[]>).then((all) => {
    for (const f of all ?? []) cache.set(f.id, f);
  });
  return loaded;
}

export const listFaces = (): Face[] => [...cache.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
export const getFace = (id: string | undefined): Face | undefined => (id ? cache.get(id) : undefined);

/** Reads an image file and returns a square, top-anchored crop as a compact data URL (transparency kept). */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('unreadable image'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = Math.max(0, (img.naturalHeight - side) * 0.2); // cutouts: keep the head, not the chest
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
    const webp = c.toDataURL('image/webp', 0.86);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ImportResult {
  added: number;
  skipped: number;
}

export async function importFaces(files: FileList | File[]): Promise<ImportResult> {
  await loadFaces();
  let added = 0;
  let skipped = 0;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/') || cache.size >= MAX_FACES) {
      skipped++;
      continue;
    }
    const name = file.name.replace(/\.[^.]+$/, '');
    const id = `f_${name}_${file.size}`;
    if (cache.has(id)) {
      skipped++;
      continue;
    }
    try {
      const face: Face = { id, name, dataUrl: await shrink(file) };
      cache.set(id, face);
      await tx('readwrite', (s) => s.put(face));
      added++;
    } catch {
      skipped++;
    }
  }
  return { added, skipped };
}

export async function deleteFace(id: string): Promise<void> {
  cache.delete(id);
  await tx('readwrite', (s) => s.delete(id));
}
