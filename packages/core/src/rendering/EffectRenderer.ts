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
   */
  renderNodeWithEffects(
    effects: Effect[] | undefined,
    blendMode: BlendMode,
    renderNodeFn: () => void,
    canvasWidth: number,
    canvasHeight: number,
    scale = 1
  ): void {
    const gl = this.gl;
    const visibleEffects = (effects ?? [])
      .filter((e) => e.visible)
      .map((e) => effectAtScale(e, scale));
    const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    this.target = target;

    // Save and disable scissor test so FBO clears affect the entire texture
    // (artboard clipContent enables scissor which would leave stale content in FBOs)
    const scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);

    // Render the node shape to an off-screen FBO
    const shapeFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shapeFBO.fbo);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use blendFuncSeparate so alpha in the FBO is correct (A, not A²)
    // RGB: standard src-over premultiplied; Alpha: additive src-over
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    renderNodeFn();
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
        this.renderDropShadow(effect, shapeFBO, canvasWidth, canvasHeight);
      }
    }

    // Render the shape itself (possibly blurred)
    const hasLayerBlur = visibleEffects.some((e) => e.type === 'layer-blur');
    if (hasLayerBlur) {
      // Disable scissor for blur FBO operations (need full-texture clears)
      if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);
      for (const effect of visibleEffects) {
        if (effect.type === 'layer-blur') {
          this.renderLayerBlur(effect, shapeFBO, canvasWidth, canvasHeight);
        }
      }
      if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);
    }

    // Composite the shape (or blurred shape) onto the canvas
    if (blendMode !== 'normal') {
      this.compositeWithBlendMode(shapeFBO, blendMode, 1.0, canvasWidth, canvasHeight);
    } else {
      this.compositeToScreen(shapeFBO, canvasWidth, canvasHeight);
    }

    // Render inner shadows (on top of the shape, masked by shape alpha)
    for (const effect of visibleEffects) {
      if (effect.type === 'inner-shadow') {
        this.renderInnerShadow(effect, shapeFBO, canvasWidth, canvasHeight);
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
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const gl = this.gl;

    // Disable scissor for blur FBO operations (need full-texture clears)
    const scissorWasEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissorWasEnabled) gl.disable(gl.SCISSOR_TEST);

    // Blur the shape's alpha to create the shadow
    const blurredFBO = this.applyGaussianBlur(shapeFBO, effect.blur, canvasWidth, canvasHeight);

    // Re-enable scissor for compositing to canvas
    if (scissorWasEnabled) gl.enable(gl.SCISSOR_TEST);

    // Composite the blurred shadow with offset + color
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, canvasWidth, canvasHeight);

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
      effect.offsetX / canvasWidth,
      -effect.offsetY / canvasHeight
    );

    gl.enable(gl.BLEND);
    setNormalBlending(gl);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.renderer.bindVAO(null);

    this.fbManager.release(blurredFBO);
  }

  private renderInnerShadow(
    _effect: InnerShadowEffect,
    _shapeFBO: FramebufferEntry,
    _canvasWidth: number,
    _canvasHeight: number
  ): void {
    // Inner shadow requires alpha inversion + blur + masking
    // This is a simplified implementation - full implementation would need
    // an additional shader pass to invert alpha and mask the result
    // TODO: Full inner shadow implementation with alpha inversion shader
  }

  private renderLayerBlur(
    effect: LayerBlurEffect,
    shapeFBO: FramebufferEntry,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (effect.radius <= 0) return;

    const blurredFBO = this.applyGaussianBlur(shapeFBO, effect.radius, canvasWidth, canvasHeight);

    // Copy blurred result back into shapeFBO so the caller composites the blurred version
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, blurredFBO.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, shapeFBO.fbo);
    gl.blitFramebuffer(
      0,
      0,
      canvasWidth,
      canvasHeight,
      0,
      0,
      canvasWidth,
      canvasHeight,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);

    this.fbManager.release(blurredFBO);
  }

  /**
   * Apply 2-pass separable Gaussian blur.
   * Returns a new FBO with the blurred result. Caller must release it.
   */
  private applyGaussianBlur(
    source: FramebufferEntry,
    radius: number,
    canvasWidth: number,
    canvasHeight: number
  ): FramebufferEntry {
    const gl = this.gl;
    const { blur, quadVAO } = this.programs;

    // Pass 1: horizontal blur
    const tempFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO.fbo);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.renderer.useProgram(blur);
    this.renderer.bindVAO(quadVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(blur.uniforms.u_texture ?? null, 0);
    gl.uniform2f(blur.uniforms.u_direction ?? null, 1.0 / canvasWidth, 0);
    gl.uniform1f(blur.uniforms.u_radius ?? null, radius);

    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 2: vertical blur
    const resultFBO = this.fbManager.acquire(canvasWidth, canvasHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, resultFBO.fbo);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindTexture(gl.TEXTURE_2D, tempFBO.texture);
    gl.uniform2f(blur.uniforms.u_direction ?? null, 0, 1.0 / canvasHeight);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.BLEND);

    this.renderer.bindVAO(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);

    this.fbManager.release(tempFBO);

    return resultFBO;
  }

  /**
   * Simple composite: draw FBO texture to screen with premultiplied alpha blending.
   * The FBO content is premultiplied (rendered with blendFuncSeparate), so we use
   * ONE/ONE_MINUS_SRC_ALPHA to avoid double-multiplying by alpha.
   */
  private compositeToScreen(
    fbo: FramebufferEntry,
    _canvasWidth: number,
    _canvasHeight: number
  ): void {
    const gl = this.gl;

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
