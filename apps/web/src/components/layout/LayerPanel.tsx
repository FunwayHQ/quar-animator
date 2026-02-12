import { useState, useEffect, useCallback, useRef } from 'react';
import type { Node, GroupNode } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { ContextMenu } from '../common/ContextMenu';
import type { ContextMenuEntry } from '../common/ContextMenu';
import styles from './LayerPanel.module.css';

// ============================================================================
// Constants
// ============================================================================

const DRAG_THRESHOLD_PX = 5;

// ============================================================================
// Types
// ============================================================================

type DropPosition = 'before' | 'after' | 'inside';

interface DropTarget {
  nodeId: string;
  position: DropPosition;
}

// ============================================================================
// Helper: map node type to display icon
// ============================================================================

function nodeTypeIcon(type: string, node?: Node): string {
  switch (type) {
    case 'group': {
      const booleanOp = node ? (node as GroupNode).booleanOp : undefined;
      if (booleanOp) {
        switch (booleanOp) {
          case 'union':
            return '\u222A'; // ∪
          case 'subtract':
            return '\u2216'; // ∖
          case 'intersect':
            return '\u2229'; // ∩
          case 'exclude':
            return '\u2295'; // ⊕
        }
      }
      return '\u{1F4C1}'; // folder
    }
    case 'rectangle':
    case 'ellipse':
    case 'polygon':
      return '\u25FC'; // filled square
    case 'path':
      return '\u2669'; // path-like symbol
    case 'bone':
      return '\u22A5'; // ⊥ perpendicular symbol
    case 'ik-target':
      return '\u2295'; // ⊕ crosshair-like symbol
    default:
      return '\u25FC';
  }
}

// ============================================================================
// Helper: get top-level ancestors from selection (dedup children)
// ============================================================================

function getTopLevelDragIds(
  dragIds: string[],
  getNode: (id: string) => Node | undefined
): string[] {
  const dragSet = new Set(dragIds);
  return dragIds.filter((id) => {
    let node = getNode(id);
    while (node && node.parent) {
      if (dragSet.has(node.parent)) return false;
      node = getNode(node.parent);
    }
    return true;
  });
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
  isDragging: boolean;
  isEnteredGroup: boolean;
  dropTarget: DropTarget | null;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  onRenameCommit: (id: string, name: string) => void;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
}

