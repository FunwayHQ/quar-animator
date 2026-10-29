import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as baseRender, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { createDefaultTransform } from '@quar/core';
import type { ArtboardNode, Node } from '@quar/types';
import {
  analyzeLottieExport,
  exportGif,
  exportLottieBlob,
  exportMp4,
  exportPdf,
  exportSvgFrame,
  exportWebm,
} from '@quar/export';
import { downloadBlob } from '../../services/exportService';
import { loadVideoStills } from '../../services/videoStills';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';

// Mock the editor store
const mockStore = {
  timeline: {
    id: 'tl-1',
    name: 'Timeline',
    duration: 60,
    frameRate: 30,
    tracks: [],
    markers: [],
  },
  timelineDuration: 60,
  currentFrame: 12,
  projectName: 'Deck',
  setExporting: vi.fn(),
  selectedNodeIds: new Set<string>(),
  ikChains: [{ id: 'arm-ik' }],
  dynamicChains: [],
  smartBoneActions: [],
  globalWind: { strength: 0, direction: 0, turbulence: 0, frequency: 1, enabled: false },
};

vi.mock('../../stores/editorStore', () => ({
  useEditorStore: Object.assign(
    (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
    { getState: () => mockStore }
  ),
}));

// A frame renderer for PNG sequences and sprite sheets that draws nothing
const frameRenderer = vi.hoisted(() => ({
  preloadTextures: vi.fn(() => Promise.resolve()),
  renderFrame: vi.fn(() => document.createElement('canvas')),
  renderFrameAsBlob: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
  dispose: vi.fn(),
}));

// The video pictures decoded for each frame, stood in for: what's prepared, in order
const videoFrames = vi.hoisted(() => ({
  made: [] as Array<{ shots: unknown[]; size: unknown; sources: unknown }>,
  log: [] as string[],
  provider: () => null,
  disposed: 0,
  /** The videos that couldn't be decoded, told on disposing as the real thing does */
  problems: [] as string[],
}));

// Mock export functions (the scene's extent is the real thing: it decides the framing)
vi.mock('@quar/export', async () => {
  const actual = await vi.importActual<typeof import('@quar/export')>('@quar/export');
  return {
    getAnimatedArtworkBounds: actual.getAnimatedArtworkBounds,
    sampleFrames: actual.sampleFrames,
    getFrameCount: actual.getFrameCount,
    generateFrameFilenames: actual.generateFrameFilenames,
    // The slides' plan as it is: their frames and the transitions between them
    sampleSlides: actual.sampleSlides,
    createShotRenderer: actual.createShotRenderer,
    packGrid: actual.packGrid,
    packMaxRects: actual.packMaxRects,
    nextPowerOfTwo: actual.nextPowerOfTwo,
    assertAllFramesPacked: actual.assertAllFramesPacked,
    generateSpriteSheetMetadata: actual.generateSpriteSheetMetadata,
    createFrameRenderer: vi.fn(() => frameRenderer),
    createExportVideoFrames: (shots: unknown[], size: unknown, sources: unknown) => {
      videoFrames.made.push({ shots, size, sources });
      return {
        provider: videoFrames.provider,
        problems: videoFrames.problems,
        prepare: async (index: number) => {
          await Promise.resolve();
          videoFrames.log.push(`prepare ${index}`);
        },
        dispose: () => {
          videoFrames.disposed++;
          const { onVideoProblems } = sources as { onVideoProblems?: (names: string[]) => void };
          if (videoFrames.problems.length > 0) onVideoProblems?.([...videoFrames.problems]);
        },
      };
    },
    exportLottieBlob: vi.fn().mockReturnValue(new Blob(['{}'], { type: 'application/json' })),
    exportGif: vi.fn().mockResolvedValue(new Blob(['gif'], { type: 'image/gif' })),
    exportMp4: vi.fn().mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' })),
    exportWebm: vi.fn().mockResolvedValue(new Blob(['webm'], { type: 'video/webm' })),
    exportSvgFrame: vi.fn().mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    exportPdf: vi.fn().mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    MAX_GIF_FPS: 50,
    sampleTimeline: (
      o: { frameRate: number; startFrame: number; endFrame: number; fps?: number; speed?: number },
      maxFps = Infinity
    ) => {
      const fps = Math.min(maxFps, o.fps ?? o.frameRate);
      const seconds = (o.endFrame - o.startFrame + 1) / o.frameRate / (o.speed ?? 1);
      return { fps, frames: new Array(Math.round(seconds * fps)).fill(0) };
    },
    // Frame count and length for a range, at a frame rate and speed
    gifTiming: (o: {
      frameRate: number;
      startFrame: number;
      endFrame: number;
      fps?: number;
      speed?: number;
    }) => {
      const fps = o.fps ?? o.frameRate;
      const seconds = (o.endFrame - o.startFrame + 1) / o.frameRate / (o.speed ?? 1);
      const count = Math.round(seconds * fps);
      return { frames: new Array(count).fill(0), delays: [Math.round(seconds * 100)] };
    },
    gifCompressionSettings: (compression: number) => ({
      colors: Math.max(16, Math.round(256 * 2 ** (-compression / 25))),
      tolerance: (compression / 100) * 24,
    }),
    // Which moment each video layer shows, as it is
    lottieVideoMoments: actual.lottieVideoMoments,
    videoMomentsAtFrame: actual.videoMomentsAtFrame,
    countVideoLayers: actual.countVideoLayers,
    analyzeLottieExport: vi.fn().mockReturnValue({
      supportedCount: 2,
      unsupportedCount: 1,
      unsupportedTypes: ['text'],
      animatedTrackCount: 0,
    }),
  };
});

// Mock download
vi.mock('../../services/exportService', () => ({
  downloadBlob: vi.fn(),
}));

// Each video layer's still named for its layer and moment
vi.mock('../../services/videoStills', () => ({
  loadVideoStills: vi.fn((moments: Array<{ nodeId: string; seconds: number }>) =>
    Promise.resolve(new Map(moments.map((m) => [m.nodeId, `still:${m.nodeId}@${m.seconds}`])))
  ),
}));

// Mock jszip (used via dynamic import in PNG sequence handler)
vi.mock('jszip', () => ({
  default: class MockJSZip {
    file() {}
    generateAsync() {
      return Promise.resolve(new Blob());
    }
  },
}));

import { ExportDialogHost, showExportDialog } from './ExportDialog';

function render(ui: ReactElement) {
  return baseRender(<SceneGraphProvider>{ui}</SceneGraphProvider>);
}

function ArtboardSeeder({ fills = [] }: { fills?: ArtboardNode['fills'] }) {
  const sceneGraph = useSceneGraph();
  useEffect(() => {
    const artboard: ArtboardNode = {
      id: 'artboard-1',
      name: 'Title Card',
      type: 'artboard',
      parent: null,
      children: [],
      transform: { ...createDefaultTransform(), position: { x: 350, y: 250 } },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: 640,
      height: 360,
      fills,
      clipContent: true,
    };
    sceneGraph.addNode(artboard);
    const child = {
      id: 'shape-in-artboard',
      name: 'Title',
      type: 'rectangle',
      parent: null,
      children: [],
      transform: { ...createDefaultTransform(), position: { x: 10, y: 20 } },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width: 100,
      height: 50,
      cornerRadius: [0, 0, 0, 0],
      fills: [],
      strokes: [],
    } as unknown as Node;
    sceneGraph.addNode(child, artboard.id);
  }, [sceneGraph, fills]);
  return null;
}

function renderWithArtboard(ui: ReactElement, fills?: ArtboardNode['fills']) {
  return baseRender(
    <SceneGraphProvider>
      <ArtboardSeeder fills={fills} />
      {ui}
    </SceneGraphProvider>
  );
}

/** A video layer on the page, its clip from frame 10, 1 s into its video. */
function VideoSeeder() {
  const sceneGraph = useSceneGraph();
  useEffect(() => {
    sceneGraph.addNode({
      id: 'video-1',
      name: 'Clip',
      type: 'video',
      parent: null,
      children: [],
      transform: createDefaultTransform(),
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      videoId: 'clip',
      width: 320,
      height: 180,
      naturalWidth: 1280,
      naturalHeight: 720,
      cornerRadius: [0, 0, 0, 0],
      clip: { start: 10, offset: 1, duration: 4 },
    });
  }, [sceneGraph]);
  return null;
}

/** Two slides: "Intro" (on top in the Layers panel) and "Outro". */
function SlidesSeeder() {
  const sceneGraph = useSceneGraph();
  useEffect(() => {
    const board = (id: string, name: string, x: number, width: number): ArtboardNode => ({
      id,
      name,
      type: 'artboard',
      parent: null,
      children: [],
      transform: { ...createDefaultTransform(), position: { x, y: 0 } },
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      width,
      height: 360,
      fills: [],
      clipContent: true,
    });
    sceneGraph.addNode(board('outro', 'Outro', 1000, 1280));
    sceneGraph.addNode(board('intro', 'Intro', 0, 640));
  }, [sceneGraph]);
  return null;
}

describe('ExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.selectedNodeIds = new Set<string>();
    mockStore.timeline.tracks = [];
  });

  it('does not render when not triggered', () => {
    render(<ExportDialogHost />);
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
  });

  it('renders when showExportDialog is called', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
    expect(screen.getByText('Export Animation')).toBeInTheDocument();
  });

  it('shows all format tabs', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    expect(screen.getByTestId('export-tab-png-sequence')).toBeInTheDocument();
    expect(screen.getByTestId('export-tab-sprite-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('export-tab-gif')).toBeInTheDocument();
    expect(screen.getByTestId('export-tab-mp4')).toBeInTheDocument();
    expect(screen.getByTestId('export-tab-lottie')).toBeInTheDocument();
  });

  it('activates the requested tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('lottie'));
    const lottieTab = screen.getByTestId('export-tab-lottie');
    expect(lottieTab.className).toContain('active');
  });

  it('switches tabs on click', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));

    fireEvent.click(screen.getByTestId('export-tab-sprite-sheet'));
    expect(screen.getByTestId('export-tab-sprite-sheet').className).toContain('active');
  });

  it('shows common size and frame range controls', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    expect(screen.getByTestId('export-width')).toBeInTheDocument();
    expect(screen.getByTestId('export-height')).toBeInTheDocument();
    expect(screen.getByTestId('export-start-frame')).toBeInTheDocument();
    expect(screen.getByTestId('export-end-frame')).toBeInTheDocument();
  });

  it('shows PNG-specific controls on PNG tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    expect(screen.getByTestId('export-png-multiplier')).toBeInTheDocument();
    expect(screen.getByTestId('export-png-transparent')).toBeInTheDocument();
    expect(screen.getByTestId('export-png-pattern')).toBeInTheDocument();
  });

  it('shows Sprite Sheet controls on sprite tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('sprite-sheet'));
    expect(screen.getByTestId('export-sprite-layout')).toBeInTheDocument();
    expect(screen.getByTestId('export-sprite-padding')).toBeInTheDocument();
  });

  it('shows GIF transparency control on GIF tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    expect(screen.getByTestId('export-gif-transparent')).toBeInTheDocument();
  });

  it('passes the chosen GIF frame rate and speed to the exporter', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    // 60 frames at 30 fps
    expect(screen.getByTestId('export-gif-fps')).toHaveValue('30');
    expect(screen.getByRole('option', { name: '30 fps (project)' })).toBeInTheDocument();
    expect(screen.getByTestId('export-gif-timing')).toHaveTextContent('60 frames · 2.0 s');

    fireEvent.change(screen.getByTestId('export-gif-fps'), { target: { value: '15' } });
    fireEvent.change(screen.getByTestId('export-gif-speed'), { target: { value: '2' } });
    expect(screen.getByTestId('export-gif-timing')).toHaveTextContent('15 frames · 1.0 s');

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());
    expect(vi.mocked(exportGif).mock.calls[0]![1]).toMatchObject({
      frameRate: 30,
      fps: 15,
      speed: 2,
    });
  });

  it('passes the chosen GIF compression to the exporter', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    expect(screen.getByTestId('export-gif-compression-note')).toHaveTextContent(
      /256 colors, lossless/
    );

    fireEvent.change(screen.getByTestId('export-gif-compression'), { target: { value: '50' } });
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByTestId('export-gif-compression-note')).toHaveTextContent(
      /64 colors; subtle color changes/
    );

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());
    expect(vi.mocked(exportGif).mock.calls[0]![1]).toMatchObject({ compression: 50 });
  });

  it('shows MP4 encoder requirements on MP4 tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('mp4'));
    expect(screen.getByText(/MP4 uses H\.264 encoding/)).toBeInTheDocument();
  });

  it('runs the GIF exporter and downloads its output', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());
    expect(exportGif).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneGraph: expect.any(Object),
        timeline: mockStore.timeline,
        // The rig is posed in every frame, as in the editor
        rig: expect.objectContaining({ ikChains: [{ id: 'arm-ik' }], frameRate: 30 }),
      }),
      expect.objectContaining({ startFrame: 0, endFrame: 59, transparent: false }),
      expect.any(Function),
      expect.any(Function)
    );
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'animation.gif');
  });

  it('pauses auto-save for the export, and resumes it when done', async () => {
    mockStore.setExporting.mockClear();
    vi.mocked(exportGif).mockImplementationOnce(() => {
      expect(mockStore.setExporting).toHaveBeenLastCalledWith(true);
      return Promise.resolve(new Blob(['gif'], { type: 'image/gif' }));
    });
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(mockStore.setExporting).toHaveBeenLastCalledWith(false));
    expect(mockStore.setExporting).toHaveBeenCalledTimes(2);
  });

  it('resumes auto-save when an export fails', async () => {
    mockStore.setExporting.mockClear();
    vi.mocked(exportGif).mockRejectedValueOnce(new Error('encoder broke'));
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(mockStore.setExporting).toHaveBeenLastCalledWith(false));
    expect(mockStore.setExporting).toHaveBeenCalledWith(true);
  });

  it("exports the page's only artboard when nothing is selected, saying how to export it all", async () => {
    renderWithArtboard(<ExportDialogHost />);
    act(() => showExportDialog('gif'));

    expect(screen.getByTestId('export-artboard-scope')).toHaveTextContent(
      /Title Card.*page’s only artboard.*select everything/i
    );
    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());
    const [ctx] = vi.mocked(exportGif).mock.calls[0]!;
    expect(ctx.exportRootIds).toEqual(['artboard-1']);
  });

  it('frames the whole scene when everything is selected, sized to fit it', async () => {
    mockStore.selectedNodeIds = new Set(['artboard-1', 'shape-in-artboard']);
    renderWithArtboard(<ExportDialogHost />);
    act(() => showExportDialog('gif'));

    // The artboard (with its contents) is everything drawn: 640 × 360 at (30, 70)
    expect(screen.getByTestId('export-width')).toHaveValue(640);
    expect(screen.getByTestId('export-height')).toHaveValue(360);
    expect(screen.getByTestId('export-scene-scope')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('export-height'), { target: { value: '640' } });
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());
    const [ctx] = vi.mocked(exportGif).mock.calls[0]!;
    expect(ctx.exportRootIds).toBeUndefined();
    // A square output frames the scene square, about its center, without stretching it
    expect(ctx.viewportBounds).toEqual({ x: 30, y: -70, width: 640, height: 640 });
  });

  it('limits frame exports to the selected artboard and starts at its dimensions', async () => {
    mockStore.selectedNodeIds = new Set(['artboard-1']);
    renderWithArtboard(<ExportDialogHost />);
    act(() => showExportDialog('gif'));

    expect(screen.getByTestId('export-width')).toHaveValue(640);
    expect(screen.getByTestId('export-height')).toHaveValue(360);
    expect(screen.getByTestId('export-artboard-scope')).toHaveTextContent(
      /Title Card.*and its contents/i
    );

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());
    expect(exportGif).toHaveBeenCalledWith(
      expect.objectContaining({
        exportRootIds: ['artboard-1'],
        viewportBounds: { x: 30, y: 70, width: 640, height: 360 },
      }),
      expect.any(Object),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('exports only artboard children from Lottie JSON with artboard-relative coordinates', async () => {
    mockStore.selectedNodeIds = new Set(['artboard-1']);
    mockStore.timeline.tracks = [
      {
        id: 'position-track',
        nodeId: 'shape-in-artboard',
        property: 'transform.position.x',
        keyframes: [{ id: 'position-keyframe', time: 0, value: 30, easing: 'linear' }],
      },
    ];
    renderWithArtboard(<ExportDialogHost />);
    act(() => showExportDialog('lottie'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(exportLottieBlob).toHaveBeenCalledOnce());
    const [nodes, timeline, options] = vi.mocked(exportLottieBlob).mock.calls[0]!;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: 'shape-in-artboard',
      transform: { position: { x: 330, y: 200 } },
    });
    expect(timeline.tracks[0]?.keyframes[0]?.value).toBe(350);
    expect(options).toMatchObject({ width: 640, height: 360 });
  });

  it('gives a Lottie the still of each video layer at the first moment it shows', async () => {
    render(
      <>
        <VideoSeeder />
        <ExportDialogHost />
      </>
    );
    act(() => showExportDialog('lottie'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(exportLottieBlob).toHaveBeenCalledOnce());
    const [, , options] = vi.mocked(exportLottieBlob).mock.calls[0]!;
    // Its clip starts at frame 10 of the export: its first picture, 1 s in
    expect([...(options.videoStills ?? [])]).toEqual([['video-1', 'still:video-1@1']]);
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'animation.json');
  });

  it('gives an SVG the still of each video layer at its frame', async () => {
    render(
      <>
        <VideoSeeder />
        <ExportDialogHost />
      </>
    );
    act(() => showExportDialog('svg'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(exportSvgFrame).toHaveBeenCalledOnce());
    const [, , , options] = vi.mocked(exportSvgFrame).mock.calls[0]!;
    // Frame 12 (the playhead's), two frames into its clip: 1 s and two frames into its video
    expect(options.frame).toBe(12);
    const [[id, still]] = [...(options.videoStills ?? [])] as Array<[string, string]>;
    expect(id).toBe('video-1');
    expect(Number(still.split('@')[1])).toBeCloseTo(1 + 2 / 30);
  });

  it('exports the artboard background under its children in Lottie JSON', async () => {
    mockStore.selectedNodeIds = new Set(['artboard-1']);
    mockStore.timeline.tracks = [
      {
        id: 'fill-track',
        nodeId: 'artboard-1',
        property: 'fills.0.opacity',
        keyframes: [{ id: 'fill-keyframe', time: 0, value: 0.5, easing: 'linear' }],
      },
    ];
    const white = { type: 'solid' as const, color: { r: 255, g: 255, b: 255, a: 1 } };
    renderWithArtboard(<ExportDialogHost />, [{ ...white, opacity: 1, visible: true }]);
    act(() => showExportDialog('lottie'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    await waitFor(() => expect(exportLottieBlob).toHaveBeenCalledOnce());
    const [nodes, timeline] = vi.mocked(exportLottieBlob).mock.calls[0]!;
    // Bottom of the stack, covering the whole frame
    expect(nodes.map((node) => node.id)).toEqual(['artboard-1:background', 'shape-in-artboard']);
    expect(nodes[0]).toMatchObject({
      type: 'rectangle',
      width: 640,
      height: 360,
      transform: { position: { x: 320, y: 180 } },
    });
    // The artboard's fill animation moves with it
    expect(timeline.tracks[0]?.nodeId).toBe('artboard-1:background');
  });

  it('with no artboard chosen, plays the artboards as slides in one video', async () => {
    // Intro runs 1 s (its own timeline), Outro the page's 2 s
    (mockStore.timeline as { artboards?: object }).artboards = { intro: { duration: 30 } };
    baseRender(
      <SceneGraphProvider>
        <SlidesSeeder />
        <ExportDialogHost />
      </SceneGraphProvider>
    );
    act(() => showExportDialog('mp4'));
    expect(screen.getByTestId('export-slides-scope')).toHaveTextContent(
      '2 slides, one after another'
    );
    expect(screen.getByTestId('export-slides-scope')).toHaveTextContent('(3 s in all)');
    expect(screen.queryByTestId('export-start-frame')).toBeNull();
    // The first slide's size
    expect(screen.getByTestId('export-width')).toHaveValue(640);
    expect(screen.getByTestId('export-mp4-timing')).toHaveTextContent('90 frames · 3.0 s');

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportMp4).toHaveBeenCalledOnce());
    const { slides } = vi.mocked(exportMp4).mock.calls[0]![1] as {
      slides: Array<{
        ctx: { exportRootIds: string[]; viewportBounds: { width: number; height: number } };
        frameCount: number;
      }>;
    };
    expect(slides.map((s) => [s.ctx.exportRootIds, s.frameCount])).toEqual([
      [['intro'], 30],
      [['outro'], 60],
    ]);
    // The wider slide fitted into the first's shape, not stretched
    const outro = slides[1]!.ctx.viewportBounds;
    expect(outro.width / outro.height).toBeCloseTo(640 / 360);
    delete (mockStore.timeline as { artboards?: object }).artboards;
  });

  it('counts the transitions between the slides, and hands them to the export', async () => {
    // Intro 1 s, then half a second's fade into Outro's 2 s
    (mockStore.timeline as { artboards?: object }).artboards = {
      intro: { duration: 30, transition: { type: 'push', duration: 2 } },
      outro: { duration: 60, transition: { type: 'fade', duration: 0.5 } },
    };
    baseRender(
      <SceneGraphProvider>
        <SlidesSeeder />
        <ExportDialogHost />
      </SceneGraphProvider>
    );
    act(() => showExportDialog('mp4'));
    expect(screen.getByTestId('export-slides-scope')).toHaveTextContent('(3.5 s in all)');
    expect(screen.getByTestId('export-mp4-timing')).toHaveTextContent('105 frames · 3.5 s');
    // At 60 fps: the fade is 30 frames of it
    fireEvent.change(screen.getByTestId('export-mp4-fps'), { target: { value: '60' } });
    expect(screen.getByTestId('export-mp4-timing')).toHaveTextContent('210 frames · 3.5 s');

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportMp4).toHaveBeenCalledOnce());
    const { slides } = vi.mocked(exportMp4).mock.calls[0]![1] as {
      slides: Array<{ transition: unknown }>;
    };
    // None into the first slide: nothing comes before it
    expect(slides.map((slide) => slide.transition)).toEqual([
      null,
      { type: 'fade', duration: 0.5 },
    ]);
    delete (mockStore.timeline as { artboards?: object }).artboards;
  });

  it('keeps a whole-page export for the formats that aren’t slides', () => {
    baseRender(
      <SceneGraphProvider>
        <SlidesSeeder />
        <ExportDialogHost />
      </SceneGraphProvider>
    );
    act(() => showExportDialog('lottie'));
    expect(screen.queryByTestId('export-slides-scope')).toBeNull();
    expect(screen.getByTestId('export-start-frame')).toBeInTheDocument();
  });

  it('frames a Lottie of the whole page to fit all its artwork, at that size', async () => {
    baseRender(
      <SceneGraphProvider>
        <SlidesSeeder />
        <ExportDialogHost />
      </SceneGraphProvider>
    );
    act(() => showExportDialog('lottie'));
    expect(screen.getByTestId('export-scene-scope')).toHaveTextContent(
      'framed to fit its whole animation'
    );
    // Both slides, from Intro's left (-320) to Outro's right (1640)
    expect(screen.getByTestId('export-width')).toHaveValue(1960);
    expect(screen.getByTestId('export-height')).toHaveValue(360);
    // A slides format starts at the first slide's size, and back again
    fireEvent.click(screen.getByTestId('export-tab-mp4'));
    expect(screen.getByTestId('export-width')).toHaveValue(640);
    fireEvent.click(screen.getByTestId('export-tab-lottie'));
    expect(screen.getByTestId('export-width')).toHaveValue(1960);

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportLottieBlob).toHaveBeenCalledOnce());
    const [nodes, , options] = vi.mocked(exportLottieBlob).mock.calls[0]!;
    expect(nodes.map((node) => [node.id, node.transform.position])).toEqual([
      ['outro', { x: 1320, y: 180 }],
      ['intro', { x: 320, y: 180 }],
    ]);
    expect(options).toMatchObject({ width: 1960, height: 360 });
  });

  it('keeps a size typed for one format when another is chosen', () => {
    baseRender(
      <SceneGraphProvider>
        <SlidesSeeder />
        <ExportDialogHost />
      </SceneGraphProvider>
    );
    act(() => showExportDialog('lottie'));
    fireEvent.change(screen.getByTestId('export-width'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('export-tab-gif'));
    expect(screen.getByTestId('export-width')).toHaveValue(500);
  });

  it('passes the chosen MP4 frame rate and speed to the exporter', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('mp4'));
    expect(screen.getByTestId('export-mp4-fps')).toHaveValue('30');
    // Video can go above the GIF limit
    expect(screen.getByRole('option', { name: '60 fps' })).toBeInTheDocument();
    expect(screen.getByTestId('export-mp4-timing')).toHaveTextContent('60 frames · 2.0 s');

    fireEvent.change(screen.getByTestId('export-mp4-fps'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('export-mp4-speed'), { target: { value: '0.5' } });
    expect(screen.getByTestId('export-mp4-timing')).toHaveTextContent('240 frames · 4.0 s');

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportMp4).toHaveBeenCalledOnce());
    expect(vi.mocked(exportMp4).mock.calls[0]![1]).toMatchObject({ fps: 60, speed: 0.5 });
  });

  describe('a video’s sound', () => {
    const voice = { id: 'voice', name: 'Voice', src: 'data:audio/wav;base64,AAAA', duration: 1 };
    const clip = { id: 'c', soundId: 'voice', start: 0, offset: 0, duration: 1, gain: 1 };
    const store = mockStore as unknown as { sounds?: unknown[]; timeline: { sounds?: unknown[] } };
    beforeEach(() => {
      store.sounds = [voice];
      store.timeline.sounds = [clip];
    });
    afterEach(() => {
      delete store.sounds;
      delete store.timeline.sounds;
    });

    it('has the sound clips the video plays', async () => {
      render(<ExportDialogHost />);
      act(() => showExportDialog('mp4'));
      expect(screen.getByTestId('export-mp4-sound')).toBeChecked();
      expect(screen.getByText('With its sound clip')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await waitFor(() => expect(exportMp4).toHaveBeenCalledOnce());
      expect(vi.mocked(exportMp4).mock.calls[0]![1]).toMatchObject({
        sounds: [voice],
        decodeSound: expect.any(Function),
      });
    });

    it('is left out with Sound turned off', async () => {
      render(<ExportDialogHost />);
      act(() => showExportDialog('webm'));
      fireEvent.click(screen.getByTestId('export-webm-sound'));
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await waitFor(() => expect(exportWebm).toHaveBeenCalledOnce());
      expect(vi.mocked(exportWebm).mock.calls[0]![1]).not.toHaveProperty('sounds');
    });
  });

  describe('video layers', () => {
    const clip = { id: 'clip', name: 'Clip', strip: { rate: 4, height: 90, frames: [] } };
    const store = mockStore as unknown as { videos?: unknown[] };
    let canvases: Array<{ mockRestore: () => void }> = [];
    beforeEach(() => {
      store.videos = [clip];
      videoFrames.made = [];
      videoFrames.log = [];
      videoFrames.disposed = 0;
      videoFrames.problems = [];
      frameRenderer.renderFrame.mockImplementation(() => {
        videoFrames.log.push('render');
        return document.createElement('canvas');
      });
      // Canvases that draw and give PNGs (jsdom's do neither)
      canvases = [
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
          drawImage: () => {},
        } as never),
        vi
          .spyOn(HTMLCanvasElement.prototype, 'toBlob')
          .mockImplementation((done) => done(new Blob(['png'], { type: 'image/png' }))),
      ];
    });
    afterEach(() => {
      delete store.videos;
      frameRenderer.renderFrame.mockImplementation(() => document.createElement('canvas'));
      for (const spy of canvases) spy.mockRestore();
    });

    it('are drawn from the document’s video files in GIF, MP4 and WebM', async () => {
      render(<ExportDialogHost />);
      for (const [tab, exporter] of [
        ['gif', exportGif],
        ['mp4', exportMp4],
        ['webm', exportWebm],
      ] as const) {
        act(() => showExportDialog(tab));
        fireEvent.click(screen.getByTestId('export-dialog-export'));
        await waitFor(() => expect(exporter).toHaveBeenCalledOnce());
        expect(vi.mocked(exporter).mock.calls[0]![1]).toMatchObject({
          videos: [clip],
          videoFile: expect.any(Function),
        });
        await waitFor(() => expect(screen.queryByTestId('export-dialog')).toBeNull());
      }
    });

    it('show each frame’s pictures in a PNG sequence, decoded before it’s drawn', async () => {
      render(<ExportDialogHost />);
      act(() => showExportDialog('png-sequence'));
      fireEvent.change(screen.getByTestId('export-end-frame'), { target: { value: '1' } });
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await waitFor(() => expect(downloadBlob).toHaveBeenCalled());

      expect(videoFrames.log).toEqual(['prepare 0', 'render', 'prepare 1', 'render']);
      expect(videoFrames.made[0]).toMatchObject({
        size: { multiplier: 1 },
        sources: { videos: [clip], videoFile: expect.any(Function) },
      });
      expect(videoFrames.made[0]!.shots).toHaveLength(2);
      expect(videoFrames.disposed).toBe(1);
    });

    it('says after a video export which videos couldn’t be decoded, and stays open to say so', async () => {
      vi.mocked(exportMp4).mockImplementationOnce(async (_ctx, options) => {
        options.onVideoProblems?.(['Beach at dusk']);
        return new Blob(['mp4'], { type: 'video/mp4' });
      });
      render(<ExportDialogHost />);
      act(() => showExportDialog('mp4'));
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await waitFor(() => expect(downloadBlob).toHaveBeenCalled());

      expect(await screen.findByTestId('export-video-problems')).toHaveTextContent(
        'Exported. Couldn’t decode “Beach at dusk”; its preview stills were used.'
      );
      expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('export-dialog-cancel')).toHaveTextContent('Close');
    });

    it('names each video a PNG sequence couldn’t decode', async () => {
      videoFrames.problems = ['Clip', 'Smoke'];
      render(<ExportDialogHost />);
      act(() => showExportDialog('png-sequence'));
      fireEvent.change(screen.getByTestId('export-end-frame'), { target: { value: '1' } });
      fireEvent.click(screen.getByTestId('export-dialog-export'));

      expect(await screen.findByTestId('export-video-problems')).toHaveTextContent(
        'Exported. Couldn’t decode “Clip” and “Smoke”; their preview stills were used.'
      );
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'png-sequence.zip');
    });

    it('says nothing of the videos, and closes, when they all decoded', async () => {
      render(<ExportDialogHost />);
      act(() => showExportDialog('sprite-sheet'));
      fireEvent.change(screen.getByTestId('export-end-frame'), { target: { value: '1' } });
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await waitFor(() => expect(screen.queryByTestId('export-dialog')).toBeNull());
    });

    it('starts the next export without the last one’s notice', async () => {
      videoFrames.problems = ['Clip'];
      render(<ExportDialogHost />);
      act(() => showExportDialog('sprite-sheet'));
      fireEvent.change(screen.getByTestId('export-end-frame'), { target: { value: '1' } });
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await screen.findByTestId('export-video-problems');

      videoFrames.problems = [];
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await waitFor(() => expect(screen.queryByTestId('export-dialog')).toBeNull());
    });

    it('show each frame’s pictures in a sprite sheet, decoded before it’s drawn', async () => {
      render(<ExportDialogHost />);
      act(() => showExportDialog('sprite-sheet'));
      fireEvent.change(screen.getByTestId('export-end-frame'), { target: { value: '1' } });
      fireEvent.click(screen.getByTestId('export-dialog-export'));
      await waitFor(() => expect(videoFrames.disposed).toBe(1));

      expect(videoFrames.log).toEqual(['prepare 0', 'render', 'prepare 1', 'render']);
      expect(videoFrames.made[0]!.shots).toEqual([
        expect.objectContaining({ frame: 0 }),
        expect.objectContaining({ frame: 1 }),
      ]);
    });
  });

  it('offers no Sound option when nothing in the video has sound', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('mp4'));
    expect(screen.queryByTestId('export-mp4-sound')).toBeNull();
  });

  it('shows an MP4 capability error returned by the encoder', async () => {
    vi.mocked(exportMp4).mockRejectedValueOnce(
      new Error('This browser or device does not support H.264 MP4 encoding.')
    );
    render(<ExportDialogHost />);
    act(() => showExportDialog('mp4'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    expect(await screen.findByTestId('export-error')).toHaveTextContent(
      /does not support H\.264 MP4 encoding/
    );
  });

  it('exports WebM with the chosen timing and transparency', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('webm'));
    expect(screen.getByText(/WebM uses VP9/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('export-webm-transparent'));
    fireEvent.change(screen.getByTestId('export-webm-speed'), { target: { value: '2' } });
    expect(screen.getByTestId('export-webm-timing')).toHaveTextContent('30 frames · 1.0 s');

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportWebm).toHaveBeenCalledOnce());
    expect(vi.mocked(exportWebm).mock.calls[0]![1]).toMatchObject({
      transparent: true,
      speed: 2,
      fps: 30,
    });
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'animation.webm')
    );
  });

  it('releases the frame renderer when its images fail to load', async () => {
    frameRenderer.preloadTextures.mockRejectedValueOnce(new Error('image failed'));
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));

    expect(await screen.findByTestId('export-error')).toHaveTextContent('image failed');
    // Its WebGL context goes back to the browser rather than waiting for garbage collection
    expect(frameRenderer.dispose).toHaveBeenCalledOnce();
  });

  it('exports a still of the current frame as SVG', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('svg'));
    // One frame, no size or range: vectors at the artwork's own size
    expect(screen.getByTestId('export-svg-frame')).toHaveValue(12);
    expect(screen.queryByTestId('export-width')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-start-frame')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('export-svg-frame'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportSvgFrame).toHaveBeenCalledOnce());
    expect(vi.mocked(exportSvgFrame).mock.calls[0]![3]).toMatchObject({ frame: 20 });
    expect(vi.mocked(exportSvgFrame).mock.calls[0]![2]).toMatchObject({ frameRate: 30 });
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'frame_20.svg');
  });

  it('exports the slides as a PDF: a page a slide, each at its own timeline’s last frame', async () => {
    // Intro runs 1 s (its own timeline), Outro the page's 2 s
    (mockStore.timeline as { artboards?: object }).artboards = { intro: { duration: 30 } };
    baseRender(
      <SceneGraphProvider>
        <SlidesSeeder />
        <ExportDialogHost />
      </SceneGraphProvider>
    );
    act(() => showExportDialog('pdf'));
    expect(screen.getByTestId('export-pdf-slides-scope')).toHaveTextContent(
      '2 pages, a slide each'
    );
    expect(screen.getByTestId('export-pdf-note')).toHaveTextContent('Vector pages');
    // Each page its artboard's own size, at its last frame: no size, no range
    expect(screen.queryByTestId('export-width')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-start-frame')).not.toBeInTheDocument();
    expect(screen.queryByTestId('export-scene-scope')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportPdf).toHaveBeenCalledOnce());
    const [pages, options] = vi.mocked(exportPdf).mock.calls[0]!;
    expect(pages.map((page) => [page.rootIds, page.frame, page.viewport.width])).toEqual([
      [['intro'], 29, 640],
      [['outro'], 59, 1280],
    ]);
    // Each page plays its own artboard's timeline
    expect(pages[0]!.timeline.duration).toBe(30);
    expect(options).toMatchObject({ title: 'Deck' });
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'slides.pdf'));
    delete (mockStore.timeline as { artboards?: object }).artboards;
  });

  it('exports a page’s only artboard as a one-page PDF', async () => {
    render(
      <>
        <ArtboardSeeder />
        <ExportDialogHost />
      </>
    );
    act(() => showExportDialog('pdf'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportPdf).toHaveBeenCalledOnce());
    const [pages] = vi.mocked(exportPdf).mock.calls[0]!;
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ rootIds: ['artboard-1'], frame: 59 });
    expect(pages[0]!.viewport).toMatchObject({ width: 640, height: 360 });
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'frame_59.pdf')
    );
  });

  it('warns that a video shows as a still in Lottie, SVG and PDF, and not in the formats that play it', () => {
    render(
      <>
        <VideoSeeder />
        <ExportDialogHost />
      </>
    );
    act(() => showExportDialog('lottie'));
    expect(screen.getByTestId('export-video-stills')).toHaveTextContent(
      '1 video layer will show as a still picture: Lottie doesn’t play video. MP4, WebM and GIF play it.'
    );
    fireEvent.click(screen.getByTestId('export-tab-svg'));
    expect(screen.getByTestId('export-video-stills')).toHaveTextContent('SVG doesn’t play video');
    fireEvent.click(screen.getByTestId('export-tab-pdf'));
    expect(screen.getByTestId('export-video-stills')).toHaveTextContent('PDF doesn’t play video');
    for (const tab of ['mp4', 'webm', 'gif', 'png-sequence']) {
      fireEvent.click(screen.getByTestId(`export-tab-${tab}`));
      expect(screen.queryByTestId('export-video-stills')).not.toBeInTheDocument();
    }
  });

  it('gives no video warning with no video layers', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('pdf'));
    expect(screen.queryByTestId('export-video-stills')).not.toBeInTheDocument();
  });

  it('has a PDF’s video layers shown as stills of the videos’ files', async () => {
    render(
      <>
        <VideoSeeder />
        <ExportDialogHost />
      </>
    );
    act(() => showExportDialog('pdf'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportPdf).toHaveBeenCalledOnce());
    const [, options] = vi.mocked(exportPdf).mock.calls[0]!;
    expect(options?.videoStills).toBe(loadVideoStills);
  });

  it('rejects an SVG frame outside the timeline', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('svg'));
    fireEvent.change(screen.getByTestId('export-svg-frame'), { target: { value: '99' } });
    fireEvent.click(screen.getByTestId('export-dialog-export'));
    expect(await screen.findByTestId('export-error')).toHaveTextContent(
      'Choose a frame between 0 and 59.'
    );
    expect(exportSvgFrame).not.toHaveBeenCalled();
  });

  it('shows unsupported warnings on Lottie tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('lottie'));
    expect(screen.getByText(/unsupported node/i)).toBeInTheDocument();
    expect(screen.getByText(/text/)).toBeInTheDocument();
    expect(analyzeLottieExport).toHaveBeenCalledWith([], expect.any(Function));
  });

  it('says on the Lottie tab which effects and blend modes the export leaves out', () => {
    vi.mocked(analyzeLottieExport).mockReturnValue({
      supportedCount: 3,
      unsupportedCount: 0,
      unsupportedTypes: [],
      animatedTrackCount: 0,
      unbentImageCount: 0,
      effectNodeCount: 2,
      droppedEffects: ['layer-blur', 'drop-shadow'],
      blendModeNodeCount: 1,
    });
    render(<ExportDialogHost />);
    act(() => showExportDialog('lottie'));
    expect(screen.getByTestId('lottie-dropped-effects')).toHaveTextContent(
      '2 layers will export without blurs and drop shadows: Lottie doesn’t get effects.'
    );
    expect(screen.getByTestId('lottie-dropped-blend-modes')).toHaveTextContent(
      '1 layer in a blend mode will export as normal.'
    );
  });

  it('closes on Cancel button click', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('export-dialog-cancel'));
    // Wait for exit animation
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
  });

  it('closes on X button click', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));

    fireEvent.click(screen.getByTestId('export-dialog-close'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
  });

  it('cancels the export when closed from the X while exporting', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    vi.mocked(exportGif).mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        })
    );
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByTestId('export-dialog-close'));
    // The exporter is told to stop
    expect(vi.mocked(exportGif).mock.calls[0]![3]?.()).toBe(true);
    await act(async () => {
      finish(new Blob(['gif'], { type: 'image/gif' }));
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
    // Nothing downloads after the dialog is gone
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('closes on Escape without anything in it focused (F157)', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));

    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
  });

  it('Escape while exporting stops the export and keeps the dialog open (F157)', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    vi.mocked(exportGif).mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        })
    );
    render(<ExportDialogHost />);
    act(() => showExportDialog('gif'));
    fireEvent.click(screen.getByTestId('export-dialog-export'));
    await waitFor(() => expect(exportGif).toHaveBeenCalledOnce());

    fireEvent.keyDown(document, { key: 'Escape' });
    // The exporter is told to stop
    expect(vi.mocked(exportGif).mock.calls[0]![3]?.()).toBe(true);
    await act(async () => {
      finish(new Blob(['gif'], { type: 'image/gif' }));
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));

    fireEvent.mouseDown(screen.getByTestId('export-dialog-backdrop'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
  });

  it('has Export button', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    expect(screen.getByTestId('export-dialog-export')).toBeInTheDocument();
    expect(screen.getByTestId('export-dialog-export')).toHaveTextContent('Export');
  });

  it('updates width input', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    const widthInput = screen.getByTestId('export-width') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '1920' } });
    expect(widthInput.value).toBe('1920');
  });

  it('grid layout shows columns input', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('sprite-sheet'));
    // Grid is the default layout
    expect(screen.getByTestId('export-sprite-columns')).toBeInTheDocument();
  });
});
