/**
 * PageTabs Component
 * Horizontal tab bar for switching between pages (Figma-style)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { usePages, useActivePageId, useEditorStore } from '../../stores/editorStore';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import styles from './PageTabs.module.css';

export function PageTabs() {
  const pages = usePages();
  const activePageId = useActivePageId();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const sceneGraph = useSceneGraph();

  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    pageId: string;
    x: number;
    y: number;
  } | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);

  // Deleting a page destroys its scene immediately, so require a confirming
  // second click within 3s (mirrors Projects.tsx) (F014).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDeleteId) return;
    const t = setTimeout(() => setPendingDeleteId(null), 3000);
    return () => clearTimeout(t);
  }, [pendingDeleteId]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingPageId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPageId]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleSwitchPage = useCallback(
    (pageId: string) => {
      if (pageId === activePageId) return;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      useEditorStore.getState().switchPage(pageId, sceneGraph);
    },
    [activePageId, sceneGraph]
  );

  const handleAddPage = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    useEditorStore.getState().addPage(sceneGraph);
  }, [sceneGraph]);

  const handleDeletePage = useCallback(
    (pageId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      useEditorStore.getState().deletePage(pageId, sceneGraph);
    },
    [sceneGraph]
  );

  // First click arms deletion; a second click within 3s confirms it.
  const requestDeletePage = useCallback(
    (pageId: string) => {
      if (pendingDeleteId === pageId) {
        setPendingDeleteId(null);
        handleDeletePage(pageId);
      } else {
        setPendingDeleteId(pageId);
      }
    },
    [pendingDeleteId, handleDeletePage]
  );

  const handleStartRename = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;
      setRenamingPageId(pageId);
      setRenameValue(page.name);
      setContextMenu(null);
    },
    [pages]
  );

  const handleCommitRename = useCallback(() => {
    if (renamingPageId && renameValue.trim()) {
      useEditorStore.getState().renamePage(renamingPageId, renameValue.trim());
    }
    setRenamingPageId(null);
  }, [renamingPageId, renameValue]);

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      useEditorStore.getState().duplicatePage(pageId, sceneGraph);
      setContextMenu(null);
    },
    [sceneGraph]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, pageId: string) => {
    e.preventDefault();
    setContextMenu({ pageId, x: e.clientX, y: e.clientY });
  }, []);

  const handleDoubleClick = useCallback(
    (pageId: string) => {
      handleStartRename(pageId);
    },
    [handleStartRename]
  );

  return (
    <>
      <div className={styles.pageTabs} data-testid="page-tabs">
        {pages.map((page) => (
          <button
            key={page.id}
            className={`${styles.tab} ${page.id === activePageId ? styles.active : ''}`}
            onClick={() => handleSwitchPage(page.id)}
            onDoubleClick={() => handleDoubleClick(page.id)}
            onContextMenu={(e) => handleContextMenu(e, page.id)}
            data-testid={`page-tab-${page.id}`}
          >
            {renamingPageId === page.id ? (
              <input
                ref={renameInputRef}
                className={styles.renameInput}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleCommitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitRename();
                  if (e.key === 'Escape') setRenamingPageId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={styles.tabName}>{page.name}</span>
            )}
            {pages.length > 1 && (
              <span
                className={styles.tabClose}
                role="button"
                tabIndex={-1}
                title={pendingDeleteId === page.id ? 'Click again to delete page' : 'Delete page'}
                onClick={(e) => {
                  e.stopPropagation();
                  requestDeletePage(page.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    requestDeletePage(page.id);
                  }
                }}
                data-testid={`page-tab-close-${page.id}`}
              >
                <X size={12} />
              </span>
            )}
          </button>
        ))}
        <button
          className={styles.addButton}
          onClick={handleAddPage}
          title="Add page"
          data-testid="add-page-button"
        >
          <Plus size={14} />
        </button>
      </div>

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="page-context-menu"
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => handleStartRename(contextMenu.pageId)}
          >
            Rename
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => handleDuplicatePage(contextMenu.pageId)}
          >
            Duplicate
          </button>
          {pages.length > 1 && (
            <button
              className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
              onClick={() => {
                handleDeletePage(contextMenu.pageId);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </>
  );
}
