/**
 * useDirtyTracking Hook
 * Marks the project as having unsaved changes whenever its scene changes.
 */

import { useEffect } from 'react';
import type { SceneGraph } from '@quar/core';
import { useEditorStore } from '../stores/editorStore';

/**
 * Mark the project dirty on any scene change — except while an export runs:
 * it poses the scene frame by frame and puts it back, which is no edit.
 */
export function useDirtyTracking(sceneGraph: SceneGraph): void {
  useEffect(() => {
    const markDirty = () => {
      const store = useEditorStore.getState();
      if (!store.isExporting) store.markDirty();
    };
    const unsubs = [
      sceneGraph.on('nodeAdded', markDirty),
      sceneGraph.on('nodeChanged', markDirty),
      sceneGraph.on('nodeRemoved', markDirty),
      sceneGraph.on('nodeMoved', markDirty),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [sceneGraph]);
}
