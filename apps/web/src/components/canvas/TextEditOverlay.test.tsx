/**
 * Tests for TextEditOverlay: placed on the text box, wrapping as the box does
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test/utils';
import { Camera, createDefaultTransform, getTextLocalBounds, mat3 } from '@quar/core';
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

function renderOverlay(
  node: TextNode,
  zoom = 1,
  worldTransform?: Parameters<typeof TextEditOverlay>[0]['worldTransform']
) {
  const camera = new Camera();
  camera.setViewport(800, 600);
  camera.zoom = zoom;
  const onCommit = vi.fn();
  render(
    <TextEditOverlay
      node={node}
      camera={camera}
      worldTransform={worldTransform}
      onCommit={onCommit}
    />
  );
  const textarea = screen.getByPlaceholderText('Type something...') as HTMLTextAreaElement;
  return { camera, textarea, overlay: textarea.parentElement!, onCommit };
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

  it('turns with rotated text, around its top-left corner', () => {
    const node = textNode({
      transform: { ...createDefaultTransform(), position: { x: 0, y: 0 }, rotation: 30 },
    });
    const { camera, overlay } = renderOverlay(node);

    const box = getTextLocalBounds(node);
    const corner = mat3.transformPoint(mat3.compose({ x: 0, y: 0 }, 30, { x: 1, y: 1 }), {
      x: box.x,
      y: box.y + box.height,
    });
    const expected = camera.worldToScreen(corner);
    expect(parseFloat(overlay.style.left)).toBeCloseTo(expected.x);
    expect(parseFloat(overlay.style.top)).toBeCloseTo(expected.y);
    const turn = /rotate\((-?[\d.e-]+)deg\)/.exec(overlay.style.transform);
    expect(Number(turn?.[1])).toBeCloseTo(-30);
  });

  it('sits where the text is drawn inside a moved parent', () => {
    const node = textNode();
    const parent = mat3.compose({ x: 300, y: -100 }, 0, { x: 2, y: 2 });
    const world = mat3.multiply(parent, mat3.compose(node.transform.position, 0, { x: 1, y: 1 }));
    const { camera, overlay } = renderOverlay(node, 1, world);

    const box = getTextLocalBounds(node);
    const expected = camera.worldToScreen(
      mat3.transformPoint(world, { x: box.x, y: box.y + box.height })
    );
    expect(parseFloat(overlay.style.left)).toBeCloseTo(expected.x);
    expect(parseFloat(overlay.style.top)).toBeCloseTo(expected.y);
    expect(overlay.style.transform).toBe('rotate(0deg) scale(2, 2)');
  });

  it('starts a new line on Enter, as in Figma, and finishes on Escape', () => {
    const { textarea, onCommit } = renderOverlay(textNode({ content: 'Hello' }));

    const enter = fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(enter).toBe(true); // not prevented: the textarea adds the line
    expect(onCommit).not.toHaveBeenCalled();

    textarea.value = 'Hello\nthere';
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onCommit).toHaveBeenCalledWith('Hello\nthere');
  });

  it('finishes on Ctrl/Cmd+Enter, and only once', () => {
    const { textarea, onCommit } = renderOverlay(textNode({ content: 'Hi' }));

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('Hi');
  });
});
