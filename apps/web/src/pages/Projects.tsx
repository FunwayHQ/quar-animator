/**
 * Projects Landing Page for Quar Animator
 * Displays saved projects as a grid with create/import/delete actions
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Trash2, Film } from 'lucide-react';
import {
  listProjects,
  deleteProject as dbDelete,
  saveProject as dbSave,
  loadProject as dbLoad,
} from '../services/projectStorage';
import { uploadProjectFile } from '../services/projectSerializer';
import { useEditorStore } from '../stores/editorStore';
import type { ProjectListItem } from '../services/projectStorage';
import styles from './Projects.module.css';

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================================
// Component
// ============================================================================

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Fetch project list on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await listProjects();
        if (!cancelled) {
          setProjects(list);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear pending delete when clicking elsewhere
  useEffect(() => {
    if (!pendingDeleteId) return;
    const timer = setTimeout(() => setPendingDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [pendingDeleteId]);

  const handleNewProject = useCallback(() => {
    // Reset store to fresh state — editor will start clean
    useEditorStore.setState({
      projectId: null,
      projectName: 'Untitled Project',
      isDirty: false,
      projectCreatedAt: null,
    });
    navigate('/editor');
  }, [navigate]);

  const handleOpenProject = useCallback(
    (id: string) => {
      navigate(`/editor?project=${encodeURIComponent(id)}`);
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (pendingDeleteId === id) {
        // Second click — confirm delete
        await dbDelete(id);
        setProjects((prev) => prev.filter((p) => p.id !== id));
        setPendingDeleteId(null);
      } else {
        setPendingDeleteId(id);
      }
    },
    [pendingDeleteId]
  );

  const handleRenameStart = useCallback((e: React.MouseEvent, project: ProjectListItem) => {
    e.stopPropagation();
    setRenamingId(project.id);
    setRenameValue(project.name);
    // Focus will happen via useEffect below
  }, []);

  const handleRenameCommit = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const newName = renameValue.trim();
    // Update in IndexedDB: load project data, re-save with new name
    try {
      const stored = await dbLoad(renamingId);
      if (stored) {
        const data = JSON.parse(stored.data);
        data.name = newName;
        await dbSave(renamingId, newName, JSON.stringify(data));
        setProjects((prev) =>
          prev.map((p) => (p.id === renamingId ? { ...p, name: newName } : p))
        );
      }
    } catch {
      // Silently fail rename
    }
    setRenamingId(null);
  }, [renamingId, renameValue]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        void handleRenameCommit();
      } else if (e.key === 'Escape') {
        setRenamingId(null);
      }
    },
    [handleRenameCommit]
  );

  // Auto-focus rename input
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleImport = useCallback(async () => {
    try {
      const data = await uploadProjectFile();
      // Store imported data temporarily and navigate to editor
      const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Save to IndexedDB so editor can load it
      const { saveProject } = await import('../services/projectStorage');
      const json = JSON.stringify(data);
      await saveProject(id, data.name, json);
      navigate(`/editor?project=${encodeURIComponent(id)}`);
    } catch {
      // User cancelled or invalid file — silently ignore
    }
  }, [navigate]);

  if (loading) {
    return (
      <div className={styles.page} data-testid="projects-page">
        <div className={styles.content} />
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="projects-page">
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src="/logo.svg" alt="" className={styles.logoImage} />
          <span className={styles.appName}>Quar Animator</span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.importButton}
            onClick={() => void handleImport()}
            data-testid="import-button"
          >
            <Upload size={14} />
            Import .quar
          </button>
        </div>
      </header>

      {/* Content */}
      <div className={styles.content}>
        {projects.length === 0 ? (
          /* Empty state */
          <div className={styles.emptyState} data-testid="empty-state">
            <Film size={48} />
            <p>No projects yet. Create your first animation or import an existing .quar file.</p>
            <button
              className={styles.emptyCtaButton}
              onClick={handleNewProject}
              data-testid="empty-new-button"
            >
              <Plus size={16} />
              New Project
            </button>
          </div>
        ) : (
          <>
            <h2 className={styles.sectionTitle}>Your Projects</h2>
            <div className={styles.grid} data-testid="projects-grid">
              {/* New project card */}
              <button
                className={styles.newCard}
                onClick={handleNewProject}
                data-testid="new-project-card"
              >
                <div className={styles.newCardIcon}>
                  <Plus size={24} />
                </div>
                <span className={styles.newCardLabel}>New Project</span>
              </button>

              {/* Existing project cards */}
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={styles.card}
                  onClick={() => handleOpenProject(project.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenProject(project.id);
                    }
                  }}
                  data-testid={`project-card-${project.id}`}
                >
                  <div className={styles.cardThumbnail}>
                    <Film size={32} />
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardMeta}>
                      {renamingId === project.id ? (
                        <input
                          ref={renameInputRef}
                          className={styles.renameInput}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void handleRenameCommit()}
                          onKeyDown={handleRenameKeyDown}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`rename-input-${project.id}`}
                        />
                      ) : (
                        <div
                          className={styles.cardName}
                          onDoubleClick={(e) => handleRenameStart(e, project)}
                          title="Double-click to rename"
                        >
                          {project.name}
                        </div>
                      )}
                      <div className={styles.cardDate}>{formatDate(project.updatedAt)}</div>
                    </div>
                    <button
                      className={`${styles.deleteButton} ${pendingDeleteId === project.id ? styles.deleteConfirm : ''}`}
                      onClick={(e) => void handleDelete(e, project.id)}
                      aria-label={
                        pendingDeleteId === project.id
                          ? `Confirm delete ${project.name}`
                          : `Delete ${project.name}`
                      }
                      title={pendingDeleteId === project.id ? 'Click again to confirm' : 'Delete'}
                      data-testid={`delete-${project.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Projects;
