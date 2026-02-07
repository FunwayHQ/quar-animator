import { useState, useEffect, useCallback, useRef } from 'react';
import type { Node, RectangleNode, EllipseNode, PolygonNode, Color, Gradient, Fill } from '@quar/types';
import { Lock, Unlock } from 'lucide-react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { ScrubLabel } from '../common/ScrubLabel';
import { KeyframeIndicator } from '../common/KeyframeIndicator';
import { ColorPicker } from '../common/ColorPicker';
import { GradientEditor } from '../common/GradientEditor';
import type { FillType } from '../common/GradientEditor';
import { createDefaultGradient } from '@quar/core';
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

function getFillHex(node: Node): string {
  const fill = (node as { fill?: { type: string; color?: Color } }).fill;
  if (fill && fill.type === 'solid' && fill.color) {
    return colorToHex(fill.color);
  }
  return '#000000';
}

function getFillType(node: Node): FillType {
  const fill = (node as { fill?: Fill }).fill;
  if (!fill) return 'solid';
  if (fill.type === 'gradient' && fill.gradient) {
    return fill.gradient.type as FillType;
  }
  return 'solid';
}

function getFillGradient(node: Node): Gradient {
  const fill = (node as { fill?: Fill }).fill;
  if (fill?.type === 'gradient' && fill.gradient) {
    return fill.gradient;
  }
  return createDefaultGradient('linear');
}

function getStrokeHex(node: Node): string {
  const stroke = (node as { stroke?: { color: Color } }).stroke;
  if (stroke && stroke.color) {
    return colorToHex(stroke.color);
  }
  return '#000000';
}

function getStrokeType(node: Node): FillType {
  const stroke = (node as { stroke?: { gradient?: Gradient } }).stroke;
  if (stroke?.gradient) {
    return stroke.gradient.type as FillType;
  }
  return 'solid';
}

