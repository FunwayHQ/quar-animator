/**
 * Tests for MenuBar Component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as baseRender, screen, fireEvent, act, within, waitFor } from '../../test/utils';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { MenuBar } from './MenuBar';
import { ExportDialogHost } from '../common/ExportDialog';
import { PromptDialogHost } from '../common/PromptDialog';
import { setUiTheme } from '../../hooks/useUiTheme';
import type { ProjectActions } from '../../hooks/useProjectActions';
import { Profiler } from 'react';
import type { ReactElement } from 'react';
import { createDefaultTransform, type SceneGraph } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import type { Node } from '@quar/types';

const restoreMocks = vi.hoisted(() => ({
  restoreTutorials: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

const videoMocks = vi.hoisted(() => ({
  chosen: [] as File[],
  importVideoFiles: vi.fn(async () => {}),
}));

vi.mock('../../services/videoImport', () => ({
  chooseVideoFiles: (onChosen: (files: File[]) => void) => onChosen(videoMocks.chosen),
  importVideoFiles: videoMocks.importVideoFiles,
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
  // The host shows the questions the menu asks (unsaved changes)
  return baseRender(
    <SceneGraphProvider>
      {ui}
      <PromptDialogHost />
    </SceneGraphProvider>
  );
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
    importSound: vi.fn(),
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
    // Drawn inline: no file a browser could keep for days
    expect(screen.getByRole('img', { name: 'Quar Animator' }).tagName).toBe('svg');
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
    expect(leading).toContainElement(screen.getByRole('img', { name: 'Quar Animator' }));
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

  it('calls newProject when New Project clicked', async () => {
    const actions = createMockProjectActions();
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('New Project'));
    await waitFor(() => expect(actions.newProject).toHaveBeenCalledOnce());
  });

  it('confirms before New Project when there are unsaved changes (F013)', async () => {
    const actions = createMockProjectActions();
    useEditorStore.setState({ isDirty: true });
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('New Project'));

    // Not created yet — a confirm dialog is shown instead.
    expect(
      await screen.findByText('Creating a new project will discard your unsaved changes.')
    ).toBeInTheDocument();
    expect(actions.newProject).not.toHaveBeenCalled();

    // Discard confirms the destructive action.
    fireEvent.click(screen.getByTestId('prompt-dialog-confirm'));
    await waitFor(() => expect(actions.newProject).toHaveBeenCalledOnce());
  });

  describe('unsaved changes', () => {
    beforeEach(() => {
      useEditorStore.setState({ isDirty: true });
    });

    it('asks before opening another project, and keeps this one on Cancel', async () => {
      const actions = createMockProjectActions();
      vi.mocked(actions.listProjects).mockResolvedValue([
        { id: 'p2', name: 'Other', updatedAt: '2026-10-29T00:00:00.000Z' },
      ]);
      render(<MenuBar projectActions={actions} />);
      fireEvent.click(screen.getByTestId('menu-file'));
      fireEvent.click(screen.getByText('Open Project...'));
      fireEvent.click(await screen.findByTestId('project-item-p2'));

      expect(
        await screen.findByText('Opening another project will discard your unsaved changes.')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('prompt-dialog-cancel'));
      await waitFor(() => expect(screen.queryByTestId('prompt-dialog')).toBeNull());
      expect(actions.openProject).not.toHaveBeenCalled();
    });

    it('opens the other project on Discard', async () => {
      const actions = createMockProjectActions();
      vi.mocked(actions.listProjects).mockResolvedValue([
        { id: 'p2', name: 'Other', updatedAt: '2026-10-29T00:00:00.000Z' },
      ]);
      render(<MenuBar projectActions={actions} />);
      fireEvent.click(screen.getByTestId('menu-file'));
      fireEvent.click(screen.getByText('Open Project...'));
      fireEvent.click(await screen.findByTestId('project-item-p2'));
      fireEvent.click(await screen.findByTestId('prompt-dialog-confirm'));
      await waitFor(() => expect(actions.openProject).toHaveBeenCalledWith('p2'));
    });

    it('asks before importing a project', async () => {
      const actions = createMockProjectActions();
      render(<MenuBar projectActions={actions} />);
      fireEvent.click(screen.getByTestId('menu-file'));
      fireEvent.click(screen.getByText('Import .quar...'));
      expect(
        await screen.findByText('Importing a project will discard your unsaved changes.')
      ).toBeInTheDocument();
      expect(actions.importProject).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('prompt-dialog-confirm'));
      await waitFor(() => expect(actions.importProject).toHaveBeenCalledOnce());
    });
  });

  describe('back to the projects', () => {
    beforeEach(() => {
      window.history.pushState({}, '', '/editor?project=p1');
    });

    it('the logo goes back to the projects', async () => {
      useEditorStore.setState({ isDirty: false });
      render(<MenuBar projectActions={createMockProjectActions()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Back to your projects' }));
      await waitFor(() => expect(window.location.pathname).toBe('/'));
    });

    it('so does File › Back to Projects', async () => {
      useEditorStore.setState({ isDirty: false });
      render(<MenuBar projectActions={createMockProjectActions()} />);
      fireEvent.click(screen.getByTestId('menu-file'));
      fireEvent.click(screen.getByText('Back to Projects'));
      await waitFor(() => expect(window.location.pathname).toBe('/'));
    });

    it('asks first when there are unsaved changes, and stays on Cancel', async () => {
      useEditorStore.setState({ isDirty: true });
      render(<MenuBar projectActions={createMockProjectActions()} />);
      fireEvent.click(screen.getByTestId('back-to-projects'));
      expect(
        await screen.findByText('Going back to your projects will discard your unsaved changes.')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('prompt-dialog-cancel'));
      await waitFor(() => expect(screen.queryByTestId('prompt-dialog')).toBeNull());
      expect(window.location.pathname).toBe('/editor');
    });
  });

  describe('the file keys', () => {
    const press = (key: string, shiftKey = false) =>
      act(() => {
        fireEvent.keyDown(window, { key, ctrlKey: true, shiftKey });
      });

    it('Ctrl+N asks before discarding unsaved changes, as the menu does', async () => {
      const actions = createMockProjectActions();
      useEditorStore.setState({ isDirty: true });
      render(<MenuBar projectActions={actions} />);
      press('n');
      fireEvent.click(await screen.findByTestId('prompt-dialog-confirm'));
      await waitFor(() => expect(actions.newProject).toHaveBeenCalledOnce());
    });

    it('Ctrl+O opens the project list', async () => {
      const actions = createMockProjectActions();
      render(<MenuBar projectActions={actions} />);
      press('o');
      expect(await screen.findByTestId('project-list-dialog')).toBeInTheDocument();
      expect(actions.listProjects).toHaveBeenCalledOnce();
    });

    it('Ctrl+Shift+S opens Save As with the project name', () => {
      const actions = createMockProjectActions();
      useEditorStore.setState({ projectName: 'Sunset' });
      render(<MenuBar projectActions={actions} />);
      press('S', true);
      expect(screen.getByTestId('save-as-input')).toHaveValue('Sunset');
    });

    it('Ctrl+S saves', () => {
      const actions = createMockProjectActions();
      render(<MenuBar projectActions={actions} />);
      press('s');
      expect(actions.saveProject).toHaveBeenCalledOnce();
    });
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

  it('calls importProject when Import clicked', async () => {
    const actions = createMockProjectActions();
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('Import .quar...'));
    await waitFor(() => expect(actions.importProject).toHaveBeenCalledOnce());
  });

  it('imports sounds from File > Import Sound', () => {
    const actions = createMockProjectActions();
    render(<MenuBar projectActions={actions} />);
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('Import Sound...'));
    expect(actions.importSound).toHaveBeenCalledOnce();
  });

  it('imports the videos chosen from File > Import Video onto the canvas', () => {
    const clip = new File(['mp4'], 'clip.mp4', { type: 'video/mp4' });
    videoMocks.chosen = [clip];
    let scene: SceneGraph | null = null;
    function Scene() {
      scene = useSceneGraph();
      return null;
    }
    render(
      <>
        <Scene />
        <MenuBar projectActions={createMockProjectActions()} />
      </>
    );
    fireEvent.click(screen.getByTestId('menu-file'));
    fireEvent.click(screen.getByText('Import Video...'));
    expect(videoMocks.importVideoFiles).toHaveBeenCalledWith(scene, [clip]);
    // The menu closes
    expect(screen.queryByText('Import Video...')).not.toBeInTheDocument();
  });

  describe('Edit > Paste', () => {
    const pasteItem = () => screen.getByRole('menuitem', { name: /^Paste/ });
    afterEach(() => Reflect.deleteProperty(navigator, 'clipboard'));

    it('can paste what another window copied, with nothing copied here', () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { readText: () => Promise.resolve('') },
        configurable: true,
      });
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-edit'));
      expect(pasteItem()).not.toBeDisabled();

      // It pastes as Ctrl+V does: the canvas takes it
      const canvasPaste = vi.fn((event: Event) => event.preventDefault());
      window.addEventListener('menubar:paste', canvasPaste);
      fireEvent.click(pasteItem());
      window.removeEventListener('menubar:paste', canvasPaste);
      expect(canvasPaste).toHaveBeenCalledOnce();
    });

    it('is greyed out only with nothing copied here and no clipboard to read', () => {
      Reflect.deleteProperty(navigator, 'clipboard');
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-edit'));
      expect(pasteItem()).toBeDisabled();
      fireEvent.click(screen.getByTestId('menu-edit'));

      act(() => useEditorStore.setState({ clipboard: [{ id: 'copied' } as unknown as Node] }));
      fireEvent.click(screen.getByTestId('menu-edit'));
      expect(pasteItem()).not.toBeDisabled();
    });
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

  describe('during playback (F162)', () => {
    it("doesn't re-render as the frame changes", () => {
      const onRender = vi.fn();
      render(
        <Profiler id="menubar" onRender={onRender}>
          <MenuBar />
        </Profiler>
      );
      const renders = onRender.mock.calls.length;

      act(() => useEditorStore.setState({ currentFrame: 1 }));
      act(() => useEditorStore.setState({ currentFrame: 2 }));
      expect(onRender).toHaveBeenCalledTimes(renders);
    });

    it('steps from the frame shown when the menu item is picked', () => {
      render(<MenuBar />);
      act(() => useEditorStore.setState({ currentFrame: 7 }));

      fireEvent.click(screen.getByTestId('menu-animation'));
      fireEvent.click(screen.getByText('Next Frame'));
      expect(useEditorStore.getState().currentFrame).toBe(8);

      fireEvent.click(screen.getByTestId('menu-animation'));
      fireEvent.click(screen.getByText('Jump Backward 10'));
      expect(useEditorStore.getState().currentFrame).toBe(0);

      fireEvent.click(screen.getByTestId('menu-animation'));
      fireEvent.click(screen.getByText('Go to End'));
      expect(useEditorStore.getState().currentFrame).toBe(299);
    });

    it('goes to the end of the animation with Go to End, where End goes', () => {
      const timeline = createTimeline({ duration: 300, frameRate: 30 });
      timeline.tracks.push({
        id: 'track-1',
        nodeId: 'loose-layer',
        property: 'opacity',
        keyframes: [
          { id: 'kf-1', time: 0, value: 0, easing: 'linear' },
          { id: 'kf-2', time: 60, value: 1, easing: 'linear' },
        ],
      });
      render(<MenuBar />);
      act(() => useEditorStore.setState({ timeline, timelineScope: null, isPlaying: true }));

      fireEvent.click(screen.getByTestId('menu-animation'));
      fireEvent.click(screen.getByText('Go to End'));
      expect(useEditorStore.getState().currentFrame).toBe(60);
      expect(useEditorStore.getState().isPlaying).toBe(false);
    });

    it('goes to the start of the work area with Go to Start while it is on, where Home goes', () => {
      render(<MenuBar />);
      act(() =>
        useEditorStore.setState({
          currentFrame: 90,
          workAreaEnabled: true,
          workAreaStart: 40,
          workAreaEnd: 120,
          isPlaying: true,
        })
      );

      fireEvent.click(screen.getByTestId('menu-animation'));
      fireEvent.click(screen.getByText('Go to Start'));
      expect(useEditorStore.getState().currentFrame).toBe(40);
      expect(useEditorStore.getState().isPlaying).toBe(false);

      // With the work area off, frame 0
      act(() => useEditorStore.setState({ currentFrame: 90, workAreaEnabled: false }));
      fireEvent.click(screen.getByTestId('menu-animation'));
      fireEvent.click(screen.getByText('Go to Start'));
      expect(useEditorStore.getState().currentFrame).toBe(0);
    });

    it('Bind Selection to Bones needs bones in the scene', () => {
      let sceneGraph: SceneGraph | null = null;
      function Grab() {
        sceneGraph = useSceneGraph();
        return null;
      }
      render(
        <>
          <Grab />
          <MenuBar />
        </>
      );
      const rect = {
        id: 'rect-1',
        name: 'Rectangle',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
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
      act(() => {
        sceneGraph?.addNode(rect);
        useEditorStore.setState({ selectedNodeIds: new Set(['rect-1']) });
      });
      const bindItem = () => screen.getByText('Bind Selection to Bones').closest('button');

      fireEvent.click(screen.getByTestId('menu-rigging'));
      expect(bindItem()).toBeDisabled();
      fireEvent.click(screen.getByTestId('menu-rigging'));

      act(() => {
        sceneGraph?.addNode(createBoneNode('bone-1', 'Bone', { x: 0, y: 0 }, 50));
      });
      fireEvent.click(screen.getByTestId('menu-rigging'));
      expect(bindItem()).not.toBeDisabled();
    });

    it('Bind Selection to Bones takes a group of shapes, as the canvas menu does', () => {
      let sceneGraph: SceneGraph | null = null;
      function Grab() {
        sceneGraph = useSceneGraph();
        return null;
      }
      render(
        <>
          <Grab />
          <MenuBar />
        </>
      );
      const layer = (id: string, type: string, parent: string | null) =>
        ({
          id,
          name: id,
          type,
          parent,
          children: [],
          transform: createDefaultTransform(),
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          width: 100,
          height: 50,
          cornerRadius: [0, 0, 0, 0],
          fills: [],
          strokes: [],
        }) as unknown as Node;
      act(() => {
        sceneGraph?.addNode(createBoneNode('bone-1', 'Bone', { x: 0, y: 0 }, 50));
        sceneGraph?.addNode(layer('body', 'group', null));
        sceneGraph?.addNode(layer('torso', 'rectangle', 'body'), 'body');
        sceneGraph?.addNode(layer('empty', 'group', null));
      });
      const bindItem = () => screen.getByText('Bind Selection to Bones').closest('button');
      const openRigging = (ids: string[]) => {
        act(() => useEditorStore.setState({ selectedNodeIds: new Set(ids) }));
        fireEvent.click(screen.getByTestId('menu-rigging'));
      };

      openRigging(['body']);
      expect(bindItem()).not.toBeDisabled();
      const bind = vi.fn();
      window.addEventListener('menubar:bind-to-bones', bind);
      fireEvent.click(bindItem()!);
      window.removeEventListener('menubar:bind-to-bones', bind);
      expect(bind).toHaveBeenCalledOnce();

      // Once its shapes are bound, the group unbinds from the menu too
      const unbindItem = () => screen.getByText('Unbind Mesh').closest('button');
      openRigging(['body']);
      expect(unbindItem()).toBeDisabled();
      fireEvent.click(screen.getByTestId('menu-rigging'));
      act(() => sceneGraph?.updateNode('torso', { skinData: {} } as Partial<Node>));
      openRigging(['body']);
      expect(unbindItem()).not.toBeDisabled();
      fireEvent.click(screen.getByTestId('menu-rigging'));

      // A group with nothing to bind in it has nothing to bind
      openRigging(['empty']);
      expect(bindItem()).toBeDisabled();
    });
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

  it('Help > Use Google Fonts turns them off, and on again', () => {
    localStorage.setItem('quar-google-fonts-consent', 'true');
    render(<MenuBar />);

    fireEvent.click(screen.getByTestId('menu-help'));
    const item = screen.getByRole('menuitemcheckbox', { name: /Use Google Fonts/ });
    expect(item).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(item);
    expect(localStorage.getItem('quar-google-fonts-consent')).not.toBe('true');

    fireEvent.click(screen.getByTestId('menu-help'));
    const off = screen.getByRole('menuitemcheckbox', { name: /Use Google Fonts/ });
    expect(off).toHaveAttribute('aria-checked', 'false');
    restoreMocks.info.mockReset();
    fireEvent.click(off);
    expect(localStorage.getItem('quar-google-fonts-consent')).toBe('true');
    // The open project's fonts load at once, not only those picked later
    expect(restoreMocks.info).toHaveBeenCalledWith(
      'Google Fonts are on: this project’s fonts load from Google now, and others when you pick them.'
    );
  });

  it('Help opens the privacy policy and the terms in new tabs', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<MenuBar />);

    fireEvent.click(screen.getByTestId('menu-help'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Privacy Policy' }));
    fireEvent.click(screen.getByTestId('menu-help'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Terms of Service' }));

    expect(open.mock.calls).toEqual([
      ['https://free.quar.pro/privacy/', '_blank', 'noopener'],
      ['https://free.quar.pro/terms/', '_blank', 'noopener'],
    ]);
    open.mockRestore();
  });

  it('Help > User Guide opens the guide beside the canvas, and F1 does too', () => {
    render(<MenuBar />);
    expect(screen.queryByRole('dialog', { name: 'User Guide' })).toBeNull();

    fireEvent.click(screen.getByTestId('menu-help'));
    const item = screen.getByRole('menuitem', { name: /User Guide/ });
    expect(item).toHaveTextContent('F1');
    fireEvent.click(item);
    expect(screen.queryByTestId('help-menu-dropdown')).toBeNull();
    const guide = screen.getByRole('dialog', { name: 'User Guide' });
    expect(within(guide).getByTitle('User Guide')).toHaveAttribute(
      'src',
      new URL('help/', document.baseURI).href
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close the User Guide' }));
    expect(screen.queryByRole('dialog', { name: 'User Guide' })).toBeNull();
    fireEvent.keyDown(window, { key: 'F1' });
    expect(screen.getByRole('dialog', { name: 'User Guide' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close the User Guide' }));
  });

  describe('Help > Keyboard Shortcuts', () => {
    const openShortcuts = () => {
      render(<MenuBar />);
      fireEvent.click(screen.getByTestId('menu-help'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Keyboard Shortcuts' }));
      return screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    };
    /** The keys on the dialog's first line saying `label`. */
    const keysFor = (dialog: HTMLElement, label: string) => {
      const row = within(dialog)
        .getAllByTestId('shortcut-row')
        .find((r) => within(r).getByTestId('shortcut-label').textContent === label);
      return row ? within(row).getByTestId('shortcut-keys').textContent : undefined;
    };

    it('lists the keys it used to leave out', () => {
      const dialog = openShortcuts();
      const expected: Array<[string, string]> = [
        ['Artboard', 'F'],
        ['Show Guides', 'Shift+G'],
        ['Flip Horizontal', 'Shift+H'],
        ['Flip Vertical', 'Shift+V'],
        ['Graph editor, and back', 'G'],
        ['Work area: start / end it here', 'I / Shift+I'],
        ['Work area on or off', 'Alt+W'],
        ['10 frames back / on', 'Shift+, / Shift+.'],
        ['Save', 'Ctrl+S'],
        ['Save As…', 'Ctrl+Shift+S'],
        ['Open Project…', 'Ctrl+O'],
        ['New Project', 'Ctrl+N'],
        ['Import SVG…', 'Ctrl+I'],
        ['Select All', 'Ctrl+A'],
        ['Delete', 'Delete or Backspace'],
        ['Redo', 'Ctrl+Shift+Z or Ctrl+Y'],
        ['Join', 'Ctrl+J'],
        ['Union', 'Ctrl+Shift+U'],
        ['Subtract', 'Ctrl+Shift+D'],
        ['Intersect', 'Ctrl+Shift+I'],
        ['Exclude', 'Ctrl+Shift+X'],
        ['Convert to Path', 'Ctrl+Shift+P'],
        ['Outline Stroke', 'Ctrl+Shift+O'],
        ['Create Symbol', 'Ctrl+Shift+K'],
        ['Select nothing; in a group, come out of it', 'Esc'],
        ['Nudge by 1 (with Shift: 10)', '↑ ↓ ← →'],
        ['Next slide (in a transition: skip it)', '↓ or Page Down'],
      ];
      for (const [label, keys] of expected)
        expect([label, keysFor(dialog, label)]).toEqual([label, keys]);
    });

    it('groups them as the user guide does', () => {
      const dialog = openShortcuts();
      const titles = within(dialog)
        .getAllByRole('heading', { level: 4 })
        .map((heading) => heading.textContent);
      expect(titles).toEqual([
        'Tools',
        'While you draw',
        'Files',
        'Edit',
        'Arrange',
        'Shapes and paths',
        'Editing points (Direct Selection)',
        'Editing text',
        'View',
        'Timeline and playback',
        'Timeline rows',
        'Graph editor',
        'Sound lane',
        'Rigging',
        'Number fields',
        'Presenting',
        'Help',
      ]);
    });

    it('on a Mac, the menus and the dialog show ⌘, ⌥ and ⇧', () => {
      const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
      try {
        const dialog = openShortcuts();
        expect(keysFor(dialog, 'Redo')).toBe('⇧⌘Z or ⌘Y');
        expect(keysFor(dialog, 'Work area on or off')).toBe('⌥W');
        expect(keysFor(dialog, 'Flip Horizontal')).toBe('⇧H');
        // Delete and Backspace are one key on a Mac
        expect(keysFor(dialog, 'Delete')).toBe('⌫');
        expect(within(dialog).queryByText(/Ctrl/)).toBeNull();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

        fireEvent.click(screen.getByTestId('menu-edit'));
        expect(screen.getByRole('menuitem', { name: /^Undo/ })).toHaveTextContent('Undo⌘Z');
        expect(screen.getByRole('menuitem', { name: /^Ungroup/ })).toHaveTextContent('Ungroup⇧⌘G');
        expect(screen.getByTestId('edit-menu-dropdown')).not.toHaveTextContent(/Ctrl|Shift/);
      } finally {
        platform.mockRestore();
      }
    });

    it('the menus show the keys the dialog lists', () => {
      const dialog = openShortcuts();
      const save = keysFor(dialog, 'Save');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeNull();
      fireEvent.click(screen.getByTestId('menu-file'));
      expect(screen.getByRole('menuitem', { name: /^Save(?! As)/ })).toHaveTextContent(
        `Save${save}`
      );
    });
  });

  it('Help > Report Issues opens the project on GitHub', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<MenuBar />);

    fireEvent.click(screen.getByTestId('menu-help'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report Issues' }));

    expect(open).toHaveBeenCalledWith(
      'https://github.com/FunwayHQ/quar-animator/issues',
      '_blank',
      'noopener'
    );
    open.mockRestore();
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

    it('lists several restored tutorials readably', async () => {
      restoreMocks.restoreTutorials.mockResolvedValue([
        { id: 'a', name: 'Tutorial 4 · Text' },
        { id: 'b', name: 'Tutorial 5 · Rigging' },
        { id: 'c', name: 'Tutorial 7 · Timing' },
      ]);
      render(<MenuBar />);

      await restore();

      expect(restoreMocks.success).toHaveBeenCalledWith(
        'Restored “Tutorial 4 · Text”, “Tutorial 5 · Rigging” and “Tutorial 7 · Timing”. Open them from File > Open Project...'
      );
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

  describe('renaming from the project name', () => {
    it('renames the project in place with Enter', () => {
      render(<MenuBar />);

      fireEvent.click(screen.getByTestId('project-name'));
      const input = screen.getByTestId('project-name-input');
      expect(input).toHaveValue('Untitled Project');
      fireEvent.change(input, { target: { value: '  Bouncing Ball  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(useEditorStore.getState().projectName).toBe('Bouncing Ball');
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(screen.getByTestId('project-name')).toHaveTextContent('Bouncing Ball');
    });

    it('keeps the new name when the field loses focus', () => {
      render(<MenuBar />);

      fireEvent.click(screen.getByTestId('project-name'));
      const input = screen.getByTestId('project-name-input');
      fireEvent.change(input, { target: { value: 'Walk Cycle' } });
      fireEvent.blur(input);

      expect(useEditorStore.getState().projectName).toBe('Walk Cycle');
    });

    it('keeps the old name on Escape, or when the new one is blank', () => {
      render(<MenuBar />);

      fireEvent.click(screen.getByTestId('project-name'));
      fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'Nope' } });
      fireEvent.keyDown(screen.getByTestId('project-name-input'), { key: 'Escape' });
      expect(useEditorStore.getState().projectName).toBe('Untitled Project');

      fireEvent.click(screen.getByTestId('project-name'));
      fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: '   ' } });
      fireEvent.keyDown(screen.getByTestId('project-name-input'), { key: 'Enter' });
      expect(useEditorStore.getState().projectName).toBe('Untitled Project');
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('saves a project that was saved before, so the Projects page shows the new name', () => {
      const actions = createMockProjectActions();
      render(<MenuBar projectActions={actions} />);

      // Not saved yet: just takes the name
      fireEvent.click(screen.getByTestId('project-name'));
      fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'Draft' } });
      fireEvent.keyDown(screen.getByTestId('project-name-input'), { key: 'Enter' });
      expect(actions.saveProject).not.toHaveBeenCalled();

      act(() => useEditorStore.setState({ projectId: 'proj_1' }));
      fireEvent.click(screen.getByTestId('project-name'));
      fireEvent.change(screen.getByTestId('project-name-input'), { target: { value: 'Final' } });
      fireEvent.keyDown(screen.getByTestId('project-name-input'), { key: 'Enter' });
      expect(actions.saveProject).toHaveBeenCalledOnce();
    });
  });
});
