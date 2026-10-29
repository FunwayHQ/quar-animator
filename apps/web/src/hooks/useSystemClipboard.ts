/**
 * Copy and cut onto the system clipboard, so layers paste into another
 * window or browser (services/systemClipboard.ts). Ctrl/Cmd+C and +X anywhere
 * in the editor go through the browser's copy and cut events, which may write
 * to the clipboard without asking; text fields and selected text keep theirs.
 * Menu items use copyLayers(), which raises the same events.
 */

import { useEffect } from 'react';
import type { SceneGraphLike } from '../stores/editorStore';
import { useEditorStore } from '../stores/editorStore';
import { decodeClipboard, encodeClipboard } from '../services/systemClipboard';
import { toast } from '../components/common/Toast';
import { KEYS, formatShortcut } from '../components/common/shortcuts';

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Text picked on the page (in a panel, say): Ctrl+C is for that. */
function hasTextSelection(): boolean {
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== '';
}

/** Copy (or cut) the selected layers in the app, then put them on this clipboard event. */
function handleClipboardEvent(event: ClipboardEvent, sceneGraph: SceneGraphLike): void {
  if (isTextField(event.target) || hasTextSelection()) return;
  const state = useEditorStore.getState();
  if (state.selectedNodeIds.size === 0) return;
  if (event.type === 'cut') state.cutSelection(sceneGraph);
  else state.copySelection(sceneGraph);

  const payload = useEditorStore.getState().clipboardPayload();
  if (!payload || !event.clipboardData) return;
  const { text, html } = encodeClipboard(payload);
  event.clipboardData.setData('text/plain', text);
  event.clipboardData.setData('text/html', html);
  event.preventDefault();
}

/** On a Mac, Ctrl+C/X aren't the browser's copy and cut (Cmd+C/X are), so no event comes. */
function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function useSystemClipboard(sceneGraph: SceneGraphLike): void {
  useEffect(() => {
    const onClipboard = (event: ClipboardEvent) => handleClipboardEvent(event, sceneGraph);
    // Ctrl+C/X on a Mac: copy from the key press (which may still use the clipboard)
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isMac() || !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'c' && key !== 'x') return;
      if (isTextField(event.target) || hasTextSelection()) return;
      if (useEditorStore.getState().selectedNodeIds.size === 0) return;
      event.preventDefault();
      copyLayers(sceneGraph, key === 'x' ? 'cut' : 'copy');
    };
    document.addEventListener('copy', onClipboard);
    document.addEventListener('cut', onClipboard);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('copy', onClipboard);
      document.removeEventListener('cut', onClipboard);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sceneGraph]);
}

/**
 * Copy or cut the selected layers from a menu: raises the browser's own
 * copy/cut event (which useSystemClipboard answers), else copies in the app
 * and tries the async clipboard.
 */
export function copyLayers(sceneGraph: SceneGraphLike, kind: 'copy' | 'cut'): void {
  let raised = false;
  const mark = () => {
    raised = true;
  };
  document.addEventListener(kind, mark);
  try {
    document.execCommand(kind);
  } catch {
    // Not supported: the fallback below
  } finally {
    document.removeEventListener(kind, mark);
  }
  if (raised) return;

  const state = useEditorStore.getState();
  if (kind === 'cut') state.cutSelection(sceneGraph);
  else state.copySelection(sceneGraph);
  const payload = useEditorStore.getState().clipboardPayload();
  if (payload) void navigator.clipboard?.writeText(encodeClipboard(payload).text).catch(() => {});
}

/**
 * Edit › Paste: the canvas pastes as Ctrl+V does — layers, SVG or a picture
 * from the system clipboard, else what was copied here.
 */
export const MENU_PASTE_EVENT = 'menubar:paste';

/** How reading the system clipboard for a paste went. */
export type SystemPaste = 'pasted' | 'refused' | 'nothing';

/**
 * Whether a menu may read the system clipboard: the browser has the
 * Clipboard API (reading it may still ask for permission first).
 */
export function canReadSystemClipboard(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';
}

/** The browser said no to reading the clipboard (permission refused, or the page not focused). */
export function isClipboardRefusal(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError';
}

/**
 * Paste what was copied here, when the system clipboard had nothing to
 * paste; with nothing here either, say why nothing was pasted.
 */
export function pasteOwnClipboard(sceneGraph: SceneGraphLike, refused: boolean): void {
  const state = useEditorStore.getState();
  if (state.clipboard?.length) {
    state.pasteClipboard(sceneGraph);
    return;
  }
  toast.info(
    refused
      ? `The browser didn’t let Quar Animator read the clipboard. To paste what you copied, press ${formatShortcut(KEYS.paste)}.`
      : 'Nothing to paste: copy some layers, an SVG or a picture first.'
  );
}

/** Paste from a menu: the canvas pastes when it's there, else layers off the system clipboard. */
export function pasteFromMenu(sceneGraph: SceneGraphLike): Promise<void> {
  const event = new CustomEvent(MENU_PASTE_EVENT, { cancelable: true });
  if (!window.dispatchEvent(event)) return Promise.resolve();
  return pasteLayers(sceneGraph);
}

/** Layers on the system clipboard if any, else the app's own clipboard. */
export async function pasteLayers(sceneGraph: SceneGraphLike): Promise<void> {
  let refused = false;
  try {
    const payload = decodeClipboard(await navigator.clipboard.readText());
    if (payload) {
      useEditorStore.getState().pastePayload(sceneGraph, payload);
      return;
    }
  } catch (error) {
    refused = isClipboardRefusal(error);
  }
  pasteOwnClipboard(sceneGraph, refused);
}
