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
      // 2 shaders per program (vertex + fragment) x 10 programs (flat + gradient + texture + blur + blend + shadow + composite + weight + skinned + skinned-gradient)
      expect(gl.shaderSource).toHaveBeenCalledTimes(20);
      expect(gl.compileShader).toHaveBeenCalledTimes(20);
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

      // Fill uses drawElements, stroke uses drawArrays (triangle strip)
      expect(gl.drawElements).toHaveBeenCalledTimes(1); // fill only
      expect(gl.drawArrays).toHaveBeenCalled(); // stroke
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

      // Fill uses drawElements, stroke uses drawArrays (triangle strip)
      expect(gl.drawElements).toHaveBeenCalledTimes(1); // fill only
      expect(gl.drawArrays).toHaveBeenCalled(); // stroke
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
        gl.UNSIGNED_INT,
        expect.any(Number)
      );
    });

    it('should use triangle strip for stroke', () => {
      const ellipse = createEllipseNode('ellipse1', 50, 30);
      ellipse.fills = [{ type: 'none', opacity: 0, visible: true }];
      sceneGraph.addNode(ellipse);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as triangle strip via drawArrays
      expect(gl.drawArrays).toHaveBeenCalledWith(
        gl.TRIANGLE_STRIP,
        expect.any(Number),
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

      // Fill uses drawElements, stroke uses drawArrays (triangle strip)
      expect(gl.drawElements).toHaveBeenCalledTimes(1); // fill only
      expect(gl.drawArrays).toHaveBeenCalled(); // stroke
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
        gl.UNSIGNED_INT,
        expect.any(Number)
      );
    });

    it('should use triangle strip for polygon stroke', () => {
      const polygon = createPolygonNode('poly1', 6, 50);
      polygon.fills = [{ type: 'none', opacity: 0, visible: true }];
      sceneGraph.addNode(polygon);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as triangle strip via drawArrays
      expect(gl.drawArrays).toHaveBeenCalledWith(
        gl.TRIANGLE_STRIP,
        expect.any(Number),
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

      // Only stroke (as triangle strip), no fill
      expect(gl.drawElements).not.toHaveBeenCalled();
      expect(gl.drawArrays).toHaveBeenCalled(); // stroke via triangle strip
    });

    it('should render path stroke', () => {
      const path = createPathNode('path1');
      path.fills = [];
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as triangle strip via drawArrays
      expect(gl.drawArrays).toHaveBeenCalled();
    });

    it('should use triangle strip for open path stroke', () => {
      const path = createPathNode('path1');
      path.closed = false;
      path.fills = [];
      sceneGraph.addNode(path);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Stroke rendered as triangle strip via drawArrays
      expect(gl.drawArrays).toHaveBeenCalledWith(
        gl.TRIANGLE_STRIP,
        expect.any(Number),
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

      // Stroke rendered as triangle strip via drawArrays
      expect(gl.drawArrays).toHaveBeenCalled();
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

      // Fills use drawElements, strokes use drawArrays
      expect(gl.drawElements).toHaveBeenCalledTimes(2); // 2 fills
      expect(gl.drawArrays).toHaveBeenCalledTimes(2); // 2 strokes
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

      // Stroke gradient should use gradient program (uniform1i) with triangle strip
      expect(gl.uniform1i).toHaveBeenCalled();
      expect(gl.drawArrays).toHaveBeenCalled();
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
  // GPU Skinning
  // ==========================================================================

  describe('GPU skinning', () => {
    describe('skinned buffer initialization', () => {
      it('should create skinned VAO during initialization', () => {
        // ShapeRenderer constructor calls initializeSkinnedBuffers which creates a VAO
        // We check that createVertexArray was called (at least for the skinned VAO)
        expect(gl.createVertexArray).toHaveBeenCalled();
      });

      it('should set up skinned vertex attributes with correct stride (40 bytes)', () => {
        // initializeSkinnedBuffers sets up interleaved attributes:
        // a_position(2f) + a_boneIndices(4f) + a_boneWeights(4f) = 10 floats = 40 bytes stride
        const calls = (gl.vertexAttribPointer as any).mock.calls;
        // Find calls with stride=40
        const skinnedCalls = calls.filter(
          (c: any[]) => c[4] === 40 // stride parameter is at index 4
        );
        // Should have 3 attributes: a_position(offset 0), a_boneIndices(offset 8), a_boneWeights(offset 24)
        expect(skinnedCalls.length).toBe(3);
        // Check offsets
        const offsets = skinnedCalls.map((c: any[]) => c[5]).sort((a: number, b: number) => a - b);
        expect(offsets).toEqual([0, 8, 24]);
      });
    });

    describe('render path selection', () => {
      it('should render skinned node with GPU path when skin data is present', () => {
        // Create a node without skinData first to populate geometry cache
        const rect = createRectangleNode('skinned1', 100, 50);
        sceneGraph.addNode(rect);
        const vpMatrix = mat3.identity();
        shapeRenderer.render(sceneGraph, vpMatrix);

        // Now add bone and skinData
        sceneGraph.addNode({
          id: 'bone1',
          name: 'Bone 1',
          type: 'bone' as any,
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          length: 100,
          boneColor: '#ff0000',
        } as any);

        (rect as any).skinData = {
          vertices: [{ influences: [{ boneId: 'bone1', weight: 1.0 }] }],
          inverseBindMatrices: {
            bone1: [1, 0, 0, 1, 0, 0],
          },
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 1,
        };

        vi.clearAllMocks();
        // Render again with skinData — GPU skinning path should be used
        shapeRenderer.render(sceneGraph, vpMatrix);
        expect(gl.drawElements).toHaveBeenCalled();
      });

      it('should fall back to CPU path when bone count exceeds MAX_BONES_GPU', () => {
        const rect = createRectangleNode('skinned_many', 100, 50);
        sceneGraph.addNode(rect);
        const vpMatrix = mat3.identity();
        // First render to populate geometry cache
        shapeRenderer.render(sceneGraph, vpMatrix);

        // Create skinData with 33 bones (exceeds MAX_BONES_GPU = 32)
        const ibm: Record<string, number[]> = {};
        for (let i = 0; i < 33; i++) {
          ibm[`bone_${i}`] = [1, 0, 0, 1, 0, 0];
          sceneGraph.addNode({
            id: `bone_${i}`,
            name: `Bone ${i}`,
            type: 'bone' as any,
            parent: null,
            children: [],
            transform: createDefaultTransform(),
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal',
            length: 100,
            boneColor: '#ff0000',
          } as any);
        }
        (rect as any).skinData = {
          vertices: [{ influences: [{ boneId: 'bone_0', weight: 1.0 }] }],
          inverseBindMatrices: ibm,
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 1,
        };

        vi.clearAllMocks();
        // This should not crash — falls back to CPU path
        shapeRenderer.render(sceneGraph, vpMatrix);
        expect(gl.drawElements).toHaveBeenCalled();
      });

      it('should handle skinned node without cached geometry gracefully', () => {
        const rect = createRectangleNode('skinned_nocache', 100, 50);
        (rect as any).skinData = {
          vertices: [],
          inverseBindMatrices: { bone1: [1, 0, 0, 1, 0, 0] },
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 0,
        };
        sceneGraph.addNode(rect);

        // Don't render first (no geometry cache) — just add and render with skinData
        // The node should be skipped gracefully
        const vpMatrix = mat3.identity();
        expect(() => shapeRenderer.render(sceneGraph, vpMatrix)).not.toThrow();
      });

      it('renders a skinned node whose geometry was never seeded non-skinned (F040)', () => {
        const rect = createRectangleNode('skinned_fresh', 100, 50);
        (rect as any).skinData = {
          vertices: [{ influences: [{ boneId: 'bone1', weight: 1.0 }] }],
          inverseBindMatrices: { bone1: [1, 0, 0, 1, 0, 0] },
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 1,
        };
        sceneGraph.addNode(rect);
        sceneGraph.addNode({
          id: 'bone1',
          name: 'Bone 1',
          type: 'bone' as any,
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          length: 100,
          boneColor: '#ff0000',
        } as any);

        vi.clearAllMocks();
        // No prior non-skinned render seeded the cache; on-demand bind-pose
        // tessellation must still let the node draw.
        shapeRenderer.render(sceneGraph, mat3.identity());
        expect(gl.drawElements).toHaveBeenCalled();
      });

      it('restores the flat program after a skinned fill with empty strokes (F039)', () => {
        const rect = createRectangleNode('skinned_nostroke', 100, 50);
        rect.strokes = [];
        (rect as any).skinData = {
          vertices: [{ influences: [{ boneId: 'bone1', weight: 1.0 }] }],
          inverseBindMatrices: { bone1: [1, 0, 0, 1, 0, 0] },
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 1,
        };
        sceneGraph.addNode(rect);
        sceneGraph.addNode({
          id: 'bone1',
          name: 'Bone 1',
          type: 'bone' as any,
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          length: 100,
          boneColor: '#ff0000',
        } as any);

        // The mock returns one shared WebGLProgram for every program, so compare
        // the distinct ShaderProgram wrappers via a spy on renderer.useProgram.
        const flatProgram = (shapeRenderer as any).program;
        const skinnedProgram = (shapeRenderer as any).skinnedProgram;
        const useProgramSpy = vi.spyOn(renderer, 'useProgram');

        shapeRenderer.render(sceneGraph, mat3.identity());

        const bound = useProgramSpy.mock.calls.map((c) => c[0]);
        const lastSkinned = bound.lastIndexOf(skinnedProgram);
        const lastFlat = bound.lastIndexOf(flatProgram);
        // The GPU skinned-fill path ran, and the flat program was rebound after
        // it so the next flat node's model-matrix upload targets the right program.
        expect(lastSkinned).toBeGreaterThanOrEqual(0);
        expect(lastFlat).toBeGreaterThan(lastSkinned);
      });
    });

    describe('cache integration', () => {
      it('should populate skinned cache data lazily on first GPU render', () => {
        const rect = createRectangleNode('cache_test', 100, 50);
        sceneGraph.addNode(rect);

        // First render — populates geometry cache for the rectangle
        const vpMatrix = mat3.identity();
        shapeRenderer.render(sceneGraph, vpMatrix);

        // Now add skinData — next render should populate skinnedVertexData
        (rect as any).skinData = {
          vertices: [{ influences: [{ boneId: 'bone1', weight: 1.0 }] }],
          inverseBindMatrices: { bone1: [1, 0, 0, 1, 0, 0] },
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 1,
        };
        sceneGraph.addNode({
          id: 'bone1',
          name: 'Bone 1',
          type: 'bone' as any,
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          length: 100,
          boneColor: '#ff0000',
        } as any);

        // Re-render — the skinned node should populate GPU cache data
        shapeRenderer.render(sceneGraph, vpMatrix);
        // Should not throw and should draw
        expect(gl.drawElements).toHaveBeenCalled();
      });

      it('should upload bone matrices via uniformMatrix3fv during GPU skinned render', () => {
        const rect = createRectangleNode('bone_uniform_test', 100, 50);
        sceneGraph.addNode(rect);
        const vpMatrix = mat3.identity();
        shapeRenderer.render(sceneGraph, vpMatrix);

        sceneGraph.addNode({
          id: 'boneU',
          name: 'Bone U',
          type: 'bone' as any,
          parent: null,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          length: 100,
          boneColor: '#ff0000',
        } as any);

        (rect as any).skinData = {
          vertices: [{ influences: [{ boneId: 'boneU', weight: 1.0 }] }],
          inverseBindMatrices: { boneU: [1, 0, 0, 1, 0, 0] },
          meshBindMatrix: [1, 0, 0, 1, 0, 0],
          vertexCount: 1,
        };

        vi.clearAllMocks();
        shapeRenderer.render(sceneGraph, vpMatrix);
        // uniformMatrix3fv should be called many times for bone matrices + VP
        expect(gl.uniformMatrix3fv).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Cache eviction (F037)
  // ==========================================================================

  describe('cache eviction (F037)', () => {
    it('invalidateCache drops a node’s cached geometry', () => {
      const rect = createRectangleNode('evict_me', 100, 50);
      sceneGraph.addNode(rect);
      shapeRenderer.render(sceneGraph, mat3.identity());
      expect(shapeRenderer.getTessellatedVertices('evict_me')).not.toBeNull();

      shapeRenderer.invalidateCache('evict_me');
      expect(shapeRenderer.getTessellatedVertices('evict_me')).toBeNull();
    });

    it('clearTextures runs without error when no textures are cached', () => {
      expect(() => shapeRenderer.clearTextures()).not.toThrow();
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

    it('should delete skinned GPU resources on dispose', () => {
      vi.clearAllMocks();
      shapeRenderer.dispose();
      // Should delete skinned vertex buffer + skinned VAO
      expect(gl.deleteBuffer).toHaveBeenCalled();
      expect(gl.deleteVertexArray).toHaveBeenCalled();
      // Should delete skinned program names
      expect(gl.deleteProgram).toHaveBeenCalled();
    });
  });
});
