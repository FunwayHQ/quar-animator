/**
 * Project Storage Service for Quar Animator
 * Wraps IndexedDB for persistent project storage
 */

const DB_NAME = 'quar-animator-db';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const SETTINGS_STORE = 'settings';

// ============================================================================
// Types
// ============================================================================

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: string;
  data: string; // JSON-serialized ProjectData
}

export interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: string;
}

// ============================================================================
// Database Initialization
// ============================================================================

let dbPromise: Promise<IDBDatabase> | null = null;

export function initDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null; // allow retry on next call
      reject(request.error);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

/** Reset the cached DB promise (for testing) */
export function resetDB(): void {
  dbPromise = null;
}

// ============================================================================
// Project CRUD
// ============================================================================

/** Typed error for storage quota exceeded */
export class StorageQuotaError extends Error {
  constructor(message = 'Storage quota exceeded. Try deleting unused projects.') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export async function saveProject(id: string, name: string, data: string): Promise<void> {
  const db = await initDB();
  const record: StoredProject = {
    id,
    name,
    updatedAt: new Date().toISOString(),
    data,
  };

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      // Detect quota exceeded errors
      const error = tx.error;
      if (error?.name === 'QuotaExceededError') {
        reject(new StorageQuotaError());
      } else {
        reject(error);
      }
    };
  });
}

export async function loadProject(id: string): Promise<StoredProject | undefined> {
  const db = await initDB();

  return new Promise<StoredProject | undefined>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly');
    const request = tx.objectStore(PROJECTS_STORE).get(id);
    request.onsuccess = () => resolve(request.result as StoredProject | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const db = await initDB();

  return new Promise<ProjectListItem[]>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly');
    const request = tx.objectStore(PROJECTS_STORE).getAll();
    request.onsuccess = () => {
      const projects = (request.result as StoredProject[]).map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
      }));
      // Sort by most recently updated first
      projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await initDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// Settings (last project ID, etc.)
// ============================================================================

export async function getSetting(key: string): Promise<string | undefined> {
  const db = await initDB();

  return new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => {
      const result = request.result as { key: string; value: string } | undefined;
      resolve(result?.value);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await initDB();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLastProjectId(): Promise<string | undefined> {
  return getSetting('lastProjectId');
}

export async function setLastProjectId(id: string): Promise<void> {
  return setSetting('lastProjectId', id);
}
