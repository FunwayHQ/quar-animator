/**
 * Export Video Frames
 * The pictures an export's video layers show, decoded exactly for each of
 * its output frames before that frame is drawn (the frame renderer draws
 * at once, so it's handed them ready): a layer of the timeline exported
 * shows the moment of its clip the frame is at — nothing outside it, its
 * last picture while it holds it — and one of another timeline (another
 * artboard's, a symbol's) its clip's first picture, as on the canvas.
 *
 * Every moment an export shows is known before it starts (its shots), so
 * each layer's are decoded in one pass through its video, in the order the
 * shots show them (mediabunny's canvasesAtTimestamps: each packet decoded
 * once, a seek only where the moments jump — a loop starting over, a
 * gap), at the size the layer is drawn on the export (never larger than
 * the video), into a pool of two canvases: the picture shown, and the next.
 * A moment a layer shows again is the picture it has. An export that draws
 * its frames again (a GIF's two passes) starts the pass over. A video that
 * can't be decoded — its file missing, a decoder that fails or stalls —
 * draws its strip's stills instead, and the export goes on.
 */

import { timelineScopeOf } from '@quar/core';
import type { SceneGraph, VideoFrameImage, VideoFrameProvider } from '@quar/core';
import { videoPosterTime, videoTimeAt } from '@quar/animation';
import type { Node, PropertyTrack, Timeline, Video, VideoNode } from '@quar/types';
import type { CanvasSink, Input, InputVideoTrack, WrappedCanvas } from 'mediabunny';
import type { Shot } from '../exportUtils';
import type { FrameRenderContext } from '../frameRenderer';
import { openMedia, videoTrackOf, type Mediabunny } from './media';
import { stillIndexAt } from './strip';

/** Where an export's video layers get their pictures. */
export interface VideoExportSources {
  /** The document's videos: their strips stand in for files that can't be decoded */
  videos?: readonly Video[];
  /** A video's file (none: its strip's stills are drawn) */
  videoFile?: (videoId: string) => Blob | null | undefined;
}

export interface ExportVideoFramesOptions {
  /** How long a picture may take to decode before its video is given up on, in ms (default 15 s) */
  timeout?: number;
  /** Loads a strip's still (a data URI) as a picture (default: an image element) */
  loadStill?: (uri: string) => Promise<TexImageSource | null>;
}

/** The pictures an export's video layers show, one shot at a time. */
export interface ExportVideoFrames {
  /** What the frame renderer draws video layers with: the pictures of the shot prepared last */
  readonly provider: VideoFrameProvider;
  /**
   * Decode the pictures shot `index` shows (a transition's two slides'),
   * awaited before it's drawn. Shots go in order; going back starts over.
   */
  prepare(index: number): Promise<void>;
  /** The videos that couldn't be decoded, by name: their strips' stills were drawn */
  readonly problems: readonly string[];
  /** Stop decoding and let the files and pictures go (a shot being prepared too). */
  dispose(): void;
}

/** The export's size: its pixels are what a layer's size on it is measured in. */
export interface ExportVideoSize {
  width: number;
  height: number;
  multiplier?: number;
}

const TIMEOUT = 15_000;
/** Canvases a layer's pictures are drawn into in turn: the one shown and the next */
const POOL = 2;
/** Moments are nudged on by this much: a frame boundary in floating point lands in the frame it begins */
const NUDGE = 1e-5;
/** Strip stills kept loaded */
const STILLS_KEPT = 16;

/** A video layer as an export shows it: the moments of its video, shot by shot. */
interface Plan {
  node: VideoNode;
  /** Its size on the export at most, in pixels */
  width: number;
  height: number;
  /** The moments it shows, in seconds, in the order the shots show them (none twice running) */
  moments: number[];
  /** Which of them each shot shows (-1: nothing) */
  at: Int32Array;
}

/** A video opened to decode. */
interface OpenVideo {
  mb: Mediabunny;
  track: InputVideoTrack;
  width: number;
  height: number;
  alpha: boolean;
  /** Where its pictures are, in its own time */
  first: number;
  end: number;
}

/** Decodes a layer's moments. */
interface Reader {
  plan: Plan;
  serial: number;
  sink: CanvasSink | null;
  /** The pass through its moments, and the last of them it gave */
  run: AsyncGenerator<WrappedCanvas | null, void, unknown> | null;
  pulled: number;
  /** The picture it shows now, and which moment's */
  shown: VideoFrameImage | null;
  shownAt: number;
}

