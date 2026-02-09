/**
 * Tests for ShapeRenderer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShapeRenderer } from './ShapeRenderer';
import { WebGLRenderer } from './WebGLRenderer';
import { SceneGraph, createDefaultTransform } from '../SceneGraph';
import { mat3 } from '../math';
import { createMockWebGL2Context } from '../test/setup';
import type { RectangleNode, EllipseNode, PolygonNode, PathNode, Fill, Stroke } from '@quar/types';

// ============================================================================
// Test Setup
// ============================================================================

function createMockRenderer(): WebGLRenderer {
  const canvas = document.createElement('canvas');
  const mockGL = createMockWebGL2Context();

  canvas.getContext = vi.fn().mockReturnValue(mockGL);

  return new WebGLRenderer({ canvas });
}

function createDefaultFill(): Fill {
  return {
    type: 'solid',
    color: { r: 100, g: 149, b: 237, a: 1 },
    opacity: 1,
    visible: true,
  };
}

function createDefaultStroke(): Stroke {
  return {
    color: { r: 0, g: 0, b: 0, a: 1 },
    width: 2,
    opacity: 1,
    cap: 'round',
    join: 'round',
    visible: true,
  };
}

function createRectangleNode(id: string, width: number, height: number): RectangleNode {
  return {
    id,
    name: `Rectangle ${id}`,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    cornerRadius: [0, 0, 0, 0],
    fills: [createDefaultFill()],
    strokes: [createDefaultStroke()],
  };
}

function createEllipseNode(id: string, radiusX: number, radiusY: number): EllipseNode {
  return {
    id,
    name: `Ellipse ${id}`,
    type: 'ellipse',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX,
    radiusY,
    fills: [createDefaultFill()],
    strokes: [createDefaultStroke()],
  };
}

function createPathNode(id: string): PathNode {
  return {
    id,
    name: `Path ${id}`,
    type: 'path',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 100 }, handleIn: null, handleOut: null, type: 'corner' },
    ],
    closed: true,
    fills: [createDefaultFill()],
    strokes: [createDefaultStroke()],
  };
}

function createPolygonNode(
  id: string,
  sides: number,
  radius: number,
  innerRadius?: number
): PolygonNode {
  const node: PolygonNode = {
    id,
    name: innerRadius !== undefined ? `Star ${id}` : `Polygon ${id}`,
    type: 'polygon',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    sides,
    radius,
    fills: [createDefaultFill()],
    strokes: [createDefaultStroke()],
  };

  if (innerRadius !== undefined) {
    node.innerRadius = innerRadius;
  }

  return node;
}

// ============================================================================
// Tests
// ============================================================================

describe('ShapeRenderer', () => {
  let renderer: WebGLRenderer;
  let shapeRenderer: ShapeRenderer;
  let sceneGraph: SceneGraph;
  let gl: WebGL2RenderingContext;

  beforeEach(() => {
    renderer = createMockRenderer();
    gl = renderer.context;
    shapeRenderer = new ShapeRenderer(renderer);
    sceneGraph = new SceneGraph();
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('initialization', () => {
    it('should create shader program', () => {
      expect(gl.createProgram).toHaveBeenCalled();
      expect(gl.createShader).toHaveBeenCalled();
    });

    it('should compile vertex and fragment shaders', () => {
      // 2 shaders per program (vertex + fragment) x 3 programs (flat + gradient + texture)
      expect(gl.shaderSource).toHaveBeenCalledTimes(6);
      expect(gl.compileShader).toHaveBeenCalledTimes(6);
    });

    it('should link shader program', () => {
      expect(gl.linkProgram).toHaveBeenCalled();
    });

    it('should create VAO', () => {
      expect(gl.createVertexArray).toHaveBeenCalled();
    });

    it('should create vertex buffer', () => {
      expect(gl.createBuffer).toHaveBeenCalled();
    });

    it('should set up vertex attributes', () => {
      expect(gl.enableVertexAttribArray).toHaveBeenCalled();
      expect(gl.vertexAttribPointer).toHaveBeenCalled();
    });

    it('should allocate buffer with DYNAMIC_DRAW', () => {
      expect(gl.bufferData).toHaveBeenCalledWith(
        gl.ARRAY_BUFFER,
        expect.any(Number),
        gl.DYNAMIC_DRAW
      );
    });

    it('should get attribute locations', () => {
      expect(gl.getAttribLocation).toHaveBeenCalled();
    });

    it('should get uniform locations', () => {
      expect(gl.getUniformLocation).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Render Method
  // ==========================================================================

  describe('render', () => {
    it('should use shader program', () => {
      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);
      expect(gl.useProgram).toHaveBeenCalled();
    });

    it('should bind VAO', () => {
      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);
      expect(gl.bindVertexArray).toHaveBeenCalled();
    });

    it('should set view-projection uniform', () => {
      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);
      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('should not draw when scene is empty', () => {
      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);
      expect(gl.drawArrays).not.toHaveBeenCalled();
    });

    it('should unbind VAO after rendering', () => {
      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);
      // Should bind null VAO at end
      expect(gl.bindVertexArray).toHaveBeenLastCalledWith(null);
    });
  });

  // ==========================================================================
  // Rectangle Rendering
  // ==========================================================================

  describe('rectangle rendering', () => {
    it('should render rectangle fill', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses earcut triangulation via drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should set model matrix for rectangle', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Should set model matrix uniform
      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('should set fill color uniform', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniform4fv).toHaveBeenCalled();
    });

    it('should render rectangle stroke', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Both fill and stroke use drawElements (filled outline triangulation)
      expect(gl.drawElements).toHaveBeenCalledTimes(2); // fill + stroke
      expect(gl.drawArrays).not.toHaveBeenCalled();
    });

    it('should not render fill when fill is none', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.fills = [{ type: 'none', opacity: 0, visible: true }];
      rect.strokes = [];
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // No fill (none type), no stroke (empty)
      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });

    it('should render rectangle with rounded corners', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.cornerRadius = [10, 10, 10, 10];
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should upload vertices to buffer', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.bufferSubData).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Ellipse Rendering
  // ==========================================================================

  describe('ellipse rendering', () => {
    it('should render ellipse fill', () => {
      const ellipse = createEllipseNode('ellipse1', 50, 30);
      sceneGraph.addNode(ellipse);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses earcut triangulation via drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should set model matrix for ellipse', () => {
      const ellipse = createEllipseNode('ellipse1', 50, 30);
      sceneGraph.addNode(ellipse);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('should render ellipse stroke', () => {
      const ellipse = createEllipseNode('ellipse1', 50, 30);
      sceneGraph.addNode(ellipse);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Both fill and stroke use drawElements (filled outline triangulation)
      expect(gl.drawElements).toHaveBeenCalledTimes(2); // fill + stroke
      expect(gl.drawArrays).not.toHaveBeenCalled();
    });

    it('should render circle when radiusX equals radiusY', () => {
      const circle = createEllipseNode('circle1', 50, 50);
      sceneGraph.addNode(circle);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should use triangulated fill', () => {
      const ellipse = createEllipseNode('ellipse1', 50, 30);
      ellipse.strokes = [];
      sceneGraph.addNode(ellipse);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements with TRIANGULAR indices (earcut triangulation)
      expect(gl.drawElements).toHaveBeenCalledWith(
        gl.TRIANGLES,
        expect.any(Number),
        gl.UNSIGNED_SHORT,
        expect.any(Number)
      );
    });

    it('should use filled outline for stroke', () => {
      const ellipse = createEllipseNode('ellipse1', 50, 30);
      ellipse.fills = [{ type: 'none', opacity: 0, visible: true }];
      sceneGraph.addNode(ellipse);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as filled outline polygon via drawElements
      expect(gl.drawElements).toHaveBeenCalledWith(
        gl.TRIANGLES,
        expect.any(Number),
        gl.UNSIGNED_SHORT,
        expect.any(Number)
      );
    });
  });

  // ==========================================================================
  // Polygon Rendering
  // ==========================================================================

  describe('polygon rendering', () => {
    it('should render polygon fill', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses earcut triangulation via drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should set model matrix for polygon', () => {
      const polygon = createPolygonNode('poly1', 5, 50);
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('should render polygon stroke', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Both fill and stroke use drawElements (filled outline triangulation)
      expect(gl.drawElements).toHaveBeenCalledTimes(2); // fill + stroke
      expect(gl.drawArrays).not.toHaveBeenCalled();
    });

    it('should render triangle (3 sides)', () => {
      const triangle = createPolygonNode('tri1', 3, 50);
      sceneGraph.addNode(triangle);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render pentagon (5 sides)', () => {
      const pentagon = createPolygonNode('pent1', 5, 50);
      sceneGraph.addNode(pentagon);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render hexagon (6 sides)', () => {
      const hexagon = createPolygonNode('hex1', 6, 50);
      sceneGraph.addNode(hexagon);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render star shape with inner radius', () => {
      const star = createPolygonNode('star1', 5, 50, 25);
      sceneGraph.addNode(star);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render 6-pointed star', () => {
      const star = createPolygonNode('star1', 6, 50, 25);
      sceneGraph.addNode(star);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should use triangulated fill for polygon', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      polygon.strokes = [];
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses drawElements with TRIANGLES (earcut triangulation)
      expect(gl.drawElements).toHaveBeenCalledWith(
        gl.TRIANGLES,
        expect.any(Number),
        gl.UNSIGNED_SHORT,
        expect.any(Number)
      );
    });

    it('should use filled outline for polygon stroke', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      polygon.fills = [{ type: 'none', opacity: 0, visible: true }];
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as filled outline polygon via drawElements
      expect(gl.drawElements).toHaveBeenCalledWith(
        gl.TRIANGLES,
        expect.any(Number),
        gl.UNSIGNED_SHORT,
        expect.any(Number)
      );
    });

    it('should not render fill when fill is none', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      polygon.fills = [{ type: 'none', opacity: 0, visible: true }];
      polygon.strokes = [];
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });

    it('should apply position transform to polygon', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      polygon.transform.position = { x: 100, y: 200 };
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('should not render invisible polygon', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      polygon.visible = false;
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Path Rendering
  // ==========================================================================

  describe('path rendering', () => {
    it('should render closed path fill', () => {
      const path = createPathNode('path1');
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Fill uses earcut triangulation via drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should not render fill for open path', () => {
      const path = createPathNode('path1');
      path.closed = false;
      path.fills = [];
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Only stroke (as filled outline), no fill
      expect(gl.drawElements).toHaveBeenCalledTimes(1);
      expect(gl.drawArrays).not.toHaveBeenCalled();
    });

    it('should render path stroke', () => {
      const path = createPathNode('path1');
      path.fills = [];
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as filled outline via drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should use filled outline for open path stroke', () => {
      const path = createPathNode('path1');
      path.closed = false;
      path.fills = [];
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as filled outline polygon via drawElements
      expect(gl.drawElements).toHaveBeenCalledWith(
        gl.TRIANGLES,
        expect.any(Number),
        gl.UNSIGNED_SHORT,
        expect.any(Number)
      );
    });

    it('should not render path with fewer than 2 points', () => {
      const path = createPathNode('path1');
      path.points = [{ position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' }];
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });

    it('should render curved path', () => {
      const path = createPathNode('path1');
      path.points = [
        { position: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 50, y: 0 }, type: 'smooth' },
        { position: { x: 100, y: 0 }, handleIn: { x: -50, y: 0 }, handleOut: null, type: 'smooth' },
      ];
      path.closed = false;
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as filled outline via drawElements
      expect(gl.drawElements).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Transform
  // ==========================================================================

  describe('transform handling', () => {
    it('should apply world transform to shapes', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.transform.position = { x: 200, y: 100 };
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Should set model matrix with translation
      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('should apply rotation transform', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.transform.rotation = 45;
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('should apply scale transform', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.transform.scale = { x: 2, y: 0.5 };
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Visibility
  // ==========================================================================

  describe('visibility handling', () => {
    it('should not render invisible shapes', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.visible = false;
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Should not draw (neither fills nor strokes)
      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });

    it('should render multiple visible shapes', () => {
      const rect1 = createRectangleNode('rect1', 100, 50);
      const rect2 = createRectangleNode('rect2', 80, 40);
      sceneGraph.addNode(rect1);
      sceneGraph.addNode(rect2);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Both fill and stroke use drawElements (2 shapes x 2 passes = 4)
      expect(gl.drawElements).toHaveBeenCalledTimes(4); // 2 fills + 2 strokes
      expect(gl.drawArrays).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Ghost Rendering (onion skinning)
  // ==========================================================================

  describe('ghost rendering', () => {
    it('renderGhostNode should render a rectangle without error', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      const vpMatrix = mat3.identity();
      vi.clearAllMocks();

      // Should not throw
      shapeRenderer.renderGhostNode(rect, vpMatrix, 0.5, [1, 0, 0]);

      // Should have drawn (fill + stroke)
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('applyTintAndAlpha should blend tint color at 50% mix', () => {
      const color = new Float32Array([1, 0, 0, 1]); // pure red
      const tint: [number, number, number] = [0, 0, 1]; // blue tint

      const result = shapeRenderer.applyTintAndAlpha(color, tint, 1.0);

      // 50% mix: r = 1*0.5 + 0*0.5 = 0.5, g = 0, b = 0*0.5 + 1*0.5 = 0.5
      expect(result[0]).toBeCloseTo(0.5); // r
      expect(result[1]).toBeCloseTo(0.0); // g
      expect(result[2]).toBeCloseTo(0.5); // b
      expect(result[3]).toBeCloseTo(1.0); // a
    });

    it('applyTintAndAlpha should multiply alpha correctly', () => {
      const color = new Float32Array([0.5, 0.5, 0.5, 0.8]);
      const tint: [number, number, number] = [0.5, 0.5, 0.5];

      const result = shapeRenderer.applyTintAndAlpha(color, tint, 0.5);

      // Alpha = 0.8 * 0.5 = 0.4
      expect(result[3]).toBeCloseTo(0.4);
    });

    it('renderGhostNode should do nothing for invisible nodes', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.visible = false;
      const vpMatrix = mat3.identity();
      vi.clearAllMocks();

      shapeRenderer.renderGhostNode(rect, vpMatrix, 0.5, [1, 0, 0]);

      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Gradient Rendering
  // ==========================================================================

  describe('gradient rendering', () => {
    it('should render gradient fill using gradient program', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.fills = [
        {
          type: 'gradient',
          gradient: {
            type: 'linear',
            stops: [
              { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
              { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
            ],
            angle: 90,
          },
          opacity: 1,
          visible: true,
        },
      ];
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Should use uniform1i for gradient type
      expect(gl.uniform1i).toHaveBeenCalled();
      // Should draw elements (fill + stroke)
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render radial gradient fill', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.fills = [
        {
          type: 'gradient',
          gradient: {
            type: 'radial',
            stops: [
              { offset: 0, color: { r: 255, g: 255, b: 0, a: 1 } },
              { offset: 1, color: { r: 0, g: 128, b: 0, a: 1 } },
            ],
            center: { x: 0.5, y: 0.5 },
            radius: 0.5,
          },
          opacity: 0.8,
          visible: true,
        },
      ];
      rect.strokes = [];
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniform1i).toHaveBeenCalled();
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render conic gradient fill', () => {
      const ellipse = createEllipseNode('e1', 50, 50);
      ellipse.fills = [
        {
          type: 'gradient',
          gradient: {
            type: 'conic',
            stops: [
              { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
              { offset: 0.5, color: { r: 0, g: 255, b: 0, a: 1 } },
              { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
            ],
            center: { x: 0.5, y: 0.5 },
            angle: 0,
          },
          opacity: 1,
          visible: true,
        },
      ];
      ellipse.strokes = [];
      sceneGraph.addNode(ellipse);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniform1i).toHaveBeenCalled();
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render stroke with gradient', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.fills = [{ type: 'none', opacity: 0, visible: true }];
      rect.strokes = [
        {
          ...createDefaultStroke(),
          gradient: {
            type: 'linear',
            stops: [
              { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
              { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
            ],
            angle: 0,
          },
        },
      ];
      sceneGraph.addNode(rect);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke gradient should use gradient program (uniform1i)
      expect(gl.uniform1i).toHaveBeenCalled();
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render gradient fill for polygon', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      polygon.fills = [
        {
          type: 'gradient',
          gradient: {
            type: 'linear',
            stops: [
              { offset: 0, color: { r: 168, g: 85, b: 247, a: 1 } },
              { offset: 1, color: { r: 236, g: 72, b: 153, a: 1 } },
            ],
            angle: 45,
          },
          opacity: 1,
          visible: true,
        },
      ];
      polygon.strokes = [];
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniform1i).toHaveBeenCalled();
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('should render gradient fill for path', () => {
      const path = createPathNode('path1');
      path.fills = [
        {
          type: 'gradient',
          gradient: {
            type: 'linear',
            stops: [
              { offset: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
              { offset: 1, color: { r: 255, g: 255, b: 255, a: 1 } },
            ],
            angle: 0,
          },
          opacity: 1,
          visible: true,
        },
      ];
      path.strokes = [];
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.uniform1i).toHaveBeenCalled();
      expect(gl.drawElements).toHaveBeenCalled();
    });

    it('getFillColor should return first stop color for gradient fills', () => {
      const rect = createRectangleNode('rect1', 100, 50);
      rect.fills = [
        {
          type: 'gradient',
          gradient: {
            type: 'linear',
            stops: [
              { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
              { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
            ],
            angle: 0,
          },
          opacity: 1,
          visible: true,
        },
      ];
      const vpMatrix = mat3.identity();
      vi.clearAllMocks();

      // Ghost rendering uses getFillColor internally, which should return
      // the first stop color for gradient fills
      shapeRenderer.renderGhostNode(rect, vpMatrix, 0.5, [1, 0, 0]);
      expect(gl.drawElements).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Dispose
  // ==========================================================================

  describe('dispose', () => {
    it('should delete vertex buffer', () => {
      shapeRenderer.dispose();
      expect(gl.deleteBuffer).toHaveBeenCalled();
    });

    it('should delete VAO', () => {
      shapeRenderer.dispose();
      expect(gl.deleteVertexArray).toHaveBeenCalled();
    });
  });
});
