/**
 * Images the player imports from their own files (face packs, club crests).
 * They are downscaled in the browser and kept ONLY in this browser's IndexedDB:
 * never uploaded, bundled or synced.
 */
export interface StoredImage {
  id: string;
  name: string;
  dataUrl: string;
}

export interface ImageStoreOptions {
  db: string;
  max: number;
  size: number;
  /** 'cover' crops to a square (faces, top-anchored); 'contain' fits the whole image (crests). */
  fit: 'cover' | 'contain';
  /** Object store name (kept stable so earlier imports survive updates). */
  store?: string;
}

export interface ImportResult {
  added: number;
  skipped: number;
}

export function createImageStore(opts: ImageStoreOptions) {
  const STORE = opts.store ?? 'images';
  const cache = new Map<string, StoredImage>();
  let loaded: Promise<void> | null = null;

  const openDb = () =>
    new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(opts.db, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null); // IndexedDB unavailable: images live for this visit only
      }
    });

  const tx = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
    openDb().then(
      (db) =>
        new Promise<T | null>((resolve) => {
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

  async function shrink(file: Blob): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('unreadable image'));
        i.src = url;
      });
      const c = document.createElement('canvas');
      c.width = opts.size;
      c.height = opts.size;
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (opts.fit === 'cover') {
        const side = Math.min(w, h);
        g.drawImage(img, (w - side) / 2, Math.max(0, (h - side) * 0.2), side, side, 0, 0, opts.size, opts.size);
      } else {
        const k = opts.size / Math.max(w, h);
        g.drawImage(img, (opts.size - w * k) / 2, (opts.size - h * k) / 2, w * k, h * k);
      }
      const webp = c.toDataURL('image/webp', 0.88);
      return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return {
    load(): Promise<void> {
      loaded ??= tx<StoredImage[]>('readonly', (s) => s.getAll() as IDBRequest<StoredImage[]>).then((all) => {
        for (const f of all ?? []) cache.set(f.id, f);
      });
      return loaded;
    },
    list: (): StoredImage[] => [...cache.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    get: (id: string | undefined): StoredImage | undefined => (id ? cache.get(id) : undefined),
    get count() {
      return cache.size;
    },
    /** Imports files; `idFor` lets a caller pin the id (one crest per club). */
    async import(files: FileList | File[], idFor?: (f: File) => string): Promise<ImportResult> {
      await this.load();
      let added = 0;
      let skipped = 0;
      for (const file of Array.from(files)) {
        const id = idFor ? idFor(file) : `f_${file.name.replace(/\.[^.]+$/, '')}_${file.size}`;
        if (!file.type.startsWith('image/') || (!cache.has(id) && cache.size >= opts.max) || (!idFor && cache.has(id))) {
          skipped++;
          continue;
        }
        try {
          const item: StoredImage = { id, name: file.name.replace(/\.[^.]+$/, ''), dataUrl: await shrink(file) };
          cache.set(id, item);
          await tx('readwrite', (s) => s.put(item));
          added++;
        } catch {
          skipped++;
        }
      }
      return { added, skipped };
    },
    async remove(id: string): Promise<void> {
      cache.delete(id);
      await tx('readwrite', (s) => s.delete(id));
    },
  };
}
