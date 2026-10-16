import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportGif, gifCompressionSettings } from './gifExporter';

const rendererMock = vi.hoisted(() => ({
  preloadTextures: vi.fn(async () => {}),
  renderFrame: vi.fn((_: unknown, frame: number) => ({ frame }) as unknown as HTMLCanvasElement),
  dispose: vi.fn(),
}));

vi.mock('./frameRenderer', () => ({
  createFrameRenderer: () => rendererMock,
  getFrameCount: (start: number, end: number) => Math.max(0, end - start + 1),
  getFrameRenderRoots: (ctx: { sceneGraph: { getRootNodes: () => unknown[] } }) =>
    ctx.sceneGraph.getRootNodes(),
}));

describe('exportGif', () => {
  let drawFrame = 0;

  beforeEach(() => {
    drawFrame = 0;
    vi.clearAllMocks();

    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn((source: { frame: number }) => {
        drawFrame = source.frame;
      }),
      getImageData: vi.fn(() => ({
        data:
          drawFrame % 2 === 0
            ? new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
            : new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 0, 255]),
      })),
    };
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes every requested frame into a valid animated GIF and reports progress', async () => {
    const progress = vi.fn();
    const blob = await exportGif(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 2, height: 1, frameRate: 12, startFrame: 4, endFrame: 5 },
      progress
    );

    expect(blob?.type).toBe('image/gif');
    const signature = new TextDecoder().decode((await blob!.arrayBuffer()).slice(0, 6));
    expect(signature).toMatch(/^GIF8[79]a$/);
    expect(rendererMock.renderFrame).toHaveBeenCalledTimes(4);
    expect(progress.mock.calls.some(([item]) => item.phase === 'preparing')).toBe(true);
    expect(progress.mock.calls.some(([item]) => item.phase === 'encoding')).toBe(true);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: 'finalizing', percentage: 100 });
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
  });

  it('releases the renderer if the export is canceled during palette preparation', async () => {
    const isCancelled = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const blob = await exportGif(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 2, height: 1, frameRate: 24, startFrame: 0, endFrame: 2 },
      undefined,
      isCancelled
    );

    expect(blob).toBeNull();
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
  });

  it('rejects invalid ranges and dimensions before allocating a renderer', async () => {
    const ctx = { sceneGraph: { getRootNodes: () => [] }, timeline: { tracks: [] } } as never;

    await expect(
      exportGif(ctx, { width: 2, height: 1, frameRate: 24, startFrame: 3, endFrame: 2 })
    ).rejects.toThrow('Choose a valid frame range');
    await expect(
      exportGif(ctx, { width: 0, height: 1, frameRate: 24, startFrame: 0, endFrame: 1 })
    ).rejects.toThrow('at least 1 pixel');

    expect(rendererMock.renderFrame).not.toHaveBeenCalled();
    expect(rendererMock.dispose).not.toHaveBeenCalled();
  });

  it('releases the renderer if canceled before the encoding pass', async () => {
    const isCancelled = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const blob = await exportGif(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      { width: 2, height: 1, frameRate: 24, startFrame: 0, endFrame: 0 },
      undefined,
      isCancelled
    );

    expect(blob).toBeNull();
    expect(rendererMock.renderFrame).toHaveBeenCalledOnce();
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
  });

  it('releases the renderer if the GIF color-conversion canvas is unavailable', async () => {
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    });

    await expect(
      exportGif(
        { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
        { width: 2, height: 1, frameRate: 24, startFrame: 0, endFrame: 0 }
      )
    ).rejects.toThrow('Could not create a canvas for GIF color conversion');

    expect(rendererMock.dispose).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// Compression — checked by decoding the GIF and compositing it like a viewer
// ============================================================================

interface DecodedGif {
  palette: number[][];
  /** RGBA as the viewer sees it once each frame is drawn. */
  frames: Uint8ClampedArray[];
  /** Raw palette indices written for each frame. */
  indices: Uint8Array[];
  transparentIndex: number;
  disposals: number[];
}

function lzwDecode(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  let dict: number[][] = [];
  let codeSize = 0;
  const reset = () => {
    dict = Array.from({ length: clear + 2 }, (_, i) => [i]);
    codeSize = minCodeSize + 1;
  };
  reset();
  let bit = 0;
  let written = 0;
  let previous: number[] | null = null;
  while (written < pixelCount && bit + codeSize <= data.length * 8) {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      code |= ((data[(bit + i) >> 3]! >> ((bit + i) & 7)) & 1) << i;
    }
    bit += codeSize;
    if (code === clear) {
      reset();
      previous = null;
      continue;
    }
    if (code === clear + 1) break;
    const entry: number[] = code < dict.length ? dict[code]! : [...previous!, previous![0]!];
    if (previous) dict.push([...previous, entry[0]!]);
    for (const value of entry) out[written++] = value;
    previous = entry;
    if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
  }
  return out;
}

