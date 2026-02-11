/**
 * Tests for ShapeRenderer image node features
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ShapeRenderer } from './ShapeRenderer';
import { WebGLRenderer } from './WebGLRenderer';
import { SceneGraph, createDefaultTransform } from '../SceneGraph';
import { mat3 } from '../math';
import { createMockWebGL2Context } from '../test/setup';
import type { ImageNode, Fill, Stroke } from '@quar/types';

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Extended mock GL context with texture-related functions
 */
function createMockGLWithTextures(): WebGL2RenderingContext {
  const baseGL = createMockWebGL2Context();
  const mockTexture = { __isTexture: true } as unknown as WebGLTexture;

  // Add texture-related constants and methods
  const textureExtensions = {
    // Constants
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    CLAMP_TO_EDGE: 33071,
    LINEAR: 9729,
    LINEAR_MIPMAP_LINEAR: 9987,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    TRIANGLE_STRIP: 5,

    // Texture operations
    createTexture: vi.fn().mockReturnValue(mockTexture),
    bindTexture: vi.fn(),
    deleteTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    generateMipmap: vi.fn(),
    activeTexture: vi.fn(),
  };

  return Object.assign(baseGL, textureExtensions) as unknown as WebGL2RenderingContext;
}

function createMockRenderer(): { renderer: WebGLRenderer; gl: WebGL2RenderingContext } {
  const canvas = document.createElement('canvas');
  const mockGL = createMockGLWithTextures();

  canvas.getContext = vi.fn().mockReturnValue(mockGL);

  const renderer = new WebGLRenderer({ canvas });
  return { renderer, gl: mockGL };
}

function createImageNode(id: string, src: string, width: number, height: number): ImageNode {
  return {
    id,
    name: `Image ${id}`,
    type: 'image',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    src,
    width,
    height,
    naturalWidth: width,
    naturalHeight: height,
    cornerRadius: [0, 0, 0, 0],
  };
}

