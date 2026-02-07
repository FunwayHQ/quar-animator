/**
 * Shape Renderer for Quar Animator
 * Renders rectangles, ellipses, and paths using WebGL 2
 */

import type {
  Matrix3,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  PathNode,
  Node,
  Fill,
  Stroke,
  Color,
  Gradient,
} from '@quar/types';
import { WebGLRenderer, type ShaderProgram } from './WebGLRenderer';
import { computeBounds, normalizeGradientStops } from '../gradient/gradientUtils';
import { SceneGraph } from '../SceneGraph';
import { mat3 } from '../math';
import {
  tessellatePathToVertices,
  createRectanglePath,
  createEllipsePath,
  createPolygonPath,
  createStarPath,
  generateStrokeOutlineVertices,
  applyCornerRadius,
} from '../path/pathUtils';
import earcut from 'earcut';

// ============================================================================
// Shaders
// ============================================================================

const SHAPE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;

uniform mat3 u_viewProjection;
uniform mat3 u_model;

void main() {
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
`;

const SHAPE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 outColor;

void main() {
  outColor = u_color;
}
`;

// Gradient shaders
const GRADIENT_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;

uniform mat3 u_viewProjection;
uniform mat3 u_model;

out vec2 v_localPos;

void main() {
  v_localPos = a_position;
  vec3 worldPos = u_model * vec3(a_position, 1.0);
  vec3 clipPos = u_viewProjection * worldPos;
  gl_Position = vec4(clipPos.xy, 0.0, 1.0);
}
`;

const MAX_GRADIENT_STOPS = 16;

const GRADIENT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_localPos;

uniform int u_gradientType;    // 0=linear, 1=radial, 2=conic
uniform vec4 u_stops[${MAX_GRADIENT_STOPS}];
uniform float u_offsets[${MAX_GRADIENT_STOPS}];
uniform int u_stopCount;
uniform vec4 u_bounds;         // minX, minY, maxX, maxY
uniform float u_angle;         // linear: angle, conic: startAngle
uniform vec2 u_center;         // radial/conic center (normalized 0-1)
uniform float u_radius;        // radial radius (normalized)
uniform float u_opacity;       // fill/stroke opacity multiplier

out vec4 outColor;

void main() {
  vec2 size = u_bounds.zw - u_bounds.xy;
  vec2 npos = size.x > 0.0 && size.y > 0.0
    ? (v_localPos - u_bounds.xy) / size
    : vec2(0.5);

  float t;
  if (u_gradientType == 0) {
    float rad = u_angle * 3.14159265 / 180.0;
    vec2 dir = vec2(cos(rad), sin(rad));
    t = dot(npos - vec2(0.5), dir) + 0.5;
  } else if (u_gradientType == 1) {
    t = length(npos - u_center) / max(u_radius, 0.001);
  } else {
    vec2 d = npos - u_center;
    float a = atan(d.y, d.x) + 3.14159265;
    float startRad = u_angle * 3.14159265 / 180.0;
    t = mod(a - startRad, 6.28318530) / 6.28318530;
  }
  t = clamp(t, 0.0, 1.0);

  vec4 color = u_stops[0];
  for (int i = 1; i < ${MAX_GRADIENT_STOPS}; i++) {
    if (i >= u_stopCount) break;
    if (t <= u_offsets[i]) {
      float denom = u_offsets[i] - u_offsets[i-1];
      float st = denom > 0.0 ? (t - u_offsets[i-1]) / denom : 0.0;
      color = mix(u_stops[i-1], u_stops[i], clamp(st, 0.0, 1.0));
      break;
    }
    if (i == u_stopCount - 1) color = u_stops[i];
  }
  color.a *= u_opacity;
  outColor = color;
}
`;

// ============================================================================
// Configuration
// ============================================================================

const _DEFAULT_ELLIPSE_SEGMENTS = 64;
const MAX_VERTICES = 10000;
const DEFAULT_TESSELLATION_TOLERANCE = 1.0;
const ELLIPSE_TESSELLATION_TOLERANCE = 0.5;

// ============================================================================
// ShapeRenderer Class
// ============================================================================

export class ShapeRenderer {
  private renderer: WebGLRenderer;
  private program: ShaderProgram | null = null;
  private gradientProgram: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;

  // Pre-allocated arrays to avoid GC
  private vertices: Float32Array;
  private indices: Uint16Array;

  // Cached matrices for gradient program switching
  private currentVPMatrix: Float32Array | null = null;
  private currentModelMatrix: Float32Array | null = null;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.vertices = new Float32Array(MAX_VERTICES * 2);
    this.indices = new Uint16Array(MAX_VERTICES * 3); // Triangulated indices

    this.initializeShaders();
    this.initializeBuffers();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  private initializeShaders(): void {
    this.program = this.renderer.createShaderProgram(
      'shape',
      SHAPE_VERTEX_SHADER,
      SHAPE_FRAGMENT_SHADER,
      ['a_position'],
      ['u_viewProjection', 'u_model', 'u_color']
    );

    this.gradientProgram = this.renderer.createShaderProgram(
      'shape-gradient',
      GRADIENT_VERTEX_SHADER,
      GRADIENT_FRAGMENT_SHADER,
      ['a_position'],
      [
        'u_viewProjection',
        'u_model',
        'u_gradientType',
        'u_stopCount',
        'u_bounds',
        'u_angle',
        'u_center',
        'u_radius',
        'u_opacity',
        ...Array.from({ length: MAX_GRADIENT_STOPS }, (_, i) => `u_stops[${i}]`),
        ...Array.from({ length: MAX_GRADIENT_STOPS }, (_, i) => `u_offsets[${i}]`),
      ]
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

    // Create index buffer
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices.byteLength, gl.DYNAMIC_DRAW);

    if (this.program) {
      gl.enableVertexAttribArray(this.program.attributes.a_position);
      gl.vertexAttribPointer(this.program.attributes.a_position, 2, gl.FLOAT, false, 0, 0);
    }

    this.renderer.bindVAO(null);
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  /**
   * Render all shapes in the scene graph
   */
  render(
    sceneGraph: SceneGraph,
    viewProjectionMatrix: Matrix3,
    _selectedIds: Set<string> = new Set()
  ): void {
    if (!this.program || !this.vao) return;

    const gl = this.renderer.context;

    // Set up shader program
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Set view-projection matrix
    const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
    this.currentVPMatrix = vpArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_viewProjection, false, vpArray);

    // Also set on gradient program if available
    if (this.gradientProgram) {
      this.renderer.useProgram(this.gradientProgram);
      gl.uniformMatrix3fv(this.gradientProgram.uniforms.u_viewProjection, false, vpArray);
      this.renderer.useProgram(this.program);
    }

    // Traverse and render visible shapes
    sceneGraph.traverseVisible((node) => {
      const worldTransform = sceneGraph.getWorldTransform(node.id);

      switch (node.type) {
        case 'rectangle':
          this.renderRectangle(node, worldTransform);
          break;
        case 'ellipse':
          this.renderEllipse(node, worldTransform);
          break;
        case 'polygon':
          this.renderPolygon(node, worldTransform);
          break;
        case 'path':
          this.renderPath(node, worldTransform);
          break;
      }
    });

    this.renderer.bindVAO(null);
  }

  /**
   * Render a single node (used for preview during drawing)
   */
  renderNode(node: Node, viewProjectionMatrix: Matrix3): void {
    if (!this.program || !this.vao || !node.visible) return;

    const gl = this.renderer.context;

    // Set up shader program
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Set view-projection matrix
    const vpArray = mat3.toFloat32Array(viewProjectionMatrix);
    this.currentVPMatrix = vpArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_viewProjection, false, vpArray);

    if (this.gradientProgram) {
      this.renderer.useProgram(this.gradientProgram);
      gl.uniformMatrix3fv(this.gradientProgram.uniforms.u_viewProjection, false, vpArray);
      this.renderer.useProgram(this.program);
    }

    // Create world matrix from node transform
    const worldMatrix = mat3.compose(
      node.transform.position,
      node.transform.rotation,
      node.transform.scale,
      node.transform.anchor
    );

    switch (node.type) {
      case 'rectangle':
        this.renderRectangle(node, worldMatrix);
        break;
      case 'ellipse':
        this.renderEllipse(node, worldMatrix);
        break;
      case 'polygon':
        this.renderPolygon(node, worldMatrix);
        break;
      case 'path':
        this.renderPath(node, worldMatrix);
        break;
    }

    this.renderer.bindVAO(null);
  }

  /**
   * Render fills and strokes from arrays
   */
  private renderFillsAndStrokes(
    tessellated: Float32Array,
    fills: Fill[],
    strokes: Stroke[],
    closed: boolean,
    nodeOpacity: number = 1
  ): void {
    for (const fill of fills) {
      if (fill.visible && fill.type !== 'none') {
        this.renderFill(tessellated, fill, nodeOpacity);
      }
    }
    for (const stroke of strokes) {
      if (stroke.visible && stroke.width > 0) {
        this.renderStroke(tessellated, stroke, closed, nodeOpacity);
      }
    }
  }

  /**
   * Render fills and strokes as ghosts with tint/alpha
   */
  private renderFillsAndStrokesGhost(
    tessellated: Float32Array,
    fills: Fill[],
    strokes: Stroke[],
    closed: boolean,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    for (const fill of fills) {
      if (fill.visible && fill.type !== 'none') {
        const color = this.applyTintAndAlpha(
          this.getFillColor(fill),
          colorOverride.tint,
          colorOverride.alpha
        );
        this.renderFillWithColor(tessellated, color);
      }
    }
    for (const stroke of strokes) {
      if (stroke.visible && stroke.width > 0) {
        const color = this.applyTintAndAlpha(
          this.getStrokeColor(stroke),
          colorOverride.tint,
          colorOverride.alpha
        );
        this.renderStrokeWithColor(tessellated, stroke, closed, color);
      }
    }
  }

  /**
   * Render a single rectangle
   */
  renderRectangle(node: RectangleNode, worldMatrix: Matrix3): void {
    if (!this.program) return;

    const gl = this.renderer.context;

    // Generate rectangle path
    const pathPoints = createRectanglePath(
      -node.width * node.transform.anchor.x,
      -node.height * node.transform.anchor.y,
      node.width,
      node.height,
      node.cornerRadius
    );

    // Tessellate to vertices
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, modelArray);

    this.renderFillsAndStrokes(tessellated, node.fills, node.strokes, true, node.opacity);
  }

  /**
   * Render a single ellipse
   */
  renderEllipse(node: EllipseNode, worldMatrix: Matrix3): void {
    if (!this.program) return;

    const gl = this.renderer.context;

    // Generate ellipse path
    const pathPoints = createEllipsePath(0, 0, node.radiusX, node.radiusY);

    // Tessellate to vertices with fine tolerance for smooth curves
    const tessellated = tessellatePathToVertices(pathPoints, true, ELLIPSE_TESSELLATION_TOLERANCE);

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, modelArray);

    this.renderFillsAndStrokes(tessellated, node.fills, node.strokes, true, node.opacity);
  }

  /**
   * Render a single polygon or star
   */
  renderPolygon(node: PolygonNode, worldMatrix: Matrix3): void {
    if (!this.program) return;

    const gl = this.renderer.context;

    // Generate polygon or star path
    const pathPoints =
      node.innerRadius !== undefined
        ? createStarPath(
            0,
            0,
            node.radius,
            node.innerRadius,
            node.sides,
            undefined,
            node.cornerRadius
          )
        : createPolygonPath(0, 0, node.radius, node.sides, undefined, node.cornerRadius);

    // Tessellate to vertices
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, modelArray);

    this.renderFillsAndStrokes(tessellated, node.fills, node.strokes, true, node.opacity);
  }

  /**
   * Render a path node
   */
  renderPath(node: PathNode, worldMatrix: Matrix3): void {
    if (!this.program || node.points.length < 2) return;

    const gl = this.renderer.context;

    // Apply per-vertex corner radius if any points have it
    const processed = applyCornerRadius(node.points, node.closed);

    // Tessellate path
    const tessellated = tessellatePathToVertices(
      processed,
      node.closed,
      DEFAULT_TESSELLATION_TOLERANCE
    );

    // Set model matrix
    const modelArray = mat3.toFloat32Array(worldMatrix);
    this.currentModelMatrix = modelArray;
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, modelArray);

    // Only render fills for closed paths
    const fills = node.closed ? node.fills : [];
    this.renderFillsAndStrokes(tessellated, fills, node.strokes, node.closed, node.opacity);
  }

  /**
   * Render filled polygon using earcut triangulation
   * This handles both convex and concave shapes correctly
   */
  private renderFill(vertices: Float32Array, fill: Fill, nodeOpacity: number = 1): void {
    if (fill.type === 'gradient' && fill.gradient) {
      this.renderFillGradient(vertices, fill.gradient, fill.opacity * nodeOpacity);
      return;
    }

    if (!this.program) return;

    const gl = this.renderer.context;

    // Ensure flat-color program is active
    this.renderer.useProgram(this.program);

    // Set fill color
    const color = this.getFillColor(fill, nodeOpacity);
    gl.uniform4fv(this.program.uniforms.u_color, color);

    // Upload vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);

    const numVertices = vertices.length / 2;
    if (numVertices < 3) return;

    // Use earcut for triangulation - handles both convex and concave polygons
    // earcut expects a flat array of coordinates [x0, y0, x1, y1, ...]
    const indices = earcut(vertices.subarray(0, numVertices * 2));

    if (indices.length === 0) {
      // Fallback to triangle fan if earcut fails (shouldn't happen for valid polygons)
      gl.drawArrays(gl.TRIANGLE_FAN, 0, numVertices);
      return;
    }

    // Upload indices
    const indicesArray = new Uint16Array(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);

    // Draw using indexed triangles
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Render stroke as a filled outline polygon.
   * WebGL lineWidth is capped at 1px on most browsers, so we expand the stroke
   * into a filled polygon using perpendicular offsets and earcut triangulation.
   */
  private renderStroke(
    vertices: Float32Array,
    stroke: Stroke,
    closed: boolean,
    nodeOpacity: number = 1
  ): void {
    const numVertices = vertices.length / 2;
    if (numVertices < 2) return;

    // Generate stroke outline as a filled polygon
    const outlineVertices = generateStrokeOutlineVertices(
      vertices,
      numVertices,
      stroke.width,
      closed,
      stroke.align ?? 'center'
    );
    const outlineCount = outlineVertices.length / 2;
    if (outlineCount < 3) return;

    // Use gradient shader for stroke gradient
    if (stroke.gradient) {
      this.renderFillGradient(outlineVertices, stroke.gradient, stroke.opacity * nodeOpacity);
      return;
    }

    if (!this.program) return;

    const gl = this.renderer.context;

    // Ensure flat-color program is active
    this.renderer.useProgram(this.program);

    // Set stroke color
    const color = this.getStrokeColor(stroke, nodeOpacity);
    gl.uniform4fv(this.program.uniforms.u_color, color);

    // Upload outline vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outlineVertices);

    // Triangulate the outline polygon
    const indices = earcut(outlineVertices);
    if (indices.length === 0) return;

    // Upload indices and draw
    const indicesArray = new Uint16Array(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);

    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  // --------------------------------------------------------------------------
  // Gradient Rendering
  // --------------------------------------------------------------------------

  /**
   * Render vertices with a gradient using the gradient shader program.
   * Triangulates, uploads, sets gradient uniforms, and draws.
   */
  private renderFillGradient(vertices: Float32Array, gradient: Gradient, opacity: number): void {
    if (!this.gradientProgram) return;

    const gl = this.renderer.context;
    const numVertices = vertices.length / 2;
    if (numVertices < 3) return;

    // Switch to gradient program
    this.renderer.useProgram(this.gradientProgram);

    // Re-set viewProjection and model on the gradient program
    if (this.currentModelMatrix) {
      gl.uniformMatrix3fv(this.gradientProgram.uniforms.u_model, false, this.currentModelMatrix);
    }

    // Upload gradient uniforms
    this.setGradientUniforms(gradient, computeBounds(vertices), opacity);

    // Upload vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);

    // Triangulate
    const indices = earcut(vertices.subarray(0, numVertices * 2));
    if (indices.length === 0) {
      gl.drawArrays(gl.TRIANGLE_FAN, 0, numVertices);
      return;
    }

    const indicesArray = new Uint16Array(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);

    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    // Switch back to flat program for subsequent rendering
    if (this.program) {
      this.renderer.useProgram(this.program);
    }
  }

  /**
   * Set all gradient-related uniforms on the gradient shader program.
   */
  private setGradientUniforms(
    gradient: Gradient,
    bounds: [number, number, number, number],
    opacity: number
  ): void {
    if (!this.gradientProgram) return;

    const gl = this.renderer.context;
    const u = this.gradientProgram.uniforms;

    // Gradient type: 0=linear, 1=radial, 2=conic
    const typeMap = { linear: 0, radial: 1, conic: 2 } as const;
    gl.uniform1i(u['u_gradientType'], typeMap[gradient.type] ?? 0);

    // Normalize stops
    const stops = normalizeGradientStops(gradient.stops);
    const stopCount = Math.min(stops.length, MAX_GRADIENT_STOPS);
    gl.uniform1i(u['u_stopCount'], stopCount);

    // Upload individual stop colors and offsets
    for (let i = 0; i < stopCount; i++) {
      const s = stops[i];
      const stopUniform = u[`u_stops[${i}]`];
      const offsetUniform = u[`u_offsets[${i}]`];
      if (stopUniform) {
        gl.uniform4fv(
          stopUniform,
          new Float32Array([s.color.r / 255, s.color.g / 255, s.color.b / 255, s.color.a])
        );
      }
      if (offsetUniform) {
        gl.uniform1f(offsetUniform, s.offset);
      }
    }

    // Bounds
    gl.uniform4fv(u['u_bounds'], new Float32Array(bounds));

    // Gradient-specific params
    gl.uniform1f(u['u_angle'], gradient.angle ?? 0);
    gl.uniform2fv(
      u['u_center'],
      new Float32Array([gradient.center?.x ?? 0.5, gradient.center?.y ?? 0.5])
    );
    gl.uniform1f(u['u_radius'], gradient.radius ?? 0.5);
    gl.uniform1f(u['u_opacity'], opacity);
  }

  // --------------------------------------------------------------------------
  // Ghost Rendering (for onion skinning)
  // --------------------------------------------------------------------------

  /**
   * Render a single node as a ghost frame with tint color and alpha override.
   * Used by OnionSkinRenderer for onion skinning.
   */
  renderGhostNode(
    node: Node,
    viewProjectionMatrix: Matrix3,
    alpha: number,
    tintColor: [number, number, number]
  ): void {
    if (!this.program || !this.vao || !node.visible) return;

    const gl = this.renderer.context;

    // Set up shader program
    this.renderer.useProgram(this.program);
    this.renderer.bindVAO(this.vao);

    // Set view-projection matrix
    gl.uniformMatrix3fv(
      this.program.uniforms.u_viewProjection,
      false,
      mat3.toFloat32Array(viewProjectionMatrix)
    );

    // Create world matrix from node transform
    const worldMatrix = mat3.compose(
      node.transform.position,
      node.transform.rotation,
      node.transform.scale,
      node.transform.anchor
    );

    const colorOverride = { tint: tintColor, alpha };

    switch (node.type) {
      case 'rectangle':
        this.renderRectangleWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'ellipse':
        this.renderEllipseWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'polygon':
        this.renderPolygonWithOverride(node, worldMatrix, colorOverride);
        break;
      case 'path':
        this.renderPathWithOverride(node, worldMatrix, colorOverride);
        break;
    }

    this.renderer.bindVAO(null);
  }

  /**
   * Apply tint color (50% mix) and multiply alpha.
   */
  applyTintAndAlpha(
    color: Float32Array,
    tint: [number, number, number],
    alpha: number
  ): Float32Array {
    const mix = 0.5;
    return new Float32Array([
      color[0] * (1 - mix) + tint[0] * mix,
      color[1] * (1 - mix) + tint[1] * mix,
      color[2] * (1 - mix) + tint[2] * mix,
      color[3] * alpha,
    ]);
  }

  private renderRectangleWithOverride(
    node: RectangleNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.program) return;
    const gl = this.renderer.context;
    const pathPoints = createRectanglePath(
      -node.width * node.transform.anchor.x,
      -node.height * node.transform.anchor.y,
      node.width,
      node.height,
      node.cornerRadius
    );
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));
    this.renderFillsAndStrokesGhost(tessellated, node.fills, node.strokes, true, colorOverride);
  }

  private renderEllipseWithOverride(
    node: EllipseNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.program) return;
    const gl = this.renderer.context;
    const pathPoints = createEllipsePath(0, 0, node.radiusX, node.radiusY);
    const tessellated = tessellatePathToVertices(pathPoints, true, ELLIPSE_TESSELLATION_TOLERANCE);
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));
    this.renderFillsAndStrokesGhost(tessellated, node.fills, node.strokes, true, colorOverride);
  }

  private renderPolygonWithOverride(
    node: PolygonNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.program) return;
    const gl = this.renderer.context;
    const pathPoints =
      node.innerRadius !== undefined
        ? createStarPath(
            0,
            0,
            node.radius,
            node.innerRadius,
            node.sides,
            undefined,
            node.cornerRadius
          )
        : createPolygonPath(0, 0, node.radius, node.sides, undefined, node.cornerRadius);
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));
    this.renderFillsAndStrokesGhost(tessellated, node.fills, node.strokes, true, colorOverride);
  }

  private renderPathWithOverride(
    node: PathNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.program || node.points.length < 2) return;
    const gl = this.renderer.context;
    const processed = applyCornerRadius(node.points, node.closed);
    const tessellated = tessellatePathToVertices(
      processed,
      node.closed,
      DEFAULT_TESSELLATION_TOLERANCE
    );
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));
    const fills = node.closed ? node.fills : [];
    this.renderFillsAndStrokesGhost(tessellated, fills, node.strokes, node.closed, colorOverride);
  }

  /**
   * Render fill with explicit color (bypassing getFillColor)
   */
  private renderFillWithColor(vertices: Float32Array, color: Float32Array): void {
    if (!this.program) return;
    const gl = this.renderer.context;
    gl.uniform4fv(this.program.uniforms.u_color, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    const numVertices = vertices.length / 2;
    if (numVertices < 3) return;
    const indices = earcut(vertices.subarray(0, numVertices * 2));
    if (indices.length === 0) {
      gl.drawArrays(gl.TRIANGLE_FAN, 0, numVertices);
      return;
    }
    const indicesArray = new Uint16Array(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Render stroke with explicit color (bypassing getStrokeColor)
   */
  private renderStrokeWithColor(
    vertices: Float32Array,
    stroke: Stroke,
    closed: boolean,
    color: Float32Array
  ): void {
    if (!this.program) return;
    const gl = this.renderer.context;
    const numVertices = vertices.length / 2;
    if (numVertices < 2) return;
    const outlineVertices = generateStrokeOutlineVertices(
      vertices,
      numVertices,
      stroke.width,
      closed,
      stroke.align ?? 'center'
    );
    const outlineCount = outlineVertices.length / 2;
    if (outlineCount < 3) return;
    gl.uniform4fv(this.program.uniforms.u_color, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outlineVertices);
    const indices = earcut(outlineVertices);
    if (indices.length === 0) return;
    const indicesArray = new Uint16Array(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indicesArray);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  }

  // --------------------------------------------------------------------------
  // Color Utilities
  // --------------------------------------------------------------------------

  private getFillColor(fill: Fill, nodeOpacity: number = 1): Float32Array {
    if (fill.type === 'solid' && fill.color) {
      return this.colorToFloat32Array(fill.color, fill.opacity, nodeOpacity);
    }
    if (fill.type === 'gradient' && fill.gradient && fill.gradient.stops.length > 0) {
      // For flat-color contexts (e.g. ghost rendering), use first stop color
      return this.colorToFloat32Array(fill.gradient.stops[0].color, fill.opacity, nodeOpacity);
    }
    return new Float32Array([0.5, 0.5, 0.5, fill.opacity * nodeOpacity]);
  }

  private getStrokeColor(stroke: Stroke, nodeOpacity: number = 1): Float32Array {
    return this.colorToFloat32Array(stroke.color, stroke.opacity, nodeOpacity);
  }

  private colorToFloat32Array(
    color: Color,
    opacity: number,
    nodeOpacity: number = 1
  ): Float32Array {
    return new Float32Array([
      color.r / 255,
      color.g / 255,
      color.b / 255,
      color.a * opacity * nodeOpacity,
    ]);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  dispose(): void {
    const gl = this.renderer.context;

    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer);
      this.vertexBuffer = null;
    }
    if (this.indexBuffer) {
      gl.deleteBuffer(this.indexBuffer);
      this.indexBuffer = null;
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
  }
}
