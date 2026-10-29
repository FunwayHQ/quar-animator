/**
 * MenuBar Component for Quar Animator
 * Application menu bar with full dropdown menus and project name display
 */

import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useEditorStore,
  useProjectName,
  useIsDirty,
  type SceneGraphLike,
} from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { flipSelected } from '../canvas/flipSelected';
import { hasGoogleFontsConsent, setGoogleFontsConsent } from '../common/ConsentBanner';
import { copyLayers, pasteLayers } from '../../hooks/useSystemClipboard';
import type { SceneGraph } from '@quar/core';
import type { ProjectActions } from '../../hooks/useProjectActions';
import type { ProjectListItem } from '../../services/projectStorage';
import { ProjectListDialog } from '../common/ProjectListDialog';
import type { SmartBoneAction, PathNode } from '@quar/types';
import { showExportDialog } from '../common/ExportDialog';
import { toast } from '../common/Toast';
import { restoreTutorials } from '../../tutorials/seedTutorials';
import { setUiTheme, useUiTheme } from '../../hooks/useUiTheme';
import { BetaBadge, REPORT_ISSUES_URL } from '../common/BetaBadge';
import { PRIVACY_URL, TERMS_URL } from '../common/legalLinks';
import { HelpHost } from '../help/HelpWindow';
import { openHelp } from '../help/helpPanel';
import styles from './MenuBar.module.css';
import { useToolsBelowMenus } from './useToolsBelowMenus';
import { useProjectShortcuts } from '../../hooks/useProjectShortcuts';
import { getAnimationEnd } from '../../hooks/usePlayback';
import { okToDiscard } from '../../services/unsavedChanges';
import { QuarLogo } from '../common/QuarLogo';
import { KEYS, SHORTCUT_GROUPS, formatShortcut, type ShortcutEntry } from '../common/shortcuts';

// ============================================================================
// Types
// ============================================================================

export interface MenuBarProps {
  projectActions?: ProjectActions;
  /** Tool palette shown inline between the menus and the project name. */
  toolbar?: ReactNode;
}

type MenuId = 'file' | 'edit' | 'view' | 'animation' | 'rigging' | 'export' | 'help' | null;

// ============================================================================
// Custom Events for Camera/View Commands
// ============================================================================

export const VIEW_EVENTS = {
  ZOOM_IN: 'menubar:zoom-in',
  ZOOM_OUT: 'menubar:zoom-out',
  ZOOM_100: 'menubar:zoom-100',
  FIT_TO_WINDOW: 'menubar:fit-to-window',
} as const;

function dispatchViewEvent(event: string) {
  window.dispatchEvent(new CustomEvent(event));
}

// ============================================================================
// Helpers
// ============================================================================

/** Reusable menu item component */
function MenuItem({
  label,
  shortcut,
  onClick,
  disabled,
  checked,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  checked?: boolean;
}) {
  return (
    <button
      className={`${styles.dropdownItem} ${disabled ? styles.dropdownItemDisabled : ''}`}
      role={checked == null ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles.dropdownCheck}>
        {checked != null ? (checked ? '\u2713' : '') : ''}
      </span>
      <span className={styles.dropdownLabel}>{label}</span>
      {shortcut && <span className={styles.dropdownShortcut}>{formatShortcut(shortcut)}</span>}
    </button>
  );
}

/**
 * The project's name, top right. Clicking it renames the project in place:
 * Enter (or clicking away) keeps the new name, Escape keeps the old one.
 */
function ProjectNameField({
  isDirty,
  onRename,
}: {
  isDirty: boolean;
  onRename: (name: string) => void;
}) {
  const projectName = useProjectName();
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (draft === null) return;
    const name = draft.trim();
    setDraft(null);
    if (name && name !== projectName) onRename(name);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={styles.projectNameInput}
        value={draft}
        maxLength={100}
        aria-label="Project name"
        data-testid="project-name-input"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(null);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.projectNameDisplay}
      data-testid="project-name"
      title="Click to rename"
      onClick={() => setDraft(projectName)}
    >
      {isDirty && <span className={styles.dirtyDot} data-testid="dirty-indicator" />}
      <span className={styles.projectNameText}>{projectName}</span>
    </button>
  );
}

function Separator() {
  return <div className={styles.dropdownSeparator} role="separator" />;
}

function SectionHeader({ label }: { label: string }) {
  return <div className={styles.dropdownSectionHeader}>{label}</div>;
}

// ============================================================================
// Component
// ============================================================================

