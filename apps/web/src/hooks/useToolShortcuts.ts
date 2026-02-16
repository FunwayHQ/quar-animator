/**
 * useToolShortcuts Hook
 * Global keyboard shortcuts for tool switching
 */

import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import type { ToolType } from '@quar/types';

// ============================================================================
// Shortcut Mapping
// ============================================================================

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'selection',
  r: 'rectangle',
  o: 'ellipse',
  p: 'pen',
  t: 'text',
  j: 'bone',
  f: 'artboard',
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that listens for global keyboard shortcuts to switch tools
 *
 * Shortcuts:
 * - V: Selection tool
 * - R: Rectangle tool
 * - O: Ellipse tool
 * - P: Pen tool
 *
 * Shortcuts are ignored when:
 * - Input or textarea is focused
 * - Ctrl, Alt, or Meta modifiers are pressed
 */
export function useToolShortcuts() {
  const setActiveTool = useEditorStore((state) => state.setActiveTool);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore when modifier keys are pressed
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }

      // Ignore when input or textarea is focused
      const target = event.target as HTMLElement | null;
      if (target && target.tagName) {
        const tagName = target.tagName.toLowerCase();
        const isEditable =
          target.isContentEditable || target.getAttribute?.('contenteditable') === 'true';
        if (tagName === 'input' || tagName === 'textarea' || isEditable) {
          return;
        }
      }

      // Check for tool shortcut (case-insensitive)
      const key = event.key.toLowerCase();
      const tool = TOOL_SHORTCUTS[key];

      if (tool) {
        event.preventDefault();
        setActiveTool(tool);
      }
    },
    [setActiveTool]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Get the shortcut key for a tool type
 */
export function getToolShortcut(tool: ToolType): string | null {
  for (const [key, value] of Object.entries(TOOL_SHORTCUTS)) {
    if (value === tool) {
      return key.toUpperCase();
    }
  }
  return null;
}
