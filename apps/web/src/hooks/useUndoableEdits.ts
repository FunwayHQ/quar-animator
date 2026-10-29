/**
 * Edits made in a panel as undo steps, without each handler pushing its own.
 *
 * The panel edits through the scene graph this hook gives it, which records
 * an undo step before it changes the scene, and through store actions wrapped
 * with useUndoable. The handlers it gives the panel's root make a gesture one
 * step however many changes it makes: a press from down to release (a slider
 * or colour drag), typing in a field until Enter or leaving it, and any other
 * event (a click, a pick from a list) the changes its handlers make.
 */

import { useCallback, useEffect, useMemo } from 'react';
import type React from 'react';
import { useEditorStore } from '../stores/editorStore';
import type { SceneGraphLike, UndoGroup } from '../stores/editorStore';
import { undoGroupUntilRelease } from '../stores/undoGroups';

/** The scene graph's methods that change the scene (fromJSON replaces it: never an edit). */
const EDITS = new Set<PropertyKey>(['addNode', 'removeNode', 'updateNode', 'moveNode']);

/**
 * The scene graph, recording an undo step before each change to the scene
 * (pushUndoStep: one for all the changes an edit makes).
 */
export function undoableSceneGraph<G extends SceneGraphLike>(sceneGraph: G): G {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(sceneGraph, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      let method = methods.get(key);
      if (!method) {
        const fn = value as (...args: unknown[]) => unknown;
        method = EDITS.has(key)
          ? (...args: unknown[]) => {
              useEditorStore.getState().pushUndoStep(target);
              return fn.apply(target, args);
            }
          : fn.bind(target);
        methods.set(key, method);
      }
      return method;
    },
  });
}

/** A store action that records an undo step for its change (with the edit's others). */
export function useUndoable<A extends unknown[], R>(
  action: (...args: A) => R,
  sceneGraph: SceneGraphLike
): (...args: A) => R {
  return useCallback(
    (...args: A) => {
      useEditorStore.getState().pushUndoStep(sceneGraph);
      return action(...args);
    },
    [action, sceneGraph]
  );
}

/** Inputs pressed or toggled, not typed in. */
const CONTROL_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !CONTROL_INPUTS.has(target.type);
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

// Shared by every panel using the hook, so one inside another agrees with it
/** The gesture going on: a press, or typing in a field. */
let gesture: UndoGroup | null = null;
let typing = false;
/** The one event (a click, a change) being handled, and its group. */
let handling: { event: Event; group: UndoGroup } | null = null;
/** Presses given an undo group already. */
const pressed = new WeakSet<Event>();

function startTyping() {
  gesture = useEditorStore.getState().beginUndoGroup();
  typing = true;
}

function endTyping() {
  if (!typing || !gesture) return;
  useEditorStore.getState().endUndoGroup(gesture);
  gesture = null;
  typing = false;
}

/**
 * An event's changes are one step — unless they're part of the gesture going
 * on. Its group ends once the event has reached the panel again (bubbling up)
 * or, should a handler stop it on the way, once the event has been handled.
 */
function groupEvent(event: React.SyntheticEvent) {
  if (gesture?.open) return;
  const native = event.nativeEvent;
  // The same event again (a checkbox's click, then its change): the one edit
  if (handling?.event === native) return;
  const group = useEditorStore.getState().beginUndoGroup();
  handling = { event: native, group };
  queueMicrotask(() => useEditorStore.getState().endUndoGroup(group));
}

function endEvent(event: React.SyntheticEvent) {
  if (handling?.event === event.nativeEvent) useEditorStore.getState().endUndoGroup(handling.group);
}

type EditHandlers = Pick<
  React.DOMAttributes<HTMLElement>,
  | 'onPointerDownCapture'
  | 'onKeyDownCapture'
  | 'onWheelCapture'
  | 'onBlurCapture'
  | 'onChangeCapture'
  | 'onChange'
  | 'onClickCapture'
  | 'onClick'
>;

/**
 * Handlers for a panel's root that make each gesture in it one undo step:
 * a press, typing in a field, or one event.
 */
export function useEditGestures(): EditHandlers {
  // A press anywhere ends the typing in a field (one in the panel then begins its own group)
  useEffect(() => {
    document.addEventListener('pointerdown', endTyping, true);
    return () => document.removeEventListener('pointerdown', endTyping, true);
  }, []);

  return useMemo(
    () => ({
      onPointerDownCapture: (event: React.PointerEvent) => {
        // Drags are made with the primary button (another may open a menu that takes its release)
        if (event.button !== 0 || pressed.has(event.nativeEvent)) return;
        pressed.add(event.nativeEvent);
        gesture = undoGroupUntilRelease();
        typing = false;
      },
      onKeyDownCapture: (event: React.KeyboardEvent) => {
        if (!isTextEntry(event.target)) return;
        // Enter commits what's been typed: what's typed next is a step of its own
        const enter = event.key === 'Enter' && event.target instanceof HTMLInputElement;
        if (!(typing && gesture?.open) || enter) startTyping();
      },
      onWheelCapture: (event: React.WheelEvent) => {
        // The wheel steps a focused number field, as its arrow keys do
        if (!isTextEntry(event.target) || event.target !== document.activeElement) return;
        if (!(typing && gesture?.open)) startTyping();
      },
      onBlurCapture: endTyping,
      onChangeCapture: groupEvent,
      onChange: endEvent,
      onClickCapture: groupEvent,
      onClick: endEvent,
    }),
    []
  );
}

/** The scene graph to edit through and the handlers for the panel's root. */
export function useUndoableEdits<G extends SceneGraphLike>(
  sceneGraph: G
): { sceneGraph: G; editHandlers: EditHandlers } {
  const undoable = useMemo(() => undoableSceneGraph(sceneGraph), [sceneGraph]);
  return { sceneGraph: undoable, editHandlers: useEditGestures() };
}
