/**
 * Project Actions Hook for Quar Animator
 * Combines storage, serialization, and store for project operations
 */

import { useCallback, useEffect, useRef } from 'react';
import { createTimeline } from '@quar/animation';
import { useSceneGraph } from '../contexts/SceneGraphContext';
import { useEditorStore } from '../stores/editorStore';
import {
  saveProject as dbSave,
  loadProject as dbLoad,
  listProjects as dbList,
  deleteProject as dbDelete,
  getLastProjectId,
  setLastProjectId,
} from '../services/projectStorage';
import {
  serializeProject,
  deserializeProject,
  downloadProjectFile,
  uploadProjectFile,
} from '../services/projectSerializer';
import type { ProjectListItem } from '../services/projectStorage';

// ============================================================================
// ID Generation
// ============================================================================

function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Auto-save interval (ms)
// ============================================================================

const AUTO_SAVE_INTERVAL = 30_000;

// ============================================================================
// Hook
// ============================================================================

export interface ProjectActions {
  newProject: () => void;
  saveProject: () => Promise<void>;
  saveProjectAs: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  downloadProject: () => void;
  importProject: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  listProjects: () => Promise<ProjectListItem[]>;
}

export interface UseProjectActionsOptions {
  /** If provided, load this project on mount instead of auto-loading the last project. Pass null to skip auto-load entirely. */
  loadProjectId?: string | null;
}

export function useProjectActions(options: UseProjectActionsOptions = {}): ProjectActions {
  const { loadProjectId } = options;
  const sceneGraph = useSceneGraph();
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snapshot editor state for serialization
  const getEditorSnapshot = useCallback(() => {
    const state = useEditorStore.getState();
    return {
      timeline: state.timeline,
      timelineDuration: state.timelineDuration,
      frameRate: state.frameRate,
      autoKeyframe: state.autoKeyframe,
      onionSkin: state.onionSkin,
    };
  }, []);

  // Apply editor state from deserialized data
  const applyEditorState = useCallback((state: Record<string, unknown>) => {
    useEditorStore.setState(state);
  }, []);

  // ------ New Project ------
  const newProject = useCallback(() => {
    // Clear scene graph
    const data = sceneGraph.toJSON();
    for (const node of data.nodes) {
      sceneGraph.removeNode(node.id);
    }

    // Reset editor state
    useEditorStore.setState({
      projectId: null,
      projectName: 'Untitled Project',
      isDirty: false,
      projectCreatedAt: null,
      currentFrame: 0,
      isPlaying: false,
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
      autoKeyframe: false,
      selectedNodeIds: new Set<string>(),
      selectedKeyframeIds: new Set<string>(),
      keyframeClipboard: null,
      clipboard: null,
    });
  }, [sceneGraph]);

  // ------ Save Project ------
  const saveProject = useCallback(async () => {
    const state = useEditorStore.getState();
    let projectId = state.projectId;

    if (!projectId) {
      projectId = generateProjectId();
      useEditorStore.setState({ projectId });
    }

    const data = serializeProject(
      state.projectName,
      sceneGraph,
      getEditorSnapshot(),
      state.projectCreatedAt ?? undefined
    );

    useEditorStore.setState({
      isDirty: false,
      projectCreatedAt: data.createdAt,
    });

    const json = JSON.stringify(data);
    await dbSave(projectId, state.projectName, json);
    await setLastProjectId(projectId);
  }, [sceneGraph, getEditorSnapshot]);

  // ------ Save As ------
  const saveProjectAs = useCallback(
    async (name: string) => {
      const newId = generateProjectId();

      useEditorStore.setState({
        projectId: newId,
        projectName: name,
        projectCreatedAt: null,
      });

      const state = useEditorStore.getState();
      const data = serializeProject(name, sceneGraph, getEditorSnapshot());

      useEditorStore.setState({
        isDirty: false,
        projectCreatedAt: data.createdAt,
      });

      const json = JSON.stringify(data);
      await dbSave(newId, name, json);
      await setLastProjectId(newId);
    },
    [sceneGraph, getEditorSnapshot]
  );

  // ------ Open Project ------
  const openProject = useCallback(
    async (id: string) => {
      const stored = await dbLoad(id);
      if (!stored) return;

      const data = JSON.parse(stored.data);
      deserializeProject(data, sceneGraph, applyEditorState);

      useEditorStore.setState({
        projectId: id,
        projectName: data.name,
        isDirty: false,
        projectCreatedAt: data.createdAt,
        selectedNodeIds: new Set<string>(),
        selectedKeyframeIds: new Set<string>(),
      });

      await setLastProjectId(id);
    },
    [sceneGraph, applyEditorState]
  );

  // ------ Download as .quar ------
  const downloadProject = useCallback(() => {
    const state = useEditorStore.getState();
    const data = serializeProject(
      state.projectName,
      sceneGraph,
      getEditorSnapshot(),
      state.projectCreatedAt ?? undefined
    );
    downloadProjectFile(state.projectName, data);
  }, [sceneGraph, getEditorSnapshot]);

  // ------ Import .quar file ------
  const importProject = useCallback(async () => {
    const data = await uploadProjectFile();
    deserializeProject(data, sceneGraph, applyEditorState);

    const newId = generateProjectId();
    useEditorStore.setState({
      projectId: newId,
      projectName: data.name,
      isDirty: false,
      projectCreatedAt: data.createdAt,
      selectedNodeIds: new Set<string>(),
      selectedKeyframeIds: new Set<string>(),
    });

    const json = JSON.stringify(data);
    await dbSave(newId, data.name, json);
    await setLastProjectId(newId);
  }, [sceneGraph, applyEditorState]);

  // ------ Delete Project ------
  const deleteProjectAction = useCallback(async (id: string) => {
    await dbDelete(id);
  }, []);

  // ------ List Projects ------
  const listProjectsAction = useCallback(async () => {
    return dbList();
  }, []);

  // ------ Load project on mount ------
  // If loadProjectId is a string, load that project.
  // If loadProjectId is undefined (default), auto-load last project.
  // If loadProjectId is null, skip auto-load entirely.
  useEffect(() => {
    let cancelled = false;

    async function loadOnMount() {
      try {
        let targetId: string | undefined;

        if (typeof loadProjectId === 'string') {
          targetId = loadProjectId;
        } else if (loadProjectId === undefined) {
          targetId = await getLastProjectId();
        }
        // loadProjectId === null → skip

        if (cancelled || !targetId) return;

        const stored = await dbLoad(targetId);
        if (cancelled || !stored) return;

        const data = JSON.parse(stored.data);
        deserializeProject(data, sceneGraph, applyEditorState);

        if (!cancelled) {
          useEditorStore.setState({
            projectId: targetId,
            projectName: data.name,
            isDirty: false,
            projectCreatedAt: data.createdAt,
          });
        }
      } catch {
        // Silently fail — start with empty project
      }
    }

    void loadOnMount();
    return () => {
      cancelled = true;
    };
  }, [sceneGraph, applyEditorState, loadProjectId]);

  // ------ Auto-save every 30s when dirty ------
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      const { isDirty, projectId } = useEditorStore.getState();
      if (isDirty && projectId) {
        saveProject().catch(() => {
          // Silently fail auto-save
        });
      }
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [saveProject]);

  return {
    newProject,
    saveProject,
    saveProjectAs,
    openProject,
    downloadProject,
    importProject,
    deleteProject: deleteProjectAction,
    listProjects: listProjectsAction,
  };
}
