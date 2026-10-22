/**
 * GuideOverlay — SVG overlay rendering guide lines across the full viewport.
 *
 * Supports:
 * - Rendering persistent guides (cyan lines)
 * - Drag preview while creating a new guide from ruler
 * - Click to select, Delete to remove, drag to reposition
 * - Drag guide back onto ruler area to remove it (Figma behavior)
 */

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Camera } from '@quar/core';
import type { Guide } from '../../stores/editorStore';

// ============================================================================
// Constants
// ============================================================================

const GUIDE_COLOR = '#00D4FF';
const GUIDE_HIT_WIDTH = 8; // Invisible hit area width in pixels
const GUIDE_STROKE_WIDTH = 1;

// ============================================================================
// Types
// ============================================================================

interface GuideOverlayProps {
  guides: Guide[];
  camera: Camera | null;
  viewportWidth: number;
  viewportHeight: number;
  cameraVersion: number;
  dragPreview: { axis: 'x' | 'y'; worldPosition: number } | null;
  /** Ref to the WebGL canvas element — used to compute canvas-relative screen coords */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  /** Width of the ruler strips along the top and left edges; 0 when the rulers are hidden */
  rulerSize?: number;
  onRemoveGuide: (id: string) => void;
  onUpdateGuidePosition: (id: string, position: number) => void;
}

// ============================================================================
// Component
// ============================================================================

