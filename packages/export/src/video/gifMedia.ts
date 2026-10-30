/**
 * A GIF opened as a video is (media.ts): a track saying its size and
 * length, and sinks drawing the picture it shows at a moment into canvases
 * of a pool. The pictures are the browser's own where it decodes GIFs with
 * an ImageDecoder (a frame asked for by its index comes composited) that
 * shows a trial GIF as browsers show it — WebKit's makes what's transparent
 * opaque black — else composited here (gif.ts), as they are where the
 * ImageDecoder counts a GIF's frames otherwise, or fails at one. The
 * moments are the GIF's own, read from its blocks, so every browser shows
 * the same frame at a time. The file's bytes are read once for all the
 * sinks drawing it, and let go when none does.
 */

import type { WrappedCanvas } from 'mediabunny';
import {
  GIF_TYPE,
  createGifCompositor,
  gifFrameAt,
  gifMayBeTransparent,
  readGif,
  type GifInfo,
} from './gif';
import type { FrameSink, FrameSinkOptions, VideoMedia, VideoTrackInfo } from './media';

type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws a GIF's pictures, as shown at a frame, into canvases (scaled to them). */
interface GifPictures {
  draw(index: number, canvas: Canvas): Promise<void>;
  dispose(): void;
}

/** What each GIF file read is (its blocks; small, kept while the file is) */
const infos = new WeakMap<Blob, Promise<GifInfo>>();
/** Each GIF file's bytes, while sinks composite it, and how many */
const shared = new Map<Blob, { bytes: Promise<Uint8Array>; users: number }>();

const bytesOf = async (file: Blob) => new Uint8Array(await file.arrayBuffer());

/** A GIF file's frames and size (read once for the file). */
export function gifInfoOf(file: Blob): Promise<GifInfo> {
  let info = infos.get(file);
  if (!info) {
    info = bytesOf(file).then(readGif);
    infos.set(file, info);
    // A file that wasn't read is read again when asked
    info.catch(() => infos.delete(file));
  }
  return info;
}

/** A GIF file's bytes, shared while they're used; `release` when done. */
function shareBytes(file: Blob): { bytes: Promise<Uint8Array>; release: () => void } {
  let entry = shared.get(file);
  if (!entry) {
    entry = { bytes: bytesOf(file), users: 0 };
    shared.set(file, entry);
  }
  entry.users++;
  const used = entry;
  let released = false;
  return {
    bytes: used.bytes,
    release() {
      if (released) return;
      released = true;
      if (--used.users === 0 && shared.get(file) === used) shared.delete(file);
    },
  };
}

/** A canvas as mediabunny makes them: the page's where there is one, else offscreen. */
function newCanvas(width: number, height: number): Canvas {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
}

function contextOf(canvas: Canvas): Context {
  const context = canvas.getContext('2d') as Context | null;
  if (!context) throw new Error('A canvas couldn’t be drawn on.');
  return context;
}

