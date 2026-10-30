/**
 * useLeaveWarning Hook
 * The browser asks before the tab is closed or reloaded while the project
 * has unsaved changes, or a save is still being written (it shows its own
 * words; a page can't choose them).
 */

import { useEffect } from 'react';
import { savesInFlight } from '../services/savesInFlight';
import { useEditorStore } from '../stores/editorStore';

export function useLeaveWarning(): void {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!useEditorStore.getState().isDirty && savesInFlight() === 0) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
}
