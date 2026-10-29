/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, jsx-a11y/no-autofocus */
/**
 * Symbol Library Panel — lists all symbol definitions,
 * supports click-to-place, double-click-to-edit, right-click context menu.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SceneGraph } from '@quar/core';
import type { Node, SymbolDefinition } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { ContextMenu, type ContextMenuEntry } from '../common/ContextMenu';
import styles from './SymbolLibraryPanel.module.css';

/** How many instances of each symbol these layers hold. */
function countInstances(layers: Iterable<Node>, counts = new Map<string, number>()) {
  for (const node of layers) {
    if (node.type === 'symbol-instance')
      counts.set(node.symbolId, (counts.get(node.symbolId) ?? 0) + 1);
  }
  return counts;
}

/** The layers on the canvas now, every one of them. */
function canvasLayers(sceneGraph: SceneGraph): Node[] {
  const layers: Node[] = [];
  sceneGraph.traverse((node) => {
    layers.push(node);
  });
  return layers;
}

/**
 * The instances of each symbol on all the document's pages: the open page
 * as it is on the canvas (followed as layers come and go), the others as
 * they were left — while a symbol is edited, its page as it was left too.
 */
function useInstanceCounts(sceneGraph: SceneGraph): Map<string, number> {
  const [onCanvas, setOnCanvas] = useState(() => countInstances(canvasLayers(sceneGraph)));
  useEffect(() => {
    const recount = () => setOnCanvas(countInstances(canvasLayers(sceneGraph)));
    recount();
    // A page opened, or a project, replaces the whole graph at once (graphReplaced)
    const off = (['nodeAdded', 'nodeRemoved', 'graphReplaced'] as const).map((type) =>
      sceneGraph.on(type, recount)
    );
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [sceneGraph]);

  const pages = useEditorStore((state) => state.pages);
  const activePageId = useEditorStore((state) => state.activePageId);
  const editedPage = useEditorStore((state) => state.editingSymbolPrevState?.sceneData);
  return useMemo(() => {
    const counts = countInstances(editedPage ? editedPage.nodes : []);
    for (const page of pages) {
      if (page.id !== activePageId) countInstances(page.sceneGraphJSON.nodes, counts);
    }
    if (!editedPage) {
      for (const [symbolId, count] of onCanvas)
        counts.set(symbolId, (counts.get(symbolId) ?? 0) + count);
    }
    return counts;
  }, [onCanvas, pages, activePageId, editedPage]);
}

function InstanceCount({ count, symbolId }: { count: number; symbolId: string }) {
  const label = `${count} ${count === 1 ? 'instance' : 'instances'} on all pages`;
  return (
    <span
      className={styles.instanceCount}
      title={label}
      aria-label={label}
      data-testid={`symbol-count-${symbolId}`}
    >
      {count}
    </span>
  );
}

export default function SymbolLibraryPanel() {
  const sceneGraph = useSceneGraph();
  const symbols = useEditorStore((state) => state.symbols);
  const placeSymbolInstance = useEditorStore((state) => state.placeSymbolInstance);
  const enterSymbolEdit = useEditorStore((state) => state.enterSymbolEdit);
  const renameSymbol = useEditorStore((state) => state.renameSymbol);
  const deleteSymbol = useEditorStore((state) => state.deleteSymbol);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    symbolId: string;
  } | null>(null);

  const instanceCounts = useInstanceCounts(sceneGraph);

  // A double-click fires click, click, dblclick — debounce single-click
  // placement so a double-click (enter-edit) cancels the stray instance (F018).
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(
    (symbolId: string) => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        placeSymbolInstance(sceneGraph, symbolId);
      }, 250);
    },
    [sceneGraph, placeSymbolInstance]
  );

  const handleDoubleClick = useCallback(
    (symbolId: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      enterSymbolEdit(symbolId, sceneGraph);
    },
    [sceneGraph, enterSymbolEdit]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, symbolId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, symbolId });
  }, []);

  const handleRenameStart = useCallback((symbol: SymbolDefinition) => {
    setRenamingId(symbol.id);
    setRenameValue(symbol.name);
  }, []);

  const handleRenameCommit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameSymbol(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renameSymbol]);

  const contextMenuItems: ContextMenuEntry[] = contextMenu
    ? [
        {
          id: 'edit-symbol',
          label: 'Edit Symbol',
          onClick: () => {
            enterSymbolEdit(contextMenu.symbolId, sceneGraph);
            setContextMenu(null);
          },
        },
        {
          id: 'rename-symbol',
          label: 'Rename',
          onClick: () => {
            const sym = symbols.find((s) => s.id === contextMenu.symbolId);
            if (sym) handleRenameStart(sym);
            setContextMenu(null);
          },
        },
        { type: 'separator' as const },
        {
          id: 'delete-symbol',
          label: 'Delete Symbol',
          danger: true,
          onClick: () => {
            deleteSymbol(contextMenu.symbolId, sceneGraph);
            setContextMenu(null);
          },
        },
      ]
    : [];

  return (
    <div className={styles.panel} data-testid="symbol-library-panel">
      <div className={styles.header}>
        <h3 className={styles.title}>Symbols</h3>
      </div>
      <div className={styles.content}>
        {symbols.length === 0 ? (
          <div className={styles.emptyState} data-testid="symbol-empty-state">
            No symbols yet. Select objects and use Edit &gt; Create Symbol.
          </div>
        ) : (
          <div className={styles.symbolList}>
            {symbols.map((symbol) => (
              <div
                key={symbol.id}
                className={styles.symbolItem}
                role="button"
                tabIndex={0}
                title="Click to place an instance, double-click to edit"
                onClick={() => handleClick(symbol.id)}
                onKeyDown={(e) => {
                  // Enter or Space places an instance (not keys typed while renaming)
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    placeSymbolInstance(sceneGraph, symbol.id);
                  }
                }}
                onDoubleClick={() => handleDoubleClick(symbol.id)}
                onContextMenu={(e) => handleContextMenu(e, symbol.id)}
                data-testid={`symbol-item-${symbol.id}`}
              >
                <span className={styles.symbolIcon}>{'\u25C7'}</span>
                {renamingId === symbol.id ? (
                  <input
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRenameCommit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameCommit();
                      if (e.key === 'Escape') {
                        setRenamingId(null);
                        setRenameValue('');
                      }
                    }}
                    autoFocus
                    data-testid="symbol-rename-input"
                  />
                ) : (
                  <span className={styles.symbolName}>{symbol.name}</span>
                )}
                <InstanceCount count={instanceCounts.get(symbol.id) ?? 0} symbolId={symbol.id} />
              </div>
            ))}
          </div>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
