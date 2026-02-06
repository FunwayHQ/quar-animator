import { useState, useEffect, useCallback, useRef } from 'react';
import type { Node } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
import styles from './LayerPanel.module.css';

// ============================================================================
// Helper: map node type to display icon
// ============================================================================

function nodeTypeIcon(type: string): string {
  switch (type) {
    case 'group':
      return '\u{1F4C1}'; // folder
    case 'rectangle':
    case 'ellipse':
    case 'polygon':
      return '\u25FC'; // filled square
    case 'path':
      return '\u2669'; // path-like symbol
    default:
      return '\u25FC';
  }
}

// ============================================================================
// InlineRenameInput Component
// ============================================================================

function InlineRenameInput({
  initialName,
  onCommit,
}: {
  initialName: string;
  onCommit: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialName);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = useCallback(() => {
    const trimmed = value.trim();
    onCommit(trimmed || initialName);
  }, [value, initialName, onCommit]);

  return (
    <input
      ref={inputRef}
      className={styles.renameInput}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCommit(initialName);
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      data-testid="layer-rename-input"
    />
  );
}

// ============================================================================
// LayerRow Component
// ============================================================================

interface LayerRowProps {
  node: Node;
  depth: number;
  selected: boolean;
  isRenaming: boolean;
  onSelect: (id: string, shiftKey: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  onRenameCommit: (id: string, name: string) => void;
}

function LayerRow({
  node,
  depth,
  selected,
  isRenaming,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onContextMenu,
  onRenameCommit,
}: LayerRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- layer rows use click for selection, keyboard handled at panel level */}
      <div
        className={`${styles.layerRow} ${selected ? styles.selected : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={(e) => onSelect(node.id, e.shiftKey)}
        onContextMenu={(e) => onContextMenu(node.id, e)}
        data-testid={`layer-row-${node.id}`}
      >
        {hasChildren && (
          <button
            className={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
        <span className={styles.layerIcon}>{nodeTypeIcon(node.type)}</span>
        {isRenaming ? (
          <InlineRenameInput
            initialName={node.name}
            onCommit={(name) => onRenameCommit(node.id, name)}
          />
        ) : (
          <span className={styles.layerName}>{node.name}</span>
        )}
        <div className={styles.layerActions}>
          <button
            className={`${styles.actionButton} ${!node.visible ? styles.inactive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(node.id);
            }}
            title="Toggle visibility"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            className={`${styles.actionButton} ${node.locked ? styles.active : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(node.id);
            }}
            title="Toggle lock"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>
        </div>
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((childId) => (
          <LayerRowById
            key={childId}
            nodeId={childId}
            depth={depth + 1}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
            onContextMenu={onContextMenu}
            isRenaming={false}
            onRenameCommit={onRenameCommit}
          />
        ))}
    </>
  );
}

// Wrapper that resolves a child node by ID from SceneGraph
function LayerRowById({
  nodeId,
  depth,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onContextMenu,
  isRenaming,
  onRenameCommit,
}: {
  nodeId: string;
  depth: number;
  onSelect: (id: string, shiftKey: boolean) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  isRenaming: boolean;
  onRenameCommit: (id: string, name: string) => void;
}) {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const node = sceneGraph.getNode(nodeId);
  if (!node) return null;

  return (
    <LayerRow
      node={node}
      depth={depth}
      selected={selectedNodeIds.has(node.id)}
      isRenaming={isRenaming}
      onSelect={onSelect}
      onToggleVisibility={onToggleVisibility}
      onToggleLock={onToggleLock}
      onContextMenu={onContextMenu}
      onRenameCommit={onRenameCommit}
    />
  );
}

// ============================================================================
// LayerPanel Component
// ============================================================================

export function LayerPanel() {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const setSelection = useEditorStore((state) => state.setSelection);
  const addToSelection = useEditorStore((state) => state.addToSelection);
  const duplicateSelection = useEditorStore((state) => state.duplicateSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);

  // Track scene graph version to re-render when nodes change
  const [, setVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(
    null
  );
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);

  useEffect(() => {
    const increment = () => setVersion((v) => v + 1);
    const unsub1 = sceneGraph.on('nodeAdded', increment);
    const unsub2 = sceneGraph.on('nodeRemoved', increment);
    const unsub3 = sceneGraph.on('nodeChanged', increment);
    const unsub4 = sceneGraph.on('nodeMoved', increment);
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [sceneGraph]);

  const rootNodes = sceneGraph.getRootNodes();

  const handleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey) {
        addToSelection(id);
      } else {
        setSelection([id]);
      }
    },
    [setSelection, addToSelection]
  );

  const handleToggleVisibility = useCallback(
    (id: string) => {
      const node = sceneGraph.getNode(id);
      if (node) {
        sceneGraph.updateNode(id, { visible: !node.visible });
      }
    },
    [sceneGraph]
  );

  const handleToggleLock = useCallback(
    (id: string) => {
      const node = sceneGraph.getNode(id);
      if (node) {
        sceneGraph.updateNode(id, { locked: !node.locked });
      }
    },
    [sceneGraph]
  );

  const handleContextMenu = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Select the node if not already selected
      if (!selectedNodeIds.has(nodeId)) {
        setSelection([nodeId]);
      }
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    },
    [selectedNodeIds, setSelection]
  );

  const handleRenameCommit = useCallback(
    (id: string, name: string) => {
      sceneGraph.updateNode(id, { name });
      setRenamingNodeId(null);
    },
    [sceneGraph]
  );

  const contextMenuItems = useCallback((): ContextMenuEntry[] => {
    if (!contextMenu) return [];
    const nodeId = contextMenu.nodeId;
    const node = sceneGraph.getNode(nodeId);
    if (!node) return [];

    return [
      {
        id: 'rename',
        label: 'Rename',
        onClick: () => setRenamingNodeId(nodeId),
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        onClick: () => duplicateSelection(sceneGraph),
      },
      {
        id: 'delete',
        label: 'Delete',
        shortcut: 'Del',
        danger: true,
        onClick: () => deleteSelection(sceneGraph),
      },
      { type: 'separator' },
      {
        id: 'toggle-visibility',
        label: node.visible ? 'Hide' : 'Show',
        onClick: () => handleToggleVisibility(nodeId),
      },
      {
        id: 'toggle-lock',
        label: node.locked ? 'Unlock' : 'Lock',
        onClick: () => handleToggleLock(nodeId),
      },
    ];
  }, [
    contextMenu,
    sceneGraph,
    duplicateSelection,
    deleteSelection,
    handleToggleVisibility,
    handleToggleLock,
  ]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Layers</h3>
      </div>
      <div className={styles.content}>
        {rootNodes.length === 0 ? (
          <div className={styles.emptyState} data-testid="layer-empty">
            No layers yet
          </div>
        ) : (
          rootNodes.map((node) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              selected={selectedNodeIds.has(node.id)}
              isRenaming={renamingNodeId === node.id}
              onSelect={handleSelect}
              onToggleVisibility={handleToggleVisibility}
              onToggleLock={handleToggleLock}
              onContextMenu={handleContextMenu}
              onRenameCommit={handleRenameCommit}
            />
          ))
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default LayerPanel;
