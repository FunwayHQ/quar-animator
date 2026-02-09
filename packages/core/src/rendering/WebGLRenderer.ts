/**
 * WebGL 2 Renderer for Quar Animator
 * Handles WebGL context initialization, state management, and rendering
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface WebGLRendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  alpha?: boolean;
  premultipliedAlpha?: boolean;
}

export interface ShaderProgram {
  program: WebGLProgram;
  attributes: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation>;
}

export interface BufferInfo {
  buffer: WebGLBuffer;
  type: number;
  usage: number;
  itemSize: number;
  numItems: number;
}

// ============================================================================
// WebGL Renderer Class
// ============================================================================

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private programs: Map<string, ShaderProgram> = new Map();
  private buffers: Map<string, BufferInfo> = new Map();

  // State caching to avoid redundant GL calls
  private currentProgram: WebGLProgram | null = null;
  private currentVAO: WebGLVertexArrayObject | null = null;

  // Viewport info
  private _width: number = 0;
  private _height: number = 0;
  private _pixelRatio: number = 1;

  // Context loss handling
  private contextLost: boolean = false;
  private onContextLost: (() => void) | null = null;
  private onContextRestored: (() => void) | null = null;

  // Bound event handlers (stored for proper removeEventListener)
  private boundHandleContextLost: (e: Event) => void;
  private boundHandleContextRestored: (e: Event) => void;

  constructor(options: WebGLRendererOptions) {
    this.canvas = options.canvas;

    const contextAttributes: WebGLContextAttributes = {
      antialias: options.antialias ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      alpha: options.alpha ?? true,
      premultipliedAlpha: options.premultipliedAlpha ?? true,
      powerPreference: 'high-performance',
    };

    const gl = this.canvas.getContext('webgl2', contextAttributes);
    if (!gl) {
      throw new Error('WebGL 2 is not supported in this browser');
    }
    this.gl = gl;

    // Set up context loss handlers (store bound refs for proper cleanup)
    this.boundHandleContextLost = this.handleContextLost.bind(this);
    this.boundHandleContextRestored = this.handleContextRestored.bind(this);
    this.canvas.addEventListener('webglcontextlost', this.boundHandleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.boundHandleContextRestored);

    // Initialize default state
    this.initializeState();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  private initializeState(): void {
    const { gl } = this;

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Enable depth testing (for later 2.5D effects)
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Set clear color (dark background)
    gl.clearColor(0.102, 0.102, 0.102, 1.0); // #1A1A1A
  }

  // --------------------------------------------------------------------------
  // Context
  // --------------------------------------------------------------------------

  get context(): WebGL2RenderingContext {
    return this.gl;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get pixelRatio(): number {
    return this._pixelRatio;
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  setContextLostHandler(handler: () => void): void {
    this.onContextLost = handler;
  }

  setContextRestoredHandler(handler: () => void): void {
    this.onContextRestored = handler;
  }

  private handleContextLost(event: Event): void {
    event.preventDefault();
    this.contextLost = true;
    this.onContextLost?.();
  }

  private handleContextRestored(): void {
    this.contextLost = false;
    this.initializeState();
    this.onContextRestored?.();
  }

  // --------------------------------------------------------------------------
  // Viewport
  // --------------------------------------------------------------------------

  setViewport(width: number, height: number, pixelRatio: number = window.devicePixelRatio): void {
    this._width = width;
    this._height = height;
    this._pixelRatio = pixelRatio;

    const actualWidth = Math.floor(width * pixelRatio);
    const actualHeight = Math.floor(height * pixelRatio);

    this.canvas.width = actualWidth;
    this.canvas.height = actualHeight;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.gl.viewport(0, 0, actualWidth, actualHeight);
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  clear(color?: [number, number, number, number]): void {
    const { gl } = this;

    if (color) {
      gl.clearColor(color[0], color[1], color[2], color[3]);
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  // --------------------------------------------------------------------------
  // Shader Management
  // --------------------------------------------------------------------------

  createShaderProgram(
    name: string,
    vertexSource: string,
    fragmentSource: string,
    attributeNames: string[],
    uniformNames: string[]
  ): ShaderProgram {
    const { gl } = this;

    // Compile shaders
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    // Link program
    const program = gl.createProgram();
    if (!program) {
      throw new Error('Failed to create shader program');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      throw new Error(`Shader program link error: ${error}`);
    }

    // Clean up individual shaders
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // Get attribute locations
    const attributes: Record<string, number> = {};
    for (const attr of attributeNames) {
      attributes[attr] = gl.getAttribLocation(program, attr);
    }

    // Get uniform locations
    const uniforms: Record<string, WebGLUniformLocation> = {};
    for (const uniform of uniformNames) {
      const location = gl.getUniformLocation(program, uniform);
      if (location !== null) {
        uniforms[uniform] = location;
      }
    }

    const shaderProgram: ShaderProgram = { program, attributes, uniforms };
    this.programs.set(name, shaderProgram);

    return shaderProgram;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const { gl } = this;

    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create shader');
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${error}`);
    }

    return shader;
  }

  getProgram(name: string): ShaderProgram | undefined {
    return this.programs.get(name);
  }

  useProgram(program: ShaderProgram): void {
    if (this.currentProgram !== program.program) {
      this.gl.useProgram(program.program);
      this.currentProgram = program.program;
    }
  }

  // --------------------------------------------------------------------------
  // Buffer Management
  // --------------------------------------------------------------------------

  createBuffer(
    name: string,
    data: Float32Array | Uint16Array,
    itemSize: number,
    usage: number = this.gl.STATIC_DRAW
  ): BufferInfo {
    const { gl } = this;

    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error('Failed to create buffer');
    }

    const type = data instanceof Uint16Array ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;

    gl.bindBuffer(type, buffer);
    gl.bufferData(type, data, usage);

    const bufferInfo: BufferInfo = {
      buffer,
      type,
      usage,
      itemSize,
      numItems: data.length / itemSize,
    };

    this.buffers.set(name, bufferInfo);
    return bufferInfo;
  }

  updateBuffer(name: string, data: Float32Array | Uint16Array): void {
    const bufferInfo = this.buffers.get(name);
    if (!bufferInfo) {
      throw new Error(`Buffer not found: ${name}`);
    }

    const { gl } = this;
    gl.bindBuffer(bufferInfo.type, bufferInfo.buffer);
    gl.bufferSubData(bufferInfo.type, 0, data);
  }

  getBuffer(name: string): BufferInfo | undefined {
    return this.buffers.get(name);
  }

  // --------------------------------------------------------------------------
  // VAO Management
  // --------------------------------------------------------------------------

  createVAO(): WebGLVertexArrayObject {
    const vao = this.gl.createVertexArray();
    if (!vao) {
      throw new Error('Failed to create VAO');
    }
    return vao;
  }

  bindVAO(vao: WebGLVertexArrayObject | null): void {
    if (this.currentVAO !== vao) {
      this.gl.bindVertexArray(vao);
      this.currentVAO = vao;
    }
  }

  // --------------------------------------------------------------------------
  // Draw Calls
  // --------------------------------------------------------------------------

  drawArrays(mode: number, first: number, count: number): void {
    this.gl.drawArrays(mode, first, count);
  }

  drawElements(mode: number, count: number, type: number, offset: number): void {
    this.gl.drawElements(mode, count, type, offset);
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Set a uniform value with automatic type detection
   */
  setUniform(program: ShaderProgram, name: string, value: number | number[] | Float32Array): void {
    const { gl } = this;
    const location = program.uniforms[name];
    if (!location) return;

    if (typeof value === 'number') {
      gl.uniform1f(location, value);
    } else if (value.length === 2) {
      gl.uniform2fv(location, value);
    } else if (value.length === 3) {
      gl.uniform3fv(location, value);
    } else if (value.length === 4) {
      gl.uniform4fv(location, value);
    } else if (value.length === 9) {
      gl.uniformMatrix3fv(location, false, value);
    } else if (value.length === 16) {
      gl.uniformMatrix4fv(location, false, value);
    }
  }

  /**
   * Convert hex color to RGB array (0-1 range)
   */
  static hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [1, 1, 1];

    return [
      parseInt(result[1]!, 16) / 255,
      parseInt(result[2]!, 16) / 255,
      parseInt(result[3]!, 16) / 255,
    ];
  }

  /**
   * Delete a specific shader program by name.
   * Used by ShapeRenderer/Grid when they dispose their own programs.
   */
  deleteProgram(name: string): void {
    const program = this.programs.get(name);
    if (program) {
      this.gl.deleteProgram(program.program);
      this.programs.delete(name);
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  dispose(): void {
    const { gl } = this;

    // Clean up programs
    for (const [, program] of this.programs) {
      gl.deleteProgram(program.program);
    }
    this.programs.clear();

    // Clean up buffers
    for (const [, bufferInfo] of this.buffers) {
      gl.deleteBuffer(bufferInfo.buffer);
    }
    this.buffers.clear();

    // Remove event listeners (using stored bound refs)
    this.canvas.removeEventListener('webglcontextlost', this.boundHandleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.boundHandleContextRestored);
  }
}
