/**
 * Project Actions Hook for Quar Animator
 * Combines storage, serialization, and store for project operations
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSceneGraph } from '../contexts/SceneGraphContext';
import { intoArtboardBeneath } from '../services/intoArtboard';
import { chooseSoundFiles, importSoundFiles } from '../services/soundImport';
import { importVideoFiles, isGifFile, sortGifFiles } from '../services/videoImport';
import { useEditorStore } from '../stores/editorStore';
import { toast } from '../components/common/Toast';
import {
  saveProject as dbSave,
  loadProject as dbLoad,
  loadVideoFiles as dbLoadVideoFiles,
  listProjects as dbList,
  deleteProject as dbDelete,
  getLastProjectId,
  setLastProjectId,
} from '../services/projectStorage';
import {
  serializeProject,
  projectDataToBinary,
  deserializeProject,
  deserializeProjectFromBinary,
  downloadProjectFile,
  uploadProjectFile,
  readProjectFile,
  ProjectFileCancelledError,
} from '../services/projectSerializer';
import type { OpenedProjectState, ProjectData, ProjectDataV2 } from '../services/projectSerializer';
import { keepVideoFiles, setVideoFile, videoFile } from '../services/videoFiles';
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
// Video files
// ============================================================================

/**
 * The videos a serialized project shows, by id, with their files where the
 * document has them: the browser's storage writes each once, apart from the
 * project, so saving again (autosave) never rewrites one.
 */
function videoFilesOf(data: ProjectDataV2): Map<string, Blob | undefined> {
  return new Map((data.videos ?? []).map((video) => [video.id, videoFile(video.id)]));
}

/**
 * The files of a stored project's videos; none when they can't be read. The
 * project opens all the same (its videos show nothing), and the files stay
 * stored: a save lets go only of those of videos it no longer shows.
 */
