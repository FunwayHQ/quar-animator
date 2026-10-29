/**
 * Export Dialog for Quar Animator
 *
 * Modal dialog with tabs for PNG Sequence, Sprite Sheet, GIF, MP4, WebM, Lottie JSON and SVG export.
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
import { inTimelineScope, widenToAspect } from '@quar/core';
import { scopeDuration, scopeSounds, scopedTimeline } from '@quar/animation';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import {
  exportLottieBlob,
  analyzeLottieExport,
  gifCompressionSettings,
  gifTiming,
  lottieVideoMoments,
  MAX_GIF_FPS,
  videoMomentsAtFrame,
  sampleSlides,
  sampleTimeline,
} from '@quar/export';
import type { ExportProgress, FrameRenderContext, Shot } from '@quar/export';
import { downloadBlob } from '../../services/exportService';
import { decodedSound } from '../../services/soundFiles';
import { loadVideoStills } from '../../services/videoStills';
import {
  defaultExportSize,
  exportRig,
  getArtboardScope,
  getLottieExportScene,
  getSceneExportScope,
  getSlides,
  slideShow,
  slidesSeconds as slidesLength,
} from '../../services/exportScene';
import { KEYS, formatShortcut } from './shortcuts';
import styles from './ExportDialog.module.css';

// ============================================================================
// Types
// ============================================================================

export type ExportTab =
  | 'png-sequence'
  | 'sprite-sheet'
  | 'gif'
  | 'mp4'
  | 'webm'
  | 'lottie'
  | 'svg'
  | 'pdf';

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
  /** MP4 and WebM: with the sound clips the export plays */
  videoSound: boolean;
  // SVG: one frame
  svgFrame: number;
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
  { id: 'svg', label: 'SVG' },
  { id: 'pdf', label: 'PDF' },
];

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

/** Whether a video has the sound clips it plays. */
function SoundField({
  format,
  clips,
  checked,
  onChange,
}: {
  format: 'mp4' | 'webm';
  clips: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={styles.formRow}>
      <span className={styles.label}>Sound</span>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={`export-${format}-sound`}
        />
        <span>{clips === 1 ? 'With its sound clip' : `With its ${clips} sound clips`}</span>
      </label>
    </div>
  );
}

/** The formats that play the page's artboards as slides, one after another. */
const SLIDE_TABS: ExportTab[] = ['mp4', 'webm', 'gif', 'png-sequence'];

/** "1.5 s", "12 s". */
function formatSeconds(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
}

// ============================================================================
// Component
// ============================================================================

