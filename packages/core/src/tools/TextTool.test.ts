/**
 * Tests for TextTool: Figma-style click for auto width, drag for a fixed box
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextTool } from './TextTool';
import type { ToolContext } from './BaseTool';
import type { TextNode } from '@quar/types';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { getTextLocalBounds } from '../font/textPlacement';

describe('TextTool', () => {
  let context: ToolContext;
  let tool: TextTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new TextTool(context);
  });

  describe('properties', () => {
    it('should have correct type', () => {
      expect(tool.type).toBe('text');
    });

    it('should have crosshair cursor', () => {
      expect(tool.cursor).toBe('crosshair');
    });
  });

  describe('text node creation', () => {
    it('should create text node with anchor (0.5, 0.5) for center rotation', () => {
      // Click to create a text node
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 200 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 200 } }));

      // Find the text node that was added to the scene graph
      const nodes = context.sceneGraph.getRootNodes();
      expect(nodes.length).toBe(1);
      const textNode = nodes[0] as TextNode;
      expect(textNode.type).toBe('text');
      expect(textNode.transform.anchor.x).toBe(0.5);
      expect(textNode.transform.anchor.y).toBe(0.5);
    });

    it('starts auto width text with its top left at the click', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 150, y: 250 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 150, y: 250 } }));

      const textNode = context.sceneGraph.getRootNodes()[0] as TextNode;
      expect(textNode.textResize).toBe('auto-width');
      expect(textNode.boxWidth).toBeUndefined();
      expect(textNode.transform.scale).toEqual({ x: 1, y: 1 });
      const box = getTextLocalBounds(textNode);
      expect(textNode.transform.position.x + box.x).toBeCloseTo(150);
      expect(textNode.transform.position.y + box.y + box.height).toBeCloseTo(250);
    });

    it('treats a tiny drag as a click', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 200 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 102, y: 201 } }));
      expect(tool.getPreviewNode()).toBeNull();
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 102, y: 201 } }));

      const textNode = context.sceneGraph.getRootNodes()[0] as TextNode;
      expect(textNode.textResize).toBe('auto-width');
    });

    it('makes a dragged box a fixed size box the text wraps in, without scaling it', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 300 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 300, y: 200 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 300, y: 200 } }));

      const textNode = context.sceneGraph.getRootNodes()[0] as TextNode;
      expect(textNode.textResize).toBe('fixed');
      expect(textNode.boxWidth).toBe(200);
      expect(textNode.boxHeight).toBe(100);
      expect(textNode.transform.scale).toEqual({ x: 1, y: 1 });
      expect(textNode.transform.position).toEqual({ x: 200, y: 250 });
      // The box is exactly the dragged area
      const box = getTextLocalBounds(textNode);
      expect(box).toEqual({ x: -100, y: -50, width: 200, height: 100 });
    });

    it('gives a flat dragged box at least one line of height, hanging from the drag', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 100 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 200, y: 98 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 98 } }));

      const textNode = context.sceneGraph.getRootNodes()[0] as TextNode;
      const lineHeight = textNode.fontSize * textNode.lineHeight;
      expect(textNode.boxHeight).toBeCloseTo(lineHeight);
      // The top of the box is at the top of the drag
      expect(textNode.transform.position.y + lineHeight / 2).toBeCloseTo(100);
    });

    it('previews the box being dragged as an outline', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 80, y: -40 } }));

      const preview = tool.getPreviewNode()!;
      expect(preview.type).toBe('rectangle');
      expect(preview.width).toBe(80);
      expect(preview.height).toBe(40);
      expect(preview.transform.position).toEqual({ x: 40, y: -20 });
      expect(preview.fills).toEqual([]);
      expect(preview.strokes[0]!.visible).toBe(true);

      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 80, y: -40 } }));
      expect(tool.getPreviewNode()).toBeNull();
    });

    it('opens the new text for editing', () => {
      const onEnterTextEdit = vi.fn();
      context.onEnterTextEdit = onEnterTextEdit;
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 0, y: 0 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 0, y: 0 } }));

      expect(onEnterTextEdit).toHaveBeenCalledWith(context.sceneGraph.getRootNodes()[0]!.id);
    });

    it('should select the created text node', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 200 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 200 } }));

      const nodes = context.sceneGraph.getRootNodes();
      expect(context.getSelectedIds().has(nodes[0].id)).toBe(true);
    });

    it('should ignore right clicks', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 200 }, button: 2 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 100, y: 200 }, button: 2 }));

      const nodes = context.sceneGraph.getRootNodes();
      expect(nodes.length).toBe(0);
    });

    it('should cancel on Escape during drag', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 200 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 200, y: 300 } }));

      tool.onKeyDown!(new KeyboardEvent('keydown', { key: 'Escape' }));

      // After escape, releasing should not create a node
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 200, y: 300 } }));

      const nodes = context.sceneGraph.getRootNodes();
      expect(nodes.length).toBe(0);
    });
  });
});