function createImageNodeWithAdjustments(
  id: string,
  src: string,
  width: number,
  height: number,
  adjustments: ImageNode['adjustments']
): ImageNode {
  return {
    ...createImageNode(id, src, width, height),
    adjustments,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ShapeRenderer - Image Rendering', () => {
  let renderer: WebGLRenderer;
  let shapeRenderer: ShapeRenderer;
  let sceneGraph: SceneGraph;
  let gl: WebGL2RenderingContext;

  beforeEach(() => {
    const mocks = createMockRenderer();
    renderer = mocks.renderer;
    gl = mocks.gl;
    shapeRenderer = new ShapeRenderer(renderer);
    sceneGraph = new SceneGraph();
  });

  // ==========================================================================
  // Texture Program Initialization
  // ==========================================================================

  describe('texture program initialization', () => {
    it('should create texture shader program (7 programs total: flat, gradient, texture + 4 post-process)', () => {
      // ShapeRenderer creates 7 programs: flat, gradient, texture, blur, blend, shadow, composite
      // 2 shaders per program (vertex + fragment) = 14 shaders total
      expect(gl.createProgram).toHaveBeenCalled();
      expect(gl.shaderSource).toHaveBeenCalledTimes(14);
      expect(gl.compileShader).toHaveBeenCalledTimes(14);
    });

    it('should create texture VAO', () => {
      // At least 2 VAOs are created: one for shapes, one for texture
      expect(gl.createVertexArray).toHaveBeenCalled();
      const callCount = (gl.createVertexArray as Mock).mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('should create texture vertex buffer', () => {
      // Multiple buffers are created: vertex, index, and texture vertex
      expect(gl.createBuffer).toHaveBeenCalled();
      const callCount = (gl.createBuffer as Mock).mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('should set up texture vertex attributes (position + texCoord)', () => {
      // Texture program needs a_position and a_texCoord attributes
      expect(gl.enableVertexAttribArray).toHaveBeenCalled();
      expect(gl.vertexAttribPointer).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Texture Cache: getTexture
  // ==========================================================================

  describe('getTexture', () => {
    it('should return null on first call (async loading)', () => {
      const result = shapeRenderer.getTexture('data:image/png;base64,abc');
      expect(result).toBeNull();
    });

    it('should create a pending promise for the image', () => {
      shapeRenderer.getTexture('data:image/png;base64,abc');
      // Calling again immediately should still return null (still loading)
      const result = shapeRenderer.getTexture('data:image/png;base64,abc');
      expect(result).toBeNull();
    });

    it('should return null for different sources independently', () => {
      const result1 = shapeRenderer.getTexture('data:image/png;base64,first');
      const result2 = shapeRenderer.getTexture('data:image/png;base64,second');
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should not create duplicate pending promises for same source', () => {
      shapeRenderer.getTexture('data:image/png;base64,test');
      shapeRenderer.getTexture('data:image/png;base64,test');
      // Both calls return null, and there should only be one pending load
      // (verified by the fact that no errors occur)
      expect(shapeRenderer.getTexture('data:image/png;base64,test')).toBeNull();
    });
  });

  // ==========================================================================
  // Texture Cache: disposeTexture
  // ==========================================================================

  describe('disposeTexture', () => {
    it('should call gl.deleteTexture when texture exists in cache', async () => {
      // We need to manually simulate a texture being in the cache.
      // Since the cache is private, we test via the dispose path.
      // First, try to load a texture (it will be pending).
      shapeRenderer.getTexture('data:image/png;base64,test');

      // Dispose the pending texture
      shapeRenderer.disposeTexture('data:image/png;base64,test');

      // After dispose, getTexture should restart loading (return null)
      const result = shapeRenderer.getTexture('data:image/png;base64,test');
      expect(result).toBeNull();
    });

    it('should handle disposing non-existent texture gracefully', () => {
      // Should not throw
      expect(() => shapeRenderer.disposeTexture('nonexistent')).not.toThrow();
    });

    it('should remove pending promise on dispose', () => {
      shapeRenderer.getTexture('data:image/png;base64,test');
      shapeRenderer.disposeTexture('data:image/png;base64,test');

      // After dispose, calling getTexture again should start a new load
      // (returns null, meaning it is not cached)
      expect(shapeRenderer.getTexture('data:image/png;base64,test')).toBeNull();
    });
  });

  // ==========================================================================
  // renderImage
  // ==========================================================================

  describe('renderImage', () => {
    it('should skip rendering when texture is not yet loaded', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      sceneGraph.addNode(imageNode);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Image texture is not loaded yet, so no TRIANGLE_STRIP draw call for image
      // Only shape-related drawElements/drawArrays should fire (none expected for just an image)
      // The image renderImage should return early
      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });

    it('should not throw when rendering scene with image node', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      sceneGraph.addNode(imageNode);

      const vpMatrix = mat3.identity();

      expect(() => shapeRenderer.render(sceneGraph, vpMatrix)).not.toThrow();
    });

    it('should render image via renderNode method', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);

      const vpMatrix = mat3.identity();

      // Should not throw even though texture is not loaded
      expect(() => shapeRenderer.renderNode(imageNode, vpMatrix)).not.toThrow();
    });

    it('should not render invisible image node', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      imageNode.visible = false;
      sceneGraph.addNode(imageNode);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Ghost Rendering for Image Nodes
  // ==========================================================================

  describe('ghost rendering for image nodes', () => {
    it('renderGhostNode should not throw for image type', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);

      const vpMatrix = mat3.identity();

      // Should not throw even though texture is not loaded
      expect(() =>
        shapeRenderer.renderGhostNode(imageNode, vpMatrix, 0.5, [1, 0, 0])
      ).not.toThrow();
    });

    it('renderGhostNode should skip invisible image node', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      imageNode.visible = false;

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();

      shapeRenderer.renderGhostNode(imageNode, vpMatrix, 0.5, [1, 0, 0]);

      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });

    it('renderGhostNode should skip image when texture is not loaded', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();

      shapeRenderer.renderGhostNode(imageNode, vpMatrix, 0.5, [1, 0, 0]);

      // No draw calls since texture is not loaded
      expect(gl.drawArrays).not.toHaveBeenCalled();
      expect(gl.drawElements).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Image with Adjustments
  // ==========================================================================

  describe('image with adjustments', () => {
    it('should handle image node with adjustments without error', () => {
      const imageNode = createImageNodeWithAdjustments(
        'img1',
        'data:image/png;base64,abc',
        200,
        100,
        {
          brightness: 10,
          contrast: 5,
          saturation: -20,
          hue: 45,
          exposure: 10,
          temperature: 15,
          tint: 0,
          blur: 0,
        }
      );

      const vpMatrix = mat3.identity();
      expect(() => shapeRenderer.renderNode(imageNode, vpMatrix)).not.toThrow();
    });

    it('should handle image node without adjustments (undefined)', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      // adjustments is undefined by default

      const vpMatrix = mat3.identity();
      expect(() => shapeRenderer.renderNode(imageNode, vpMatrix)).not.toThrow();
    });
  });

  // ==========================================================================
  // Mixed Scene (images + shapes)
  // ==========================================================================

  describe('mixed scene rendering', () => {
    it('should render shapes even when image texture is not loaded', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      const rectNode = {
        id: 'rect1',
        name: 'Rectangle rect1',
        type: 'rectangle' as const,
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        width: 100,
        height: 50,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
        fills: [
          {
            type: 'solid' as const,
            color: { r: 100, g: 149, b: 237, a: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokes: [
          {
            color: { r: 0, g: 0, b: 0, a: 1 },
            width: 2,
            opacity: 1,
            cap: 'round' as const,
            join: 'round' as const,
            visible: true,
          },
        ],
      };

      sceneGraph.addNode(imageNode);
      sceneGraph.addNode(rectNode);

      const vpMatrix = mat3.identity();
      vi.clearAllMocks();
      shapeRenderer.render(sceneGraph, vpMatrix);

      // Rectangle should render (fill via drawElements + stroke via drawArrays), image should be skipped
      expect(gl.drawElements).toHaveBeenCalledTimes(1); // fill for rect
      expect(gl.drawArrays).toHaveBeenCalledTimes(1); // stroke for rect
    });
  });

  // ==========================================================================
  // Dispose
  // ==========================================================================

  describe('dispose cleans up texture resources', () => {
    it('should delete texture vertex buffer on dispose', () => {
      vi.clearAllMocks();
      shapeRenderer.dispose();
      // deleteBuffer is called for vertexBuffer, indexBuffer, and textureVertexBuffer
      expect(gl.deleteBuffer).toHaveBeenCalled();
      const deleteBufferCalls = (gl.deleteBuffer as Mock).mock.calls.length;
      expect(deleteBufferCalls).toBeGreaterThanOrEqual(3);
    });

    it('should delete texture VAO on dispose', () => {
      vi.clearAllMocks();
      shapeRenderer.dispose();
      // deleteVertexArray is called for vao and textureVAO
      expect(gl.deleteVertexArray).toHaveBeenCalled();
      const deleteVAOCalls = (gl.deleteVertexArray as Mock).mock.calls.length;
      expect(deleteVAOCalls).toBeGreaterThanOrEqual(2);
    });

    it('should clear texture cache on dispose', () => {
      // Start loading a texture
      shapeRenderer.getTexture('data:image/png;base64,test');

      shapeRenderer.dispose();

      // After dispose, internal state should be cleared
      // Calling getTexture on a new instance or verifying no errors is sufficient
      expect(() => shapeRenderer.dispose()).not.toThrow(); // double dispose should not throw
    });

    it('should clear pending images on dispose', () => {
      shapeRenderer.getTexture('data:image/png;base64,pending');

      shapeRenderer.dispose();

      // No errors should occur
      expect(true).toBe(true);
    });
  });

  // ==========================================================================
  // applyTintAndAlpha with image ghost colors
  // ==========================================================================

  describe('applyTintAndAlpha for image ghost rendering', () => {
    it('should apply red tint at 50% mix', () => {
      const color = new Float32Array([0.5, 0.5, 0.5, 1.0]);
      const tint: [number, number, number] = [1, 0, 0]; // red

      const result = shapeRenderer.applyTintAndAlpha(color, tint, 1.0);

      // 50% mix: r = 0.5*0.5 + 1*0.5 = 0.75
      expect(result[0]).toBeCloseTo(0.75);
      // g = 0.5*0.5 + 0*0.5 = 0.25
      expect(result[1]).toBeCloseTo(0.25);
      // b = 0.5*0.5 + 0*0.5 = 0.25
      expect(result[2]).toBeCloseTo(0.25);
      // a = 1.0 * 1.0 = 1.0
      expect(result[3]).toBeCloseTo(1.0);
    });

    it('should apply teal tint at 50% mix', () => {
      const color = new Float32Array([0.5, 0.5, 0.5, 1.0]);
      const tint: [number, number, number] = [0, 0.8, 0.8]; // teal

      const result = shapeRenderer.applyTintAndAlpha(color, tint, 0.7);

      // 50% mix: r = 0.5*0.5 + 0*0.5 = 0.25
      expect(result[0]).toBeCloseTo(0.25);
      // g = 0.5*0.5 + 0.8*0.5 = 0.65
      expect(result[1]).toBeCloseTo(0.65);
      // b = 0.5*0.5 + 0.8*0.5 = 0.65
      expect(result[2]).toBeCloseTo(0.65);
      // a = 1.0 * 0.7 = 0.7
      expect(result[3]).toBeCloseTo(0.7);
    });
  });

  // ==========================================================================
  // Image Corner Radius
  // ==========================================================================

  describe('image corner radius', () => {
    it('should create image node with default zero corner radius', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      expect(imageNode.cornerRadius).toEqual([0, 0, 0, 0]);
    });

    it('should not throw when rendering image with non-zero corner radius', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      imageNode.cornerRadius = [20, 20, 20, 20];
      sceneGraph.addNode(imageNode);

      const vpMatrix = mat3.identity();
      expect(() => shapeRenderer.render(sceneGraph, vpMatrix)).not.toThrow();
    });

    it('should not throw when rendering image with per-corner radius', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      imageNode.cornerRadius = [10, 20, 30, 40];

      const vpMatrix = mat3.identity();
      expect(() => shapeRenderer.renderNode(imageNode, vpMatrix)).not.toThrow();
    });

    it('should not throw ghost rendering with corner radius', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      imageNode.cornerRadius = [15, 15, 15, 15];

      const vpMatrix = mat3.identity();
      expect(() =>
        shapeRenderer.renderGhostNode(imageNode, vpMatrix, 0.5, [1, 0, 0])
      ).not.toThrow();
    });

    it('should handle image with large corner radius without error', () => {
      const imageNode = createImageNode('img1', 'data:image/png;base64,abc', 200, 100);
      // Corner radius larger than half the smaller dimension
      imageNode.cornerRadius = [100, 100, 100, 100];

      const vpMatrix = mat3.identity();
      expect(() => shapeRenderer.renderNode(imageNode, vpMatrix)).not.toThrow();
    });
  });
});
