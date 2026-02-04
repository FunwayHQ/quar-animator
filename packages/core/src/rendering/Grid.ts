/**
 * Grid Renderer for Quar Animator
 * Renders an infinite adaptive grid that scales with zoom level
 */

import type { Matrix3, Rect } from '@quar/types';
import { WebGLRenderer, type ShaderProgram } from './WebGLRenderer';
import { mat3 } from '../math';

// ============================================================================
// Grid Configuration
// ============================================================================

export interface GridConfig {
  /** Major grid spacing in world units */
  majorSpacing: number;
  /** How many minor divisions between major lines */
  minorDivisions: number;
  /** Minor grid line color */
  minorColor: [number, number, number, number];
  /** Major grid line color */
  majorColor: [number, number, number, number];
  /** Axis line color */
  axisColor: [number, number, number, number];
  /** Line width in pixels */
  lineWidth: number;
}

const DEFAULT_CONFIG: GridConfig = {
  majorSpacing: 100,
  minorDivisions: 5, // 5 minor lines = 20px minor spacing at majorSpacing 100
  minorColor: [0.15, 0.15, 0.15, 1.0], // #262626
  majorColor: [0.2, 0.2, 0.2, 1.0], // #333333
  axisColor: [0.3, 0.3, 0.3, 1.0], // #4D4D4D
  lineWidth: 1,
};

// ============================================================================
// Shaders
// ============================================================================

const GRID_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec4 a_color;

uniform mat3 u_viewProjection;

out vec4 v_color;

