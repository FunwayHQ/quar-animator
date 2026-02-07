/**
 * Project List Dialog for Quar Animator
 * Modal for browsing and opening saved projects
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, FolderOpen } from 'lucide-react';
import type { ProjectListItem } from '../../services/projectStorage';
import styles from './ProjectListDialog.module.css';

// ============================================================================
// Types
// ============================================================================

export interface ProjectListDialogProps {
  projects: ProjectListItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ProjectListDialog({ projects, onOpen, onDelete, onClose }: ProjectListDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Focus dialog on mount
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  // Format date for display
  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleDelete = useCallback(
    (id: string) => {
      if (pendingDeleteId === id) {
        onDelete(id);
        setPendingDeleteId(null);
      } else {
        setPendingDeleteId(id);
      }
    },
    [pendingDeleteId, onDelete]
  );

  return createPortal(
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className={styles.overlay} onClick={onClose} data-testid="project-dialog-overlay" />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-label="Open Project"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        data-testid="project-list-dialog"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Open Project</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className={styles.body}>
          {projects.length === 0 ? (
            <div className={styles.emptyState} data-testid="project-list-empty">
              <FolderOpen size={32} />
              <p>No saved projects yet</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {projects.map((project) => (
                <li key={project.id} className={styles.listItem}>
                  <button
                    className={styles.projectButton}
                    onClick={() => onOpen(project.id)}
                    data-testid={`project-item-${project.id}`}
                  >
                    <span className={styles.projectName}>{project.name}</span>
                    <span className={styles.projectDate}>{formatDate(project.updatedAt)}</span>
                  </button>
                  <button
                    className={`${styles.deleteButton} ${pendingDeleteId === project.id ? styles.deleteConfirm : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    aria-label={
                      pendingDeleteId === project.id
                        ? `Confirm delete ${project.name}`
                        : `Delete ${project.name}`
                    }
                    title={
                      pendingDeleteId === project.id ? 'Click again to confirm' : 'Delete project'
                    }
                    data-testid={`project-delete-${project.id}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

export default ProjectListDialog;
