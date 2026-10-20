/**
 * TextEditOverlay for Quar Animator
 * Positioned textarea overlay for inline text editing on canvas.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Matrix3, TextNode } from '@quar/types';
import type { Camera } from '@quar/core';
import { getTextBox, getTextLocalBounds, mat3 } from '@quar/core';
import styles from './TextEditOverlay.module.css';

export interface TextEditOverlayProps {
  node: TextNode;
  camera: Camera;
  /**
   * The text's full world transform (its parents' included). Without it the
   * text's own transform is taken as the world one.
   */
  worldTransform?: Matrix3;
  /** Editing ends, keeping what was typed (an empty new text is removed). */
  onCommit: (content: string) => void;
}

export function TextEditOverlay({ node, camera, worldTransform, onCommit }: TextEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const zoom = camera.zoom;

  // The top-left of the text box (Y-up, so the top is its highest y, offset
  // for the anchor as the canvas draws it) placed by the text's world
  // transform, which turns and scales the box with the text
  const bounds = getTextLocalBounds(node);
  const { position, rotation, scale } = node.transform;
  const world = worldTransform ?? mat3.compose(position, rotation, scale);
  const worldTopLeft = mat3.transformPoint(world, { x: bounds.x, y: bounds.y + bounds.height });
  const screenPos = camera.worldToScreen(worldTopLeft);
  const worldRotation = (Math.atan2(world.b, world.a) * 180) / Math.PI;
  const worldScale = { x: Math.hypot(world.a, world.b), y: Math.hypot(world.c, world.d) };

  // Auto width text grows sideways and never wraps; text with a box wraps at
  // its width, as the canvas will set it
  const box = getTextBox(node);

  // Typed in the text's own color, as it will be drawn
  const fill = node.fills.find((f) => f.visible && f.type === 'solid' && f.color);
  const color = fill?.color
    ? `rgba(${fill.color.r}, ${fill.color.g}, ${fill.color.b}, ${fill.color.a * fill.opacity})`
    : undefined;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.value = node.content;
    el.focus();
    // Only select all if there's existing content (re-edit); for new empty nodes just focus
    if (node.content) {
      el.select();
    }
    // Re-focus after browser click/dblclick events settle (prevents canvas focus steal
    // when the overlay mounts during a double-click — the remaining click events in the
    // browser's event queue can steal focus from the textarea to the canvas)
    const timer = setTimeout(() => {
      if (el && document.activeElement !== el) {
        el.focus();
        if (node.content) el.select();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [node.content]);

  // Editing ends once, whichever way: Escape, Ctrl/Cmd+Enter or clicking away
  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(textareaRef.current?.value ?? node.content);
  }, [onCommit, node.content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Stop propagation to prevent tool shortcuts while editing
      e.stopPropagation();

      // As in Figma: Enter starts a new line; Escape finishes, keeping the text
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        finish();
      }
    },
    [finish]
  );

  const handleBlur = useCallback(() => {
    // Delay commit to let the setTimeout re-focus in useEffect settle first.
    // During double-click mount, remaining browser events steal focus from the
    // textarea to the canvas, triggering blur. The useEffect setTimeout will
    // re-focus the textarea. If it regains focus, we should NOT commit/close.
    setTimeout(() => {
      if (textareaRef.current && document.activeElement === textareaRef.current) {
        return; // textarea regained focus — don't close
      }
      finish();
    }, 50);
  }, [finish]);

  // Auto-resize textarea to fit content
  const boxWidthPx = box ? box.width * zoom : undefined;
  const boxHeightPx = box?.height !== undefined ? box.height * zoom : undefined;
  const fitToContent = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // A fixed box shows its full height, and the text past it while typing
    el.style.height = `${Math.max(el.scrollHeight, boxHeightPx ?? 0)}px`;
    if (boxWidthPx === undefined) {
      el.style.width = 'auto';
      el.style.width = `${Math.max(el.scrollWidth, 20)}px`;
    }
  }, [boxWidthPx, boxHeightPx]);
  const handleInput = fitToContent;
  useEffect(fitToContent, [fitToContent, node.content]);

  return (
    <div
      className={styles.textEditOverlay}
      style={{
        left: screenPos.x,
        // Screen Y: camera.worldToScreen gives screen coords. QUAR Y-up means
        // higher Y values are visually higher, but screen Y goes down.
        top: screenPos.y,
        // Screen Y runs down, so the text's counterclockwise turn is a negative CSS one
        transform: `rotate(${-worldRotation}deg) scale(${worldScale.x}, ${worldScale.y})`,
        transformOrigin: 'top left',
      }}
    >
      <textarea
        ref={textareaRef}
        className={styles.textEditArea}
        style={{
          fontFamily: `"${node.fontFamily}", sans-serif`,
          fontSize: `${node.fontSize * zoom}px`,
          fontWeight: node.fontWeight,
          fontStyle: node.fontStyle,
          textAlign: node.textAlign,
          lineHeight: node.lineHeight,
          letterSpacing: `${node.letterSpacing * zoom}px`,
          whiteSpace: box ? 'pre-wrap' : 'pre',
          ...(color && { color }),
          ...(boxWidthPx !== undefined && {
            width: `${boxWidthPx}px`,
            minWidth: `${boxWidthPx}px`,
          }),
        }}
        defaultValue={node.content}
        placeholder="Type something..."
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onInput={handleInput}
        // Prevent canvas pointer events while editing
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      />
    </div>
  );
}