function ExportDialog({ initialTab, onClose }: { initialTab: ExportTab; onClose: () => void }) {
  const sceneGraph = useSceneGraph();
  const timeline = useEditorStore((s) => s.timeline);
  // The timeline in view's length (an artboard's, or the page's)
  const viewDuration = useEditorStore((s) => s.timelineDuration);
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds);
  // What shows behind the art in formats without transparency (or with it off)
  const documentBackground = useEditorStore((s) => s.documentBackground);
  const selectedArtboard = getArtboardScope(sceneGraph, selectedNodeIds);
  // An artboard exports its own timeline (the page's only one may not be the one in view)
  const timelineDuration = selectedArtboard
    ? scopeDuration(timeline, selectedArtboard.node.id)
    : viewDuration;
  // With no artboard chosen, the page's artboards are slides: an animated
  // export plays each over its own timeline, one after another
  const [slides] = useState(() => (selectedArtboard ? [] : getSlides(sceneGraph, timeline)));
  // With no artboard chosen, the export frames all the artwork, wherever it
  // moves — the rig's motion (IK, physics, bent shapes) included
  const [sceneScope] = useState(() =>
    selectedArtboard
      ? null
      : getSceneExportScope(
          sceneGraph,
          timeline,
          useEditorStore.getState().symbols,
          timelineDuration,
          exportRig(useEditorStore.getState(), timeline.frameRate)
        )
  );
  // The first slide's size, when there are slides — but a Lottie of the
  // whole page is framed to fit all the artwork, so it starts at that size
  const defaultSizeFor = (tab: ExportTab) =>
    defaultExportSize(
      selectedArtboard?.bounds ??
        (slides.length > 1 && tab !== 'lottie' ? slides[0]!.bounds : sceneScope)
    );
  const defaultSize = defaultSizeFor(initialTab);

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
    videoSound: true,
    svgFrame: Math.min(
      Math.max(0, timelineDuration - 1),
      Math.max(0, Math.round(useEditorStore.getState().currentFrame ?? 0))
    ),
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

  // Closing mid-export cancels it, rather than leaving it running unseen to
  // download its file after the dialog is gone
  const requestClose = useCallback(() => {
    if (state.exporting) cancelledRef.current = true;
    close();
  }, [state.exporting, close]);

  // Escape stops a running export, or else closes the dialog. It listens on
  // the document: focus usually stays where it was when the dialog opened
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (state.exporting) {
        cancelledRef.current = true;
        setState((s) => ({ ...s, cancelled: true }));
      } else {
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, state.exporting]);

  // This export is of the slides: an animated format, and two or more of them
  const slidesExport = slides.length > 1 && SLIDE_TABS.includes(state.tab);
  // …or a PDF of them, a page a slide
  const slidesPdf = slides.length > 1 && state.tab === 'pdf';
  // How long they play, the transitions between them too
  const slidesSeconds = slidesLength(slides, timeline.frameRate);

  // The sound clips a video of this has: each slide's, the artboard's, or the page's
  const soundClipCount = slidesExport
    ? slides.reduce((sum, slide) => sum + scopeSounds(timeline, slide.node.id).length, 0)
    : scopeSounds(timeline, selectedArtboard ? selectedArtboard.node.id : null).length;
  const withSound = state.videoSound && soundClipCount > 0;

  // What the timing lines count: the range, or all the slides (and the transitions between them)
  const slidesFrames = slides.reduce((sum, slide) => sum + slide.frameCount, 0);
  const timingRange = slidesExport
    ? { startFrame: 0, endFrame: Math.max(0, slidesFrames - 1) }
    : { startFrame: state.startFrame, endFrame: state.endFrame };
  const timedSlides = slidesExport
    ? slides.map((slide) => ({
        ctx: slide.node.id,
        frameCount: slide.frameCount,
        transition: slide.transition,
      }))
    : undefined;
  /** The frames a video of this has at `fps` and `speed`, and its rate. */
  const videoTiming = (fps: number, speed: number) => {
    const timing = { frameRate: timeline.frameRate, fps, speed };
    if (!timedSlides) return sampleTimeline({ ...timing, ...timingRange });
    const plan = sampleSlides(timedSlides, timing);
    return { fps: plan.fps, frames: plan.shots.map((shot) => shot.frame) };
  };

  const update = <K extends keyof ExportDialogState>(key: K, value: ExportDialogState[K]) => {
    setState((s) => ({ ...s, [key]: value, error: null }));
  };

  // A size left as it started follows the format to its own default
  const selectTab = (tab: ExportTab) => {
    setState((s) => {
      const before = defaultSizeFor(s.tab);
      const untouched = s.width === before.width && s.height === before.height;
      return { ...s, tab, error: null, ...(untouched ? defaultSizeFor(tab) : {}) };
    });
  };

  const lottieExportScene = getLottieExportScene(
    sceneGraph,
    timeline,
    selectedArtboard,
    state.width,
    state.height,
    sceneScope
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
      // A chosen artboard plays its own timeline
      timeline: selectedArtboard
        ? scopedTimeline(
            timeline,
            selectedArtboard.node.id,
            inTimelineScope(sceneGraph, selectedArtboard.node.id)
          )
        : timeline,
      // Pose rigs like the editor: IK, physics chains and Smart Bone morphs
      rig: exportRig(useEditorStore.getState(), timeline.frameRate),
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
    // Each artboard over its own timeline, fitted into the export's size
    const slideFrames = slidesExport
      ? slideShow(slides, frameRenderContext, state.width, state.height)
      : undefined;

    const lastFrame = Math.max(0, timelineDuration - 1);
    if (state.tab === 'svg') {
      if (!Number.isInteger(state.svgFrame) || state.svgFrame < 0 || state.svgFrame > lastFrame) {
        setState((s) => ({ ...s, error: `Choose a frame between 0 and ${lastFrame}.` }));
        return;
      }
      const { exportSvgFrame } = await import('@quar/export');
      // SVG plays no video: each video layer is a still of the frame
      const videoStills = await loadVideoStills(
        videoMomentsAtFrame(
          frameRenderRoots,
          (id) => sceneGraph.getNode(id),
          state.svgFrame,
          timeline.frameRate
        )
      );
      const svg = exportSvgFrame(sceneGraph, timeline, frameRenderContext.rig, {
        frame: state.svgFrame,
        rootIds: selectedArtboard ? [selectedArtboard.node.id] : undefined,
        symbols: frameRenderContext.symbols,
        videoStills,
      });
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `frame_${state.svgFrame}.svg`);
      close();
      return;
    }
    if (
      !slidesExport &&
      state.tab !== 'pdf' &&
      (!Number.isInteger(state.startFrame) ||
        !Number.isInteger(state.endFrame) ||
        state.startFrame < 0 ||
        state.endFrame < state.startFrame ||
        state.endFrame > lastFrame)
    ) {
      setState((s) => ({
        ...s,
        error: `Choose a valid frame range between 0 and ${lastFrame}.`,
      }));
      return;
    }
    if (
      state.tab !== 'pdf' &&
      (!Number.isInteger(state.width) ||
        !Number.isInteger(state.height) ||
        state.width < 1 ||
        state.height < 1 ||
        state.width > 8192 ||
        state.height > 8192)
    ) {
      setState((s) => ({ ...s, error: 'Export dimensions must be between 1 and 8192 pixels.' }));
      return;
    }

    cancelledRef.current = false;
    setState((s) => ({ ...s, exporting: true, progress: null, cancelled: false }));
    // Auto-save pauses, and the frames the export poses aren't edits
    useEditorStore.getState().setExporting(true);

    try {
      if (state.tab === 'pdf') {
        const { exportPdf } = await import('@quar/export');
        const page = {
          sceneGraph,
          rig: frameRenderContext.rig,
          symbols: frameRenderContext.symbols,
          background: documentBackground,
        };
        // A page a slide, each at its own timeline's last frame; else the
        // artboard, or all the artwork, at the timeline's last frame
        const pages = selectedArtboard
          ? [
              {
                ...page,
                timeline: frameRenderContext.timeline,
                rootIds: [selectedArtboard.node.id],
                viewport: selectedArtboard.bounds,
                frame: lastFrame,
              },
            ]
          : slides.length > 1
            ? slides.map((slide) => ({
                ...page,
                timeline: scopedTimeline(
                  timeline,
                  slide.node.id,
                  inTimelineScope(sceneGraph, slide.node.id)
                ),
                rootIds: [slide.node.id],
                viewport: slide.bounds,
                frame: Math.max(0, slide.frameCount - 1),
              }))
            : sceneScope
              ? [{ ...page, timeline, viewport: sceneScope, frame: lastFrame }]
              : [];
        if (pages.length === 0) throw new Error('There’s nothing on the page to export.');
        const blob = await exportPdf(
          pages,
          { title: useEditorStore.getState().projectName },
          (progress) => setState((s) => ({ ...s, progress })),
          () => cancelledRef.current
        );
        if (blob && !cancelledRef.current) {
          downloadBlob(blob, pages.length > 1 ? 'slides.pdf' : `frame_${pages[0]!.frame}.pdf`);
          close();
        }
      } else if (state.tab === 'lottie') {
        // Lottie plays no video: each video layer is a still of the first moment it shows
        const videoStills = await loadVideoStills(
          lottieVideoMoments(
            lottieExportScene.nodes,
            lottieExportScene.timeline,
            state.startFrame,
            state.endFrame,
            (id: string) => sceneGraph.getNode(id)
          )
        );
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
            videoStills,
          },
          (id: string) => sceneGraph.getNode(id)
        );
        if (!cancelledRef.current) {
          downloadBlob(blob, 'animation.json');
          close();
        }
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
            slides: slideFrames,
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
            slides: slideFrames,
            ...(withSound && {
              sounds: useEditorStore.getState().sounds,
              decodeSound: decodedSound,
            }),
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
            slides: slideFrames,
            ...(withSound && {
              sounds: useEditorStore.getState().sounds,
              decodeSound: decodedSound,
            }),
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
        const { createFrameRenderer, createShotRenderer, getFrameCount, generateFrameFilenames } =
          await import('@quar/export');
        const JSZip = (await import('jszip')).default;

        // Every frame of the range — or of each slide's timeline, one after
        // another, the transitions between them at the timeline's rate
        const shots: Shot<FrameRenderContext>[] = slideFrames
          ? sampleSlides(slideFrames, { frameRate: timeline.frameRate }).shots
          : Array.from({ length: getFrameCount(state.startFrame, state.endFrame) }, (_, i) => ({
              ctx: frameRenderContext,
              frame: state.startFrame + i,
            }));
        const frameCount = shots.length;
        const filenames = slideFrames
          ? generateFrameFilenames(state.pngPattern, 0, frameCount - 1, 'png')
          : generateFrameFilenames(state.pngPattern, state.startFrame, state.endFrame, 'png');
        const zip = new JSZip();

        const renderer = createFrameRenderer({
          width: state.width,
          height: state.height,
          multiplier: state.pngMultiplier,
          backgroundColor: state.pngTransparent ? null : documentBackground,
        });
        const draw = createShotRenderer(renderer, {
          background: state.pngTransparent ? null : documentBackground,
        });

        try {
          // Pre-load image textures so they render correctly
          await renderer.preloadTextures(frameRenderRoots, sceneGraph, frameRenderContext.symbols);

          for (let i = 0; i < frameCount; i++) {
            if (cancelledRef.current) break;

            const shot = shots[i]!;
            const progress: ExportProgress = {
              phase: 'rendering',
              current: i + 1,
              total: frameCount,
              percentage: Math.round(((i + 1) / frameCount) * 100),
            };
            setState((s) => ({ ...s, progress }));

            const blob = await draw.renderAsBlob(shot);
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

        try {
          // Pre-load image textures so they render correctly
          await renderer.preloadTextures(frameRenderRoots, sceneGraph, frameRenderContext.symbols);

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
    slides,
    slidesExport,
    withSound,
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
          <button
            className={styles.closeBtn}
            onClick={requestClose}
            data-testid="export-dialog-close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tab} ${state.tab === t.id ? styles.active : ''}`}
              onClick={() => selectTab(t.id)}
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
              {state.tab === 'pdf' && state.progress.phase === 'rendering'
                ? `Drawing page ${state.progress.current + 1} / ${state.progress.total}...`
                : state.progress.phase === 'preparing'
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
            {state.tab !== 'svg' && state.tab !== 'pdf' && (
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
            )}

            {selectedArtboard && (
              <div className={styles.scopeNote} data-testid="export-artboard-scope">
                Only “{selectedArtboard.node.name || 'Artboard'}” and its contents will be included.
                {selectedArtboard.implicit &&
                  ` It’s the page’s only artboard: select everything (${formatShortcut(KEYS.selectAll)}) first to export the whole page.`}
              </div>
            )}
            {slidesExport && (
              <div className={styles.scopeNote} data-testid="export-slides-scope">
                {slides.length} slides, one after another: each artboard over its own timeline, in
                the Layers panel’s order ({formatSeconds(slidesSeconds)} in all). Select an artboard
                to export just that.
              </div>
            )}
            {slidesPdf && (
              <div className={styles.scopeNote} data-testid="export-pdf-slides-scope">
                {slides.length} pages, a slide each: every artboard at its own size, in the Layers
                panel’s order. Select an artboard to export just that.
              </div>
            )}
            {!selectedArtboard && sceneScope && !slidesExport && !slidesPdf && (
              <div className={styles.scopeNote} data-testid="export-scene-scope">
                Everything on the page is included, framed to fit its whole animation. Select an
                artboard to export just that.
              </div>
            )}

            {state.tab === 'svg' ? (
              <>
                <div className={styles.formRow}>
                  <label className={styles.label} htmlFor="export-svg-frame">
                    Frame
                  </label>
                  <input
                    id="export-svg-frame"
                    className={styles.inputSmall}
                    type="number"
                    value={state.svgFrame}
                    onChange={(e) =>
                      update('svgFrame', e.target.value === '' ? 0 : parseInt(e.target.value))
                    }
                    min={0}
                    max={Math.max(0, timelineDuration - 1)}
                    data-testid="export-svg-frame"
                  />
                </div>
                <p className={styles.scopeNote} data-testid="export-svg-note">
                  A still of this frame, as vectors, at the artwork’s own size. Shapes bent by their
                  bones are written as their bent outlines; images bound to bones aren’t bent.
                </p>
              </>
            ) : state.tab === 'pdf' ? (
              <p className={styles.scopeNote} data-testid="export-pdf-note">
                Vector pages, each at its timeline’s last frame, as the canvas draws it. Layers with
                a blur or a drop shadow, and pictures bent by bones or adjusted, go in as pictures.
              </p>
            ) : slidesExport ? null : (
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
            )}

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
                      ...timingRange,
                      fps: state.gifFps,
                      speed: state.gifSpeed,
                      ...(timedSlides && { slides: timedSlides }),
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
                {soundClipCount > 0 && (
                  <SoundField
                    format="mp4"
                    clips={soundClipCount}
                    checked={state.videoSound}
                    onChange={(checked) => update('videoSound', checked)}
                  />
                )}
                <TimingFields
                  format="mp4"
                  rates={frameRateChoices(timeline.frameRate)}
                  projectRate={timeline.frameRate}
                  fps={state.mp4Fps}
                  speed={state.mp4Speed}
                  onFps={(fps) => update('mp4Fps', fps)}
                  onSpeed={(speed) => update('mp4Speed', speed)}
                  summary={describeVideoTiming(videoTiming(state.mp4Fps, state.mp4Speed))}
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
                {soundClipCount > 0 && (
                  <SoundField
                    format="webm"
                    clips={soundClipCount}
                    checked={state.videoSound}
                    onChange={(checked) => update('videoSound', checked)}
                  />
                )}
                <TimingFields
                  format="webm"
                  rates={frameRateChoices(timeline.frameRate)}
                  projectRate={timeline.frameRate}
                  fps={state.webmFps}
                  speed={state.webmSpeed}
                  onFps={(fps) => update('webmFps', fps)}
                  onSpeed={(speed) => update('webmSpeed', speed)}
                  summary={describeVideoTiming(videoTiming(state.webmFps, state.webmSpeed))}
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
                {lottieAnalysis.effectNodeCount > 0 && (
                  <div className={styles.warning} data-testid="lottie-dropped-effects">
                    <AlertTriangle size={14} className={styles.warningIcon} />
                    <span className={styles.warningText}>
                      {lottieAnalysis.effectNodeCount} layer
                      {lottieAnalysis.effectNodeCount === 1 ? '' : 's'} will export without{' '}
                      {effectNames(lottieAnalysis.droppedEffects)}: Lottie doesn’t get effects.
                    </span>
                  </div>
                )}
                {lottieAnalysis.blendModeNodeCount > 0 && (
                  <div className={styles.warning} data-testid="lottie-dropped-blend-modes">
                    <AlertTriangle size={14} className={styles.warningIcon} />
                    <span className={styles.warningText}>
                      {lottieAnalysis.blendModeNodeCount} layer
                      {lottieAnalysis.blendModeNodeCount === 1 ? '' : 's'} in a blend mode will
                      export as normal.
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
/** Effects by the names the Properties panel gives them, in a sentence. */
function effectNames(types: readonly string[]): string {
  const names: Record<string, string> = {
    'drop-shadow': 'drop shadows',
    'inner-shadow': 'inner shadows',
    'layer-blur': 'blurs',
  };
  const list = types.map((type) => names[type] ?? type);
  return list.length > 1
    ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
    : (list[0] ?? 'effects');
}

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
