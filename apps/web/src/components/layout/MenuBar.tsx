/**
 * MenuBar Component for Quar Animator
 * Application menu bar with File menu dropdown and project name display
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
import styles from './MenuBar.module.css';

// ============================================================================
// Types
// ============================================================================

export interface MenuBarProps {
  projectActions?: ProjectActions;
}

// ============================================================================
// Component
// ============================================================================

export function MenuBar({ projectActions }: MenuBarProps) {
  const projectName = useProjectName();
  const isDirty = useIsDirty();
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [showSaveAsPrompt, setShowSaveAsPrompt] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const sceneGraph = useSceneGraph() as unknown as SceneGraphLike;
  const canUndo = useEditorStore((state) => state.canUndo);
  const canRedo = useEditorStore((state) => state.canRedo);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const clipboard = useEditorStore((state) => state.clipboard);
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

  // Computed flags for Convert to Path / Outline Stroke
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

  // Close file menu when clicking outside
  useEffect(() => {
    if (!fileMenuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        fileMenuRef.current &&
        !fileMenuRef.current.contains(e.target as HTMLElement) &&
        fileButtonRef.current &&
        !fileButtonRef.current.contains(e.target as HTMLElement)
      ) {
        setFileMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFileMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [fileMenuOpen]);

  // Close edit menu when clicking outside
  useEffect(() => {
    if (!editMenuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        editMenuRef.current &&
        !editMenuRef.current.contains(e.target as HTMLElement) &&
        editButtonRef.current &&
        !editButtonRef.current.contains(e.target as HTMLElement)
      ) {
        setEditMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [editMenuOpen]);

  // File menu actions
  const handleNew = useCallback(() => {
    setFileMenuOpen(false);
    if (!projectActions) return;
    projectActions.newProject();
  }, [projectActions]);

  const handleOpen = useCallback(async () => {
    setFileMenuOpen(false);
    if (!projectActions) return;
    const list = await projectActions.listProjects();
    setProjects(list);
    setShowProjectList(true);
  }, [projectActions]);

  const handleSave = useCallback(() => {
    setFileMenuOpen(false);
    if (!projectActions) return;
    void projectActions.saveProject();
  }, [projectActions]);

  const handleSaveAs = useCallback(() => {
    setFileMenuOpen(false);
    setSaveAsName(projectName);
    setShowSaveAsPrompt(true);
  }, [projectName]);

  const handleSaveAsConfirm = useCallback(() => {
    if (!projectActions || !saveAsName.trim()) return;
    setShowSaveAsPrompt(false);
    void projectActions.saveProjectAs(saveAsName.trim());
  }, [projectActions, saveAsName]);

  const handleDownload = useCallback(() => {
    setFileMenuOpen(false);
    if (!projectActions) return;
    projectActions.downloadProject();
  }, [projectActions]);

  const handleImport = useCallback(() => {
    setFileMenuOpen(false);
    if (!projectActions) return;
    void projectActions.importProject();
  }, [projectActions]);

  const handleImportSvg = useCallback(() => {
    setFileMenuOpen(false);
    if (!projectActions) return;
    projectActions.importSvg();
  }, [projectActions]);

  const handleImportImage = useCallback(() => {
    setFileMenuOpen(false);
    if (!projectActions) return;
    projectActions.importImage();
  }, [projectActions]);

  // Project list dialog actions
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

  return (
    <>
      <header className={styles.menuBar}>
        <div className={styles.logo}>
          <img src="/logo.svg" alt="Quar Animator" className={styles.logoImage} />
        </div>

        <nav className={styles.menus}>
          <div className={styles.menuContainer}>
            <button
              ref={fileButtonRef}
              className={`${styles.menuItem} ${fileMenuOpen ? styles.active : ''}`}
              onClick={() => {
                setFileMenuOpen(!fileMenuOpen);
                setEditMenuOpen(false);
              }}
              data-testid="menu-file"
            >
              File
            </button>
            {fileMenuOpen && (
              <div
                ref={fileMenuRef}
                className={styles.dropdown}
                role="menu"
                data-testid="file-menu-dropdown"
              >
                <button className={styles.dropdownItem} role="menuitem" onClick={handleNew}>
                  <span className={styles.dropdownLabel}>New Project</span>
                  <span className={styles.dropdownShortcut}>Ctrl+N</span>
                </button>
                <button
                  className={styles.dropdownItem}
                  role="menuitem"
                  onClick={() => void handleOpen()}
                >
                  <span className={styles.dropdownLabel}>Open Project...</span>
                  <span className={styles.dropdownShortcut}>Ctrl+O</span>
                </button>
                <div className={styles.dropdownSeparator} role="separator" />
                <button className={styles.dropdownItem} role="menuitem" onClick={handleSave}>
                  <span className={styles.dropdownLabel}>Save</span>
                  <span className={styles.dropdownShortcut}>Ctrl+S</span>
                </button>
                <button className={styles.dropdownItem} role="menuitem" onClick={handleSaveAs}>
                  <span className={styles.dropdownLabel}>Save As...</span>
                  <span className={styles.dropdownShortcut}>Ctrl+Shift+S</span>
                </button>
                <div className={styles.dropdownSeparator} role="separator" />
                <button className={styles.dropdownItem} role="menuitem" onClick={handleDownload}>
                  <span className={styles.dropdownLabel}>Download as .quar</span>
                </button>
                <button className={styles.dropdownItem} role="menuitem" onClick={handleImport}>
                  <span className={styles.dropdownLabel}>Import .quar...</span>
                </button>
                <button className={styles.dropdownItem} role="menuitem" onClick={handleImportSvg}>
                  <span className={styles.dropdownLabel}>Import SVG...</span>
                  <span className={styles.dropdownShortcut}>Ctrl+I</span>
                </button>
                <button className={styles.dropdownItem} role="menuitem" onClick={handleImportImage}>
                  <span className={styles.dropdownLabel}>Import Image...</span>
                </button>
              </div>
            )}
          </div>
          <div className={styles.menuContainer}>
            <button
              ref={editButtonRef}
              className={`${styles.menuItem} ${editMenuOpen ? styles.active : ''}`}
              onClick={() => {
                setEditMenuOpen(!editMenuOpen);
                setFileMenuOpen(false);
              }}
              data-testid="menu-edit"
            >
              Edit
            </button>
            {editMenuOpen && (
              <div
                ref={editMenuRef}
                className={styles.dropdown}
                role="menu"
                data-testid="edit-menu-dropdown"
              >
                <button
                  className={`${styles.dropdownItem} ${!canUndo ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    undoAction(sceneGraph);
                  }}
                  disabled={!canUndo}
                >
                  <span className={styles.dropdownLabel}>Undo</span>
                  <span className={styles.dropdownShortcut}>Ctrl+Z</span>
                </button>
                <button
                  className={`${styles.dropdownItem} ${!canRedo ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    redoAction(sceneGraph);
                  }}
                  disabled={!canRedo}
                >
                  <span className={styles.dropdownLabel}>Redo</span>
                  <span className={styles.dropdownShortcut}>Ctrl+Shift+Z</span>
                </button>
                <div className={styles.dropdownSeparator} role="separator" />
                <button
                  className={`${styles.dropdownItem} ${selectedNodeIds.size === 0 ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    cutSelectionAction(sceneGraph);
                  }}
                  disabled={selectedNodeIds.size === 0}
                >
                  <span className={styles.dropdownLabel}>Cut</span>
                  <span className={styles.dropdownShortcut}>Ctrl+X</span>
                </button>
                <button
                  className={`${styles.dropdownItem} ${selectedNodeIds.size === 0 ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    copySelectionAction(sceneGraph);
                  }}
                  disabled={selectedNodeIds.size === 0}
                >
                  <span className={styles.dropdownLabel}>Copy</span>
                  <span className={styles.dropdownShortcut}>Ctrl+C</span>
                </button>
                <button
                  className={`${styles.dropdownItem} ${!clipboard ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    pasteClipboardAction(sceneGraph);
                  }}
                  disabled={!clipboard}
                >
                  <span className={styles.dropdownLabel}>Paste</span>
                  <span className={styles.dropdownShortcut}>Ctrl+V</span>
                </button>
                <button
                  className={`${styles.dropdownItem} ${selectedNodeIds.size === 0 ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    duplicateSelectionAction(sceneGraph);
                  }}
                  disabled={selectedNodeIds.size === 0}
                >
                  <span className={styles.dropdownLabel}>Duplicate</span>
                  <span className={styles.dropdownShortcut}>Ctrl+D</span>
                </button>
                <div className={styles.dropdownSeparator} role="separator" />
                <button
                  className={`${styles.dropdownItem} ${selectedNodeIds.size === 0 ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    deleteSelectionAction(sceneGraph);
                  }}
                  disabled={selectedNodeIds.size === 0}
                >
                  <span className={styles.dropdownLabel}>Delete</span>
                  <span className={styles.dropdownShortcut}>Del</span>
                </button>
                <button
                  className={styles.dropdownItem}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    selectAllAction(sceneGraph);
                  }}
                >
                  <span className={styles.dropdownLabel}>Select All</span>
                  <span className={styles.dropdownShortcut}>Ctrl+A</span>
                </button>
                <div className={styles.dropdownSeparator} role="separator" />
                <button
                  className={`${styles.dropdownItem} ${!hasTextSelected ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    convertTextToPathAction(sceneGraph);
                  }}
                  disabled={!hasTextSelected}
                >
                  <span className={styles.dropdownLabel}>Convert to Path</span>
                  <span className={styles.dropdownShortcut}>Ctrl+Shift+P</span>
                </button>
                <button
                  className={`${styles.dropdownItem} ${!hasStrokeSelected ? styles.dropdownItemDisabled : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setEditMenuOpen(false);
                    outlineStrokeAction(sceneGraph);
                  }}
                  disabled={!hasStrokeSelected}
                >
                  <span className={styles.dropdownLabel}>Outline Stroke</span>
                  <span className={styles.dropdownShortcut}>Ctrl+Shift+O</span>
                </button>
              </div>
            )}
          </div>
          <button className={styles.menuItem}>View</button>
          <button className={styles.menuItem}>Animation</button>
          <button className={styles.menuItem}>Rigging</button>
          <button className={styles.menuItem}>Export</button>
          <button className={styles.menuItem}>Help</button>
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
    </>
  );
}

export default MenuBar;
