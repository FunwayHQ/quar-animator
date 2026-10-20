/**
 * Tests for TextEditOverlay: placed on the text box, wrapping as the box does
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { Camera, createDefaultTransform, getTextLocalBounds } from '@quar/core';
import type { TextNode } from '@quar/types';
import { TextEditOverlay } from './TextEditOverlay';

function textNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: 't',
    name: 'Text',
    type: 'text',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x: 40, y: -20 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    content: 'Hello',
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [],
    strokes: [],
    ...overrides,
  };
}

function renderOverlay(node: TextNode, zoom = 1) {
  const camera = new Camera();
  camera.setViewport(800, 600);
  camera.zoom = zoom;
  render(<TextEditOverlay node={node} camera={camera} onCommit={vi.fn()} onCancel={vi.fn()} />);
  const textarea = screen.getByPlaceholderText('Type something...');
  return { camera, textarea, overlay: textarea.parentElement! };
}

describe('TextEditOverlay', () => {
  it('sits on the top-left of the text box, anchor included', () => {
    const node = textNode();
    const { camera, overlay } = renderOverlay(node);

    const box = getTextLocalBounds(node);
    const expected = camera.worldToScreen({
      x: node.transform.position.x + box.x,
      y: node.transform.position.y + box.y + box.height,
    });
    expect(parseFloat(overlay.style.left)).toBeCloseTo(expected.x);
    expect(parseFloat(overlay.style.top)).toBeCloseTo(expected.y);
  });

  it('never wraps auto width text', () => {
    const { textarea } = renderOverlay(textNode());

    expect(textarea.style.whiteSpace).toBe('pre');
    expect(textarea.style.minWidth).toBe('');
  });

  it('wraps text with a box at the box width, on screen', () => {
    const { textarea } = renderOverlay(
      textNode({ textResize: 'fixed', boxWidth: 150, boxHeight: 80 }),
      2
    );

    expect(textarea.style.whiteSpace).toBe('pre-wrap');
    expect(textarea.style.width).toBe('300px');
    expect(textarea.style.minWidth).toBe('300px');
    // A fixed box shows its whole height while typing
    expect(textarea.style.height).toBe('160px');
  });

  it('types in the color the text is filled with', () => {
    const { textarea } = renderOverlay(
      textNode({
        fills: [
          { type: 'solid', color: { r: 91, g: 141, b: 239, a: 1 }, opacity: 0.5, visible: true },
        ],
      })
    );

    expect(textarea.style.color).toBe('rgba(91, 141, 239, 0.5)');
  });
});
