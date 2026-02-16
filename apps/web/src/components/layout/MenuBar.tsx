/**
 * MenuBar Component for Quar Animator
 * Application menu bar with full dropdown menus and project name display
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  useEditorStore,
  useProjectName,
  useIsDirty,
  type SceneGraphLike,
} from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import type { ProjectActions } from '../../hooks/useProjectActions';
import type { ProjectListItem } from '../../services/projectStorage';
import { ProjectListDialog } from '../common/ProjectListDialog';
import type { SmartBoneAction } from '@quar/types';
import styles from './MenuBar.module.css';

// ============================================================================
// Types
// ============================================================================

export interface MenuBarProps {
  projectActions?: ProjectActions;
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
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles.dropdownCheck}>
        {checked != null ? (checked ? '\u2713' : '') : ''}
      </span>
      <span className={styles.dropdownLabel}>{label}</span>
      {shortcut && <span className={styles.dropdownShortcut}>{shortcut}</span>}
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

export function MenuBar({ projectActions }: MenuBarProps) {
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

  const sceneGraph = useSceneGraph() as unknown as SceneGraphLike;

  // --- Store hooks (all at top, before any early returns) ---
  const canUndo = useEditorStore((state) => state.canUndo);
  const canRedo = useEditorStore((state) => state.canRedo);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const clipboard = useEditorStore((state) => state.clipboard);
  const showRulers = useEditorStore((state) => state.showRulers);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const onionSkinEnabled = useEditorStore(
    (state: { onionSkin: { enabled: boolean } }) => state.onionSkin.enabled
  );
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const isLooping = useEditorStore((state) => state.isLooping);
  const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
  const currentFrame = useEditorStore((state) => state.currentFrame);
  const timelineDuration = useEditorStore((state) => state.timelineDuration);
  const activeTool = useEditorStore((state) => state.activeTool);

  // --- Store actions ---
  const undoAction = useEditorStore((state) => state.undo);
  const redoAction = useEditorStore((state) => state.redo);
  const cutSelectionAction = useEditorStore((state) => state.cutSelection);
  const copySelectionAction = useEditorStore((state) => state.copySelection);
  const pasteClipboardAction = useEditorStore((state) => state.pasteClipboard);
  const duplicateSelectionAction = useEditorStore((state) => state.duplicateSelection);
  const deleteSelectionAction = useEditorStore((state) => state.deleteSelection);
  const selectAllAction = useEditorStore((state) => state.selectAll);
  const convertTextToPathAction = useEditorStore((state) => state.convertTextToPath);
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
  const toggleSnapToGridAction = useEditorStore((state) => state.toggleSnapToGrid);
  const toggleOnionSkinAction = useEditorStore((state) => state.toggleOnionSkin);
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

  const hasTextSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.type === 'text';
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

  const hasBooleanGroupSelected = useMemo(() => {
    return Array.from(selectedNodeIds).some((id) => {
      const n = sceneGraph.getNode(id);
      return n && n.type === 'group' && (n as { booleanOp?: string }).booleanOp;
    });
  }, [selectedNodeIds, sceneGraph]);

  const hasBoneNodes = useMemo(() => {
    let found = false;
    sceneGraph.traverse((node: { type: string }) => {
      if (node.type === 'bone') {
        found = true;
        return false; // stop
      }
      return true;
    });
    return found;
  }, [sceneGraph]);

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
  const handleNew = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    projectActions.newProject();
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
    void projectActions.saveProject();
  }, [projectActions, closeMenu]);

  const handleSaveAs = useCallback(() => {
    closeMenu();
    setSaveAsName(projectName);
    setShowSaveAsPrompt(true);
  }, [projectName, closeMenu]);

  const handleSaveAsConfirm = useCallback(() => {
    if (!projectActions || !saveAsName.trim()) return;
    setShowSaveAsPrompt(false);
    void projectActions.saveProjectAs(saveAsName.trim());
  }, [projectActions, saveAsName]);

  const handleDownload = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    projectActions.downloadProject();
  }, [projectActions, closeMenu]);

  const handleImport = useCallback(() => {
    closeMenu();
    if (!projectActions) return;
    void projectActions.importProject();
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

  // --- Project list dialog actions ---
  const handleOpenProject = useCallback(
    async (id: string) => {
      setShowProjectList(false);
      if (!projectActions) return;
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
      <header className={styles.menuBar} ref={menuBarRef}>
        <div className={styles.logo}>
          <img src="/logo.svg" alt="Quar Animator" className={styles.logoImage} />
        </div>

        <nav className={styles.menus}>
          {/* ====== FILE MENU ====== */}
          <div className={styles.menuContainer}>
            {menuButton('file', 'File', 'menu-file')}
            {openMenu === 'file' && (
              <div className={styles.dropdown} role="menu" data-testid="file-menu-dropdown">
                <MenuItem label="New Project" shortcut="Ctrl+N" onClick={handleNew} />
                <MenuItem
                  label="Open Project..."
                  shortcut="Ctrl+O"
                  onClick={() => void handleOpen()}
                />
                <Separator />
                <MenuItem label="Save" shortcut="Ctrl+S" onClick={handleSave} />
                <MenuItem label="Save As..." shortcut="Ctrl+Shift+S" onClick={handleSaveAs} />
                <Separator />
                <MenuItem label="Download as .quar" onClick={handleDownload} />
                <MenuItem label="Import .quar..." onClick={handleImport} />
                <MenuItem label="Import SVG..." shortcut="Ctrl+I" onClick={handleImportSvg} />
                <MenuItem label="Import Image..." onClick={handleImportImage} />
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
                  shortcut="Ctrl+Z"
                  disabled={!canUndo}
                  onClick={() => {
                    closeMenu();
                    undoAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Redo"
                  shortcut="Ctrl+Shift+Z"
                  disabled={!canRedo}
                  onClick={() => {
                    closeMenu();
                    redoAction(sceneGraph);
                  }}
                />
                <Separator />
                <MenuItem
                  label="Cut"
                  shortcut="Ctrl+X"
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    cutSelectionAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Copy"
                  shortcut="Ctrl+C"
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    copySelectionAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Paste"
                  shortcut="Ctrl+V"
                  disabled={!clipboard}
                  onClick={() => {
                    closeMenu();
                    pasteClipboardAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Duplicate"
                  shortcut="Ctrl+D"
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    duplicateSelectionAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Delete"
                  shortcut="Del"
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    deleteSelectionAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Select All"
                  shortcut="Ctrl+A"
                  onClick={() => {
                    closeMenu();
                    selectAllAction(sceneGraph);
                  }}
                />
                <Separator />
                <SectionHeader label="Arrange" />
                <MenuItem
                  label="Group"
                  shortcut="Ctrl+G"
                  disabled={!hasMultipleSelected}
                  onClick={() => {
                    closeMenu();
                    groupSelectionAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Ungroup"
                  shortcut="Ctrl+Shift+G"
                  disabled={!hasGroupSelected}
                  onClick={() => {
                    closeMenu();
                    ungroupSelectionAction(sceneGraph);
                  }}
                />
                <Separator />
                <MenuItem
                  label="Bring Forward"
                  shortcut="Ctrl+]"
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    bringForwardAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Bring to Front"
                  shortcut="Ctrl+Shift+]"
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    bringToFrontAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Send Backward"
                  shortcut="Ctrl+["
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    sendBackwardAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Send to Back"
                  shortcut="Ctrl+Shift+["
                  disabled={!hasSelection}
                  onClick={() => {
                    closeMenu();
                    sendToBackAction(sceneGraph);
                  }}
                />
                <Separator />
                <SectionHeader label="Boolean" />
                <MenuItem
                  label="Union"
                  shortcut="Ctrl+Shift+U"
                  disabled={!hasMultipleSelected}
                  onClick={() => {
                    closeMenu();
                    booleanUnionAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Subtract"
                  shortcut="Ctrl+Shift+D"
                  disabled={!hasMultipleSelected}
                  onClick={() => {
                    closeMenu();
                    booleanSubtractAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Intersect"
                  shortcut="Ctrl+Shift+I"
                  disabled={!hasMultipleSelected}
                  onClick={() => {
                    closeMenu();
                    booleanIntersectAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Exclude"
                  shortcut="Ctrl+Shift+X"
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
                <SectionHeader label="Convert" />
                <MenuItem
                  label="Convert to Path"
                  shortcut="Ctrl+Shift+P"
                  disabled={!hasTextSelected}
                  onClick={() => {
                    closeMenu();
                    convertTextToPathAction(sceneGraph);
                  }}
                />
                <MenuItem
                  label="Outline Stroke"
                  shortcut="Ctrl+Shift+O"
                  disabled={!hasStrokeSelected}
                  onClick={() => {
                    closeMenu();
                    outlineStrokeAction(sceneGraph);
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
                  shortcut="Ctrl+="
                  onClick={() => {
                    closeMenu();
                    dispatchViewEvent(VIEW_EVENTS.ZOOM_IN);
                  }}
                />
                <MenuItem
                  label="Zoom Out"
                  shortcut="Ctrl+-"
                  onClick={() => {
                    closeMenu();
                    dispatchViewEvent(VIEW_EVENTS.ZOOM_OUT);
                  }}
                />
                <MenuItem
                  label="Zoom to 100%"
                  shortcut="Ctrl+1"
                  onClick={() => {
                    closeMenu();
                    dispatchViewEvent(VIEW_EVENTS.ZOOM_100);
                  }}
                />
                <MenuItem
                  label="Fit to Window"
                  shortcut="Ctrl+0"
                  onClick={() => {
                    closeMenu();
                    dispatchViewEvent(VIEW_EVENTS.FIT_TO_WINDOW);
                  }}
                />
                <Separator />
                <MenuItem
                  label="Show Rulers"
                  shortcut="Shift+R"
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
                  label="Onion Skinning"
                  shortcut="Shift+O"
                  checked={onionSkinEnabled}
                  onClick={() => {
                    closeMenu();
                    toggleOnionSkinAction();
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
                  shortcut="Space"
                  onClick={() => {
                    closeMenu();
                    setIsPlayingAction(!isPlaying);
                  }}
                />
                <Separator />
                <MenuItem
                  label="Previous Frame"
                  shortcut=","
                  disabled={isPlaying}
                  onClick={() => {
                    closeMenu();
                    if (currentFrame > 0) setCurrentFrameAction(currentFrame - 1);
                  }}
                />
                <MenuItem
                  label="Next Frame"
                  shortcut="."
                  disabled={isPlaying}
                  onClick={() => {
                    closeMenu();
                    if (currentFrame < timelineDuration - 1)
                      setCurrentFrameAction(currentFrame + 1);
                  }}
                />
                <MenuItem
                  label="Jump Backward 10"
                  shortcut="Shift+,"
                  disabled={isPlaying}
                  onClick={() => {
                    closeMenu();
                    setCurrentFrameAction(Math.max(0, currentFrame - 10));
                  }}
                />
                <MenuItem
                  label="Jump Forward 10"
                  shortcut="Shift+."
                  disabled={isPlaying}
                  onClick={() => {
                    closeMenu();
                    setCurrentFrameAction(Math.min(timelineDuration - 1, currentFrame + 10));
                  }}
                />
                <Separator />
                <MenuItem
                  label="Go to Start"
                  shortcut="Home"
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
                    setCurrentFrameAction(timelineDuration - 1);
                  }}
                />
                <Separator />
                <MenuItem
                  label="Loop Playback"
                  shortcut="L"
                  checked={isLooping}
                  onClick={() => {
                    closeMenu();
                    setIsLoopingAction(!isLooping);
                  }}
                />
                <MenuItem
                  label="Auto-Keyframe"
                  shortcut="K"
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
                  shortcut="J"
                  checked={activeTool === 'bone'}
                  onClick={() => {
                    closeMenu();
                    setActiveToolAction('bone');
                  }}
                />
                <MenuItem
                  label="Weight Paint Tool"
                  shortcut="W"
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
                    if (boneId) createSmartBoneActionStore(boneId);
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
                      if (action) removeSmartBoneActionStore((action as SmartBoneAction).id);
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
                    createVitruvianController();
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
                        vitruvianControllers[vitruvianControllers.length - 1].id
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
                      if (chain) removeDynamicChain(chain.id);
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
                <MenuItem label="Export as PNG Sequence..." disabled onClick={closeMenu} />
                <MenuItem label="Export as GIF..." disabled onClick={closeMenu} />
                <MenuItem label="Export as MP4..." disabled onClick={closeMenu} />
                <MenuItem label="Export as WebM..." disabled onClick={closeMenu} />
                <Separator />
                <MenuItem label="Export as Lottie JSON..." disabled onClick={closeMenu} />
                <MenuItem label="Export as Sprite Sheet..." disabled onClick={closeMenu} />
                <MenuItem label="Export as SVG..." disabled onClick={closeMenu} />
              </div>
            )}
          </div>

          {/* ====== HELP MENU ====== */}
          <div className={styles.menuContainer}>
            {menuButton('help', 'Help', 'menu-help')}
            {openMenu === 'help' && (
              <div className={styles.dropdown} role="menu" data-testid="help-menu-dropdown">
                <MenuItem
                  label="Keyboard Shortcuts"
                  onClick={() => {
                    closeMenu();
                    setShowShortcutsDialog(true);
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
                  label="Report Bug"
                  onClick={() => {
                    closeMenu();
                    window.open(
                      'https://github.com/niclas-AE/quar-animator/issues',
                      '_blank',
                      'noopener'
                    );
                  }}
                />
              </div>
            )}
          </div>
        </nav>

        <div className={styles.actions}>
          <span className={styles.projectNameDisplay} data-testid="project-name">
            {isDirty && <span className={styles.dirtyDot} data-testid="dirty-indicator" />}
            {projectName}
          </span>
        </div>
      </header>

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
                onClick={() => setShowShortcutsDialog(false)}
              >
                &times;
              </button>
            </div>
            <div className={styles.shortcutsContent}>
              <div className={styles.shortcutsColumn}>
                <h4 className={styles.shortcutsCategoryTitle}>Tools</h4>
                <ShortcutRow keys="V" label="Selection Tool" />
                <ShortcutRow keys="A" label="Direct Selection" />
                <ShortcutRow keys="H" label="Hand Tool" />
                <ShortcutRow keys="R" label="Rectangle" />
                <ShortcutRow keys="O" label="Ellipse" />
                <ShortcutRow keys="U" label="Polygon" />
                <ShortcutRow keys="S" label="Star" />
                <ShortcutRow keys="P" label="Pen" />
                <ShortcutRow keys="B" label="Brush" />
                <ShortcutRow keys="E" label="Eraser" />
                <ShortcutRow keys="T" label="Text" />
                <ShortcutRow keys="J" label="Bone" />
                <ShortcutRow keys="W" label="Weight Paint" />

                <h4 className={styles.shortcutsCategoryTitle}>View</h4>
                <ShortcutRow keys="Ctrl+=" label="Zoom In" />
                <ShortcutRow keys="Ctrl+-" label="Zoom Out" />
                <ShortcutRow keys="Ctrl+1" label="Zoom 100%" />
                <ShortcutRow keys="Ctrl+0" label="Fit to Window" />
                <ShortcutRow keys="Shift+R" label="Toggle Rulers" />
                <ShortcutRow keys="Shift+O" label="Onion Skinning" />
              </div>
              <div className={styles.shortcutsColumn}>
                <h4 className={styles.shortcutsCategoryTitle}>Edit</h4>
                <ShortcutRow keys="Ctrl+Z" label="Undo" />
                <ShortcutRow keys="Ctrl+Shift+Z" label="Redo" />
                <ShortcutRow keys="Ctrl+X" label="Cut" />
                <ShortcutRow keys="Ctrl+C" label="Copy" />
                <ShortcutRow keys="Ctrl+V" label="Paste" />
                <ShortcutRow keys="Ctrl+D" label="Duplicate" />
                <ShortcutRow keys="Ctrl+G" label="Group" />
                <ShortcutRow keys="Ctrl+Shift+G" label="Ungroup" />

                <h4 className={styles.shortcutsCategoryTitle}>Arrange</h4>
                <ShortcutRow keys="Ctrl+]" label="Bring Forward" />
                <ShortcutRow keys="Ctrl+Shift+]" label="Bring to Front" />
                <ShortcutRow keys="Ctrl+[" label="Send Backward" />
                <ShortcutRow keys="Ctrl+Shift+[" label="Send to Back" />

                <h4 className={styles.shortcutsCategoryTitle}>Animation</h4>
                <ShortcutRow keys="Space" label="Play / Pause" />
                <ShortcutRow keys="Home" label="Go to Start" />
                <ShortcutRow keys="End" label="Go to End" />
                <ShortcutRow keys=",  ." label="Prev / Next Frame" />
                <ShortcutRow keys="L" label="Toggle Loop" />
                <ShortcutRow keys="K" label="Auto-Keyframe" />
              </div>
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

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className={styles.shortcutRow}>
      <span className={styles.shortcutLabel}>{label}</span>
      <kbd className={styles.shortcutKbd}>{keys}</kbd>
    </div>
  );
}

export default MenuBar;
