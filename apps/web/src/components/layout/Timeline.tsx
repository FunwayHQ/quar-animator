import { useRef, useCallback, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { formatTimecode, getAnimationSpans, getTracksByNode } from '@quar/animation';
import type { AnimationSpan } from '@quar/animation';
import type { Node, EasingFunction } from '@quar/types';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
import { OnionSkinPanel } from '../common/OnionSkinPanel';
import { EasingEditor } from '../common/EasingEditor';
import { GraphEditor } from '../timeline/GraphEditor';
import {
  DEFAULT_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  useTimelineHeight,
} from '../../hooks/useTimelineHeight';
import styles from './Timeline.module.css';

// ============================================================================
// Easing presets for the context menu
// ============================================================================

const EASING_PRESETS: Array<{ label: string; value: EasingFunction }> = [
  { label: 'Linear', value: 'linear' },
  { label: 'Ease In', value: 'easeInCubic' },
  { label: 'Ease Out', value: 'easeOutCubic' },
  { label: 'Ease In/Out', value: 'easeInOutCubic' },
  { label: 'Ease In Back', value: 'easeInBack' },
  { label: 'Ease Out Back', value: 'easeOutBack' },
  { label: 'Ease Out Bounce', value: 'easeOutBounce' },
  { label: 'Ease Out Elastic', value: 'easeOutElastic' },
];

/** Space always left above the timeline so the canvas stays usable. */
const MIN_WORKSPACE_HEIGHT = 150;

function easingsMatch(a: EasingFunction, b: EasingFunction): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'string' || typeof b === 'string') return false;
  return (
    a.type === 'cubicBezier' &&
    b.type === 'cubicBezier' &&
    a.points[0] === b.points[0] &&
    a.points[1] === b.points[1] &&
    a.points[2] === b.points[2] &&
    a.points[3] === b.points[3]
  );
}

export interface TimelineProps {
  /** Playback callbacks from usePlayback hook — controls the PlaybackController */
  playback?: {
    togglePlay: () => void;
    play: () => void;
    pause: () => void;
    stop: () => void;
    goToStart: () => void;
    goToEnd: () => void;
    nextFrame: () => void;
    prevFrame: () => void;
  };
}

