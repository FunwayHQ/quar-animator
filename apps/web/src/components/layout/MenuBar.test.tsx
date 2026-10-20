/**
 * Tests for MenuBar Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as baseRender, screen, fireEvent, act } from '../../test/utils';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import { SceneGraphProvider } from '../../contexts/SceneGraphContext';
import { MenuBar } from './MenuBar';
import { ExportDialogHost } from '../common/ExportDialog';
import { setUiTheme } from '../../hooks/useUiTheme';
import type { ProjectActions } from '../../hooks/useProjectActions';
import type { ReactElement } from 'react';

const restoreMocks = vi.hoisted(() => ({
  restoreTutorials: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../tutorials/seedTutorials', () => ({
  restoreTutorials: restoreMocks.restoreTutorials,
}));

vi.mock('../common/Toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../common/Toast')>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: restoreMocks.success,
      info: restoreMocks.info,
      error: restoreMocks.error,
    },
  };
});

function render(ui: ReactElement) {
  return baseRender(<SceneGraphProvider>{ui}</SceneGraphProvider>);
}

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
    importImage: vi.fn(),
  };
}

describe('MenuBar', () => {
  beforeEach(() => {
    setUiTheme('dark');
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
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
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

  it('renders the toolbar inline between the menus and the project name', () => {
    render(<MenuBar toolbar={<div data-testid="tools">Tools</div>} />);

    const slot = screen.getByTestId('menubar-toolbar');
    expect(slot).toContainElement(screen.getByTestId('tools'));
    expect(slot.closest('header')).not.toBeNull();
    const menus = screen.getByRole('button', { name: 'File' }).closest('nav')!;
    const projectName = screen.getByTestId('project-name');
    expect(menus.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      slot.compareDocumentPosition(projectName) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('flanks the toolbar with one group per side so it can center in the window', () => {
    render(<MenuBar toolbar={<div>Tools</div>} />);

    // Exactly three header columns: [logo + menus] [toolbar] [project name].
    // Equal flexible side columns are what keep the toolbar at the true center.
    const slot = screen.getByTestId('menubar-toolbar');
    const header = slot.closest('header')!;
    expect(header.children).toHaveLength(3);
    const [leading, center, trailing] = Array.from(header.children);
    expect(center).toBe(slot);
    expect(leading).toContainElement(screen.getByAltText('Quar Animator'));
    expect(leading).toContainElement(screen.getByRole('button', { name: 'File' }));
    expect(trailing).toContainElement(screen.getByTestId('project-name'));
  });

  it('omits the toolbar slot when no toolbar is given', () => {
    render(<MenuBar />);
    expect(screen.queryByTestId('menubar-toolbar')).not.toBeInTheDocument();
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

  it('opens GIF and MP4 export dialogs from enabled menu items', async () => {
    render(
      <>
        <MenuBar />
        <ExportDialogHost />
      </>
    );

    fireEvent.click(screen.getByTestId('menu-export'));
    expect(screen.getByText('Export as GIF...')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Export as GIF...'));
    expect(screen.getByTestId('export-tab-gif').className).toContain('active');
    fireEvent.click(screen.getByTestId('export-dialog-close'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    fireEvent.click(screen.getByTestId('menu-export'));
    expect(screen.getByText('Export as MP4...')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Export as MP4...'));
    expect(screen.getByTestId('export-tab-mp4').className).toContain('active');
  });

  it('toggles the Animation Sequence window from the View menu', () => {
    useEditorStore.setState({ sequenceWindowOpen: false });
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-view'));
    const item = screen.getByRole('menuitemcheckbox', { name: /^Animation Sequence/ });
    expect(item).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(item);
    expect(useEditorStore.getState().sequenceWindowOpen).toBe(true);
    useEditorStore.setState({ sequenceWindowOpen: false });
  });

  it('toggles light appearance from the View menu and persists the choice', () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByTestId('menu-view'));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Light Appearance' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('quar-animator-ui-theme')).toBe('light');
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

  it('confirms before New Project when there are unsaved changes (F013)', () => {
    const actions = createMockProjectActions();
    useEditorStore.setState({ isDirty: true });
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('New Project'));

    // Not created yet — a confirm dialog is shown instead.
    expect(actions.newProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-confirm-dialog')).toBeInTheDocument();

    // Discard confirms the destructive action.
    fireEvent.click(screen.getByTestId('new-confirm-discard'));
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

  describe('Rigging menu IK items', () => {
    it('shows Create IK Chain and Remove IK Chain in Rigging menu', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-rigging'));

      expect(screen.getByText('Create IK Chain')).toBeInTheDocument();
      expect(screen.getByText('Remove IK Chain')).toBeInTheDocument();
    });

    it('Create IK Chain is disabled when no bone is selected', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-rigging'));

      const createButton = screen.getByText('Create IK Chain').closest('button');
      expect(createButton).toBeDisabled();
    });

    it('Remove IK Chain is disabled when no bone is selected', () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-rigging'));

      const removeButton = screen.getByText('Remove IK Chain').closest('button');
      expect(removeButton).toBeDisabled();
    });
  });

  describe('Help > Restore Tutorials', () => {
    /** Open Help, then pick Restore Tutorials and let the restore finish. */
    const restore = async () => {
      fireEvent.click(screen.getByTestId('menu-help'));
      const item = screen.getByRole('menuitem', { name: 'Restore Tutorials' });
      await act(async () => {
        fireEvent.click(item);
      });
    };

    beforeEach(() => {
      restoreMocks.restoreTutorials.mockReset();
      restoreMocks.success.mockReset();
      restoreMocks.info.mockReset();
      restoreMocks.error.mockReset();
    });

    it('brings back the deleted tutorials and says where to find them', async () => {
      restoreMocks.restoreTutorials.mockResolvedValue([
        { id: 'tutorial-presets-and-sequences', name: 'Tutorial 2 · Motion presets & sequences' },
      ]);
      render(<MenuBar />);

      await restore();

      expect(restoreMocks.restoreTutorials).toHaveBeenCalledOnce();
      expect(restoreMocks.success).toHaveBeenCalledWith(
        'Restored “Tutorial 2 · Motion presets & sequences”. Open it from File > Open Project...'
      );
      expect(screen.queryByTestId('help-menu-dropdown')).toBeNull();
    });

    it('says so when every tutorial is still there', async () => {
      restoreMocks.restoreTutorials.mockResolvedValue([]);
      render(<MenuBar />);

      await restore();

      expect(restoreMocks.info).toHaveBeenCalledWith(
        'All the tutorials are already in your projects'
      );
    });

    it('reports a failure', async () => {
      restoreMocks.restoreTutorials.mockRejectedValue(new Error('quota'));
      render(<MenuBar />);

      await restore();

      expect(restoreMocks.error).toHaveBeenCalledWith('Could not restore the tutorials');
    });
  });
});
