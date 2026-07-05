/**
 * Tests for FramebufferManager — pooling and stale-size eviction (F036)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FramebufferManager } from './FramebufferManager';
import { createMockWebGL2Context } from '../test/setup';

describe('FramebufferManager', () => {
  let gl: WebGL2RenderingContext;
  let manager: FramebufferManager;

  beforeEach(() => {
    gl = createMockWebGL2Context();
    manager = new FramebufferManager(gl);
  });

  it('reuses a pooled framebuffer of the same size instead of creating a new one', () => {
    const a = manager.acquire(200, 200);
    manager.release(a);
    const b = manager.acquire(200, 200);

    // Only one texture/framebuffer was created across both acquires.
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(1);
    expect(b).toBe(a); // same pooled entry
    manager.release(b);
  });

  it('destroys stale-size pooled entries when the requested size changes (F036)', () => {
    // Populate the 100x100 bucket.
    const small = manager.acquire(100, 100);
    manager.release(small);

    // Acquire a different size — the 100x100 entry must be freed.
    manager.acquire(200, 200);

    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(small.fbo);
    expect(gl.deleteTexture).toHaveBeenCalledWith(small.texture);
  });

  it('does not churn: a stable size reuses the pool across frames after a resize', () => {
    // A frame at the old size.
    manager.release(manager.acquire(100, 100));
    // Resize: frame at the new size (purges the 100x100 bucket, creates one).
    manager.release(manager.acquire(300, 300));

    const createdAfterResize = (gl.createTexture as any).mock.calls.length;

    // Two more frames at the stable new size must reuse the pooled entry.
    manager.release(manager.acquire(300, 300));
    manager.release(manager.acquire(300, 300));

    expect((gl.createTexture as any).mock.calls.length).toBe(createdAfterResize);
  });

  it('dispose destroys all pooled and active entries', () => {
    const active = manager.acquire(128, 128);
    const pooled = manager.acquire(128, 128);
    manager.release(pooled);

    manager.dispose();

    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(active.fbo);
    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(pooled.fbo);
  });
});
