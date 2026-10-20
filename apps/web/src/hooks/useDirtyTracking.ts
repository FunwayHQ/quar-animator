/**
 * useDirtyTracking Hook
 * Marks the project as having unsaved changes whenever its scene changes.
 */

import { useEffect } from 'react';
import type { SceneGraph } from '@quar/core';
import { useEditorStore } from '../stores/editorStore';
import { isPosingScene } from '../stores/scenePosing';

/**
 * Mark the project dirty on any scene change — except ones that only show
 * the animation: an export posing frames, playback and scrubbing applying
 * keyframes, IK and physics posing bones.
 */
export function useDirtyTracking(sceneGraph: SceneGraph): void {
  useEffect(() => {
    const markDirty = () => {
      const store = useEditorStore.getState();
      if (!store.isExporting && !isPosingScene()) store.markDirty();
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
