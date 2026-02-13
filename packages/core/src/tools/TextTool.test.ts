/**
 * Tests for TextTool – anchor center fix (Bug 4)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TextTool } from './TextTool';
import type { ToolContext } from './BaseTool';
import type { TextNode } from '@quar/types';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';

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

    it('should create text node at click position', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 150, y: 250 }, button: 0 }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 150, y: 250 } }));

      const nodes = context.sceneGraph.getRootNodes();
      const textNode = nodes[0] as TextNode;
      expect(textNode.transform.position.x).toBe(150);
      expect(textNode.transform.position.y).toBe(250);
    });

    it('should create text node with drag for sized text box with centered anchor', () => {
      tool.onPointerDown(createMockPointerEvent({ worldPosition: { x: 100, y: 200 }, button: 0 }));
      tool.onPointerMove(createMockPointerEvent({ worldPosition: { x: 300, y: 300 } }));
      tool.onPointerUp(createMockPointerEvent({ worldPosition: { x: 300, y: 300 } }));

      const nodes = context.sceneGraph.getRootNodes();
      expect(nodes.length).toBe(1);
      const textNode = nodes[0] as TextNode;
      expect(textNode.type).toBe('text');
      expect(textNode.transform.anchor.x).toBe(0.5);
      expect(textNode.transform.anchor.y).toBe(0.5);
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
