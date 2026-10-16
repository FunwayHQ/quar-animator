import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as baseRender, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { createDefaultTransform } from '@quar/core';
import type { ArtboardNode, Node } from '@quar/types';
import { analyzeLottieExport, exportGif, exportLottieBlob, exportMp4 } from '@quar/export';
import { downloadBlob } from '../../services/exportService';
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
  selectedNodeIds: new Set<string>(),
};

vi.mock('../../stores/editorStore', () => ({
  useEditorStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}));

// Mock export functions
vi.mock('@quar/export', () => ({
  exportLottieBlob: vi.fn().mockReturnValue(new Blob(['{}'], { type: 'application/json' })),
  exportGif: vi.fn().mockResolvedValue(new Blob(['gif'], { type: 'image/gif' })),
  exportMp4: vi.fn().mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' })),
  analyzeLottieExport: vi.fn().mockReturnValue({
    supportedCount: 2,
    unsupportedCount: 1,
    unsupportedTypes: ['text'],
    animatedTrackCount: 0,
  }),
}));

// Mock download
vi.mock('../../services/exportService', () => ({
  downloadBlob: vi.fn(),
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

function ArtboardSeeder() {
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
      fills: [],
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
  }, [sceneGraph]);
  return null;
}

function renderWithArtboard(ui: ReactElement) {
  return baseRender(
    <SceneGraphProvider>
      <ArtboardSeeder />
      {ui}
    </SceneGraphProvider>
  );
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
      expect.objectContaining({ sceneGraph: expect.any(Object), timeline: mockStore.timeline }),
      expect.objectContaining({ startFrame: 0, endFrame: 59, transparent: false }),
      expect.any(Function),
      expect.any(Function)
    );
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'animation.gif');
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

  it('shows unsupported warnings on Lottie tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('lottie'));
    expect(screen.getByText(/unsupported node/i)).toBeInTheDocument();
    expect(screen.getByText(/text/)).toBeInTheDocument();
    expect(analyzeLottieExport).toHaveBeenCalledWith([], expect.any(Function));
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