void main() {
  vec3 pos = u_viewProjection * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_color = a_color;
}
`;

const GRID_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

// ============================================================================
// Grid Class
// ============================================================================

export class Grid {
  private renderer: WebGLRenderer;
  private config: GridConfig;
  private program: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private colorBuffer: WebGLBuffer | null = null;

  // Pre-allocated arrays to avoid GC
  private vertices: Float32Array;
  private colors: Float32Array;
  private maxLines: number = 2000;

  constructor(renderer: WebGLRenderer, config: Partial<GridConfig> = {}) {
    this.renderer = renderer;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Pre-allocate arrays (4 vertices per line segment = 8 floats per line)
    this.vertices = new Float32Array(this.maxLines * 4);
    this.colors = new Float32Array(this.maxLines * 8);

    this.initializeShaders();
    this.initializeBuffers();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  private initializeShaders(): void {
    this.program = this.renderer.createShaderProgram(
      'grid',
      GRID_VERTEX_SHADER,
      GRID_FRAGMENT_SHADER,
      ['a_position', 'a_color'],
      ['u_viewProjection']
    );
  }

  private initializeBuffers(): void {
    const gl = this.renderer.context;

    // Create VAO
    this.vao = this.renderer.createVAO();
    this.renderer.bindVAO(this.vao);

    // Create vertex buffer
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);

    if (this.program) {
      gl.enableVertexAttribArray(this.program.attributes.a_position);
      gl.vertexAttribPointer(
        this.program.attributes.a_position,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );
    }

    // Create color buffer
    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.colors.byteLength, gl.DYNAMIC_DRAW);

    if (this.program) {
      gl.enableVertexAttribArray(this.program.attributes.a_color);
      gl.vertexAttribPointer(
        this.program.attributes.a_color,
        4,
        gl.FLOAT,
        false,
        0,
        0
      );
    }

    this.renderer.bindVAO(null);
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  setConfig(config: Partial<GridConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  render(viewProjectionMatrix: Matrix3, visibleBounds: Rect, zoom: number): void {
    if (!this.program || !this.vao) return;

    const gl = this.renderer.context;

    // Calculate adaptive grid spacing based on zoom
    const { majorSpacing, minorDivisions } = this.config;
    const adaptiveSpacing = this.calculateAdaptiveSpacing(majorSpacing, zoom);
    const minorSpacing = adaptiveSpacing / minorDivisions;

    // Generate grid lines
    const lineCount = this.generateGridLines(visibleBounds, adaptiveSpacing, minorSpacing);

    if (lineCount === 0) return;

    // Update buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, lineCount * 4));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors.subarray(0, lineCount * 8));

    // Render
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Set uniforms
    gl.uniformMatrix3fv(
      this.program.uniforms.u_viewProjection,
      false,
      mat3.toFloat32Array(viewProjectionMatrix)
    );

    // Draw lines
    gl.drawArrays(gl.LINES, 0, lineCount * 2);
  }

  // --------------------------------------------------------------------------
  // Grid Generation
  // --------------------------------------------------------------------------

  /**
   * Calculate adaptive grid spacing to keep grid readable at all zoom levels
   */
  private calculateAdaptiveSpacing(baseSpacing: number, zoom: number): number {
    // At zoom < 0.5, double the spacing
    // At zoom > 2, halve the spacing
    // This keeps lines roughly 50-200 screen pixels apart

    let spacing = baseSpacing;
    const screenSpacing = spacing * zoom;

    // Scale up if lines too close
    while (screenSpacing * spacing / baseSpacing < 50) {
      spacing *= 2;
    }

    // Scale down if lines too far
    while (screenSpacing * spacing / baseSpacing > 200) {
      spacing /= 2;
    }

    return spacing;
  }

  /**
   * Generate grid lines within visible bounds
   */
  private generateGridLines(
    bounds: Rect,
    majorSpacing: number,
    minorSpacing: number
  ): number {
    const { minorColor, majorColor, axisColor } = this.config;

    let vertexIndex = 0;
    let colorIndex = 0;
    let lineCount = 0;

    // Expand bounds slightly to catch edge lines
    const padding = majorSpacing;
    const left = bounds.x - padding;
    const right = bounds.x + bounds.width + padding;
    const top = bounds.y - padding;
    const bottom = bounds.y + bounds.height + padding;

    // Snap to grid
    const startX = Math.floor(left / minorSpacing) * minorSpacing;
    const endX = Math.ceil(right / minorSpacing) * minorSpacing;
    const startY = Math.floor(top / minorSpacing) * minorSpacing;
    const endY = Math.ceil(bottom / minorSpacing) * minorSpacing;

    // Vertical lines
    for (let x = startX; x <= endX; x += minorSpacing) {
      if (lineCount >= this.maxLines) break;

      // Determine line type
      let color: [number, number, number, number];
      if (Math.abs(x) < 0.001) {
        color = axisColor; // Y-axis
      } else if (Math.abs(x % majorSpacing) < 0.001) {
        color = majorColor;
      } else {
        color = minorColor;
      }

      // Add line vertices
      this.vertices[vertexIndex++] = x;
      this.vertices[vertexIndex++] = top;
      this.vertices[vertexIndex++] = x;
      this.vertices[vertexIndex++] = bottom;

      // Add colors (2 vertices per line)
      for (let i = 0; i < 2; i++) {
        this.colors[colorIndex++] = color[0];
        this.colors[colorIndex++] = color[1];
        this.colors[colorIndex++] = color[2];
        this.colors[colorIndex++] = color[3];
      }

      lineCount++;
    }

    // Horizontal lines
    for (let y = startY; y <= endY; y += minorSpacing) {
      if (lineCount >= this.maxLines) break;

      // Determine line type
      let color: [number, number, number, number];
      if (Math.abs(y) < 0.001) {
        color = axisColor; // X-axis
      } else if (Math.abs(y % majorSpacing) < 0.001) {
        color = majorColor;
      } else {
        color = minorColor;
      }

      // Add line vertices
      this.vertices[vertexIndex++] = left;
      this.vertices[vertexIndex++] = y;
      this.vertices[vertexIndex++] = right;
      this.vertices[vertexIndex++] = y;

      // Add colors (2 vertices per line)
      for (let i = 0; i < 2; i++) {
        this.colors[colorIndex++] = color[0];
        this.colors[colorIndex++] = color[1];
        this.colors[colorIndex++] = color[2];
        this.colors[colorIndex++] = color[3];
      }

      lineCount++;
    }

    return lineCount;
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  dispose(): void {
    const gl = this.renderer.context;

    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
    }
    if (this.colorBuffer) {
      gl.deleteBuffer(this.colorBuffer);
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
    }
  }
}
