/**
 * Tests for FramebufferManager — pooling sizes side by side, within a budget
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

  it('keeps sizes side by side: effects alternating between them reuse their own', () => {
    for (let frame = 0; frame < 3; frame++) {
      manager.release(manager.acquire(96, 64));
      manager.release(manager.acquire(384, 384));
      manager.release(manager.acquire(48, 32));
    }
    expect(gl.createTexture).toHaveBeenCalledTimes(3);
    expect(gl.deleteTexture).not.toHaveBeenCalled();
  });

  it('frees the longest released past its budget, as after a resize (F036)', () => {
    // 64 MB each: the fourth takes the pool past 192 MB
    const sizes = [4096, 4095, 4094, 4093];
    const entries = sizes.map((side) => manager.acquire(side, 4096));
    entries.forEach((entry) => manager.release(entry));

    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteTexture).toHaveBeenCalledWith(entries[0]!.texture);
    // The rest are still there to reuse
    expect(manager.acquire(4093, 4096)).toBe(entries[3]);
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
