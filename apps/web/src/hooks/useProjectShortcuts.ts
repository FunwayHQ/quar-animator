/**
 * useProjectShortcuts Hook
 * Keyboard shortcuts for project operations (Ctrl+S, Ctrl+N, Ctrl+O, Ctrl+Shift+S)
 */

import { useEffect, useCallback } from 'react';

export interface ProjectShortcutCallbacks {
  onSave: () => void;
  onSaveAs: () => void;
  onNew: () => void;
  onOpen: () => void;
}

export function useProjectShortcuts(callbacks: ProjectShortcutCallbacks) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle Ctrl/Cmd shortcuts
      if (!event.ctrlKey && !event.metaKey) return;

      // Ignore when input, textarea, or select is focused
      const target = event.target as HTMLElement | null;
      if (target && target.tagName) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          return;
        }
      }

      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault();
          if (event.shiftKey) {
            callbacks.onSaveAs();
          } else {
            callbacks.onSave();
          }
          break;

        case 'n':
          if (!event.shiftKey) {
            event.preventDefault();
            callbacks.onNew();
          }
          break;

        case 'o':
          if (!event.shiftKey) {
            event.preventDefault();
            callbacks.onOpen();
          }
          break;
      }
    },
    [callbacks]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
