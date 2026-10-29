/**
 * Video Clip Bar
 * A video layer's clip on its own row of the timeline: a strip of the
 * video's stills from the frame it starts on to the frame it ends, under the
 * row's keyframes, dragged (or nudged with the arrow keys) to move it, its
 * linked sound with it. It follows the clip through the scene graph on its
 * own, so the timeline's rows aren't rebuilt for it, nor redrawn as the
 * animation plays.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { videoClipEndFrame } from '@quar/animation';
import type { Video, VideoClip } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { isPosingScene } from '../../stores/scenePosing';
import { findLinkedSound } from '../../stores/videoSounds';
import styles from './VideoClipBar.module.css';

/** The bar's picture strip, in pixels high (the bar less its film edges). */
const STILL_HEIGHT = 13;
/** At most this many stills along a bar, however wide it's zoomed. */
const MAX_STILLS = 160;

/** What the bar shows of a video layer: which video, and its clip. */
interface ShownLayer {
  videoId: string;
  name: string;
  clip: VideoClip;
}

/** The video layer's video and clip, kept as the scene graph changes them. */
function useVideoLayer(nodeId: string): ShownLayer | null {
  const sceneGraph = useSceneGraph();
  const read = useCallback((): ShownLayer | null => {
    const node = sceneGraph.getNode(nodeId);
    return node?.type === 'video'
      ? { videoId: node.videoId, name: node.name, clip: node.clip }
      : null;
  }, [sceneGraph, nodeId]);
  const [layer, setLayer] = useState(read);
  useEffect(() => {
    const update = () =>
      setLayer((shown) => {
        const now = read();
        const same =
          shown !== null &&
          now !== null &&
          shown.videoId === now.videoId &&
          shown.name === now.name &&
          shown.clip.start === now.clip.start &&
          shown.clip.offset === now.clip.offset &&
          shown.clip.duration === now.clip.duration;
        return same || (shown === null && now === null) ? shown : now;
      });
    update();
    // Showing the animation moves the layer, never its clip (see isPosingScene)
    const offChanged = sceneGraph.on('nodeChanged', (event) => {
      if (event.nodeId === nodeId && !isPosingScene()) update();
    });
    // Undo, redo and opening a project replace the whole graph
    const offReplaced = sceneGraph.on('graphReplaced', update);
    return () => {
      offChanged();
      offReplaced();
    };
  }, [sceneGraph, nodeId, read]);
  return layer;
}

/** An element's width in pixels, kept as it's resized (the timeline zoomed). */
function useWidth(ref: React.RefObject<HTMLElement>, deps: unknown[]): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measured again when what sizes it changes
  }, deps);
  return width;
}