export function GuideOverlay({
  guides,
  camera,
  viewportWidth,
  viewportHeight,
  cameraVersion,
  dragPreview,
  canvasRef: externalCanvasRef,
  rulerSize = 0,
  onRemoveGuide,
  onUpdateGuidePosition,
}: GuideOverlayProps) {
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [draggingGuideId, setDraggingGuideId] = useState<string | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const canvasElRef = useRef(externalCanvasRef);
  canvasElRef.current = externalCanvasRef;
  const onRemoveGuideRef = useRef(onRemoveGuide);
  onRemoveGuideRef.current = onRemoveGuide;
  const onUpdateGuidePositionRef = useRef(onUpdateGuidePosition);
  onUpdateGuidePositionRef.current = onUpdateGuidePosition;
  const rulerSizeRef = useRef(rulerSize);
  rulerSizeRef.current = rulerSize;

  // Track active global listener cleanups for unmount safety
  const guideCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      guideCleanupRef.current?.();
    };
  }, []);

  /** Convert browser-viewport clientX/clientY to canvas-local screen coords */
  const toCanvasScreen = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasElRef.current?.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      }
      return { x: clientX, y: clientY };
    },
    []
  );

  // Compute screen positions for all guides
  const guideLines = useMemo(() => {
    if (!camera) return [];
    return guides.map((g) => {
      if (g.axis === 'x') {
        // Vertical line at world x
        const screenPt = camera.worldToScreen({ x: g.position, y: 0 });
        return { ...g, screenPos: screenPt.x };
      } else {
        // Horizontal line at world y
        const screenPt = camera.worldToScreen({ x: 0, y: g.position });
        return { ...g, screenPos: screenPt.y };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameraVersion triggers recalculation
  }, [guides, camera, cameraVersion]);

  // Compute drag preview screen position
  const previewLine = useMemo(() => {
    if (!camera || !dragPreview || isNaN(dragPreview.worldPosition)) return null;
    if (dragPreview.axis === 'x') {
      const screenPt = camera.worldToScreen({ x: dragPreview.worldPosition, y: 0 });
      return { axis: dragPreview.axis, screenPos: screenPt.x };
    } else {
      const screenPt = camera.worldToScreen({ x: 0, y: dragPreview.worldPosition });
      return { axis: dragPreview.axis, screenPos: screenPt.y };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, dragPreview, cameraVersion]);

  // Handle Delete key to remove selected guide
  useEffect(() => {
    if (!selectedGuideId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack Delete/Backspace while typing in a field (matches Canvas).
      const ae = document.activeElement as HTMLElement | null;
      const tag = ae?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae?.isContentEditable) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemoveGuideRef.current(selectedGuideId);
        setSelectedGuideId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGuideId]);

  // A click anywhere but on a guide deselects the selected one. The overlay
  // lets clicks through to the canvas, so it never sees them itself: listen
  // on the window, before anything else can stop them
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!selectedGuideId) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && svgRef.current?.contains(e.target)) return;
      setSelectedGuideId(null);
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [selectedGuideId]);

  // Handle clicking a guide to select it
  const handleGuidePointerDown = useCallback(
    (e: React.PointerEvent, guide: Guide) => {
      e.stopPropagation();
      setSelectedGuideId(guide.id);
      setDraggingGuideId(guide.id);

      const onMove = (ev: PointerEvent) => {
        if (!cameraRef.current) return;
        const screen = toCanvasScreen(ev.clientX, ev.clientY);
        if (guide.axis === 'x') {
          const worldPos = cameraRef.current.screenToWorld(screen);
          onUpdateGuidePositionRef.current(guide.id, worldPos.x);
        } else {
          const worldPos = cameraRef.current.screenToWorld(screen);
          onUpdateGuidePositionRef.current(guide.id, worldPos.y);
        }
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        guideCleanupRef.current = null;
      };

      const onUp = (ev: PointerEvent) => {
        setDraggingGuideId(null);
        const screen = toCanvasScreen(ev.clientX, ev.clientY);
        // Dropped on its ruler (or past the canvas edge when the rulers are
        // hidden): the guide goes away
        const ruler = rulerSizeRef.current;
        if (guide.axis === 'x' && screen.x <= ruler) {
          onRemoveGuideRef.current(guide.id);
          setSelectedGuideId(null);
        } else if (guide.axis === 'y' && screen.y <= ruler) {
          onRemoveGuideRef.current(guide.id);
          setSelectedGuideId(null);
        }
        cleanup();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      guideCleanupRef.current = cleanup;
    },
    [toCanvasScreen]
  );

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: viewportWidth,
        height: viewportHeight,
        pointerEvents: 'none',
        zIndex: 7,
      }}
      data-testid="guide-overlay"
    >
      {/* Persistent guides */}
      {guideLines.map((g) => {
        const isSelected = g.id === selectedGuideId;
        const isDragging = g.id === draggingGuideId;
        const cursor = g.axis === 'x' ? 'col-resize' : 'row-resize';

        if (g.axis === 'x') {
          // Vertical guide
          return (
            <g key={g.id}>
              {/* Invisible hit area */}
              <line
                data-testid="guide-hit"
                x1={g.screenPos}
                y1={0}
                x2={g.screenPos}
                y2={viewportHeight}
                stroke="transparent"
                strokeWidth={GUIDE_HIT_WIDTH}
                style={{ pointerEvents: 'stroke', cursor }}
                onPointerDown={(e) => handleGuidePointerDown(e, g)}
              />
              {/* Visible guide line */}
              <line
                x1={g.screenPos}
                y1={0}
                x2={g.screenPos}
                y2={viewportHeight}
                stroke={GUIDE_COLOR}
                strokeWidth={isSelected || isDragging ? 2 : GUIDE_STROKE_WIDTH}
                opacity={isDragging ? 0.7 : 1}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        } else {
          // Horizontal guide
          return (
            <g key={g.id}>
              <line
                data-testid="guide-hit"
                x1={0}
                y1={g.screenPos}
                x2={viewportWidth}
                y2={g.screenPos}
                stroke="transparent"
                strokeWidth={GUIDE_HIT_WIDTH}
                style={{ pointerEvents: 'stroke', cursor }}
                onPointerDown={(e) => handleGuidePointerDown(e, g)}
              />
              <line
                x1={0}
                y1={g.screenPos}
                x2={viewportWidth}
                y2={g.screenPos}
                stroke={GUIDE_COLOR}
                strokeWidth={isSelected || isDragging ? 2 : GUIDE_STROKE_WIDTH}
                opacity={isDragging ? 0.7 : 1}
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        }
      })}

      {/* Drag preview */}
      {previewLine &&
        (previewLine.axis === 'x' ? (
          <line
            x1={previewLine.screenPos}
            y1={0}
            x2={previewLine.screenPos}
            y2={viewportHeight}
            stroke={GUIDE_COLOR}
            strokeWidth={GUIDE_STROKE_WIDTH}
            opacity={0.5}
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <line
            x1={0}
            y1={previewLine.screenPos}
            x2={viewportWidth}
            y2={previewLine.screenPos}
            stroke={GUIDE_COLOR}
            strokeWidth={GUIDE_STROKE_WIDTH}
            opacity={0.5}
            style={{ pointerEvents: 'none' }}
          />
        ))}
    </svg>
  );
}
