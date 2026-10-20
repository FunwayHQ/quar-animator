/**
 * Tests for the thumbnail cache (IndexedDB)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  getCachedThumbnail,
  putCachedThumbnail,
  pruneThumbnails,
  resetThumbnailDB,
} from './thumbnailStorage';

describe('thumbnailStorage', () => {
  beforeEach(() => {
    resetThumbnailDB();
    indexedDB = new IDBFactory();
  });

  it('stores and reads back a thumbnail by project id', async () => {
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    await putCachedThumbnail({ id: 'p1', updatedAt: 't1', png, kind: 'artboard' });

    const cached = await getCachedThumbnail('p1');

    expect(cached?.updatedAt).toBe('t1');
    expect(cached?.kind).toBe('artboard');
    expect(new Uint8Array(cached!.png!)).toEqual(new Uint8Array([137, 80, 78, 71]));
    await expect(getCachedThumbnail('missing')).resolves.toBeUndefined();
  });

  it('remembers projects with nothing to show', async () => {
    await putCachedThumbnail({ id: 'empty', updatedAt: 't1', png: null, kind: null });

    await expect(getCachedThumbnail('empty')).resolves.toMatchObject({ png: null, kind: null });
  });

  it('replaces a thumbnail when the project is drawn again', async () => {
    await putCachedThumbnail({ id: 'p1', updatedAt: 't1', png: null, kind: null });
    await putCachedThumbnail({ id: 'p1', updatedAt: 't2', png: null, kind: null });

    await expect(getCachedThumbnail('p1')).resolves.toMatchObject({ updatedAt: 't2' });
  });

  it('prunes thumbnails of projects that are gone', async () => {
    for (const id of ['keep', 'gone-1', 'gone-2']) {
      await putCachedThumbnail({ id, updatedAt: 't', png: null, kind: null });
    }

    await pruneThumbnails(['keep']);

    await expect(getCachedThumbnail('keep')).resolves.toBeDefined();
    await expect(getCachedThumbnail('gone-1')).resolves.toBeUndefined();
    await expect(getCachedThumbnail('gone-2')).resolves.toBeUndefined();
  });
});
