/**
 * Tests for Project Storage Service (IndexedDB)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
// Node's Blobs, which the fake database can keep (jsdom's it can't)
import { Blob as NodeBlob } from 'node:buffer';
import {
  initDB,
  initVideoDB,
  resetDB,
  saveProject,
  loadProject,
  loadVideoFiles,
  listProjects,
  deleteProject,
  getLastProjectId,
  setLastProjectId,
  StorageQuotaError,
} from './projectStorage';

describe('ProjectStorage', () => {
  beforeEach(() => {
    resetDB();
    // Clear the fake-indexeddb databases
    indexedDB = new IDBFactory();
  });

  describe('transaction abort handling (F025)', () => {
    it('rejects with StorageQuotaError when a write aborts on quota', async () => {
      const db = await initDB();
      const fakeTx = {
        error: new DOMException('quota', 'QuotaExceededError'),
        objectStore: () => ({ put: () => undefined }) as unknown as IDBObjectStore,
      } as unknown as IDBTransaction & { onabort?: () => void };
      vi.spyOn(db, 'transaction').mockReturnValueOnce(fakeTx);

      const p = saveProject('p', 'n', '{}');
      await new Promise((r) => setTimeout(r, 0)); // let handler registration run
      fakeTx.onabort?.();
      await expect(p).rejects.toBeInstanceOf(StorageQuotaError);
    });

    it('rejects (does not hang) when a delete transaction aborts', async () => {
      const db = await initDB();
      const fakeTx = {
        error: new DOMException('aborted', 'AbortError'),
        objectStore: () => ({ delete: () => undefined }) as unknown as IDBObjectStore,
      } as unknown as IDBTransaction & { onabort?: () => void };
      vi.spyOn(db, 'transaction').mockReturnValueOnce(fakeTx);

      const p = deleteProject('p');
      await new Promise((r) => setTimeout(r, 0));
      fakeTx.onabort?.();
      await expect(p).rejects.toThrow();
    });
  });

  describe('initDB', () => {
    it('should initialize the database', async () => {
      const db = await initDB();
      expect(db).toBeDefined();
      expect(db.name).toBe('quar-animator-db');
    });

    it('should return the same database on subsequent calls', async () => {
      const db1 = await initDB();
      const db2 = await initDB();
      expect(db1).toBe(db2);
    });
  });

  describe('saveProject / loadProject', () => {
    it('should save and load a project', async () => {
      await saveProject('proj1', 'My Project', '{"version":"1.0"}');
      const result = await loadProject('proj1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('proj1');
      expect(result!.name).toBe('My Project');
      expect(result!.data).toBe('{"version":"1.0"}');
      expect(result!.updatedAt).toBeDefined();
    });

    it('should overwrite existing project on save', async () => {
      await saveProject('proj1', 'Original', '{"v":1}');
      await saveProject('proj1', 'Updated', '{"v":2}');
      const result = await loadProject('proj1');
      expect(result!.name).toBe('Updated');
      expect(result!.data).toBe('{"v":2}');
    });

    it('should return undefined for non-existent project', async () => {
      await initDB();
      const result = await loadProject('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('listProjects', () => {
    it('should list all projects sorted by updatedAt', async () => {
      await saveProject('proj1', 'First', '{}');
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await saveProject('proj2', 'Second', '{}');

      const projects = await listProjects();
      expect(projects).toHaveLength(2);
      // Most recent first
      expect(projects[0]!.id).toBe('proj2');
      expect(projects[1]!.id).toBe('proj1');
    });

    it('should return empty array when no projects', async () => {
      await initDB();
      const projects = await listProjects();
      expect(projects).toEqual([]);
    });

    it('lists a project whose stored name isn’t text (a damaged file) as Untitled Project', async () => {
      await saveProject('odd', {} as unknown as string, '{}');
      const listed = await listProjects();
      expect(listed.map((item) => item.name)).toEqual(['Untitled Project']);
    });

    it('should not include data in list items', async () => {
      await saveProject('proj1', 'Test', '{"large":"data"}');
      const projects = await listProjects();
      expect(projects[0]).toHaveProperty('id');
      expect(projects[0]).toHaveProperty('name');
      expect(projects[0]).toHaveProperty('updatedAt');
      expect(projects[0]).not.toHaveProperty('data');
    });
  });

  describe('listing without reading the projects (F099)', () => {
    /** Calls that read whole project records, as "method" names. */
    function watchProjectReads(): string[] {
      const reads: string[] = [];
      for (const method of ['get', 'getAll', 'openCursor'] as const) {
        const original = IDBObjectStore.prototype[method] as (...args: unknown[]) => IDBRequest;
        vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (
          this: IDBObjectStore,
          ...args: unknown[]
        ) {
          if (this.transaction.db.name === 'quar-animator-db' && this.name === 'projects') {
            reads.push(method);
          }
          return original.apply(this, args);
        } as never);
      }
      return reads;
    }

    /** A projects database as earlier versions made it, holding these records. */
    async function seedEarlierVersion(
      records: { id: string; name: string; updatedAt: string; data: string | ArrayBuffer }[]
    ): Promise<void> {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('quar-animator-db', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('projects', { keyPath: 'id' });
          request.result.createObjectStore('settings', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        for (const record of records) tx.objectStore('projects').put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('lists projects without reading them', async () => {
      await saveProject('big', 'Big', new ArrayBuffer(4 * 1024 * 1024));
      await saveProject('small', 'Small', '{}');
      const reads = watchProjectReads();

      const projects = await listProjects();

      expect(projects.map((p) => p.name)).toEqual(['Small', 'Big']);
      expect(projects[1]).toEqual({ id: 'big', name: 'Big', updatedAt: expect.any(String) });
      expect(reads).toEqual([]);
    });

    it('lists projects saved by earlier versions, reading each just once', async () => {
      await seedEarlierVersion([
        { id: 'a', name: 'Older', updatedAt: '2026-01-01T00:00:00.000Z', data: '{"v":1}' },
        { id: 'b', name: 'Newer', updatedAt: '2026-02-01T00:00:00.000Z', data: new ArrayBuffer(8) },
      ]);
      const reads = watchProjectReads();

      expect(await listProjects()).toEqual([
        { id: 'b', name: 'Newer', updatedAt: '2026-02-01T00:00:00.000Z' },
        { id: 'a', name: 'Older', updatedAt: '2026-01-01T00:00:00.000Z' },
      ]);
      expect(reads).toHaveLength(2);
      reads.length = 0;

      resetDB();
      expect(await listProjects()).toHaveLength(2);
      expect(reads).toEqual([]);
      // The projects themselves and their database are as they were
      expect((await initDB()).version).toBe(1);
      expect((await loadProject('a'))?.data).toBe('{"v":1}');
    });

    it('follows saves and deletes, including those of earlier versions', async () => {
      await saveProject('kept', 'Draft', '{}');
      await saveProject('removed', 'Removed', '{}');
      await saveProject('kept', 'Final', '{}');
      await deleteProject('removed');
      expect((await listProjects()).map((p) => p.name)).toEqual(['Final']);

      // A tab running an earlier version deletes and adds projects directly
      const db = await initDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').delete('kept');
        tx.objectStore('projects').put({
          id: 'other',
          name: 'From another tab',
          updatedAt: new Date().toISOString(),
          data: '{}',
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      expect((await listProjects()).map((p) => p.name)).toEqual(['From another tab']);
    });

    it('still saves and lists projects when the list cannot be opened', async () => {
      const open = indexedDB.open.bind(indexedDB);
      vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
        if (name === 'quar-animator-project-list') throw new Error('unavailable');
        return open(name, version);
      });

      await saveProject('p', 'Saved', '{}');

      expect(await listProjects()).toEqual([
        { id: 'p', name: 'Saved', updatedAt: expect.any(String) },
      ]);
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', async () => {
      await saveProject('proj1', 'Test', '{}');
      await deleteProject('proj1');
      const result = await loadProject('proj1');
      expect(result).toBeUndefined();
    });

    it('should not fail when deleting non-existent project', async () => {
      await initDB();
      await expect(deleteProject('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('video files', () => {
    const file = (text: string) => new NodeBlob([text], { type: 'video/mp4' }) as unknown as Blob;
    const contents = async (files: Map<string, Blob>) =>
      Object.fromEntries(
        await Promise.all(
          [...files].map(async ([id, blob]) => [id, `${blob.type} ${await blob.text()}`] as const)
        )
      );

    beforeEach(() => {
      // As in a browser, the Blobs the database gives back are Blobs
      vi.stubGlobal('Blob', NodeBlob);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('keeps each video file apart from the project, and gives them back', async () => {
      const data = new ArrayBuffer(8);
      await saveProject(
        'p',
        'Clips',
        data,
        new Map([
          ['v1', file('one')],
          ['v2', file('two')],
        ])
      );

      expect((await loadProject('p'))?.data).toEqual(data);
      expect(await contents(await loadVideoFiles('p'))).toEqual({
        v1: 'video/mp4 one',
        v2: 'video/mp4 two',
      });
      // The projects database is as earlier versions made it
      expect((await initDB()).version).toBe(1);
    });

    it("writes a video's file once: saving again (autosave) doesn't rewrite it", async () => {
      await saveProject('p', 'Clips', '{}', new Map([['v1', file('one')]]));
      const puts: unknown[] = [];
      const put = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore['put']>
      ) {
        if (this.transaction.db.name === 'quar-animator-videos') puts.push(args[0]);
        return put.apply(this, args);
      });

      await saveProject('p', 'Clips', '{}', new Map([['v1', file('one, read again')]]));
      await saveProject('p', 'Clips', '{}', new Map([['v1', file('one, read again')]]));

      expect(puts).toEqual([]);
      expect(await contents(await loadVideoFiles('p'))).toEqual({ v1: 'video/mp4 one' });
    });

    it('lets go of the files of videos the project no longer shows', async () => {
      await saveProject(
        'p',
        'Clips',
        '{}',
        new Map([
          ['v1', file('one')],
          ['v2', file('two')],
        ])
      );
      // A video shown whose file the document lacks keeps the one stored
      await saveProject('p', 'Clips', '{}', new Map([['v1', undefined]]));

      expect(await contents(await loadVideoFiles('p'))).toEqual({ v1: 'video/mp4 one' });
    });

    it('leaves the files as they are when a save names no videos (a rename)', async () => {
      await saveProject('p', 'Clips', '{}', new Map([['v1', file('one')]]));
      await saveProject('p', 'Renamed', '{}');

      expect([...(await loadVideoFiles('p')).keys()]).toEqual(['v1']);
    });

    it("keeps each project's files its own: a copy saved as another has its own", async () => {
      await saveProject('p', 'Clips', '{}', new Map([['v1', file('one')]]));
      await saveProject('copy', 'Clips copy', '{}', new Map([['v1', file('one')]]));

      await deleteProject('p');

      expect((await loadVideoFiles('p')).size).toBe(0);
      expect(await contents(await loadVideoFiles('copy'))).toEqual({ v1: 'video/mp4 one' });
    });

    it("rejects with StorageQuotaError when a video's file doesn't fit, writing no project", async () => {
      const db = await initVideoDB();
      const fakeTx = {
        error: new DOMException('quota', 'QuotaExceededError'),
        objectStore: () =>
          ({ getAllKeys: () => ({}), put: () => undefined }) as unknown as IDBObjectStore,
      } as unknown as IDBTransaction & { onabort?: () => void };
      vi.spyOn(db, 'transaction').mockReturnValueOnce(fakeTx);

      const saving = saveProject('p', 'Clips', '{}', new Map([['v1', file('big')]]));
      await new Promise((r) => setTimeout(r, 0)); // let handler registration run
      fakeTx.onabort?.();

      await expect(saving).rejects.toBeInstanceOf(StorageQuotaError);
      expect(await loadProject('p')).toBeUndefined();
    });

    it('saves a project without videos when the video files cannot be opened', async () => {
      const open = indexedDB.open.bind(indexedDB);
      vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
        if (name === 'quar-animator-videos') throw new Error('unavailable');
        return open(name, version);
      });

      await saveProject('p', 'Plain', '{}', new Map());

      expect((await loadProject('p'))?.name).toBe('Plain');
    });
  });

  describe('settings (last project ID)', () => {
    it('should save and retrieve last project ID', async () => {
      await setLastProjectId('proj1');
      const id = await getLastProjectId();
      expect(id).toBe('proj1');
    });

    it('should return undefined when no last project set', async () => {
      await initDB();
      const id = await getLastProjectId();
      expect(id).toBeUndefined();
    });

    it('should overwrite last project ID', async () => {
      await setLastProjectId('proj1');
      await setLastProjectId('proj2');
      const id = await getLastProjectId();
      expect(id).toBe('proj2');
    });
  });
});
