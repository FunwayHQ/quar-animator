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
    el.select();
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
    onCommit(textareaRef.current?.value ?? node.content);
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
