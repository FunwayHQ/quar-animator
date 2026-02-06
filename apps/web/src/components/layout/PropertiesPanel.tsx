import { useState, useEffect, useCallback } from 'react';
import type { Node, RectangleNode, EllipseNode, PolygonNode, Color } from '@quar/types';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import styles from './PropertiesPanel.module.css';

// ============================================================================
// Helpers
// ============================================================================

function colorToHex(color: Color): string {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

function getNodeSize(node: Node): { width: number; height: number } {
  switch (node.type) {
    case 'rectangle': {
      const rect = node as RectangleNode;
      return { width: rect.width, height: rect.height };
    }
    case 'ellipse': {
      const ellipse = node as EllipseNode;
      return { width: ellipse.radiusX * 2, height: ellipse.radiusY * 2 };
    }
    case 'polygon': {
      const polygon = node as PolygonNode;
      return { width: polygon.radius * 2, height: polygon.radius * 2 };
    }
    default:
      return { width: 0, height: 0 };
  }
}

function getFillHex(node: Node): string {
  const fill = (node as { fill?: { type: string; color?: Color } }).fill;
  if (fill && fill.type === 'solid' && fill.color) {
    return colorToHex(fill.color);
  }
  return '#000000';
}

function getStrokeHex(node: Node): string {
  const stroke = (node as { stroke?: { color: Color } }).stroke;
  if (stroke && stroke.color) {
    return colorToHex(stroke.color);
  }
  return '#000000';
}

// ============================================================================
// PropertiesPanel Component
// ============================================================================

export function PropertiesPanel() {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);

  // Re-render on SceneGraph changes
  const [, setVersion] = useState(0);
  useEffect(() => {
    const increment = () => setVersion((v) => v + 1);
    const unsub = sceneGraph.on('nodeChanged', increment);
    return unsub;
  }, [sceneGraph]);

  // Get the first selected node (single-selection for properties)
  const selectedId = selectedNodeIds.size > 0 ? [...selectedNodeIds][0] : null;
  const node = selectedId ? sceneGraph.getNode(selectedId) : null;

  const handlePositionChange = useCallback(
    (axis: 'x' | 'y', value: string) => {
      if (!selectedId) return;
      const num = parseFloat(value);
      if (isNaN(num)) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      sceneGraph.updateNode(selectedId, {
        transform: {
          ...currentNode.transform,
          position: {
            ...currentNode.transform.position,
            [axis]: num,
          },
        },
      });
    },
    [selectedId, sceneGraph]
  );

  const handleRotationChange = useCallback(
    (value: string) => {
      if (!selectedId) return;
      const cleaned = value.replace('°', '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      sceneGraph.updateNode(selectedId, {
        transform: { ...currentNode.transform, rotation: num },
      });
    },
    [selectedId, sceneGraph]
  );

  const handleOpacityChange = useCallback(
    (value: string) => {
      if (!selectedId) return;
      const cleaned = value.replace('%', '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return;
      sceneGraph.updateNode(selectedId, {
        opacity: Math.max(0, Math.min(1, num / 100)),
      });
    },
    [selectedId, sceneGraph]
  );

  const handleOpacitySlider = useCallback(
    (value: string) => {
      if (!selectedId) return;
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      sceneGraph.updateNode(selectedId, {
        opacity: num / 100,
      });
    },
    [selectedId, sceneGraph]
  );

  if (!node) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>Properties</h3>
        </div>
        <div className={styles.content}>
          <div className={styles.emptyStateVisible} data-testid="properties-empty">
            Select an object to view properties
          </div>
        </div>
      </div>
    );
  }

  const pos = node.transform.position;
  const rotation = node.transform.rotation;
  const size = getNodeSize(node);
  const fillHex = getFillHex(node);
  const strokeHex = getStrokeHex(node);
  const opacityPercent = Math.round(node.opacity * 100);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Properties</h3>
      </div>
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Transform</span>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-pos-x">
                Position
              </label>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>X</span>
                  <input
                    id="prop-pos-x"
                    type="text"
                    className={styles.input}
                    value={Math.round(pos.x)}
                    onChange={(e) => handlePositionChange('x', e.target.value)}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>Y</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={Math.round(pos.y)}
                    onChange={(e) => handlePositionChange('y', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-size-w">
                Size
              </label>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>W</span>
                  <input
                    id="prop-size-w"
                    type="text"
                    className={styles.input}
                    value={Math.round(size.width)}
                    readOnly
                  />
                </div>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>H</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={Math.round(size.height)}
                    readOnly
                  />
                </div>
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-rotation">
                Rotation
              </label>
              <div className={styles.propertyInputs}>
                <input
                  id="prop-rotation"
                  type="text"
                  className={styles.input}
                  value={`${Math.round(rotation)}\u00B0`}
                  onChange={(e) => handleRotationChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Appearance</span>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-fill">
                Fill
              </label>
              <div className={styles.propertyInputs}>
                <div className={styles.colorSwatch} style={{ backgroundColor: fillHex }} />
                <input
                  id="prop-fill"
                  type="text"
                  className={styles.input}
                  value={fillHex}
                  readOnly
                />
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-stroke">
                Stroke
              </label>
              <div className={styles.propertyInputs}>
                <div className={styles.colorSwatch} style={{ backgroundColor: strokeHex }} />
                <input
                  id="prop-stroke"
                  type="text"
                  className={styles.input}
                  value={strokeHex}
                  readOnly
                />
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-opacity">
                Opacity
              </label>
              <div className={styles.propertyInputs}>
                <input
                  id="prop-opacity"
                  type="range"
                  className={styles.slider}
                  min="0"
                  max="100"
                  value={opacityPercent}
                  onChange={(e) => handleOpacitySlider(e.target.value)}
                />
                <input
                  type="text"
                  className={styles.inputSmall}
                  value={`${opacityPercent}%`}
                  onChange={(e) => handleOpacityChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PropertiesPanel;
