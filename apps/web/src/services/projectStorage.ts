/**
 * Project Storage Service for Quar Animator
 * Wraps IndexedDB for persistent project storage
 */

const DB_NAME = 'quar-animator-db';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const SETTINGS_STORE = 'settings';

// Each project's name and save time, kept apart from the project so listing
// the projects doesn't read every one in full. A database of its own, like the
// thumbnails: the projects database needs no upgrade (so a tab still running
// an earlier version keeps working with it), and a project missing here is
// read once from the projects database and added.
const LIST_DB_NAME = 'quar-animator-project-list';
const LIST_DB_VERSION = 1;
const LIST_STORE = 'projects';

// The files of each project's videos, one record per project and video, kept
// apart from the project (whose record holds what's known about them): a
// save writes a file only when it isn't there yet, so autosave never rewrites
// a video. A database of its own, as the list is, so the projects database
// still needs no upgrade.
const VIDEO_DB_NAME = 'quar-animator-videos';
const VIDEO_DB_VERSION = 1;
const VIDEO_STORE = 'videos';

// ============================================================================
// Types
// ============================================================================

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: string;
  data: string | ArrayBuffer; // JSON string (legacy v1/v2) or binary ArrayBuffer (v3)
}

export interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: string;
}

/** A video's file, as the browser's storage keeps it for a project */
interface StoredVideoFile {
  projectId: string;
  videoId: string;
  file: Blob;
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

let listDbPromise: Promise<IDBDatabase> | null = null;

function initListDB(): Promise<IDBDatabase> {
  if (listDbPromise) return listDbPromise;

  listDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LIST_DB_NAME, LIST_DB_VERSION);

    request.onerror = () => {
      listDbPromise = null; // allow retry on next call
      reject(request.error);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LIST_STORE)) {
        db.createObjectStore(LIST_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Let a later version upgrade it rather than wait on this tab
      db.onversionchange = () => {
        db.close();
        listDbPromise = null;
      };
      resolve(db);
    };
  });

  return listDbPromise;
}

let videoDbPromise: Promise<IDBDatabase> | null = null;

export function initVideoDB(): Promise<IDBDatabase> {
  if (videoDbPromise) return videoDbPromise;

  videoDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);

    request.onerror = () => {
      videoDbPromise = null; // allow retry on next call
      reject(request.error);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE, { keyPath: ['projectId', 'videoId'] });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Let a later version upgrade it rather than wait on this tab
      db.onversionchange = () => {
        db.close();
        videoDbPromise = null;
      };
      resolve(db);
    };
  });

  return videoDbPromise;
}

/** Reset the cached DB promises (for testing) */
export function resetDB(): void {
  dbPromise = null;
  listDbPromise = null;
  videoDbPromise = null;
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

/** What a failed write rejects with: a StorageQuotaError when the storage is full. */
function writeError(tx: IDBTransaction): Error {
  const error = tx.error;
  if (error?.name === 'QuotaExceededError') return new StorageQuotaError();
  return error ?? new DOMException('Transaction aborted', 'AbortError');
}

/**
 * Save a project. `videoFiles` names the videos it shows, each with its file
 * where the document has it: a file is written only when the project hasn't
 * one stored for that video yet, and those of videos it no longer shows are
 * let go. Without it (a rename, a tutorial) the stored files stay as they are.
 */
export async function saveProject(
  id: string,
  name: string,
  data: string | ArrayBuffer,
  videoFiles?: ReadonlyMap<string, Blob | undefined>
): Promise<void> {
  // The files before the project naming them
  const unused = videoFiles ? await storeVideoFiles(id, videoFiles) : [];

  const db = await initDB();
  const record: StoredProject = {
    id,
    name,
    updatedAt: new Date().toISOString(),
    data,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).put(record);
    tx.oncomplete = () => resolve();
    const rejectWithQuota = () => reject(writeError(tx));
    tx.onerror = rejectWithQuota;
    // A quota failure detected only at commit fires onabort (not onerror), so the
    // Promise would otherwise hang forever.
    tx.onabort = rejectWithQuota;
  });

  await updateList({ put: [{ id, name, updatedAt: record.updatedAt }] });
  // Once the project no longer names them
  if (unused.length > 0) await removeVideoFiles(id, unused);
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

  // The list before the ids: a project saved in between then has its record
  // among the ids, and is read below if its entry was missed
  const listed = await readList();
  // Just the ids: a project itself is read only when the list lacks it
  const ids = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly');
    const request = tx.objectStore(PROJECTS_STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const projects: ProjectListItem[] = [];
  const found: ProjectListItem[] = [];
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const entry = listed.get(id);
    if (entry) {
      projects.push(entry);
      continue;
    }
    // Saved before the list existed, or by a tab running an earlier version:
    // read it once (one at a time, not all at once) and list it from now on
    const stored = await loadProject(id);
    if (!stored) continue;
    const item = { id: stored.id, name: stored.name, updatedAt: stored.updatedAt };
    projects.push(item);
    found.push(item);
  }
  // Entries of projects deleted where the list wasn't told
  const kept = new Set(ids);
  const gone = [...listed.keys()].filter((id) => !kept.has(id));
  if (found.length > 0 || gone.length > 0) await updateList({ fill: found, remove: gone });

  // Sort by most recently updated first
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return projects;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await initDB();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    tx.objectStore(PROJECTS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });

  await updateList({ remove: [id] });
  await removeVideoFiles(id);
}

