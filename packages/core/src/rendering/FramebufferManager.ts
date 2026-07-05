/**
 * FramebufferManager - Manages off-screen render targets with pooling
 *
 * Provides acquire/release semantics for WebGL framebuffers to avoid
 * repeated creation/deletion during multi-pass effect rendering.
 */

export interface FramebufferEntry {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

const MAX_POOL_SIZE = 8;

export class FramebufferManager {
  private gl: WebGL2RenderingContext;
  private pool: Map<string, FramebufferEntry[]> = new Map();
  private active: Set<FramebufferEntry> = new Set();
  /** Size key of the most recent acquire, used to detect a size change. */
  private lastKey: string | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  private sizeKey(width: number, height: number): string {
    return `${width}x${height}`;
  }

  /**
   * Acquire a framebuffer of the given size from the pool, or create a new one.
   */
  acquire(width: number, height: number): FramebufferEntry {
    const key = this.sizeKey(width, height);

    // When the requested size changes, purge pooled entries of every other size.
    // EffectRenderer acquires at exactly one (canvasWidth, canvasHeight) per
    // frame, so a size transition is a clean signal: without this, a canvas
    // resize leaves the pool full of dead-size FBOs, the global cap forces every
    // new-size release() to destroy its entry, and we alloc/free full-canvas GPU
    // textures every frame indefinitely.
    if (this.lastKey !== null && key !== this.lastKey) {
      const staleKeys: string[] = [];
      for (const [bucketKey, bucket] of this.pool) {
        if (bucketKey === key) continue;
        for (const entry of bucket) this.destroyEntry(entry);
        staleKeys.push(bucketKey);
      }
      for (const k of staleKeys) this.pool.delete(k);
    }
    this.lastKey = key;

    const bucket = this.pool.get(key);

    if (bucket && bucket.length > 0) {
      const entry = bucket.pop()!;
      this.active.add(entry);
      // Clear the FBO
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, entry.fbo);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      return entry;
    }

    // Create new
    const entry = this.createFramebuffer(width, height);
    this.active.add(entry);
    return entry;
  }

  /**
   * Release a framebuffer back to the pool.
   */
  release(entry: FramebufferEntry): void {
    this.active.delete(entry);

    const key = this.sizeKey(entry.width, entry.height);
    let bucket = this.pool.get(key);
    if (!bucket) {
      bucket = [];
      this.pool.set(key, bucket);
    }

    // Limit pool size to prevent memory bloat
    if (this.getTotalPoolSize() >= MAX_POOL_SIZE) {
      this.destroyEntry(entry);
      return;
    }

    bucket.push(entry);
  }

  /**
   * Dispose all framebuffers (both pooled and active).
   */
  dispose(): void {
    for (const entry of this.active) {
      this.destroyEntry(entry);
    }
    this.active.clear();

    for (const [, bucket] of this.pool) {
      for (const entry of bucket) {
        this.destroyEntry(entry);
      }
    }
    this.pool.clear();
  }

  private createFramebuffer(width: number, height: number): FramebufferEntry {
    const gl = this.gl;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn('Framebuffer incomplete:', status);
    }

    // Clear
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Restore default
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { fbo, texture, width, height };
  }

  private destroyEntry(entry: FramebufferEntry): void {
    const gl = this.gl;
    gl.deleteFramebuffer(entry.fbo);
    gl.deleteTexture(entry.texture);
  }

  private getTotalPoolSize(): number {
    let total = 0;
    for (const [, bucket] of this.pool) {
      total += bucket.length;
    }
    return total;
  }
}
