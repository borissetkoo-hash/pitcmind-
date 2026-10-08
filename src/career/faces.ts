import { createImageStore, type ImportResult, type StoredImage } from '../storage/imageStore';

/** Face packs imported by the player (e.g. their own Football Manager "faces" folder). Local-only. */
export type Face = StoredImage;
export type { ImportResult };

export const MAX_FACES = 300;
const store = createImageStore({ db: 'pm-faces', max: MAX_FACES, size: 160, fit: 'cover', store: 'faces' });

export const loadFaces = () => store.load();
export const listFaces = () => store.list();
export const getFace = (id: string | undefined) => store.get(id);
export const importFaces = (files: FileList | File[]) => store.import(files);
export const deleteFace = (id: string) => store.remove(id);
