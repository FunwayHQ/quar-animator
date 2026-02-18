import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock the SceneGraph context
const mockGetRootNodes = vi.fn().mockReturnValue([]);
vi.mock('../../contexts/SceneGraphContext', () => ({
  useSceneGraph: () => ({
    getRootNodes: mockGetRootNodes,
    getNode: vi.fn(),
    updateNode: vi.fn(),
  }),
}));

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
};

vi.mock('../../stores/editorStore', () => ({
  useEditorStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}));

// Mock export functions
vi.mock('@quar/export', () => ({
  exportLottieBlob: vi.fn().mockReturnValue(new Blob(['{}'], { type: 'application/json' })),
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

describe('ExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('shows three format tabs', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('png-sequence'));
    expect(screen.getByTestId('export-tab-png-sequence')).toBeInTheDocument();
    expect(screen.getByTestId('export-tab-sprite-sheet')).toBeInTheDocument();
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

  it('shows unsupported warnings on Lottie tab', () => {
    render(<ExportDialogHost />);
    act(() => showExportDialog('lottie'));
    expect(screen.getByText(/unsupported node/i)).toBeInTheDocument();
    expect(screen.getByText(/text/)).toBeInTheDocument();
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
