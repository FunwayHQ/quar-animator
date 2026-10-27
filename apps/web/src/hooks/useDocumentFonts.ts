/**
 * useDocumentFonts Hook
 * Loads the Google fonts the open document's text uses, when it opens and
 * whenever text arrives in it.
 */

import { useEffect } from 'react';
import type { SceneGraph } from '@quar/core';
import { useEditorStore } from '../stores/editorStore';
import { googleFontsUsed, loadDocumentFonts } from '../services/documentFonts';

export function useDocumentFonts(sceneGraph: SceneGraph): void {
  useEffect(() => {
    // A paste or a replaced graph adds many nodes at once: look once for all of them
    let queued = false;
    const check = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const uses = googleFontsUsed(sceneGraph.getNodes(), useEditorStore.getState().symbols);
        loadDocumentFonts(uses).catch((error: unknown) => {
          console.warn('[Fonts] Could not load the document’s fonts:', error);
        });
      });
    };
    check();
    const unsubs = [sceneGraph.on('graphReplaced', check), sceneGraph.on('nodeAdded', check)];
    return () => unsubs.forEach((unsub) => unsub());
  }, [sceneGraph]);
}
