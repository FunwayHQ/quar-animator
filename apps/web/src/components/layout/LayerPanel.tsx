import { useState } from 'react';
import styles from './LayerPanel.module.css';

interface Layer {
  id: string;
  name: string;
  type: 'group' | 'shape' | 'path' | 'text';
  visible: boolean;
  locked: boolean;
  children?: Layer[];
  expanded?: boolean;
}

const sampleLayers: Layer[] = [
  {
    id: '1',
    name: 'Character',
    type: 'group',
    visible: true,
    locked: false,
    expanded: true,
    children: [
      { id: '1-1', name: 'Head', type: 'group', visible: true, locked: false },
      { id: '1-2', name: 'Body', type: 'shape', visible: true, locked: false },
      { id: '1-3', name: 'Arms', type: 'group', visible: true, locked: false },
    ],
  },
  { id: '2', name: 'Background', type: 'shape', visible: true, locked: true },
  { id: '3', name: 'Title', type: 'text', visible: true, locked: false },
];

interface LayerRowProps {
  layer: Layer;
  depth: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
}

function LayerRow({ layer, depth, selected, onSelect, onToggleVisibility, onToggleLock }: LayerRowProps) {
  const [expanded, setExpanded] = useState(layer.expanded ?? false);

  return (
    <>
      <div
        className={`${styles.layerRow} ${selected ? styles.selected : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(layer.id)}
      >
        {layer.children && (
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
        <span className={styles.layerIcon}>
          {layer.type === 'group' ? '📁' : layer.type === 'text' ? 'T' : '◼'}
        </span>
        <span className={styles.layerName}>{layer.name}</span>
        <div className={styles.layerActions}>
          <button
            className={`${styles.actionButton} ${!layer.visible ? styles.inactive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(layer.id);
            }}
            title="Toggle visibility"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            className={`${styles.actionButton} ${layer.locked ? styles.active : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(layer.id);
            }}
            title="Toggle lock"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>
        </div>
      </div>
      {expanded &&
        layer.children?.map((child) => (
          <LayerRow
            key={child.id}
            layer={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
          />
        ))}
    </>
  );
}

export function LayerPanel() {
  const [layers, setLayers] = useState(sampleLayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleToggleVisibility = (id: string) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      )
    );
  };

  const handleToggleLock = (id: string) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === id ? { ...layer, locked: !layer.locked } : layer
      )
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Layers</h3>
        <div className={styles.headerActions}>
          <button className={styles.headerButton} title="Add layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button className={styles.headerButton} title="Add group">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>
      <div className={styles.content}>
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            depth={0}
            selected={selectedId === layer.id}
            onSelect={setSelectedId}
            onToggleVisibility={handleToggleVisibility}
            onToggleLock={handleToggleLock}
          />
        ))}
      </div>
    </div>
  );
}

export default LayerPanel;
