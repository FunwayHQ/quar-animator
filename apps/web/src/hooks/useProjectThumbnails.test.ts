/**
 * Tests for useProjectThumbnails: cache first, render what's stale
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ProjectListItem } from '../services/projectStorage';

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  renderProjectThumbnail: vi.fn(),
  getCachedThumbnail: vi.fn(),
  putCachedThumbnail: vi.fn(),
  pruneThumbnails: vi.fn(),
}));

vi.mock('../services/projectStorage', () => ({ loadProject: mocks.loadProject }));
vi.mock('../services/projectThumbnail', () => ({
  renderProjectThumbnail: mocks.renderProjectThumbnail,
}));
vi.mock('../services/thumbnailStorage', () => ({
  getCachedThumbnail: mocks.getCachedThumbnail,
  putCachedThumbnail: mocks.putCachedThumbnail,
  pruneThumbnails: mocks.pruneThumbnails,
}));

import { useProjectThumbnails } from './useProjectThumbnails';

/** A PNG blob; jsdom's Blob lacks arrayBuffer(), which browsers have. */
function pngBlob(): Blob {
  return Object.assign(new Blob(['png'], { type: 'image/png' }), {
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)),
  });
}

const paper = { r: 240, g: 236, b: 228, a: 1 };
const ink = { r: 10, g: 20, b: 40, a: 1 };

const projects: ProjectListItem[] = [
  { id: 'cached', name: 'Cached', updatedAt: 't1' },
  { id: 'stale', name: 'Stale', updatedAt: 't2' },
];

describe('useProjectThumbnails', () => {
  let urlCount = 0;
  const createObjectURL = vi.fn(() => `blob:thumb-${++urlCount}`);
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    urlCount = 0;
    // jsdom has neither; set on URL itself so unmounts after a test still find them
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    mocks.pruneThumbnails.mockResolvedValue(undefined);
    mocks.putCachedThumbnail.mockResolvedValue(undefined);
    mocks.getCachedThumbnail.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'cached'
          ? { id, updatedAt: 't1', png: new ArrayBuffer(4), kind: 'artboard', background: paper }
          : { id, updatedAt: 'older', png: new ArrayBuffer(4), kind: 'content' }
      )
    );
    mocks.loadProject.mockImplementation((id: string) =>
      Promise.resolve({ id, name: id, updatedAt: 't2', data: 'project-data' })
    );
    mocks.renderProjectThumbnail.mockResolvedValue({
      kind: 'content',
      png: pngBlob(),
      background: ink,
    });
  });

  it('shows cached thumbnails and renders only the stale ones, caching the result', async () => {
    const { result } = renderHook(() => useProjectThumbnails(projects));

    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    expect(result.current.cached).toEqual({
      url: expect.any(String),
      kind: 'artboard',
      background: paper,
    });
    expect(result.current.stale).toEqual({
      url: expect.any(String),
      kind: 'content',
      background: ink,
    });
    expect(mocks.loadProject).toHaveBeenCalledTimes(1);
    expect(mocks.loadProject).toHaveBeenCalledWith('stale');
    expect(mocks.renderProjectThumbnail).toHaveBeenCalledWith('project-data');
    expect(mocks.putCachedThumbnail).toHaveBeenCalledWith({
      id: 'stale',
      updatedAt: 't2',
      png: expect.any(ArrayBuffer),
      kind: 'content',
      background: ink,
    });
    expect(mocks.pruneThumbnails).toHaveBeenCalled();
    expect([...mocks.pruneThumbnails.mock.calls[0]![0]]).toEqual(['cached', 'stale']);
  });

  it('caches an empty project as having nothing to show, and leaves its placeholder', async () => {
    mocks.renderProjectThumbnail.mockResolvedValue(null);
    const { result } = renderHook(() => useProjectThumbnails(projects));

    await waitFor(() =>
      expect(mocks.putCachedThumbnail).toHaveBeenCalledWith({
        id: 'stale',
        updatedAt: 't2',
        png: null,
        kind: null,
      })
    );
    expect(result.current.stale).toBeUndefined();
    expect(result.current.cached).toBeDefined();
  });

  it('keeps the placeholder and caches nothing when a project fails to draw', async () => {
    mocks.renderProjectThumbnail.mockRejectedValue(new Error('no WebGL'));
    const { result } = renderHook(() => useProjectThumbnails(projects));

    await waitFor(() => expect(mocks.renderProjectThumbnail).toHaveBeenCalled());
    await waitFor(() => expect(result.current.cached).toBeDefined());
    expect(result.current.stale).toBeUndefined();
    expect(mocks.putCachedThumbnail).not.toHaveBeenCalled();
  });

  it('lets go of a deleted project and keeps the others without re-reading them', async () => {
    const { result, rerender } = renderHook(({ list }) => useProjectThumbnails(list), {
      initialProps: { list: projects },
    });
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    const staleUrl = result.current.stale!.url;
    mocks.getCachedThumbnail.mockClear();

    rerender({ list: projects.filter((p) => p.id !== 'stale') });

    await waitFor(() => expect(result.current.stale).toBeUndefined());
    expect(revokeObjectURL).toHaveBeenCalledWith(staleUrl);
    expect(result.current.cached).toBeDefined();
    expect(mocks.getCachedThumbnail).not.toHaveBeenCalled();
  });

  it('releases every object URL on unmount', async () => {
    const { result, unmount } = renderHook(() => useProjectThumbnails(projects));
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    const urls = Object.values(result.current).map((v) => v.url);

    unmount();

    for (const url of urls) expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });
});