/** A picture drawn to fill a canvas, smoothly when it's scaled. */
function drawScaled(canvas: Canvas, picture: CanvasImageSource): void {
  const context = contextOf(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
}

/** The pictures composited here, from the file's bytes. */
function composedPictures(file: Blob, info: GifInfo): GifPictures {
  const used = shareBytes(file);
  const compositor = used.bytes.then((bytes) => createGifCompositor(bytes, info));
  /** The GIF at its own size, scaled from into canvases of other sizes */
  let full: Canvas | null = null;
  let image: ImageData | null = null;
  let warned = false;
  return {
    async draw(index, canvas) {
      let picture: Uint8ClampedArray;
      try {
        picture = (await compositor).pictureAt(index);
      } catch (error) {
        // A GIF this editor can't draw shows nothing, rather than stopping what draws it
        if (!warned) console.warn('A GIF frame could not be drawn:', error);
        warned = true;
        contextOf(canvas).clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const same = canvas.width === info.width && canvas.height === info.height;
      const target = same ? canvas : (full ??= newCanvas(info.width, info.height));
      const context = contextOf(target);
      image ??= context.createImageData(info.width, info.height);
      image.data.set(picture);
      context.putImageData(image, 0, 0);
      if (!same) drawScaled(canvas, target);
    },
    dispose: used.release,
  };
}

/**
 * A GIF of four pixels in a row, red, green, blue and white: red all along,
 * cleared; green and a transparent pixel at the second and third, put back;
 * blue at the first.
 */
const TRIAL_GIF = new Uint8Array([
  71, 73, 70, 56, 57, 97, 4, 0, 1, 0, 129, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 33,
  249, 4, 8, 10, 0, 0, 0, 44, 0, 0, 0, 0, 4, 0, 1, 0, 0, 2, 3, 4, 8, 20, 0, 33, 249, 4, 13, 10, 0,
  3, 0, 44, 1, 0, 0, 0, 2, 0, 1, 0, 0, 2, 2, 204, 10, 0, 33, 249, 4, 0, 10, 0, 0, 0, 44, 0, 0, 0, 0,
  1, 0, 1, 0, 0, 2, 2, 84, 1, 0, 59,
]);
/** Its frames as browsers show them (null: transparent) */
const TRIAL_PICTURES: Array<Array<readonly [number, number, number] | null>> = [
  [
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
    [255, 0, 0],
  ],
  [null, [0, 255, 0], null, null],
  [[0, 0, 255], null, null, null],
];

/** Whether each ImageDecoder met shows the trial GIF as browsers do (tried once) */
const trials = new WeakMap<object, Promise<boolean>>();

/** Whether this browser's ImageDecoder decodes GIFs, composited, transparency kept. */
function decoderShowsGifs(): Promise<boolean> {
  if (typeof ImageDecoder === 'undefined') return Promise.resolve(false);
  let trial = trials.get(ImageDecoder);
  if (!trial) {
    trial = (async () => {
      if (!(await ImageDecoder.isTypeSupported(GIF_TYPE))) return false;
      const decoder = new ImageDecoder({ data: TRIAL_GIF, type: GIF_TYPE });
      try {
        await decoder.tracks.ready;
        const canvas = newCanvas(4, 1);
        for (const [index, expected] of TRIAL_PICTURES.entries()) {
          const { image } = await decoder.decode({ frameIndex: index });
          try {
            drawScaled(canvas, image);
          } finally {
            image.close();
          }
          const shown = contextOf(canvas).getImageData(0, 0, 4, 1).data;
          const right = expected.every((colour, x) =>
            colour === null
              ? shown[x * 4 + 3] === 0
              : shown[x * 4 + 3] === 255 && colour.every((value, c) => shown[x * 4 + c] === value)
          );
          if (!right) return false;
        }
        return true;
      } finally {
        decoder.close();
      }
    })().catch(() => false);
    trials.set(ImageDecoder, trial);
  }
  return trial;
}

/**
 * The browser's own pictures, where its ImageDecoder shows GIFs as they
 * are and counts this one's frames as they're read here; null where not.
 */
async function browserPictures(file: Blob, info: GifInfo): Promise<GifPictures | null> {
  if (!(await decoderShowsGifs())) return null;
  let decoder: ImageDecoder | null = null;
  try {
    decoder = new ImageDecoder({ data: file.stream(), type: GIF_TYPE });
    // Its tracks known and the whole file read, its frames are counted
    await decoder.tracks.ready;
    await decoder.completed;
    if (decoder.tracks.selectedTrack?.frameCount !== info.frames.length) {
      decoder.close();
      return null;
    }
  } catch {
    decoder?.close();
    return null;
  }
  const opened = decoder;
  return {
    async draw(index, canvas) {
      const { image } = await opened.decode({ frameIndex: index });
      try {
        drawScaled(canvas, image);
      } finally {
        image.close();
      }
    },
    dispose: () => opened.close(),
  };
}

/** The browser's pictures, and composited ones should it not have them or fail at one. */
async function openPictures(file: Blob, info: GifInfo): Promise<GifPictures> {
  const browser = await browserPictures(file, info);
  let own: GifPictures | null = null;
  const ours = () => (own ??= composedPictures(file, info));
  if (!browser) return ours();
  let failed = false;
  return {
    async draw(index, canvas) {
      if (!failed) {
        try {
          return await browser.draw(index, canvas);
        } catch (error) {
          failed = true;
          browser.dispose();
          console.warn('The browser couldn’t decode a GIF’s frame; it’s composited here:', error);
        }
      }
      return ours().draw(index, canvas);
    },
    dispose() {
      if (!failed) browser.dispose();
      own?.dispose();
    },
  };
}

/** A sink's canvases' size: as asked, its shape kept where only one side is (as mediabunny's). */
function sinkSize(info: GifInfo, options: FrameSinkOptions): { width: number; height: number } {
  const aspect = info.width / info.height;
  const { width, height } = options;
  if (width !== undefined && height !== undefined) return { width, height };
  if (width !== undefined) return { width, height: Math.max(1, Math.round(width / aspect)) };
  if (height !== undefined) return { width: Math.max(1, Math.round(height * aspect)), height };
  return { width: info.width, height: info.height };
}

/** A GIF file opened to draw its pictures; dispose it when done (its sinks' pictures go with it). */
export async function openGifMedia(file: Blob): Promise<VideoMedia> {
  const info = await gifInfoOf(file);
  const opened = new Set<Promise<GifPictures>>();
  let disposed = false;

  const track: VideoTrackInfo = {
    getDisplayWidth: () => Promise.resolve(info.width),
    getDisplayHeight: () => Promise.resolve(info.height),
    getFirstTimestamp: () => Promise.resolve(0),
    computeDuration: () => Promise.resolve(info.duration),
    canBeTransparent: () => Promise.resolve(gifMayBeTransparent(info)),
  };

  function canvasSink(options: FrameSinkOptions): FrameSink {
    const { width, height } = sinkSize(info, options);
    const pool: Array<Canvas | undefined> = Array.from({ length: options.poolSize ?? 0 });
    let next = 0;
    let pictures: Promise<GifPictures> | null = null;
    // One picture drawn at a time
    let queue: Promise<unknown> = Promise.resolve();

    const nextCanvas = (): Canvas => {
      if (pool.length === 0) return newCanvas(width, height);
      const canvas = (pool[next] ??= newCanvas(width, height));
      next = (next + 1) % pool.length;
      return canvas;
    };

    const draw = (index: number): Promise<WrappedCanvas> => {
      const drawn = queue.then(async () => {
        if (disposed) throw new Error('The GIF was let go.');
        if (!pictures) {
          pictures = openPictures(file, info);
          opened.add(pictures);
        }
        const canvas = nextCanvas();
        await (await pictures).draw(index, canvas);
        const frame = info.frames[index]!;
        return { canvas, timestamp: frame.timestamp, duration: frame.duration };
      });
      queue = drawn.catch(() => {});
      return drawn;
    };

    return {
      async getCanvas(timestamp) {
        const index = gifFrameAt(info, timestamp);
        return index < 0 ? null : draw(index);
      },
      async *canvases(startTimestamp = 0, endTimestamp = Infinity) {
        const { frames } = info;
        for (let i = Math.max(0, gifFrameAt(info, startTimestamp)); i < frames.length; i++) {
          if (frames[i]!.timestamp >= endTimestamp) return;
          yield await draw(i);
        }
      },
      async *canvasesAtTimestamps(timestamps) {
        for (const timestamp of timestamps) {
          const index = gifFrameAt(info, timestamp);
          yield index < 0 ? null : await draw(index);
        }
      },
    };
  }

  return {
    track,
    canvasSink,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const pictures of opened) {
        pictures.then((open) => open.dispose()).catch(() => {});
      }
      opened.clear();
    },
  };
}
