/**
 * 2D Camera for Quar Animator
 * Handles zoom, pan, and coordinate transformations
 */

import type { Vector2, Matrix3, Rect } from '@quar/types';
import { vec2, mat3, clamp } from './math';

// ============================================================================
// Camera Configuration
// ============================================================================

export interface CameraConfig {
  minZoom: number;
  maxZoom: number;
  zoomSensitivity: number;
  panSensitivity: number;
}

const DEFAULT_CONFIG: CameraConfig = {
  minZoom: 0.1,
  maxZoom: 32,
  zoomSensitivity: 0.001,
  panSensitivity: 1,
};

// ============================================================================
// Camera Events
// ============================================================================

export type CameraEventType = 'change' | 'zoomChange' | 'panChange';

type CameraEventCallback = () => void;

// ============================================================================
// Camera Class
// ============================================================================

export class Camera {
  private _position: Vector2 = { x: 0, y: 0 };
  private _zoom: number = 1;
  private _rotation: number = 0; // Degrees

  private _viewportWidth: number = 800;
  private _viewportHeight: number = 600;

  private config: CameraConfig;
  private listeners: Map<CameraEventType, Set<CameraEventCallback>> = new Map();

  // Cached matrices
  private _viewMatrix: Matrix3 | null = null;
  private _projectionMatrix: Matrix3 | null = null;
  private _viewProjectionMatrix: Matrix3 | null = null;
  private _inverseViewProjectionMatrix: Matrix3 | null = null;

  constructor(config: Partial<CameraConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Properties
  // --------------------------------------------------------------------------

  get position(): Vector2 {
    return { ...this._position };
  }

  set position(value: Vector2) {
    this._position = { ...value };
    this.invalidateMatrices();
    this.emit('panChange');
    this.emit('change');
  }

  get zoom(): number {
    return this._zoom;
  }

  set zoom(value: number) {
    this._zoom = clamp(value, this.config.minZoom, this.config.maxZoom);
    this.invalidateMatrices();
    this.emit('zoomChange');
    this.emit('change');
  }

  get rotation(): number {
    return this._rotation;
  }

  set rotation(value: number) {
    this._rotation = value;
    this.invalidateMatrices();
    this.emit('change');
  }

  get viewportWidth(): number {
    return this._viewportWidth;
  }

  get viewportHeight(): number {
    return this._viewportHeight;
  }

  // --------------------------------------------------------------------------
  // Viewport
  // --------------------------------------------------------------------------

  setViewport(width: number, height: number): void {
    this._viewportWidth = width;
    this._viewportHeight = height;
    this.invalidateMatrices();
    this.emit('change');
  }

  // --------------------------------------------------------------------------
  // Coordinate Transformation
  // --------------------------------------------------------------------------

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenPoint: Vector2): Vector2 {
    const matrix = this.getInverseViewProjectionMatrix();
    if (!matrix) return screenPoint;

    // Normalize screen coordinates to -1..1
    const normalized: Vector2 = {
      x: (screenPoint.x / this._viewportWidth) * 2 - 1,
      y: -((screenPoint.y / this._viewportHeight) * 2 - 1), // Flip Y
    };

    return mat3.transformPoint(matrix, normalized);
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldPoint: Vector2): Vector2 {
    const matrix = this.getViewProjectionMatrix();

    const normalized = mat3.transformPoint(matrix, worldPoint);

    return {
      x: ((normalized.x + 1) / 2) * this._viewportWidth,
      y: ((1 - normalized.y) / 2) * this._viewportHeight, // Flip Y
    };
  }

  // --------------------------------------------------------------------------
  // Camera Movement
  // --------------------------------------------------------------------------

