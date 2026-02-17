/**
 * GraphEditor — Main graph editor component for animation curve editing.
 *
 * Orchestrates sub-components (grid, curves, keyframes, property list)
 * and handles interaction (click, drag, pan, zoom, marquee selection).
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, jsx-a11y/no-static-element-interactions -- @quar/animation types resolve to any without built dist */
import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import type { Node, PropertyTrack } from '@quar/types';
import {
  screenToGraph,
  findNearestKeyframe,
  findKeyframesInRect,
  fitKeyframesToView,
  tangentsToEasing,
  easingToTangents,
} from '@quar/animation';
import { GraphEditorGrid } from './GraphEditorGrid';
import { GraphEditorCurves } from './GraphEditorCurves';
import { GraphEditorKeyframes } from './GraphEditorKeyframes';
import { GraphEditorPropertyList } from './GraphEditorPropertyList';
import styles from './GraphEditor.module.css';

type DragMode =
  | { type: 'none' }
  | {
      type: 'keyframe';
      kfId: string;
      nodeId: string;
      property: string;
      startTime: number;
      startValue: number;
      constrained: boolean;
      axis: 'x' | 'y' | null;
      startScreenX: number;
      startScreenY: number;
    }
  | {
      type: 'tangent';
      kfId: string;
      nodeId: string;
      property: string;
      side: 'in' | 'out';
      kfTime: number;
      kfValue: number;
    }
  | { type: 'pan'; startX: number; startY: number; startOffsetX: number; startOffsetY: number }
  | { type: 'marquee'; startX: number; startY: number; currentX: number; currentY: number };

