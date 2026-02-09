/**
 * Tests for MenuBar Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import { MenuBar } from './MenuBar';
import type { ProjectActions } from '../../hooks/useProjectActions';

function createMockProjectActions(): ProjectActions {
  return {
    newProject: vi.fn(),
    saveProject: vi.fn().mockResolvedValue(undefined),
    saveProjectAs: vi.fn().mockResolvedValue(undefined),
    openProject: vi.fn().mockResolvedValue(undefined),
    downloadProject: vi.fn(),
    importProject: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockResolvedValue([]),
    importSvg: vi.fn(),
  };
}

describe('MenuBar', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      isDrawing: false,
      brushSize: 5,
      brushSmoothing: 50,
      eraserSize: 10,
      eraserMode: 'stroke',
      aspectRatioLocked: false,
      clipboard: null,
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
      autoKeyframe: false,
      selectedKeyframeIds: new Set<string>(),
      keyframeClipboard: null,
      onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      projectId: null,
      projectName: 'Untitled Project',
      isDirty: false,
      projectCreatedAt: null,
    });
  });

  it('renders the logo', () => {
    render(<MenuBar />);
    const logo = screen.getByAltText('Quar Animator');
    expect(logo).toBeInTheDocument();
  });

  it('renders all menu items', () => {
    render(<MenuBar />);
    const menuItems = ['File', 'Edit', 'View', 'Animation', 'Rigging', 'Export', 'Help'];
    menuItems.forEach((item) => {
      expect(screen.getByRole('button', { name: item })).toBeInTheDocument();
    });
  });

  it('renders project name from store', () => {
    render(<MenuBar />);
    expect(screen.getByTestId('project-name')).toHaveTextContent('Untitled Project');
  });

  it('displays custom project name', () => {
    useEditorStore.setState({ projectName: 'My Animation' });
    render(<MenuBar />);
    expect(screen.getByTestId('project-name')).toHaveTextContent('My Animation');
  });

  it('shows dirty indicator when project has unsaved changes', () => {
    useEditorStore.setState({ isDirty: true });
    render(<MenuBar />);
    expect(screen.getByTestId('dirty-indicator')).toBeInTheDocument();
  });

  it('hides dirty indicator when project is saved', () => {
    useEditorStore.setState({ isDirty: false });
    render(<MenuBar />);
    expect(screen.queryByTestId('dirty-indicator')).not.toBeInTheDocument();
  });

  it('opens file menu dropdown on click', () => {
    render(<MenuBar projectActions={createMockProjectActions()} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    expect(screen.getByTestId('file-menu-dropdown')).toBeInTheDocument();
  });

  it('shows all file menu items', () => {
    render(<MenuBar projectActions={createMockProjectActions()} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Open Project...')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Save As...')).toBeInTheDocument();
    expect(screen.getByText('Download as .quar')).toBeInTheDocument();
    expect(screen.getByText('Import .quar...')).toBeInTheDocument();
  });

  it('calls newProject when New Project clicked', () => {
    const actions = createMockProjectActions();
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('New Project'));
    expect(actions.newProject).toHaveBeenCalledOnce();
  });

  it('calls saveProject when Save clicked', () => {
    const actions = createMockProjectActions();
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('Save'));
    expect(actions.saveProject).toHaveBeenCalledOnce();
  });

  it('calls downloadProject when Download clicked', () => {
    const actions = createMockProjectActions();
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('Download as .quar'));
    expect(actions.downloadProject).toHaveBeenCalledOnce();
  });

  it('calls importProject when Import clicked', () => {
    const actions = createMockProjectActions();
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('Import .quar...'));
    expect(actions.importProject).toHaveBeenCalledOnce();
  });

  it('closes dropdown after clicking a menu item', () => {
    render(<MenuBar projectActions={createMockProjectActions()} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    expect(screen.getByTestId('file-menu-dropdown')).toBeInTheDocument();
    fireEvent.click(screen.getByText('New Project'));
    expect(screen.queryByTestId('file-menu-dropdown')).not.toBeInTheDocument();
  });

  it('toggles dropdown on repeated File clicks', () => {
    render(<MenuBar projectActions={createMockProjectActions()} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    expect(screen.getByTestId('file-menu-dropdown')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('menu-file'));
    expect(screen.queryByTestId('file-menu-dropdown')).not.toBeInTheDocument();
  });

  it('shows Save As dialog when Save As clicked', () => {
    render(<MenuBar projectActions={createMockProjectActions()} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('Save As...'));
    expect(screen.getByTestId('save-as-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('save-as-input')).toBeInTheDocument();
  });

  it('has correct structure with header and nav', () => {
    render(<MenuBar />);
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });
});
