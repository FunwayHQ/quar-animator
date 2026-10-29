/**
 * Tests for useProjectActions hook.
 * Tests core logic by mocking storage, serialization, and SceneGraph.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';

// ============================================================================
// Mocks
// ============================================================================

// Mock projectStorage
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockLoad = vi.fn().mockResolvedValue(null);
const mockList = vi.fn().mockResolvedValue([]);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockGetLastProjectId = vi.fn().mockResolvedValue(undefined);
const mockSetLastProjectId = vi.fn().mockResolvedValue(undefined);
const mockLoadVideoFiles = vi.fn().mockResolvedValue(new Map());

vi.mock('../services/projectStorage', () => ({
  saveProject: (...args: unknown[]) => mockSave(...args),
  loadProject: (...args: unknown[]) => mockLoad(...args),
  listProjects: (...args: unknown[]) => mockList(...args),
  deleteProject: (...args: unknown[]) => mockDelete(...args),
  getLastProjectId: (...args: unknown[]) => mockGetLastProjectId(...args),
  setLastProjectId: (...args: unknown[]) => mockSetLastProjectId(...args),
  loadVideoFiles: (...args: unknown[]) => mockLoadVideoFiles(...args),
}));

// Mock projectSerializer
const mockSerialize = vi.fn().mockReturnValue({
  name: 'Test Project',
  createdAt: '2024-01-01',
  nodes: [],
  settings: {},
});
const mockSerializeToBinary = vi.fn().mockReturnValue(new ArrayBuffer(16));
const mockProjectDataToBinary = vi.fn().mockReturnValue(new ArrayBuffer(8));
const mockDeserialize = vi.fn();
const mockDeserializeFromBinary = vi.fn().mockReturnValue({
  name: 'Test Project',
  createdAt: '2024-01-01',
  version: '3.0',
});
const mockDownloadFile = vi.fn();
const mockUploadFile = vi.fn().mockResolvedValue({
  name: 'Imported',
  createdAt: '2024-01-01',
  nodes: [],
  settings: {},
});
const mockReadProjectFile = vi.fn().mockResolvedValue({
  name: 'Dropped Project',
  createdAt: '2024-01-01',
  version: '3.0',
  pages: [],
  settings: {},
});

vi.mock('../services/projectSerializer', () => ({
  serializeProject: (...args: unknown[]) => mockSerialize(...args),
  serializeProjectToBinary: (...args: unknown[]) => mockSerializeToBinary(...args),
  projectDataToBinary: (...args: unknown[]) => mockProjectDataToBinary(...args),
  deserializeProject: (...args: unknown[]) => mockDeserialize(...args),
  deserializeProjectFromBinary: (...args: unknown[]) => mockDeserializeFromBinary(...args),
  downloadProjectFile: (...args: unknown[]) => mockDownloadFile(...args),
  uploadProjectFile: (...args: unknown[]) => mockUploadFile(...args),
  readProjectFile: (...args: unknown[]) => mockReadProjectFile(...args),
  ProjectFileCancelledError: class ProjectFileCancelledError extends Error {},
}));

// Mock toast
vi.mock('../components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock @quar/core importSvg
const mockImportSvg = vi.fn().mockReturnValue({
  rootIds: [],
  nodes: [],
  warnings: [],
});
vi.mock('@quar/core', () => ({
  importSvg: (...args: unknown[]) => mockImportSvg(...args),
  createGroupNode: (id: string, name: string) => ({ id, name, type: 'group', children: [] }),
}));

// Mock the artboard drop-in
const mockIntoArtboard = vi.fn();
vi.mock('../services/intoArtboard', () => ({
  intoArtboardBeneath: (...args: unknown[]) => mockIntoArtboard(...args),
}));

// Mock @quar/animation
vi.mock('@quar/animation', () => ({
  createTimeline: vi.fn().mockReturnValue({
    tracks: [],
    duration: 300,
    frameRate: 30,
  }),
}));

// Mock SceneGraph context
const mockSceneGraph = {
  toJSON: vi.fn().mockReturnValue({ nodes: [] }),
  fromJSON: vi.fn(),
  removeNode: vi.fn(),
  addNode: vi.fn(),
  moveNode: vi.fn(),
};

vi.mock('../contexts/SceneGraphContext', () => ({
  useSceneGraph: () => mockSceneGraph,
}));

// Mock editorStore
const mockEditorState: Record<string, unknown> = {
  projectId: null,
  projectName: 'Untitled Project',
  isDirty: false,
  projectCreatedAt: null,
  currentFrame: 0,
  isPlaying: false,
  timeline: { tracks: [], duration: 300, frameRate: 30 },
  autoKeyframe: false,
  selectedNodeIds: new Set<string>(),
  selectedKeyframeIds: new Set<string>(),
  keyframeClipboard: null,
  clipboard: null,
  enteredGroupId: null,
  onionSkin: {},
  guides: [],
  vitruvianControllers: [],
  dynamicChains: [],
  globalWind: null,
  timelineDuration: 300,
  frameRate: 30,
  clearHistory: vi.fn(),
  resetProject: vi.fn(),
  flushSequenceEdits: vi.fn(),
  pushUndo: vi.fn(),
};

vi.mock('../stores/editorStore', () => ({
  useEditorStore: Object.assign(
    vi.fn().mockImplementation((selector: (s: Record<string, unknown>) => unknown) => {
      if (typeof selector === 'function') return selector(mockEditorState);
      return mockEditorState;
    }),
    {
      getState: () => mockEditorState,
      setState: vi.fn().mockImplementation((update: Record<string, unknown>) => {
        Object.assign(mockEditorState, update);
      }),
    }
  ),
}));

import { useProjectActions } from './useProjectActions';
import { useEditorStore } from '../stores/editorStore';
import { keepVideoFiles, setVideoFile, videoFile } from '../services/videoFiles';
import { toast } from '../components/common/Toast';

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  // Reset editor state
  Object.assign(mockEditorState, {
    projectId: null,
    projectName: 'Untitled Project',
    isDirty: false,
    isExporting: false,
    projectCreatedAt: null,
  });
});

function renderProjectActions(options = {}) {
  return renderHook(() => useProjectActions({ loadProjectId: null, ...options }));
}

// ============================================================================
// Tests
// ============================================================================

describe('useProjectActions', () => {
  describe('newProject', () => {
    it('clears the scene graph', () => {
      const { result } = renderProjectActions();
      act(() => {
        result.current.newProject();
      });
      // toJSON returns nodes: [], so removeNode should be called for each (none in empty)
      expect(mockSceneGraph.toJSON).toHaveBeenCalled();
    });

    it('resets editor state via the shared resetProject action', () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'old-id';
      mockEditorState.projectName = 'Old Project';

      act(() => {
        result.current.newProject();
      });

      // The full reset now lives in the store action (unit-tested there), so
      // newProject just delegates.
      expect(mockEditorState.resetProject).toHaveBeenCalled();
    });

    it('clears undo history', () => {
      const { result } = renderProjectActions();
      act(() => {
        result.current.newProject();
      });
      expect(mockEditorState.clearHistory).toHaveBeenCalled();
    });
  });

  describe('importProjectFile', () => {
    it('loads and persists the project file dropped on the canvas', async () => {
      const { result } = renderProjectActions();
      const file = new File(['project'], 'dropped.quar');

      await act(async () => {
        await result.current.importProjectFile(file);
      });

      expect(mockReadProjectFile).toHaveBeenCalledWith(file);
      expect(mockDeserialize).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dropped Project' }),
        mockSceneGraph,
        expect.any(Function)
      );
      expect(mockSave).toHaveBeenCalled();
      expect(mockSetLastProjectId).toHaveBeenCalled();
    });
  });

  describe('saveProject', () => {
    it('generates project ID if none exists', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = null;

      await act(async () => {
        await result.current.saveProject();
      });

      // Should have set a new project ID
      expect(useEditorStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: expect.stringContaining('proj_'),
        })
      );
    });

    it('serializes project data', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'existing-id';

      await act(async () => {
        await result.current.saveProject();
      });

      expect(mockSerialize).toHaveBeenCalled();
    });

    it('saves to storage', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'existing-id';

      await act(async () => {
        await result.current.saveProject();
      });

      expect(mockSave).toHaveBeenCalled();
    });

    it('keeps the project dirty when the write fails (F022)', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'existing-id';
      mockEditorState.isDirty = true;
      mockSave.mockRejectedValueOnce(new Error('write failed'));

      await act(async () => {
        await expect(result.current.saveProject()).rejects.toThrow('write failed');
      });

      // Dirty must NOT be cleared on a failed save.
      expect(mockEditorState.isDirty).toBe(true);
    });

    it('sets last project ID', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'existing-id';

      await act(async () => {
        await result.current.saveProject();
      });

      expect(mockSetLastProjectId).toHaveBeenCalled();
    });

    it('serializes the project once, and writes that (F167)', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'existing-id';

      await act(async () => {
        await result.current.saveProject();
      });

      expect(mockSerialize).toHaveBeenCalledTimes(1);
      expect(mockSerializeToBinary).not.toHaveBeenCalled();
      const data: unknown = mockSerialize.mock.results[0]?.value;
      expect(mockProjectDataToBinary).toHaveBeenCalledWith(data);
      const binary: unknown = mockProjectDataToBinary.mock.results[0]?.value;
      expect(mockSave).toHaveBeenCalledWith('existing-id', 'Untitled Project', binary, new Map());
      // The store keeps the creation time the file was written with
      expect(mockEditorState.projectCreatedAt).toBe('2024-01-01');
    });

    it('leaves another project opened during the save as it is (F168)', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'A';
      let finishWrite: () => void = () => undefined;
      mockSave.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve;
          })
      );

      let saving: Promise<void> = Promise.resolve();
      act(() => {
        saving = result.current.saveProject();
      });
      // Project B is opened while A is still being written
      Object.assign(mockEditorState, {
        projectId: 'B',
        isDirty: true,
        projectCreatedAt: 'B created',
      });
      await act(async () => {
        finishWrite();
        await saving;
      });

      // A was saved, but B stays the project to reopen, with its own state
      expect(mockSave).toHaveBeenCalledWith(
        'A',
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
      expect(mockSetLastProjectId).not.toHaveBeenCalledWith('A');
      expect(mockEditorState.isDirty).toBe(true);
      expect(mockEditorState.projectCreatedAt).toBe('B created');
    });

    it('saves the page’s own layers while a symbol is edited, and the symbol as it is', async () => {
      const symbolLayers = { nodes: [{ id: 'in-symbol' }], rootNodeIds: ['in-symbol'] };
      const pageLayers = { nodes: [{ id: 'on-page' }], rootNodeIds: ['on-page'] };
      mockSceneGraph.toJSON.mockReturnValue(symbolLayers);
      Object.assign(mockEditorState, {
        projectId: 'existing-id',
        editingSymbolId: 'badge',
        editingSymbolPrevState: { sceneData: pageLayers, selectedNodeIds: [] },
        symbols: [
          { id: 'badge', name: 'Badge', sceneGraphJSON: { nodes: [], rootNodeIds: [] } },
          { id: 'other', name: 'Other', sceneGraphJSON: { nodes: [], rootNodeIds: [] } },
        ],
      });
      const { result } = renderProjectActions();
      try {
        await act(async () => {
          await result.current.saveProject();
        });
        const snapshot = mockSerialize.mock.calls[0]![2] as {
          pageScene: unknown;
          symbols: Array<{ id: string; sceneGraphJSON: unknown }>;
        };
        expect(snapshot.pageScene).toEqual(pageLayers);
        expect(snapshot.symbols.map((symbol) => [symbol.id, symbol.sceneGraphJSON])).toEqual([
          ['badge', symbolLayers],
          ['other', { nodes: [], rootNodeIds: [] }],
        ]);
      } finally {
        mockSceneGraph.toJSON.mockReturnValue({ nodes: [] });
        Object.assign(mockEditorState, { editingSymbolId: null, editingSymbolPrevState: null });
      }
    });

    it('saves the brush profiles made in the document with it', async () => {
      const profiles = [
        { id: 'uniform', name: 'Uniform', samples: [1, 1] },
        { id: 'custom-1', name: 'Diamond', samples: [0, 1, 0] },
      ];
      Object.assign(mockEditorState, { projectId: 'existing-id', brushProfiles: profiles });
      const { result } = renderProjectActions();
      await act(async () => {
        await result.current.saveProject();
      });

      const snapshot = mockSerialize.mock.calls[0]![2] as { brushProfiles: unknown };
      expect(snapshot.brushProfiles).toEqual(profiles);
    });

    it('marks project as not dirty after save', async () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'existing-id';

      await act(async () => {
        await result.current.saveProject();
      });

      expect(useEditorStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({ isDirty: false })
      );
    });
  });

  describe('saveProjectAs', () => {
    it('creates new project ID', async () => {
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.saveProjectAs('New Name');
      });

      expect(useEditorStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: expect.stringContaining('proj_'),
          projectName: 'New Name',
        })
      );
    });

    it('serializes the project once, and writes that (F167)', async () => {
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.saveProjectAs('Copy');
      });

      expect(mockSerialize).toHaveBeenCalledTimes(1);
      expect(mockSerializeToBinary).not.toHaveBeenCalled();
      expect(mockProjectDataToBinary).toHaveBeenCalledWith(mockSerialize.mock.results[0]?.value);
    });

    it("doesn't make the copy the project to reopen when another was opened meanwhile (F168)", async () => {
      const { result } = renderProjectActions();
      let finishWrite: () => void = () => undefined;
      mockSave.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve;
          })
      );

      let saving: Promise<void> = Promise.resolve();
      act(() => {
        saving = result.current.saveProjectAs('Copy');
      });
      const copyId = mockEditorState.projectId;
      mockEditorState.projectId = 'B';
      await act(async () => {
        finishWrite();
        await saving;
      });

      expect(mockSetLastProjectId).not.toHaveBeenCalledWith(copyId);
    });

    it('saves with new name to storage', async () => {
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.saveProjectAs('My Animation');
      });

      expect(mockSave).toHaveBeenCalled();
      expect(mockSetLastProjectId).toHaveBeenCalled();
    });
  });

  describe('openProject', () => {
    it('loads project from storage', async () => {
      mockLoad.mockResolvedValueOnce({
        data: JSON.stringify({
          name: 'Saved Project',
          createdAt: '2024-01-01',
          nodes: [],
          settings: {},
        }),
      });
      mockDeserializeFromBinary.mockReturnValueOnce({
        name: 'Saved Project',
        createdAt: '2024-01-01',
        version: '3.0',
      });

      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.openProject('proj_123');
      });

      expect(mockLoad).toHaveBeenCalledWith('proj_123');
      expect(mockDeserializeFromBinary).toHaveBeenCalled();
    });

    it('sets editor state from loaded project', async () => {
      mockLoad.mockResolvedValueOnce({
        data: JSON.stringify({
          name: 'Loaded Project',
          createdAt: '2024-06-01',
          nodes: [],
          settings: {},
        }),
      });
      mockDeserializeFromBinary.mockReturnValueOnce({
        name: 'Loaded Project',
        createdAt: '2024-06-01',
        version: '3.0',
      });

      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.openProject('proj_456');
      });

      expect(useEditorStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj_456',
          projectName: 'Loaded Project',
          isDirty: false,
        })
      );
    });

    it('clears history after loading', async () => {
      mockLoad.mockResolvedValueOnce({
        data: JSON.stringify({ name: 'P', createdAt: '', nodes: [], settings: {} }),
      });
      mockDeserializeFromBinary.mockReturnValueOnce({
        name: 'P',
        createdAt: '',
        version: '3.0',
      });

      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.openProject('proj_789');
      });

      expect(mockEditorState.clearHistory).toHaveBeenCalled();
    });

    it('does nothing if project not found', async () => {
      mockLoad.mockResolvedValueOnce(null);

      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.openProject('nonexistent');
      });

      expect(mockDeserializeFromBinary).not.toHaveBeenCalled();
    });
  });

  describe('downloadProject', () => {
    it('serializes and downloads project', () => {
      const { result } = renderProjectActions();

      act(() => {
        result.current.downloadProject();
      });

      expect(mockSerialize).toHaveBeenCalled();
      expect(mockDownloadFile).toHaveBeenCalled();
    });
  });

  describe('deleteProject', () => {
    it('deletes project from storage', async () => {
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.deleteProject('proj_to_delete');
      });

      expect(mockDelete).toHaveBeenCalledWith('proj_to_delete');
    });
  });

  describe('listProjects', () => {
    it('returns project list from storage', async () => {
      const projectList = [
        { id: 'p1', name: 'Project 1', updatedAt: '2024-01-01' },
        { id: 'p2', name: 'Project 2', updatedAt: '2024-02-01' },
      ];
      mockList.mockResolvedValueOnce(projectList);

      const { result } = renderProjectActions();
      let list: unknown;

      await act(async () => {
        list = await result.current.listProjects();
      });

      expect(list).toEqual(projectList);
    });
  });

  describe('importSvg', () => {
    /** Runs File › Import SVG… with `file` chosen in the file dialog. */
    function importChosen(file: File) {
      const createElement = document.createElement.bind(document);
      let input: HTMLInputElement | undefined;
      const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const element = createElement(tag);
        if (tag === 'input') {
          input = element as HTMLInputElement;
          input.click = () => {};
        }
        return element;
      });
      const { result } = renderProjectActions();
      act(() => result.current.importSvg());
      spy.mockRestore();
      Object.defineProperty(input, 'files', { value: [file] });
      input?.onchange?.(new Event('change'));
    }
    const svgFile = () => new File(['<svg/>'], 'art.svg', { type: 'image/svg+xml' });

    it('puts the artwork into the artboard beneath it, as dropping does', async () => {
      mockImportSvg.mockReturnValueOnce({ rootIds: ['star'], nodes: [{}], warnings: [] });
      importChosen(svgFile());
      await vi.waitFor(() => expect(mockIntoArtboard).toHaveBeenCalledWith(mockSceneGraph, 'star'));
      expect(mockEditorState.selectedNodeIds).toEqual(new Set(['star']));
    });

    it('puts several shapes in as their group', async () => {
      mockImportSvg.mockReturnValueOnce({ rootIds: ['a', 'b'], nodes: [{}, {}], warnings: [] });
      importChosen(svgFile());
      await vi.waitFor(() => expect(mockIntoArtboard).toHaveBeenCalledOnce());
      const groupId = (mockSceneGraph.addNode.mock.calls[0]?.[0] as { id: string }).id;
      expect(mockIntoArtboard).toHaveBeenCalledWith(mockSceneGraph, groupId);
      expect(mockSceneGraph.moveNode).toHaveBeenCalledWith('a', groupId);
    });
  });

  describe('videos', () => {
    const library = [{ id: 'clip', name: 'clip.mp4', mimeType: 'video/mp4' }];

    beforeEach(() => {
      keepVideoFiles(new Set());
      mockEditorState.videos = [];
    });

    it('saves the video library with the project', async () => {
      mockEditorState.videos = library;
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.saveProject();
      });

      expect(mockSerialize).toHaveBeenCalledWith(
        'Untitled Project',
        mockSceneGraph,
        expect.objectContaining({ videos: library }),
        undefined
      );
    });

    it("gives the document the files of an imported file's videos, and lets the last project's go", async () => {
      setVideoFile('old', new Blob(['old video']));
      const file = new Blob(['video'], { type: 'video/mp4' });
      mockDeserialize.mockImplementationOnce(
        (_data: unknown, _sceneGraph: unknown, apply: (state: object) => void) =>
          apply({ videos: library, videoFiles: new Map([['clip', file]]) })
      );
      mockSerialize.mockReturnValueOnce({ name: 'Dropped Project', videos: library });
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.importProjectFile(new File(['project'], 'clips.quar'));
      });

      expect(videoFile('clip')).toBe(file);
      expect(videoFile('old')).toBeUndefined();
      // The library in the store, the files beside it
      expect(mockEditorState.videos).toEqual(library);
      expect('videoFiles' in mockEditorState).toBe(false);
      // The copy stored keeps them, apart from the project
      expect(mockSave).toHaveBeenCalledWith(
        expect.any(String),
        'Dropped Project',
        expect.any(ArrayBuffer),
        new Map([['clip', file]])
      );
    });

    it('stores the files of the videos the project shows, with it (each written once)', async () => {
      const file = new Blob(['video'], { type: 'video/mp4' });
      setVideoFile('clip', file);
      const clips = { name: 'Clips', createdAt: '2024-01-01', videos: library };
      mockSerialize.mockReturnValueOnce(clips).mockReturnValueOnce(clips);
      mockEditorState.projectId = 'proj_1';
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.saveProject();
      });
      expect(mockSave).toHaveBeenLastCalledWith(
        'proj_1',
        'Untitled Project',
        expect.any(ArrayBuffer),
        new Map([['clip', file]])
      );

      // A copy saved as another stores them as its own
      await act(async () => {
        await result.current.saveProjectAs('Clips copy');
      });
      const [copyId, , , copied] = mockSave.mock.calls.at(-1) as unknown[];
      expect(copyId).not.toBe('proj_1');
      expect(copied).toEqual(new Map([['clip', file]]));
    });

    it("opens a stored project with its videos' files, kept apart from it", async () => {
      const file = new Blob(['video'], { type: 'video/mp4' });
      mockLoad.mockResolvedValueOnce({ data: new ArrayBuffer(8) });
      mockLoadVideoFiles.mockResolvedValueOnce(new Map([['clip', file]]));
      mockDeserializeFromBinary.mockImplementationOnce(
        (_data: unknown, _sceneGraph: unknown, apply: (state: object) => void) => {
          apply({ videos: library, videoFiles: new Map() });
          return { name: 'Clips', createdAt: '' };
        }
      );
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.openProject('proj_clips');
      });

      expect(mockLoadVideoFiles).toHaveBeenCalledWith('proj_clips');
      expect(videoFile('clip')).toBe(file);
      expect(mockEditorState.projectId).toBe('proj_clips');
    });

    it("opens a project whose videos can't be read, saying so", async () => {
      mockLoad.mockResolvedValueOnce({ data: new ArrayBuffer(8) });
      mockLoadVideoFiles.mockRejectedValueOnce(new Error('unreadable'));
      const { result } = renderProjectActions();

      await act(async () => {
        await result.current.openProject('proj_clips');
      });

      expect(toast.error).toHaveBeenCalledWith("This project's videos couldn't be read");
      expect(mockDeserializeFromBinary).toHaveBeenCalled();
      expect(mockEditorState.projectId).toBe('proj_clips');
    });
  });

  describe('auto-save', () => {
    it('waits while an export runs, then saves', async () => {
      vi.useFakeTimers();
      try {
        Object.assign(mockEditorState, { projectId: 'proj_1', isDirty: true, isExporting: true });
        renderProjectActions();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(mockSave).not.toHaveBeenCalled();

        mockEditorState.isExporting = false;
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(mockSave).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
