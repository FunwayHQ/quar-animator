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

vi.mock('../services/projectStorage', () => ({
  saveProject: (...args: unknown[]) => mockSave(...args),
  loadProject: (...args: unknown[]) => mockLoad(...args),
  listProjects: (...args: unknown[]) => mockList(...args),
  deleteProject: (...args: unknown[]) => mockDelete(...args),
  getLastProjectId: (...args: unknown[]) => mockGetLastProjectId(...args),
  setLastProjectId: (...args: unknown[]) => mockSetLastProjectId(...args),
}));

// Mock projectSerializer
const mockSerialize = vi.fn().mockReturnValue({
  name: 'Test Project',
  createdAt: '2024-01-01',
  nodes: [],
  settings: {},
});
const mockSerializeToBinary = vi.fn().mockReturnValue(new ArrayBuffer(16));
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

vi.mock('../services/projectSerializer', () => ({
  serializeProject: (...args: unknown[]) => mockSerialize(...args),
  serializeProjectToBinary: (...args: unknown[]) => mockSerializeToBinary(...args),
  deserializeProject: (...args: unknown[]) => mockDeserialize(...args),
  deserializeProjectFromBinary: (...args: unknown[]) => mockDeserializeFromBinary(...args),
  downloadProjectFile: (...args: unknown[]) => mockDownloadFile(...args),
  uploadProjectFile: (...args: unknown[]) => mockUploadFile(...args),
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
vi.mock('@quar/core', () => ({
  importSvg: vi.fn().mockReturnValue({
    rootIds: [],
    nodes: [],
    warnings: [],
  }),
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

    it('resets editor state', () => {
      const { result } = renderProjectActions();
      mockEditorState.projectId = 'old-id';
      mockEditorState.projectName = 'Old Project';

      act(() => {
        result.current.newProject();
      });

      expect(useEditorStore.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: null,
          projectName: 'Untitled Project',
          isDirty: false,
          currentFrame: 0,
          isPlaying: false,
          autoKeyframe: false,
        })
      );
    });

    it('clears undo history', () => {
      const { result } = renderProjectActions();
      act(() => {
        result.current.newProject();
      });
      expect(mockEditorState.clearHistory).toHaveBeenCalled();
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
});
