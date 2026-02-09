import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Node,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  Color,
  Gradient,
  Fill,
  Stroke,
} from '@quar/types';
import { Lock, Unlock, Eye, EyeOff, Plus, X, Grid3X3 } from 'lucide-react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { ScrubLabel } from '../common/ScrubLabel';
import { KeyframeIndicator } from '../common/KeyframeIndicator';
import { ColorPicker } from '../common/ColorPicker';
import { GradientEditor } from '../common/GradientEditor';
import type { FillType } from '../common/GradientEditor';
import { createDefaultGradient, SelectionManager } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { getKeyframeState } from '../../hooks/useKeyframeState';
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

const groupBoundsManager = new SelectionManager();

function getNodeSize(node: Node, sceneGraph?: SceneGraph): { width: number; height: number } {
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
    case 'group': {
      if (!sceneGraph) return { width: 0, height: 0 };
      const childIds = new Set(sceneGraph.getDescendants(node.id).map((n) => n.id));
      const bounds = groupBoundsManager.getSelectionBounds(childIds, sceneGraph);
      if (bounds) return { width: bounds.rect.width, height: bounds.rect.height };
      return { width: 0, height: 0 };
    }
    default:
      return { width: 0, height: 0 };
  }
}

function getGroupPosition(node: Node, sceneGraph: SceneGraph): { x: number; y: number } {
  const childIds = new Set(sceneGraph.getDescendants(node.id).map((n) => n.id));
  const bounds = groupBoundsManager.getSelectionBounds(childIds, sceneGraph);
  if (bounds) return { x: bounds.rect.x, y: bounds.rect.y };
  return node.transform.position;
}

function isSizeEditable(node: Node): boolean {
  return node.type === 'rectangle' || node.type === 'ellipse' || node.type === 'polygon';
}

function getSizePropertyPaths(node: Node): { w: string; h: string } {
  switch (node.type) {
    case 'rectangle':
      return { w: 'width', h: 'height' };
    case 'ellipse':
      return { w: 'radiusX', h: 'radiusY' };
    case 'polygon':
      return { w: 'transform.scale.x', h: 'transform.scale.y' };
    default:
      return { w: 'width', h: 'height' };
  }
}

function getCornerRadius(node: Node): [number, number, number, number] | number | null {
  if (node.type === 'rectangle') {
    return (node as RectangleNode).cornerRadius;
  }
  if (node.type === 'polygon') {
    return (node as PolygonNode).cornerRadius ?? 0;
  }
  return null;
}

function hasCornerRadius(node: Node): boolean {
  return node.type === 'rectangle' || node.type === 'polygon';
}

/** Get fills array from any shape node */
function getNodeFills(node: Node): Fill[] {
  const shaped = node as { fills?: Fill[] };
  return shaped.fills ?? [];
}

/** Get strokes array from any shape node */
function getNodeStrokes(node: Node): Stroke[] {
  const shaped = node as { strokes?: Stroke[] };
  return shaped.strokes ?? [];
}

function hasFillsStrokes(node: Node): boolean {
  return (
    node.type === 'rectangle' ||
    node.type === 'ellipse' ||
    node.type === 'polygon' ||
    node.type === 'path' ||
    node.type === 'text'
  );
}

// ============================================================================
// PropertiesPanel Component
// ============================================================================

