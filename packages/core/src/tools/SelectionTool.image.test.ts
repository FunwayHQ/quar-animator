/**
 * Tests for SelectionTool image node handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionTool } from './SelectionTool';
import type { ToolContext } from './BaseTool';
import { createMockToolContext, createMockPointerEvent } from '../test/setup';
import { createDefaultTransform } from '../SceneGraph';
import type { ImageNode } from '@quar/types';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestImage(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): ImageNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };

  return {
    id,
    name: `Image ${id}`,
    type: 'image',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    src: 'data:image/png;base64,test',
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    cornerRadius: [0, 0, 0, 0],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SelectionTool - Image Node Handling', () => {
  let context: ToolContext;
  let tool: SelectionTool;

  beforeEach(() => {
    context = createMockToolContext();
    tool = new SelectionTool(context);
  });

  // ==========================================================================
  // Image Selection
  // ==========================================================================

  describe('image selection', () => {
    it('should select image node when clicking on it', () => {
      // Image at (100, 100), size 200x150, anchor (0.5, 0.5)
      // Bounds: x=0, y=25, width=200, height=150
      const image = createTestImage('img1', 100, 100, 200, 150);
      context.sceneGraph.addNode(image);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 }, // Center of image
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().has('img1')).toBe(true);
    });

    it('should select image when clicking near edge', () => {
      const image = createTestImage('img1', 100, 100, 200, 150);
      context.sceneGraph.addNode(image);

      // Click near top-right corner
      // Bounds: x = 100 - 100 = 0, y = 100 - 75 = 25
      // Right edge: x = 100 + 100 = 200, top edge: y = 100 + 75 = 175
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 190, y: 170 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 190, y: 170 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().has('img1')).toBe(true);
    });

    it('should not select image when clicking outside bounds', () => {
      const image = createTestImage('img1', 100, 100, 200, 150);
      context.sceneGraph.addNode(image);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 400, y: 400 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 400, y: 400 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should not select invisible image', () => {
      const image = createTestImage('img1', 100, 100, 200, 150);
      image.visible = false;
      context.sceneGraph.addNode(image);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should multi-select image with Ctrl+click', () => {
      const image1 = createTestImage('img1', 100, 100, 100, 100);
      const image2 = createTestImage('img2', 300, 100, 100, 100);
      context.sceneGraph.addNode(image1);
      context.sceneGraph.addNode(image2);

      // Select first image
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      // Ctrl+click second image
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 300, y: 100 },
          ctrlKey: true,
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 300, y: 100 },
          ctrlKey: true,
          button: 0,
        })
      );

      expect(context.getSelectedIds().size).toBe(2);
      expect(context.getSelectedIds().has('img1')).toBe(true);
      expect(context.getSelectedIds().has('img2')).toBe(true);
    });
  });

  // ==========================================================================
  // Image Moving
  // ==========================================================================

  describe('image moving', () => {
    it('should move selected image node on drag', () => {
      const image = createTestImage('img1', 100, 100, 200, 150);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 100, y: 100 },
          button: 0,
        })
      );

      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: { x: 130, y: 120 },
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 130, y: 120 },
          button: 0,
        })
      );

      const movedImage = context.sceneGraph.getNode('img1');
      expect(movedImage?.transform.position.x).toBe(130); // 100 + 30
      expect(movedImage?.transform.position.y).toBe(120); // 100 + 20
    });
  });

  // ==========================================================================
  // Image Resizing
  // ==========================================================================

  describe('image resizing', () => {
    it('should enter resizing mode when clicking on image handle', () => {
      // Image centered at (100, 100) with size 100x100
      // Bounds: x=50, y=50, width=100, height=100
      const image = createTestImage('img1', 100, 100, 100, 100);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      // Bottom-right corner at (150, 150) in world
      const screenPos = context.camera.worldToScreen({ x: 150, y: 150 });

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 150, y: 150 },
          screenPosition: screenPos,
          button: 0,
        })
      );

      expect(tool.getMode()).toBe('resizing');
    });

    it('should resize image by updating width/height directly', () => {
      // Image at (100, 100), size 100x100
      // Bounds: x=50, y=50, width=100, height=100
      const image = createTestImage('img1', 100, 100, 100, 100);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      // Click on bottom-right corner
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag to expand by 50 in each direction
      const endWorldPos = { x: 200, y: 200 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedImage = context.sceneGraph.getNode('img1') as ImageNode;
      // Original width 100 + delta 50 = 150
      expect(resizedImage.width).toBe(150);
      expect(resizedImage.height).toBe(150);
    });

    it('should resize image from top-left handle', () => {
      const image = createTestImage('img1', 100, 100, 100, 100);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      // Top-left corner is at (50, 50) in world
      const startScreenPos = context.camera.worldToScreen({ x: 50, y: 50 });
      const startWorldPos = { x: 50, y: 50 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag inward by 20
      const endWorldPos = { x: 70, y: 70 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedImage = context.sceneGraph.getNode('img1') as ImageNode;
      // Width: 100 - 20 = 80, Height: 100 - 20 = 80
      expect(resizedImage.width).toBe(80);
      expect(resizedImage.height).toBe(80);
    });

    it('should enforce minimum size when resizing image', () => {
      const image = createTestImage('img1', 100, 100, 100, 100);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Try to make it very small
      const endWorldPos = { x: 51, y: 51 };
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          button: 0,
        })
      );

      const resizedImage = context.sceneGraph.getNode('img1') as ImageNode;
      expect(resizedImage.width).toBeGreaterThanOrEqual(1);
      expect(resizedImage.height).toBeGreaterThanOrEqual(1);
    });

    it('should constrain aspect ratio with shift key', () => {
      const image = createTestImage('img1', 100, 100, 100, 100);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      const startScreenPos = context.camera.worldToScreen({ x: 150, y: 150 });
      const startWorldPos = { x: 150, y: 150 };

      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: startWorldPos,
          screenPosition: startScreenPos,
          button: 0,
        })
      );

      // Drag asymmetrically but with shift to constrain
      const endWorldPos = { x: 200, y: 170 }; // 50 right, 20 down
      tool.onPointerMove(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
        })
      );

      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: endWorldPos,
          screenPosition: context.camera.worldToScreen(endWorldPos),
          shiftKey: true,
          button: 0,
        })
      );

      const resizedImage = context.sceneGraph.getNode('img1') as ImageNode;
      // With shift, aspect ratio should be preserved (1:1 for this image)
      expect(resizedImage.width).toBe(resizedImage.height);
    });
  });

  // ==========================================================================
  // Image with custom anchor
  // ==========================================================================

  describe('image with custom anchor', () => {
    it('should correctly compute bounds with non-center anchor', () => {
      const image = createTestImage('img1', 100, 100, 200, 100);
      // Set anchor to top-left (0, 0) - note Y-up coordinate system
      image.transform.anchor = { x: 0, y: 0 };
      context.sceneGraph.addNode(image);

      // Image bounds should be: x=100, y=100, width=200, height=100
      // Click inside the image
      tool.onPointerDown(
        createMockPointerEvent({
          worldPosition: { x: 150, y: 150 },
          button: 0,
        })
      );
      tool.onPointerUp(
        createMockPointerEvent({
          worldPosition: { x: 150, y: 150 },
          button: 0,
        })
      );

      expect(context.getSelectedIds().has('img1')).toBe(true);
    });
  });

  // ==========================================================================
  // Keyboard events with image selection
  // ==========================================================================

  describe('keyboard events with image', () => {
    it('should delete selected image on Delete key', () => {
      const image = createTestImage('img1', 100, 100, 200, 150);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      tool.onKeyDown({ key: 'Delete' } as KeyboardEvent);

      expect(context.sceneGraph.getNodeCount()).toBe(0);
      expect(context.getSelectedIds().size).toBe(0);
    });

    it('should nudge selected image with arrow keys', () => {
      const image = createTestImage('img1', 100, 100, 200, 150);
      context.sceneGraph.addNode(image);
      context.setSelectedIds(['img1']);

      const event = { key: 'ArrowRight', preventDefault: () => {} } as KeyboardEvent;
      tool.onKeyDown(event);

      expect(context.sceneGraph.getNode('img1')?.transform.position.x).toBe(101);
    });
  });
});
