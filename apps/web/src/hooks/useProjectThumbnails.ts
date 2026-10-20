/**
 * useProjectThumbnails Hook
 * Thumbnails for the Projects page: read from the cache, or rendered one
 * project at a time when a project has changed since its thumbnail was made.
 */

import { useEffect, useRef, useState } from 'react';
import type { Color } from '@quar/types';
import { loadProject } from '../services/projectStorage';
import type { ProjectListItem } from '../services/projectStorage';
import { renderProjectThumbnail } from '../services/projectThumbnail';
import type { ThumbnailKind } from '../services/projectThumbnail';
import {
  getCachedThumbnail,
  putCachedThumbnail,
  pruneThumbnails,
} from '../services/thumbnailStorage';

export interface ThumbnailView {
  /** Object URL of the PNG. */
  url: string;
  kind: ThumbnailKind;
  /** The document background loose artwork is shown on. */
  background?: Color;
}

interface ShownThumbnail {
  updatedAt: string;
  /** Null when the project has nothing to show. */
  view: ThumbnailView | null;
}

function toViews(shown: Map<string, ShownThumbnail>): Record<string, ThumbnailView> {
  const views: Record<string, ThumbnailView> = {};
  for (const [id, entry] of shown) {
    if (entry.view) views[id] = entry.view;
  }
  return views;
}

/** Thumbnails by project id; projects without one (yet) are left out. */
export function useProjectThumbnails(projects: ProjectListItem[]): Record<string, ThumbnailView> {
  const [views, setViews] = useState<Record<string, ThumbnailView>>({});
  // What each card shows, and for which save of the project
  const shownRef = useRef(new Map<string, ShownThumbnail>());
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const signature = projects.map((p) => `${p.id}@${p.updatedAt}`).join('|');

  useEffect(() => {
    let cancelled = false;
    const shown = shownRef.current;
    const list = projectsRef.current;
    const wanted = new Map(list.map((p) => [p.id, p.updatedAt]));

    // Let go of thumbnails for projects deleted or saved since
    for (const [id, entry] of shown) {
      if (wanted.get(id) !== entry.updatedAt) {
        if (entry.view) URL.revokeObjectURL(entry.view.url);
        shown.delete(id);
      }
    }
    setViews(toViews(shown));

    const show = (
      id: string,
      updatedAt: string,
      png: Blob | null,
      kind: ThumbnailKind | null,
      background?: Color
    ) => {
      const view = png && kind ? { url: URL.createObjectURL(png), kind, background } : null;
      shown.set(id, { updatedAt, view });
      setViews(toViews(shown));
    };

    async function run() {
      void pruneThumbnails(wanted.keys()).catch(() => undefined);

      // Cached ones first, so they all appear before any rendering starts
      const stale: ProjectListItem[] = [];
      for (const project of list) {
        if (shown.has(project.id)) continue;
        const cached = await getCachedThumbnail(project.id).catch(() => undefined);
        if (cancelled) return;
        if (cached?.updatedAt === project.updatedAt) {
          const png = cached.png ? new Blob([cached.png], { type: 'image/png' }) : null;
          show(project.id, project.updatedAt, png, cached.kind, cached.background);
        } else {
          stale.push(project);
        }
      }

      for (const project of stale) {
        try {
          const stored = await loadProject(project.id);
          if (cancelled) return;
          if (!stored) continue;
          const thumbnail = await renderProjectThumbnail(stored.data);
          // Cached even when no longer wanted here: it's right for this save
          await putCachedThumbnail({
            id: project.id,
            updatedAt: stored.updatedAt,
            png: thumbnail ? await thumbnail.png.arrayBuffer() : null,
            kind: thumbnail?.kind ?? null,
            ...(thumbnail && { background: thumbnail.background }),
          }).catch(() => undefined);
          if (cancelled) return;
          if (stored.updatedAt === project.updatedAt) {
            show(
              project.id,
              project.updatedAt,
              thumbnail?.png ?? null,
              thumbnail?.kind ?? null,
              thumbnail?.background
            );
          }
        } catch {
          // Unreadable or undrawable: the card keeps its placeholder, and the
          // next visit tries again
        }
      }
    }
    void run();

    return () => {
      cancelled = true;
    };
  }, [signature]);

  // Release every object URL when the page goes away
  useEffect(() => {
    const shown = shownRef.current;
    return () => {
      for (const entry of shown.values()) {
        if (entry.view) URL.revokeObjectURL(entry.view.url);
      }
      shown.clear();
    };
  }, []);

  return views;
}
