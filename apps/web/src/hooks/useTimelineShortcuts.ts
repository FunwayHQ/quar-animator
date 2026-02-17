/**
 * useTimelineShortcuts Hook
 * Keyboard shortcuts for timeline playback control
 */

import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';

interface TimelineShortcutCallbacks {
  togglePlay: () => void;
  goToStart: () => void;
  goToEnd: () => void;
  nextFrame: () => void;
  prevFrame: () => void;
}

export function useTimelineShortcuts(callbacks: TimelineShortcutCallbacks) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Alt+W: toggle work area (handle before the altKey guard)
      if (
        event.altKey &&
        (event.key === 'w' || event.key === 'W') &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        const target = event.target as HTMLElement | null;
        if (target && target.tagName) {
          const tagName = target.tagName.toLowerCase();
          if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
            return;
          }
        }
        event.preventDefault();
        useEditorStore.getState().toggleWorkArea();
        return;
      }

      // Ignore when ctrl/alt/meta keys are pressed (except Shift which we handle)
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // Ignore when input, textarea, or select is focused
      const target = event.target as HTMLElement | null;
      if (target && target.tagName) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          return;
        }
      }

      const state = useEditorStore.getState();

      // Shift-modified shortcuts
      if (event.shiftKey) {
        if (event.key === '<' || event.key === ',') {
          // Shift+, : jump 10 frames backward
          if (!state.isPlaying) {
            event.preventDefault();
            state.setCurrentFrame(state.currentFrame - 10);
          }
          return;
        }
        if (event.key === '>' || event.key === '.') {
          // Shift+. : jump 10 frames forward
          if (!state.isPlaying) {
            event.preventDefault();
            state.setCurrentFrame(state.currentFrame + 10);
          }
          return;
        }
        if (event.key === 'I' || event.key === 'i') {
          // Shift+I : set work area OUT (end) to current frame
          event.preventDefault();
          useEditorStore.getState().setWorkAreaToCurrentFrame('end');
          return;
        }
        if (event.key === 'O' || event.key === 'o') {
          // Shift+O : toggle onion skinning
          event.preventDefault();
          useEditorStore.getState().toggleOnionSkin();
          return;
        }
        if (event.key === 'R' || event.key === 'r') {
          // Shift+R : toggle rulers
          event.preventDefault();
          useEditorStore.getState().toggleShowRulers();
          return;
        }
        if (event.key === 'G' || event.key === 'g') {
          // Shift+G : toggle guides
          event.preventDefault();
          useEditorStore.getState().toggleShowGuides();
          return;
        }
        // Don't process other keys when Shift is held (avoid unintended Shift+K, Shift+L, etc.)
        return;
      }

      switch (event.key) {
        case ' ':
          // Space: toggle play/pause (tap only, not hold)
          if (!event.repeat) {
            event.preventDefault();
            callbacks.togglePlay();
          }
          break;

        case 'g':
        case 'G':
          // G: toggle graph editor
          event.preventDefault();
          useEditorStore.getState().toggleTimelineViewMode();
          break;

        case 'Home':
          event.preventDefault();
          callbacks.goToStart();
          break;

        case 'End':
          event.preventDefault();
          callbacks.goToEnd();
          break;

        case ',':
          // Previous frame (only when not playing)
          if (!state.isPlaying) {
            event.preventDefault();
            callbacks.prevFrame();
          }
          break;

        case '.':
          // Next frame (only when not playing)
          if (!state.isPlaying) {
            event.preventDefault();
            callbacks.nextFrame();
          }
          break;

        case 'l':
        case 'L':
          // Toggle loop
          event.preventDefault();
          useEditorStore.getState().setIsLooping(!state.isLooping);
          break;

        case 'i':
        case 'I':
          // Set work area IN (start) to current frame
          event.preventDefault();
          useEditorStore.getState().setWorkAreaToCurrentFrame('start');
          break;

        case 'k':
        case 'K':
          // Toggle auto-keyframe
          event.preventDefault();
          useEditorStore.getState().toggleAutoKeyframe();
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
