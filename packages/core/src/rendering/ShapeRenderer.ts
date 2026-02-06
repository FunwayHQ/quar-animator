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
} from '@quar/types';
import { WebGLRenderer, type ShaderProgram } from './WebGLRenderer';
import { SceneGraph } from '../SceneGraph';
import { mat3 } from '../math';
import {
  tessellatePathToVertices,
  createRectanglePath,
  createEllipsePath,
  createPolygonPath,
  createStarPath,
  generateStrokeOutlineVertices,
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
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;

  // Pre-allocated arrays to avoid GC
  private vertices: Float32Array;
  private indices: Uint16Array;

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
    gl.uniformMatrix3fv(
      this.program.uniforms.u_viewProjection,
      false,
      mat3.toFloat32Array(viewProjectionMatrix)
    );

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
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));

    // Render fill
    if (node.fill && node.fill.type !== 'none') {
      this.renderFill(tessellated, node.fill);
    }

    // Render stroke
    if (node.stroke && node.stroke.width > 0) {
      this.renderStroke(tessellated, node.stroke, true);
    }
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
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));

    // Render fill
    if (node.fill && node.fill.type !== 'none') {
      this.renderFill(tessellated, node.fill);
    }

    // Render stroke
    if (node.stroke && node.stroke.width > 0) {
      this.renderStroke(tessellated, node.stroke, true);
    }
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
        ? createStarPath(0, 0, node.radius, node.innerRadius, node.sides)
        : createPolygonPath(0, 0, node.radius, node.sides);

    // Tessellate to vertices
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);

    // Set model matrix
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));

    // Render fill - earcut handles both convex and concave shapes
    if (node.fill && node.fill.type !== 'none') {
      this.renderFill(tessellated, node.fill);
    }

    // Render stroke
    if (node.stroke && node.stroke.width > 0) {
      this.renderStroke(tessellated, node.stroke, true);
    }
  }

  /**
   * Render a path node
   */
  renderPath(node: PathNode, worldMatrix: Matrix3): void {
    if (!this.program || node.points.length < 2) return;

    const gl = this.renderer.context;

    // Tessellate path
    const tessellated = tessellatePathToVertices(
      node.points,
      node.closed,
      DEFAULT_TESSELLATION_TOLERANCE
    );

    // Set model matrix
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));

    // Render fill (only for closed paths)
    if (node.closed && node.fill && node.fill.type !== 'none') {
      this.renderFill(tessellated, node.fill);
    }

    // Render stroke
    if (node.stroke && node.stroke.width > 0) {
      this.renderStroke(tessellated, node.stroke, node.closed);
    }
  }

  /**
   * Render filled polygon using earcut triangulation
   * This handles both convex and concave shapes correctly
   */
  private renderFill(vertices: Float32Array, fill: Fill): void {
    if (!this.program) return;

    const gl = this.renderer.context;

    // Set fill color
    const color = this.getFillColor(fill);
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
  private renderStroke(vertices: Float32Array, stroke: Stroke, closed: boolean): void {
    if (!this.program) return;

    const gl = this.renderer.context;
    const numVertices = vertices.length / 2;
    if (numVertices < 2) return;

    // Generate stroke outline as a filled polygon
    const outlineVertices = generateStrokeOutlineVertices(
      vertices,
      numVertices,
      stroke.width,
      closed
    );
    const outlineCount = outlineVertices.length / 2;
    if (outlineCount < 3) return;

    // Set stroke color
    const color = this.getStrokeColor(stroke);
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
    if (node.fill && node.fill.type !== 'none') {
      const color = this.applyTintAndAlpha(
        this.getFillColor(node.fill),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderFillWithColor(tessellated, color);
    }
    if (node.stroke && node.stroke.width > 0) {
      const color = this.applyTintAndAlpha(
        this.getStrokeColor(node.stroke),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderStrokeWithColor(tessellated, node.stroke, true, color);
    }
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
    if (node.fill && node.fill.type !== 'none') {
      const color = this.applyTintAndAlpha(
        this.getFillColor(node.fill),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderFillWithColor(tessellated, color);
    }
    if (node.stroke && node.stroke.width > 0) {
      const color = this.applyTintAndAlpha(
        this.getStrokeColor(node.stroke),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderStrokeWithColor(tessellated, node.stroke, true, color);
    }
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
        ? createStarPath(0, 0, node.radius, node.innerRadius, node.sides)
        : createPolygonPath(0, 0, node.radius, node.sides);
    const tessellated = tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE);
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));
    if (node.fill && node.fill.type !== 'none') {
      const color = this.applyTintAndAlpha(
        this.getFillColor(node.fill),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderFillWithColor(tessellated, color);
    }
    if (node.stroke && node.stroke.width > 0) {
      const color = this.applyTintAndAlpha(
        this.getStrokeColor(node.stroke),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderStrokeWithColor(tessellated, node.stroke, true, color);
    }
  }

  private renderPathWithOverride(
    node: PathNode,
    worldMatrix: Matrix3,
    colorOverride: { tint: [number, number, number]; alpha: number }
  ): void {
    if (!this.program || node.points.length < 2) return;
    const gl = this.renderer.context;
    const tessellated = tessellatePathToVertices(
      node.points,
      node.closed,
      DEFAULT_TESSELLATION_TOLERANCE
    );
    gl.uniformMatrix3fv(this.program.uniforms.u_model, false, mat3.toFloat32Array(worldMatrix));
    if (node.closed && node.fill && node.fill.type !== 'none') {
      const color = this.applyTintAndAlpha(
        this.getFillColor(node.fill),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderFillWithColor(tessellated, color);
    }
    if (node.stroke && node.stroke.width > 0) {
      const color = this.applyTintAndAlpha(
        this.getStrokeColor(node.stroke),
        colorOverride.tint,
        colorOverride.alpha
      );
      this.renderStrokeWithColor(tessellated, node.stroke, node.closed, color);
    }
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
      closed
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

  private getFillColor(fill: Fill): Float32Array {
    if (fill.type === 'solid' && fill.color) {
      return this.colorToFloat32Array(fill.color, fill.opacity);
    }
    // TODO: Support gradient fills
    return new Float32Array([0.5, 0.5, 0.5, fill.opacity]);
  }

  private getStrokeColor(stroke: Stroke): Float32Array {
    return this.colorToFloat32Array(stroke.color, stroke.opacity);
  }

  private colorToFloat32Array(color: Color, opacity: number): Float32Array {
    return new Float32Array([color.r / 255, color.g / 255, color.b / 255, color.a * opacity]);
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
