import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Effect } from '@quar/types';
import type { WebGLRenderer } from './WebGLRenderer';
import {
  EffectRenderer,
  blurDownsample,
  effectAtScale,
  effectRegion,
  effectScaleOf,
} from './EffectRenderer';
import { createMockWebGL2Context } from '../test/setup';

function createEffectRenderer() {
  const gl = createMockWebGL2Context() as WebGL2RenderingContext & {
    isEnabled: ReturnType<typeof vi.fn>;
    blendFuncSeparate: ReturnType<typeof vi.fn>;
    activeTexture: ReturnType<typeof vi.fn>;
    readPixels: ReturnType<typeof vi.fn>;
    texSubImage2D: ReturnType<typeof vi.fn>;
    uniform2f: ReturnType<typeof vi.fn>;
    uniform4f: ReturnType<typeof vi.fn>;
    blitFramebuffer: ReturnType<typeof vi.fn>;
    copyTexSubImage2D: ReturnType<typeof vi.fn>;
    getContextAttributes: ReturnType<typeof vi.fn>;
    SCISSOR_TEST: number;
    TEXTURE0: number;
    TEXTURE1: number;
    READ_FRAMEBUFFER: number;
    DRAW_FRAMEBUFFER: number;
    NEAREST: number;
    ONE: number;
  };
  gl.SCISSOR_TEST = 0x0c11;
  gl.TEXTURE0 = 0x84c0;
  gl.TEXTURE1 = 0x84c1;
  gl.READ_FRAMEBUFFER = 0x8ca8;
  gl.DRAW_FRAMEBUFFER = 0x8ca9;
  gl.NEAREST = 0x2600;
  gl.ONE = 1;
  gl.isEnabled = vi.fn().mockReturnValue(false);
  gl.blendFuncSeparate = vi.fn();
  gl.activeTexture = vi.fn();
  gl.readPixels = vi.fn();
  gl.texSubImage2D = vi.fn();
  gl.uniform2f = vi.fn();
  gl.uniform4f = vi.fn();
  gl.blitFramebuffer = vi.fn();
  gl.copyTexSubImage2D = vi.fn();
  gl.getContextAttributes = vi.fn().mockReturnValue({ alpha: true });
  Object.assign(gl, { RGB8: 0x8051, RGB: 0x1907 });

  const renderer = {
    context: gl,
    createShaderProgram: vi.fn(() => ({ program: {} as WebGLProgram, uniforms: {} })),
    useProgram: vi.fn(),
    bindVAO: vi.fn(),
  } as unknown as WebGLRenderer;

  return { effectRenderer: new EffectRenderer(renderer), gl, renderer };
}

function dropShadow(visible = true): Effect {
  return {
    id: 'drop',
    type: 'drop-shadow',
    visible,
    color: { r: 0, g: 0, b: 0, a: 1 },
    offsetX: 2,
    offsetY: 3,
    blur: 4,
    spread: 0,
    opacity: 0.5,
  };
}

function layerBlur(visible = true): Effect {
  return { id: 'blur', type: 'layer-blur', visible, radius: 6 };
}

function innerShadow(visible = true): Effect {
  return {
    id: 'inner',
    type: 'inner-shadow',
    visible,
    color: { r: 0, g: 0, b: 0, a: 1 },
    offsetX: 1,
    offsetY: 1,
    blur: 2,
    spread: 0,
    opacity: 0.25,
  };
}