export function PropertiesPanel() {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const aspectRatioLocked = useEditorStore((state) => state.aspectRatioLocked);
  const toggleAspectRatioLock = useEditorStore((state) => state.toggleAspectRatioLock);
  const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
  const currentFrame = useEditorStore((state) => state.currentFrame);
  const addKeyframeAtFrame = useEditorStore((state) => state.addKeyframeAtFrame);
  const removeKeyframeAtFrame = useEditorStore((state) => state.removeKeyframeAtFrame);
  const timeline = useEditorStore((state) => state.timeline);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const toggleSnapToGrid = useEditorStore((state) => state.toggleSnapToGrid);

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
      const { snapToGrid: snap, gridSize: grid } = useEditorStore.getState();
      const snapped = snap ? Math.round(num / grid) * grid : num;
      sceneGraph.updateNode(selectedId, {
        transform: {
          ...currentNode.transform,
          position: {
            ...currentNode.transform.position,
            [axis]: snapped,
          },
        },
      });
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `transform.position.${axis}`, currentFrame, snapped);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
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
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, 'transform.rotation', currentFrame, num);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const applySize = useCallback(
    (nodeToUpdate: Node, w: number, h: number) => {
      if (!selectedId) return;
      if (nodeToUpdate.type === 'rectangle') {
        sceneGraph.updateNode(selectedId, { width: w, height: h });
        if (autoKeyframe) {
          addKeyframeAtFrame(selectedId, 'width', currentFrame, w);
          addKeyframeAtFrame(selectedId, 'height', currentFrame, h);
        }
      } else if (nodeToUpdate.type === 'ellipse') {
        sceneGraph.updateNode(selectedId, { radiusX: w / 2, radiusY: h / 2 });
        if (autoKeyframe) {
          addKeyframeAtFrame(selectedId, 'radiusX', currentFrame, w / 2);
          addKeyframeAtFrame(selectedId, 'radiusY', currentFrame, h / 2);
        }
      } else if (nodeToUpdate.type === 'polygon') {
        const polygon = nodeToUpdate as PolygonNode;
        const baseSize = polygon.radius * 2;
        const scaleX = w / baseSize;
        const scaleY = h / baseSize;
        sceneGraph.updateNode(selectedId, {
          transform: {
            ...nodeToUpdate.transform,
            scale: { x: scaleX, y: scaleY },
          },
        });
        if (autoKeyframe) {
          addKeyframeAtFrame(selectedId, 'transform.scale.x', currentFrame, scaleX);
          addKeyframeAtFrame(selectedId, 'transform.scale.y', currentFrame, scaleY);
        }
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleSizeChange = useCallback(
    (dimension: 'width' | 'height', value: string) => {
      if (!selectedId) return;
      const raw = parseFloat(value);
      if (isNaN(raw) || raw <= 0) return;
      const { snapToGrid: snap, gridSize: grid } = useEditorStore.getState();
      const num = snap ? Math.max(grid, Math.round(raw / grid) * grid) : raw;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentSize = getNodeSize(currentNode, sceneGraph);

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

  // ============================================================================
  // Fill handlers (array-based)
  // ============================================================================

  const updateFillAtIndex = useCallback(
    (index: number, updatedFill: Fill) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const fills = [...getNodeFills(currentNode)];
      fills[index] = updatedFill;
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleFillColorChange = useCallback(
    (index: number, hex: string) => {
      if (!selectedId) return;
      const color = hexToColor(hex);
      if (!color) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const fills = [...getNodeFills(currentNode)];
      const fill = fills[index];
      if (!fill) return;
      fills[index] = { ...fill, type: 'solid', color };
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `fills.${index}.color`, currentFrame, color);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleToggleFillVisibility = useCallback(
    (index: number) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const fills = [...getNodeFills(currentNode)];
      const fill = fills[index];
      if (!fill) return;
      fills[index] = { ...fill, visible: !fill.visible };
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleAddFill = useCallback(() => {
    if (!selectedId) return;
    const currentNode = sceneGraph.getNode(selectedId);
    if (!currentNode) return;
    const fills = [...getNodeFills(currentNode), { ...DEFAULT_FILL }];
    sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
  }, [selectedId, sceneGraph]);

  const handleRemoveFill = useCallback(
    (index: number) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const fills = getNodeFills(currentNode).filter((_, i) => i !== index);
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleFillTypeChange = useCallback(
    (index: number, type: FillType) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const fills = [...getNodeFills(currentNode)];
      const fill = fills[index];
      if (!fill) return;

      if (type === 'solid') {
        const color = fill.gradient?.stops?.[0]?.color ??
          fill.color ?? { r: 128, g: 128, b: 128, a: 1 };
        fills[index] = { ...fill, type: 'solid', color };
      } else {
        const gradient = fill.gradient
          ? { ...fill.gradient, type: type as 'linear' | 'radial' | 'conic' }
          : createDefaultGradient(type as 'linear' | 'radial' | 'conic');
        fills[index] = { ...fill, type: 'gradient', gradient };
      }
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleFillGradientChange = useCallback(
    (index: number, gradient: Gradient) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const fills = [...getNodeFills(currentNode)];
      const fill = fills[index];
      if (!fill) return;
      fills[index] = { ...fill, type: 'gradient', gradient };
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(
          selectedId,
          `fills.${index}.gradient.angle`,
          currentFrame,
          gradient.angle ?? 0
        );
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  // ============================================================================
  // Stroke handlers (array-based)
  // ============================================================================

  const handleStrokeColorChange = useCallback(
    (index: number, hex: string) => {
      if (!selectedId) return;
      const color = hexToColor(hex);
      if (!color) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = [...getNodeStrokes(currentNode)];
      const stroke = strokes[index];
      if (!stroke) return;
      strokes[index] = { ...stroke, color };
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `strokes.${index}.color`, currentFrame, color);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleStrokeWidthChange = useCallback(
    (index: number, width: number) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = [...getNodeStrokes(currentNode)];
      const stroke = strokes[index];
      if (!stroke) return;
      const clamped = Math.max(0.5, Math.min(100, width));
      strokes[index] = { ...stroke, width: clamped };
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `strokes.${index}.width`, currentFrame, clamped);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleToggleStrokeVisibility = useCallback(
    (index: number) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = [...getNodeStrokes(currentNode)];
      const stroke = strokes[index];
      if (!stroke) return;
      strokes[index] = { ...stroke, visible: !stroke.visible };
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleAddStroke = useCallback(() => {
    if (!selectedId) return;
    const currentNode = sceneGraph.getNode(selectedId);
    if (!currentNode) return;
    const strokes = [...getNodeStrokes(currentNode), { ...DEFAULT_STROKE }];
    sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
  }, [selectedId, sceneGraph]);

  const handleRemoveStroke = useCallback(
    (index: number) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = getNodeStrokes(currentNode).filter((_, i) => i !== index);
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleStrokeTypeChange = useCallback(
    (index: number, type: FillType) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = [...getNodeStrokes(currentNode)];
      const stroke = strokes[index];
      if (!stroke) return;

      if (type === 'solid') {
        const color = stroke.gradient?.stops?.[0]?.color ?? stroke.color;
        const { gradient: _removed, ...rest } = stroke;
        strokes[index] = { ...rest, color };
      } else {
        const gradient = stroke.gradient
          ? { ...stroke.gradient, type: type as 'linear' | 'radial' | 'conic' }
          : createDefaultGradient(type as 'linear' | 'radial' | 'conic');
        strokes[index] = { ...stroke, gradient };
      }
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleStrokeGradientChange = useCallback(
    (index: number, gradient: Gradient) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = [...getNodeStrokes(currentNode)];
      const stroke = strokes[index];
      if (!stroke) return;
      strokes[index] = { ...stroke, gradient };
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(
          selectedId,
          `strokes.${index}.gradient.angle`,
          currentFrame,
          gradient.angle ?? 0
        );
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleStrokeAlignChange = useCallback(
    (index: number, align: 'center' | 'inside' | 'outside') => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = [...getNodeStrokes(currentNode)];
      const stroke = strokes[index];
      if (!stroke) return;
      strokes[index] = { ...stroke, align };
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  // ============================================================================
  // Opacity handlers
  // ============================================================================

  const handleOpacityChange = useCallback(
    (value: string) => {
      if (!selectedId) return;
      const cleaned = value.replace('%', '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return;
      const clamped = Math.max(0, Math.min(1, num / 100));
      sceneGraph.updateNode(selectedId, { opacity: clamped });
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, 'opacity', currentFrame, clamped);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleOpacitySlider = useCallback(
    (value: string) => {
      if (!selectedId) return;
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      const opacity = num / 100;
      sceneGraph.updateNode(selectedId, { opacity });
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, 'opacity', currentFrame, opacity);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  // Corner radius state
  const [cornerRadiusLocked, setCornerRadiusLocked] = useState(true);

  const handleCornerRadiusChange = useCallback(
    (value: string, corner?: number) => {
      if (!selectedId) return;
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;

      if (currentNode.type === 'rectangle') {
        const rect = currentNode as RectangleNode;
        const newRadius = [...rect.cornerRadius] as [number, number, number, number];
        if (corner !== undefined) {
          newRadius[corner] = num;
        } else {
          newRadius[0] = num;
          newRadius[1] = num;
          newRadius[2] = num;
          newRadius[3] = num;
        }
        sceneGraph.updateNode(selectedId, { cornerRadius: newRadius });
        if (autoKeyframe) {
          if (corner !== undefined) {
            addKeyframeAtFrame(selectedId, `cornerRadius.${corner}`, currentFrame, num);
          } else {
            addKeyframeAtFrame(selectedId, 'cornerRadius.0', currentFrame, num);
            addKeyframeAtFrame(selectedId, 'cornerRadius.1', currentFrame, num);
            addKeyframeAtFrame(selectedId, 'cornerRadius.2', currentFrame, num);
            addKeyframeAtFrame(selectedId, 'cornerRadius.3', currentFrame, num);
          }
        }
      } else if (currentNode.type === 'polygon') {
        sceneGraph.updateNode(selectedId, { cornerRadius: num } as Partial<Node>);
        if (autoKeyframe) {
          addKeyframeAtFrame(selectedId, 'cornerRadius', currentFrame, num);
        }
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  // Color picker popover state
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState({ x: 0, y: 0 });
  const swatchRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const openPicker = useCallback((key: string) => {
    const el = swatchRefs.current.get(key);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPickerAnchor({ x: rect.left, y: rect.bottom + 4 });
    setActivePickerKey(key);
  }, []);

  const closePicker = useCallback(() => {
    setActivePickerKey(null);
  }, []);

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

  const isGroup = node.type === 'group';
  const pos = isGroup ? getGroupPosition(node, sceneGraph) : node.transform.position;
  const rotation = node.transform.rotation;
  const size = getNodeSize(node, sceneGraph);
  const fills = getNodeFills(node);
  const strokes = getNodeStrokes(node);
  const opacityPercent = Math.round(node.opacity * 100);
  const sizePaths = getSizePropertyPaths(node);

  // Helper to toggle a keyframe for a given property
  const toggleKeyframe = (property: string, value: unknown) => {
    if (!selectedId) return;
    const state = getKeyframeState(timeline, selectedId, property, currentFrame);
    if (state === 'active') {
      removeKeyframeAtFrame(selectedId, property, currentFrame);
    } else {
      addKeyframeAtFrame(selectedId, property, currentFrame, value);
    }
  };

  const nodeTypeLabel = node.type.charAt(0).toUpperCase() + node.type.slice(1);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Properties</h3>
        <span className={styles.nodeTypeLabel}>{nodeTypeLabel}</span>
      </div>
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Transform</span>
            <button
              className={`${styles.snapButton} ${snapToGrid ? styles.snapButtonActive : ''}`}
              onClick={toggleSnapToGrid}
              title={snapToGrid ? 'Disable snap to grid' : 'Enable snap to grid'}
              aria-label={snapToGrid ? 'Disable snap to grid' : 'Enable snap to grid'}
              data-testid="snap-to-grid-toggle"
            >
              <Grid3X3 size={12} />
            </button>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.propertyRow}>
              <div className={styles.propertyHeader}>
                <label className={styles.propertyLabel} htmlFor="prop-pos-x">
                  Position
                </label>
                <KeyframeIndicator
                  state={getKeyframeState(
                    timeline,
                    selectedId!,
                    'transform.position.x',
                    currentFrame
                  )}
                  onToggle={() => toggleKeyframe('transform.position.x', pos.x)}
                />
              </div>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="X"
                    value={Math.round(pos.x)}
                    onChange={isGroup ? undefined : (v) => handlePositionChange('x', String(v))}
                  />
                  <input
                    id="prop-pos-x"
                    type="text"
                    className={styles.input}
                    value={Math.round(pos.x)}
                    readOnly={isGroup}
                    onChange={(e) => handlePositionChange('x', e.target.value)}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="Y"
                    value={Math.round(pos.y)}
                    onChange={isGroup ? undefined : (v) => handlePositionChange('y', String(v))}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    value={Math.round(pos.y)}
                    readOnly={isGroup}
                    onChange={(e) => handlePositionChange('y', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className={styles.propertyRow}>
              <div className={styles.propertyHeader}>
                <label className={styles.propertyLabel} htmlFor="prop-size-w">
                  Size
                </label>
                <KeyframeIndicator
                  state={getKeyframeState(timeline, selectedId!, sizePaths.w, currentFrame)}
                  onToggle={() => toggleKeyframe(sizePaths.w, size.width)}
                />
              </div>
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
                    readOnly={!isSizeEditable(node) || isGroup}
                    onChange={(e) => handleSizeChange('width', e.target.value)}
                  />
                </div>
                {!isGroup && (
                  <button
                    className={`${styles.lockButton} ${aspectRatioLocked ? styles.lockButtonActive : ''}`}
                    onClick={toggleAspectRatioLock}
                    title={aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                    aria-label={aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                    data-testid="aspect-ratio-lock"
                  >
                    {aspectRatioLocked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                )}
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="H"
                    value={Math.round(size.height)}
                    onChange={isGroup ? undefined : (v) => handleSizeChange('height', String(v))}
                    min={1}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    value={Math.round(size.height)}
                    readOnly={!isSizeEditable(node) || isGroup}
                    onChange={(e) => handleSizeChange('height', e.target.value)}
                  />
                </div>
              </div>
            </div>
            {hasCornerRadius(node) &&
              (() => {
                const cr = getCornerRadius(node);
                if (cr === null) return null;

                if (node.type === 'rectangle') {
                  const corners = cr as [number, number, number, number];
                  const uniformValue = Math.round(corners[0]);
                  return (
                    <div className={styles.propertyRow} data-testid="corner-radius-section">
                      <div className={styles.propertyHeader}>
                        <span className={styles.propertyLabel}>Corner Radius</span>
                        <KeyframeIndicator
                          state={getKeyframeState(
                            timeline,
                            selectedId!,
                            'cornerRadius.0',
                            currentFrame
                          )}
                          onToggle={() => toggleKeyframe('cornerRadius.0', corners[0])}
                        />
                      </div>
                      {cornerRadiusLocked ? (
                        <div className={styles.propertyInputs}>
                          <div className={styles.inputGroup}>
                            <ScrubLabel
                              label="CR"
                              value={uniformValue}
                              onChange={(v) => handleCornerRadiusChange(String(v))}
                              min={0}
                            />
                            <input
                              type="text"
                              className={styles.input}
                              value={uniformValue}
                              onChange={(e) => handleCornerRadiusChange(e.target.value)}
                              data-testid="corner-radius-input"
                            />
                          </div>
                          <button
                            className={`${styles.lockButton} ${styles.lockButtonActive}`}
                            onClick={() => setCornerRadiusLocked(false)}
                            title="Unlock per-corner editing"
                            aria-label="Unlock per-corner editing"
                            data-testid="corner-radius-lock"
                          >
                            <Lock size={12} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className={styles.propertyInputs}>
                            <div className={styles.inputGroup}>
                              <ScrubLabel
                                label="TL"
                                value={Math.round(corners[0])}
                                onChange={(v) => handleCornerRadiusChange(String(v), 0)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={Math.round(corners[0])}
                                onChange={(e) => handleCornerRadiusChange(e.target.value, 0)}
                              />
                            </div>
                            <div className={styles.inputGroup}>
                              <ScrubLabel
                                label="TR"
                                value={Math.round(corners[1])}
                                onChange={(v) => handleCornerRadiusChange(String(v), 1)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={Math.round(corners[1])}
                                onChange={(e) => handleCornerRadiusChange(e.target.value, 1)}
                              />
                            </div>
                            <button
                              className={styles.lockButton}
                              onClick={() => setCornerRadiusLocked(true)}
                              title="Lock corners together"
                              aria-label="Lock corners together"
                              data-testid="corner-radius-lock"
                            >
                              <Unlock size={12} />
                            </button>
                          </div>
                          <div className={`${styles.propertyInputs} ${styles.marginTopXs}`}>
                            <div className={styles.inputGroup}>
                              <ScrubLabel
                                label="BL"
                                value={Math.round(corners[3])}
                                onChange={(v) => handleCornerRadiusChange(String(v), 3)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={Math.round(corners[3])}
                                onChange={(e) => handleCornerRadiusChange(e.target.value, 3)}
                              />
                            </div>
                            <div className={styles.inputGroup}>
                              <ScrubLabel
                                label="BR"
                                value={Math.round(corners[2])}
                                onChange={(v) => handleCornerRadiusChange(String(v), 2)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={Math.round(corners[2])}
                                onChange={(e) => handleCornerRadiusChange(e.target.value, 2)}
                              />
                            </div>
                            <div className={styles.lockButtonSpacer} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // Polygon: single input
                const polyRadius = cr as number;
                return (
                  <div className={styles.propertyRow} data-testid="corner-radius-section">
                    <div className={styles.propertyHeader}>
                      <span className={styles.propertyLabel}>Corner Radius</span>
                      <KeyframeIndicator
                        state={getKeyframeState(
                          timeline,
                          selectedId!,
                          'cornerRadius',
                          currentFrame
                        )}
                        onToggle={() => toggleKeyframe('cornerRadius', polyRadius)}
                      />
                    </div>
                    <div className={styles.propertyInputs}>
                      <div className={styles.inputGroup}>
                        <ScrubLabel
                          label="CR"
                          value={Math.round(polyRadius)}
                          onChange={(v) => handleCornerRadiusChange(String(v))}
                          min={0}
                        />
                        <input
                          type="text"
                          className={styles.input}
                          value={Math.round(polyRadius)}
                          onChange={(e) => handleCornerRadiusChange(e.target.value)}
                          data-testid="corner-radius-input"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            <div className={styles.propertyRow}>
              <div className={styles.propertyHeader}>
                <label className={styles.propertyLabel} htmlFor="prop-rotation">
                  Rotation
                </label>
                <KeyframeIndicator
                  state={getKeyframeState(
                    timeline,
                    selectedId!,
                    'transform.rotation',
                    currentFrame
                  )}
                  onToggle={() => toggleKeyframe('transform.rotation', rotation)}
                />
              </div>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="R"
                    value={Math.round(rotation)}
                    onChange={(v) => handleRotationChange(String(v))}
                    sensitivity={1}
                    min={-360}
                    max={360}
                  />
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
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Appearance</span>
          </div>
          <div className={styles.sectionContent}>
            {/* Fills list */}
            {hasFillsStrokes(node) && (
              <>
                <div className={styles.propertyRow}>
                  <div className={styles.propertyHeader}>
                    <span className={styles.propertyLabel}>Fill</span>
                  </div>
                  {fills.map((fill, index) => {
                    const fillHex =
                      fill.type === 'solid' && fill.color ? colorToHex(fill.color) : '#000000';
                    const fillType: FillType =
                      fill.type === 'gradient' && fill.gradient
                        ? (fill.gradient.type as FillType)
                        : 'solid';
                    const fillGradient = fill.gradient ?? createDefaultGradient('linear');
                    const pickerKey = `fill-${index}`;

                    return (
                      <div
                        key={index}
                        className={styles.fillRowWrapper}
                        data-testid={`fill-row-${index}`}
                      >
                        <div className={styles.fillStrokeRow}>
                          <button
                            className={styles.visibilityToggle}
                            onClick={() => handleToggleFillVisibility(index)}
                            title={fill.visible ? 'Hide fill' : 'Show fill'}
                            aria-label={fill.visible ? 'Hide fill' : 'Show fill'}
                            data-testid={`fill-visibility-${index}`}
                          >
                            {fill.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                          <KeyframeIndicator
                            state={getKeyframeState(
                              timeline,
                              selectedId!,
                              `fills.${index}.color`,
                              currentFrame
                            )}
                            onToggle={() => toggleKeyframe(`fills.${index}.color`, fill.color)}
                          />
                          {fillType === 'solid' && (
                            <>
                              <div
                                ref={(el) => {
                                  if (el) swatchRefs.current.set(pickerKey, el);
                                }}
                                className={styles.colorSwatch}
                                style={{ '--swatch-color': fillHex } as React.CSSProperties}
                                role="button"
                                tabIndex={0}
                                aria-label={`Fill color: ${fillHex}`}
                                onClick={() => openPicker(pickerKey)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openPicker(pickerKey);
                                  }
                                }}
                                data-testid={index === 0 ? 'fill-swatch' : `fill-swatch-${index}`}
                              />
                              <input
                                id={index === 0 ? 'prop-fill' : undefined}
                                type="text"
                                className={styles.input}
                                value={fillHex}
                                onChange={(e) => handleFillColorChange(index, e.target.value)}
                              />
                              {activePickerKey === pickerKey && (
                                <ColorPicker
                                  color={hexToColor(fillHex) || { r: 0, g: 0, b: 0, a: 1 }}
                                  onChange={(c) => handleFillColorChange(index, colorToHex(c))}
                                  anchorX={pickerAnchor.x}
                                  anchorY={pickerAnchor.y}
                                  onClose={closePicker}
                                />
                              )}
                            </>
                          )}
                          <button
                            className={styles.removeButton}
                            onClick={() => handleRemoveFill(index)}
                            title="Remove fill"
                            aria-label="Remove fill"
                            data-testid={`fill-remove-${index}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <GradientEditor
                          fillType={fillType}
                          onFillTypeChange={(t) => handleFillTypeChange(index, t)}
                          gradient={fillGradient}
                          onChange={(g) => handleFillGradientChange(index, g)}
                        />
                      </div>
                    );
                  })}
                  <button
                    className={styles.addButton}
                    onClick={handleAddFill}
                    title="Add fill"
                    aria-label="Add fill"
                    data-testid="add-fill"
                  >
                    <Plus size={12} /> Add Fill
                  </button>
                </div>

                {/* Strokes list */}
                <div className={styles.propertyRow}>
                  <div className={styles.propertyHeader}>
                    <span className={styles.propertyLabel}>Stroke</span>
                  </div>
                  {strokes.map((stroke, index) => {
                    const strokeHex = colorToHex(stroke.color);
                    const strokeType: FillType = stroke.gradient
                      ? (stroke.gradient.type as FillType)
                      : 'solid';
                    const strokeGradient = stroke.gradient ?? createDefaultGradient('linear');
                    const pickerKey = `stroke-${index}`;

                    return (
                      <div
                        key={index}
                        className={styles.strokeRowWrapper}
                        data-testid={`stroke-row-${index}`}
                      >
                        <div className={styles.fillStrokeRow}>
                          <button
                            className={styles.visibilityToggle}
                            onClick={() => handleToggleStrokeVisibility(index)}
                            title={stroke.visible ? 'Hide stroke' : 'Show stroke'}
                            aria-label={stroke.visible ? 'Hide stroke' : 'Show stroke'}
                            data-testid={`stroke-visibility-${index}`}
                          >
                            {stroke.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                          <KeyframeIndicator
                            state={getKeyframeState(
                              timeline,
                              selectedId!,
                              `strokes.${index}.color`,
                              currentFrame
                            )}
                            onToggle={() => toggleKeyframe(`strokes.${index}.color`, stroke.color)}
                          />
                          {strokeType === 'solid' && (
                            <>
                              <div
                                ref={(el) => {
                                  if (el) swatchRefs.current.set(pickerKey, el);
                                }}
                                className={styles.colorSwatch}
                                style={{ '--swatch-color': strokeHex } as React.CSSProperties}
                                role="button"
                                tabIndex={0}
                                aria-label={`Stroke color: ${strokeHex}`}
                                onClick={() => openPicker(pickerKey)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openPicker(pickerKey);
                                  }
                                }}
                                data-testid={
                                  index === 0 ? 'stroke-swatch' : `stroke-swatch-${index}`
                                }
                              />
                              <input
                                id={index === 0 ? 'prop-stroke' : undefined}
                                type="text"
                                className={styles.input}
                                value={strokeHex}
                                onChange={(e) => handleStrokeColorChange(index, e.target.value)}
                              />
                              {activePickerKey === pickerKey && (
                                <ColorPicker
                                  color={hexToColor(strokeHex) || { r: 0, g: 0, b: 0, a: 1 }}
                                  onChange={(c) => handleStrokeColorChange(index, colorToHex(c))}
                                  anchorX={pickerAnchor.x}
                                  anchorY={pickerAnchor.y}
                                  onClose={closePicker}
                                />
                              )}
                            </>
                          )}
                          <button
                            className={styles.removeButton}
                            onClick={() => handleRemoveStroke(index)}
                            title="Remove stroke"
                            aria-label="Remove stroke"
                            data-testid={`stroke-remove-${index}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <GradientEditor
                          fillType={strokeType}
                          onFillTypeChange={(t) => handleStrokeTypeChange(index, t)}
                          gradient={strokeGradient}
                          onChange={(g) => handleStrokeGradientChange(index, g)}
                        />
                        <div className={styles.strokeSubRow}>
                          <div className={`${styles.inputGroup} ${styles.inputGroupFlex}`}>
                            <ScrubLabel
                              label="W"
                              value={Math.round(stroke.width * 10) / 10}
                              onChange={(v) => handleStrokeWidthChange(index, v)}
                              sensitivity={0.5}
                              min={0.5}
                              max={100}
                            />
                            <input
                              type="text"
                              className={styles.input}
                              value={Math.round(stroke.width * 10) / 10}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) handleStrokeWidthChange(index, v);
                              }}
                              data-testid={`stroke-width-${index}`}
                            />
                          </div>
                          <div className={styles.alignToggle} data-testid={`stroke-align-${index}`}>
                            {(['inside', 'center', 'outside'] as const).map((a) => (
                              <button
                                key={a}
                                className={`${styles.alignOption} ${(stroke.align ?? 'center') === a ? styles.alignOptionActive : ''}`}
                                onClick={() => handleStrokeAlignChange(index, a)}
                                title={`Stroke ${a}`}
                                aria-label={`Stroke alignment: ${a}`}
                                aria-pressed={(stroke.align ?? 'center') === a}
                                data-testid={`stroke-align-${index}-${a}`}
                              >
                                {a[0].toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    className={styles.addButton}
                    onClick={handleAddStroke}
                    title="Add stroke"
                    aria-label="Add stroke"
                    data-testid="add-stroke"
                  >
                    <Plus size={12} /> Add Stroke
                  </button>
                </div>
              </>
            )}
            <div className={styles.propertyRow}>
              <div className={styles.propertyHeader}>
                <label className={styles.propertyLabel} htmlFor="prop-opacity">
                  Opacity
                </label>
                <KeyframeIndicator
                  state={getKeyframeState(timeline, selectedId!, 'opacity', currentFrame)}
                  onToggle={() => toggleKeyframe('opacity', node.opacity)}
                />
              </div>
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
