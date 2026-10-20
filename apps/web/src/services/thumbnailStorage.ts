/**
 * Thumbnail Storage for Quar Animator
 * Caches rendered project thumbnails in IndexedDB. A database of its own, so
 * the projects database needs no upgrade and the cache can be cleared freely.
 */

import type { ThumbnailKind } from './projectThumbnail';

const DB_NAME = 'quar-animator-thumbnails';
const DB_VERSION = 1;
const THUMBNAILS_STORE = 'thumbnails';

// ============================================================================
// Types
// ============================================================================

export interface CachedThumbnail {
  /** Project id. */
  id: string;
  /** The project's updatedAt when this was rendered; any other means stale. */
  updatedAt: string;
  /** PNG bytes, or null for a project with nothing to show. */
  png: ArrayBuffer | null;
  kind: ThumbnailKind | null;
}

// ============================================================================
// Database Initialization
// ============================================================================

let dbPromise: Promise<IDBDatabase> | null = null;

function initDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null; // allow retry on next call
      reject(request.error);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(THUMBNAILS_STORE)) {
        db.createObjectStore(THUMBNAILS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

/** Reset the cached DB promise (for testing) */
export function resetThumbnailDB(): void {
  dbPromise = null;
}

// ============================================================================
// Thumbnail CRUD
// ============================================================================

export async function getCachedThumbnail(id: string): Promise<CachedThumbnail | undefined> {
  const db = await initDB();

  return new Promise<CachedThumbnail | undefined>((resolve, reject) => {
    const tx = db.transaction(THUMBNAILS_STORE, 'readonly');
    const request = tx.objectStore(THUMBNAILS_STORE).get(id);
    request.onsuccess = () => resolve(request.result as CachedThumbnail | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function putCachedThumbnail(record: CachedThumbnail): Promise<void> {
  const db = await initDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(THUMBNAILS_STORE, 'readwrite');
    tx.objectStore(THUMBNAILS_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

/** Drop the thumbnails of projects that no longer exist. */
export async function pruneThumbnails(keepIds: Iterable<string>): Promise<void> {
  const keep = new Set(keepIds);
  const db = await initDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(THUMBNAILS_STORE, 'readwrite');
    const store = tx.objectStore(THUMBNAILS_STORE);
    const request = store.getAllKeys();
    request.onsuccess = () => {
      for (const key of request.result) {
        if (!keep.has(String(key))) store.delete(key);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}