describe('EffectRenderer', () => {
  let effectRenderer: EffectRenderer;
  let gl: WebGL2RenderingContext & {
    isEnabled: ReturnType<typeof vi.fn>;
    blendFuncSeparate: ReturnType<typeof vi.fn>;
    activeTexture: ReturnType<typeof vi.fn>;
    readPixels: ReturnType<typeof vi.fn>;
    texSubImage2D: ReturnType<typeof vi.fn>;
    uniform2f: ReturnType<typeof vi.fn>;
    uniform4f: ReturnType<typeof vi.fn>;
    blitFramebuffer: ReturnType<typeof vi.fn>;
    copyTexSubImage2D: ReturnType<typeof vi.fn>;
    getContextAttributes: ReturnType<typeof vi.fn>;
    SCISSOR_TEST: number;
    TEXTURE0: number;
    TEXTURE1: number;
    READ_FRAMEBUFFER: number;
    DRAW_FRAMEBUFFER: number;
    NEAREST: number;
    ONE: number;
  };
  let renderer: WebGLRenderer;

  beforeEach(() => {
    ({ effectRenderer, gl, renderer } = createEffectRenderer());
  });

  describe('needsMultiPass', () => {
    it('uses the fast path for normal blend mode without visible effects', () => {
      expect(effectRenderer.needsMultiPass(undefined, 'normal')).toBe(false);
      expect(effectRenderer.needsMultiPass([dropShadow(false)], 'normal')).toBe(false);
    });

    it('uses multi-pass rendering for visible effects or a non-normal blend mode', () => {
      expect(effectRenderer.needsMultiPass([layerBlur()], 'normal')).toBe(true);
      expect(effectRenderer.needsMultiPass(undefined, 'multiply')).toBe(true);
    });
  });

  describe('sizes', () => {
    it('are in document units: device pixels to one unit are the zoom times the pixel ratio', () => {
      // 50% zoom on a 2x screen, a 1600 px wide canvas: NDC x = 2·0.5·2/1600 per unit
      const vp = { a: (2 * 0.5 * 2) / 1600, b: 0, c: 0, d: (2 * 0.5 * 2) / 1000, tx: 0, ty: 0 };
      expect(effectScaleOf(vp, 1600)).toBeCloseTo(1);
      expect(effectScaleOf({ ...vp, a: vp.a * 2 }, 1600)).toBeCloseTo(2);

      expect(effectAtScale(dropShadow(), 2)).toMatchObject({
        blur: 8,
        offsetX: 4,
        offsetY: 6,
        spread: 0,
      });
      expect(effectAtScale(layerBlur(), 0.5)).toMatchObject({ radius: 3 });
    });

    it('are drawn at the view’s scale', () => {
      const blur = vi.spyOn(effectRenderer as any, 'applyGaussianBlur');
      effectRenderer.renderNodeWithEffects([layerBlur()], 'normal', () => undefined, 64, 48, 0.25);
      expect(blur).toHaveBeenCalledWith(expect.anything(), 1.5);
    });
  });

  describe('regions', () => {
    const canvas = [1600, 1000] as const;

    it('reach as far as the node’s effects spread, within the canvas, in steps of 32', () => {
      const shadow = { ...dropShadow(), blur: 20, offsetX: 0, offsetY: 10 } as Effect;
      expect(effectRegion({ x: 100, y: 200, w: 50, h: 40 }, [shadow], ...canvas)).toEqual({
        x: 78, // 100 − (20 blur + 2)
        y: 168, // 200 − (22 + 10 offset)
        w: 96, // 50 + 2·22 = 94, up to 96
        h: 128, // 40 + 2·32 = 104, up to 128
      });
      // Cut to the canvas at its corner
      expect(
        effectRegion({ x: -10, y: -10, w: 20, h: 20 }, [layerBlur()], ...canvas)
      ).toMatchObject({ x: 0, y: 0 });
    });

    it('is none for a node all off the canvas, so nothing is drawn', () => {
      expect(effectRegion({ x: 1700, y: 100, w: 50, h: 50 }, [dropShadow()], ...canvas)).toBeNull();
      const draw = vi.fn();
      effectRenderer.renderNodeWithEffects([dropShadow()], 'normal', draw, ...canvas, 1, {
        x: 1700,
        y: 100,
        w: 50,
        h: 50,
      });
      expect(draw).not.toHaveBeenCalled();
      expect(gl.drawArrays).not.toHaveBeenCalled();
    });

    it('draw the node into a framebuffer the region’s size, the canvas shifted onto it', () => {
      const origins: Array<[number, number]> = [];
      effectRenderer.onDrawOrigin = (x, y) => origins.push([x, y]);
      const acquire = vi.spyOn((effectRenderer as any).fbManager, 'acquire');
      const viewportAtDraw: unknown[] = [];
      const draw = () => viewportAtDraw.push(vi.mocked(gl.viewport).mock.lastCall);

      effectRenderer.renderNodeWithEffects([layerBlur()], 'normal', draw, ...canvas, 1, {
        x: 400,
        y: 300,
        w: 60,
        h: 30,
      });

      expect(acquire).toHaveBeenNthCalledWith(1, 96, 64);
      expect(viewportAtDraw).toEqual([[-392, -292, 1600, 1000]]);
      // A mask is read that much further along while it's drawn, then not
      expect(origins).toEqual([
        [392, 292],
        [0, 0],
      ]);
      expect(gl.viewport).toHaveBeenLastCalledWith(0, 0, 1600, 1000);
    });

    it('keep the whole canvas for a blend mode, which reads what’s under the layer', () => {
      const acquire = vi.spyOn((effectRenderer as any).fbManager, 'acquire');
      effectRenderer.renderNodeWithEffects(undefined, 'multiply', () => undefined, ...canvas, 1, {
        x: 400,
        y: 300,
        w: 60,
        h: 30,
      });
      expect(acquire).toHaveBeenNthCalledWith(1, 1600, 1000);
    });
  });

  describe('wide blurs', () => {
    it('are worked out smaller, keeping σ at 2 px or more there, at most 8 times', () => {
      expect([6, 12, 24, 48, 135, 400].map(blurDownsample)).toEqual([1, 2, 4, 8, 8, 8]);
    });

    it('are halved by filtered blits, blurred there with the radius scaled to match', () => {
      const source = (effectRenderer as any).fbManager.acquire(256, 128);
      const radius = vi.mocked(gl.uniform1f);

      const result = (effectRenderer as any).applyGaussianBlur(source, 24);

      // 256×128 → 128×64 → 64×32, blurred at a quarter of the radius
      expect(gl.blitFramebuffer).toHaveBeenCalledTimes(2);
      expect(gl.blitFramebuffer).toHaveBeenLastCalledWith(
        0,
        0,
        128,
        64,
        0,
        0,
        64,
        32,
        gl.COLOR_BUFFER_BIT,
        gl.LINEAR
      );
      expect(result).toMatchObject({ width: 64, height: 32 });
      expect(radius).toHaveBeenCalledWith(null, 6);
      expect(gl.viewport).toHaveBeenCalledWith(0, 0, 64, 32);
    });
  });

  it('renders drop shadows behind the shape, then blur, then inner shadows over it', () => {
    const order: string[] = [];
    vi.spyOn(effectRenderer as any, 'renderDropShadow').mockImplementation(() =>
      order.push('drop')
    );
    vi.spyOn(effectRenderer as any, 'renderLayerBlur').mockImplementation(() => order.push('blur'));
    vi.spyOn(effectRenderer as any, 'renderInnerShadow').mockImplementation(() =>
      order.push('inner')
    );
    vi.spyOn(effectRenderer as any, 'compositeToScreen').mockImplementation(() =>
      order.push('composite')
    );

    effectRenderer.renderNodeWithEffects(
      [innerShadow(), layerBlur(), dropShadow()],
      'normal',
      () => order.push('shape'),
      320,
      200
    );

    expect(order).toEqual(['shape', 'drop', 'blur', 'composite', 'inner']);
    expect(gl.enable).toHaveBeenCalledWith(gl.DEPTH_TEST);
  });

  it('ignores hidden effects and composites a blend mode through its dedicated pass', () => {
    vi.spyOn(effectRenderer as any, 'renderDropShadow');
    const screenComposite = vi
      .spyOn(effectRenderer as any, 'compositeToScreen')
      .mockImplementation(() => undefined);

    effectRenderer.renderNodeWithEffects(
      [dropShadow(false), layerBlur(false), innerShadow(false)],
      'multiply',
      () => undefined,
      100,
      80
    );

    expect((effectRenderer as any).renderDropShadow).not.toHaveBeenCalled();
    // What's underneath is copied on the GPU, never read back through the CPU
    expect(gl.readPixels).not.toHaveBeenCalled();
    expect(gl.copyTexSubImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, 0, 0, 0, 0, 100, 80);
    expect(gl.uniform1i).toHaveBeenCalledWith(null, 1);
    expect(screenComposite).not.toHaveBeenCalled();
    expect(renderer.bindVAO).toHaveBeenCalledWith(null);
  });

  it('keeps one backdrop texture across blended layers and frames', () => {
    const composite = () =>
      effectRenderer.renderNodeWithEffects(undefined, 'screen', () => undefined, 100, 80);
    composite();
    const created = vi.mocked(gl.createTexture).mock.calls.length;
    composite();
    composite();
    expect(vi.mocked(gl.createTexture).mock.calls.length).toBe(created);
    expect(gl.copyTexSubImage2D).toHaveBeenCalledTimes(3);
  });

  it('copies an opaque canvas into an RGB texture (WebKit refuses RGBA)', () => {
    gl.getContextAttributes.mockReturnValue({ alpha: false });
    effectRenderer.renderNodeWithEffects(undefined, 'multiply', () => undefined, 100, 80);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGB8,
      100,
      80,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      null
    );
  });

  it('disables and restores scissor while clearing effect framebuffers', () => {
    gl.isEnabled.mockReturnValue(true);
    vi.spyOn(effectRenderer as any, 'renderLayerBlur').mockImplementation(() => undefined);
    vi.spyOn(effectRenderer as any, 'compositeToScreen').mockImplementation(() => undefined);

    effectRenderer.renderNodeWithEffects([layerBlur()], 'normal', () => undefined, 64, 48);

    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(gl.enable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(gl.disable).toHaveBeenCalledWith(gl.DEPTH_TEST);
    expect(gl.enable).toHaveBeenCalledWith(gl.DEPTH_TEST);
  });

  it('renders drop shadows with normalized color and region-relative offsets, over the region', () => {
    const source = (effectRenderer as any).fbManager.acquire(100, 100);

    (effectRenderer as any).renderDropShadow(dropShadow(), source, {
      x: 30,
      y: 40,
      w: 100,
      h: 100,
    });

    expect(gl.drawArrays).toHaveBeenCalledTimes(3);
    expect(gl.uniform4f).toHaveBeenCalledWith(null, 0, 0, 0, 1);
    // Y counts up, as in the rest of the editor (and up in the framebuffer)
    expect(gl.uniform2f).toHaveBeenLastCalledWith(null, 0.02, 0.03);
    expect(gl.viewport).toHaveBeenLastCalledWith(30, 40, 100, 100);
    expect(renderer.bindVAO).toHaveBeenLastCalledWith(null);
    (effectRenderer as any).fbManager.release(source);
  });

  it('skips zero-radius layer blur and copies a blurred result back for positive radius', () => {
    const source = (effectRenderer as any).fbManager.acquire(80, 40);
    const createFramebuffer = gl.createFramebuffer as ReturnType<typeof vi.fn>;
    const initialFramebufferCount = createFramebuffer.mock.calls.length;

    (effectRenderer as any).renderLayerBlur({ ...layerBlur(), radius: 0 }, source, 80, 40);
    expect(createFramebuffer).toHaveBeenCalledTimes(initialFramebufferCount);

    (effectRenderer as any).renderLayerBlur({ ...layerBlur(), radius: 5 }, source, 80, 40);

    expect(gl.drawArrays).toHaveBeenCalledTimes(2);
    expect(gl.uniform2f).toHaveBeenNthCalledWith(1, null, 1 / 80, 0);
    expect(gl.uniform2f).toHaveBeenNthCalledWith(2, null, 0, 1 / 40);
    expect(gl.blitFramebuffer).toHaveBeenCalledWith(
      0,
      0,
      80,
      40,
      0,
      0,
      80,
      40,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST
    );
    (effectRenderer as any).fbManager.release(source);
  });

  it('composites premultiplied framebuffer content and restores the usual blend function', () => {
    const source = (effectRenderer as any).fbManager.acquire(32, 24);

    (effectRenderer as any).compositeToScreen(source, 32, 24);

    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE0);
    expect(gl.blendFunc).toHaveBeenCalledTimes(1);
    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    expect(gl.blendFuncSeparate).toHaveBeenLastCalledWith(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6);
    expect(renderer.bindVAO).toHaveBeenLastCalledWith(null);
  });

  it('disposes post-process programs and pooled framebuffers', () => {
    vi.spyOn(effectRenderer as any, 'compositeToScreen').mockImplementation(() => undefined);
    effectRenderer.renderNodeWithEffects(undefined, 'normal', () => undefined, 16, 16);
    const framebuffer = (gl.createFramebuffer as ReturnType<typeof vi.fn>).mock.results[0]!.value;
    const texture = (gl.createTexture as ReturnType<typeof vi.fn>).mock.results[0]!.value;

    effectRenderer.dispose();

    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(framebuffer);
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(4);
    expect(gl.deleteVertexArray).toHaveBeenCalled();
    expect(gl.deleteBuffer).toHaveBeenCalled();
  });
});
