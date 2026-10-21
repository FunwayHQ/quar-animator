/**
 * Export Dialog for Quar Animator
 *
 * Modal dialog with tabs for PNG Sequence, Sprite Sheet, GIF, MP4, WebM and Lottie JSON export.
 * Follows the PromptDialog imperative + host pattern.
 *
 * Usage (imperative):
 *   import { showExportDialog } from './ExportDialog';
 *   showExportDialog('png-sequence');
 *
 * Mount <ExportDialogHost /> inside the editor's SceneGraphProvider.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { SelectionManager, widenToAspect } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type { Node, RectangleNode, Timeline } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import {
  exportLottieBlob,
  analyzeLottieExport,
  getAnimatedArtworkBounds,
  gifCompressionSettings,
  gifTiming,
  MAX_GIF_FPS,
  sampleFrames,
  sampleTimeline,
} from '@quar/export';
import type { ExportProgress, FrameRig } from '@quar/export';
import { downloadBlob } from '../../services/exportService';
import styles from './ExportDialog.module.css';

// ============================================================================
// Types
// ============================================================================

export type ExportTab = 'png-sequence' | 'sprite-sheet' | 'gif' | 'mp4' | 'webm' | 'lottie';

interface ExportDialogState {
  tab: ExportTab;
  // Common
  width: number;
  height: number;
  startFrame: number;
  endFrame: number;
  // PNG Sequence
  pngMultiplier: 1 | 2 | 3 | 4;
  pngTransparent: boolean;
  pngPattern: string;
  // GIF
  gifTransparent: boolean;
  /** Frames per second in the GIF */
  gifFps: number;
  /** Playback speed multiplier */
  gifSpeed: number;
  // MP4
  mp4Fps: number;
  mp4Speed: number;
  // WebM
  webmFps: number;
  webmSpeed: number;
  webmTransparent: boolean;
  /** 0 (best quality) … 100 (smallest file) */
  gifCompression: number;
  // Sprite Sheet
  spriteLayout: 'grid' | 'packed';
  spriteColumns: number;
  spritePadding: number;
  spritePowerOfTwo: boolean;
  spriteIncludeMetadata: boolean;
  // Progress
  exporting: boolean;
  progress: ExportProgress | null;
  cancelled: boolean;
  error: string | null;
}

const EXIT_MS = 120;

const TABS: { id: ExportTab; label: string }[] = [
  { id: 'png-sequence', label: 'PNG Sequence' },
  { id: 'sprite-sheet', label: 'Sprite Sheet' },
  { id: 'gif', label: 'GIF' },
  { id: 'mp4', label: 'MP4' },
  { id: 'webm', label: 'WebM' },
  { id: 'lottie', label: 'Lottie JSON' },
];

/**
 * The artboard an export is of: the one selected — or, with nothing
 * selected, the page's only artboard (`implicit`). Null otherwise: the
 * export frames everything on the page.
 */
export function getArtboardScope(sceneGraph: SceneGraph, selectedIds: Set<string>) {
  let node = null;
  let implicit = false;
  if (selectedIds.size === 1) {
    const [selectedId] = selectedIds;
    const selected = selectedId ? sceneGraph.getNode(selectedId) : undefined;
    if (selected?.type === 'artboard') node = selected;
  } else if (selectedIds.size === 0) {
    const boards = sceneGraph
      .getRootNodes()
      .filter((root) => root.type === 'artboard' && root.visible);
    if (boards.length === 1) {
      node = boards[0]!;
      implicit = true;
    }
  }
  if (!node || node.type !== 'artboard') return null;

  const bounds = new SelectionManager().getSelectionBounds(new Set([node.id]), sceneGraph)?.rect;
  return bounds ? { node, bounds, implicit } : null;
}

/** Exports are at most this many pixels a side. */
const MAX_EXPORT_SIZE = 8192;

/** The size an export starts at: the region's own, scaled down to fit if it's huge. */
export function defaultExportSize(region: { width: number; height: number } | null) {
  if (!region || !(region.width > 0) || !(region.height > 0)) return { width: 800, height: 600 };
  const scale = Math.min(1, MAX_EXPORT_SIZE / Math.max(region.width, region.height));
  return {
    width: Math.max(1, Math.ceil(region.width * scale)),
    height: Math.max(1, Math.ceil(region.height * scale)),
  };
}