/** A layer of a drawing, and whether it plays on the timeline exported. */
interface DrawnLayer {
  node: VideoNode;
  plays: boolean;
  width: number;
  height: number;
}

const TIMED_OUT = Symbol('timed out');

/**
 * The pictures the video layers of `shots` show, decoded from `sources`.
 * Opens nothing (nor loads mediabunny) when no shot draws a video.
 */
export function createExportVideoFrames(
  shots: readonly Shot<FrameRenderContext>[],
  size: ExportVideoSize,
  sources: VideoExportSources = {},
  options: ExportVideoFramesOptions = {}
): ExportVideoFrames {
  const timeout = options.timeout ?? TIMEOUT;
  const loadStill = options.loadStill ?? loadImage;
  const library = new Map((sources.videos ?? []).map((video) => [video.id, video]));
  const readers = [...planShots(shots, size).values()].map(
    (plan, index): Reader => ({
      plan,
      serial: index + 1,
      sink: null,
      run: null,
      pulled: -1,
      shown: null,
      shownAt: -1,
    })
  );

  /** What each layer shows now, by node id */
  const current = new Map<string, VideoFrameImage>();
  const opened = new Map<string, Promise<OpenVideo | null>>();
  const inputs: Input[] = [];
  /** Videos given up on, and the problems said */
  const failed = new Set<string>();
  const problems: string[] = [];
  const stills = new Map<string, Promise<TexImageSource | null>>();
  let disposed = false;
  let stop: () => void = () => {};
  const stopped = new Promise<void>((resolve) => (stop = resolve));
  // One shot after another, even if asked for together
  let queue: Promise<void> = Promise.resolve();

  function giveUp(videoId: string, error?: unknown): void {
    if (failed.has(videoId) || disposed) return;
    failed.add(videoId);
    const name = library.get(videoId)?.name ?? videoId;
    problems.push(name);
    console.warn(
      `The video “${name}” couldn’t be decoded: its stills are exported instead.`,
      error
    );
    for (const reader of readers) if (reader.plan.node.videoId === videoId) endRun(reader);
  }

  function open(videoId: string): Promise<OpenVideo | null> {
    let video = opened.get(videoId);
    if (!video) {
      video = (async (): Promise<OpenVideo | null> => {
        const file = sources.videoFile?.(videoId);
        if (!file) {
          giveUp(videoId, 'Its file is missing.');
          return null;
        }
        const { mb, input } = await openMedia(file);
        inputs.push(input);
        if (disposed) return null;
        const track = await videoTrackOf(input);
        return {
          mb,
          track,
          width: await track.getDisplayWidth(),
          height: await track.getDisplayHeight(),
          alpha: await track.canBeTransparent(),
          first: await track.getFirstTimestamp(),
          end: await track.computeDuration(),
        };
      })().catch((error: unknown) => {
        giveUp(videoId, error);
        return null;
      });
      opened.set(videoId, video);
    }
    return video;
  }

  function endRun(reader: Reader): void {
    const run = reader.run;
    reader.run = null;
    // A pass waiting on its decoder ends once that's let go
    run?.return(undefined).catch(() => {});
  }

  /** The moments of a layer's pass from its `from`th on, inside its video. */
  function* momentsFrom(plan: Plan, from: number, video: OpenVideo): Generator<number> {
    const last = Math.max(video.first, video.end - NUDGE);
    for (let i = from; i < plan.moments.length; i++) {
      yield Math.min(Math.max(plan.moments[i]! + NUDGE, video.first), last);
    }
  }

  /** Waits for a picture, but not forever. */
  async function withTimeout<T>(promise: Promise<T>): Promise<T | typeof TIMED_OUT> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeout);
    });
    try {
      return await Promise.race([promise, late]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The picture of a layer's `index`th moment, decoded (null: none, or its video given up on). */
  async function decoded(reader: Reader, index: number): Promise<VideoFrameImage | null> {
    const { plan } = reader;
    const video = await open(plan.node.videoId);
    if (!video || disposed || failed.has(plan.node.videoId)) return null;
    try {
      reader.sink ??= new video.mb.CanvasSink(video.track, {
        ...decodeSize(plan, video),
        alpha: video.alpha,
        poolSize: POOL,
      });
      if (!reader.run || index !== reader.pulled + 1) {
        // A jump (or the export starting over): a pass from there
        endRun(reader);
        reader.run = reader.sink.canvasesAtTimestamps(momentsFrom(plan, index, video));
        reader.pulled = index - 1;
      }
      const next = await withTimeout(reader.run.next());
      if (next === TIMED_OUT) {
        giveUp(plan.node.videoId, 'Decoding a picture took too long.');
        return null;
      }
      reader.pulled = index;
      if (next.done || !next.value) return null;
      const { canvas, timestamp } = next.value;
      return { source: canvas, key: `${reader.serial}:${timestamp}` };
    } catch (error) {
      giveUp(plan.node.videoId, error);
      return null;
    }
  }

  /** The strip's still nearest a moment of a layer's video (null: it has none). */
  async function still(videoId: string, seconds: number): Promise<VideoFrameImage | null> {
    const strip = library.get(videoId)?.strip;
    if (!strip || strip.frames.length === 0) return null;
    const index = stillIndexAt(strip, seconds);
    const id = `${videoId}:still${index}`;
    let loading = stills.get(id);
    if (!loading) {
      loading = loadStill(strip.frames[index] ?? '').catch(() => null);
      stills.set(id, loading);
      if (stills.size > STILLS_KEPT) stills.delete(stills.keys().next().value ?? id);
    }
    const source = await loading;
    return source ? { source, key: id } : null;
  }

  async function prepareReader(reader: Reader, shot: number): Promise<void> {
    const { plan } = reader;
    const index = plan.at[shot] ?? -1;
    if (index !== reader.shownAt) {
      const videoId = plan.node.videoId;
      let picture = failed.has(videoId) ? null : await decoded(reader, index);
      if (!picture && failed.has(videoId)) picture = await still(videoId, plan.moments[index]!);
      reader.shown = picture;
      reader.shownAt = index;
    }
    if (disposed) return;
    if (reader.shown) current.set(plan.node.id, reader.shown);
  }

  async function prepareShot(shot: number): Promise<void> {
    if (disposed) return;
    current.clear();
    await Promise.all(
      readers.map((reader) =>
        (reader.plan.at[shot] ?? -1) < 0 ? undefined : prepareReader(reader, shot)
      )
    );
  }

  return {
    provider: (node) => current.get(node.id) ?? null,
    problems,
    prepare(index) {
      const prepared = queue.then(() => prepareShot(index));
      queue = prepared.catch(() => {});
      // Disposing lets a shot being prepared go at once
      return Promise.race([prepared, stopped]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const reader of readers) endRun(reader);
      for (const input of inputs) input.dispose();
      current.clear();
      stills.clear();
      stop();
    },
  };
}

/**
 * Every video layer the shots draw, and the moment of its video each shows:
 * a transition draws both its slides (the outgoing one's held frame first).
 */
function planShots(shots: readonly Shot<FrameRenderContext>[], size: ExportVideoSize) {
  const plans = new Map<string, Plan>();
  const drawn = new Map<FrameRenderContext, DrawnLayer[]>();
  for (const [index, shot] of shots.entries()) {
    const drawings = shot.transition ? [shot.transition.from, shot] : [shot];
    for (const { ctx, frame } of drawings) {
      let layers = drawn.get(ctx);
      if (!layers) {
        layers = videoLayersOf(ctx, size);
        drawn.set(ctx, layers);
      }
      for (const layer of layers) {
        let plan = plans.get(layer.node.id);
        if (!plan) {
          plan = {
            node: layer.node,
            width: layer.width,
            height: layer.height,
            moments: [],
            at: new Int32Array(shots.length).fill(-1),
          };
          plans.set(layer.node.id, plan);
        }
        plan.width = Math.max(plan.width, layer.width);
        plan.height = Math.max(plan.height, layer.height);
        const { clip } = layer.node;
        const seconds = layer.plays
          ? videoTimeAt(clip, frame, ctx.timeline.frameRate)
          : videoPosterTime(clip);
        if (seconds === null) continue;
        if (plan.moments.at(-1) !== seconds) plan.moments.push(seconds);
        plan.at[index] = plan.moments.length - 1;
      }
    }
  }
  return plans;
}

/**
 * The timeline a drawing plays: its roots' (an artboard's, exported on its
 * own), else the page's.
 */
function scopeOf(ctx: FrameRenderContext): string | null {
  const scopes = new Set(
    (ctx.exportRootIds ?? []).map((id) => timelineScopeOf(ctx.sceneGraph, id))
  );
  return scopes.size === 1 ? ([...scopes][0] ?? null) : null;
}

/**
 * The video layers a drawing shows, those in the symbols its instances draw
 * too (of no timeline: they show their first pictures), each with its size
 * on the export at most.
 */
function videoLayersOf(ctx: FrameRenderContext, size: ExportVideoSize): DrawnLayer[] {
  const { sceneGraph } = ctx;
  const multiplier = size.multiplier ?? 1;
  const pixelWidth = Math.ceil(size.width * multiplier);
  const pixelHeight = Math.ceil(size.height * multiplier);
  const bounds = ctx.viewportBounds ?? size;
  // Pixels a unit of the scene is drawn at
  const perUnit = Math.max(pixelWidth / bounds.width, pixelHeight / bounds.height);
  const scope = scopeOf(ctx);
  const tracks = tracksByNode(ctx.timeline);
  const layers: DrawnLayer[] = [];
  const playable = (node: Node): node is VideoNode =>
    node.type === 'video' && !!node.videoId && node.clip.duration > 0;

  const seenSymbols = new Set<string>();
  const symbolLayers = (symbolId: string) => {
    if (seenSymbols.has(symbolId)) return;
    seenSymbols.add(symbolId);
    const definition = ctx.symbols?.find((symbol) => symbol.id === symbolId);
    for (const inner of definition?.sceneGraphJSON.nodes ?? []) {
      if (!inner.visible) continue;
      if (inner.type === 'symbol-instance') symbolLayers(inner.symbolId);
      // Placed by its instance, wherever that is: no bigger than the export, or the video
      if (playable(inner))
        layers.push({ node: inner, plays: false, width: pixelWidth, height: pixelHeight });
    }
  };

  sceneGraph.traverseVisible(
    (node) => {
      if (node.type === 'symbol-instance') symbolLayers(node.symbolId);
      if (!playable(node)) return;
      const scale = largestScale(sceneGraph, tracks, node);
      layers.push({
        node,
        plays: timelineScopeOf(sceneGraph, node.id) === scope,
        width: largestValue(tracks, node, 'width', node.width) * scale * perUnit,
        height: largestValue(tracks, node, 'height', node.height) * scale * perUnit,
      });
    },
    undefined,
    ctx.exportRootIds
  );
  return layers;
}

function tracksByNode(timeline: Timeline): Map<string, PropertyTrack[]> {
  const byNode = new Map<string, PropertyTrack[]>();
  for (const track of timeline.tracks) {
    const list = byNode.get(track.nodeId);
    if (list) list.push(track);
    else byNode.set(track.nodeId, [track]);
  }
  return byNode;
}

/** The largest a number of a layer is, as it is or keyed. */
function largestValue(
  tracks: Map<string, PropertyTrack[]>,
  node: Node,
  property: string,
  value: number
): number {
  let largest = Math.abs(value);
  for (const track of tracks.get(node.id) ?? []) {
    if (track.property !== property) continue;
    for (const { value: keyed } of track.keyframes) {
      if (typeof keyed === 'number') largest = Math.max(largest, Math.abs(keyed));
    }
  }
  return largest;
}

/**
 * How much a layer is scaled up at most on the scene: by its own scale and
 * its ancestors', as they are or keyed (the larger of each's two, so
 * turned and skewed layers aren't drawn short of pixels).
 */
function largestScale(
  sceneGraph: SceneGraph,
  tracks: Map<string, PropertyTrack[]>,
  node: Node
): number {
  let scale = 1;
  for (const layer of [node, ...sceneGraph.getAncestors(node.id)]) {
    let largest = Math.max(Math.abs(layer.transform.scale.x), Math.abs(layer.transform.scale.y));
    for (const track of tracks.get(layer.id) ?? []) {
      if (!track.property.startsWith('transform.scale')) continue;
      for (const { value } of track.keyframes) {
        if (typeof value === 'number') largest = Math.max(largest, Math.abs(value));
        else if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
          const { x, y } = value;
          if (typeof x === 'number') largest = Math.max(largest, Math.abs(x));
          if (typeof y === 'number') largest = Math.max(largest, Math.abs(y));
        }
      }
    }
    scale *= largest;
  }
  return scale;
}

/** The size a layer's pictures are decoded at: as it's drawn at most, never larger than its video. */
function decodeSize(plan: Plan, video: OpenVideo): { width?: number; height?: number } {
  const scale = Math.max(plan.width / video.width, plan.height / video.height);
  if (!(scale < 1)) return {};
  return video.width >= video.height
    ? { width: Math.max(2, Math.ceil(video.width * scale)) }
    : { height: Math.max(2, Math.ceil(video.height * scale)) };
}

/** A still as a picture (none where there are no image elements, or it won't decode). */
async function loadImage(uri: string): Promise<TexImageSource | null> {
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.src = uri;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}
