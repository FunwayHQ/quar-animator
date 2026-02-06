import { useState, useEffect, useCallback, useRef } from 'react';
import type { Node, RectangleNode, EllipseNode, PolygonNode, Color } from '@quar/types';
import { Lock, Unlock } from 'lucide-react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { ScrubLabel } from '../common/ScrubLabel';
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

function hexToColor(hex: string): Color | null {
  // Strip leading # if present
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
    a: 1,
  };
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
      const scaleX = polygon.transform.scale?.x ?? 1;
      const scaleY = polygon.transform.scale?.y ?? 1;
      return { width: polygon.radius * 2 * scaleX, height: polygon.radius * 2 * scaleY };
    }
    default:
      return { width: 0, height: 0 };
  }
}

function isSizeEditable(node: Node): boolean {
  return node.type === 'rectangle' || node.type === 'ellipse' || node.type === 'polygon';
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
  const aspectRatioLocked = useEditorStore((state) => state.aspectRatioLocked);
  const toggleAspectRatioLock = useEditorStore((state) => state.toggleAspectRatioLock);

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

  const applySize = useCallback(
    (nodeToUpdate: Node, w: number, h: number) => {
      if (!selectedId) return;
      if (nodeToUpdate.type === 'rectangle') {
        sceneGraph.updateNode(selectedId, { width: w, height: h });
      } else if (nodeToUpdate.type === 'ellipse') {
        sceneGraph.updateNode(selectedId, { radiusX: w / 2, radiusY: h / 2 });
      } else if (nodeToUpdate.type === 'polygon') {
        const polygon = nodeToUpdate as PolygonNode;
        const baseSize = polygon.radius * 2;
        sceneGraph.updateNode(selectedId, {
          transform: {
            ...nodeToUpdate.transform,
            scale: { x: w / baseSize, y: h / baseSize },
          },
        });
      }
    },
    [selectedId, sceneGraph]
  );

  const handleSizeChange = useCallback(
    (dimension: 'width' | 'height', value: string) => {
      if (!selectedId) return;
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentSize = getNodeSize(currentNode);

      let newW = currentSize.width;
      let newH = currentSize.height;

      if (dimension === 'width') {
        newW = num;
        if (aspectRatioLocked && currentSize.width > 0) {
          newH = num * (currentSize.height / currentSize.width);
        }
      } else {
        newH = num;
        if (aspectRatioLocked && currentSize.height > 0) {
          newW = num * (currentSize.width / currentSize.height);
        }
      }

      applySize(currentNode, newW, newH);
    },
    [selectedId, sceneGraph, aspectRatioLocked, applySize]
  );

  const handleFillChange = useCallback(
    (hex: string) => {
      if (!selectedId) return;
      const color = hexToColor(hex);
      if (!color) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentFill = (
        currentNode as { fill?: { type: string; color?: Color; opacity?: number } }
      ).fill;
      sceneGraph.updateNode(selectedId, {
        fill: { type: 'solid', color, opacity: currentFill?.opacity ?? 1 },
      } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleStrokeChange = useCallback(
    (hex: string) => {
      if (!selectedId) return;
      const color = hexToColor(hex);
      if (!color) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentStroke = (
        currentNode as {
          stroke?: { color: Color; width: number; opacity: number; cap: string; join: string };
        }
      ).stroke;
      if (currentStroke) {
        sceneGraph.updateNode(selectedId, {
          stroke: { ...currentStroke, color },
        } as Partial<Node>);
      } else {
        sceneGraph.updateNode(selectedId, {
          stroke: { color, width: 2, opacity: 1, cap: 'round', join: 'round' },
        } as Partial<Node>);
      }
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

  // Refs for hidden color pickers
  const fillPickerRef = useRef<HTMLInputElement>(null);
  const strokePickerRef = useRef<HTMLInputElement>(null);

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
                  <ScrubLabel
                    label="X"
                    value={Math.round(pos.x)}
                    onChange={(v) => handlePositionChange('x', String(v))}
                  />
                  <input
                    id="prop-pos-x"
                    type="text"
                    className={styles.input}
                    value={Math.round(pos.x)}
                    onChange={(e) => handlePositionChange('x', e.target.value)}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="Y"
                    value={Math.round(pos.y)}
                    onChange={(v) => handlePositionChange('y', String(v))}
                  />
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
                  <ScrubLabel
                    label="W"
                    value={Math.round(size.width)}
                    onChange={(v) => handleSizeChange('width', String(v))}
                    min={1}
                  />
                  <input
                    id="prop-size-w"
                    type="text"
                    className={styles.input}
                    value={Math.round(size.width)}
                    readOnly={!isSizeEditable(node)}
                    onChange={(e) => handleSizeChange('width', e.target.value)}
                  />
                </div>
                <button
                  className={`${styles.lockButton} ${aspectRatioLocked ? styles.lockButtonActive : ''}`}
                  onClick={toggleAspectRatioLock}
                  title={aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  data-testid="aspect-ratio-lock"
                >
                  {aspectRatioLocked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="H"
                    value={Math.round(size.height)}
                    onChange={(v) => handleSizeChange('height', String(v))}
                    min={1}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    value={Math.round(size.height)}
                    readOnly={!isSizeEditable(node)}
                    onChange={(e) => handleSizeChange('height', e.target.value)}
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
                <div
                  className={styles.colorSwatch}
                  style={{ '--swatch-color': fillHex } as React.CSSProperties}
                  onClick={() => fillPickerRef.current?.click()}
                  data-testid="fill-swatch"
                />
                <input
                  ref={fillPickerRef}
                  type="color"
                  className={styles.hiddenColorPicker}
                  value={fillHex}
                  onChange={(e) => handleFillChange(e.target.value)}
                  data-testid="fill-color-picker"
                />
                <input
                  id="prop-fill"
                  type="text"
                  className={styles.input}
                  value={fillHex}
                  onChange={(e) => handleFillChange(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-stroke">
                Stroke
              </label>
              <div className={styles.propertyInputs}>
                <div
                  className={styles.colorSwatch}
                  style={{ '--swatch-color': strokeHex } as React.CSSProperties}
                  onClick={() => strokePickerRef.current?.click()}
                  data-testid="stroke-swatch"
                />
                <input
                  ref={strokePickerRef}
                  type="color"
                  className={styles.hiddenColorPicker}
                  value={strokeHex}
                  onChange={(e) => handleStrokeChange(e.target.value)}
                  data-testid="stroke-color-picker"
                />
                <input
                  id="prop-stroke"
                  type="text"
                  className={styles.input}
                  value={strokeHex}
                  onChange={(e) => handleStrokeChange(e.target.value)}
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