const COMMON_FRAME_RATES = [60, 50, 30, 25, 24, 20, 15, 12, 10];
const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** Frame rates offered: the project's (capped at what the format plays) and common ones. */
function frameRateChoices(projectRate: number, maxFps = Infinity): number[] {
  const common = COMMON_FRAME_RATES.filter((fps) => fps <= maxFps);
  return [...new Set([Math.min(projectRate, maxFps), ...common])].sort((a, b) => b - a);
}

function describeTiming(frames: number, seconds: number): string {
  return `${frames} frames · ${seconds.toFixed(1)} s`;
}

/** "45 frames · 1.5 s" for the GIF the current settings produce. */
function describeGifTiming(timing: { frames: number[]; delays: number[] }): string {
  const seconds = timing.delays.reduce((sum, delay) => sum + delay, 0) / 100;
  return describeTiming(timing.frames.length, seconds);
}

/** "330 frames · 11.0 s" for the video the current settings produce. */
function describeVideoTiming(timing: { fps: number; frames: number[] }): string {
  return describeTiming(timing.frames.length, timing.frames.length / timing.fps);
}

/** Frame rate and playback speed pickers, with what they produce under them. */
function TimingFields({
  format,
  rates,
  projectRate,
  fps,
  speed,
  onFps,
  onSpeed,
  summary,
}: {
  format: 'gif' | 'mp4' | 'webm';
  rates: number[];
  projectRate: number;
  fps: number;
  speed: number;
  onFps: (fps: number) => void;
  onSpeed: (speed: number) => void;
  summary: string;
}) {
  return (
    <>
      <div className={styles.formRow}>
        <label className={styles.label} htmlFor={`export-${format}-fps`}>
          Frame rate
        </label>
        <select
          id={`export-${format}-fps`}
          className={styles.select}
          value={fps}
          onChange={(e) => onFps(Number(e.target.value))}
          data-testid={`export-${format}-fps`}
        >
          {rates.map((rate) => (
            <option key={rate} value={rate}>
              {rate === projectRate ? `${rate} fps (project)` : `${rate} fps`}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.label} htmlFor={`export-${format}-speed`}>
          Speed
        </label>
        <select
          id={`export-${format}-speed`}
          className={styles.select}
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          data-testid={`export-${format}-speed`}
        >
          {PLAYBACK_SPEEDS.map((choice) => (
            <option key={choice} value={choice}>
              {choice === 1 ? '1× (normal)' : `${choice}×`}
            </option>
          ))}
        </select>
      </div>
      <p className={styles.scopeNote} data-testid={`export-${format}-timing`}>
        {summary}
      </p>
    </>
  );
}

/** What a GIF compression level trades away, in words. */
function describeGifCompression(compression: number): string {
  const { colors } = gifCompressionSettings(compression);
  return compression === 0
    ? `${colors} colors, lossless between frames. Only changed pixels are stored.`
    : `${colors} colors; subtle color changes between frames are skipped. Smaller file, lower quality.`;
}

function getLottieExportScene(
  sceneGraph: SceneGraph,
  timeline: Timeline,
  artboardScope: ReturnType<typeof getArtboardScope>,
  outputWidth: number,
  outputHeight: number
): { nodes: Node[]; timeline: Timeline } {
  if (!artboardScope) return { nodes: sceneGraph.getRootNodes(), timeline };

  const scaleX = outputWidth / artboardScope.bounds.width;
  const scaleY = outputHeight / artboardScope.bounds.height;
  const rootIds = new Set(artboardScope.node.children);
  const nodes: Node[] = artboardScope.node.children.flatMap((id) => {
    const node = sceneGraph.getNode(id);
    if (!node) return [];

    return [
      {
        ...node,
        transform: {
          ...node.transform,
          position: {
            x: (node.transform.position.x + artboardScope.bounds.width / 2) * scaleX,
            y: (node.transform.position.y + artboardScope.bounds.height / 2) * scaleY,
          },
          scale: {
            x: node.transform.scale.x * scaleX,
            y: node.transform.scale.y * scaleY,
          },
        },
      },
    ];
  });

  // The artboard's own fill, as a full-frame background under its children
  const artboard = artboardScope.node;
  const backgroundId = `${artboard.id}:background`;
  if (artboard.fills.some((fill) => fill.visible)) {
    const background: RectangleNode = {
      id: backgroundId,
      type: 'rectangle',
      name: 'Background',
      parent: null,
      children: [],
      transform: {
        position: { x: outputWidth / 2, y: outputHeight / 2 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: outputWidth,
      height: outputHeight,
      cornerRadius: [0, 0, 0, 0],
      fills: artboard.fills,
      strokes: [],
    };
    nodes.unshift(background);
  }

  const tracks = timeline.tracks.map((track) => {
    if (track.nodeId === artboard.id && track.property.startsWith('fills.')) {
      return { ...track, nodeId: backgroundId };
    }
    if (!rootIds.has(track.nodeId)) return track;

    const coordinate =
      track.property === 'transform.position.x'
        ? (value: number) => (value + artboardScope.bounds.width / 2) * scaleX
        : track.property === 'transform.position.y'
          ? (value: number) => (value + artboardScope.bounds.height / 2) * scaleY
          : track.property === 'transform.scale.x'
            ? (value: number) => value * scaleX
            : track.property === 'transform.scale.y'
              ? (value: number) => value * scaleY
              : null;

    if (!coordinate) return track;
    return {
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({
        ...keyframe,
        value: typeof keyframe.value === 'number' ? coordinate(keyframe.value) : keyframe.value,
      })),
    };
  });

  return { nodes, timeline: { ...timeline, tracks } };
}

/** The page's rig, as exports pose it on top of the keyframes. */
function exportRig(timeline: Timeline): FrameRig {
  const state = useEditorStore.getState();
  return {
    ikChains: state.ikChains,
    dynamicChains: state.dynamicChains,
    smartBoneActions: state.smartBoneActions,
    wind: state.globalWind,
    frameRate: timeline.frameRate,
  };
}

// ============================================================================
// Component
// ============================================================================

function ExportDialog({ initialTab, onClose }: { initialTab: ExportTab; onClose: () => void }) {
  const sceneGraph = useSceneGraph();
  const timeline = useEditorStore((s) => s.timeline);
  const timelineDuration = useEditorStore((s) => s.timelineDuration);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  // What shows behind the art in formats without transparency (or with it off)
  const documentBackground = useEditorStore((s) => s.documentBackground);
  const selectedArtboard = getArtboardScope(sceneGraph, selectedNodeIds);
  // With no artboard chosen, the export frames all the artwork, wherever it
  // moves — the rig's motion (IK, physics, bent shapes) included
  const [sceneScope] = useState(() =>
    selectedArtboard
      ? null
      : getAnimatedArtworkBounds(
          sceneGraph,
          timeline,
          useEditorStore.getState().symbols,
          sampleFrames(0, Math.max(0, timelineDuration - 1)),
          exportRig(timeline)
        )
  );
  const defaultSize = defaultExportSize(selectedArtboard?.bounds ?? sceneScope);

  const [exiting, setExiting] = useState(false);
  const [state, setState] = useState<ExportDialogState>(() => ({
    tab: initialTab,
    width: defaultSize.width,
    height: defaultSize.height,
    startFrame: 0,
    endFrame: Math.max(0, timelineDuration - 1),
    pngMultiplier: 1,
    pngTransparent: false,
    pngPattern: 'frame_{N}',
    gifTransparent: false,
    gifFps: Math.min(timeline.frameRate, MAX_GIF_FPS),
    gifSpeed: 1,
    mp4Fps: timeline.frameRate,
    mp4Speed: 1,
    webmFps: timeline.frameRate,
    webmSpeed: 1,
    webmTransparent: false,
    gifCompression: 0,
    spriteLayout: 'grid',
    spriteColumns: 0, // 0 = auto
    spritePadding: 0,
    spritePowerOfTwo: false,
    spriteIncludeMetadata: true,
    exporting: false,
    progress: null,
    cancelled: false,
    error: null,
  }));

  const cancelledRef = useRef(false);

  const close = useCallback(() => {
    setExiting(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state.exporting) {
          cancelledRef.current = true;
          setState((s) => ({ ...s, cancelled: true }));
        } else {
          close();
        }
      }
    },
    [close, state.exporting]
  );

  const update = <K extends keyof ExportDialogState>(key: K, value: ExportDialogState[K]) => {
    setState((s) => ({ ...s, [key]: value, error: null }));
  };

  const lottieExportScene = getLottieExportScene(
    sceneGraph,
    timeline,
    selectedArtboard,
    state.width,
    state.height
  );

  // Lottie analysis
  const lottieAnalysis =
    state.tab === 'lottie' && sceneGraph
      ? analyzeLottieExport(lottieExportScene.nodes, (id) => sceneGraph.getNode(id))
      : null;

  const handleExport = useCallback(async () => {
    if (!sceneGraph || !timeline) return;

    const frameRenderContext = {
      sceneGraph,
      timeline,
      // Pose rigs like the editor: IK, physics chains and Smart Bone morphs
      rig: exportRig(timeline),
      // Symbol instances are drawn from their definitions
      symbols: useEditorStore.getState().symbols,
      ...(selectedArtboard
        ? {
            exportRootIds: [selectedArtboard.node.id],
            viewportBounds: selectedArtboard.bounds,
          }
        : sceneScope
          ? // Widened to the output's shape, so nothing is stretched
            { viewportBounds: widenToAspect(sceneScope, state.width / state.height) }
          : {}),
    };
    const frameRenderRoots = selectedArtboard ? [selectedArtboard.node] : sceneGraph.getRootNodes();

    const lastFrame = Math.max(0, timelineDuration - 1);
    if (
      !Number.isInteger(state.startFrame) ||
      !Number.isInteger(state.endFrame) ||
      state.startFrame < 0 ||
      state.endFrame < state.startFrame ||
      state.endFrame > lastFrame
    ) {
      setState((s) => ({
        ...s,
        error: `Choose a valid frame range between 0 and ${lastFrame}.`,
      }));
      return;
    }
    if (
      !Number.isInteger(state.width) ||
      !Number.isInteger(state.height) ||
      state.width < 1 ||
      state.height < 1 ||
      state.width > 8192 ||
      state.height > 8192
    ) {
      setState((s) => ({ ...s, error: 'Export dimensions must be between 1 and 8192 pixels.' }));
      return;
    }

    cancelledRef.current = false;
    setState((s) => ({ ...s, exporting: true, progress: null, cancelled: false }));
    // Auto-save pauses, and the frames the export poses aren't edits
    useEditorStore.getState().setExporting(true);

    try {
      if (state.tab === 'lottie') {
        // Lottie export is synchronous
        const blob = exportLottieBlob(
          lottieExportScene.nodes,
          lottieExportScene.timeline,
          {
            width: state.width,
            height: state.height,
            startFrame: state.startFrame,
            endFrame: state.endFrame,
            frameRate: timeline.frameRate,
            name: 'Quar Animation',
            // Shapes bound to bones are baked as their bones move them
            skinning: { sceneGraph, rig: frameRenderContext.rig },
          },
          (id: string) => sceneGraph.getNode(id)
        );
        downloadBlob(blob, 'animation.json');
        close();
      } else if (state.tab === 'gif') {
        const { exportGif } = await import('@quar/export');
        const blob = await exportGif(
          frameRenderContext,
          {
            width: state.width,
            height: state.height,
            frameRate: timeline.frameRate,
            startFrame: state.startFrame,
            endFrame: state.endFrame,
            fps: state.gifFps,
            speed: state.gifSpeed,
            transparent: state.gifTransparent,
            backgroundColor: documentBackground,
            compression: state.gifCompression,
          },
          (progress) => setState((s) => ({ ...s, progress })),
          () => cancelledRef.current
        );
        if (blob && !cancelledRef.current) {
          downloadBlob(blob, 'animation.gif');
          close();
        }
      } else if (state.tab === 'mp4') {
        const { exportMp4 } = await import('@quar/export');
        const blob = await exportMp4(
          frameRenderContext,
          {
            width: state.width,
            height: state.height,
            frameRate: timeline.frameRate,
            startFrame: state.startFrame,
            endFrame: state.endFrame,
            fps: state.mp4Fps,
            speed: state.mp4Speed,
            backgroundColor: documentBackground,
          },
          (progress) => setState((s) => ({ ...s, progress })),
          () => cancelledRef.current
        );
        if (blob && !cancelledRef.current) {
          downloadBlob(blob, 'animation.mp4');
          close();
        }
      } else if (state.tab === 'webm') {
        const { exportWebm } = await import('@quar/export');
        const blob = await exportWebm(
          frameRenderContext,
          {
            width: state.width,
            height: state.height,
            frameRate: timeline.frameRate,
            startFrame: state.startFrame,
            endFrame: state.endFrame,
            fps: state.webmFps,
            speed: state.webmSpeed,
            transparent: state.webmTransparent,
            backgroundColor: documentBackground,
          },
          (progress) => setState((s) => ({ ...s, progress })),
          () => cancelledRef.current
        );
        if (blob && !cancelledRef.current) {
          downloadBlob(blob, 'animation.webm');
          close();
        }
      } else if (state.tab === 'png-sequence') {
        // PNG Sequence requires dynamic import of frameRenderer (WebGL)
        const { createFrameRenderer, getFrameCount, generateFrameFilenames } =
          await import('@quar/export');
        const JSZip = (await import('jszip')).default;

        const frameCount = getFrameCount(state.startFrame, state.endFrame);
        const filenames = generateFrameFilenames(
          state.pngPattern,
          state.startFrame,
          state.endFrame,
          'png'
        );
        const zip = new JSZip();

        const renderer = createFrameRenderer({
          width: state.width,
          height: state.height,
          multiplier: state.pngMultiplier,
          backgroundColor: state.pngTransparent ? null : documentBackground,
        });

        // Pre-load image textures so they render correctly
        await renderer.preloadTextures(frameRenderRoots, sceneGraph, frameRenderContext.symbols);

        try {
          for (let i = 0; i < frameCount; i++) {
            if (cancelledRef.current) break;

            const _frame = state.startFrame + i;
            const progress: ExportProgress = {
              phase: 'rendering',
              current: i + 1,
              total: frameCount,
              percentage: Math.round(((i + 1) / frameCount) * 100),
            };
            setState((s) => ({ ...s, progress }));

            const blob = await renderer.renderFrameAsBlob(frameRenderContext, _frame);
            if (blob) {
              zip.file(filenames[i]!, blob);
            }

            await new Promise((r) => setTimeout(r, 0));
          }

          if (!cancelledRef.current) {
            setState((s) => ({
              ...s,
              progress: {
                phase: 'finalizing',
                current: frameCount,
                total: frameCount,
                percentage: 100,
              },
            }));
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, 'png-sequence.zip');
            close();
          }
        } finally {
          renderer.dispose();
        }
      } else if (state.tab === 'sprite-sheet') {
        const {
          createFrameRenderer,
          getFrameCount,
          packGrid,
          packMaxRects,
          nextPowerOfTwo,
          assertAllFramesPacked,
          generateSpriteSheetMetadata,
        } = await import('@quar/export');

        const frameCount = getFrameCount(state.startFrame, state.endFrame);
        const cols = state.spriteColumns > 0 ? state.spriteColumns : undefined;

        let packResult;
        if (state.spriteLayout === 'grid') {
          packResult = packGrid(frameCount, state.width, state.height, cols, state.spritePadding);
        } else {
          const frames = Array.from({ length: frameCount }, () => ({
            width: state.width,
            height: state.height,
          }));
          packResult = packMaxRects(frames, 4096, 4096, state.spritePadding);
        }

        assertAllFramesPacked(packResult);

        let atlasW = packResult.atlasWidth;
        let atlasH = packResult.atlasHeight;
        if (state.spritePowerOfTwo) {
          atlasW = nextPowerOfTwo(atlasW);
          atlasH = nextPowerOfTwo(atlasH);
        }

        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = atlasW;
        atlasCanvas.height = atlasH;
        const atlasCtx = atlasCanvas.getContext('2d');
        if (!atlasCtx) throw new Error('Failed to get 2D context for sprite sheet atlas');

        const renderer = createFrameRenderer({
          width: state.width,
          height: state.height,
          multiplier: 1,
        });

        // Pre-load image textures so they render correctly
        await renderer.preloadTextures(frameRenderRoots, sceneGraph, frameRenderContext.symbols);

        try {
          for (let i = 0; i < frameCount; i++) {
            if (cancelledRef.current) break;

            const frame = state.startFrame + i;
            const rect = packResult.rects[i];
            if (!rect) throw new Error(`Sprite sheet packing did not place frame ${frame}.`);

            setState((s) => ({
              ...s,
              progress: {
                phase: 'rendering',
                current: i + 1,
                total: frameCount,
                percentage: Math.round(((i + 1) / frameCount) * 90),
              },
            }));

            const frameCanvas = renderer.renderFrame(frameRenderContext, frame);
            atlasCtx.drawImage(frameCanvas, rect.x, rect.y);

            await new Promise((r) => setTimeout(r, 0));
          }

          if (!cancelledRef.current) {
            setState((s) => ({
              ...s,
              progress: {
                phase: 'finalizing',
                current: frameCount,
                total: frameCount,
                percentage: 100,
              },
            }));
            const imageBlob = await new Promise<Blob>((resolve, reject) => {
              atlasCanvas.toBlob((blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to generate sprite sheet image blob'));
                }
              }, 'image/png');
            });
            downloadBlob(imageBlob, 'spritesheet.png');

            if (state.spriteIncludeMetadata) {
              const metadata = generateSpriteSheetMetadata(
                packResult,
                {
                  startFrame: state.startFrame,
                  endFrame: state.endFrame,
                  frameWidth: state.width,
                  frameHeight: state.height,
                  imageSize: { width: atlasW, height: atlasH },
                },
                'spritesheet.png'
              );
              const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], {
                type: 'application/json',
              });
              downloadBlob(metaBlob, 'spritesheet.json');
            }

            close();
          }
        } finally {
          renderer.dispose();
        }
      }
      if (cancelledRef.current) {
        setState((s) => ({ ...s, exporting: false, progress: null, cancelled: false }));
      }
    } catch (err) {
      console.error('Export failed:', err);
      setState((s) => ({
        ...s,
        exporting: false,
        progress: null,
        error: err instanceof Error ? err.message : 'Export failed. Please try again.',
      }));
    } finally {
      useEditorStore.getState().setExporting(false);
    }
  }, [
    state,
    sceneGraph,
    timeline,
    timelineDuration,
    selectedArtboard,
    lottieExportScene,
    documentBackground,
    sceneScope,
    close,
  ]);

  return createPortal(
    <div
      className={`${styles.backdrop} ${exiting ? styles.exiting : ''}`}
      // Catches clicks outside the dialog (Escape closes it from the keyboard)
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !state.exporting) close();
      }}
      onKeyDown={handleKeyDown}
      data-testid="export-dialog-backdrop"
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Export Animation"
        data-testid="export-dialog"
      >
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>Export Animation</h3>
          <button className={styles.closeBtn} onClick={close} data-testid="export-dialog-close">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tab} ${state.tab === t.id ? styles.active : ''}`}
              onClick={() => update('tab', t.id)}
              disabled={state.exporting}
              data-testid={`export-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        {state.exporting && state.progress ? (
          <div className={styles.progress} data-testid="export-progress">
            <div className={styles.progressLabel}>
              {state.progress.phase === 'preparing'
                ? `Preparing palette from frame ${state.progress.current} / ${state.progress.total}...`
                : state.progress.phase === 'rendering'
                  ? `Rendering frame ${state.progress.current} / ${state.progress.total}...`
                  : state.progress.phase === 'encoding'
                    ? `Encoding frame ${state.progress.current} / ${state.progress.total}...`
                    : 'Finalizing...'}
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${state.progress.percentage}%` }}
              />
            </div>
            <button
              className={styles.btnDanger}
              onClick={() => {
                cancelledRef.current = true;
                setState((s) => ({ ...s, cancelled: true }));
              }}
              data-testid="export-cancel"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            {/* Common settings */}
            <div className={styles.formRow}>
              <span className={styles.label}>Size</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.width}
                onChange={(e) => update('width', parseInt(e.target.value) || 800)}
                min={1}
                max={8192}
                data-testid="export-width"
              />
              <span className={styles.dimSeparator}>x</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.height}
                onChange={(e) => update('height', parseInt(e.target.value) || 600)}
                min={1}
                max={8192}
                data-testid="export-height"
              />
            </div>

            {selectedArtboard && (
              <div className={styles.scopeNote} data-testid="export-artboard-scope">
                Only “{selectedArtboard.node.name || 'Artboard'}” and its contents will be included.
                {selectedArtboard.implicit &&
                  ' It’s the page’s only artboard: select everything (Ctrl+A) first to export the whole page.'}
              </div>
            )}
            {!selectedArtboard && sceneScope && (
              <div className={styles.scopeNote} data-testid="export-scene-scope">
                Everything on the page is included, framed to fit its whole animation. Select an
                artboard to export just that.
              </div>
            )}

            <div className={styles.formRow}>
              <span className={styles.label}>Frame Range</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.startFrame}
                onChange={(e) =>
                  update('startFrame', e.target.value === '' ? 0 : parseInt(e.target.value))
                }
                min={0}
                max={Math.max(0, timelineDuration - 1)}
                data-testid="export-start-frame"
              />
              <span className={styles.dimSeparator}>to</span>
              <input
                className={styles.inputSmall}
                type="number"
                value={state.endFrame}
                onChange={(e) =>
                  update('endFrame', e.target.value === '' ? 0 : parseInt(e.target.value))
                }
                min={0}
                max={Math.max(0, timelineDuration - 1)}
                data-testid="export-end-frame"
              />
            </div>

            {/* Tab-specific settings */}
            {state.tab === 'png-sequence' && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Multiplier</span>
                  <select
                    className={styles.select}
                    value={state.pngMultiplier}
                    onChange={(e) =>
                      update('pngMultiplier', parseInt(e.target.value) as 1 | 2 | 3 | 4)
                    }
                    data-testid="export-png-multiplier"
                  >
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={3}>3x</option>
                    <option value={4}>4x</option>
                  </select>
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Background</span>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.pngTransparent}
                      onChange={(e) => update('pngTransparent', e.target.checked)}
                      data-testid="export-png-transparent"
                    />
                    <span>Transparent</span>
                  </label>
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Pattern</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={state.pngPattern}
                    onChange={(e) => update('pngPattern', e.target.value)}
                    placeholder="frame_{N}"
                    data-testid="export-png-pattern"
                  />
                </div>
              </>
            )}

            {state.tab === 'gif' && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Background</span>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.gifTransparent}
                      onChange={(e) => update('gifTransparent', e.target.checked)}
                      data-testid="export-gif-transparent"
                    />
                    <span>Transparent</span>
                  </label>
                </div>
                <TimingFields
                  format="gif"
                  rates={frameRateChoices(timeline.frameRate, MAX_GIF_FPS)}
                  projectRate={timeline.frameRate}
                  fps={state.gifFps}
                  speed={state.gifSpeed}
                  onFps={(fps) => update('gifFps', fps)}
                  onSpeed={(speed) => update('gifSpeed', speed)}
                  summary={describeGifTiming(
                    gifTiming({
                      frameRate: timeline.frameRate,
                      startFrame: state.startFrame,
                      endFrame: state.endFrame,
                      fps: state.gifFps,
                      speed: state.gifSpeed,
                    })
                  )}
                />
                <div className={styles.formRow}>
                  <label className={styles.label} htmlFor="export-gif-compression">
                    Compression
                  </label>
                  <input
                    id="export-gif-compression"
                    className={styles.range}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={state.gifCompression}
                    onChange={(e) => update('gifCompression', Number(e.target.value))}
                    data-testid="export-gif-compression"
                  />
                  <output className={styles.rangeValue} htmlFor="export-gif-compression">
                    {state.gifCompression}%
                  </output>
                </div>
                <p className={styles.scopeNote} data-testid="export-gif-compression-note">
                  {describeGifCompression(state.gifCompression)}
                </p>
              </>
            )}

            {state.tab === 'mp4' && (
              <>
                <TimingFields
                  format="mp4"
                  rates={frameRateChoices(timeline.frameRate)}
                  projectRate={timeline.frameRate}
                  fps={state.mp4Fps}
                  speed={state.mp4Speed}
                  onFps={(fps) => update('mp4Fps', fps)}
                  onSpeed={(speed) => update('mp4Speed', speed)}
                  summary={describeVideoTiming(
                    sampleTimeline({
                      frameRate: timeline.frameRate,
                      startFrame: state.startFrame,
                      endFrame: state.endFrame,
                      fps: state.mp4Fps,
                      speed: state.mp4Speed,
                    })
                  )}
                />
                <div className={styles.warning} role="note">
                  <span className={styles.warningText}>
                    MP4 uses H.264 encoding and a solid background. Availability depends on your
                    browser and device.
                  </span>
                </div>
              </>
            )}

            {state.tab === 'webm' && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Background</span>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.webmTransparent}
                      onChange={(e) => update('webmTransparent', e.target.checked)}
                      data-testid="export-webm-transparent"
                    />
                    <span>Transparent</span>
                  </label>
                </div>
                <TimingFields
                  format="webm"
                  rates={frameRateChoices(timeline.frameRate)}
                  projectRate={timeline.frameRate}
                  fps={state.webmFps}
                  speed={state.webmSpeed}
                  onFps={(fps) => update('webmFps', fps)}
                  onSpeed={(speed) => update('webmSpeed', speed)}
                  summary={describeVideoTiming(
                    sampleTimeline({
                      frameRate: timeline.frameRate,
                      startFrame: state.startFrame,
                      endFrame: state.endFrame,
                      fps: state.webmFps,
                      speed: state.webmSpeed,
                    })
                  )}
                />
                <div className={styles.warning} role="note">
                  <span className={styles.warningText}>
                    WebM uses VP9 (VP8 where VP9 isn’t available) and can keep a transparent
                    background, which Chrome, Edge and Firefox show. Availability depends on your
                    browser and device.
                  </span>
                </div>
              </>
            )}

            {state.tab === 'sprite-sheet' && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Layout</span>
                  <select
                    className={styles.select}
                    value={state.spriteLayout}
                    onChange={(e) => update('spriteLayout', e.target.value as 'grid' | 'packed')}
                    data-testid="export-sprite-layout"
                  >
                    <option value="grid">Grid</option>
                    <option value="packed">Packed</option>
                  </select>
                </div>
                {state.spriteLayout === 'grid' && (
                  <div className={styles.formRow}>
                    <span className={styles.label}>Columns</span>
                    <input
                      className={styles.inputSmall}
                      type="number"
                      value={state.spriteColumns}
                      onChange={(e) => update('spriteColumns', parseInt(e.target.value) || 0)}
                      min={0}
                      placeholder="Auto"
                      data-testid="export-sprite-columns"
                    />
                  </div>
                )}
                <div className={styles.formRow}>
                  <span className={styles.label}>Padding</span>
                  <input
                    className={styles.inputSmall}
                    type="number"
                    value={state.spritePadding}
                    onChange={(e) => update('spritePadding', parseInt(e.target.value) || 0)}
                    min={0}
                    max={64}
                    data-testid="export-sprite-padding"
                  />
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Options</span>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.spritePowerOfTwo}
                      onChange={(e) => update('spritePowerOfTwo', e.target.checked)}
                    />
                    <span>Power of Two</span>
                  </label>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={state.spriteIncludeMetadata}
                      onChange={(e) => update('spriteIncludeMetadata', e.target.checked)}
                    />
                    <span>Include JSON</span>
                  </label>
                </div>
              </>
            )}

            {state.tab === 'lottie' && lottieAnalysis && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Supported</span>
                  <span style={{ fontSize: 11, color: '#a1a1aa' }}>
                    {lottieAnalysis.supportedCount} nodes
                  </span>
                </div>
                {lottieAnalysis.unsupportedCount > 0 && (
                  <div className={styles.warning}>
                    <AlertTriangle size={14} className={styles.warningIcon} />
                    <span className={styles.warningText}>
                      {lottieAnalysis.unsupportedCount} unsupported node(s) will be skipped:{' '}
                      {lottieAnalysis.unsupportedTypes.join(', ')}.
                    </span>
                  </div>
                )}
                {lottieAnalysis.unbentImageCount > 0 && (
                  <div className={styles.warning} data-testid="lottie-unbent-images">
                    <AlertTriangle size={14} className={styles.warningIcon} />
                    <span className={styles.warningText}>
                      {lottieAnalysis.unbentImageCount} image
                      {lottieAnalysis.unbentImageCount === 1 ? '' : 's'} bound to bones will export
                      without bending: Lottie can’t warp images. Shapes bend as in the editor.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {state.error && !state.exporting && (
          <div className={styles.warning} role="alert" data-testid="export-error">
            <AlertTriangle size={14} className={styles.warningIcon} />
            <span className={styles.warningText}>{state.error}</span>
          </div>
        )}

        {/* Footer */}
        {!state.exporting && (
          <div className={styles.footer}>
            <button className={styles.btnCancel} onClick={close} data-testid="export-dialog-cancel">
              Cancel
            </button>
            <button
              className={styles.btnPrimary}
              onClick={() => void handleExport()}
              data-testid="export-dialog-export"
            >
              Export
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// Imperative API
// ============================================================================

type HostListener = (tab: ExportTab | null) => void;
const hostListeners = new Set<HostListener>();

/**
 * Show the export dialog with the given format tab active.
 */
export function showExportDialog(tab: ExportTab = 'png-sequence'): void {
  hostListeners.forEach((fn) => fn(tab));
}

/**
 * Mount once in the app root to enable the `showExportDialog()` imperative API.
 */
export function ExportDialogHost() {
  const [activeTab, setActiveTab] = useState<ExportTab | null>(null);

  useEffect(() => {
    const listener: HostListener = (tab) => setActiveTab(tab);
    hostListeners.add(listener);
    return () => {
      hostListeners.delete(listener);
    };
  }, []);

  if (!activeTab) return null;

  return <ExportDialog initialTab={activeTab} onClose={() => setActiveTab(null)} />;
}
