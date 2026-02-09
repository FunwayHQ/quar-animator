import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Node,
  RectangleNode,
  EllipseNode,
  PolygonNode,
  PathNode,
  ImageNode,
  Color,
  Gradient,
  Fill,
  Stroke,
} from '@quar/types';
import { Lock, Unlock, Eye, EyeOff, Plus, X, Grid3X3, Merge, Minus, Combine, Diff } from 'lucide-react';
import { useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { ScrubLabel } from '../common/ScrubLabel';
import { KeyframeIndicator } from '../common/KeyframeIndicator';
import { ColorPicker } from '../common/ColorPicker';
import { GradientEditor } from '../common/GradientEditor';
import type { FillType } from '../common/GradientEditor';
import { ImageAdjustments, DEFAULT_ADJUSTMENTS } from '../common/ImageAdjustments';
import type { ImageAdjustments as ImageAdjustmentsType } from '@quar/types';
import { createDefaultGradient, SelectionManager, getPathBounds } from '@quar/core';
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

/** Safely format a number to 1 decimal place — returns '0.0' for NaN/Infinity */
function fmt1(v: number): string {
  if (!isFinite(v)) return '0.0';
  return (Math.round(v * 10) / 10).toFixed(1);
}

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
    case 'path': {
      const pathNode = node as PathNode;
      const bounds = getPathBounds(pathNode.points, pathNode.closed);
      if (!bounds) return { width: 0, height: 0 };
      let w = bounds.width;
      let h = bounds.height;
      if (pathNode.subpaths) {
        let minX = bounds.x, maxX = bounds.x + bounds.width;
        let minY = bounds.y, maxY = bounds.y + bounds.height;
        for (const sp of pathNode.subpaths) {
          const spB = getPathBounds(sp, true);
          if (spB) {
            minX = Math.min(minX, spB.x);
            maxX = Math.max(maxX, spB.x + spB.width);
            minY = Math.min(minY, spB.y);
            maxY = Math.max(maxY, spB.y + spB.height);
          }
        }
        w = maxX - minX;
        h = maxY - minY;
      }
      const sx = pathNode.transform.scale?.x ?? 1;
      const sy = pathNode.transform.scale?.y ?? 1;
      return { width: w * sx, height: h * sy };
    }
    case 'image': {
      const imgNode = node as ImageNode;
      return { width: imgNode.width, height: imgNode.height };
    }
    case 'group': {
      if (!sceneGraph) return { width: 0, height: 0 };
      const childIds = new Set(sceneGraph.getDescendants(node.id).map((n: Node) => n.id));
      const bounds = groupBoundsManager.getSelectionBounds(childIds, sceneGraph);
      if (bounds) return { width: bounds.rect.width, height: bounds.rect.height };
      return { width: 0, height: 0 };
    }
    default:
      return { width: 0, height: 0 };
  }
}

const noop = () => {};

/** Handle ArrowUp/ArrowDown on numeric inputs: ±1 or ±10 with Shift */
function handleNumericInputKeyDown(
  e: { key: string; shiftKey: boolean; preventDefault: () => void },
  currentValue: number,
  onChange: (v: string) => void
) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const delta = e.key === 'ArrowUp' ? 1 : -1;
    const step = e.shiftKey ? 10 : 1;
    onChange(String(currentValue + delta * step));
  }
}

function getGroupPosition(node: Node, sceneGraph: SceneGraph): { x: number; y: number } {
  const childIds = new Set(sceneGraph.getDescendants(node.id).map((n: Node) => n.id));
  const bounds = groupBoundsManager.getSelectionBounds(childIds, sceneGraph);
  if (bounds) {
    return {
      x: bounds.rect.x + bounds.rect.width / 2,
      y: bounds.rect.y + bounds.rect.height / 2,
    };
  }
  return node.transform.position;
}

function isSizeEditable(node: Node): boolean {
  return node.type === 'rectangle' || node.type === 'ellipse' || node.type === 'polygon' || node.type === 'path' || node.type === 'image';
}

