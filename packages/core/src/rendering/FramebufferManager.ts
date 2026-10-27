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

/**
 * How much the pool keeps, in bytes: past it, the framebuffers released
 * longest ago go first. Effects draw in framebuffers the size of what they
 * reach, many sizes a frame, so the pool keeps sizes side by side; one the
 * canvas no longer uses (after a resize) ages out the same way.
 */
const POOL_BYTES = 192 * 1024 * 1024;

const bytesOf = (entry: FramebufferEntry) => entry.width * entry.height * 4;

export class FramebufferManager {
  private gl: WebGL2RenderingContext;
  private pool: Map<string, FramebufferEntry[]> = new Map();
  private active: Set<FramebufferEntry> = new Set();
  /** The pooled entries, the longest released first. */
  private order: FramebufferEntry[] = [];
  private pooledBytes = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  private sizeKey(width: number, height: number): string {
    return `${width}x${height}`;
  }

  acquire(width: number, height: number): FramebufferEntry {
    const pooled = this.pool.get(this.sizeKey(width, height))?.pop();
    if (pooled) {
      this.order.splice(this.order.indexOf(pooled), 1);
      this.pooledBytes -= bytesOf(pooled);
      this.active.add(pooled);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, pooled.fbo);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      return pooled;
    }

    const entry = this.createFramebuffer(width, height);
    this.active.add(entry);
    return entry;
  }

  release(entry: FramebufferEntry): void {
    this.active.delete(entry);

    const key = this.sizeKey(entry.width, entry.height);
    let bucket = this.pool.get(key);
    if (!bucket) {
      bucket = [];
      this.pool.set(key, bucket);
    }
    bucket.push(entry);
    this.order.push(entry);
    this.pooledBytes += bytesOf(entry);

    while (this.pooledBytes > POOL_BYTES) {
      const oldest = this.order.shift();
      if (!oldest) break;
      const oldBucket = this.pool.get(this.sizeKey(oldest.width, oldest.height));
      oldBucket?.splice(oldBucket.indexOf(oldest), 1);
      this.pooledBytes -= bytesOf(oldest);
      this.destroyEntry(oldest);
    }
  }

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
    this.order = [];
    this.pooledBytes = 0;
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
}
