/**
 * useDocumentFonts Hook
 * Loads the fonts the open document's text uses (Inter's weights, Google
 * fonts), when it opens, whenever text arrives in it, and as soon as Google
 * Fonts are turned on.
 */

import { useEffect } from 'react';
import type { SceneGraph } from '@quar/core';
import { useEditorStore } from '../stores/editorStore';
import { documentFontsUsed, loadDocumentFonts } from '../services/documentFonts';
import { onGoogleFontsConsentChange } from '../components/common/ConsentBanner';

export function useDocumentFonts(sceneGraph: SceneGraph): void {
  useEffect(() => {
    // A paste or a replaced graph adds many nodes at once: look once for all of them
    let queued = false;
    const check = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const uses = documentFontsUsed(sceneGraph.getNodes(), useEditorStore.getState().symbols);
        loadDocumentFonts(uses).catch((error: unknown) => {
          console.warn('[Fonts] Could not load the document’s fonts:', error);
        });
      });
    };
    check();
    const unsubs = [
      sceneGraph.on('graphReplaced', check),
      sceneGraph.on('nodeAdded', check),
      // Allowed after a no: the text in a stand-in font gets its own, no reload needed
      onGoogleFontsConsentChange((enabled) => {
        if (enabled) check();
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [sceneGraph]);
}