export function Timeline({ playback }: TimelineProps = {}) {
  const sceneGraph = useSceneGraph();
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const isLooping = useEditorStore((s) => s.isLooping);
  const duration = useEditorStore((s) => s.timelineDuration);
  const frameRate = useEditorStore((s) => s.frameRate);
  const expanded = useEditorStore((s) => s.timelineExpanded);
  const autoKeyframe = useEditorStore((s) => s.autoKeyframe);
  const timeline = useEditorStore((s) => s.timeline);
  const selectedKeyframeIds = useEditorStore((s) => s.selectedKeyframeIds);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setIsLooping = useEditorStore((s) => s.setIsLooping);
  const setTimelineDuration = useEditorStore((s) => s.setTimelineDuration);
  const toggleTimelineExpanded = useEditorStore((s) => s.toggleTimelineExpanded);
  const toggleAutoKeyframe = useEditorStore((s) => s.toggleAutoKeyframe);
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe);
  const addKeyframeToSelection = useEditorStore((s) => s.addKeyframeToSelection);
  const clearKeyframeSelection = useEditorStore((s) => s.clearKeyframeSelection);
  const removeSelectedKeyframes = useEditorStore((s) => s.removeSelectedKeyframes);
  const deleteLayerAnimation = useEditorStore((s) => s.deleteLayerAnimation);
  const setSelectedKeyframeIds = useEditorStore((s) => s.setSelectedKeyframeIds);
  const setSelection = useEditorStore((s) => s.setSelection);
  const addKeyframeAtFrame = useEditorStore((s) => s.addKeyframeAtFrame);
  const setKeyframeEasing = useEditorStore((s) => s.setKeyframeEasing);
  const copySelectedKeyframes = useEditorStore((s) => s.copySelectedKeyframes);
  const pasteKeyframes = useEditorStore((s) => s.pasteKeyframes);
  const moveSelectedKeyframes = useEditorStore((s) => s.moveSelectedKeyframes);
  const keyframeClipboard = useEditorStore((s) => s.keyframeClipboard);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);

  const onionSkinEnabled = useEditorStore((s) => s.onionSkin.enabled);
  const toggleOnionSkin = useEditorStore((s) => s.toggleOnionSkin);
  const timelineViewMode = useEditorStore((s) => s.timelineViewMode);
  const toggleTimelineViewMode = useEditorStore((s) => s.toggleTimelineViewMode);

  const workAreaEnabled = useEditorStore((s) => s.workAreaEnabled);
  const workAreaStart = useEditorStore((s) => s.workAreaStart);
  const workAreaEnd = useEditorStore((s) => s.workAreaEnd);
  const setWorkAreaStart = useEditorStore((s) => s.setWorkAreaStart);
  const setWorkAreaEnd = useEditorStore((s) => s.setWorkAreaEnd);
  const setWorkAreaRange = useEditorStore((s) => s.setWorkAreaRange);
  const setWorkAreaEnabled = useEditorStore((s) => s.setWorkAreaEnabled);
  const toggleWorkArea = useEditorStore((s) => s.toggleWorkArea);
  const clearWorkArea = useEditorStore((s) => s.clearWorkArea);

  const [showOnionSkinPanel, setShowOnionSkinPanel] = useState(false);
  const [durationDraft, setDurationDraft] = useState(String(duration));
  const [zoomPercent, setZoomPercent] = useState(100);
  const [easingEditor, setEasingEditor] = useState<{
    x: number;
    y: number;
    easing: EasingFunction;
  } | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksAreaRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const previousZoomPercentRef = useRef(zoomPercent);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    frame: number;
    keyframeId?: string;
    nodeId?: string;
    property?: string;
    /** Layer row the menu was opened on (label or keyframe lane). */
    layerNodeId?: string;
    /** Opened on the layer label, so show only the layer's own items. */
    layerMenu?: boolean;
  } | null>(null);

  // Drag state for moving keyframes
  const dragRef = useRef<{
    startX: number;
    startFrame: number;
    trackWidth: number;
  } | null>(null);

  // Drag state for work area handles
  const workAreaDragRef = useRef<{
    type: 'start' | 'end' | 'body';
    startX: number;
    initialStart: number;
    initialEnd: number;
    rulerWidth: number;
  } | null>(null);
  const rangeSelectionRef = useRef<{
    startFrame: number;
    rulerLeft: number;
    rulerWidth: number;
  } | null>(null);
  const suppressRulerClickRef = useRef(false);

  // ------- Panel resize (drag the top border) -------

  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = useTimelineHeight();
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{ startY: number; startHeight: number; maxHeight: number } | null>(
    null
  );

  const getMaxTimelineHeight = useCallback(() => {
    const container = timelineRef.current?.parentElement;
    if (!container || container.clientHeight === 0) return Infinity;
    return Math.max(MIN_TIMELINE_HEIGHT, container.clientHeight - MIN_WORKSPACE_HEIGHT);
  }, []);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !timelineRef.current) return;
      e.preventDefault();
      resizeDragRef.current = {
        startY: e.clientY,
        // Start from the rendered height: CSS may be capping the stored one.
        startHeight: timelineRef.current.getBoundingClientRect().height,
        maxHeight: getMaxTimelineHeight(),
      };
      if (typeof e.currentTarget.setPointerCapture === 'function') {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      setIsResizing(true);
    },
    [getMaxTimelineHeight]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      // Dragging up (smaller clientY) makes the panel taller.
      setTimelineHeight(Math.min(drag.maxHeight, drag.startHeight + drag.startY - e.clientY));
    },
    [setTimelineHeight]
  );

  const handleResizePointerUp = useCallback(() => {
    resizeDragRef.current = null;
    setIsResizing(false);
  }, []);

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 50 : 10;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTimelineHeight(Math.min(getMaxTimelineHeight(), timelineHeight + step));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTimelineHeight(timelineHeight - step);
      }
    },
    [getMaxTimelineHeight, setTimelineHeight, timelineHeight]
  );

  // Keep the resize cursor (and no text selection) while dragging over other UI.
  useEffect(() => {
    if (!isResizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [isResizing]);

  useLayoutEffect(() => {
    if (previousZoomPercentRef.current === zoomPercent) return;
    previousZoomPercentRef.current = zoomPercent;

    const viewport = tracksAreaRef.current;
    if (!viewport) return;
    const viewportWidth = viewport.clientWidth;
    const contentWidth = viewportWidth * (zoomPercent / 100);
    const playheadX = (currentFrame / duration) * contentWidth;
    viewport.scrollLeft = Math.max(
      0,
      Math.min(contentWidth - viewportWidth, playheadX - viewportWidth / 2)
    );
  }, [zoomPercent, currentFrame, duration]);

  useEffect(() => {
    setDurationDraft(String(duration));
  }, [duration]);

  const commitDurationDraft = useCallback(() => {
    const parsedDuration = Number.parseInt(durationDraft, 10);
    if (Number.isFinite(parsedDuration) && parsedDuration >= 1) {
      setTimelineDuration(parsedDuration);
    } else {
      setDurationDraft(String(duration));
    }
  }, [durationDraft, duration, setTimelineDuration]);

  const durationControl = (
    <label className={styles.durationControl}>
      <span>Frames</span>
      <input
        className={styles.durationInput}
        type="number"
        min={1}
        max={Number.MAX_SAFE_INTEGER}
        step={1}
        value={durationDraft}
        onChange={(event) => setDurationDraft(event.target.value)}
        onBlur={commitDurationDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDurationDraft(String(duration));
          }
        }}
        aria-label="Timeline duration in frames"
        data-testid="timeline-duration-input"
      />
    </label>
  );

  const zoomControl =
    timelineViewMode === 'graph' ? null : (
      <div
        className={styles.zoomControl}
        role="group"
        aria-label="Timeline zoom controls"
        title="Hold Shift while scrolling to pan horizontally"
      >
        <button
          className={styles.zoomButton}
          type="button"
          onClick={() => setZoomPercent((zoom) => Math.max(25, zoom - 25))}
          disabled={zoomPercent <= 25}
          title="Zoom out timeline"
          aria-label="Zoom out timeline"
        >
          −
        </button>
        <span className={styles.zoomLevel} data-testid="timeline-zoom-level">
          {zoomPercent}%
        </span>
        <button
          className={styles.zoomButton}
          type="button"
          onClick={() => setZoomPercent((zoom) => Math.min(800, zoom + 25))}
          disabled={zoomPercent >= 800}
          title="Zoom in timeline"
          aria-label="Zoom in timeline"
        >
          +
        </button>
      </div>
    );

  // Track scene graph changes for layer labels
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    const update = () => {
      const rows: Node[] = [];
      const visit = (node: Node) => {
        rows.push(node);
        for (const childId of [...node.children].reverse()) {
          const child = sceneGraph.getNode(childId);
          if (child) visit(child);
        }
      };
      for (const root of [...sceneGraph.getRootNodes()].reverse()) visit(root);
      setNodes(rows);
    };
    update();
    const unsub = sceneGraph.on('nodeAdded', update);
    const unsub2 = sceneGraph.on('nodeRemoved', update);
    const unsub3 = sceneGraph.on('nodeMoved', update);
    const unsub4 = sceneGraph.on('nodeChanged', update);
    return () => {
      unsub();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [sceneGraph]);

  // Build a lookup from keyframe ID -> { nodeId, property } for store operations
  const keyframeMap = useMemo(() => {
    const map = new Map<string, { nodeId: string; property: string }>();
    for (const track of timeline.tracks) {
      for (const kf of track.keyframes) {
        map.set(kf.id, { nodeId: track.nodeId, property: track.property });
      }
    }
    return map;
  }, [timeline]);

  // Build per-node keyframe data for rendering
  const nodeKeyframes = useMemo(() => {
    const result = new Map<
      string,
      Array<{ id: string; time: number; property: string; nodeId: string }>
    >();
    for (const node of nodes) {
      const tracks = getTracksByNode(timeline, node.id);
      const kfs: Array<{ id: string; time: number; property: string; nodeId: string }> = [];
      for (const track of tracks) {
        for (const kf of track.keyframes) {
          kfs.push({ id: kf.id, time: kf.time, property: track.property, nodeId: node.id });
        }
      }
      if (kfs.length > 0) {
        result.set(node.id, kfs);
      }
    }
    return result;
  }, [nodes, timeline]);

  // Frame ranges where each node animates — drawn as a line through the
  // keyframes that make up one animation
  const nodeSpans = useMemo(() => {
    const result = new Map<string, AnimationSpan[]>();
    for (const node of nodes) {
      const spans = getAnimationSpans(getTracksByNode(timeline, node.id));
      if (spans.length > 0) result.set(node.id, spans);
    }
    return result;
  }, [nodes, timeline]);

  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (suppressRulerClickRef.current) {
        suppressRulerClickRef.current = false;
        return;
      }
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.round((x / rect.width) * duration);
      setCurrentFrame(frame);
      clearKeyframeSelection();
    },
    [duration, setCurrentFrame, clearKeyframeSelection]
  );

  // Dragging on the ruler selects a work area and turns looping on. A normal
  // click continues to scrub the playhead.
  const handleRulerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      if (rect.width <= 0) return;
      const startFrame = Math.max(
        0,
        Math.min(duration - 1, Math.round(((e.clientX - rect.left) / rect.width) * duration))
      );
      rangeSelectionRef.current = {
        startFrame,
        rulerLeft: rect.left,
        rulerWidth: rect.width,
      };
      if (typeof e.currentTarget.setPointerCapture === 'function') {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [duration]
  );

  const handleRulerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const selection = rangeSelectionRef.current;
      if (!selection) return;
      const frame = Math.max(
        0,
        Math.min(
          duration - 1,
          Math.round(((e.clientX - selection.rulerLeft) / selection.rulerWidth) * duration)
        )
      );
      if (frame === selection.startFrame) return;

      suppressRulerClickRef.current = true;
      setWorkAreaRange(
        Math.min(selection.startFrame, frame),
        Math.max(selection.startFrame, frame)
      );
      setWorkAreaEnabled(true);
      setIsLooping(true);
    },
    [duration, setWorkAreaRange, setWorkAreaEnabled, setIsLooping]
  );

  const handleRulerPointerUp = useCallback(() => {
    rangeSelectionRef.current = null;
  }, []);

  const togglePlay = useCallback(() => {
    if (playback) {
      playback.togglePlay();
    } else {
      setIsPlaying(!isPlaying);
    }
  }, [playback, isPlaying, setIsPlaying]);

  const goToStart = useCallback(() => {
    if (playback) {
      playback.stop();
    } else {
      setCurrentFrame(0);
      setIsPlaying(false);
    }
  }, [playback, setCurrentFrame, setIsPlaying]);

  const goToEnd = useCallback(() => {
    if (playback) {
      playback.pause();
      playback.goToEnd();
    } else {
      setCurrentFrame(duration - 1);
      setIsPlaying(false);
    }
  }, [playback, duration, setCurrentFrame, setIsPlaying]);

  const stepFrame = useCallback(
    (delta: number) => {
      if (playback) {
        if (delta > 0) playback.nextFrame();
        else playback.prevFrame();
      } else {
        setCurrentFrame(currentFrame + delta);
      }
    },
    [playback, currentFrame, setCurrentFrame]
  );

  const toggleLoop = useCallback(() => {
    setIsLooping(!isLooping);
  }, [isLooping, setIsLooping]);

  // Ruler marks: 11 marks across the timeline
  const rulerMarks = Array.from({ length: 11 }, (_, i) => {
    const frame = Math.round((i / 10) * duration);
    return { index: i, frame };
  });

  // ------- Keyframe click handlers -------

  const handleKeyframeClick = useCallback(
    (e: React.MouseEvent, kfId: string) => {
      e.stopPropagation();
      if (e.shiftKey) {
        addKeyframeToSelection(kfId);
      } else {
        selectKeyframe(kfId);
      }
    },
    [selectKeyframe, addKeyframeToSelection]
  );

  const handleKeyframeContextMenu = useCallback(
    (e: React.MouseEvent, kfId: string, nodeId: string, property: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedKeyframeIds.has(kfId)) {
        selectKeyframe(kfId);
      }
      // Calculate frame from position
      const tracks = tracksRef.current;
      if (!tracks) return;
      const rect = tracks.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.max(0, Math.min(duration - 1, Math.round((x / rect.width) * duration)));
      setContextMenu({ x: e.clientX, y: e.clientY, frame, keyframeId: kfId, nodeId, property });
    },
    [duration, selectedKeyframeIds, selectKeyframe]
  );

  // ------- Keyframe drag-to-move -------

  const handleKeyframePointerDown = useCallback(
    (e: React.PointerEvent, kfId: string) => {
      if (e.button !== 0) return;
      const tracks = tracksRef.current;
      if (!tracks) return;
      const rect = tracks.getBoundingClientRect();
      const startFrame = Math.round(((e.clientX - rect.left) / rect.width) * duration);
      dragRef.current = { startX: e.clientX, startFrame, trackWidth: rect.width };
      // Ensure this keyframe is selected
      if (!selectedKeyframeIds.has(kfId)) {
        if (e.shiftKey) {
          addKeyframeToSelection(kfId);
        } else {
          selectKeyframe(kfId);
        }
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [duration, selectedKeyframeIds, selectKeyframe, addKeyframeToSelection]
  );

  const handleKeyframePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const deltaFrames = Math.round((dx / dragRef.current.trackWidth) * duration);
      if (deltaFrames !== 0) {
        moveSelectedKeyframes(keyframeMap, deltaFrames);
        dragRef.current.startX = e.clientX;
      }
    },
    [duration, keyframeMap, moveSelectedKeyframes]
  );

  const handleKeyframePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ------- Track click (deselect keyframes) -------

  const handleTrackClick = useCallback(() => {
    clearKeyframeSelection();
  }, [clearKeyframeSelection]);

  // ------- Work area drag handlers -------

  const handleWorkAreaPointerDown = useCallback(
    (e: React.PointerEvent, type: 'start' | 'end' | 'body') => {
      if (e.button !== 0) return;
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      workAreaDragRef.current = {
        type,
        startX: e.clientX,
        initialStart: workAreaStart,
        initialEnd: workAreaEnd,
        rulerWidth: rect.width,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.stopPropagation();
    },
    [workAreaStart, workAreaEnd]
  );

  const handleWorkAreaPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = workAreaDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const deltaFrames = Math.round((dx / drag.rulerWidth) * duration);
      if (deltaFrames === 0) return;

      if (drag.type === 'start') {
        setWorkAreaStart(drag.initialStart + deltaFrames);
      } else if (drag.type === 'end') {
        setWorkAreaEnd(drag.initialEnd + deltaFrames);
      } else {
        // body: move both together
        const newStart = drag.initialStart + deltaFrames;
        const newEnd = drag.initialEnd + deltaFrames;
        setWorkAreaRange(newStart, newEnd);
      }
    },
    [duration, setWorkAreaStart, setWorkAreaEnd, setWorkAreaRange]
  );

  const handleWorkAreaPointerUp = useCallback(() => {
    workAreaDragRef.current = null;
  }, []);

  useEffect(() => {
    const viewport = tracksAreaRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
      if (maxScrollLeft <= 0) return;

      // Magic Mouse and trackpad side swipes arrive as horizontal wheel deltas.
      // Shift+vertical wheel is also supported for mice without horizontal scrolling.
      let delta = event.deltaX;
      if (event.shiftKey && event.deltaY !== 0 && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        delta = event.deltaY;
      }
      if (delta === 0) return;

      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 40;
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= viewport.clientWidth;

      event.preventDefault();
      viewport.scrollLeft = Math.max(0, Math.min(maxScrollLeft, viewport.scrollLeft + delta));
    };

    // React registers wheel handlers as passive in some browsers; a native
    // non-passive listener lets us reliably prevent a second browser scroll.
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [expanded, timelineViewMode]);

  // ------- Context menu handlers -------

  const handleTimelineContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, layerNodeId?: string) => {
      e.preventDefault();
      // A lane's menu replaces the surrounding tracks menu.
      if (layerNodeId) e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = e.clientX - rect.left;
      const frame = Math.max(0, Math.min(duration - 1, Math.round((x / rect.width) * duration)));
      setContextMenu({ x: e.clientX, y: e.clientY, frame, layerNodeId });
    },
    [duration]
  );

  const handleLayerLabelContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      // Like the Layers panel, right-click targets the layer by selecting it,
      // keeping an existing multi-selection that already includes it.
      if (!selectedNodeIds.has(nodeId)) setSelection([nodeId]);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        frame: currentFrame,
        layerNodeId: nodeId,
        layerMenu: true,
      });
    },
    [selectedNodeIds, setSelection, currentFrame]
  );

  const contextMenuItems = useCallback((): ContextMenuEntry[] => {
    if (!contextMenu) return [];

    // Layer animation actions apply to the whole selection when the clicked
    // layer is part of it, otherwise to that layer alone.
    const layerTargets = (nodeId: string) => {
      const ids = selectedNodeIds.has(nodeId) ? [...selectedNodeIds] : [nodeId];
      const animatedIds = ids.filter((id) => nodeKeyframes.has(id));
      return {
        animatedIds,
        keyframeIds: animatedIds.flatMap((id) => (nodeKeyframes.get(id) ?? []).map((kf) => kf.id)),
      };
    };
    const deleteAnimationItem = (nodeId: string): ContextMenuEntry => {
      const { animatedIds } = layerTargets(nodeId);
      return {
        id: 'delete-layer-animation',
        label:
          animatedIds.length > 1
            ? `Delete Animation (${animatedIds.length} Layers)`
            : 'Delete Animation',
        danger: true,
        disabled: animatedIds.length === 0,
        onClick: () => deleteLayerAnimation(sceneGraph, animatedIds),
      };
    };

    // Layer label context menu
    if (contextMenu.layerMenu && contextMenu.layerNodeId) {
      const nodeId = contextMenu.layerNodeId;
      const { keyframeIds } = layerTargets(nodeId);
      const items: ContextMenuEntry[] = [
        {
          id: 'select-layer-keyframes',
          label: 'Select Keyframes',
          disabled: keyframeIds.length === 0,
          onClick: () => setSelectedKeyframeIds(keyframeIds),
        },
      ];
      if (keyframeClipboard) {
        items.push({
          id: 'paste-layer-keyframes',
          label: `Paste Keyframes at Frame ${contextMenu.frame}`,
          onClick: () => pasteKeyframes(nodeId, contextMenu.frame),
        });
      }
      items.push({ type: 'separator' }, deleteAnimationItem(nodeId));
      return items;
    }

    // Keyframe context menu
    if (contextMenu.keyframeId && contextMenu.nodeId && contextMenu.property) {
      const items: ContextMenuEntry[] = [];

      // Find the easing of the first selected keyframe for checkmark
      let currentKfEasing: EasingFunction = 'linear';
      for (const track of timeline.tracks) {
        for (const kf of track.keyframes) {
          if (selectedKeyframeIds.has(kf.id)) {
            currentKfEasing = kf.easing;
            break;
          }
        }
        if (currentKfEasing !== 'linear') break;
      }

      // Easing presets with checkmark
      let anyPresetMatch = false;
      for (const preset of EASING_PRESETS) {
        const isActive = easingsMatch(currentKfEasing, preset.value);
        if (isActive) anyPresetMatch = true;
        items.push({
          id: `easing-${typeof preset.value === 'string' ? preset.value : 'custom'}`,
          label: isActive ? `\u2713 ${preset.label}` : `\u2003${preset.label}`,
          onClick: () => {
            // Apply to all selected keyframes
            for (const kfId of selectedKeyframeIds) {
              const info = keyframeMap.get(kfId);
              if (info) {
                setKeyframeEasing(info.nodeId, info.property, kfId, preset.value);
              }
            }
          },
        });
      }

      // Show checkmark on "Custom Easing..." when a non-preset easing is active
      const customPrefix = !anyPresetMatch && currentKfEasing !== 'linear' ? '\u2713 ' : '';
      items.push({
        id: 'custom-easing',
        label: `${customPrefix}Custom Easing\u2026`,
        onClick: () => {
          setEasingEditor({
            x: contextMenu.x,
            y: contextMenu.y,
            easing: currentKfEasing,
          });
        },
      });

      items.push({ type: 'separator' });

      items.push({
        id: 'copy-keyframes',
        label: 'Copy Keyframes',
        shortcut: 'Ctrl+C',
        onClick: () => copySelectedKeyframes(keyframeMap),
      });

      items.push({
        id: 'delete-keyframes',
        label: 'Delete Keyframes',
        shortcut: 'Del',
        danger: true,
        onClick: () => removeSelectedKeyframes(keyframeMap),
      });

      return items;
    }

    // Timeline ruler context menu
    const items: ContextMenuEntry[] = [
      {
        id: 'go-to-frame',
        label: `Go To Frame ${contextMenu.frame}`,
        onClick: () => setCurrentFrame(contextMenu.frame),
      },
      {
        id: 'add-opacity-keyframe',
        label: `Add Opacity Keyframe at Frame ${contextMenu.frame}`,
        disabled: selectedNodeIds.size === 0,
        onClick: () => {
          setCurrentFrame(contextMenu.frame);
          for (const nodeId of selectedNodeIds) {
            const node = sceneGraph.getNode(nodeId);
            if (node) addKeyframeAtFrame(nodeId, 'opacity', contextMenu.frame, node.opacity);
          }
        },
      },
      { type: 'separator' },
      {
        id: 'go-to-start',
        label: 'Go To Start',
        shortcut: 'Home',
        onClick: () => {
          setCurrentFrame(0);
          setIsPlaying(false);
        },
      },
      {
        id: 'go-to-end',
        label: 'Go To End',
        shortcut: 'End',
        onClick: () => {
          setCurrentFrame(duration - 1);
          setIsPlaying(false);
        },
      },
    ];

    // Work area items
    items.push({ type: 'separator' });
    items.push({
      id: 'set-work-area-start',
      label: `Set Work Area Start (${contextMenu.frame})`,
      shortcut: 'I',
      onClick: () => {
        setWorkAreaStart(contextMenu.frame);
        useEditorStore.getState().setWorkAreaEnabled(true);
      },
    });
    items.push({
      id: 'set-work-area-end',
      label: `Set Work Area End (${contextMenu.frame})`,
      shortcut: 'Shift+I',
      onClick: () => {
        setWorkAreaEnd(contextMenu.frame);
        useEditorStore.getState().setWorkAreaEnabled(true);
      },
    });
    if (workAreaEnabled) {
      items.push({
        id: 'clear-work-area',
        label: 'Clear Work Area',
        onClick: () => clearWorkArea(),
      });
    }

    // Add paste option if clipboard has content; a lane pastes onto its own layer
    const pasteTargetId = contextMenu.layerNodeId ?? [...selectedNodeIds][0];
    if (keyframeClipboard && pasteTargetId) {
      items.push({ type: 'separator' });
      items.push({
        id: 'paste-keyframes',
        label: 'Paste Keyframes',
        shortcut: 'Ctrl+V',
        onClick: () => pasteKeyframes(pasteTargetId, contextMenu.frame),
      });
    }

    if (contextMenu.layerNodeId) {
      items.push({ type: 'separator' }, deleteAnimationItem(contextMenu.layerNodeId));
    }

    return items;
  }, [
    contextMenu,
    duration,
    timeline,
    selectedKeyframeIds,
    keyframeMap,
    nodeKeyframes,
    setCurrentFrame,
    setIsPlaying,
    addKeyframeAtFrame,
    sceneGraph,
    setKeyframeEasing,
    copySelectedKeyframes,
    removeSelectedKeyframes,
    deleteLayerAnimation,
    setSelectedKeyframeIds,
    pasteKeyframes,
    keyframeClipboard,
    selectedNodeIds,
    workAreaEnabled,
    setWorkAreaStart,
    setWorkAreaEnd,
    clearWorkArea,
  ]);

  // ============================================================
  // Collapsed mode: thin bar
  // ============================================================

  if (!expanded) {
    return (
      <div className={`${styles.timeline} ${styles.timelineCollapsed}`}>
        <div className={styles.collapsedControls}>
          <button
            className={styles.expandButton}
            onClick={toggleTimelineExpanded}
            title="Expand timeline"
            aria-label="Expand timeline"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>

          <button
            className={`${styles.controlButton} ${styles.playButton}`}
            onClick={togglePlay}
            title="Play/Pause (Space)"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5 3 19 12 5 21" />
              </svg>
            )}
          </button>

          <div className={styles.timeDisplay}>
            <span className={styles.currentTime}>{formatTimecode(currentFrame, frameRate)}</span>
            <span className={styles.separator}>/</span>
            <span className={styles.totalTime}>{formatTimecode(duration, frameRate)}</span>
          </div>

          {durationControl}

          <button
            className={`${styles.optionButton} ${isLooping ? styles.active : ''}`}
            onClick={toggleLoop}
            title="Toggle loop (L)"
            aria-label="Toggle loop"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Expanded mode: full timeline
  // ============================================================

  return (
    <div className={styles.timeline} ref={timelineRef} style={{ height: timelineHeight }}>
      {/* Resize handle on the top border: drag, arrow keys, or double-click to reset.
          A focusable separator is the ARIA window-splitter pattern, which jsx-a11y
          doesn't recognize as interactive. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ''}`}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline"
        aria-valuenow={timelineHeight}
        aria-valuemin={MIN_TIMELINE_HEIGHT}
        tabIndex={0}
        title="Drag to resize the timeline (double-click to reset)"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        onDoubleClick={() => setTimelineHeight(DEFAULT_TIMELINE_HEIGHT)}
        onKeyDown={handleResizeKeyDown}
        data-testid="timeline-resize-handle"
      />
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      {/* Controls Bar */}
      <div className={styles.controls}>
        <button
          className={styles.collapseButton}
          onClick={toggleTimelineExpanded}
          title="Collapse timeline"
          aria-label="Collapse timeline"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div className={styles.transportControls}>
          <button
            className={styles.controlButton}
            onClick={goToStart}
            title="Go to start (Home)"
            aria-label="Go to start"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="19 20 9 12 19 4" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </button>
          <button
            className={styles.controlButton}
            onClick={() => stepFrame(-1)}
            title="Previous frame (,)"
            aria-label="Previous frame"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="19 20 9 12 19 4" />
            </svg>
          </button>
          <button
            className={`${styles.controlButton} ${styles.playButton}`}
            onClick={togglePlay}
            title="Play/Pause (Space)"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5 3 19 12 5 21" />
              </svg>
            )}
          </button>
          <button
            className={styles.controlButton}
            onClick={() => stepFrame(1)}
            title="Next frame (.)"
            aria-label="Next frame"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 4 15 12 5 20" />
            </svg>
          </button>
          <button
            className={styles.controlButton}
            onClick={goToEnd}
            title="Go to end (End)"
            aria-label="Go to end"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 4 15 12 5 20" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>
        </div>

        <div className={styles.timeDisplay}>
          <span className={styles.currentTime}>{formatTimecode(currentFrame, frameRate)}</span>
          <span className={styles.separator}>/</span>
          <span className={styles.totalTime}>{formatTimecode(duration, frameRate)}</span>
        </div>

        {durationControl}

        <div className={styles.options}>
          {zoomControl}
          <button
            className={`${styles.optionButton} ${autoKeyframe ? styles.active : ''}`}
            onClick={toggleAutoKeyframe}
            title="Toggle auto-keyframe (K)"
            aria-label="Toggle auto-keyframe"
            data-testid="auto-keyframe-toggle"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </button>
          <button
            className={`${styles.optionButton} ${isLooping ? styles.active : ''}`}
            onClick={toggleLoop}
            title="Toggle loop (L)"
            aria-label="Toggle loop"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          <button
            className={`${styles.optionButton} ${workAreaEnabled ? styles.active : ''}`}
            onClick={toggleWorkArea}
            title="Toggle work area (Alt+W)"
            aria-label="Toggle work area"
            data-testid="work-area-toggle"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            </svg>
          </button>
          <button
            className={`${styles.optionButton} ${timelineViewMode === 'graph' ? styles.active : ''}`}
            onClick={toggleTimelineViewMode}
            title="Toggle graph editor (G)"
            aria-label="Toggle graph editor"
            data-testid="graph-editor-toggle"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className={`${styles.optionButton} ${onionSkinEnabled ? styles.active : ''}`}
              title="Toggle onion skinning (Shift+O)"
              aria-label="Toggle onion skinning"
              onClick={() => setShowOnionSkinPanel(!showOnionSkinPanel)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleOnionSkin();
              }}
              data-testid="onion-skin-button"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </button>
            {showOnionSkinPanel && <OnionSkinPanel />}
          </div>
        </div>
      </div>

      {/* Timeline Area — Graph Editor or Dope Sheet */}
      {timelineViewMode === 'graph' ? (
        <GraphEditor />
      ) : (
        <div className={styles.timelineArea}>
          {/* Layer Labels */}
          <div className={styles.layerLabels}>
            {nodes.length > 0 ? (
              nodes.map((node) => (
                <div
                  key={node.id}
                  className={`${styles.layerLabel} ${selectedNodeIds.has(node.id) ? styles.selected : ''}`}
                  onContextMenu={(e) => handleLayerLabelContextMenu(e, node.id)}
                  data-testid={`timeline-layer-${node.id}`}
                >
                  {node.name ?? node.id}
                </div>
              ))
            ) : (
              <div className={styles.layerLabel}>No layers</div>
            )}
          </div>

          {/* Tracks Area */}
          <div className={styles.tracksArea} ref={tracksAreaRef} data-testid="timeline-scroll-area">
            <div
              className={styles.timelineContent}
              style={{ width: `${zoomPercent}%` }}
              data-testid="timeline-content"
            >
              {/* Ruler */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keyboard navigation handled by useTimelineShortcuts hook */}
              <div
                className={styles.ruler}
                ref={rulerRef}
                onClick={handleRulerClick}
                onPointerDown={handleRulerPointerDown}
                onPointerMove={handleRulerPointerMove}
                onPointerUp={handleRulerPointerUp}
                onPointerCancel={handleRulerPointerUp}
                onContextMenu={handleTimelineContextMenu}
                role="slider"
                aria-valuenow={currentFrame}
                aria-valuemin={0}
                aria-valuemax={duration - 1}
                aria-label="Timeline scrubber. Drag to select a looping range."
                tabIndex={0}
                data-testid="timeline-ruler"
              >
                {rulerMarks.map(({ index, frame }) => (
                  <div key={index} className={styles.rulerMark} style={{ left: `${index * 10}%` }}>
                    <span className={styles.rulerLabel}>{frame}</span>
                  </div>
                ))}
                {/* Work Area overlay in ruler */}
                {workAreaEnabled && (
                  <>
                    {/* Left dimmed region */}
                    <div
                      className={styles.workAreaDimmed}
                      style={{ left: 0, width: `${(workAreaStart / duration) * 100}%` }}
                    />
                    {/* Right dimmed region */}
                    <div
                      className={styles.workAreaDimmed}
                      style={{ left: `${((workAreaEnd + 1) / duration) * 100}%`, right: 0 }}
                    />
                    {/* Active bar */}
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <div
                      className={styles.workAreaBar}
                      style={{
                        left: `${(workAreaStart / duration) * 100}%`,
                        width: `${((workAreaEnd - workAreaStart + 1) / duration) * 100}%`,
                      }}
                      onPointerDown={(e) => handleWorkAreaPointerDown(e, 'body')}
                      onPointerMove={handleWorkAreaPointerMove}
                      onPointerUp={handleWorkAreaPointerUp}
                    />
                    {/* Start handle */}
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <div
                      className={styles.workAreaHandleStart}
                      style={{
                        left: `${(workAreaStart / duration) * 100}%`,
                        transform: 'translateX(-100%)',
                      }}
                      onPointerDown={(e) => handleWorkAreaPointerDown(e, 'start')}
                      onPointerMove={handleWorkAreaPointerMove}
                      onPointerUp={handleWorkAreaPointerUp}
                    />
                    {/* End handle */}
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <div
                      className={styles.workAreaHandleEnd}
                      style={{ left: `${((workAreaEnd + 1) / duration) * 100}%` }}
                      onPointerDown={(e) => handleWorkAreaPointerDown(e, 'end')}
                      onPointerMove={handleWorkAreaPointerMove}
                      onPointerUp={handleWorkAreaPointerUp}
                    />
                  </>
                )}
                {/* Playhead */}
                <div
                  className={styles.playhead}
                  style={{ left: `${(currentFrame / duration) * 100}%` }}
                />
              </div>

              {/* Tracks */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click deselects keyframes, keyboard handled by useTimelineShortcuts */}
              <div
                className={styles.tracks}
                ref={tracksRef}
                onClick={handleTrackClick}
                onContextMenu={handleTimelineContextMenu}
                data-testid="timeline-tracks"
              >
                {nodes.map((node) => {
                  const kfs = nodeKeyframes.get(node.id);
                  return (
                    <div
                      key={node.id}
                      className={styles.track}
                      onContextMenu={(e) => handleTimelineContextMenu(e, node.id)}
                      data-testid={`timeline-track-${node.id}`}
                    >
                      {nodeSpans.get(node.id)?.map((span) => (
                        <div
                          key={`${span.start}-${span.end}`}
                          className={styles.keyframeSpan}
                          style={{
                            left: `${(span.start / duration) * 100}%`,
                            width: `${((span.end - span.start) / duration) * 100}%`,
                          }}
                          data-testid={`keyframe-span-${node.id}-${span.start}-${span.end}`}
                          aria-hidden="true"
                        />
                      ))}
                      {kfs &&
                        kfs.map((kf) => (
                          /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- keyframe diamonds, keyboard handled at track level */
                          <div
                            key={kf.id}
                            className={`${styles.keyframe} ${selectedKeyframeIds.has(kf.id) ? styles.selected : ''}`}
                            style={{ left: `${(kf.time / duration) * 100}%` }}
                            onClick={(e) => handleKeyframeClick(e, kf.id)}
                            onContextMenu={(e) =>
                              handleKeyframeContextMenu(e, kf.id, kf.nodeId, kf.property)
                            }
                            onPointerDown={(e) => handleKeyframePointerDown(e, kf.id)}
                            onPointerMove={handleKeyframePointerMove}
                            onPointerUp={handleKeyframePointerUp}
                            data-testid={`keyframe-${kf.id}`}
                            title={`${kf.property} @ frame ${kf.time}`}
                          />
                        ))}
                    </div>
                  );
                })}
                {nodes.length === 0 && <div className={styles.track} />}
              </div>

              {/* Work Area overlays follow the zoomed, scrollable timeline content. */}
              {workAreaEnabled && (
                <>
                  <div
                    className={styles.workAreaTrackDimmed}
                    style={{ left: 0, width: `${(workAreaStart / duration) * 100}%` }}
                  />
                  <div
                    className={styles.workAreaTrackDimmed}
                    style={{ left: `${((workAreaEnd + 1) / duration) * 100}%`, right: 0 }}
                  />
                </>
              )}

              {/* Playhead line shares the timeline content width with the ruler. */}
              <div
                className={styles.playheadLine}
                style={{ left: `${(currentFrame / duration) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
      {easingEditor && (
        <EasingEditor
          easing={easingEditor.easing}
          anchorX={easingEditor.x}
          anchorY={easingEditor.y}
          onChange={(newEasing) => {
            for (const kfId of selectedKeyframeIds) {
              const info = keyframeMap.get(kfId);
              if (info) {
                setKeyframeEasing(info.nodeId, info.property, kfId, newEasing);
              }
            }
          }}
          onClose={() => setEasingEditor(null)}
        />
      )}
    </div>
  );
}

export default Timeline;