  /**
   * Pan the camera by a screen-space delta
   */
  pan(screenDelta: Vector2): void {
    const worldDelta = {
      x: -screenDelta.x / this._zoom,
      y: screenDelta.y / this._zoom,
    };

    // Apply rotation to delta if camera is rotated
    if (this._rotation !== 0) {
      const rad = (this._rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotated = {
        x: worldDelta.x * cos - worldDelta.y * sin,
        y: worldDelta.x * sin + worldDelta.y * cos,
      };
      this.position = vec2.add(this._position, rotated);
    } else {
      this.position = vec2.add(this._position, worldDelta);
    }
  }

  /**
   * Zoom the camera at a specific screen point
   * This keeps the world point under the cursor stationary
   */
  zoomAt(screenPoint: Vector2, zoomDelta: number): void {
    const worldBefore = this.screenToWorld(screenPoint);

    const newZoom = this._zoom * (1 + zoomDelta * this.config.zoomSensitivity);
    this._zoom = clamp(newZoom, this.config.minZoom, this.config.maxZoom);
    this.invalidateMatrices();

    const worldAfter = this.screenToWorld(screenPoint);

    // Adjust position to keep worldBefore at the same screen position
    this._position = vec2.add(this._position, vec2.subtract(worldBefore, worldAfter));
    this.invalidateMatrices();

    this.emit('zoomChange');
    this.emit('change');
  }

  /**
   * Zoom to a specific level
   */
  zoomTo(targetZoom: number, screenCenter?: Vector2): void {
    const center = screenCenter ?? {
      x: this._viewportWidth / 2,
      y: this._viewportHeight / 2,
    };

    const worldBefore = this.screenToWorld(center);
    this._zoom = clamp(targetZoom, this.config.minZoom, this.config.maxZoom);
    this.invalidateMatrices();
    const worldAfter = this.screenToWorld(center);

    this._position = vec2.add(this._position, vec2.subtract(worldBefore, worldAfter));
    this.invalidateMatrices();

    this.emit('zoomChange');
    this.emit('change');
  }

  /**
   * Fit the camera to show the given bounds
   */
  fitBounds(bounds: Rect, padding: number = 50): void {
    const viewWidth = this._viewportWidth - padding * 2;
    const viewHeight = this._viewportHeight - padding * 2;

    const scaleX = viewWidth / bounds.width;
    const scaleY = viewHeight / bounds.height;

    this._zoom = clamp(Math.min(scaleX, scaleY), this.config.minZoom, this.config.maxZoom);

    this._position = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };

    this.invalidateMatrices();
    this.emit('zoomChange');
    this.emit('panChange');
    this.emit('change');
  }

  /**
   * Reset camera to default state
   */
  reset(): void {
    this._position = { x: 0, y: 0 };
    this._zoom = 1;
    this._rotation = 0;
    this.invalidateMatrices();
    this.emit('zoomChange');
    this.emit('panChange');
    this.emit('change');
  }

  // --------------------------------------------------------------------------
  // Matrix Getters
  // --------------------------------------------------------------------------

  getViewMatrix(): Matrix3 {
    if (!this._viewMatrix) {
      // View matrix: translate to camera position, then rotate
      let m = mat3.identity();
      m = mat3.translate(m, -this._position.x, -this._position.y);

      if (this._rotation !== 0) {
        const rad = (-this._rotation * Math.PI) / 180;
        m = mat3.rotate(m, rad);
      }

      this._viewMatrix = m;
    }
    return this._viewMatrix;
  }

  getProjectionMatrix(): Matrix3 {
    if (!this._projectionMatrix) {
      // Orthographic projection with zoom
      const halfWidth = this._viewportWidth / 2 / this._zoom;
      const halfHeight = this._viewportHeight / 2 / this._zoom;

      this._projectionMatrix = {
        a: 1 / halfWidth,
        b: 0,
        c: 0,
        d: 1 / halfHeight,
        tx: 0,
        ty: 0,
      };
    }
    return this._projectionMatrix;
  }

  getViewProjectionMatrix(): Matrix3 {
    if (!this._viewProjectionMatrix) {
      this._viewProjectionMatrix = mat3.multiply(this.getProjectionMatrix(), this.getViewMatrix());
    }
    return this._viewProjectionMatrix;
  }

  getInverseViewProjectionMatrix(): Matrix3 | null {
    if (!this._inverseViewProjectionMatrix) {
      this._inverseViewProjectionMatrix = mat3.invert(this.getViewProjectionMatrix());
    }
    return this._inverseViewProjectionMatrix;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Get the visible world bounds
   */
  getVisibleBounds(): Rect {
    const topLeft = this.screenToWorld({ x: 0, y: 0 });
    const bottomRight = this.screenToWorld({
      x: this._viewportWidth,
      y: this._viewportHeight,
    });

    // Ensure positive width and height (world Y may be flipped)
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Get zoom as percentage string
   */
  getZoomPercentage(): string {
    return `${Math.round(this._zoom * 100)}%`;
  }

  private invalidateMatrices(): void {
    this._viewMatrix = null;
    this._projectionMatrix = null;
    this._viewProjectionMatrix = null;
    this._inverseViewProjectionMatrix = null;
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  on(type: CameraEventType, callback: CameraEventCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  private emit(type: CameraEventType): void {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      for (const callback of callbacks) {
        callback();
      }
    }
  }
}
