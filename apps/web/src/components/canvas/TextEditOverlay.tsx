/**
 * TextEditOverlay for Quar Animator
 * Positioned textarea overlay for inline text editing on canvas.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { TextNode } from '@quar/types';
import type { Camera } from '@quar/core';
import { getTextBox, getTextLocalBounds } from '@quar/core';
import styles from './TextEditOverlay.module.css';

export interface TextEditOverlayProps {
  node: TextNode;
  camera: Camera;
  onCommit: (content: string) => void;
  onCancel: () => void;
}

export function TextEditOverlay({ node, camera, onCommit, onCancel }: TextEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const zoom = camera.zoom;

  // The visual top-left of the text box in world coordinates (Y-up, so the
  // top is the box's highest y), offset for the anchor as the canvas draws it
  const bounds = getTextLocalBounds(node);
  const worldTopLeft = {
    x: node.transform.position.x + bounds.x * node.transform.scale.x,
    y: node.transform.position.y + (bounds.y + bounds.height) * node.transform.scale.y,
  };
  const screenPos = camera.worldToScreen(worldTopLeft);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Stop propagation to prevent tool shortcuts while editing
      e.stopPropagation();

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onCommit(textareaRef.current?.value ?? node.content);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onCommit, onCancel, node.content]
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
      onCommit(textareaRef.current?.value ?? node.content);
    }, 50);
  }, [onCommit, node.content]);

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
        transform: `scale(${node.transform.scale.x}, ${node.transform.scale.y})`,
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
