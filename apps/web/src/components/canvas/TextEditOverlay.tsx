/**
 * TextEditOverlay for Quar Animator
 * Positioned textarea overlay for inline text editing on canvas.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { TextNode } from '@quar/types';
import type { Camera } from '@quar/core';
import styles from './TextEditOverlay.module.css';

export interface TextEditOverlayProps {
  node: TextNode;
  camera: Camera;
  onCommit: (content: string) => void;
  onCancel: () => void;
}

export function TextEditOverlay({ node, camera, onCommit, onCancel }: TextEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Position the overlay at the node's screen coordinates
  const screenPos = camera.worldToScreen(node.transform.position);
  const zoom = camera.zoom;

  const scaledFontSize = node.fontSize * zoom * node.transform.scale.y;

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
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.style.width = 'auto';
    el.style.width = `${Math.max(el.scrollWidth, 20)}px`;
  }, []);

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
