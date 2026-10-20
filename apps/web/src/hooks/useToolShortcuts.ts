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

// Every key the toolbar and menus show, so each works wherever focus is
// (not only on the canvas, whose tool manager knows them too)
const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'selection',
  a: 'direct-selection',
  h: 'hand',
  r: 'rectangle',
  o: 'ellipse',
  u: 'polygon',
  s: 'star',
  p: 'pen',
  b: 'brush',
  e: 'eraser',
  t: 'text',
  f: 'artboard',
  j: 'bone',
  w: 'weight-paint',
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that listens for global keyboard shortcuts to switch tools
 *
 * Shortcuts: V selection, A direct selection, H hand, R rectangle, O ellipse,
 * U polygon, S star, P pen, B brush, E eraser, T text, F artboard, J bone,
 * W weight paint
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
