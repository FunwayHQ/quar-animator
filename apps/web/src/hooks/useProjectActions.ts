/**
 * Project Actions Hook for Quar Animator
 * Combines storage, serialization, and store for project operations
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSceneGraph } from '../contexts/SceneGraphContext';
import { useEditorStore } from '../stores/editorStore';
import { toast } from '../components/common/Toast';
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
  serializeProjectToBinary,
  deserializeProject,
  deserializeProjectFromBinary,
  downloadProjectFile,
  uploadProjectFile,
} from '../services/projectSerializer';
import { importSvg, createGroupNode } from '@quar/core';
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
  importSvg: () => void;
  importImage: () => void;
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
      guides: state.guides,
      vitruvianControllers: state.vitruvianControllers,
      dynamicChains: state.dynamicChains,
      globalWind: state.globalWind,
      ikChains: state.ikChains,
      smartBoneActions: state.smartBoneActions,
      pages: state.pages,
      activePageId: state.activePageId,
      symbols: state.symbols,
    };
  }, []);

  // Apply editor state from deserialized data
  const applyEditorState = useCallback((state: Record<string, unknown>) => {
    useEditorStore.setState(state);
  }, []);

  // ------ New Project ------
  const newProject = useCallback(() => {
    // Clear the live scene graph (the store has no direct handle to it)...
    const data = sceneGraph.toJSON();
    for (const node of data.nodes) {
      sceneGraph.removeNode(node.id);
    }

    // ...then reset every project-scoped field via the shared action (F024).
    useEditorStore.getState().resetProject();
    useEditorStore.getState().clearHistory();
  }, [sceneGraph]);

  // ------ Save Project ------
  const saveProject = useCallback(async () => {
    manualSavingRef.current = true;
    try {
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

      const binary = serializeProjectToBinary(
        state.projectName,
        sceneGraph,
        getEditorSnapshot(),
        state.projectCreatedAt ?? undefined
      );
      await dbSave(projectId, state.projectName, binary);
      await setLastProjectId(projectId);
      // Clear dirty only after the write succeeds — a failed save must keep the
      // project marked dirty (and surface the error to the caller).
      useEditorStore.setState({
        isDirty: false,
        projectCreatedAt: data.createdAt,
      });
      toast.success('Project saved');
    } finally {
      manualSavingRef.current = false;
    }
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

      const data = serializeProject(name, sceneGraph, getEditorSnapshot());

      const binary = serializeProjectToBinary(name, sceneGraph, getEditorSnapshot());
      await dbSave(newId, name, binary);
      await setLastProjectId(newId);
      // Clear dirty only after the write succeeds (see saveProject).
      useEditorStore.setState({
        isDirty: false,
        projectCreatedAt: data.createdAt,
      });
      toast.success(`Project saved as "${name}"`);
    },
    [sceneGraph, getEditorSnapshot]
  );

  // ------ Open Project ------
  const openProject = useCallback(
    async (id: string) => {
      const stored = await dbLoad(id);
      if (!stored) return;

      const data = deserializeProjectFromBinary(stored.data, sceneGraph, applyEditorState);

      useEditorStore.setState({
        projectId: id,
        projectName: data.name as string,
        isDirty: false,
        projectCreatedAt: data.createdAt as string,
        selectedNodeIds: new Set<string>(),
        selectedKeyframeIds: new Set<string>(),
      });
      useEditorStore.getState().clearHistory();

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
    toast.success('Project exported');
  }, [sceneGraph, getEditorSnapshot]);

  // ------ Import .quar file ------
  const importProject = useCallback(async () => {
    try {
      const data = await uploadProjectFile();

      deserializeProject(data, sceneGraph, applyEditorState);

      const newId = generateProjectId();
      const name = (data as any).name as string;
      const createdAt = (data as any).createdAt as string;
      useEditorStore.setState({
        projectId: newId,
        projectName: name,
        isDirty: false,
        projectCreatedAt: createdAt,
        selectedNodeIds: new Set<string>(),
        selectedKeyframeIds: new Set<string>(),
      });

      // Re-serialize to binary for storage
      const binary = serializeProjectToBinary(name, sceneGraph, getEditorSnapshot(), createdAt);
      await dbSave(newId, name, binary);
      await setLastProjectId(newId);
      useEditorStore.getState().clearHistory();
      toast.success(`Imported "${name}"`);
    } catch {
      toast.error('Failed to import project file');
    }
  }, [sceneGraph, applyEditorState, getEditorSnapshot]);

  // ------ Import SVG file ------
  const importSvgFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const svgString = reader.result as string;
        let idCounter = Date.now();
        const generateId = () => `node_${idCounter++}`;
        try {
          useEditorStore.getState().pushUndo(sceneGraph);
          const result = importSvg(svgString, sceneGraph, generateId, {
            centerAtOrigin: true,
            selectAfterImport: true,
          });
          if (result.rootIds.length > 1) {
            const groupId = generateId();
            const group = createGroupNode(groupId, 'Imported SVG');
            sceneGraph.addNode(group);
            for (const rootId of result.rootIds) {
              sceneGraph.moveNode(rootId, groupId);
            }
            useEditorStore.setState({ selectedNodeIds: new Set([groupId]) });
            toast.success(
              `Imported ${result.nodes.length} element${result.nodes.length === 1 ? '' : 's'} from SVG`
            );
          } else if (result.rootIds.length === 1) {
            useEditorStore.setState({ selectedNodeIds: new Set(result.rootIds) });
            toast.success(
              `Imported ${result.nodes.length} element${result.nodes.length === 1 ? '' : 's'} from SVG`
            );
          }
          if (result.warnings.length > 0) {
            for (const w of result.warnings) {
              toast.info(w);
            }
          }
        } catch {
          toast.error('Failed to import SVG file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [sceneGraph]);

  // ------ Import Image file ------
  const importImageFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      // Validate file size (max 10MB)
      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast.error('Image too large (max 10MB)');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result as string;

        // Load image to get natural dimensions
        const img = new Image();
        img.onload = () => {
          const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const imageNode = {
            id: nodeId,
            name: file.name.replace(/\.[^.]+$/, ''),
            type: 'image' as const,
            parent: null,
            children: [],
            transform: {
              position: { x: 0, y: 0 },
              rotation: 0,
              scale: { x: 1, y: 1 },
              anchor: { x: 0.5, y: 0.5 },
              skew: { x: 0, y: 0 },
            },
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal' as const,
            src: dataUri,
            width: img.naturalWidth,
            height: img.naturalHeight,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
          };

          useEditorStore.getState().pushUndo(sceneGraph);
          sceneGraph.addNode(imageNode);
          useEditorStore.setState({ selectedNodeIds: new Set([nodeId]) });
          toast.success(`Imported image "${file.name}"`);
        };
        img.onerror = () => {
          toast.error('Failed to load image');
        };
        img.src = dataUri;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [sceneGraph]);

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

        const data = deserializeProjectFromBinary(stored.data, sceneGraph, applyEditorState);

        if (!cancelled) {
          useEditorStore.setState({
            projectId: targetId,
            projectName: data.name as string,
            isDirty: false,
            projectCreatedAt: data.createdAt as string,
          });
        }
      } catch {
        toast.error('Failed to load project — starting with empty project');
      }
    }

    void loadOnMount();
    return () => {
      cancelled = true;
    };
  }, [sceneGraph, applyEditorState, loadProjectId]);

  // ------ Auto-save every 30s when dirty ------
  const autoSavingRef = useRef(false);
  const manualSavingRef = useRef(false);
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      const { isDirty, projectId } = useEditorStore.getState();
      if (isDirty && projectId && !autoSavingRef.current && !manualSavingRef.current) {
        autoSavingRef.current = true;
        saveProject()
          .catch(() => {
            toast.error('Auto-save failed');
          })
          .finally(() => {
            autoSavingRef.current = false;
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
    importSvg: importSvgFile,
    importImage: importImageFile,
    deleteProject: deleteProjectAction,
    listProjects: listProjectsAction,
  };
}
