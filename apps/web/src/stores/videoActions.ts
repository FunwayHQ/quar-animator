/**
 * Video store actions: the document's video library, which the video layers
 * on every page show. Each entry is what's known about a video; its file is
 * kept apart (services/videoFiles), so neither undo steps nor saves of the
 * JSON copy it.
 */

import type { Video } from '@quar/types';
import type { EditorStore } from './editorStore';

export interface VideoActions {
  /** The document's videos (their files: services/videoFiles) */
  videos: Video[];
  /**
   * Add a video to the library, its file registered first. One already
   * there stays as it is. Not an undo step of its own: placing the layer
   * that shows it is, and the library keeps what undo takes away, as the
   * sound library does.
   */
  addVideo: (video: Video) => void;
}

export function createVideoActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void
): VideoActions {
  return {
    videos: [],
    addVideo: (video) =>
      set((state) =>
        state.videos.some((known) => known.id === video.id)
          ? {}
          : { videos: [...state.videos, video], isDirty: true }
      ),
  };
}
