/**
 * MenuBar Component for Quar Animator
 * Application menu bar with File menu dropdown and project name display
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectName, useIsDirty } from '../../stores/editorStore';
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
  const [showProjectList, setShowProjectList] = useState(false);
  const [showSaveAsPrompt, setShowSaveAsPrompt] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);

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
              onClick={() => setFileMenuOpen(!fileMenuOpen)}
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
              </div>
            )}
          </div>
          <button className={styles.menuItem}>Edit</button>
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