function getStrokeGradient(node: Node): Gradient {
  const stroke = (node as { stroke?: { gradient?: Gradient } }).stroke;
  if (stroke?.gradient) {
    return stroke.gradient;
  }
  return createDefaultGradient('linear');
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
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `transform.position.${axis}`, currentFrame, num);
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
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, 'fill.color', currentFrame, color);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
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
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, 'stroke.color', currentFrame, color);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

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

  // Gradient handlers
  const handleFillTypeChange = useCallback(
    (type: FillType) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentFill = (currentNode as { fill?: Fill }).fill;

      if (type === 'solid') {
        // Switch to solid: use gradient's first stop color or fallback
        const color = currentFill?.gradient?.stops?.[0]?.color ?? currentFill?.color ?? { r: 128, g: 128, b: 128, a: 1 };
        sceneGraph.updateNode(selectedId, {
          fill: { type: 'solid', color, opacity: currentFill?.opacity ?? 1 },
        } as Partial<Node>);
      } else {
        // Switch to gradient: create default gradient of the selected type
        const gradient = currentFill?.gradient
          ? { ...currentFill.gradient, type: type as 'linear' | 'radial' | 'conic' }
          : createDefaultGradient(type as 'linear' | 'radial' | 'conic');
        sceneGraph.updateNode(selectedId, {
          fill: { type: 'gradient', gradient, opacity: currentFill?.opacity ?? 1 },
        } as Partial<Node>);
      }
    },
    [selectedId, sceneGraph]
  );

  const handleGradientChange = useCallback(
    (gradient: Gradient) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentFill = (currentNode as { fill?: Fill }).fill;
      sceneGraph.updateNode(selectedId, {
        fill: { type: 'gradient', gradient, opacity: currentFill?.opacity ?? 1 },
      } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, 'fill.gradient.angle', currentFrame, gradient.angle ?? 0);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  // Stroke gradient handlers
  const handleStrokeTypeChange = useCallback(
    (type: FillType) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentStroke = (currentNode as { stroke?: { color: Color; width: number; opacity: number; cap: string; join: string; gradient?: Gradient } }).stroke;
      if (!currentStroke) return;

      if (type === 'solid') {
        // Switch to solid: remove gradient, keep color
        const color = currentStroke.gradient?.stops?.[0]?.color ?? currentStroke.color;
        const { gradient: _removed, ...rest } = currentStroke;
        sceneGraph.updateNode(selectedId, {
          stroke: { ...rest, color },
        } as Partial<Node>);
      } else {
        // Switch to gradient
        const gradient = currentStroke.gradient
          ? { ...currentStroke.gradient, type: type as 'linear' | 'radial' | 'conic' }
          : createDefaultGradient(type as 'linear' | 'radial' | 'conic');
        sceneGraph.updateNode(selectedId, {
          stroke: { ...currentStroke, gradient },
        } as Partial<Node>);
      }
    },
    [selectedId, sceneGraph]
  );

  const handleStrokeGradientChange = useCallback(
    (gradient: Gradient) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const currentStroke = (currentNode as { stroke?: { color: Color; width: number; opacity: number; cap: string; join: string; gradient?: Gradient } }).stroke;
      if (!currentStroke) return;
      sceneGraph.updateNode(selectedId, {
        stroke: { ...currentStroke, gradient },
      } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, 'stroke.gradient.angle', currentFrame, gradient.angle ?? 0);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  // Color picker popover state
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const [strokePickerOpen, setStrokePickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState({ x: 0, y: 0 });
  const fillSwatchRef = useRef<HTMLDivElement>(null);
  const strokeSwatchRef = useRef<HTMLDivElement>(null);

  const openFillPicker = useCallback(() => {
    const el = fillSwatchRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPickerAnchor({ x: rect.left, y: rect.bottom + 4 });
    setFillPickerOpen(true);
    setStrokePickerOpen(false);
  }, []);

  const openStrokePicker = useCallback(() => {
    const el = strokeSwatchRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPickerAnchor({ x: rect.left, y: rect.bottom + 4 });
    setStrokePickerOpen(true);
    setFillPickerOpen(false);
  }, []);

  const handleFillPickerChange = useCallback(
    (c: Color) => {
      handleFillChange(`#${Math.round(c.r).toString(16).padStart(2, '0')}${Math.round(c.g).toString(16).padStart(2, '0')}${Math.round(c.b).toString(16).padStart(2, '0')}`);
    },
    [handleFillChange]
  );

  const handleStrokePickerChange = useCallback(
    (c: Color) => {
      handleStrokeChange(`#${Math.round(c.r).toString(16).padStart(2, '0')}${Math.round(c.g).toString(16).padStart(2, '0')}${Math.round(c.b).toString(16).padStart(2, '0')}`);
    },
    [handleStrokeChange]
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
  const fillType = getFillType(node);
  const fillGradient = getFillGradient(node);
  const strokeHex = getStrokeHex(node);
  const strokeType = getStrokeType(node);
  const strokeGradient = getStrokeGradient(node);
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
            {hasCornerRadius(node) && (() => {
              const cr = getCornerRadius(node);
              if (cr === null) return null;

              if (node.type === 'rectangle') {
                const corners = cr as [number, number, number, number];
                const uniformValue = Math.round(corners[0]);
                return (
                  <div className={styles.propertyRow} data-testid="corner-radius-section">
                    <div className={styles.propertyHeader}>
                      <label className={styles.propertyLabel}>Corner Radius</label>
                      <KeyframeIndicator
                        state={getKeyframeState(timeline, selectedId!, 'cornerRadius.0', currentFrame)}
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
                            data-testid="corner-radius-lock"
                          >
                            <Unlock size={12} />
                          </button>
                        </div>
                        <div className={styles.propertyInputs} style={{ marginTop: '4px' }}>
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
                          <div style={{ width: '20px', flexShrink: 0 }} />
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
                    <label className={styles.propertyLabel}>Corner Radius</label>
                    <KeyframeIndicator
                      state={getKeyframeState(timeline, selectedId!, 'cornerRadius', currentFrame)}
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
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-fill">
                Fill
              </label>
              {fillType === 'solid' ? (
                <div className={styles.propertyInputs}>
                  <div
                    ref={fillSwatchRef}
                    className={styles.colorSwatch}
                    style={{ '--swatch-color': fillHex } as React.CSSProperties}
                    onClick={openFillPicker}
                    data-testid="fill-swatch"
                  />
                  <input
                    id="prop-fill"
                    type="text"
                    className={styles.input}
                    value={fillHex}
                    onChange={(e) => handleFillChange(e.target.value)}
                  />
                  {fillPickerOpen && (
                    <ColorPicker
                      color={hexToColor(fillHex) || { r: 0, g: 0, b: 0, a: 1 }}
                      onChange={handleFillPickerChange}
                      anchorX={pickerAnchor.x}
                      anchorY={pickerAnchor.y}
                      onClose={() => setFillPickerOpen(false)}
                    />
                  )}
                </div>
              ) : (
                <GradientEditor
                  fillType={fillType}
                  onFillTypeChange={handleFillTypeChange}
                  gradient={fillGradient}
                  onChange={handleGradientChange}
                />
              )}
              {/* Fill type toggle: shown below the fill controls */}
              {fillType === 'solid' && (
                <GradientEditor
                  fillType="solid"
                  onFillTypeChange={handleFillTypeChange}
                  gradient={fillGradient}
                  onChange={handleGradientChange}
                />
              )}
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel} htmlFor="prop-stroke">
                Stroke
              </label>
              {strokeType === 'solid' ? (
                <div className={styles.propertyInputs}>
                  <div
                    ref={strokeSwatchRef}
                    className={styles.colorSwatch}
                    style={{ '--swatch-color': strokeHex } as React.CSSProperties}
                    onClick={openStrokePicker}
                    data-testid="stroke-swatch"
                  />
                  <input
                    id="prop-stroke"
                    type="text"
                    className={styles.input}
                    value={strokeHex}
                    onChange={(e) => handleStrokeChange(e.target.value)}
                  />
                  {strokePickerOpen && (
                    <ColorPicker
                      color={hexToColor(strokeHex) || { r: 0, g: 0, b: 0, a: 1 }}
                      onChange={handleStrokePickerChange}
                      anchorX={pickerAnchor.x}
                      anchorY={pickerAnchor.y}
                      onClose={() => setStrokePickerOpen(false)}
                    />
                  )}
                </div>
              ) : (
                <GradientEditor
                  fillType={strokeType}
                  onFillTypeChange={handleStrokeTypeChange}
                  gradient={strokeGradient}
                  onChange={handleStrokeGradientChange}
                />
              )}
              {strokeType === 'solid' && (
                <GradientEditor
                  fillType="solid"
                  onFillTypeChange={handleStrokeTypeChange}
                  gradient={strokeGradient}
                  onChange={handleStrokeGradientChange}
                />
              )}
            </div>
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
