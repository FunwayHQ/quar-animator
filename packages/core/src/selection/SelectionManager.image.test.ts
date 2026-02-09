/**
 * Tests for SelectionManager image node handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from './SelectionManager';
import { SceneGraph, createDefaultTransform } from '../SceneGraph';
import type { ImageNode, RectangleNode } from '@quar/types';

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

function createTestRectangle(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): RectangleNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };

  return {
    id,
    name: `Rectangle ${id}`,
    type: 'rectangle',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SelectionManager - Image Node', () => {
  let manager: SelectionManager;
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    manager = new SelectionManager();
    sceneGraph = new SceneGraph();
  });

  // ==========================================================================
  // getNodeBounds for image
  // ==========================================================================

  describe('getNodeBounds', () => {
    it('should return correct bounds for image with default anchor (0.5, 0.5)', () => {
      // Image at (100, 100), size 200x150
      // Anchor (0.5, 0.5) means local bounds: x = -100, y = -75, w = 200, h = 150
      // World bounds: x = 100 + (-100) = 0, y = 100 + (-75) = 25, w = 200, h = 150
      const image = createTestImage('img1', 100, 100, 200, 150);

      const bounds = manager.getNodeBounds(image);

      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBe(0);   // 100 - 100 (half width)
      expect(bounds!.y).toBe(25);  // 100 - 75  (half height)
      expect(bounds!.width).toBe(200);
      expect(bounds!.height).toBe(150);
    });

    it('should return correct bounds for square image', () => {
      const image = createTestImage('img1', 50, 50, 60, 60);

      const bounds = manager.getNodeBounds(image);

      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBe(20);  // 50 - 30
      expect(bounds!.y).toBe(20);  // 50 - 30
      expect(bounds!.width).toBe(60);
      expect(bounds!.height).toBe(60);
    });

    it('should return correct bounds for image with custom anchor', () => {
      const image = createTestImage('img1', 0, 0, 100, 80);
      image.transform.anchor = { x: 0, y: 0 }; // top-left anchor

      const bounds = manager.getNodeBounds(image);

      expect(bounds).not.toBeNull();
      // local bounds with anchor (0,0): x = 0, y = 0, w = 100, h = 80
      // world: x = 0+0 = 0, y = 0+0 = 0
      expect(bounds!.x).toBe(0);
      expect(bounds!.y).toBe(0);
      expect(bounds!.width).toBe(100);
      expect(bounds!.height).toBe(80);
    });

    it('should return correct bounds for image with anchor (1, 1)', () => {
      const image = createTestImage('img1', 200, 200, 100, 100);
      image.transform.anchor = { x: 1, y: 1 };

      const bounds = manager.getNodeBounds(image);

      expect(bounds).not.toBeNull();
      // local bounds with anchor (1,1): x = -100, y = -100, w = 100, h = 100
      // world: x = 200 + (-100) = 100, y = 200 + (-100) = 100
      expect(bounds!.x).toBe(100);
      expect(bounds!.y).toBe(100);
      expect(bounds!.width).toBe(100);
      expect(bounds!.height).toBe(100);
    });

    it('should handle small image dimensions', () => {
      const image = createTestImage('img1', 10, 10, 1, 1);

      const bounds = manager.getNodeBounds(image);

      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeCloseTo(9.5);  // 10 - 0.5
      expect(bounds!.y).toBeCloseTo(9.5);  // 10 - 0.5
      expect(bounds!.width).toBe(1);
      expect(bounds!.height).toBe(1);
    });
  });

  // ==========================================================================
  // getSelectionBounds with image
  // ==========================================================================

  describe('getSelectionBounds', () => {
    it('should return bounds for single selected image', () => {
      const image = createTestImage('img1', 100, 100, 50, 30);
      sceneGraph.addNode(image);

      const bounds = manager.getSelectionBounds(new Set(['img1']), sceneGraph);

      expect(bounds).not.toBeNull();
      // x = 100 - 25 = 75, y = 100 - 15 = 85
      expect(bounds!.rect.x).toBe(75);
      expect(bounds!.rect.y).toBe(85);
      expect(bounds!.rect.width).toBe(50);
      expect(bounds!.rect.height).toBe(30);
      expect(bounds!.center.x).toBe(100);
      expect(bounds!.center.y).toBe(100);
    });

    it('should return combined bounds for image + rectangle', () => {
      const image = createTestImage('img1', 50, 50, 40, 40);
      const rect = createTestRectangle('rect1', 150, 150, 40, 40);
      sceneGraph.addNode(image);
      sceneGraph.addNode(rect);

      const bounds = manager.getSelectionBounds(new Set(['img1', 'rect1']), sceneGraph);

      expect(bounds).not.toBeNull();
      // image: 30-70 x 30-70
      // rect:  130-170 x 130-170
      // union: 30-170 x 30-170
      expect(bounds!.rect.x).toBe(30);
      expect(bounds!.rect.y).toBe(30);
      expect(bounds!.rect.width).toBe(140);
      expect(bounds!.rect.height).toBe(140);
      expect(bounds!.center.x).toBe(100);
      expect(bounds!.center.y).toBe(100);
    });

    it('should return combined bounds for multiple images', () => {
      const image1 = createTestImage('img1', 50, 50, 60, 40);
      const image2 = createTestImage('img2', 200, 100, 80, 60);
      sceneGraph.addNode(image1);
      sceneGraph.addNode(image2);

      const bounds = manager.getSelectionBounds(new Set(['img1', 'img2']), sceneGraph);

      expect(bounds).not.toBeNull();
      // image1: x = 50-30 = 20, y = 50-20 = 30, right = 50+30 = 80, top = 50+20 = 70
      // image2: x = 200-40 = 160, y = 100-30 = 70, right = 200+40 = 240, top = 100+30 = 130
      // union: x=20, y=30, right=240, top=130
      expect(bounds!.rect.x).toBe(20);
      expect(bounds!.rect.y).toBe(30);
      expect(bounds!.rect.width).toBe(220); // 240 - 20
      expect(bounds!.rect.height).toBe(100); // 130 - 30
    });

    it('should ignore invisible image in selection bounds', () => {
      const image1 = createTestImage('img1', 50, 50, 40, 40);
      const image2 = createTestImage('img2', 150, 150, 40, 40);
      image2.visible = false;
      sceneGraph.addNode(image1);
      sceneGraph.addNode(image2);

      const bounds = manager.getSelectionBounds(new Set(['img1', 'img2']), sceneGraph);

      expect(bounds).not.toBeNull();
      // Should only include image1 bounds
      expect(bounds!.rect.x).toBe(30);
      expect(bounds!.rect.y).toBe(30);
      expect(bounds!.rect.width).toBe(40);
      expect(bounds!.rect.height).toBe(40);
    });

    it('should return null when all selected images are invisible', () => {
      const image = createTestImage('img1', 50, 50, 40, 40);
      image.visible = false;
      sceneGraph.addNode(image);

      const bounds = manager.getSelectionBounds(new Set(['img1']), sceneGraph);
      expect(bounds).toBeNull();
    });
  });

  // ==========================================================================
  // Bounds match rectangle pattern
  // ==========================================================================

  describe('image bounds match rectangle pattern', () => {
    it('should produce identical bounds to rectangle of same dimensions', () => {
      const image = createTestImage('img1', 100, 100, 80, 60);
      const rect = createTestRectangle('rect1', 100, 100, 80, 60);

      const imageBounds = manager.getNodeBounds(image);
      const rectBounds = manager.getNodeBounds(rect);

      expect(imageBounds).not.toBeNull();
      expect(rectBounds).not.toBeNull();

      // Image bounds should be identical to rectangle bounds
      expect(imageBounds!.x).toBe(rectBounds!.x);
      expect(imageBounds!.y).toBe(rectBounds!.y);
      expect(imageBounds!.width).toBe(rectBounds!.width);
      expect(imageBounds!.height).toBe(rectBounds!.height);
    });

    it('should produce same selection bounds as rectangle of same dimensions', () => {
      const image = createTestImage('img1', 75, 75, 50, 50);
      const rect = createTestRectangle('rect1', 75, 75, 50, 50);

      sceneGraph.addNode(image);
      const imageBounds = manager.getSelectionBounds(new Set(['img1']), sceneGraph);

      // Reset scene graph for rectangle
      const sceneGraph2 = new SceneGraph();
      sceneGraph2.addNode(rect);
      const rectBounds = manager.getSelectionBounds(new Set(['rect1']), sceneGraph2);

      expect(imageBounds).not.toBeNull();
      expect(rectBounds).not.toBeNull();

      expect(imageBounds!.rect.x).toBe(rectBounds!.rect.x);
      expect(imageBounds!.rect.y).toBe(rectBounds!.rect.y);
      expect(imageBounds!.rect.width).toBe(rectBounds!.rect.width);
      expect(imageBounds!.rect.height).toBe(rectBounds!.rect.height);
      expect(imageBounds!.center.x).toBe(rectBounds!.center.x);
      expect(imageBounds!.center.y).toBe(rectBounds!.center.y);
    });
  });
});
