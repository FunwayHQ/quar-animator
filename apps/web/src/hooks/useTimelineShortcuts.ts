/**
 * useTimelineShortcuts Hook
 * Keyboard shortcuts for timeline playback control
 */

import { useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';

/** Input types Space doesn't type into: there it plays and pauses too. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'reset',
  'submit',
  'image',
]);

/** Whether Space typed into this element would be text (or open a select). */
function takesSpace(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  return tag === 'input' && !NON_TEXT_INPUTS.has((target as HTMLInputElement).type);
}

function isCanvas(target: EventTarget | null): boolean {
  return target instanceof HTMLCanvasElement;
}

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
        if (event.key === 'A' || event.key === 'a') {
          // Shift+A : toggle the Animation Sequence window
          event.preventDefault();
          useEditorStore.getState().toggleSequenceWindow();
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

  useSpaceToPlay(callbacks.togglePlay);
}

/**
 * Space plays and pauses wherever focus is, except in a field it types into.
 * Listening in the capture phase puts it ahead of a focused button or tab,
 * which would otherwise take Space as a click. On the canvas Space is also
 * the pan key (Space+drag), so there it plays on release, unless the pointer
 * went down while it was held.
 */
function useSpaceToPlay(togglePlay: () => void) {
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

  useEffect(() => {
    let canvasSpace: { pointerWentDown: boolean } | null = null;

    const isPlayKey = (event: KeyboardEvent) =>
      event.key === ' ' &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !takesSpace(event.target);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPlayKey(event)) return;
      if (isCanvas(event.target)) {
        // The canvas sees the key too, to get ready to pan
        if (!event.repeat) canvasSpace = { pointerWentDown: false };
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) togglePlayRef.current();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      if (canvasSpace) {
        const panned = canvasSpace.pointerWentDown;
        canvasSpace = null;
        if (!panned) togglePlayRef.current();
        return;
      }
      if (isPlayKey(event) && !isCanvas(event.target)) {
        // A focused button would take the release as a click
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onPointerDown = () => {
      if (canvasSpace) canvasSpace.pointerWentDown = true;
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);
}