// ============================================================================
// Video files
// ============================================================================

/** The keys of a project's video files: [projectId, videoId] for any video id. */
function videoFileRange(projectId: string): IDBKeyRange {
  return IDBKeyRange.bound([projectId], [projectId, []]);
}

/**
 * Write the files of a project's videos it hasn't stored yet. Returns the
 * ids of the videos it has files for but no longer shows.
 */
async function storeVideoFiles(
  projectId: string,
  files: ReadonlyMap<string, Blob | undefined>
): Promise<string[]> {
  let db: IDBDatabase;
  try {
    db = await initVideoDB();
  } catch (error) {
    // With no file to write, only the tidying up is missed: the project saves
    if ([...files.values()].some(Boolean)) throw error;
    return [];
  }

  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE);
    let unused: string[] = [];
    // Just the keys: a file stored is never read to be compared
    const request = store.getAllKeys(videoFileRange(projectId));
    request.onsuccess = () => {
      const stored = new Set(
        request.result.flatMap((key) =>
          Array.isArray(key) && typeof key[1] === 'string' ? [key[1]] : []
        )
      );
      for (const [videoId, file] of files) {
        if (!file || stored.has(videoId)) continue;
        const record: StoredVideoFile = { projectId, videoId, file };
        store.put(record);
      }
      unused = [...stored].filter((videoId) => !files.has(videoId));
    };
    tx.oncomplete = () => resolve(unused);
    const rejectWithQuota = () => reject(writeError(tx));
    tx.onerror = rejectWithQuota;
    tx.onabort = rejectWithQuota;
  });
}

/** The files of a project's videos, by video id. */
export async function loadVideoFiles(projectId: string): Promise<Map<string, Blob>> {
  const db = await initVideoDB();

  const records = await new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readonly');
    const request = tx.objectStore(VIDEO_STORE).getAll(videoFileRange(projectId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const files = new Map<string, Blob>();
  for (const record of records as Partial<StoredVideoFile>[]) {
    if (typeof record.videoId === 'string' && record.file instanceof Blob) {
      files.set(record.videoId, record.file);
    }
  }
  return files;
}

/** Let go of the files of these videos of a project (all of them when none are named). */
async function removeVideoFiles(projectId: string, videoIds?: string[]): Promise<void> {
  try {
    const db = await initVideoDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, 'readwrite');
      const store = tx.objectStore(VIDEO_STORE);
      if (videoIds) for (const videoId of videoIds) store.delete([projectId, videoId]);
      else store.delete(videoFileRange(projectId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    });
  } catch {
    // The project is saved or deleted, which is what matters: files left over
    // take room until its next save lets them go (a deleted project's stay)
  }
}

// ============================================================================
// Project list
// ============================================================================

function isListItem(value: unknown): value is ProjectListItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'string'
  );
}

/** The listed projects by id; none when the list can't be read. */
async function readList(): Promise<Map<string, ProjectListItem>> {
  try {
    const db = await initListDB();
    const entries = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(LIST_STORE, 'readonly');
      const request = tx.objectStore(LIST_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Only what a listing shows, should an entry hold more
    return new Map(
      entries
        .filter(isListItem)
        .map(({ id, name, updatedAt }) => [id, { id, name, updatedAt }] as const)
    );
  } catch {
    // Every project is then read from the projects database
    return new Map();
  }
}

/**
 * Change the list: `put` entries are written as given, `fill` entries only
 * where the list still has none (one written meanwhile, by a save, is newer
 * than what was read), and `remove` ids are taken out.
 */
async function updateList(changes: {
  put?: ProjectListItem[];
  fill?: ProjectListItem[];
  remove?: string[];
}): Promise<void> {
  try {
    const db = await initListDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIST_STORE, 'readwrite');
      const store = tx.objectStore(LIST_STORE);
      for (const entry of changes.put ?? []) store.put(entry);
      for (const entry of changes.fill ?? []) {
        const request = store.getKey(entry.id);
        request.onsuccess = () => {
          if (request.result === undefined) store.put(entry);
        };
      }
      for (const id of changes.remove ?? []) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
    });
  } catch {
    // The project itself is saved or deleted, which is what matters. A project
    // the list lacks is read from the projects database, and an entry left for
    // a deleted one dropped, the next time the projects are listed; an entry
    // a save couldn't update shows the earlier name and time until the next.
  }
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
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

export async function getLastProjectId(): Promise<string | undefined> {
  return getSetting('lastProjectId');
}

export async function setLastProjectId(id: string): Promise<void> {
  return setSetting('lastProjectId', id);
}
