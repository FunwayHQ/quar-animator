/**
 * Projects Landing Page for Quar Animator
 * Displays saved projects as a grid with create/import/delete actions
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Trash2, Film, Moon, Sun } from 'lucide-react';
import { parseQuarFile, writeQuarFile } from '@quar/core';
import {
  listProjects,
  deleteProject as dbDelete,
  saveProject as dbSave,
  loadProject as dbLoad,
} from '../services/projectStorage';
import { ProjectFileCancelledError, uploadProjectFile } from '../services/projectSerializer';
import { videoFilesIn } from '../services/videoData';
import { useEditorStore } from '../stores/editorStore';
import { toast } from '../components/common/Toast';
import { setUiTheme, useUiTheme } from '../hooks/useUiTheme';
import { useProjectThumbnails } from '../hooks/useProjectThumbnails';
import { seedTutorials } from '../tutorials/seedTutorials';
import { isTutorialId, tutorialOrder } from '../tutorials/tutorials';
import type { ThumbnailView } from '../hooks/useProjectThumbnails';
import type { ProjectListItem } from '../services/projectStorage';
import { BetaBadge } from '../components/common/BetaBadge';
import styles from './Projects.module.css';
import { SocialLinks } from '../components/common/SocialLinks';
import { PRIVACY_URL, TERMS_URL } from '../components/common/legalLinks';
import { QuarLogo } from '../components/common/QuarLogo';
import { helpUrl } from '../components/help/helpPanel';

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

/** A project's picture, or the placeholder until it has one. */
function CardThumbnail({
  projectId,
  thumbnail,
}: {
  projectId: string;
  thumbnail: ThumbnailView | undefined;
}) {
  if (!thumbnail) return <Film size={32} />;
  return (
    <img
      src={thumbnail.url}
      alt=""
      draggable={false}
      className={`${styles.thumbnail} ${
        thumbnail.kind === 'artboard' ? styles.thumbnailArtboard : styles.thumbnailContent
      }`}
      // Loose artwork sits on the document's background, as in the editor
      style={
        thumbnail.kind === 'content' && thumbnail.background
          ? {
              background: `rgb(${thumbnail.background.r}, ${thumbnail.background.g}, ${thumbnail.background.b})`,
            }
          : undefined
      }
      data-testid={`thumbnail-${projectId}`}
    />
  );
}

// ============================================================================
// Component
// ============================================================================

export function Projects() {
  const uiTheme = useUiTheme();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const thumbnails = useProjectThumbnails(projects);

  // Fetch project list on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // First visit (or new tutorials since): add them to the projects
        await seedTutorials().catch(() => undefined);
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
    // Reset ALL project-scoped state (not just the 4 header fields) so a stale
    // project's pages/symbols/timeline don't leak into the new one (F024).
    useEditorStore.getState().resetProject();
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
      if (!stored) throw new Error('Project not found');
      const data = parseQuarFile(stored.data);
      data.name = newName;
      await dbSave(renamingId, newName, writeQuarFile(data));
      setProjects((prev) => prev.map((p) => (p.id === renamingId ? { ...p, name: newName } : p)));
    } catch {
      toast.error('Could not rename project');
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
      // Persist the same binary format we use for regular saves. This keeps
      // imported image assets compact and exercises the normal load path.
      // Its videos' files are stored apart from it, as a save stores them.
      await dbSave(
        id,
        data.name,
        writeQuarFile(data as unknown as Record<string, unknown>),
        videoFilesIn(data)
      );
      navigate(`/editor?project=${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ProjectFileCancelledError) return;
      toast.error(error instanceof Error ? error.message : 'Failed to import project file');
    }
  }, [navigate]);

  // Tutorials get a section of their own, in course order
  const ownProjects = projects.filter((project) => !isTutorialId(project.id));
  const tutorialProjects = projects
    .filter((project) => isTutorialId(project.id))
    .sort((a, b) => tutorialOrder(a.id) - tutorialOrder(b.id));

  const renderCard = (project: ProjectListItem) => (
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
        <CardThumbnail projectId={project.id} thumbnail={thumbnails[project.id]} />
      </div>
      <div className={styles.cardInfo}>
        <div className={styles.cardMeta}>
          {renamingId === project.id ? (
            <input
              ref={renameInputRef}
              className={styles.renameInput}
              value={renameValue}
              maxLength={100}
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
  );

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
          <QuarLogo className={styles.logoImage} />
          <BetaBadge />
        </div>
        <div className={styles.headerActions}>
          <SocialLinks />
          <button
            className={styles.appearanceButton}
            onClick={() => setUiTheme(uiTheme === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${uiTheme === 'light' ? 'dark' : 'light'} appearance`}
            title={`Switch to ${uiTheme === 'light' ? 'dark' : 'light'} appearance`}
            data-testid="appearance-toggle"
          >
            {uiTheme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
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
              {ownProjects.map(renderCard)}
            </div>

            {tutorialProjects.length > 0 && (
              <>
                <h2 className={`${styles.sectionTitle} ${styles.tutorialsTitle}`}>Tutorials</h2>
                <div className={styles.grid} data-testid="tutorials-grid">
                  {tutorialProjects.map(renderCard)}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <footer className={styles.footer}>
        <a href={helpUrl()} target="_blank" rel="noopener noreferrer" data-testid="user-guide-link">
          User Guide
        </a>
        <span aria-hidden="true">·</span>
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
        <span aria-hidden="true">·</span>
        <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">
          Terms of Service
        </a>
      </footer>
    </div>
  );
}

export default Projects;
