import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebGLRenderer } from './WebGLRenderer';
import { createMockCanvas, createMockWebGL2Context } from '../test/setup';

describe('WebGLRenderer', () => {
  let canvas: HTMLCanvasElement;
  let mockGL: ReturnType<typeof createMockWebGL2Context>;

  beforeEach(() => {
    canvas = createMockCanvas();
    mockGL = canvas.getContext('webgl2') as ReturnType<typeof createMockWebGL2Context>;
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('constructor', () => {
    it('creates renderer with canvas', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.context).toBe(mockGL);
    });

    it('throws error when WebGL 2 is not supported', () => {
      const badCanvas = document.createElement('canvas');
      badCanvas.getContext = vi.fn().mockReturnValue(null);

      expect(() => new WebGLRenderer({ canvas: badCanvas })).toThrow('WebGL 2 is not supported');
    });

    it('enables blending by default', () => {
      new WebGLRenderer({ canvas });
      expect(mockGL.enable).toHaveBeenCalledWith(mockGL.BLEND);
      expect(mockGL.blendFunc).toHaveBeenCalledWith(mockGL.SRC_ALPHA, mockGL.ONE_MINUS_SRC_ALPHA);
    });

    it('enables depth testing by default', () => {
      new WebGLRenderer({ canvas });
      expect(mockGL.enable).toHaveBeenCalledWith(mockGL.DEPTH_TEST);
      expect(mockGL.depthFunc).toHaveBeenCalledWith(mockGL.LEQUAL);
    });

    it('sets default clear color', () => {
      new WebGLRenderer({ canvas });
      expect(mockGL.clearColor).toHaveBeenCalledWith(0.102, 0.102, 0.102, 1.0);
    });
  });

  // ==========================================================================
  // Context Properties
  // ==========================================================================

  describe('context properties', () => {
    it('returns WebGL context', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.context).toBeDefined();
    });

    it('tracks context lost state', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.isContextLost()).toBe(false);
    });

    it('returns initial width as 0', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.width).toBe(0);
    });

    it('returns initial height as 0', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.height).toBe(0);
    });

    it('returns initial pixel ratio as 1', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.pixelRatio).toBe(1);
    });
  });

  // ==========================================================================
  // Context Loss Handling
  // ==========================================================================

  describe('context loss handling', () => {
    it('sets context lost handler', () => {
      const renderer = new WebGLRenderer({ canvas });
      const handler = vi.fn();
      renderer.setContextLostHandler(handler);

      // Simulate context loss
      const event = new Event('webglcontextlost');
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      canvas.dispatchEvent(event);

      expect(renderer.isContextLost()).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('sets context restored handler', () => {
      const renderer = new WebGLRenderer({ canvas });
      const handler = vi.fn();
      renderer.setContextRestoredHandler(handler);

      // Simulate context loss then restore
      const lostEvent = new Event('webglcontextlost');
      Object.defineProperty(lostEvent, 'preventDefault', { value: vi.fn() });
      canvas.dispatchEvent(lostEvent);

      const restoredEvent = new Event('webglcontextrestored');
      canvas.dispatchEvent(restoredEvent);

      expect(renderer.isContextLost()).toBe(false);
      expect(handler).toHaveBeenCalled();
    });

    it('clears stale program/buffer wrappers on context restore (F041)', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.createShaderProgram('x', 'void main(){}', 'void main(){}', [], []);
      renderer.createBuffer('b', new Float32Array([0, 0, 1, 1]), 2);
      expect(renderer.getProgram('x')).toBeDefined();
      expect(renderer.getBuffer('b')).toBeDefined();

      const restoredHandler = vi.fn();
      renderer.setContextRestoredHandler(restoredHandler);

      const lost = new Event('webglcontextlost');
      Object.defineProperty(lost, 'preventDefault', { value: vi.fn() });
      canvas.dispatchEvent(lost);
      canvas.dispatchEvent(new Event('webglcontextrestored'));

      // The GPU objects created on the dead context are gone; their stale JS
      // wrappers must be dropped so consumers recreate everything.
      expect(renderer.getProgram('x')).toBeUndefined();
      expect(renderer.getBuffer('b')).toBeUndefined();
      expect(restoredHandler).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Viewport
  // ==========================================================================

  describe('setViewport', () => {
    it('sets viewport dimensions', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.setViewport(800, 600);

      expect(renderer.width).toBe(800);
      expect(renderer.height).toBe(600);
    });

    it('applies pixel ratio to canvas size', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.setViewport(800, 600, 2);

      expect(canvas.width).toBe(1600);
      expect(canvas.height).toBe(1200);
    });

    it('sets canvas CSS size', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.setViewport(800, 600);

      expect(canvas.style.width).toBe('800px');
      expect(canvas.style.height).toBe('600px');
    });

    it('calls gl.viewport', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.setViewport(800, 600, 2);

      expect(mockGL.viewport).toHaveBeenCalledWith(0, 0, 1600, 1200);
    });

    it('stores pixel ratio', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.setViewport(800, 600, 2);

      expect(renderer.pixelRatio).toBe(2);
    });
  });

  // ==========================================================================
  // Clear
  // ==========================================================================

  describe('clear', () => {
    it('clears color and depth buffers', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.clear();

      expect(mockGL.clear).toHaveBeenCalledWith(mockGL.COLOR_BUFFER_BIT | mockGL.DEPTH_BUFFER_BIT);
    });

    it('sets clear color when provided', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.clear([1, 0, 0, 1]);

      expect(mockGL.clearColor).toHaveBeenLastCalledWith(1, 0, 0, 1);
    });
  });

  // ==========================================================================
  // Shader Management
  // ==========================================================================

  describe('createShaderProgram', () => {
    const vertexShader = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      void main() {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      }
    `;

    it('creates shader program', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        vertexShader,
        fragmentShader,
        ['a_position'],
        ['u_color']
      );

      expect(program).toBeDefined();
      expect(program.program).toBeDefined();
    });

    it('compiles vertex and fragment shaders', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.createShaderProgram('test', vertexShader, fragmentShader, [], []);

      expect(mockGL.createShader).toHaveBeenCalledWith(mockGL.VERTEX_SHADER);
      expect(mockGL.createShader).toHaveBeenCalledWith(mockGL.FRAGMENT_SHADER);
      expect(mockGL.compileShader).toHaveBeenCalledTimes(2);
    });

    it('links shader program', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.createShaderProgram('test', vertexShader, fragmentShader, [], []);

      expect(mockGL.createProgram).toHaveBeenCalled();
      expect(mockGL.linkProgram).toHaveBeenCalled();
    });

    it('cleans up individual shaders after linking', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.createShaderProgram('test', vertexShader, fragmentShader, [], []);

      expect(mockGL.deleteShader).toHaveBeenCalledTimes(2);
    });

    it('stores attribute locations', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        vertexShader,
        fragmentShader,
        ['a_position'],
        []
      );

      expect(program.attributes).toHaveProperty('a_position');
      expect(mockGL.getAttribLocation).toHaveBeenCalledWith(expect.anything(), 'a_position');
    });

    it('stores uniform locations', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        vertexShader,
        fragmentShader,
        [],
        ['u_color']
      );

      expect(program.uniforms).toHaveProperty('u_color');
    });

    it('registers program by name', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram('test', vertexShader, fragmentShader, [], []);

      expect(renderer.getProgram('test')).toBe(program);
    });

    it('throws error on shader compile failure', () => {
      const failingGL = createMockWebGL2Context();
      (failingGL.getShaderParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (failingGL.getShaderInfoLog as ReturnType<typeof vi.fn>).mockReturnValue('Compile error');

      const failingCanvas = document.createElement('canvas');
      failingCanvas.getContext = vi.fn().mockReturnValue(failingGL);
      Object.defineProperty(failingCanvas, 'style', { value: {}, writable: true });

      const renderer = new WebGLRenderer({ canvas: failingCanvas });

      expect(() =>
        renderer.createShaderProgram('fail', vertexShader, fragmentShader, [], [])
      ).toThrow('Shader compile error');
    });

    it('throws error on program link failure', () => {
      const failingGL = createMockWebGL2Context();
      (failingGL.getProgramParameter as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (failingGL.getProgramInfoLog as ReturnType<typeof vi.fn>).mockReturnValue('Link error');

      const failingCanvas = document.createElement('canvas');
      failingCanvas.getContext = vi.fn().mockReturnValue(failingGL);
      Object.defineProperty(failingCanvas, 'style', { value: {}, writable: true });

      const renderer = new WebGLRenderer({ canvas: failingCanvas });

      expect(() =>
        renderer.createShaderProgram('fail', vertexShader, fragmentShader, [], [])
      ).toThrow('Shader program link error');
    });
  });

  describe('getProgram', () => {
    it('returns undefined for non-existent program', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.getProgram('nonexistent')).toBeUndefined();
    });
  });

  describe('useProgram', () => {
    it('activates shader program', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        []
      );

      renderer.useProgram(program);

      expect(mockGL.useProgram).toHaveBeenCalledWith(program.program);
    });

    it('skips redundant program switches (caching)', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        []
      );

      renderer.useProgram(program);
      renderer.useProgram(program);

      // useProgram should only be called once due to caching
      const calls = (mockGL.useProgram as ReturnType<typeof vi.fn>).mock.calls;
      const programCalls = calls.filter((c: unknown[]) => c[0] === program.program);
      expect(programCalls).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Buffer Management
  // ==========================================================================

  describe('createBuffer', () => {
    it('creates buffer with Float32Array data', () => {
      const renderer = new WebGLRenderer({ canvas });
      const data = new Float32Array([0, 0, 1, 0, 0, 1]);
      const buffer = renderer.createBuffer('vertices', data, 2);

      expect(buffer).toBeDefined();
      expect(buffer.buffer).toBeDefined();
      expect(buffer.type).toBe(mockGL.ARRAY_BUFFER);
      expect(buffer.itemSize).toBe(2);
      expect(buffer.numItems).toBe(3);
    });

    it('creates buffer with Uint16Array as element buffer', () => {
      const renderer = new WebGLRenderer({ canvas });
      const data = new Uint16Array([0, 1, 2]);
      const buffer = renderer.createBuffer('indices', data, 1);

      expect(buffer.type).toBe(mockGL.ELEMENT_ARRAY_BUFFER);
    });

    it('binds and uploads data to buffer', () => {
      const renderer = new WebGLRenderer({ canvas });
      const data = new Float32Array([0, 0, 1, 0, 0, 1]);
      renderer.createBuffer('vertices', data, 2);

      expect(mockGL.bindBuffer).toHaveBeenCalled();
      expect(mockGL.bufferData).toHaveBeenCalledWith(mockGL.ARRAY_BUFFER, data, mockGL.STATIC_DRAW);
    });

    it('registers buffer by name', () => {
      const renderer = new WebGLRenderer({ canvas });
      const data = new Float32Array([0, 0]);
      const buffer = renderer.createBuffer('test', data, 2);

      expect(renderer.getBuffer('test')).toBe(buffer);
    });

    it('uses custom usage hint', () => {
      const renderer = new WebGLRenderer({ canvas });
      const data = new Float32Array([0, 0]);
      renderer.createBuffer('test', data, 2, mockGL.DYNAMIC_DRAW);

      expect(mockGL.bufferData).toHaveBeenCalledWith(expect.anything(), data, mockGL.DYNAMIC_DRAW);
    });
  });

  describe('updateBuffer', () => {
    it('updates existing buffer data', () => {
      const renderer = new WebGLRenderer({ canvas });
      const initialData = new Float32Array([0, 0, 1, 0, 0, 1]);
      renderer.createBuffer('vertices', initialData, 2);

      const newData = new Float32Array([0, 1, 1, 1, 0, 0]);
      renderer.updateBuffer('vertices', newData);

      expect(mockGL.bufferSubData).toHaveBeenCalledWith(mockGL.ARRAY_BUFFER, 0, newData);
    });

    it('throws error for non-existent buffer', () => {
      const renderer = new WebGLRenderer({ canvas });

      expect(() => renderer.updateBuffer('nonexistent', new Float32Array([0, 0]))).toThrow(
        'Buffer not found'
      );
    });
  });

  describe('getBuffer', () => {
    it('returns undefined for non-existent buffer', () => {
      const renderer = new WebGLRenderer({ canvas });
      expect(renderer.getBuffer('nonexistent')).toBeUndefined();
    });
  });

  // ==========================================================================
  // VAO Management
  // ==========================================================================

  describe('createVAO', () => {
    it('creates VAO', () => {
      const renderer = new WebGLRenderer({ canvas });
      const vao = renderer.createVAO();

      expect(vao).toBeDefined();
      expect(mockGL.createVertexArray).toHaveBeenCalled();
    });
  });

  describe('bindVAO', () => {
    it('binds VAO', () => {
      const renderer = new WebGLRenderer({ canvas });
      const vao = renderer.createVAO();
      renderer.bindVAO(vao);

      expect(mockGL.bindVertexArray).toHaveBeenCalledWith(vao);
    });

    it('unbinds VAO with null', () => {
      const renderer = new WebGLRenderer({ canvas });
      // First bind a VAO so currentVAO is not null
      const vao = renderer.createVAO();
      renderer.bindVAO(vao);
      // Now unbind with null
      renderer.bindVAO(null);

      expect(mockGL.bindVertexArray).toHaveBeenCalledWith(null);
    });

    it('skips redundant VAO binds (caching)', () => {
      const renderer = new WebGLRenderer({ canvas });
      const vao = renderer.createVAO();

      renderer.bindVAO(vao);
      renderer.bindVAO(vao);

      // Second call should be skipped
      const calls = (mockGL.bindVertexArray as ReturnType<typeof vi.fn>).mock.calls;
      const vaoCalls = calls.filter((c: unknown[]) => c[0] === vao);
      expect(vaoCalls).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Draw Calls
  // ==========================================================================

  describe('drawArrays', () => {
    it('calls gl.drawArrays', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.drawArrays(mockGL.TRIANGLES, 0, 6);

      expect(mockGL.drawArrays).toHaveBeenCalledWith(mockGL.TRIANGLES, 0, 6);
    });
  });

  describe('drawElements', () => {
    it('calls gl.drawElements', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.drawElements(mockGL.TRIANGLES, 6, mockGL.UNSIGNED_SHORT, 0);

      expect(mockGL.drawElements).toHaveBeenCalledWith(
        mockGL.TRIANGLES,
        6,
        mockGL.UNSIGNED_SHORT,
        0
      );
    });
  });

  // ==========================================================================
  // Uniforms
  // ==========================================================================

  describe('setUniform', () => {
    it('sets scalar uniform', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        ['u_time']
      );

      renderer.setUniform(program, 'u_time', 1.5);

      expect(mockGL.uniform1f).toHaveBeenCalledWith(program.uniforms.u_time, 1.5);
    });

    it('sets vec2 uniform', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        ['u_resolution']
      );

      renderer.setUniform(program, 'u_resolution', [800, 600]);

      expect(mockGL.uniform2fv).toHaveBeenCalledWith(program.uniforms.u_resolution, [800, 600]);
    });

    it('sets vec3 uniform', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        ['u_color']
      );

      renderer.setUniform(program, 'u_color', [1, 0, 0]);

      expect(mockGL.uniform3fv).toHaveBeenCalledWith(program.uniforms.u_color, [1, 0, 0]);
    });

    it('sets vec4 uniform', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        ['u_color']
      );

      renderer.setUniform(program, 'u_color', [1, 0, 0, 1]);

      expect(mockGL.uniform4fv).toHaveBeenCalledWith(program.uniforms.u_color, [1, 0, 0, 1]);
    });

    it('sets mat3 uniform', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        ['u_matrix']
      );

      const matrix = new Float32Array(9);
      renderer.setUniform(program, 'u_matrix', matrix);

      expect(mockGL.uniformMatrix3fv).toHaveBeenCalledWith(
        program.uniforms.u_matrix,
        false,
        matrix
      );
    });

    it('sets mat4 uniform', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        ['u_mvp']
      );

      const matrix = new Float32Array(16);
      renderer.setUniform(program, 'u_mvp', matrix);

      expect(mockGL.uniformMatrix4fv).toHaveBeenCalledWith(program.uniforms.u_mvp, false, matrix);
    });

    it('handles missing uniform gracefully', () => {
      const renderer = new WebGLRenderer({ canvas });
      const program = renderer.createShaderProgram(
        'test',
        'void main() {}',
        'void main() {}',
        [],
        []
      );

      // Should not throw
      expect(() => renderer.setUniform(program, 'nonexistent', 1)).not.toThrow();
    });
  });

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  describe('hexToRgb', () => {
    it('converts hex color to RGB', () => {
      const rgb = WebGLRenderer.hexToRgb('#ff0000');
      expect(rgb[0]).toBeCloseTo(1);
      expect(rgb[1]).toBeCloseTo(0);
      expect(rgb[2]).toBeCloseTo(0);
    });

    it('handles lowercase hex', () => {
      const rgb = WebGLRenderer.hexToRgb('#00ff00');
      expect(rgb[0]).toBeCloseTo(0);
      expect(rgb[1]).toBeCloseTo(1);
      expect(rgb[2]).toBeCloseTo(0);
    });

    it('handles hex without hash', () => {
      const rgb = WebGLRenderer.hexToRgb('0000ff');
      expect(rgb[0]).toBeCloseTo(0);
      expect(rgb[1]).toBeCloseTo(0);
      expect(rgb[2]).toBeCloseTo(1);
    });

    it('returns white for invalid hex', () => {
      const rgb = WebGLRenderer.hexToRgb('invalid');
      expect(rgb).toEqual([1, 1, 1]);
    });

    it('handles grey values', () => {
      const rgb = WebGLRenderer.hexToRgb('#808080');
      expect(rgb[0]).toBeCloseTo(0.502, 2);
      expect(rgb[1]).toBeCloseTo(0.502, 2);
      expect(rgb[2]).toBeCloseTo(0.502, 2);
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('dispose', () => {
    it('deletes all programs', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.createShaderProgram('test1', 'void main() {}', 'void main() {}', [], []);
      renderer.createShaderProgram('test2', 'void main() {}', 'void main() {}', [], []);

      renderer.dispose();

      expect(mockGL.deleteProgram).toHaveBeenCalledTimes(2);
    });

    it('deletes all buffers', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.createBuffer('buf1', new Float32Array([0]), 1);
      renderer.createBuffer('buf2', new Float32Array([0]), 1);

      renderer.dispose();

      expect(mockGL.deleteBuffer).toHaveBeenCalledTimes(2);
    });

    it('clears program and buffer maps', () => {
      const renderer = new WebGLRenderer({ canvas });
      renderer.createShaderProgram('test', 'void main() {}', 'void main() {}', [], []);
      renderer.createBuffer('buf', new Float32Array([0]), 1);

      renderer.dispose();

      expect(renderer.getProgram('test')).toBeUndefined();
      expect(renderer.getBuffer('buf')).toBeUndefined();
    });

    // X1-3: Event listener cleanup
    it('removes context loss event listeners on dispose', () => {
      const removeListenerSpy = vi.spyOn(canvas, 'removeEventListener');
      const renderer = new WebGLRenderer({ canvas });

      renderer.dispose();

      // Should have removed both webglcontextlost and webglcontextrestored listeners
      const removedEvents = removeListenerSpy.mock.calls.map((c) => c[0]);
      expect(removedEvents).toContain('webglcontextlost');
      expect(removedEvents).toContain('webglcontextrestored');
    });

    it('does not fire context lost handler after dispose', () => {
      const renderer = new WebGLRenderer({ canvas });
      const handler = vi.fn();
      renderer.setContextLostHandler(handler);

      renderer.dispose();

      // Simulate context loss after dispose - handler should not fire because
      // the listener was removed with the correct bound reference
      const event = new Event('webglcontextlost');
      Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
      canvas.dispatchEvent(event);

      // If the bound reference fix works, this should NOT be called
      // (The old code would have failed to remove because .bind() creates a new reference)
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