function LayerRow({
  node,
  depth,
  selected,
  isRenaming,
  isDragging,
  isEnteredGroup,
  dropTarget,
  onSelect,
  onDoubleClick,
  onToggleVisibility,
  onToggleLock,
  onContextMenu,
  onRenameCommit,
  onPointerDown,
}: LayerRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const dropClass =
    dropTarget && dropTarget.nodeId === node.id
      ? dropTarget.position === 'before'
        ? styles.dropBefore
        : dropTarget.position === 'after'
          ? styles.dropAfter
          : styles.dropInside
      : '';

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- layer rows use click for selection, keyboard handled at panel level */}
      <div
        className={`${styles.layerRow} ${selected ? styles.selected : ''} ${isDragging ? styles.dragging : ''} ${isEnteredGroup ? styles.enteredGroup : ''} ${dropClass}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        role="button"
        tabIndex={0}
        aria-label={`Layer: ${node.name}`}
        aria-pressed={selected}
        onClick={(e) => onSelect(node.id, e)}
        onDoubleClick={() => onDoubleClick(node.id)}
        onContextMenu={(e) => onContextMenu(node.id, e)}
        onPointerDown={(e) => onPointerDown(node.id, e)}
        data-testid={`layer-row-${node.id}`}
        data-layer-id={node.id}
      >
        {hasChildren ? (
          <button
            className={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={expanded ? 'Collapse group' : 'Expand group'}
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
        ) : depth > 0 ? (
          <span className={styles.expandSpacer} />
        ) : null}
        <span className={styles.layerIcon}>{nodeTypeIcon(node.type, node)}</span>
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
            onPointerDown={(e) => e.stopPropagation()}
            title="Toggle visibility"
            aria-label={node.visible ? 'Hide layer' : 'Show layer'}
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
            onPointerDown={(e) => e.stopPropagation()}
            title="Toggle lock"
            aria-label={node.locked ? 'Unlock layer' : 'Lock layer'}
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
        node.children.map((childId: string) => (
          <LayerRowById
            key={childId}
            nodeId={childId}
            depth={depth + 1}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
            onContextMenu={onContextMenu}
            isRenaming={false}
            onRenameCommit={onRenameCommit}
            onPointerDown={onPointerDown}
            draggedIds={isDragging ? new Set<string>() : null}
            dropTarget={dropTarget}
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
  onDoubleClick,
  onToggleVisibility,
  onToggleLock,
  onContextMenu,
  isRenaming,
  onRenameCommit,
  onPointerDown,
  draggedIds,
  dropTarget,
}: {
  nodeId: string;
  depth: number;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  isRenaming: boolean;
  onRenameCommit: (id: string, name: string) => void;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  draggedIds: Set<string> | null;
  dropTarget: DropTarget | null;
}) {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const enteredGroupId = useEditorStore((state) => state.enteredGroupId);
  const node = sceneGraph.getNode(nodeId);
  if (!node) return null;

  return (
    <LayerRow
      node={node}
      depth={depth}
      selected={selectedNodeIds.has(node.id)}
      isRenaming={isRenaming}
      isDragging={draggedIds !== null && draggedIds.has(node.id)}
      isEnteredGroup={enteredGroupId === node.id}
      dropTarget={dropTarget}
      onSelect={onSelect}
      onDoubleClick={onDoubleClick}
      onToggleVisibility={onToggleVisibility}
      onToggleLock={onToggleLock}
      onContextMenu={onContextMenu}
      onRenameCommit={onRenameCommit}
      onPointerDown={onPointerDown}
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
  const toggleSelection = useEditorStore((state) => state.toggleSelection);
  const selectRange = useEditorStore((state) => state.selectRange);
  const duplicateSelection = useEditorStore((state) => state.duplicateSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const groupSelection = useEditorStore((state) => state.groupSelection);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const bringForward = useEditorStore((state) => state.bringForward);
  const sendBackward = useEditorStore((state) => state.sendBackward);
  const bringToFront = useEditorStore((state) => state.bringToFront);
  const sendToBack = useEditorStore((state) => state.sendToBack);
  const enteredGroupId = useEditorStore((state) => state.enteredGroupId);
  const enterGroup = useEditorStore((state) => state.enterGroup);

  // Track scene graph version to re-render when nodes change
  const [, setVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(
    null
  );
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);

  // Drag-and-drop state
  const [dragState, setDragState] = useState<{
    active: boolean;
    draggedIds: Set<string>;
    startX: number;
    startY: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Ref to track whether drag was initiated (prevents click from firing after drag)
  const didDragRef = useRef(false);

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

  // ========================================================================
  // Selection handlers
  // ========================================================================

  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      // Don't select if we just finished a drag
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        toggleSelection(id);
      } else if (e.shiftKey) {
        selectRange(id, sceneGraph);
      } else {
        setSelection([id]);
      }
    },
    [setSelection, toggleSelection, selectRange, sceneGraph]
  );

  const handleDoubleClick = useCallback(
    (id: string) => {
      const node = sceneGraph.getNode(id);
      if (node && node.type === 'group') {
        enterGroup(id);
      }
    },
    [sceneGraph, enterGroup]
  );

  const pushUndo = useEditorStore((state) => state.pushUndo);

  const handleToggleVisibility = useCallback(
    (id: string) => {
      const node = sceneGraph.getNode(id);
      if (node) {
        pushUndo(sceneGraph);
        sceneGraph.updateNode(id, { visible: !node.visible });
      }
    },
    [sceneGraph, pushUndo]
  );

  const handleToggleLock = useCallback(
    (id: string) => {
      const node = sceneGraph.getNode(id);
      if (node) {
        pushUndo(sceneGraph);
        sceneGraph.updateNode(id, { locked: !node.locked });
      }
    },
    [sceneGraph, pushUndo]
  );

  // ========================================================================
  // Context menu
  // ========================================================================

  const handleContextMenu = useCallback(
    (nodeId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // If right-clicked node is NOT in selection, replace selection
      if (!selectedNodeIds.has(nodeId)) {
        setSelection([nodeId]);
      }
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
    },
    [selectedNodeIds, setSelection]
  );

  const handleRenameCommit = useCallback(
    (id: string, name: string) => {
      pushUndo(sceneGraph);
      sceneGraph.updateNode(id, { name });
      setRenamingNodeId(null);
    },
    [sceneGraph, pushUndo]
  );

  const contextMenuItems = useCallback((): ContextMenuEntry[] => {
    if (!contextMenu) return [];
    const nodeId = contextMenu.nodeId;
    const node = sceneGraph.getNode(nodeId);
    if (!node) return [];

    const count = selectedNodeIds.size;
    const isMulti = count > 1;

    if (isMulti) {
      // Batch context menu for multi-selection
      // Determine majority visibility/lock state
      const selectedNodes: Node[] = [];
      for (const id of selectedNodeIds) {
        const n = sceneGraph.getNode(id);
        if (n) selectedNodes.push(n);
      }
      const allVisible = selectedNodes.every((n) => n.visible);
      const allLocked = selectedNodes.every((n) => n.locked);
      const hasGroup = selectedNodes.some((n) => n.type === 'group');

      return [
        {
          id: 'rename',
          label: 'Rename',
          disabled: true,
          onClick: () => {},
        },
        {
          id: 'duplicate',
          label: `Duplicate ${count} Layers`,
          onClick: () => duplicateSelection(sceneGraph),
        },
        {
          id: 'delete',
          label: `Delete ${count} Layers`,
          shortcut: 'Del',
          danger: true,
          onClick: () => deleteSelection(sceneGraph),
        },
        { type: 'separator' },
        {
          id: 'group',
          label: `Group ${count} Layers`,
          shortcut: 'Ctrl+G',
          onClick: () => groupSelection(sceneGraph),
        },
        {
          id: 'ungroup',
          label: 'Ungroup',
          shortcut: 'Ctrl+Shift+G',
          disabled: !hasGroup,
          onClick: () => ungroupSelection(sceneGraph),
        },
        { type: 'separator' },
        {
          id: 'bring-to-front',
          label: 'Bring to Front',
          shortcut: 'Ctrl+Shift+]',
          onClick: () => bringToFront(sceneGraph),
        },
        {
          id: 'bring-forward',
          label: 'Bring Forward',
          shortcut: 'Ctrl+]',
          onClick: () => bringForward(sceneGraph),
        },
        {
          id: 'send-backward',
          label: 'Send Backward',
          shortcut: 'Ctrl+[',
          onClick: () => sendBackward(sceneGraph),
        },
        {
          id: 'send-to-back',
          label: 'Send to Back',
          shortcut: 'Ctrl+Shift+[',
          onClick: () => sendToBack(sceneGraph),
        },
        { type: 'separator' },
        {
          id: 'toggle-visibility',
          label: allVisible ? `Hide ${count} Layers` : `Show ${count} Layers`,
          onClick: () => {
            const newVisible = !allVisible;
            for (const id of selectedNodeIds) {
              sceneGraph.updateNode(id, { visible: newVisible });
            }
          },
        },
        {
          id: 'toggle-lock',
          label: allLocked ? `Unlock ${count} Layers` : `Lock ${count} Layers`,
          onClick: () => {
            const newLocked = !allLocked;
            for (const id of selectedNodeIds) {
              sceneGraph.updateNode(id, { locked: newLocked });
            }
          },
        },
      ];
    }

    // Single-selection context menu
    const isGroup = node.type === 'group';
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
        id: 'group',
        label: 'Group',
        shortcut: 'Ctrl+G',
        disabled: true,
        onClick: () => {},
      },
      {
        id: 'ungroup',
        label: 'Ungroup',
        shortcut: 'Ctrl+Shift+G',
        disabled: !isGroup,
        onClick: () => ungroupSelection(sceneGraph),
      },
      { type: 'separator' },
      {
        id: 'bring-to-front',
        label: 'Bring to Front',
        shortcut: 'Ctrl+Shift+]',
        onClick: () => bringToFront(sceneGraph),
      },
      {
        id: 'bring-forward',
        label: 'Bring Forward',
        shortcut: 'Ctrl+]',
        onClick: () => bringForward(sceneGraph),
      },
      {
        id: 'send-backward',
        label: 'Send Backward',
        shortcut: 'Ctrl+[',
        onClick: () => sendBackward(sceneGraph),
      },
      {
        id: 'send-to-back',
        label: 'Send to Back',
        shortcut: 'Ctrl+Shift+[',
        onClick: () => sendToBack(sceneGraph),
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
    selectedNodeIds,
    duplicateSelection,
    deleteSelection,
    groupSelection,
    ungroupSelection,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    handleToggleVisibility,
    handleToggleLock,
  ]);

  // ========================================================================
  // Drag-and-drop
  // ========================================================================

  const handlePointerDown = useCallback(
    (id: string, e: React.PointerEvent) => {
      // Only left button
      if (e.button !== 0) return;

      didDragRef.current = false;

      // Determine which nodes to drag
      let draggedIds: Set<string>;
      if (selectedNodeIds.has(id)) {
        // Drag all selected nodes
        draggedIds = new Set(selectedNodeIds);
      } else {
        // Drag only this node
        draggedIds = new Set([id]);
      }

      setDragState({
        active: false,
        draggedIds,
        startX: e.clientX,
        startY: e.clientY,
      });
    },
    [selectedNodeIds]
  );

  const hitTestDropTarget = useCallback(
    (clientY: number): DropTarget | null => {
      const container = contentRef.current;
      if (!container) return null;

      const rows = container.querySelectorAll<HTMLElement>('[data-layer-id]');
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (clientY < rect.top || clientY > rect.bottom) continue;

        const nodeId = row.getAttribute('data-layer-id')!;
        const relY = clientY - rect.top;
        const fraction = relY / rect.height;

        const node = sceneGraph.getNode(nodeId);
        const isGroup = node?.type === 'group';

        if (fraction < 0.25) {
          return { nodeId, position: 'before' };
        } else if (fraction > 0.75) {
          return { nodeId, position: 'after' };
        } else if (isGroup) {
          return { nodeId, position: 'inside' };
        } else {
          return { nodeId, position: 'after' };
        }
      }
      return null;
    },
    [sceneGraph]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;

      if (!dragState.active) {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        setDragState({ ...dragState, active: true });
        didDragRef.current = true;
        return;
      }

      const target = hitTestDropTarget(e.clientY);
      // Don't allow dropping on a dragged node
      if (target && dragState.draggedIds.has(target.nodeId)) {
        setDropTarget(null);
      } else {
        setDropTarget(target);
      }
    },
    [dragState, hitTestDropTarget]
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent) => {
      if (!dragState || !dragState.active || !dropTarget) {
        setDragState(null);
        setDropTarget(null);
        return;
      }

      // Get top-level dragged nodes (dedup children)
      const topIds = getTopLevelDragIds([...dragState.draggedIds], (id) => sceneGraph.getNode(id));

      // Determine target parent and index
      const targetNode = sceneGraph.getNode(dropTarget.nodeId);
      if (!targetNode) {
        setDragState(null);
        setDropTarget(null);
        return;
      }

      let parentId: string | null;
      let insertIndex: number;

      if (dropTarget.position === 'inside') {
        parentId = dropTarget.nodeId;
        insertIndex = 0;
      } else {
        parentId = targetNode.parent;
        // Find index of target in parent's children
        const parentNode = parentId ? sceneGraph.getNode(parentId) : null;
        const siblings = parentNode
          ? parentNode.children
          : sceneGraph.getRootNodes().map((n: Node) => n.id);
        const targetIndex = siblings.indexOf(dropTarget.nodeId);
        insertIndex = dropTarget.position === 'before' ? targetIndex : targetIndex + 1;
      }

      // Execute moves
      for (const id of topIds) {
        try {
          sceneGraph.moveNode(id, parentId, insertIndex);
          // After inserting, subsequent nodes should go after
          insertIndex++;
        } catch {
          // SceneGraph.moveNode throws on circular refs — skip
        }
      }

      setDragState(null);
      setDropTarget(null);
    },
    [dragState, dropTarget, sceneGraph]
  );

  const handlePointerLeave = useCallback(() => {
    if (dragState?.active) {
      setDropTarget(null);
    }
  }, [dragState]);

  // ========================================================================
  // Render
  // ========================================================================

  const draggedIdSet = dragState?.active ? dragState.draggedIds : null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Layers</h3>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag container needs pointer events */}
      <div
        ref={contentRef}
        className={styles.content}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {rootNodes.length === 0 ? (
          <div className={styles.emptyState} data-testid="layer-empty">
            No layers yet
          </div>
        ) : (
          rootNodes.map((node: Node) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              selected={selectedNodeIds.has(node.id)}
              isRenaming={renamingNodeId === node.id}
              isDragging={draggedIdSet !== null && draggedIdSet.has(node.id)}
              isEnteredGroup={enteredGroupId === node.id}
              dropTarget={dropTarget}
              onSelect={handleSelect}
              onDoubleClick={handleDoubleClick}
              onToggleVisibility={handleToggleVisibility}
              onToggleLock={handleToggleLock}
              onContextMenu={handleContextMenu}
              onRenameCommit={handleRenameCommit}
              onPointerDown={handlePointerDown}
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
