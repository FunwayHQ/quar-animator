/**
 * EffectRenderer - Orchestrates multi-pass effect rendering
 *
 * Handles drop shadow, inner shadow, layer blur, and blend mode compositing
 * using framebuffer-based multi-pass rendering.
 */

import type {
  Effect,
  DropShadowEffect,
  InnerShadowEffect,
  LayerBlurEffect,
  BlendMode,
  Matrix3,
} from '@quar/types';
import { setNormalBlending, type WebGLRenderer } from './WebGLRenderer';
import { FramebufferManager } from './FramebufferManager';
import type { FramebufferEntry } from './FramebufferManager';
import {
  createPostProcessPrograms,
  disposePostProcessPrograms,
  getBlendModeIndex,
} from './PostProcessShaders';
import type { PostProcessPrograms } from './PostProcessShaders';

/**
 * Device pixels to one document unit through a view-projection onto a canvas
 * `canvasWidth` pixels wide: the zoom, times the pixel ratio.
 */
export function effectScaleOf(viewProjection: Matrix3, canvasWidth: number): number {
  return (Math.hypot(viewProjection.a, viewProjection.b) * canvasWidth) / 2;
}

/**
 * An effect's sizes on screen. Effects are set in the document's units, as
 * shapes are, so they grow and shrink with the zoom (and stay their size on a
 * high-density screen) instead of keeping a fixed number of device pixels.
 */
export function effectAtScale(effect: Effect, scale: number): Effect {
  if (scale === 1) return effect;
  switch (effect.type) {
    case 'drop-shadow':
    case 'inner-shadow':
      return {
        ...effect,
        offsetX: effect.offsetX * scale,
        offsetY: effect.offsetY * scale,
        blur: effect.blur * scale,
        spread: effect.spread * scale,
      };
    case 'layer-blur':
      return { ...effect, radius: effect.radius * scale };
  }
}

/** A rectangle of the canvas in device pixels, the GL way up (y from the bottom). */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Framebuffers come in sizes rounded up to this, so the same few get reused. */
const REGION_STEP = 32;

/**
 * The part of the canvas a node's effects can reach: its box grown by the
 * furthest any of them spreads (a blur's reach, a shadow's offset), cut to
 * the canvas, then sized up to whole steps. Null when it's all off the canvas:
 * nothing of it shows, so nothing need be drawn.
 */
export function effectRegion(
  bounds: PixelRect,
  effects: Effect[],
  canvasWidth: number,
  canvasHeight: number
): PixelRect | null {
  let padX = 2;
  let padY = 2;
  for (const effect of effects) {
    if (effect.type === 'drop-shadow') {
      const reach = Math.ceil(effect.blur) + Math.max(0, effect.spread) + 2;
      padX = Math.max(padX, reach + Math.abs(effect.offsetX));
      padY = Math.max(padY, reach + Math.abs(effect.offsetY));
    } else if (effect.type === 'layer-blur') {
      padX = Math.max(padX, Math.ceil(effect.radius) + 2);
      padY = Math.max(padY, Math.ceil(effect.radius) + 2);
    }
  }
  const x0 = Math.max(0, Math.floor(bounds.x - padX));
  const y0 = Math.max(0, Math.floor(bounds.y - padY));
  const x1 = Math.min(canvasWidth, Math.ceil(bounds.x + bounds.w + padX));
  const y1 = Math.min(canvasHeight, Math.ceil(bounds.y + bounds.h + padY));
  if (x1 <= x0 || y1 <= y0) return null;
  const up = (n: number) => Math.ceil(n / REGION_STEP) * REGION_STEP;
  return { x: x0, y: y0, w: up(x1 - x0), h: up(y1 - y0) };
}

/**
 * How many times smaller a blur of `radius` px is worked out: halved while its
 * spread (σ = radius / 3) stays at least 2 px there, at most 8 times. A wide
 * blur loses nothing to it, and costs a fraction: fewer pixels, fewer taps.
 */
export function blurDownsample(radius: number): number {
  const sigma = radius / 3;
  let factor = 1;
  while (factor < 8 && sigma / (factor * 2) >= 2) factor *= 2;
  return factor;
}

