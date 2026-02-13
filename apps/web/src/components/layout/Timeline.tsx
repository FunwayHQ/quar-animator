import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { formatTimecode, getTracksByNode } from '@quar/animation';
import type { Node, EasingFunction } from '@quar/types';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
import { OnionSkinPanel } from '../common/OnionSkinPanel';
import { EasingEditor } from '../common/EasingEditor';
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
  const toggleTimelineExpanded = useEditorStore((s) => s.toggleTimelineExpanded);
  const toggleAutoKeyframe = useEditorStore((s) => s.toggleAutoKeyframe);
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe);
  const addKeyframeToSelection = useEditorStore((s) => s.addKeyframeToSelection);
  const clearKeyframeSelection = useEditorStore((s) => s.clearKeyframeSelection);
  const removeSelectedKeyframes = useEditorStore((s) => s.removeSelectedKeyframes);
  const setKeyframeEasing = useEditorStore((s) => s.setKeyframeEasing);
  const copySelectedKeyframes = useEditorStore((s) => s.copySelectedKeyframes);
  const pasteKeyframes = useEditorStore((s) => s.pasteKeyframes);
  const moveSelectedKeyframes = useEditorStore((s) => s.moveSelectedKeyframes);
  const keyframeClipboard = useEditorStore((s) => s.keyframeClipboard);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);

  const onionSkinEnabled = useEditorStore((s) => s.onionSkin.enabled);
  const toggleOnionSkin = useEditorStore((s) => s.toggleOnionSkin);

  const workAreaEnabled = useEditorStore((s) => s.workAreaEnabled);
  const workAreaStart = useEditorStore((s) => s.workAreaStart);
  const workAreaEnd = useEditorStore((s) => s.workAreaEnd);
  const setWorkAreaStart = useEditorStore((s) => s.setWorkAreaStart);
  const setWorkAreaEnd = useEditorStore((s) => s.setWorkAreaEnd);
  const setWorkAreaRange = useEditorStore((s) => s.setWorkAreaRange);
  const toggleWorkArea = useEditorStore((s) => s.toggleWorkArea);
  const setWorkAreaToCurrentFrame = useEditorStore((s) => s.setWorkAreaToCurrentFrame);
  const clearWorkArea = useEditorStore((s) => s.clearWorkArea);

  const [showOnionSkinPanel, setShowOnionSkinPanel] = useState(false);
  const [easingEditor, setEasingEditor] = useState<{
    x: number;
    y: number;
    easing: EasingFunction;
  } | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    frame: number;
    keyframeId?: string;
    nodeId?: string;
    property?: string;
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

  // Track scene graph changes for layer labels
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    const update = () => setNodes([...sceneGraph.getRootNodes()].reverse());
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

  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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

  // ------- Context menu handlers -------

  const handleTimelineContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.max(0, Math.min(duration - 1, Math.round((x / rect.width) * duration)));
      setContextMenu({ x: e.clientX, y: e.clientY, frame });
    },
    [duration]
  );

  const contextMenuItems = useCallback((): ContextMenuEntry[] => {
    if (!contextMenu) return [];

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
      for (const preset of EASING_PRESETS) {
        const isActive = easingsMatch(currentKfEasing, preset.value);
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

      items.push({
        id: 'custom-easing',
        label: 'Custom Easing\u2026',
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

    // Add paste option if clipboard has content
    if (keyframeClipboard && selectedNodeIds.size > 0) {
      const firstNodeId = [...selectedNodeIds][0]!;
      items.push({ type: 'separator' });
      items.push({
        id: 'paste-keyframes',
        label: 'Paste Keyframes',
        shortcut: 'Ctrl+V',
        onClick: () => pasteKeyframes(firstNodeId, contextMenu.frame),
      });
    }

    return items;
  }, [
    contextMenu,
    duration,
    timeline,
    selectedKeyframeIds,
    keyframeMap,
    setCurrentFrame,
    setIsPlaying,
    setKeyframeEasing,
    copySelectedKeyframes,
    removeSelectedKeyframes,
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
    <div className={styles.timeline}>
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

        <div className={styles.options}>
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

      {/* Timeline Area */}
      <div className={styles.timelineArea}>
        {/* Layer Labels */}
        <div className={styles.layerLabels}>
          {nodes.length > 0 ? (
            nodes.map((node) => (
              <div key={node.id} className={styles.layerLabel}>
                {node.name ?? node.id}
              </div>
            ))
          ) : (
            <div className={styles.layerLabel}>No layers</div>
          )}
        </div>

        {/* Tracks Area */}
        <div className={styles.tracksArea}>
          {/* Ruler */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keyboard navigation handled by useTimelineShortcuts hook */}
          <div
            className={styles.ruler}
            ref={rulerRef}
            onClick={handleRulerClick}
            onContextMenu={handleTimelineContextMenu}
            role="slider"
            aria-valuenow={currentFrame}
            aria-valuemin={0}
            aria-valuemax={duration - 1}
            aria-label="Timeline scrubber"
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
          <div className={styles.tracks} ref={tracksRef} onClick={handleTrackClick}>
            {nodes.map((node) => {
              const kfs = nodeKeyframes.get(node.id);
              return (
                <div key={node.id} className={styles.track}>
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

            {/* Work Area dimmed regions in tracks */}
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

            {/* Playhead line */}
            <div
              className={styles.playheadLine}
              style={{ left: `${(currentFrame / duration) * 100}%` }}
            />
          </div>
        </div>
      </div>
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
