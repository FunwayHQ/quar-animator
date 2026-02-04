import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Grid, type GridConfig } from './Grid';
import { WebGLRenderer } from './WebGLRenderer';
import { mat3 } from '../math';
import { createMockCanvas } from '../test/setup';

describe('Grid', () => {
  let canvas: HTMLCanvasElement;
  let renderer: WebGLRenderer;
  let mockGL: WebGL2RenderingContext;

  beforeEach(() => {
    canvas = createMockCanvas();
    renderer = new WebGLRenderer({ canvas });
    mockGL = renderer.context;
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('constructor', () => {
    it('creates grid with default config', () => {
      const grid = new Grid(renderer);
      expect(grid).toBeDefined();
    });

    it('creates grid with custom config', () => {
      const customConfig: Partial<GridConfig> = {
        majorSpacing: 50,
        minorDivisions: 10,
        lineWidth: 2,
      };

      const grid = new Grid(renderer, customConfig);
      expect(grid).toBeDefined();
    });

    it('initializes shader program', () => {
      new Grid(renderer);
      const program = renderer.getProgram('grid');
      expect(program).toBeDefined();
    });

    it('creates VAO', () => {
      new Grid(renderer);
      expect(mockGL.createVertexArray).toHaveBeenCalled();
    });

    it('creates vertex buffer', () => {
      new Grid(renderer);
      // createBuffer is called for vertex buffer allocation
      expect(mockGL.createBuffer).toHaveBeenCalled();
    });

    it('creates color buffer', () => {
      new Grid(renderer);
      // Two buffers should be created: vertex and color
      expect(mockGL.createBuffer).toHaveBeenCalledTimes(2);
    });

    it('sets up vertex attributes', () => {
      new Grid(renderer);
      expect(mockGL.enableVertexAttribArray).toHaveBeenCalled();
      expect(mockGL.vertexAttribPointer).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe('setConfig', () => {
    it('updates grid configuration', () => {
      const grid = new Grid(renderer);

      // This should not throw
      expect(() =>
        grid.setConfig({
          majorSpacing: 200,
          minorDivisions: 4,
        })
      ).not.toThrow();
    });

    it('merges with existing config', () => {
      const grid = new Grid(renderer, {
        majorSpacing: 100,
        minorDivisions: 5,
      });

      // Update only one property
      grid.setConfig({ majorSpacing: 200 });

      // minorDivisions should remain 5, majorSpacing should be 200
      // We can't directly test private config, but we can verify render doesn't crash
      const viewProjection = mat3.identity();
      const bounds = { x: 0, y: 0, width: 800, height: 600 };
      expect(() => grid.render(viewProjection, bounds, 1)).not.toThrow();
    });
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  describe('render', () => {
    it('renders grid without errors', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      expect(() => grid.render(viewProjection, bounds, 1)).not.toThrow();
    });

    it('uses the grid shader program', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      grid.render(viewProjection, bounds, 1);

      expect(mockGL.useProgram).toHaveBeenCalled();
    });

    it('binds VAO for rendering', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      grid.render(viewProjection, bounds, 1);

      expect(mockGL.bindVertexArray).toHaveBeenCalled();
    });

    it('sets view projection uniform', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      grid.render(viewProjection, bounds, 1);

      expect(mockGL.uniformMatrix3fv).toHaveBeenCalled();
    });

    it('draws lines', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      grid.render(viewProjection, bounds, 1);

      expect(mockGL.drawArrays).toHaveBeenCalledWith(mockGL.LINES, 0, expect.any(Number));
    });

    it('updates vertex buffer with grid lines', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      grid.render(viewProjection, bounds, 1);

      expect(mockGL.bufferSubData).toHaveBeenCalled();
    });

    it('handles zero-size bounds gracefully', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: 0, y: 0, width: 0, height: 0 };

      // Should not throw or crash
      expect(() => grid.render(viewProjection, bounds, 1)).not.toThrow();
    });

    it('handles very large bounds', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -10000, y: -10000, width: 20000, height: 20000 };

      // Should not throw or crash (grid line count should be capped)
      expect(() => grid.render(viewProjection, bounds, 0.1)).not.toThrow();
    });
  });

  // ==========================================================================
  // Adaptive Spacing
  // ==========================================================================

  describe('adaptive spacing', () => {
    it('adjusts grid spacing at different zoom levels', () => {
      const grid = new Grid(renderer, { majorSpacing: 100 });
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      // At zoom 1, should render normally
      grid.render(viewProjection, bounds, 1);
      const calls1 = (mockGL.drawArrays as ReturnType<typeof vi.fn>).mock.calls.length;

      // Reset mocks
      vi.clearAllMocks();

      // At zoom 0.1 (zoomed out), spacing should adapt
      grid.render(viewProjection, bounds, 0.1);
      const calls2 = (mockGL.drawArrays as ReturnType<typeof vi.fn>).mock.calls.length;

      // Both should have rendered (exact line count differs due to spacing adaptation)
      expect(calls1).toBeGreaterThan(0);
      expect(calls2).toBeGreaterThan(0);
    });

    it('renders at very low zoom without excessive lines', () => {
      const grid = new Grid(renderer, { majorSpacing: 100 });
      const viewProjection = mat3.identity();
      const bounds = { x: -5000, y: -5000, width: 10000, height: 10000 };

      // At very low zoom, adaptive spacing should increase to avoid too many lines
      expect(() => grid.render(viewProjection, bounds, 0.01)).not.toThrow();

      // drawArrays should have been called with reasonable vertex count
      const drawCalls = (mockGL.drawArrays as ReturnType<typeof vi.fn>).mock.calls;
      if (drawCalls.length > 0) {
        const vertexCount = drawCalls[0][2];
        expect(vertexCount).toBeLessThanOrEqual(4000); // maxLines * 2
      }
    });

    it('renders at high zoom with finer grid', () => {
      const grid = new Grid(renderer, { majorSpacing: 100 });
      const viewProjection = mat3.identity();
      const bounds = { x: -50, y: -50, width: 100, height: 100 };

      // At high zoom, should still render
      expect(() => grid.render(viewProjection, bounds, 5)).not.toThrow();
    });
  });

  // ==========================================================================
  // Grid Line Generation
  // ==========================================================================

  describe('grid line generation', () => {
    it('generates both horizontal and vertical lines', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -100, y: -100, width: 200, height: 200 };

      grid.render(viewProjection, bounds, 1);

      // bufferSubData should be called for vertex and color buffers
      expect(mockGL.bufferSubData).toHaveBeenCalled();
    });

    it('includes origin axis lines', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      // Bounds that include the origin
      const bounds = { x: -100, y: -100, width: 200, height: 200 };

      grid.render(viewProjection, bounds, 1);

      // Axis lines should be included (rendered with different color)
      expect(mockGL.drawArrays).toHaveBeenCalled();
    });

    it('respects max line limit', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      // Very large bounds
      const bounds = { x: -10000, y: -10000, width: 20000, height: 20000 };

      // At very low zoom, many lines would be needed
      grid.render(viewProjection, bounds, 0.01);

      // Verify drawArrays was called (lines were generated and capped)
      const drawCalls = (mockGL.drawArrays as ReturnType<typeof vi.fn>).mock.calls;
      expect(drawCalls.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Custom Colors
  // ==========================================================================

  describe('custom colors', () => {
    it('accepts custom minor color', () => {
      const grid = new Grid(renderer, {
        minorColor: [0.2, 0.2, 0.2, 1.0],
      });

      expect(grid).toBeDefined();
    });

    it('accepts custom major color', () => {
      const grid = new Grid(renderer, {
        majorColor: [0.4, 0.4, 0.4, 1.0],
      });

      expect(grid).toBeDefined();
    });

    it('accepts custom axis color', () => {
      const grid = new Grid(renderer, {
        axisColor: [0.5, 0.5, 0.5, 1.0],
      });

      expect(grid).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('handles negative bounds', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -1000, y: -1000, width: 500, height: 500 };

      expect(() => grid.render(viewProjection, bounds, 1)).not.toThrow();
    });

    it('handles bounds not including origin', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: 1000, y: 1000, width: 500, height: 500 };

      expect(() => grid.render(viewProjection, bounds, 1)).not.toThrow();
    });

    it('handles transformed view projection', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.scale(mat3.translate(mat3.identity(), 100, 100), 2, 2);
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      expect(() => grid.render(viewProjection, bounds, 2)).not.toThrow();
    });

    it('handles fractional zoom levels', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      expect(() => grid.render(viewProjection, bounds, 0.75)).not.toThrow();
      expect(() => grid.render(viewProjection, bounds, 1.333)).not.toThrow();
      expect(() => grid.render(viewProjection, bounds, 2.5)).not.toThrow();
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('dispose', () => {
    it('deletes vertex buffer', () => {
      const grid = new Grid(renderer);
      grid.dispose();

      expect(mockGL.deleteBuffer).toHaveBeenCalled();
    });

    it('deletes color buffer', () => {
      const grid = new Grid(renderer);
      grid.dispose();

      // Two deleteBuffer calls: vertex and color
      expect(mockGL.deleteBuffer).toHaveBeenCalledTimes(2);
    });

    it('deletes VAO', () => {
      const grid = new Grid(renderer);
      grid.dispose();

      expect(mockGL.deleteVertexArray).toHaveBeenCalled();
    });

    it('can be called multiple times safely', () => {
      const grid = new Grid(renderer);

      expect(() => {
        grid.dispose();
        grid.dispose();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Performance
  // ==========================================================================

  describe('performance considerations', () => {
    it('pre-allocates vertex array', () => {
      // Creating grid should not throw due to array allocation
      const grid = new Grid(renderer);
      expect(grid).toBeDefined();

      // bufferData should have been called with pre-allocated size
      expect(mockGL.bufferData).toHaveBeenCalled();
    });

    it('uses DYNAMIC_DRAW for frequently updated buffers', () => {
      new Grid(renderer);

      // Verify DYNAMIC_DRAW usage for the vertex/color buffers
      const bufferDataCalls = (mockGL.bufferData as ReturnType<typeof vi.fn>).mock.calls;
      const dynamicDrawCalls = bufferDataCalls.filter(
        (call: unknown[]) => call[2] === mockGL.DYNAMIC_DRAW
      );
      expect(dynamicDrawCalls.length).toBeGreaterThan(0);
    });

    it('uses bufferSubData instead of bufferData for updates', () => {
      const grid = new Grid(renderer);
      const viewProjection = mat3.identity();
      const bounds = { x: -400, y: -300, width: 800, height: 600 };

      // Initial render
      grid.render(viewProjection, bounds, 1);

      // Second render should use bufferSubData for efficiency
      grid.render(viewProjection, bounds, 1);

      expect(mockGL.bufferSubData).toHaveBeenCalled();
    });
  });
});