export function GraphEditor() {
  const sceneGraph = useSceneGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>({ type: 'none' });

  // Store selectors
  const timeline = useEditorStore((s) => s.timeline);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  const selectedKeyframeIds = useEditorStore((s) => s.selectedKeyframeIds);
  const currentFrame = useEditorStore((s) => s.currentFrame);
  const graphViewTransform = useEditorStore((s) => s.graphViewTransform);
  const graphVisibleTracks = useEditorStore((s) => s.graphVisibleTracks);

  // Store actions
  const setGraphViewTransform = useEditorStore((s) => s.setGraphViewTransform);
  const toggleGraphTrackVisibility = useEditorStore((s) => s.toggleGraphTrackVisibility);
  const selectKeyframe = useEditorStore((s) => s.selectKeyframe);
  const addKeyframeToSelection = useEditorStore((s) => s.addKeyframeToSelection);
  const clearKeyframeSelection = useEditorStore((s) => s.clearKeyframeSelection);
  const setSelectedKeyframeIds = useEditorStore((s) => s.setSelectedKeyframeIds);
  const updateKeyframeTimeAndValue = useEditorStore((s) => s.updateKeyframeTimeAndValue);
  const setCurrentFrame = useEditorStore((s) => s.setCurrentFrame);

  // Build node name map for property list
  const nodeNames = useMemo(() => {
    const map = new Map<string, string>();
    if (sceneGraph) {
      const roots = sceneGraph.getRootNodes() as Node[];
      for (const node of roots) {
        map.set(node.id, node.name ?? node.id);
        const descendants = sceneGraph.getDescendants(node.id) as Node[];
        for (const desc of descendants) {
          map.set(desc.id, desc.name ?? desc.id);
        }
      }
    }
    return map;
  }, [sceneGraph]);

  // Filter tracks: only numeric tracks with keyframes, optionally filtered by visibility
  const visibleTrackData = useMemo(() => {
    const result: Array<{ track: PropertyTrack<number>; globalIndex: number }> = [];
    let globalIndex = 0;

    for (const track of timeline.tracks) {
      if (track.keyframes.length === 0) continue;
      // Only show tracks for selected nodes (or all if none selected)
      if (selectedNodeIds.size > 0 && !selectedNodeIds.has(track.nodeId)) {
        globalIndex++;
        continue;
      }

      const trackId = `${track.nodeId}:${track.property}`;
      if (graphVisibleTracks.length > 0 && !graphVisibleTracks.includes(trackId)) {
        globalIndex++;
        continue;
      }

      // Only include numeric tracks
      const firstValue = track.keyframes[0]?.value;
      if (typeof firstValue === 'number') {
        result.push({ track: track as PropertyTrack<number>, globalIndex });
      }
      globalIndex++;
    }

    return result;
  }, [timeline, selectedNodeIds, graphVisibleTracks]);

  // Auto-fit view on first render / when tracks change
  const hasFitted = useRef(false);
  useEffect(() => {
    if (!hasFitted.current && visibleTrackData.length > 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const allKeyframes: Array<{ time: number; value: number }> = [];
      for (const { track } of visibleTrackData) {
        for (const kf of track.keyframes) {
          allKeyframes.push({ time: kf.time, value: kf.value });
        }
      }
      const fit = fitKeyframesToView(allKeyframes, rect.width, rect.height, 40);
      setGraphViewTransform(fit);
      hasFitted.current = true;
    }
  }, [visibleTrackData, setGraphViewTransform]);

  // Update view dimensions on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGraphViewTransform({
          viewWidth: Math.round(width),
          viewHeight: Math.round(height),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [setGraphViewTransform]);

  // ========================================================================
  // Interaction Handlers
  // ========================================================================

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Middle-click or Alt+click: pan
        setDragMode({
          type: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          startOffsetX: graphViewTransform.offsetX,
          startOffsetY: graphViewTransform.offsetY,
        });
        e.preventDefault();
        return;
      }

      if (e.button === 0) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Check for keyframe hit
        const allKeyframes: Array<{ id: string; time: number; value: number }> = [];
        for (const { track } of visibleTrackData) {
          for (const kf of track.keyframes) {
            allKeyframes.push({ id: kf.id, time: kf.time, value: kf.value });
          }
        }

        const hit = findNearestKeyframe(
          { x: screenX, y: screenY },
          allKeyframes,
          graphViewTransform
        );
        if (hit) {
          if (e.shiftKey) {
            addKeyframeToSelection(hit.id);
          } else if (!selectedKeyframeIds.has(hit.id)) {
            selectKeyframe(hit.id);
          }
          return; // keyframeMouseDown handler takes over for drag
        }

        // No keyframe hit — start marquee selection or click on ruler to seek
        if (!e.shiftKey) {
          clearKeyframeSelection();
        }

        // Click in graph area: seek to frame
        const { frame } = screenToGraph(screenX, screenY, graphViewTransform);
        const roundedFrame = Math.max(0, Math.round(frame));
        setCurrentFrame(roundedFrame);

        // Start marquee
        setDragMode({
          type: 'marquee',
          startX: screenX,
          startY: screenY,
          currentX: screenX,
          currentY: screenY,
        });
      }
    },
    [
      graphViewTransform,
      visibleTrackData,
      selectedKeyframeIds,
      selectKeyframe,
      addKeyframeToSelection,
      clearKeyframeSelection,
      setCurrentFrame,
    ]
  );

  const handleKeyframeMouseDown = useCallback(
    (
      e: React.MouseEvent,
      kfId: string,
      nodeId: string,
      property: string,
      time: number,
      value: number
    ) => {
      if (e.shiftKey) {
        addKeyframeToSelection(kfId);
      } else if (!selectedKeyframeIds.has(kfId)) {
        selectKeyframe(kfId);
      }

      setDragMode({
        type: 'keyframe',
        kfId,
        nodeId,
        property,
        startTime: time,
        startValue: value,
        constrained: false,
        axis: null,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
      });
    },
    [selectedKeyframeIds, selectKeyframe, addKeyframeToSelection]
  );

  const handleTangentMouseDown = useCallback(
    (
      e: React.MouseEvent,
      kfId: string,
      nodeId: string,
      property: string,
      side: 'in' | 'out',
      time: number,
      value: number
    ) => {
      setDragMode({
        type: 'tangent',
        kfId,
        nodeId,
        property,
        side,
        kfTime: time,
        kfValue: value,
      });
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode.type === 'none') return;

      if (dragMode.type === 'pan') {
        const dx = e.clientX - dragMode.startX;
        const dy = e.clientY - dragMode.startY;
        setGraphViewTransform({
          offsetX: dragMode.startOffsetX - dx,
          offsetY: dragMode.startOffsetY + dy,
        });
        return;
      }

      if (dragMode.type === 'marquee') {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        setDragMode({
          ...dragMode,
          currentX: e.clientX - rect.left,
          currentY: e.clientY - rect.top,
        });
        return;
      }

      if (dragMode.type === 'keyframe') {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const graphPos = screenToGraph(screenX, screenY, graphViewTransform);

        let newTime = graphPos.frame;
        let newValue = graphPos.value;

        // Shift constrains to one axis
        if (e.shiftKey) {
          const dx = Math.abs(e.clientX - dragMode.startScreenX);
          const dy = Math.abs(e.clientY - dragMode.startScreenY);
          const axis = dragMode.axis ?? (dx > dy ? 'x' : 'y');
          if (axis === 'x') {
            newValue = dragMode.startValue;
          } else {
            newTime = dragMode.startTime;
          }
          if (!dragMode.axis && (dx > 5 || dy > 5)) {
            setDragMode({ ...dragMode, axis });
          }
        }

        // Snap time to integer frames
        newTime = Math.max(0, Math.round(newTime));

        updateKeyframeTimeAndValue(
          dragMode.nodeId,
          dragMode.property,
          dragMode.startTime,
          newTime,
          newValue
        );
        // Update startTime so next move uses the new position
        setDragMode({ ...dragMode, startTime: newTime, startValue: newValue });
        return;
      }

      if (dragMode.type === 'tangent') {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const graphPos = screenToGraph(screenX, screenY, graphViewTransform);

        // Tangent is relative to keyframe position
        const tangentDelta = {
          x: graphPos.frame - dragMode.kfTime,
          y: graphPos.value - dragMode.kfValue,
        };

        // Find the track and the neighboring keyframes
        const track = timeline.tracks.find(
          (t) => t.nodeId === dragMode.nodeId && t.property === dragMode.property
        );
        if (!track) return;

        const kfIndex = track.keyframes.findIndex((kf) => kf.id === dragMode.kfId);
        if (kfIndex === -1) return;
        const kf = track.keyframes[kfIndex];

        if (dragMode.side === 'out' && kfIndex < track.keyframes.length - 1) {
          const nextKf = track.keyframes[kfIndex + 1];
          const dt = nextKf.time - kf.time;
          const dv = (nextKf.value as number) - (kf.value as number);
          // Get the current tangentIn from easing
          const currentTangents = easingToTangents(
            nextKf.easing,
            kf.time,
            kf.value as number,
            nextKf.time,
            nextKf.value as number
          );
          const tangentIn = currentTangents?.tangentIn ?? { x: -dt / 3, y: -dv / 3 };
          const newEasing = tangentsToEasing(tangentDelta, tangentIn, dt, dv);
          // Update via store: set easing on the next keyframe
          const state = useEditorStore.getState();
          const newKeyframes = [...track.keyframes];
          newKeyframes[kfIndex + 1] = { ...nextKf, easing: newEasing };
          const newTracks = state.timeline.tracks.map((t) =>
            t.id === track.id ? { ...t, keyframes: newKeyframes } : t
          );
          useEditorStore.setState({
            timeline: { ...state.timeline, tracks: newTracks },
            isDirty: true,
          });
        } else if (dragMode.side === 'in' && kfIndex > 0) {
          const prevKf = track.keyframes[kfIndex - 1];
          const dt = kf.time - prevKf.time;
          const dv = (kf.value as number) - (prevKf.value as number);
          // Get the current tangentOut from easing
          const currentTangents = easingToTangents(
            kf.easing,
            prevKf.time,
            prevKf.value as number,
            kf.time,
            kf.value as number
          );
          const tangentOut = currentTangents?.tangentOut ?? { x: dt / 3, y: dv / 3 };
          const newEasing = tangentsToEasing(tangentOut, tangentDelta, dt, dv);
          // Update via store: set easing on this keyframe (after.easing convention)
          const state = useEditorStore.getState();
          const newKeyframes = [...track.keyframes];
          newKeyframes[kfIndex] = { ...kf, easing: newEasing };
          const newTracks = state.timeline.tracks.map((t) =>
            t.id === track.id ? { ...t, keyframes: newKeyframes } : t
          );
          useEditorStore.setState({
            timeline: { ...state.timeline, tracks: newTracks },
            isDirty: true,
          });
        }
        return;
      }
    },
    [dragMode, graphViewTransform, timeline, setGraphViewTransform, updateKeyframeTimeAndValue]
  );

  const handleMouseUp = useCallback(() => {
    if (dragMode.type === 'marquee') {
      // Complete marquee selection
      const allKeyframes: Array<{ id: string; time: number; value: number }> = [];
      for (const { track } of visibleTrackData) {
        for (const kf of track.keyframes) {
          allKeyframes.push({ id: kf.id, time: kf.time, value: kf.value });
        }
      }

      const rect = {
        x: dragMode.startX,
        y: dragMode.startY,
        width: dragMode.currentX - dragMode.startX,
        height: dragMode.currentY - dragMode.startY,
      };

      const ids = findKeyframesInRect(rect, allKeyframes, graphViewTransform);
      if (ids.length > 0) {
        setSelectedKeyframeIds(ids);
      }
    }

    setDragMode({ type: 'none' });
  }, [dragMode, visibleTrackData, graphViewTransform, setSelectedKeyframeIds]);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Wheel: zoom Y (value axis)
        const graphBefore = screenToGraph(mouseX, mouseY, graphViewTransform);
        const newScaleY = Math.max(0.1, Math.min(10000, graphViewTransform.scaleY * zoomFactor));
        const newOffsetY =
          graphBefore.value * newScaleY - (graphViewTransform.viewHeight / 2 - mouseY);
        setGraphViewTransform({ scaleY: newScaleY, offsetY: newOffsetY });
      } else {
        // Plain Wheel: zoom X (time axis)
        const graphBefore = screenToGraph(mouseX, mouseY, graphViewTransform);
        const newScaleX = Math.max(0.5, Math.min(1000, graphViewTransform.scaleX * zoomFactor));
        const newOffsetX = graphBefore.frame * newScaleX - mouseX;
        setGraphViewTransform({ scaleX: newScaleX, offsetX: newOffsetX });
      }
    },
    [graphViewTransform, setGraphViewTransform]
  );

  // Attach native wheel handler (non-passive)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Delete selected keyframes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

        const state = useEditorStore.getState();
        if (state.selectedKeyframeIds.size === 0) return;
        if (state.timelineViewMode !== 'graph') return;

        e.preventDefault();

        // Build keyframe map and remove
        const keyframeMap = new Map<string, { nodeId: string; property: string }>();
        for (const track of state.timeline.tracks) {
          for (const kf of track.keyframes) {
            if (state.selectedKeyframeIds.has(kf.id)) {
              keyframeMap.set(kf.id, { nodeId: track.nodeId, property: track.property });
            }
          }
        }
        state.removeSelectedKeyframes(keyframeMap);
      }

      // Arrow keys nudge selected keyframes
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

        const state = useEditorStore.getState();
        if (state.selectedKeyframeIds.size === 0) return;
        if (state.timelineViewMode !== 'graph') return;

        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;

        // Find all selected keyframes and nudge them
        for (const track of state.timeline.tracks) {
          for (const kf of track.keyframes) {
            if (state.selectedKeyframeIds.has(kf.id) && typeof kf.value === 'number') {
              if (e.key === 'ArrowLeft') {
                state.updateKeyframeTimeAndValue(
                  track.nodeId,
                  track.property,
                  kf.time,
                  kf.time - delta,
                  kf.value
                );
              } else if (e.key === 'ArrowRight') {
                state.updateKeyframeTimeAndValue(
                  track.nodeId,
                  track.property,
                  kf.time,
                  kf.time + delta,
                  kf.value
                );
              } else if (e.key === 'ArrowUp') {
                state.updateKeyframeTimeAndValue(
                  track.nodeId,
                  track.property,
                  kf.time,
                  kf.time,
                  kf.value + delta
                );
              } else if (e.key === 'ArrowDown') {
                state.updateKeyframeTimeAndValue(
                  track.nodeId,
                  track.property,
                  kf.time,
                  kf.time,
                  kf.value - delta
                );
              }
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Double-click to fit view
  const handleDoubleClick = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const allKeyframes: Array<{ time: number; value: number }> = [];
    for (const { track } of visibleTrackData) {
      for (const kf of track.keyframes) {
        allKeyframes.push({ time: kf.time, value: kf.value });
      }
    }
    if (allKeyframes.length > 0) {
      const fit = fitKeyframesToView(allKeyframes, rect.width, rect.height, 40);
      setGraphViewTransform(fit);
    }
  }, [visibleTrackData, setGraphViewTransform]);

  // ========================================================================
  // Render
  // ========================================================================

  const hasData = visibleTrackData.length > 0;

  return (
    <div className={styles.graphEditor} data-testid="graph-editor">
      <GraphEditorPropertyList
        timeline={timeline}
        selectedNodeIds={selectedNodeIds}
        visibleTracks={graphVisibleTracks}
        nodeNames={nodeNames}
        onToggleTrack={toggleGraphTrackVisibility}
      />
      <div
        ref={containerRef}
        className={styles.graphArea}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        data-testid="graph-editor-area"
      >
        {hasData ? (
          <>
            <GraphEditorGrid transform={graphViewTransform} currentFrame={currentFrame} />
            <GraphEditorCurves tracks={visibleTrackData} transform={graphViewTransform} />
            <GraphEditorKeyframes
              tracks={visibleTrackData}
              transform={graphViewTransform}
              selectedKeyframeIds={selectedKeyframeIds}
              onKeyframeMouseDown={handleKeyframeMouseDown}
              onTangentMouseDown={handleTangentMouseDown}
            />
            {/* Marquee selection overlay */}
            {dragMode.type === 'marquee' && (
              <svg className={`${styles.svgOverlay} ${styles.interactive}`}>
                <rect
                  x={Math.min(dragMode.startX, dragMode.currentX)}
                  y={Math.min(dragMode.startY, dragMode.currentY)}
                  width={Math.abs(dragMode.currentX - dragMode.startX)}
                  height={Math.abs(dragMode.currentY - dragMode.startY)}
                  className={styles.marquee}
                />
              </svg>
            )}
          </>
        ) : (
          <div className={styles.noData}>Select nodes with keyframes to view curves</div>
        )}
      </div>
    </div>
  );
}