export class EffectRenderer {
  private gl: WebGL2RenderingContext;
  private renderer: WebGLRenderer;
  private fbManager: FramebufferManager;
  private programs: PostProcessPrograms;
  /** What's under a blended layer, copied from the target (see copyBackdrop) */
  private backdrop: {
    texture: WebGLTexture;
    width: number;
    height: number;
    opaque: boolean;
  } | null = null;
  /**
   * Where the current pass composites: the framebuffer bound as it began —
   * the canvas, or an off-screen pass such as an onion-skin ghost.
   */
  private target: WebGLFramebuffer | null = null;
  /**
   * Told where the canvas's origin is while a node is drawn into a region's
   * framebuffer (and (0, 0) after): what reads the canvas by fragment
   * position, a mask, has to look that much further along.
   */
  onDrawOrigin: ((x: number, y: number) => void) | null = null;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.gl = renderer.context;
    this.fbManager = new FramebufferManager(this.gl);
    this.programs = createPostProcessPrograms(renderer);
  }

  /**
   * Check whether a node needs multi-pass rendering (has effects or non-normal blend mode).
   */
  needsMultiPass(effects: Effect[] | undefined, blendMode: BlendMode | undefined): boolean {
    if (blendMode && blendMode !== 'normal') return true;
    if (!effects || effects.length === 0) return false;
    return effects.some((e) => e.visible);
  }

  /**
   * Render a node with its effects applied.
   *
   * @param effects - Array of effects on the node
   * @param blendMode - Blend mode for this node
   * @param renderNodeFn - Callback that renders the node geometry (to the currently bound FBO)
   * @param canvasWidth - Canvas pixel width
   * @param canvasHeight - Canvas pixel height
   * @param scale - Device pixels to one document unit (effectScaleOf)
   * @param bounds - Where the node is on the canvas (device pixels), when
   *   known: its effects are then worked out only round it (effectRegion)
   */
  renderNodeWithEffects(
    effects: Effect[] | undefined,
    blendMode: BlendMode,
    renderNodeFn: () => void,
    canvasWidth: number,
    canvasHeight: number,
    scale = 1,
    bounds?: PixelRect
  ): void {
    const gl = this.gl;
    const visibleEffects = (effects ?? [])
      .filter((e) => e.visible)
      .map((e) => effectAtScale(e, scale));
    // A blend mode reads what's under the whole layer: that pass keeps the canvas
    const region =
      blendMode === 'normal' && bounds
        ? effectRegion(bounds, visibleEffects, canvasWidth, canvasHeight)
        : { x: 0, y: 0, w: canvasWidth, h: canvasHeight };
    if (!region) return; // all of it off the canvas
    const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    this.target = target;

    // Save and disable scissor test so FBO clears affect the entire texture
    // (artboard clipContent enables scissor which would leave stale content in FBOs)
    const scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);

    // Render the node shape to an off-screen FBO the region's size: the canvas
    // shifted so the region's corner is the framebuffer's
    const shapeFBO = this.fbManager.acquire(region.w, region.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shapeFBO.fbo);
    gl.viewport(-region.x, -region.y, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use blendFuncSeparate so alpha in the FBO is correct (A, not A²)
    // RGB: standard src-over premultiplied; Alpha: additive src-over
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (region.x !== 0 || region.y !== 0) this.onDrawOrigin?.(region.x, region.y);
    renderNodeFn();
    if (region.x !== 0 || region.y !== 0) this.onDrawOrigin?.(0, 0);
    // A node's own effect pass inside renderNodeFn had a target of its own
    this.target = target;
    // Restore standard blend func
    setNormalBlending(gl);

    // Restore default framebuffer for compositing
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, canvasWidth, canvasHeight);

    // Re-enable scissor for compositing (clips to artboard bounds)
    if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);

    // Disable depth test during compositing — fullscreen quads should not
    // interact with the depth buffer or block subsequent shape rendering
    gl.disable(gl.DEPTH_TEST);

    // Process effects in order: drop shadows (behind), then layer blur, then inner shadows (on top)
    // Render drop shadows first (they appear behind the shape)
    for (const effect of visibleEffects) {
      if (effect.type === 'drop-shadow') {
        this.renderDropShadow(effect, shapeFBO, region);
      }
    }

    // Render the shape itself (possibly blurred)
    const hasLayerBlur = visibleEffects.some((e) => e.type === 'layer-blur');
    if (hasLayerBlur) {
      // Disable scissor for blur FBO operations (need full-texture clears)
      if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);
      for (const effect of visibleEffects) {
        if (effect.type === 'layer-blur') {
          this.renderLayerBlur(effect, shapeFBO);
        }
      }
      if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);
    }

    // Composite the shape (or blurred shape) onto the canvas
    if (blendMode !== 'normal') {
      this.compositeWithBlendMode(shapeFBO, blendMode, 1.0, canvasWidth, canvasHeight);
    } else {
      this.compositeToScreen(shapeFBO, region);
    }
    gl.viewport(0, 0, canvasWidth, canvasHeight);

    // Render inner shadows (on top of the shape, masked by shape alpha)
    for (const effect of visibleEffects) {
      if (effect.type === 'inner-shadow') {
        this.renderInnerShadow(effect, shapeFBO);
      }
    }

    // Restore depth test
    gl.enable(gl.DEPTH_TEST);

    this.fbManager.release(shapeFBO);
  }

  /**
   * Composite a source FBO with a specific blend mode onto the canvas.
   */
  compositeWithBlendMode(
    srcFBO: FramebufferEntry,
    blendMode: BlendMode,
    opacity: number,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const gl = this.gl;
    // Composites onto what's bound now (the canvas, or an off-screen pass)
    this.target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;

    // What the layer blends with: the target's pixels, copied on the GPU
    const backdrop = this.copyBackdrop(canvasWidth, canvasHeight);
    if (!backdrop) return;

    // Now composite src over dst using blend mode shader
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, canvasWidth, canvasHeight);

    const { blend, quadVAO } = this.programs;
    this.renderer.useProgram(blend);
    this.renderer.bindVAO(quadVAO);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcFBO.texture);
    gl.uniform1i(blend.uniforms.u_srcTexture ?? null, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, backdrop);
    gl.uniform1i(blend.uniforms.u_dstTexture ?? null, 1);

    gl.uniform1i(blend.uniforms.u_blendMode ?? null, getBlendModeIndex(blendMode));
    gl.uniform1f(blend.uniforms.u_opacity ?? null, opacity);

    // Disable blending for the blend mode shader (it handles compositing itself)
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.BLEND);

    this.renderer.bindVAO(null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Copy the target's pixels into the backdrop texture, on the GPU.
   * copyTexSubImage2D resolves a multisampled canvas (antialias: true) as it
   * copies — where blitFramebuffer into a texture fails on Chrome/ANGLE —
   * and unlike readPixels it doesn't stall the GPU to bring every pixel
   * through the CPU, once per blended layer per frame. An opaque canvas
   * (alpha: false) is copied into an RGB texture: WebKit won't copy it into
   * an RGBA one, and sampled it reads as opaque, as the canvas shows.
   */
  private copyBackdrop(width: number, height: number): WebGLTexture | null {
    const gl = this.gl;
    const opaque = this.target === null && gl.getContextAttributes()?.alpha === false;
    let backdrop = this.backdrop;
    if (
      !backdrop ||
      backdrop.width !== width ||
      backdrop.height !== height ||
      backdrop.opaque !== opaque
    ) {
      if (backdrop) gl.deleteTexture(backdrop.texture);
      const texture = gl.createTexture();
      if (!texture) return null;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const format = opaque ? gl.RGB : gl.RGBA;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        opaque ? gl.RGB8 : gl.RGBA8,
        width,
        height,
        0,
        format,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      backdrop = this.backdrop = { texture, width, height, opaque };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.bindTexture(gl.TEXTURE_2D, backdrop.texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
    return backdrop.texture;
  }

  private renderDropShadow(
    effect: DropShadowEffect,
    shapeFBO: FramebufferEntry,
    region: PixelRect
  ): void {
    const gl = this.gl;

    // Disable scissor for blur FBO operations (need full-texture clears)
    const scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);

    // Blur the shape's alpha to create the shadow
    const blurredFBO = this.applyGaussianBlur(shapeFBO, effect.blur);

    // Re-enable scissor for compositing to canvas
    if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);

    // Composite the blurred shadow with offset + color, over the region
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(region.x, region.y, region.w, region.h);

    const { shadow, quadVAO } = this.programs;
    this.renderer.useProgram(shadow);
    this.renderer.bindVAO(quadVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blurredFBO.texture);
    gl.uniform1i(shadow.uniforms.u_shadowTexture ?? null, 0);

    gl.uniform4f(
      shadow.uniforms.u_shadowColor ?? null,
      effect.color.r / 255,
      effect.color.g / 255,
      effect.color.b / 255,
      effect.color.a
    );
    gl.uniform1f(shadow.uniforms.u_opacity ?? null, effect.opacity);

    // Shadow offset in UV space (Y is inverted: positive offsetY = down in screen = negative in UV)
    gl.uniform2f(
      shadow.uniforms.u_offset ?? null,
      effect.offsetX / region.w,
      -effect.offsetY / region.h
    );

    gl.enable(gl.BLEND);
    setNormalBlending(gl);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.renderer.bindVAO(null);

    this.fbManager.release(blurredFBO);
  }

  private renderInnerShadow(_effect: InnerShadowEffect, _shapeFBO: FramebufferEntry): void {
    // Inner shadow requires alpha inversion + blur + masking
    // This is a simplified implementation - full implementation would need
    // an additional shader pass to invert alpha and mask the result
    // TODO: Full inner shadow implementation with alpha inversion shader
  }

  private renderLayerBlur(effect: LayerBlurEffect, shapeFBO: FramebufferEntry): void {
    if (effect.radius <= 0) return;

    const blurredFBO = this.applyGaussianBlur(shapeFBO, effect.radius);

    // Copy the blurred result back into shapeFBO (scaled up, if it was worked
    // out smaller) so the caller composites the blurred version
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blurredFBO.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, shapeFBO.fbo);
    gl.blitFramebuffer(
      0,
      0,
      blurredFBO.width,
      blurredFBO.height,
      0,
      0,
      shapeFBO.width,
      shapeFBO.height,
      gl.COLOR_BUFFER_BIT,
      blurredFBO.width === shapeFBO.width ? gl.NEAREST : gl.LINEAR
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);

    this.fbManager.release(blurredFBO);
  }

  /**
   * A 2-pass separable Gaussian blur of a framebuffer, worked out at a reduced
   * size when it's wide (blurDownsample): halved by filtered blits first.
   * Returns a new FBO with the blurred result, maybe smaller than the source,
   * to be sampled with filtering. Caller must release it.
   */
  private applyGaussianBlur(source: FramebufferEntry, radius: number): FramebufferEntry {
    const gl = this.gl;
    const { blur, quadVAO } = this.programs;

    let current = source;
    for (let factor = blurDownsample(radius); factor > 1; factor /= 2) {
      const half = this.fbManager.acquire(
        Math.max(1, Math.ceil(current.width / 2)),
        Math.max(1, Math.ceil(current.height / 2))
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, current.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, half.fbo);
      gl.blitFramebuffer(
        0,
        0,
        current.width,
        current.height,
        0,
        0,
        half.width,
        half.height,
        gl.COLOR_BUFFER_BIT,
        gl.LINEAR
      );
      if (current !== source) this.fbManager.release(current);
      current = half;
    }
    const width = current.width;
    const height = current.height;
    const scaledRadius = radius * (width / source.width);

    // Pass 1: horizontal blur
    const tempFBO = this.fbManager.acquire(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.renderer.useProgram(blur);
    this.renderer.bindVAO(quadVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, current.texture);
    gl.uniform1i(blur.uniforms.u_texture ?? null, 0);
    gl.uniform2f(blur.uniforms.u_direction ?? null, 1.0 / width, 0);
    gl.uniform1f(blur.uniforms.u_radius ?? null, scaledRadius);

    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 2: vertical blur
    const resultFBO = this.fbManager.acquire(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, resultFBO.fbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindTexture(gl.TEXTURE_2D, tempFBO.texture);
    gl.uniform2f(blur.uniforms.u_direction ?? null, 0, 1.0 / height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.BLEND);

    this.renderer.bindVAO(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);

    this.fbManager.release(tempFBO);
    if (current !== source) this.fbManager.release(current);

    return resultFBO;
  }

  /**
   * Simple composite: draw FBO texture to screen with premultiplied alpha blending.
   * The FBO content is premultiplied (rendered with blendFuncSeparate), so we use
   * ONE/ONE_MINUS_SRC_ALPHA to avoid double-multiplying by alpha.
   */
  private compositeToScreen(fbo: FramebufferEntry, region: PixelRect): void {
    const gl = this.gl;
    gl.viewport(region.x, region.y, region.w, region.h);

    const { composite, quadVAO } = this.programs;
    this.renderer.useProgram(composite);
    this.renderer.bindVAO(quadVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    gl.uniform1i(composite.uniforms.u_texture ?? null, 0);

    // FBO content is premultiplied — use ONE for src factor to avoid alpha²
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Restore standard blend func for subsequent rendering
    setNormalBlending(gl);
    this.renderer.bindVAO(null);
  }

  dispose(): void {
    disposePostProcessPrograms(this.gl, this.programs);
    this.fbManager.dispose();
    if (this.backdrop) this.gl.deleteTexture(this.backdrop.texture);
    this.backdrop = null;
  }
}