async function storedVideoFiles(projectId: string): Promise<Map<string, Blob>> {
  try {
    return await dbLoadVideoFiles(projectId);
  } catch {
    toast.error("This project's videos couldn't be read");
    return new Map();
  }
}

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
  importProjectFile: (file: File) => Promise<void>;
  importSvg: () => void;
  importImage: () => void;
  /** Pick sound files and put them on the timeline in view, at the playhead */
  importSound: () => void;
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
    // Keep a just-made edit to a sequenced object (it moves the object's animation)
    useEditorStore.getState().flushSequenceEdits(sceneGraph);
    const state = useEditorStore.getState();
    // Editing a symbol, the scene holds its layers: they're the symbol's,
    // and the page's are those put aside when the editing began
    const editing =
      state.editingSymbolId && state.editingSymbolPrevState
        ? { symbolId: state.editingSymbolId, page: state.editingSymbolPrevState.sceneData }
        : null;
    return {
      timeline: state.timeline,
      animationSequence: state.animationSequence,
      // The page's own length (an artboard's timeline may be the one in view)
      timelineDuration: state.timeline.duration,
      frameRate: state.frameRate,
      autoKeyframe: state.autoKeyframe,
      onionSkin: state.onionSkin,
      guides: state.guides,
      documentBackground: state.documentBackground,
      vitruvianControllers: state.vitruvianControllers,
      dynamicChains: state.dynamicChains,
      globalWind: state.globalWind,
      ikChains: state.ikChains,
      smartBoneActions: state.smartBoneActions,
      pages: state.pages,
      activePageId: state.activePageId,
      symbols: editing
        ? state.symbols.map((symbol) =>
            symbol.id === editing.symbolId
              ? { ...symbol, sceneGraphJSON: structuredClone(sceneGraph.toJSON()) }
              : symbol
          )
        : state.symbols,
      sounds: state.sounds,
      videos: state.videos,
      brushProfiles: state.brushProfiles,
      ...(editing && { pageScene: editing.page }),
    };
  }, [sceneGraph]);

  // Apply editor state from deserialized data: the videos' files first (those
  // the file held, or the browser's storage keeps apart), so whatever reads
  // the library finds them; the last project's are let go
  const applyEditorState = useCallback(
    ({ videoFiles, ...state }: OpenedProjectState, storedFiles?: ReadonlyMap<string, Blob>) => {
      const files = new Map([...(storedFiles ?? []), ...(videoFiles ?? [])]);
      keepVideoFiles(new Set(files.keys()));
      for (const [id, file] of files) setVideoFile(id, file);
      useEditorStore.setState(state);
    },
    []
  );

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

      // Serialized once: the file written is this data, and the store keeps its createdAt
      const data = serializeProject(
        state.projectName,
        sceneGraph,
        getEditorSnapshot(),
        state.projectCreatedAt ?? undefined
      );
      const binary = projectDataToBinary(data);
      await dbSave(projectId, state.projectName, binary, videoFilesOf(data));
      // Another project opened while this one was being written is the one to
      // reopen next time, and the state below is its own, not this one's
      if (useEditorStore.getState().projectId !== projectId) return;
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
      const binary = projectDataToBinary(data);
      // The copy stores the videos' files too, as its own
      await dbSave(newId, name, binary, videoFilesOf(data));
      // Unless another project was opened meanwhile (see saveProject)
      if (useEditorStore.getState().projectId !== newId) return;
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
      const videoFiles = await storedVideoFiles(id);

      // Nothing of the last project's session (its undo, its selection) carries over
      useEditorStore.getState().forgetSession();
      const data = deserializeProjectFromBinary(stored.data, sceneGraph, (state) =>
        applyEditorState(state, videoFiles)
      );

      useEditorStore.setState({
        projectId: id,
        projectName: data.name as string,
        isDirty: false,
        projectCreatedAt: data.createdAt as string,
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
    toast.success('Project exported');
  }, [sceneGraph, getEditorSnapshot]);

  const loadImportedProject = useCallback(
    async (data: ProjectData) => {
      // Nothing of the last project's session carries over (see openProject)
      useEditorStore.getState().forgetSession();
      deserializeProject(data, sceneGraph, applyEditorState);

      const newId = generateProjectId();
      const name = data.name;
      const createdAt = data.createdAt;
      useEditorStore.setState({
        projectId: newId,
        projectName: name,
        isDirty: false,
        projectCreatedAt: createdAt,
        selectedNodeIds: new Set<string>(),
        selectedKeyframeIds: new Set<string>(),
      });

      // Re-serialize to binary for storage, the videos' files stored apart
      const saved = serializeProject(name, sceneGraph, getEditorSnapshot(), createdAt);
      await dbSave(newId, name, projectDataToBinary(saved), videoFilesOf(saved));
      await setLastProjectId(newId);
      useEditorStore.getState().clearHistory();
      toast.success(`Imported "${name}"`);
    },
    [sceneGraph, applyEditorState, getEditorSnapshot]
  );

  // ------ Import .quar file ------
  const importProject = useCallback(async () => {
    try {
      await loadImportedProject(await uploadProjectFile());
    } catch (error) {
      if (error instanceof ProjectFileCancelledError) return;
      toast.error(error instanceof Error ? error.message : 'Failed to import project file');
    }
  }, [loadImportedProject]);

  const importProjectFile = useCallback(
    async (file: File) => {
      try {
        await loadImportedProject(await readProjectFile(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to import project file');
      }
    },
    [loadImportedProject]
  );

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
          });
          if (result.rootIds.length > 1) {
            const groupId = generateId();
            const group = createGroupNode(groupId, 'Imported SVG');
            sceneGraph.addNode(group);
            for (const rootId of result.rootIds) {
              sceneGraph.moveNode(rootId, groupId);
            }
            // Into the artboard it lands on, as a dropped or pasted SVG goes
            intoArtboardBeneath(sceneGraph, groupId);
            useEditorStore.setState({ selectedNodeIds: new Set([groupId]) });
            toast.success(
              `Imported ${result.nodes.length} element${result.nodes.length === 1 ? '' : 's'} from SVG`
            );
          } else if (result.rootIds.length === 1) {
            for (const rootId of result.rootIds) intoArtboardBeneath(sceneGraph, rootId);
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

      const placePicture = () => {
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
            intoArtboardBeneath(sceneGraph, nodeId);
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

      // An animated GIF is a clip, as a video is; a still one a picture
      if (isGifFile(file)) {
        void sortGifFiles([file]).then(({ animated }) => {
          if (animated.length > 0) void importVideoFiles(sceneGraph, animated);
          else placePicture();
        });
        return;
      }
      placePicture();
    };
    input.click();
  }, [sceneGraph]);

  // ------ Import Sound files ------
  const importSoundFile = useCallback(() => {
    chooseSoundFiles((files) => void importSoundFiles(sceneGraph, files));
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
        const videoFiles = await storedVideoFiles(targetId);
        if (cancelled) return;

        // Opened from the Projects page after another: none of its session (see openProject)
        useEditorStore.getState().forgetSession();
        const data = deserializeProjectFromBinary(stored.data, sceneGraph, (state) =>
          applyEditorState(state, videoFiles)
        );

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
      const { isDirty, projectId, isExporting } = useEditorStore.getState();
      // Waits while an export runs, so saving doesn't slow it (or interrupt it)
      if (
        isDirty &&
        projectId &&
        !isExporting &&
        !autoSavingRef.current &&
        !manualSavingRef.current
      ) {
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
    importProjectFile,
    importSvg: importSvgFile,
    importImage: importImageFile,
    importSound: importSoundFile,
    deleteProject: deleteProjectAction,
    listProjects: listProjectsAction,
  };
}
