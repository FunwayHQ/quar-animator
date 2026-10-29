/**
 * Tests for ShapeRenderer video layers: drawn as pictures whose texture is
 * uploaded again only when the picture changes.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ShapeRenderer } from './ShapeRenderer';
import { WebGLRenderer } from './WebGLRenderer';
import { SceneGraph, createDefaultTransform, createGroupNode } from '../SceneGraph';
import { mat3 } from '../math';
import { createMockWebGL2Context } from '../test/setup';
import type { EffectRenderer, PixelRect } from './EffectRenderer';
import type { VideoFrameImage, VideoFrameProvider } from './videoFrames';
import type { Effect, Node, VideoNode } from '@quar/types';

function createMockRenderer(): { renderer: WebGLRenderer; gl: WebGL2RenderingContext } {
  const canvas = document.createElement('canvas');
  const gl = Object.assign(createMockWebGL2Context(), {
    generateMipmap: vi.fn(),
  }) as unknown as WebGL2RenderingContext;
  canvas.getContext = vi.fn().mockReturnValue(gl);
  return { renderer: new WebGLRenderer({ canvas }), gl };
}

function createVideoNode(id: string, patch: Partial<VideoNode> = {}): VideoNode {
  return {
    id,
    name: `Video ${id}`,
    type: 'video',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    videoId: `file-${id}`,
    width: 160,
    height: 90,
    naturalWidth: 1280,
    naturalHeight: 720,
    cornerRadius: [0, 0, 0, 0],
    clip: { start: 0, offset: 0, duration: 4 },
    ...patch,
  };
}

/** A decoded picture: a canvas of the given size. */
function picture(width = 32, height = 18): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe('ShapeRenderer - video layers', () => {
  let gl: WebGL2RenderingContext;
  let shapeRenderer: ShapeRenderer;
  let sceneGraph: SceneGraph;
  /** What the provider gives each layer, by id */
  let frames: Map<string, VideoFrameImage | null>;
  let provider: Mock<VideoFrameProvider>;

  const quadsDrawn = () =>
    (gl.drawArrays as Mock).mock.calls.filter(
      ([mode, first, count]) => mode === gl.TRIANGLE_STRIP && first === 0 && count === 4
    ).length;
  const uploads = () => (gl.texImage2D as Mock).mock.calls.length;
  const subUploads = () => (gl.texSubImage2D as Mock).mock.calls.length;
  const render = () => shapeRenderer.render(sceneGraph, mat3.identity());

  beforeEach(() => {
    const mocks = createMockRenderer();
    gl = mocks.gl;
    shapeRenderer = new ShapeRenderer(mocks.renderer);
    sceneGraph = new SceneGraph();
    frames = new Map();
    provider = vi.fn<VideoFrameProvider>((node) => frames.get(node.id) ?? null);
    shapeRenderer.setVideoFrames(provider);
    vi.clearAllMocks();
  });

  it('draws nothing, uploading nothing, while the provider has no picture', () => {
    sceneGraph.addNode(createVideoNode('v'));
    render();
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ id: 'v' }));
    expect(uploads()).toBe(0);
    expect(quadsDrawn()).toBe(0);
  });

  it('draws nothing without a provider', () => {
    shapeRenderer.setVideoFrames(null);
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 1 });
    render();
    expect(uploads()).toBe(0);
    expect(quadsDrawn()).toBe(0);
  });

  it('uploads the picture and draws it as a picture is drawn', () => {
    sceneGraph.addNode(createVideoNode('v'));
    const source = picture();
    frames.set('v', { source, key: 'f0' });
    render();
    expect(gl.texImage2D).toHaveBeenCalledTimes(1);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source
    );
    expect(quadsDrawn()).toBe(1);
    // The picture's size and corners, as for an image
    expect(gl.uniform2f).toHaveBeenCalledWith(expect.anything(), 160, 90);
  });

  it('doesn’t upload again while the key stays the same', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 'f0' });
    render();
    render();
    render();
    expect(uploads()).toBe(1);
    expect(subUploads()).toBe(0);
    expect(quadsDrawn()).toBe(3);
  });

  it('uploads a new picture into the texture it has when the size is the same', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 'f0' });
    render();
    const next = picture();
    frames.set('v', { source: next, key: 'f1' });
    render();
    expect(uploads()).toBe(1);
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(1);
    expect(gl.texSubImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      next
    );
    expect(gl.createTexture).toHaveBeenCalledTimes(1);
  });

  it('makes the texture again for a picture of another size', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(32, 18), key: 'still' });
    render();
    frames.set('v', { source: picture(64, 36), key: 'exact' });
    render();
    expect(uploads()).toBe(2);
    expect(subUploads()).toBe(0);
  });

  it('makes no mipmaps: they’d be made again for every frame', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 'f0' });
    render();
    expect(gl.generateMipmap).not.toHaveBeenCalled();
    expect(gl.texParameteri).toHaveBeenCalledWith(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  });

  it('gives each video layer a texture of its own', () => {
    sceneGraph.addNode(createVideoNode('a', { videoId: 'same' }));
    sceneGraph.addNode(createVideoNode('b', { videoId: 'same' }));
    frames.set('a', { source: picture(), key: 'same@1' });
    frames.set('b', { source: picture(), key: 'same@2' });
    render();
    render();
    expect(gl.createTexture).toHaveBeenCalledTimes(2);
    expect(uploads()).toBe(2);
    expect(quadsDrawn()).toBe(4);
  });

  it('stops drawing when the provider has no picture any more', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 'f0' });
    render();
    frames.set('v', null);
    render();
    expect(quadsDrawn()).toBe(1);
  });

  it('draws nothing when a picture can’t be uploaded, and tries again next frame', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 'f0' });
    (gl.texImage2D as Mock).mockImplementationOnce(() => {
      throw new DOMException('The frame was closed', 'InvalidStateError');
    });
    expect(() => render()).not.toThrow();
    expect(quadsDrawn()).toBe(0);
    render();
    expect(uploads()).toBe(2);
    expect(quadsDrawn()).toBe(1);
  });

  it('draws nothing, and goes on drawing the rest, when the provider fails', () => {
    sceneGraph.addNode(createVideoNode('broken'));
    sceneGraph.addNode(createVideoNode('fine'));
    frames.set('fine', { source: picture(), key: 1 });
    provider.mockImplementation((node) => {
      if (node.id === 'broken') throw new Error('no file for this video');
      return frames.get(node.id) ?? null;
    });
    expect(() => render()).not.toThrow();
    expect(quadsDrawn()).toBe(1);
  });

  it('draws nothing for a picture with no size', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(0, 0), key: 'f0' });
    render();
    expect(uploads()).toBe(0);
    expect(quadsDrawn()).toBe(0);
  });

  it('frees a layer’s texture when it goes, and all of them when cleared', () => {
    sceneGraph.addNode(createVideoNode('a'));
    sceneGraph.addNode(createVideoNode('b'));
    frames.set('a', { source: picture(), key: 1 });
    frames.set('b', { source: picture(), key: 1 });
    render();
    const [textureA, textureB] = (gl.createTexture as Mock).mock.results.map((r) => r.value);

    shapeRenderer.disposeVideoTexture('a');
    expect(gl.deleteTexture).toHaveBeenCalledWith(textureA);
    expect(gl.deleteTexture).not.toHaveBeenCalledWith(textureB);

    shapeRenderer.clearTextures();
    expect(gl.deleteTexture).toHaveBeenCalledWith(textureB);
    // Drawn again: uploaded afresh
    render();
    expect(uploads()).toBe(4);
  });

  it('frees video textures when disposed', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 1 });
    render();
    const texture = (gl.createTexture as Mock).mock.results[0]?.value;
    shapeRenderer.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
  });

  it('frees the textures of layers not drawn for a while', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 1 });
    render();
    const texture = (gl.createTexture as Mock).mock.results[0]?.value;
    frames.set('v', null);
    for (let i = 0; i < 400; i++) render();
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
  });

  it('draws a video as a preview node', () => {
    const node = createVideoNode('v');
    frames.set('v', { source: picture(), key: 1 });
    shapeRenderer.renderNode(node, mat3.identity());
    expect(quadsDrawn()).toBe(1);
  });

  it('draws no onion-skin ghost of a video: its picture is of now, not the ghost’s frame', () => {
    sceneGraph.addNode(createVideoNode('v'));
    frames.set('v', { source: picture(), key: 1 });
    shapeRenderer.renderGhostScene(sceneGraph, mat3.identity(), 0.5, [1, 0, 0]);
    expect(provider).not.toHaveBeenCalled();
    expect(gl.texImage2D).not.toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      expect.any(HTMLCanvasElement)
    );
  });

  it('masks with a video, and is masked', () => {
    const group = createGroupNode('masked', 'Masked');
    group.maskNodeId = 'mask';
    group.maskMode = 'alpha';
    sceneGraph.addNode(group);
    sceneGraph.addNode(createVideoNode('content'), group.id);
    sceneGraph.addNode(createVideoNode('mask'), group.id);
    frames.set('content', { source: picture(), key: 1 });
    frames.set('mask', { source: picture(), key: 1 });
    render();
    // The mask drawn off screen, then the content through it
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, expect.anything());
    expect(provider.mock.calls.map(([node]) => node.id)).toEqual(['mask', 'content']);
    expect(quadsDrawn()).toBe(2);
  });

  it('draws a video with effects and a blend mode through an effect pass, round its box', () => {
    const effects = (shapeRenderer as unknown as { effectRenderer: EffectRenderer }).effectRenderer;
    const passes: [Effect[] | undefined, string, PixelRect | undefined][] = [];
    vi.spyOn(effects, 'renderNodeWithEffects').mockImplementation(
      (list, blendMode, draw, _w, _h, _scale, bounds) => {
        passes.push([list, blendMode, bounds]);
        draw();
      }
    );
    sceneGraph.addNode(
      createVideoNode('v', {
        blendMode: 'multiply',
        effects: [
          {
            id: 'shadow',
            type: 'drop-shadow',
            visible: true,
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 0.5,
            offsetX: 4,
            offsetY: -4,
            blur: 8,
            spread: 0,
          },
        ],
      })
    );
    frames.set('v', { source: picture(), key: 1 });
    render();
    expect(passes).toHaveLength(1);
    expect(passes[0]?.[0]?.[0]?.type).toBe('drop-shadow');
    expect(passes[0]?.[1]).toBe('multiply');
    // Worked out round the video's box (identity view: NDC ±1 over a 100px canvas)
    expect(passes[0]?.[2]).toEqual({ x: -3950, y: -2200, w: 8000, h: 4500 });
    expect(quadsDrawn()).toBe(1);
  });

  describe('transparency', () => {
    /** The uniform locations are their names, so which is set to what can be told */
    const withNamedUniforms = () => {
      const mocks = createMockRenderer();
      (mocks.gl.getUniformLocation as Mock).mockImplementation(
        (_program: WebGLProgram, name: string) => ({ name })
      );
      gl = mocks.gl;
      shapeRenderer = new ShapeRenderer(mocks.renderer);
      shapeRenderer.setVideoFrames(provider);
      vi.clearAllMocks();
    };
    const premultipliedSet = () =>
      (gl.uniform1i as Mock).mock.calls
        .filter(([location]) => (location as { name?: string })?.name === 'u_premultiplied')
        .map(([, value]) => value as number);

    it('uploads a video’s picture premultiplied (filtered without fringes), then unpacks straight again', () => {
      sceneGraph.addNode(createVideoNode('v'));
      frames.set('v', { source: picture(), key: 'f0' });
      render();
      frames.set('v', { source: picture(), key: 'f1' });
      render();
      const unpack = (gl.pixelStorei as Mock).mock;
      const premultiplied = unpack.calls.flatMap(([name, value], i) =>
        name === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL
          ? [{ value, order: unpack.invocationCallOrder[i]! }]
          : []
      );
      const uploads = [
        ...(gl.texImage2D as Mock).mock.invocationCallOrder,
        ...(gl.texSubImage2D as Mock).mock.invocationCallOrder,
      ];
      expect(uploads).toHaveLength(2);
      for (const upload of uploads) {
        const before = premultiplied.filter(({ order }) => order < upload).at(-1);
        const after = premultiplied.find(({ order }) => order > upload);
        expect(before?.value).toBe(true);
        expect(after?.value).toBe(false);
      }
    });

    it('unpacks straight again when a picture can’t be uploaded', () => {
      sceneGraph.addNode(createVideoNode('v'));
      frames.set('v', { source: picture(), key: 'f0' });
      (gl.texImage2D as Mock).mockImplementationOnce(() => {
        throw new DOMException('The frame was closed', 'InvalidStateError');
      });
      render();
      expect((gl.pixelStorei as Mock).mock.calls.at(-1)).toEqual([
        gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        false,
      ]);
    });

    it('tells the picture shader a video’s colours are premultiplied, and a picture’s aren’t', () => {
      withNamedUniforms();
      const src = 'data:image/png;base64,AAAA';
      vi.spyOn(shapeRenderer, 'getTexture').mockImplementation((asked) =>
        asked === src ? ({ __isTexture: true } as unknown as WebGLTexture) : null
      );
      sceneGraph.addNode(createVideoNode('v'));
      sceneGraph.addNode({
        ...createVideoNode('picture'),
        type: 'image',
        src,
      } as unknown as Node);
      frames.set('v', { source: picture(), key: 1 });
      render();
      expect(quadsDrawn()).toBe(2);
      expect(premultipliedSet()).toEqual([1, 0]);
    });

    it('has the picture shader take a premultiplied colour back before adjusting it', () => {
      const mocks = createMockRenderer();
      new ShapeRenderer(mocks.renderer);
      const fragment = (mocks.gl.shaderSource as Mock).mock.calls
        .map(([, source]) => String(source))
        .find((source) => source.includes('uniform vec4 u_cornerRadius;'));
      expect(fragment).toContain('uniform int u_premultiplied;');
      expect(fragment).toMatch(/texColor\.rgb\s*\/\s*texColor\.a/);
      expect(mocks.gl.getUniformLocation).toHaveBeenCalledWith(
        expect.anything(),
        'u_premultiplied'
      );
    });
  });

  it('draws the videos in a symbol an instance draws', () => {
    const video = createVideoNode('in-symbol');
    shapeRenderer.setSymbolDefinitions(
      new Map([
        [
          'clip-symbol',
          {
            id: 'clip-symbol',
            name: 'Clip',
            sceneGraphJSON: { nodes: [video], rootNodeIds: [video.id] },
          },
        ],
      ])
    );
    sceneGraph.addNode({
      ...createVideoNode('inst'),
      type: 'symbol-instance',
      symbolId: 'clip-symbol',
      overrides: [],
    } as unknown as Node);
    frames.set('in-symbol', { source: picture(), key: 1 });
    render();
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ id: 'in-symbol' }));
    expect(quadsDrawn()).toBe(1);
  });
});
