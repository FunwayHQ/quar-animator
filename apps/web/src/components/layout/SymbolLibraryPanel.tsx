/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, jsx-a11y/no-autofocus */
/**
 * Symbol Library Panel — lists all symbol definitions,
 * supports click-to-place, double-click-to-edit, right-click context menu.
 */

import { useState, useCallback } from 'react';
import type { SymbolDefinition, SymbolInstanceNode } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';
import styles from './SymbolLibraryPanel.module.css';

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

  // Count instances per symbol across the scene graph
  const getInstanceCount = useCallback(
    (symbolId: string): number => {
      let count = 0;
      sceneGraph.traverse((node) => {
        if (node.type === 'symbol-instance' && (node as SymbolInstanceNode).symbolId === symbolId) {
          count++;
        }
      });
      return count;
    },
    [sceneGraph]
  );

  const handleClick = useCallback(
    (symbolId: string) => {
      placeSymbolInstance(sceneGraph, symbolId);
    },
    [sceneGraph, placeSymbolInstance]
  );

  const handleDoubleClick = useCallback(
    (symbolId: string) => {
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

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          label: 'Edit Symbol',
          onClick: () => {
            enterSymbolEdit(contextMenu.symbolId, sceneGraph);
            setContextMenu(null);
          },
        },
        {
          label: 'Rename',
          onClick: () => {
            const sym = symbols.find((s) => s.id === contextMenu.symbolId);
            if (sym) handleRenameStart(sym);
            setContextMenu(null);
          },
        },
        { type: 'separator' as const },
        {
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
                onClick={() => handleClick(symbol.id)}
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
                <span className={styles.instanceCount}>{getInstanceCount(symbol.id)}</span>
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