function decodeGif(bytes: Uint8Array): DecodedGif {
  let pos = 6;
  const u16 = () => bytes[pos++]! | (bytes[pos++]! << 8);
  const width = u16();
  const height = u16();
  const packed = bytes[pos]!;
  pos += 3;
  const palette: number[][] = [];
  for (let i = 0; i < 1 << ((packed & 7) + 1); i++, pos += 3) {
    palette.push([...bytes.subarray(pos, pos + 3)]);
  }
  const subBlocks = () => {
    const chunks: number[] = [];
    for (let size = bytes[pos++]!; size > 0; size = bytes[pos++]!) {
      chunks.push(...bytes.subarray(pos, pos + size));
      pos += size;
    }
    return new Uint8Array(chunks);
  };

  const result: DecodedGif = {
    palette,
    frames: [],
    indices: [],
    transparentIndex: -1,
    disposals: [],
  };
  const screen = new Uint8ClampedArray(width * height * 4);
  let transparentIndex = -1;
  let dispose = 0;
  while (pos < bytes.length) {
    const block = bytes[pos++]!;
    if (block === 0x3b) break;
    if (block === 0x21) {
      if (bytes[pos++] === 0xf9) {
        const flags = bytes[pos + 1]!;
        dispose = (flags >> 2) & 7;
        transparentIndex = flags & 1 ? bytes[pos + 4]! : -1;
      }
      subBlocks();
      continue;
    }
    // Image descriptor: these GIFs always draw the full screen, no local table
    pos += 9;
    const minCodeSize = bytes[pos++]!;
    const indices = lzwDecode(subBlocks(), minCodeSize, width * height);
    indices.forEach((index, p) => {
      if (index === transparentIndex) return;
      screen.set([...palette[index]!, 255], p * 4);
    });
    result.indices.push(indices);
    result.frames.push(screen.slice());
    result.disposals.push(dispose);
    result.transparentIndex = transparentIndex;
    if (dispose === 2) screen.fill(0);
  }
  return result;
}

describe('GIF compression', () => {
  const RED = [255, 0, 0, 255];
  const BLUE = [0, 0, 255, 255];
  const GREEN = [0, 255, 0, 255];
  const CLEAR = [0, 0, 0, 0];
  let framePixels: number[][][] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    let drawn = 0;
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn((source: { frame: number }) => {
        drawn = source.frame;
      }),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(framePixels[drawn]!.flat()) })),
    };
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function encode(options: { compression?: number; transparent?: boolean } = {}) {
    const blob = await exportGif(
      { sceneGraph: { getRootNodes: () => [] } as never, timeline: { tracks: [] } as never },
      {
        width: framePixels[0]!.length,
        height: 1,
        frameRate: 24,
        startFrame: 0,
        endFrame: framePixels.length - 1,
        ...options,
      }
    );
    return decodeGif(new Uint8Array(await blob!.arrayBuffer()));
  }

  const rgba = (frame: Uint8ClampedArray) =>
    Array.from({ length: frame.length / 4 }, (_, p) => [...frame.subarray(p * 4, p * 4 + 4)]);

  it('maps the compression level to palette size and tolerance', () => {
    expect(gifCompressionSettings(0)).toEqual({ colors: 256, tolerance: 0 });
    expect(gifCompressionSettings(50)).toEqual({ colors: 64, tolerance: 12 });
    expect(gifCompressionSettings(100)).toEqual({ colors: 16, tolerance: 24 });
    expect(gifCompressionSettings(500)).toEqual(gifCompressionSettings(100));
    expect(gifCompressionSettings(Number.NaN)).toEqual(gifCompressionSettings(0));
  });

  it('only writes the pixels that change, and every frame still looks right', async () => {
    framePixels = [
      [RED, RED, BLUE, BLUE],
      [RED, GREEN, BLUE, BLUE],
      [RED, GREEN, BLUE, RED],
    ];
    const gif = await encode();
    expect(gif.frames.map(rgba)).toEqual(framePixels);
    // Frame 2 rewrites only the pixel that changed
    const unchanged = gif.indices[1]!.filter((index) => index === gif.transparentIndex);
    expect(unchanged).toHaveLength(3);
    expect(gif.disposals).toEqual([1, 1, 1]);
  });

  it('keeps black pixels black (the reserved index is never used for color)', async () => {
    const BLACK = [0, 0, 0, 255];
    framePixels = [
      [BLACK, RED],
      [BLACK, BLACK],
    ];
    const gif = await encode();
    expect(gif.frames.map(rgba)).toEqual(framePixels);
  });

  it('uses a smaller palette at higher compression', async () => {
    framePixels = [Array.from({ length: 64 }, (_, i) => [i * 4, 255 - i * 4, (i * 37) % 256, 255])];
    // 64 colors + the reserved index, padded to a power of two
    expect((await encode({ compression: 0 })).palette.length).toBe(128);
    expect((await encode({ compression: 100 })).palette.length).toBe(16);
  });

  it('skips small color changes at high compression and keeps large ones', async () => {
    framePixels = [
      [RED, BLUE],
      [
        [245, 8, 0, 255],
        [255, 255, 0, 255],
      ],
    ];
    const gif = await encode({ compression: 100 });
    const [first, second] = gif.indices;
    expect(second![0]).toBe(gif.transparentIndex); // Barely changed: left as shown
    expect(second![1]).not.toBe(gif.transparentIndex);
    expect(second![1]).not.toBe(first![1]);
    expect(rgba(gif.frames[1]!)[0]).toEqual(rgba(gif.frames[0]!)[0]);
  });

  it('clears the screen in transparent GIFs only when a pixel turns transparent', async () => {
    framePixels = [
      [RED, CLEAR, BLUE],
      [RED, GREEN, BLUE],
      [CLEAR, GREEN, BLUE],
    ];
    const gif = await encode({ transparent: true });
    expect(gif.frames.map(rgba)).toEqual(framePixels);
    // Frame 1 is kept for frame 2 to draw over; frame 2 clears for frame 3
    expect(gif.disposals.slice(0, 2)).toEqual([1, 2]);
  });
});