function getSizePropertyPaths(node: Node): { w: string; h: string } {
  switch (node.type) {
    case 'rectangle':
    case 'image':
      return { w: 'width', h: 'height' };
    case 'ellipse':
      return { w: 'radiusX', h: 'radiusY' };
    case 'polygon':
    case 'path':
      return { w: 'transform.scale.x', h: 'transform.scale.y' };
    default:
      return { w: 'width', h: 'height' };
  }
}

function getCornerRadius(node: Node): [number, number, number, number] | number | null {
  if (node.type === 'rectangle') {
    return (node as RectangleNode).cornerRadius;
  }
  if (node.type === 'image') {
    return (node as ImageNode).cornerRadius;
  }
  if (node.type === 'polygon') {
    return (node as PolygonNode).cornerRadius ?? 0;
  }
  return null;
}

function hasCornerRadius(node: Node): boolean {
  return node.type === 'rectangle' || node.type === 'image' || node.type === 'polygon';
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
  const booleanUnion = useEditorStore((state) => state.booleanUnion);
  const booleanSubtract = useEditorStore((state) => state.booleanSubtract);
  const booleanIntersect = useEditorStore((state) => state.booleanIntersect);
  const booleanExclude = useEditorStore((state) => state.booleanExclude);

  // Re-render on SceneGraph changes (any mutation)
  const [, setVersion] = useState(0);
  useEffect(() => {
    const increment = () => setVersion((v) => v + 1);
    const unsub1 = sceneGraph.on('nodeChanged', increment);
    const unsub2 = sceneGraph.on('nodeAdded', increment);
    const unsub3 = sceneGraph.on('nodeRemoved', increment);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [sceneGraph]);

  // Get the first selected node (single-selection for properties)
  const selectedId = selectedNodeIds.size > 0 ? [...selectedNodeIds][0] : null;
  const node = selectedId ? sceneGraph.getNode(selectedId) : null;

  // Detect multi-selection of shape nodes for boolean ops
  const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'polygon', 'path']);
  const multiShapeSelected = selectedNodeIds.size >= 2 && (() => {
    let shapeCount = 0;
    for (const id of selectedNodeIds) {
      const n = sceneGraph.getNode(id);
      if (n && SHAPE_TYPES.has(n.type)) shapeCount++;
      if (shapeCount >= 2) return true;
    }
    return false;
  })();

  const handlePositionChange = useCallback(
    (axis: 'x' | 'y', value: string) => {
      if (!selectedId) return;
      const num = parseFloat(value);
      if (isNaN(num)) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const { snapToGrid: snap, gridSize: grid } = useEditorStore.getState();
      // Input is visual top-left, snap it, then convert to center
      // X: visual left = world min X → center.x = snapped + width * anchor.x
      // Y: visual top = world max Y (Y-up) → center.y = snapped - height * (1 - anchor.y)
      const snappedTL = snap ? Math.round(num / grid) * grid : num;
      const anchor = currentNode.transform.anchor ?? { x: 0.5, y: 0.5 };
      const nodeSize = getNodeSize(currentNode, sceneGraph);
      const centerValue =
        axis === 'x'
          ? snappedTL + nodeSize.width * anchor.x
          : snappedTL - nodeSize.height * (1 - anchor.y);
      sceneGraph.updateNode(selectedId, {
        transform: {
          ...currentNode.transform,
          position: {
            ...currentNode.transform.position,
            [axis]: centerValue,
          },
        },
      });
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `transform.position.${axis}`, currentFrame, centerValue);
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
      if (nodeToUpdate.type === 'rectangle' || nodeToUpdate.type === 'image') {
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
      } else if (nodeToUpdate.type === 'path') {
        const pathNode = nodeToUpdate as PathNode;
        const bounds = getPathBounds(pathNode.points, pathNode.closed);
        if (bounds && bounds.width > 0 && bounds.height > 0) {
          // Include subpaths in base size
          let baseW = bounds.width;
          let baseH = bounds.height;
          if (pathNode.subpaths) {
            let minX = bounds.x, maxX = bounds.x + bounds.width;
            let minY = bounds.y, maxY = bounds.y + bounds.height;
            for (const sp of pathNode.subpaths) {
              const spB = getPathBounds(sp, true);
              if (spB) {
                minX = Math.min(minX, spB.x);
                maxX = Math.max(maxX, spB.x + spB.width);
                minY = Math.min(minY, spB.y);
                maxY = Math.max(maxY, spB.y + spB.height);
              }
            }
            baseW = maxX - minX;
            baseH = maxY - minY;
          }
          const scaleX = w / baseW;
          const scaleY = h / baseH;
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
      // Preserve existing alpha when editing hex
      const existingAlpha = fill.color?.a ?? 1;
      const colorWithAlpha = { ...color, a: existingAlpha };
      fills[index] = { ...fill, type: 'solid', color: colorWithAlpha };
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `fills.${index}.color`, currentFrame, colorWithAlpha);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleFillPickerChange = useCallback(
    (index: number, color: Color) => {
      if (!selectedId) return;
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
        // Clear gradient editing if this fill was being edited
        const editing = useEditorStore.getState().editingGradient;
        if (
          editing &&
          editing.nodeId === selectedId &&
          editing.fillIndex === index &&
          editing.source === 'fill'
        ) {
          useEditorStore.getState().clearEditingGradient();
        }
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

  const handleFillOpacityChange = useCallback(
    (index: number, value: string) => {
      if (!selectedId) return;
      const cleaned = value.replace('%', '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return;
      const clamped = Math.max(0, Math.min(1, num / 100));
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const fills = [...getNodeFills(currentNode)];
      const fill = fills[index];
      if (!fill) return;
      fills[index] = { ...fill, opacity: clamped };
      sceneGraph.updateNode(selectedId, { fills } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `fills.${index}.opacity`, currentFrame, clamped);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
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
      // Preserve existing alpha when editing hex
      const existingAlpha = stroke.color?.a ?? 1;
      const colorWithAlpha = { ...color, a: existingAlpha };
      strokes[index] = { ...stroke, color: colorWithAlpha };
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `strokes.${index}.color`, currentFrame, colorWithAlpha);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleStrokePickerChange = useCallback(
    (index: number, color: Color) => {
      if (!selectedId) return;
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

  const handleStrokeOpacityChange = useCallback(
    (index: number, value: string) => {
      if (!selectedId) return;
      const cleaned = value.replace('%', '');
      const num = parseFloat(cleaned);
      if (isNaN(num)) return;
      const clamped = Math.max(0, Math.min(1, num / 100));
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode) return;
      const strokes = [...getNodeStrokes(currentNode)];
      const stroke = strokes[index];
      if (!stroke) return;
      strokes[index] = { ...stroke, opacity: clamped };
      sceneGraph.updateNode(selectedId, { strokes } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `strokes.${index}.opacity`, currentFrame, clamped);
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
        // Clear gradient editing if this stroke was being edited
        const editing = useEditorStore.getState().editingGradient;
        if (
          editing &&
          editing.nodeId === selectedId &&
          editing.fillIndex === index &&
          editing.source === 'stroke'
        ) {
          useEditorStore.getState().clearEditingGradient();
        }
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

  // ============================================================================
  // Image adjustment handlers
  // ============================================================================

  const handleAdjustmentChange = useCallback(
    (key: keyof ImageAdjustmentsType, value: number) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode || currentNode.type !== 'image') return;
      const imgNode = currentNode as ImageNode;
      const adjustments = { ...(imgNode.adjustments ?? DEFAULT_ADJUSTMENTS), [key]: value };
      sceneGraph.updateNode(selectedId, { adjustments } as Partial<Node>);
      if (autoKeyframe) {
        addKeyframeAtFrame(selectedId, `adjustments.${key}`, currentFrame, value);
      }
    },
    [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
  );

  const handleAdjustmentReset = useCallback(
    (key: keyof ImageAdjustmentsType) => {
      if (!selectedId) return;
      const currentNode = sceneGraph.getNode(selectedId);
      if (!currentNode || currentNode.type !== 'image') return;
      const imgNode = currentNode as ImageNode;
      const adjustments = { ...(imgNode.adjustments ?? DEFAULT_ADJUSTMENTS), [key]: DEFAULT_ADJUSTMENTS[key] };
      sceneGraph.updateNode(selectedId, { adjustments } as Partial<Node>);
    },
    [selectedId, sceneGraph]
  );

  const handleAdjustmentResetAll = useCallback(() => {
    if (!selectedId) return;
    const currentNode = sceneGraph.getNode(selectedId);
    if (!currentNode || currentNode.type !== 'image') return;
    sceneGraph.updateNode(selectedId, { adjustments: { ...DEFAULT_ADJUSTMENTS } } as Partial<Node>);
  }, [selectedId, sceneGraph]);

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
      } else if (currentNode.type === 'image') {
        const img = currentNode as ImageNode;
        const newRadius = [...img.cornerRadius] as [number, number, number, number];
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

  // Snap toggle: when enabling snap, immediately snap all selected nodes to grid
  const handleToggleSnap = useCallback(() => {
    const wasSnapped = useEditorStore.getState().snapToGrid;
    toggleSnapToGrid();
    // If we just enabled snap, snap all selected nodes' top-left corners to grid
    if (!wasSnapped) {
      const { gridSize: grid } = useEditorStore.getState();
      for (const id of selectedNodeIds) {
        const n = sceneGraph.getNode(id);
        if (!n) continue;
        const a = n.transform.anchor ?? { x: 0.5, y: 0.5 };
        const ns = getNodeSize(n, sceneGraph);
        // Compute visual top-left from center (Y-up world: top = max Y)
        const tlX = n.transform.position.x - ns.width * a.x;
        const tlY = n.transform.position.y + ns.height * (1 - a.y);
        // Snap visual top-left to grid
        const snappedTLX = Math.round(tlX / grid) * grid;
        const snappedTLY = Math.round(tlY / grid) * grid;
        // Convert back to center
        const newCenterX = snappedTLX + ns.width * a.x;
        const newCenterY = snappedTLY - ns.height * (1 - a.y);
        if (newCenterX !== n.transform.position.x || newCenterY !== n.transform.position.y) {
          sceneGraph.updateNode(id, {
            transform: { ...n.transform, position: { x: newCenterX, y: newCenterY } },
          });
        }
      }
    }
  }, [toggleSnapToGrid, selectedNodeIds, sceneGraph]);

  // Color picker popover state
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState({ x: 0, y: 0 });
  const swatchRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Refs for numeric input scroll-to-adjust (position X, Y, rotation)
  const posXInputRef = useRef<HTMLInputElement>(null);
  const posYInputRef = useRef<HTMLInputElement>(null);
  const rotInputRef = useRef<HTMLInputElement>(null);

  // Stable ref for current values — updated each render, read by wheel handlers
  const numericRef = useRef({
    posX: 0,
    posY: 0,
    rotation: 0,
    isGroup: false,
    handlePositionChange: handlePositionChange,
    handleRotationChange: handleRotationChange,
  });

  // Non-passive wheel listeners for position/rotation inputs
  useEffect(() => {
    const makeHandler =
      (getValue: () => number, onChange: (v: string) => void, checkGroup: boolean) =>
      (e: WheelEvent) => {
        if (checkGroup && numericRef.current.isGroup) return;
        e.preventDefault();
        const delta = (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1);
        onChange(String(getValue() + delta));
      };

    const entries: Array<[HTMLElement, (e: WheelEvent) => void]> = [];

    if (posXInputRef.current) {
      const h = makeHandler(
        () => numericRef.current.posX,
        (v) => numericRef.current.handlePositionChange('x', v),
        true
      );
      posXInputRef.current.addEventListener('wheel', h, { passive: false });
      entries.push([posXInputRef.current, h]);
    }
    if (posYInputRef.current) {
      const h = makeHandler(
        () => numericRef.current.posY,
        (v) => numericRef.current.handlePositionChange('y', v),
        true
      );
      posYInputRef.current.addEventListener('wheel', h, { passive: false });
      entries.push([posYInputRef.current, h]);
    }
    if (rotInputRef.current) {
      const h = makeHandler(
        () => numericRef.current.rotation,
        (v) => numericRef.current.handleRotationChange(v),
        false
      );
      rotInputRef.current.addEventListener('wheel', h, { passive: false });
      entries.push([rotInputRef.current, h]);
    }

    return () => entries.forEach(([el, h]) => el.removeEventListener('wheel', h));
  }, [selectedId]);

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

  // Boolean ops section (shared across empty and single-selection views)
  const booleanOpsSection = multiShapeSelected ? (
    <div className={styles.section} data-testid="boolean-ops-section">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Boolean Operations</span>
      </div>
      <div className={styles.booleanOpsRow}>
        <button
          className={styles.booleanOpButton}
          onClick={() => booleanUnion(sceneGraph)}
          title="Union (Ctrl+Shift+U)"
          aria-label="Boolean union"
          data-testid="boolean-union"
        >
          <Merge size={14} />
          <span>Union</span>
        </button>
        <button
          className={styles.booleanOpButton}
          onClick={() => booleanSubtract(sceneGraph)}
          title="Subtract (Ctrl+Shift+D)"
          aria-label="Boolean subtract"
          data-testid="boolean-subtract"
        >
          <Minus size={14} />
          <span>Subtract</span>
        </button>
        <button
          className={styles.booleanOpButton}
          onClick={() => booleanIntersect(sceneGraph)}
          title="Intersect (Ctrl+Shift+I)"
          aria-label="Boolean intersect"
          data-testid="boolean-intersect"
        >
          <Combine size={14} />
          <span>Intersect</span>
        </button>
        <button
          className={styles.booleanOpButton}
          onClick={() => booleanExclude(sceneGraph)}
          title="Exclude (Ctrl+Shift+X)"
          aria-label="Boolean exclude"
          data-testid="boolean-exclude"
        >
          <Diff size={14} />
          <span>Exclude</span>
        </button>
      </div>
    </div>
  ) : null;

  if (!node) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>Properties</h3>
        </div>
        <div className={styles.content}>
          {booleanOpsSection}
          {!multiShapeSelected && (
            <div className={styles.emptyState} data-testid="properties-empty">
              Select an object to view properties
            </div>
          )}
        </div>
      </div>
    );
  }

  // After the early return above, selectedId is guaranteed non-null
  const nodeId = selectedId as string;

  const isGroup = node.type === 'group';
  const size = getNodeSize(node, sceneGraph);
  // Display top-left corner position (not center)
  const center = isGroup ? getGroupPosition(node, sceneGraph) : node.transform.position;
  const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };
  // Visual top-left on screen: left edge (world min X), top edge (world max Y in Y-up)
  const pos = {
    x: center.x - size.width * anchor.x,
    y: center.y + size.height * (1 - anchor.y),
  };
  const rotation = node.transform.rotation;

  // Keep numericRef in sync for wheel handlers
  numericRef.current = {
    posX: pos.x,
    posY: pos.y,
    rotation,
    isGroup,
    handlePositionChange,
    handleRotationChange,
  };

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
        {booleanOpsSection}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Transform</span>
            <button
              className={`${styles.snapButton} ${snapToGrid ? styles.snapButtonActive : ''}`}
              onClick={handleToggleSnap}
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
                  state={getKeyframeState(timeline, nodeId, 'transform.position.x', currentFrame)}
                  onToggle={() => toggleKeyframe('transform.position.x', pos.x)}
                />
              </div>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="X"
                    value={Math.round(pos.x) || 0}
                    onChange={(v) => handlePositionChange('x', String(v))}
                  />
                  <input
                    ref={posXInputRef}
                    id="prop-pos-x"
                    type="text"
                    className={styles.input}
                    value={fmt1(pos.x)}
                    onChange={(e) => handlePositionChange('x', e.target.value)}
                    onKeyDown={(e) => {
                      handleNumericInputKeyDown(e, pos.x, (v) => handlePositionChange('x', v));
                    }}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="Y"
                    value={Math.round(pos.y) || 0}
                    onChange={(v) => handlePositionChange('y', String(v))}
                  />
                  <input
                    ref={posYInputRef}
                    type="text"
                    className={styles.input}
                    value={fmt1(pos.y)}
                    onChange={(e) => handlePositionChange('y', e.target.value)}
                    onKeyDown={(e) => {
                      handleNumericInputKeyDown(e, pos.y, (v) => handlePositionChange('y', v));
                    }}
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
                  state={getKeyframeState(timeline, nodeId, sizePaths.w, currentFrame)}
                  onToggle={() => toggleKeyframe(sizePaths.w, size.width)}
                />
              </div>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="W"
                    value={Math.round(size.width) || 0}
                    onChange={(v) => handleSizeChange('width', String(v))}
                    min={1}
                  />
                  <input
                    id="prop-size-w"
                    type="text"
                    className={styles.input}
                    value={fmt1(size.width)}
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
                    value={Math.round(size.height) || 0}
                    onChange={isGroup ? noop : (v) => handleSizeChange('height', String(v))}
                    min={1}
                  />
                  <input
                    type="text"
                    className={styles.input}
                    value={fmt1(size.height)}
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

                if (node.type === 'rectangle' || node.type === 'image') {
                  const corners = cr as [number, number, number, number];
                  const uniformValue = Math.round(corners[0]);
                  return (
                    <div className={styles.propertyRow} data-testid="corner-radius-section">
                      <div className={styles.propertyHeader}>
                        <span className={styles.propertyLabel}>Corner Radius</span>
                        <KeyframeIndicator
                          state={getKeyframeState(timeline, nodeId, 'cornerRadius.0', currentFrame)}
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
                              value={fmt1(corners[0])}
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
                                value={Math.round(corners[0]) || 0}
                                onChange={(v) => handleCornerRadiusChange(String(v), 0)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={fmt1(corners[0])}
                                onChange={(e) => handleCornerRadiusChange(e.target.value, 0)}
                              />
                            </div>
                            <div className={styles.inputGroup}>
                              <ScrubLabel
                                label="TR"
                                value={Math.round(corners[1]) || 0}
                                onChange={(v) => handleCornerRadiusChange(String(v), 1)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={fmt1(corners[1])}
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
                                value={Math.round(corners[3]) || 0}
                                onChange={(v) => handleCornerRadiusChange(String(v), 3)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={fmt1(corners[3])}
                                onChange={(e) => handleCornerRadiusChange(e.target.value, 3)}
                              />
                            </div>
                            <div className={styles.inputGroup}>
                              <ScrubLabel
                                label="BR"
                                value={Math.round(corners[2]) || 0}
                                onChange={(v) => handleCornerRadiusChange(String(v), 2)}
                                min={0}
                              />
                              <input
                                type="text"
                                className={styles.input}
                                value={fmt1(corners[2])}
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
                        state={getKeyframeState(timeline, nodeId, 'cornerRadius', currentFrame)}
                        onToggle={() => toggleKeyframe('cornerRadius', polyRadius)}
                      />
                    </div>
                    <div className={styles.propertyInputs}>
                      <div className={styles.inputGroup}>
                        <ScrubLabel
                          label="CR"
                          value={Math.round(polyRadius) || 0}
                          onChange={(v) => handleCornerRadiusChange(String(v))}
                          min={0}
                        />
                        <input
                          type="text"
                          className={styles.input}
                          value={fmt1(polyRadius)}
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
                  state={getKeyframeState(timeline, nodeId, 'transform.rotation', currentFrame)}
                  onToggle={() => toggleKeyframe('transform.rotation', rotation)}
                />
              </div>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <ScrubLabel
                    label="R"
                    value={Math.round(rotation) || 0}
                    onChange={(v) => handleRotationChange(String(v))}
                    sensitivity={1}
                    min={-360}
                    max={360}
                  />
                  <input
                    ref={rotInputRef}
                    id="prop-rotation"
                    type="text"
                    className={styles.input}
                    value={`${fmt1(rotation)}\u00B0`}
                    onChange={(e) => handleRotationChange(e.target.value)}
                    onKeyDown={(e) => handleNumericInputKeyDown(e, rotation, handleRotationChange)}
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
                              nodeId,
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
                                  color={fill.color || { r: 0, g: 0, b: 0, a: 1 }}
                                  onChange={(c) => handleFillPickerChange(index, c)}
                                  anchorX={pickerAnchor.x}
                                  anchorY={pickerAnchor.y}
                                  onClose={closePicker}
                                  showAlpha
                                />
                              )}
                            </>
                          )}
                          <input
                            type="text"
                            className={styles.opacityInput}
                            value={`${Math.round(fill.opacity * 100)}%`}
                            onChange={(e) => handleFillOpacityChange(index, e.target.value)}
                            title="Fill opacity"
                            aria-label={`Fill opacity: ${Math.round(fill.opacity * 100)}%`}
                            data-testid={`fill-opacity-${index}`}
                          />
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
                          onActivate={() => {
                            if (selectedId) {
                              useEditorStore.getState().setEditingGradient({
                                nodeId: selectedId,
                                fillIndex: index,
                                source: 'fill',
                              });
                            }
                          }}
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
                              nodeId,
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
                                  color={stroke.color || { r: 0, g: 0, b: 0, a: 1 }}
                                  onChange={(c) => handleStrokePickerChange(index, c)}
                                  anchorX={pickerAnchor.x}
                                  anchorY={pickerAnchor.y}
                                  onClose={closePicker}
                                  showAlpha
                                />
                              )}
                            </>
                          )}
                          <input
                            type="text"
                            className={styles.opacityInput}
                            value={`${Math.round(stroke.opacity * 100)}%`}
                            onChange={(e) => handleStrokeOpacityChange(index, e.target.value)}
                            title="Stroke opacity"
                            aria-label={`Stroke opacity: ${Math.round(stroke.opacity * 100)}%`}
                            data-testid={`stroke-opacity-${index}`}
                          />
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
                          onActivate={() => {
                            if (selectedId) {
                              useEditorStore.getState().setEditingGradient({
                                nodeId: selectedId,
                                fillIndex: index,
                                source: 'stroke',
                              });
                            }
                          }}
                        />
                        <div className={styles.strokeSubRow}>
                          <div className={`${styles.inputGroup} ${styles.inputGroupFlex}`}>
                            <ScrubLabel
                              label="W"
                              value={Math.round(stroke.width * 10) / 10 || 0}
                              onChange={(v) => handleStrokeWidthChange(index, v)}
                              sensitivity={0.5}
                              min={0.5}
                              max={100}
                            />
                            <input
                              type="text"
                              className={styles.input}
                              value={fmt1(stroke.width)}
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
                                {a[0]!.toUpperCase()}
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
                  state={getKeyframeState(timeline, nodeId, 'opacity', currentFrame)}
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

        {/* Image Adjustments — shown only for image nodes */}
        {node.type === 'image' && (
          <div className={styles.section} data-testid="image-adjustments-section">
            <ImageAdjustments
              adjustments={(node as ImageNode).adjustments ?? DEFAULT_ADJUSTMENTS}
              onChange={handleAdjustmentChange}
              onReset={handleAdjustmentReset}
              onResetAll={handleAdjustmentResetAll}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PropertiesPanel;