export function MenuBar({ projectActions, toolbar }: MenuBarProps) {
  const uiTheme = useUiTheme();
  const projectName = useProjectName();
  const isDirty = useIsDirty();
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [showProjectList, setShowProjectList] = useState(false);
  const [showSaveAsPrompt, setShowSaveAsPrompt] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const menuBarRef = useRef<HTMLElement>(null);
  const toolsBelow = useToolsBelowMenus(menuBarRef, Boolean(toolbar));

  const sceneGraph = useSceneGraph() as unknown as SceneGraphLike;

  // --- Store hooks (all at top, before any early returns) ---
  const canUndo = useEditorStore((state) => state.canUndo);
  const canRedo = useEditorStore((state) => state.canRedo);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const clipboard = useEditorStore((state) => state.clipboard);
  const showRulers = useEditorStore((state) => state.showRulers);
  const showGuides = useEditorStore((state) => state.showGuides);
  const snapToGuides = useEditorStore((state) => state.snapToGuides);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const onionSkinEnabled = useEditorStore(
    (state: { onionSkin: { enabled: boolean } }) => state.onionSkin.enabled
  );
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const isLooping = useEditorStore((state) => state.isLooping);
  const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
  const activeTool = useEditorStore((state) => state.activeTool);

  // --- Store actions ---
  const undoAction = useEditorStore((state) => state.undo);
  const redoAction = useEditorStore((state) => state.redo);
  const duplicateSelectionAction = useEditorStore((state) => state.duplicateSelection);
  const deleteSelectionAction = useEditorStore((state) => state.deleteSelection);
  const selectAllAction = useEditorStore((state) => state.selectAll);
  const outlineStrokeAction = useEditorStore((state) => state.outlineStroke);
  const groupSelectionAction = useEditorStore((state) => state.groupSelection);
  const ungroupSelectionAction = useEditorStore((state) => state.ungroupSelection);
  const bringForwardAction = useEditorStore((state) => state.bringForward);
  const sendBackwardAction = useEditorStore((state) => state.sendBackward);
  const bringToFrontAction = useEditorStore((state) => state.bringToFront);
  const sendToBackAction = useEditorStore((state) => state.sendToBack);
  const booleanUnionAction = useEditorStore((state) => state.booleanUnion);
  const booleanSubtractAction = useEditorStore((state) => state.booleanSubtract);
  const booleanIntersectAction = useEditorStore((state) => state.booleanIntersect);
  const booleanExcludeAction = useEditorStore((state) => state.booleanExclude);
  const flattenBooleanGroupAction = useEditorStore((state) => state.flattenBooleanGroup);
  const releaseBooleanGroupAction = useEditorStore((state) => state.releaseBooleanGroup);
  const toggleShowRulersAction = useEditorStore((state) => state.toggleShowRulers);
  const toggleShowGuidesAction = useEditorStore((state) => state.toggleShowGuides);
  const toggleSnapToGuidesAction = useEditorStore((state) => state.toggleSnapToGuides);
  const clearGuidesAction = useEditorStore((state) => state.clearGuides);
  const toggleSnapToGridAction = useEditorStore((state) => state.toggleSnapToGrid);
  const toggleOnionSkinAction = useEditorStore((state) => state.toggleOnionSkin);
  const sequenceWindowOpen = useEditorStore((state) => state.sequenceWindowOpen);
  const toggleSequenceWindowAction = useEditorStore((state) => state.toggleSequenceWindow);
  const setIsPlayingAction = useEditorStore((state) => state.setIsPlaying);
  const setIsLoopingAction = useEditorStore((state) => state.setIsLooping);
  const setCurrentFrameAction = useEditorStore((state) => state.setCurrentFrame);
  const toggleAutoKeyframeAction = useEditorStore((state) => state.toggleAutoKeyframe);
  const setActiveToolAction = useEditorStore((state) => state.setActiveTool);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  const smartBoneActions: SmartBoneAction[] = useEditorStore((state) => state.smartBoneActions);
  const createSmartBoneActionStore = useEditorStore((state) => state.createSmartBoneAction);
  const removeSmartBoneActionStore = useEditorStore((state) => state.removeSmartBoneAction);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  const vitruvianControllers = useEditorStore((state) => state.vitruvianControllers);
  const createVitruvianController = useEditorStore((state) => state.createVitruvianController);
  const removeVitruvianController = useEditorStore((state) => state.removeVitruvianController);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  const dynamicChains = useEditorStore((state) => state.dynamicChains);
  const createDynamicChain = useEditorStore((state) => state.createDynamicChain);
  const removeDynamicChain = useEditorStore((state) => state.removeDynamicChain);

  // --- Computed flags ---
  const hasSelection = selectedNodeIds.size > 0;
  const hasMultipleSelected = selectedNodeIds.size >= 2;

  // Text, rectangles, ellipses and polygons convert to paths
  const hasConvertibleSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const type = sceneGraph.getNode(id)?.type;
      return type === 'text' || type === 'rectangle' || type === 'ellipse' || type === 'polygon';
    });
  }, [selectedNodeIds, sceneGraph]);

  const hasStrokeSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      if (!n) return false;
      const strokes = (n as { strokes?: { visible: boolean }[] }).strokes;
      return strokes && strokes.some((s) => s.visible);
    });
  }, [selectedNodeIds, sceneGraph]);

  const hasGroupSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.type === 'group';
    });
  }, [selectedNodeIds, sceneGraph]);

  // The selected unlocked paths (for the Path section)
  const selectedPathNodes = useMemo(
    () =>
      Array.from(selectedNodeIds)
        .map((id) => sceneGraph.getNode(id))
        .filter((n): n is PathNode => n?.type === 'path' && !n.locked),
    [selectedNodeIds, sceneGraph]
  );
  const allPathsClosed =
    selectedPathNodes.length > 0 && selectedPathNodes.every((path) => path.closed);
  // Cut at Points works on the points picked with Direct Selection
  const pickedPointCount = useEditorStore((state) =>
    state.activeTool === 'direct-selection' ? state.directSelectionPoints.length : 0
  );

  const hasBooleanGroupSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.type === 'group' && (n as { booleanOp?: string }).booleanOp;
    });
  }, [selectedNodeIds, sceneGraph]);

  // Whether there are bones, for the Rigging menu: looked up each time it opens
  // (the scene graph is one object for the whole session, so useMemo([sceneGraph])
  // would never see bones added)
  let hasBoneNodes = false;
  if (openMenu === 'rigging') {
    sceneGraph.traverse((node: { type: string }) => {
      if (node.type === 'bone') {
        hasBoneNodes = true;
        return false; // stop
      }
      return true;
    });
  }

  const hasShapeSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      if (!n) return false;
      return ['rectangle', 'ellipse', 'polygon', 'path', 'image'].includes(n.type);
    });
  }, [selectedNodeIds, sceneGraph]);

  const hasBoneSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.type === 'bone';
    });
  }, [selectedNodeIds, sceneGraph]);

  const hasBoneOrIKTargetSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      return n && (n.type === 'bone' || n.type === 'ik-target');
    });
  }, [selectedNodeIds, sceneGraph]);

  const hasSkinnedSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      if (!n) return false;
      return !!(n as { skinData?: unknown }).skinData;
    });
  }, [selectedNodeIds, sceneGraph]);

  const hasSmartBoneActionsForSelected = useMemo(() => {
    const boneIds = Array.from(selectedNodeIds).filter((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.type === 'bone';
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    return smartBoneActions.some((a: SmartBoneAction) => boneIds.includes(a.driver.boneId));
  }, [selectedNodeIds, sceneGraph, smartBoneActions]);

  const hasDynamicChainForSelected = useMemo(() => {
    const boneIds = Array.from(selectedNodeIds).filter((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.type === 'bone';
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return dynamicChains.some((c: { rootBoneId: string }) => boneIds.includes(c.rootBoneId));
  }, [selectedNodeIds, sceneGraph, dynamicChains]);

  // --- Close menu when clicking outside ---
  useEffect(() => {
    if (!openMenu) return;

    const handleClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as HTMLElement)) {
        setOpenMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenu]);

  // --- Menu toggle/hover helpers ---
  const toggleMenu = useCallback(
    (id: MenuId) => {
      setOpenMenu(openMenu === id ? null : id);
    },
    [openMenu]
  );

  const hoverMenu = useCallback(
    (id: MenuId) => {
      if (openMenu !== null && openMenu !== id) {
        setOpenMenu(id);
      }
    },
    [openMenu]
  );

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  // --- File menu actions ---
  const navigate = useNavigate();
  const handleBackToProjects = useCallback(async () => {
    closeMenu();
    if (await okToDiscard('Going back to your projects')) navigate('/');
  }, [closeMenu, navigate]);

  const handleNew = useCallback(async () => {
    closeMenu();
    if (!projectActions) return;
    // New Project clears the scene, timeline and undo history — confirm first if
    // there are unsaved changes (F013).
    if (await okToDiscard('Creating a new project')) projectActions.newProject();
  }, [projectActions, closeMenu]);

  const handleOpen = useCallback(async () => {
    closeMenu();
    if (!projectActions) return;
    const list = await projectActions.listProjects();
    setProjects(list);
    setShowProjectList(true);
  }, [projectActions, closeMenu]);

  const handleSave = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    projectActions.saveProject().catch(() => toast.error('Failed to save project'));
  }, [projectActions, closeMenu]);

  const handleRestoreTutorials = useCallback(async () => {
    try {
      const restored = await restoreTutorials();
      if (restored.length === 0) {
        toast.info('All the tutorials are already in your projects');
      } else {
        const quoted = restored.map((tutorial) => `“${tutorial.name}”`);
        // “A”, “A and B”, “A, B and C”
        const names =
          quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}` : quoted[0];
        toast.success(
          `Restored ${names}. Open ${restored.length > 1 ? 'them' : 'it'} from File > Open Project...`
        );
      }
    } catch {
      toast.error('Could not restore the tutorials');
    }
  }, []);

  const handleRename = useCallback(
    (name: string) => {
      const store = useEditorStore.getState();
      store.setProjectName(name);
      store.markDirty();
      // A saved project is renamed on the Projects page right away; a new one
      // takes the name when it's first saved
      if (store.projectId && projectActions) {
        projectActions.saveProject().catch(() => toast.error('Failed to save project'));
      }
    },
    [projectActions]
  );

  const handleSaveAs = useCallback(() => {
    closeMenu();
    setSaveAsName(projectName);
    setShowSaveAsPrompt(true);
  }, [projectName, closeMenu]);

  const handleSaveAsConfirm = useCallback(() => {
    if (!projectActions || !saveAsName.trim()) return;
    setShowSaveAsPrompt(false);
    projectActions
      .saveProjectAs(saveAsName.trim())
      .catch(() => toast.error('Failed to save project'));
  }, [projectActions, saveAsName]);

  const handleDownload = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    projectActions.downloadProject();
  }, [projectActions, closeMenu]);

  const handleImport = useCallback(async () => {
    closeMenu();
    if (!projectActions) return;
    // An imported project takes the editor's place
    if (await okToDiscard('Importing a project')) await projectActions.importProject();
  }, [projectActions, closeMenu]);

  const handleImportSvg = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    projectActions.importSvg();
  }, [projectActions, closeMenu]);

  const handleImportImage = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    projectActions.importImage();
  }, [projectActions, closeMenu]);

  const handleImportSound = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    projectActions.importSound();
  }, [projectActions, closeMenu]);

  // The file keys do what the File menu does: the same questions and dialogs
  const fileShortcuts = useMemo(
    () => ({
      onNew: () => void handleNew(),
      onOpen: () => void handleOpen(),
      onSave: handleSave,
      onSaveAs: handleSaveAs,
      onImportSvg: handleImportSvg,
    }),
    [handleNew, handleOpen, handleSave, handleSaveAs, handleImportSvg]
  );
  useProjectShortcuts(fileShortcuts);

  // --- Project list dialog actions ---
  const handleOpenProject = useCallback(
    async (id: string) => {
      setShowProjectList(false);
      if (!projectActions || !(await okToDiscard('Opening another project'))) return;
      await projectActions.openProject(id);
    },
    [projectActions]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (!projectActions) return;
      await projectActions.deleteProject(id);
      const list = await projectActions.listProjects();
      setProjects(list);
    },
    [projectActions]
  );

  // --- Menu button helper ---
  const menuButton = (id: MenuId, label: string, testId?: string) => (
    <button
      className={`${styles.menuItem} ${openMenu === id ? styles.active : ''}`}
      onClick={() => toggleMenu(id)}
      onMouseEnter={() => hoverMenu(id)}
      data-testid={testId}
    >
      {label}
    </button>
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <header
        className={`${styles.menuBar} ${toolsBelow ? styles.toolsBelow : ''}`}
        ref={menuBarRef}
        data-tools-below={toolsBelow || undefined}
      >
        <div className={styles.leading}>
          <button
            type="button"
            className={styles.logo}
            onClick={() => void handleBackToProjects()}
            title="Back to your projects"
            aria-label="Back to your projects"
            data-testid="back-to-projects"
          >
            <QuarLogo className={styles.logoImage} />
          </button>
          <BetaBadge />

          <nav className={styles.menus}>
            {/* ====== FILE MENU ====== */}
            <div className={styles.menuContainer}>
              {menuButton('file', 'File', 'menu-file')}
              {openMenu === 'file' && (
                <div className={styles.dropdown} role="menu" data-testid="file-menu-dropdown">
                  <MenuItem label="Back to Projects" onClick={() => void handleBackToProjects()} />
                  <Separator />
                  <MenuItem
                    label="New Project"
                    shortcut={KEYS.newProject}
                    onClick={() => void handleNew()}
                  />
                  <MenuItem
                    label="Open Project..."
                    shortcut={KEYS.openProject}
                    onClick={() => void handleOpen()}
                  />
                  <Separator />
                  <MenuItem label="Save" shortcut={KEYS.save} onClick={handleSave} />
                  <MenuItem label="Save As..." shortcut={KEYS.saveAs} onClick={handleSaveAs} />
                  <Separator />
                  <MenuItem label="Download as .quar" onClick={handleDownload} />
                  <MenuItem label="Import .quar..." onClick={() => void handleImport()} />
                  <MenuItem
                    label="Import SVG..."
                    shortcut={KEYS.importSvg}
                    onClick={handleImportSvg}
                  />
                  <MenuItem label="Import Image..." onClick={handleImportImage} />
                  <MenuItem label="Import Sound..." onClick={handleImportSound} />
                </div>
              )}
            </div>

            {/* ====== EDIT MENU ====== */}
            <div className={styles.menuContainer}>
              {menuButton('edit', 'Edit', 'menu-edit')}
              {openMenu === 'edit' && (
                <div className={styles.dropdown} role="menu" data-testid="edit-menu-dropdown">
                  <MenuItem
                    label="Undo"
                    shortcut={KEYS.undo}
                    disabled={!canUndo}
                    onClick={() => {
                      closeMenu();
                      undoAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Redo"
                    shortcut={KEYS.redo}
                    disabled={!canRedo}
                    onClick={() => {
                      closeMenu();
                      redoAction(sceneGraph);
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Cut"
                    shortcut={KEYS.cut}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      copyLayers(sceneGraph, 'cut');
                    }}
                  />
                  <MenuItem
                    label="Copy"
                    shortcut={KEYS.copy}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      copyLayers(sceneGraph, 'copy');
                    }}
                  />
                  <MenuItem
                    label="Paste"
                    shortcut={KEYS.paste}
                    disabled={!clipboard}
                    onClick={() => {
                      closeMenu();
                      void pasteLayers(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Duplicate"
                    shortcut={KEYS.duplicate}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      duplicateSelectionAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Delete"
                    shortcut={KEYS.delete}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      deleteSelectionAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Select All"
                    shortcut={KEYS.selectAll}
                    onClick={() => {
                      closeMenu();
                      selectAllAction(sceneGraph);
                    }}
                  />
                  <Separator />
                  <SectionHeader label="Arrange" />
                  <MenuItem
                    label="Group"
                    shortcut={KEYS.group}
                    disabled={!hasMultipleSelected}
                    onClick={() => {
                      closeMenu();
                      groupSelectionAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Ungroup"
                    shortcut={KEYS.ungroup}
                    disabled={!hasGroupSelected}
                    onClick={() => {
                      closeMenu();
                      ungroupSelectionAction(sceneGraph);
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Bring Forward"
                    shortcut={KEYS.bringForward}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      bringForwardAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Bring to Front"
                    shortcut={KEYS.bringToFront}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      bringToFrontAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Send Backward"
                    shortcut={KEYS.sendBackward}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      sendBackwardAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Send to Back"
                    shortcut={KEYS.sendToBack}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      sendToBackAction(sceneGraph);
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Flip Horizontal"
                    shortcut={KEYS.flipHorizontal}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      flipSelected(sceneGraph as unknown as SceneGraph, 'horizontal');
                    }}
                  />
                  <MenuItem
                    label="Flip Vertical"
                    shortcut={KEYS.flipVertical}
                    disabled={!hasSelection}
                    onClick={() => {
                      closeMenu();
                      flipSelected(sceneGraph as unknown as SceneGraph, 'vertical');
                    }}
                  />
                  <Separator />
                  <SectionHeader label="Boolean" />
                  <MenuItem
                    label="Union"
                    shortcut={KEYS.union}
                    disabled={!hasMultipleSelected}
                    onClick={() => {
                      closeMenu();
                      booleanUnionAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Subtract"
                    shortcut={KEYS.subtract}
                    disabled={!hasMultipleSelected}
                    onClick={() => {
                      closeMenu();
                      booleanSubtractAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Intersect"
                    shortcut={KEYS.intersect}
                    disabled={!hasMultipleSelected}
                    onClick={() => {
                      closeMenu();
                      booleanIntersectAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Exclude"
                    shortcut={KEYS.exclude}
                    disabled={!hasMultipleSelected}
                    onClick={() => {
                      closeMenu();
                      booleanExcludeAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Flatten Boolean"
                    disabled={!hasBooleanGroupSelected}
                    onClick={() => {
                      closeMenu();
                      flattenBooleanGroupAction(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Release Boolean"
                    disabled={!hasBooleanGroupSelected}
                    onClick={() => {
                      closeMenu();
                      releaseBooleanGroupAction(sceneGraph);
                    }}
                  />
                  <Separator />
                  <SectionHeader label="Path" />
                  <MenuItem
                    label="Reverse Path"
                    disabled={selectedPathNodes.length === 0}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().reverseSelectedPaths(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Simplify Path"
                    disabled={selectedPathNodes.length === 0}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().simplifySelectedPaths(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label={allPathsClosed ? 'Open Path' : 'Close Path'}
                    disabled={selectedPathNodes.length === 0}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().setSelectedPathsClosed(sceneGraph, !allPathsClosed);
                    }}
                  />
                  <MenuItem
                    label="Join"
                    shortcut={KEYS.join}
                    disabled={!selectedPathNodes.some((path) => !path.closed)}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().joinSelectedPaths(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label={pickedPointCount > 1 ? 'Cut at Points' : 'Cut at Point'}
                    disabled={pickedPointCount === 0}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().cutPathsAtSelectedPoints(sceneGraph);
                    }}
                  />
                  <Separator />
                  <SectionHeader label="Convert" />
                  <MenuItem
                    label="Convert to Path"
                    shortcut={KEYS.convertToPath}
                    disabled={!hasConvertibleSelected}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().convertSelectionToPaths(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Outline Stroke"
                    shortcut={KEYS.outlineStroke}
                    disabled={!hasStrokeSelected}
                    onClick={() => {
                      closeMenu();
                      outlineStrokeAction(sceneGraph);
                    }}
                  />
                  <Separator />
                  <SectionHeader label="Symbols" />
                  <MenuItem
                    label="Create Symbol"
                    shortcut={KEYS.createSymbol}
                    disabled={selectedNodeIds.size === 0}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().createSymbol(sceneGraph);
                    }}
                  />
                  <MenuItem
                    label="Detach Instance"
                    disabled={(() => {
                      if (selectedNodeIds.size !== 1) return true;
                      const selId = [...selectedNodeIds][0]!;
                      const selNode = sceneGraph.getNode(selId);
                      return !selNode || selNode.type !== 'symbol-instance';
                    })()}
                    onClick={() => {
                      closeMenu();
                      useEditorStore.getState().detachInstance(sceneGraph);
                    }}
                  />
                </div>
              )}
            </div>

            {/* ====== VIEW MENU ====== */}
            <div className={styles.menuContainer}>
              {menuButton('view', 'View', 'menu-view')}
              {openMenu === 'view' && (
                <div className={styles.dropdown} role="menu" data-testid="view-menu-dropdown">
                  <MenuItem
                    label="Zoom In"
                    shortcut={KEYS.zoomIn}
                    onClick={() => {
                      closeMenu();
                      dispatchViewEvent(VIEW_EVENTS.ZOOM_IN);
                    }}
                  />
                  <MenuItem
                    label="Zoom Out"
                    shortcut={KEYS.zoomOut}
                    onClick={() => {
                      closeMenu();
                      dispatchViewEvent(VIEW_EVENTS.ZOOM_OUT);
                    }}
                  />
                  <MenuItem
                    label="Zoom to 100%"
                    shortcut={KEYS.zoom100}
                    onClick={() => {
                      closeMenu();
                      dispatchViewEvent(VIEW_EVENTS.ZOOM_100);
                    }}
                  />
                  <MenuItem
                    label="Fit to Window"
                    shortcut={KEYS.fitToWindow}
                    onClick={() => {
                      closeMenu();
                      dispatchViewEvent(VIEW_EVENTS.FIT_TO_WINDOW);
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Show Rulers"
                    shortcut={KEYS.rulers}
                    checked={showRulers}
                    onClick={() => {
                      closeMenu();
                      toggleShowRulersAction();
                    }}
                  />
                  <MenuItem
                    label="Snap to Grid"
                    checked={snapToGrid}
                    onClick={() => {
                      closeMenu();
                      toggleSnapToGridAction();
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Show Guides"
                    shortcut={KEYS.guides}
                    checked={showGuides}
                    onClick={() => {
                      closeMenu();
                      toggleShowGuidesAction();
                    }}
                  />
                  <MenuItem
                    label="Snap to Guides"
                    checked={snapToGuides}
                    onClick={() => {
                      closeMenu();
                      toggleSnapToGuidesAction();
                    }}
                  />
                  <MenuItem
                    label="Clear All Guides"
                    onClick={() => {
                      closeMenu();
                      clearGuidesAction();
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Onion Skinning"
                    shortcut={KEYS.onionSkin}
                    checked={onionSkinEnabled}
                    onClick={() => {
                      closeMenu();
                      toggleOnionSkinAction();
                    }}
                  />
                  <MenuItem
                    label="Animation Sequence"
                    shortcut={KEYS.animationSequence}
                    checked={sequenceWindowOpen}
                    onClick={() => {
                      closeMenu();
                      toggleSequenceWindowAction();
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Light Appearance"
                    checked={uiTheme === 'light'}
                    onClick={() => {
                      closeMenu();
                      setUiTheme(uiTheme === 'light' ? 'dark' : 'light');
                    }}
                  />
                </div>
              )}
            </div>

            {/* ====== ANIMATION MENU ====== */}
            <div className={styles.menuContainer}>
              {menuButton('animation', 'Animation', 'menu-animation')}
              {openMenu === 'animation' && (
                <div className={styles.dropdown} role="menu" data-testid="animation-menu-dropdown">
                  <MenuItem
                    label={isPlaying ? 'Pause' : 'Play'}
                    shortcut={KEYS.playPause}
                    onClick={() => {
                      closeMenu();
                      setIsPlayingAction(!isPlaying);
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Previous Frame"
                    shortcut={KEYS.previousFrame}
                    disabled={isPlaying}
                    onClick={() => {
                      closeMenu();
                      const { currentFrame } = useEditorStore.getState();
                      if (currentFrame > 0) setCurrentFrameAction(currentFrame - 1);
                    }}
                  />
                  <MenuItem
                    label="Next Frame"
                    shortcut={KEYS.nextFrame}
                    disabled={isPlaying}
                    onClick={() => {
                      closeMenu();
                      const { currentFrame, timelineDuration } = useEditorStore.getState();
                      if (currentFrame < timelineDuration - 1)
                        setCurrentFrameAction(currentFrame + 1);
                    }}
                  />
                  <MenuItem
                    label="Jump Backward 10"
                    shortcut={KEYS.back10}
                    disabled={isPlaying}
                    onClick={() => {
                      closeMenu();
                      const { currentFrame } = useEditorStore.getState();
                      setCurrentFrameAction(Math.max(0, currentFrame - 10));
                    }}
                  />
                  <MenuItem
                    label="Jump Forward 10"
                    shortcut={KEYS.forward10}
                    disabled={isPlaying}
                    onClick={() => {
                      closeMenu();
                      const { currentFrame, timelineDuration } = useEditorStore.getState();
                      setCurrentFrameAction(Math.min(timelineDuration - 1, currentFrame + 10));
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Go to Start"
                    shortcut={KEYS.goToStart}
                    onClick={() => {
                      closeMenu();
                      setCurrentFrameAction(0);
                    }}
                  />
                  <MenuItem
                    label="Go to End"
                    shortcut="End"
                    onClick={() => {
                      closeMenu();
                      // Where End goes: the end of the animation, not of the timeline
                      setIsPlayingAction(false);
                      setCurrentFrameAction(getAnimationEnd(useEditorStore.getState(), sceneGraph));
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Loop Playback"
                    shortcut={KEYS.loop}
                    checked={isLooping}
                    onClick={() => {
                      closeMenu();
                      setIsLoopingAction(!isLooping);
                    }}
                  />
                  <MenuItem
                    label="Auto-Keyframe"
                    shortcut={KEYS.autoKeyframe}
                    checked={autoKeyframe}
                    onClick={() => {
                      closeMenu();
                      toggleAutoKeyframeAction();
                    }}
                  />
                </div>
              )}
            </div>

            {/* ====== RIGGING MENU ====== */}
            <div className={styles.menuContainer}>
              {menuButton('rigging', 'Rigging', 'menu-rigging')}
              {openMenu === 'rigging' && (
                <div className={styles.dropdown} role="menu" data-testid="rigging-menu-dropdown">
                  <MenuItem
                    label="Bone Tool"
                    shortcut={KEYS.boneTool}
                    checked={activeTool === 'bone'}
                    onClick={() => {
                      closeMenu();
                      setActiveToolAction('bone');
                    }}
                  />
                  <MenuItem
                    label="Weight Paint Tool"
                    shortcut={KEYS.weightPaintTool}
                    checked={activeTool === 'weight-paint'}
                    onClick={() => {
                      closeMenu();
                      setActiveToolAction('weight-paint');
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Bind Selection to Bones"
                    disabled={!hasShapeSelected || !hasBoneNodes}
                    onClick={() => {
                      closeMenu();
                      window.dispatchEvent(new CustomEvent('menubar:bind-to-bones'));
                    }}
                  />
                  <MenuItem
                    label="Unbind Mesh"
                    disabled={!hasSkinnedSelected}
                    onClick={() => {
                      closeMenu();
                      window.dispatchEvent(new CustomEvent('menubar:unbind-mesh'));
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Create IK Chain"
                    disabled={!hasBoneSelected}
                    onClick={() => {
                      closeMenu();
                      window.dispatchEvent(new CustomEvent('menubar:create-ik-chain'));
                    }}
                  />
                  <MenuItem
                    label="Remove IK Chain"
                    disabled={!hasBoneOrIKTargetSelected}
                    onClick={() => {
                      closeMenu();
                      window.dispatchEvent(new CustomEvent('menubar:remove-ik-chain'));
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Create Smart Bone Action"
                    disabled={!hasBoneSelected}
                    onClick={() => {
                      closeMenu();
                      const boneId = Array.from(selectedNodeIds).find((id) => {
                        const n = sceneGraph.getNode(id);
                        return n && n.type === 'bone';
                      });
                      if (boneId) createSmartBoneActionStore(sceneGraph, boneId);
                    }}
                    data-testid="create-smart-bone-action-menu"
                  />
                  <MenuItem
                    label="Delete Smart Bone Action"
                    disabled={!hasSmartBoneActionsForSelected}
                    onClick={() => {
                      closeMenu();
                      const boneId = Array.from(selectedNodeIds).find((id) => {
                        const n = sceneGraph.getNode(id);
                        return n && n.type === 'bone';
                      });
                      if (boneId) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
                        const action = smartBoneActions.find(
                          (a: SmartBoneAction) => a.driver.boneId === boneId
                        );
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        if (action) removeSmartBoneActionStore(sceneGraph, action.id);
                      }
                    }}
                    data-testid="delete-smart-bone-action-menu"
                  />
                  <Separator />
                  <MenuItem
                    label="Create Vitruvian Controller"
                    disabled={!hasBoneSelected}
                    onClick={() => {
                      closeMenu();
                      createVitruvianController(sceneGraph);
                    }}
                    data-testid="create-vitruvian-menu"
                  />
                  <MenuItem
                    label="Remove Vitruvian Controller"
                    disabled={vitruvianControllers.length === 0}
                    onClick={() => {
                      closeMenu();
                      if (vitruvianControllers.length > 0) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        removeVitruvianController(
                          sceneGraph,
                          vitruvianControllers[vitruvianControllers.length - 1]!.id
                        );
                      }
                    }}
                    data-testid="remove-vitruvian-menu"
                  />
                  <Separator />
                  <MenuItem
                    label="Create Dynamic Chain"
                    disabled={!hasBoneSelected}
                    onClick={() => {
                      closeMenu();
                      const boneId = Array.from(selectedNodeIds).find((id) => {
                        const n = sceneGraph.getNode(id);
                        return n && n.type === 'bone';
                      });
                      if (boneId) createDynamicChain(sceneGraph, boneId);
                    }}
                    data-testid="create-dynamic-chain-menu"
                  />
                  <MenuItem
                    label="Remove Dynamic Chain"
                    disabled={!hasDynamicChainForSelected}
                    onClick={() => {
                      closeMenu();
                      const boneId = Array.from(selectedNodeIds).find((id) => {
                        const n = sceneGraph.getNode(id);
                        return n && n.type === 'bone';
                      });
                      if (boneId) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        const chain = dynamicChains.find(
                          (c: { rootBoneId: string }) => c.rootBoneId === boneId
                        );
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        if (chain) removeDynamicChain(sceneGraph, chain.id);
                      }
                    }}
                    data-testid="remove-dynamic-chain-menu"
                  />
                </div>
              )}
            </div>

            {/* ====== EXPORT MENU ====== */}
            <div className={styles.menuContainer}>
              {menuButton('export', 'Export', 'menu-export')}
              {openMenu === 'export' && (
                <div className={styles.dropdown} role="menu" data-testid="export-menu-dropdown">
                  <MenuItem
                    label="Export as PNG Sequence..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('png-sequence');
                    }}
                  />
                  <MenuItem
                    label="Export as GIF..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('gif');
                    }}
                  />
                  <MenuItem
                    label="Export as MP4..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('mp4');
                    }}
                  />
                  <MenuItem
                    label="Export as WebM..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('webm');
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="Export as Lottie JSON..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('lottie');
                    }}
                  />
                  <MenuItem
                    label="Export as Sprite Sheet..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('sprite-sheet');
                    }}
                  />
                  <MenuItem
                    label="Export as SVG..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('svg');
                    }}
                  />
                  <MenuItem
                    label="Export as PDF..."
                    onClick={() => {
                      closeMenu();
                      showExportDialog('pdf');
                    }}
                  />
                </div>
              )}
            </div>

            {/* ====== HELP MENU ====== */}
            <div className={styles.menuContainer}>
              {menuButton('help', 'Help', 'menu-help')}
              {openMenu === 'help' && (
                <div className={styles.dropdown} role="menu" data-testid="help-menu-dropdown">
                  <MenuItem
                    label="User Guide"
                    shortcut={KEYS.userGuide}
                    onClick={() => {
                      closeMenu();
                      openHelp();
                    }}
                  />
                  <MenuItem
                    label="Keyboard Shortcuts"
                    onClick={() => {
                      closeMenu();
                      setShowShortcutsDialog(true);
                    }}
                  />
                  <MenuItem
                    label="Restore Tutorials"
                    onClick={() => {
                      closeMenu();
                      void handleRestoreTutorials();
                    }}
                  />
                  <MenuItem
                    label="Use Google Fonts"
                    checked={hasGoogleFontsConsent()}
                    onClick={() => {
                      closeMenu();
                      const on = !hasGoogleFontsConsent();
                      setGoogleFontsConsent(on);
                      toast.info(
                        on
                          ? 'Google Fonts are on: fonts other than Inter load from Google when you pick them.'
                          : 'Google Fonts are off: nothing more loads from Google. Fonts already loaded stay until you reload.'
                      );
                    }}
                  />
                  <Separator />
                  <MenuItem
                    label="About Quar Animator"
                    onClick={() => {
                      closeMenu();
                      setShowAboutDialog(true);
                    }}
                  />
                  <MenuItem
                    label="Privacy Policy"
                    onClick={() => {
                      closeMenu();
                      window.open(PRIVACY_URL, '_blank', 'noopener');
                    }}
                  />
                  <MenuItem
                    label="Terms of Service"
                    onClick={() => {
                      closeMenu();
                      window.open(TERMS_URL, '_blank', 'noopener');
                    }}
                  />
                  <MenuItem
                    label="Report Issues"
                    onClick={() => {
                      closeMenu();
                      window.open(REPORT_ISSUES_URL, '_blank', 'noopener');
                    }}
                  />
                </div>
              )}
            </div>
          </nav>
        </div>

        {toolbar && (
          <div className={styles.toolbarSlot} data-testid="menubar-toolbar">
            {toolbar}
          </div>
        )}

        <div className={styles.actions}>
          <ProjectNameField isDirty={isDirty} onRename={handleRename} />
        </div>
      </header>

      {/* The user guide beside the canvas (Help > User Guide, F1) */}
      <HelpHost />

      {/* Project List Dialog */}
      {showProjectList && (
        <ProjectListDialog
          projects={projects}
          onOpen={(id) => void handleOpenProject(id)}
          onDelete={(id) => void handleDeleteProject(id)}
          onClose={() => setShowProjectList(false)}
        />
      )}

      {/* Save As Prompt */}
      {showSaveAsPrompt && (
        <>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div className={styles.saveAsOverlay} onClick={() => setShowSaveAsPrompt(false)} />
          <div
            className={styles.saveAsDialog}
            role="dialog"
            aria-label="Save As"
            data-testid="save-as-dialog"
          >
            <h3 className={styles.saveAsTitle}>Save As</h3>
            <input
              className={styles.saveAsInput}
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAsConfirm();
                if (e.key === 'Escape') setShowSaveAsPrompt(false);
              }}
              placeholder="Project name"
              autoFocus // eslint-disable-line jsx-a11y/no-autofocus
              data-testid="save-as-input"
            />
            <div className={styles.saveAsActions}>
              <button className={styles.saveAsCancel} onClick={() => setShowSaveAsPrompt(false)}>
                Cancel
              </button>
              <button
                className={styles.saveAsConfirm}
                onClick={handleSaveAsConfirm}
                disabled={!saveAsName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* Keyboard Shortcuts Dialog */}
      {showShortcutsDialog && (
        <>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div className={styles.saveAsOverlay} onClick={() => setShowShortcutsDialog(false)} />
          <div className={styles.shortcutsDialog} role="dialog" aria-label="Keyboard Shortcuts">
            <div className={styles.shortcutsHeader}>
              <h3 className={styles.saveAsTitle}>Keyboard Shortcuts</h3>
              <button
                className={styles.shortcutsClose}
                aria-label="Close"
                onClick={() => setShowShortcutsDialog(false)}
              >
                &times;
              </button>
            </div>
            <div className={styles.shortcutsContent}>
              {SHORTCUT_GROUPS.map((group) => (
                <section key={group.title} className={styles.shortcutsGroup}>
                  <h4 className={styles.shortcutsCategoryTitle}>{group.title}</h4>
                  {group.entries.map((entry) => (
                    <ShortcutRow key={`${entry.keys.join()} ${entry.label}`} entry={entry} />
                  ))}
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      {/* About Dialog */}
      {showAboutDialog && (
        <>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div className={styles.saveAsOverlay} onClick={() => setShowAboutDialog(false)} />
          <div className={styles.saveAsDialog} role="dialog" aria-label="About">
            <h3 className={styles.saveAsTitle}>About Quar Animator</h3>
            <p className={styles.aboutText}>Free, open-source, web-native 2D animation platform.</p>
            <p className={styles.aboutText}>
              Part of the QUAR Suite — alongside Quar Editor (3D) and Quar Vector (2D illustration).
            </p>
            <p className={styles.aboutVersion}>Version 0.14.0</p>
            <div className={styles.saveAsActions}>
              <button className={styles.saveAsConfirm} onClick={() => setShowAboutDialog(false)}>
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ============================================================================
// Shortcut Row Helper
// ============================================================================

const JOINERS: Record<NonNullable<ShortcutEntry['join']>, string> = {
  or: ' or ',
  '/': ' / ',
  ' ': ' ',
};

function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
  const joiner = JOINERS[entry.join ?? 'or'];
  // Keys a Mac prints alike (Delete and Backspace are both ⌫) are shown once
  const shown = [...new Set(entry.keys.map((keys) => formatShortcut(keys)))];
  return (
    <div className={styles.shortcutRow} data-testid="shortcut-row">
      <span className={styles.shortcutLabel} data-testid="shortcut-label">
        {entry.label}
      </span>
      <span className={styles.shortcutKeys} data-testid="shortcut-keys">
        {shown.map((keys, index) => (
          <span key={keys}>
            {index > 0 && <span className={styles.shortcutJoiner}>{joiner}</span>}
            <kbd className={styles.shortcutKbd}>{keys}</kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

export default MenuBar;