/** "2.5 s" */
function seconds(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} s`;
}

/**
 * The stills along `width` pixels of a clip showing `length` seconds of the
 * video from `offset`: each the strip's picture at the time it starts at.
 */
function stillsAlong(video: Video | undefined, offset: number, length: number, width: number) {
  const frames = video?.strip.frames ?? [];
  if (!video || frames.length === 0 || !(width > 0) || !(length > 0)) return [];
  const aspect = Math.min(4, Math.max(0.25, video.width / Math.max(1, video.height) || 16 / 9));
  const tile = STILL_HEIGHT * aspect;
  const count = Math.min(MAX_STILLS, Math.ceil(width / tile));
  const rate = video.strip.rate > 0 ? video.strip.rate : 1;
  return Array.from({ length: count }, (_, i) => {
    const time = offset + ((i * tile) / width) * length;
    const index = Math.min(frames.length - 1, Math.max(0, Math.floor(time * rate + 1e-6)));
    return { left: i * tile, width: tile, src: frames[index] ?? '' };
  });
}

interface Drag {
  original: VideoClip;
  downFrame: number;
  changed: boolean;
}

export const VideoClipBar = memo(function VideoClipBar({
  nodeId,
  duration,
}: {
  nodeId: string;
  /** The timeline's length in frames: the row's width */
  duration: number;
}) {
  const sceneGraph = useSceneGraph();
  const layer = useVideoLayer(nodeId);
  const video = useEditorStore((s) =>
    layer ? s.videos.find((candidate) => candidate.id === layer.videoId) : undefined
  );
  const frameRate = useEditorStore((s) => s.frameRate);
  const selected = useEditorStore((s) => s.selectedNodeIds.has(nodeId));
  const linked = useEditorStore((s) => findLinkedSound(s.timeline, nodeId) !== null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const clip = layer?.clip;
  const end = clip ? videoClipEndFrame(clip, frameRate) : 0;
  // Drawn no further than the timeline runs (it lengthens as a drag ends past it)
  const shownStart = clip ? Math.min(clip.start, Math.max(0, duration - 1)) : 0;
  const shownEnd = Math.max(shownStart + 1, Math.min(end, duration));
  const cut = end > duration;
  const width = useWidth(barRef, [shownStart, shownEnd, duration]);
  const shownSeconds = clip ? Math.max(0, (shownEnd - clip.start) / Math.max(1, frameRate)) : 0;
  const stills = stillsAlong(video, clip?.offset ?? 0, shownSeconds, width);

  /** The frame under the pointer, on the row (the bar's parent) that spans the timeline. */
  const frameAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.parentElement?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      return ((clientX - rect.left) / rect.width) * duration;
    },
    [duration]
  );

  /** The timeline lengthened to play the clip to its end, as for a sound. */
  const fitTimeline = useCallback(() => {
    const state = useEditorStore.getState();
    const node = sceneGraph.getNode(nodeId);
    if (node?.type !== 'video') return;
    const needed = Math.ceil(videoClipEndFrame(node.clip, state.frameRate) - 1e-6);
    if (needed > state.timelineDuration) state.setTimelineDuration(needed);
  }, [sceneGraph, nodeId]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !clip) return;
      event.stopPropagation();
      dragRef.current = { original: clip, downFrame: frameAt(event.clientX), changed: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging(true);
      // Its layer selected, as a click on the canvas would (a selection with it in stays)
      const state = useEditorStore.getState();
      if (!state.selectedNodeIds.has(nodeId)) state.setSelection([nodeId]);
    },
    [clip, frameAt, nodeId]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = frameAt(event.clientX) - drag.downFrame;
      // One undo step for the whole drag, recorded as it first moves the clip
      const node = sceneGraph.getNode(nodeId);
      const before = node?.type === 'video' ? node.clip : null;
      useEditorStore
        .getState()
        .moveVideoClip(sceneGraph, nodeId, drag.original.start + delta, !drag.changed);
      const after = sceneGraph.getNode(nodeId);
      if (after?.type === 'video' && after.clip !== before) drag.changed = true;
    },
    [frameAt, sceneGraph, nodeId]
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (drag?.changed) fitTimeline();
  }, [fitTimeline]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!clip || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowLeft' ? -1 : 1);
      useEditorStore.getState().moveVideoClip(sceneGraph, nodeId, clip.start + step);
      fitTimeline();
      // Not also the timeline's own arrow keys
      event.preventDefault();
      event.stopPropagation();
    },
    [clip, fitTimeline, sceneGraph, nodeId]
  );

  if (!layer || !clip) return null;
  const name = video?.name ?? (layer.name || 'Video');
  const lastFrame = Math.max(clip.start, Math.ceil(end) - 1);
  const frames = Math.max(1, lastFrame - clip.start + 1);
  return (
    <div
      ref={barRef}
      role="button"
      tabIndex={0}
      className={[
        styles.bar,
        selected ? styles.selected : '',
        dragging ? styles.dragging : '',
        cut ? styles.cut : '',
        video ? '' : styles.missing,
      ].join(' ')}
      style={{
        left: `${(shownStart / duration) * 100}%`,
        width: `${((shownEnd - shownStart) / duration) * 100}%`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      aria-label={`Video ${name}, frames ${clip.start} to ${lastFrame}`}
      aria-pressed={selected}
      title={[
        `${name}: from frame ${clip.start}, ${seconds(clip.duration)} (${frames} frames)`,
        cut ? ', running past the end of the timeline' : '',
        `. Drag to move it${linked ? ' with its sound' : ''}; ← and → nudge it.`,
      ].join('')}
      data-testid={`video-clip-${nodeId}`}
    >
      <div className={styles.strip} aria-hidden="true">
        {stills.map((still) => (
          <img
            key={still.left}
            className={styles.still}
            src={still.src}
            alt=""
            draggable={false}
            decoding="async"
            style={{ left: still.left, width: still.width }}
          />
        ))}
      </div>
      <span className={styles.name}>
        <Film className={styles.icon} aria-hidden="true" />
        {name}
      </span>
    </div>
  );
});
