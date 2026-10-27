/**
 * SVG Importer
 * Orchestrator that parses, converts, and adds SVG content to the scene graph.
 */

import type { Matrix3, Node, Vector2 } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import { mat3 } from '../math';
import { getNodeLocalBounds } from '../gradient/gradientUtils';
import { parseSvg } from './svgParser';
import { convertSvgToNodes } from './svgConverter';

// ============================================================================
// Types
// ============================================================================

export interface SvgImportOptions {
  /** Center imported content at world origin (default: true) */
  centerAtOrigin?: boolean;
  /** Scale factor (default: 1) */
  scale?: number;
  /** Target position in world coords */
  position?: Vector2;
  /** Import into this parent group (null = root) */
  parentId?: string | null;
}

export interface SvgImportResult {
  /** All imported nodes */
  nodes: Node[];
  /** IDs of root-level imported nodes */
  rootIds: string[];
  /** Non-fatal warnings encountered during import */
  warnings: string[];
}

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Import an SVG string into a SceneGraph.
 *
 * @param svgString - The raw SVG string
 * @param sceneGraph - The target SceneGraph to add nodes to
 * @param generateId - ID generator function
 * @param options - Import options (centering, scaling, position)
 * @returns Import result with nodes, root IDs, and warnings
 */
export function importSvg(
  svgString: string,
  sceneGraph: SceneGraph,
  generateId: () => string,
  options: SvgImportOptions = {}
): SvgImportResult {
  const { centerAtOrigin = true, scale = 1, position, parentId = null } = options;

  const warnings: string[] = [];

  // Step 1: Parse SVG
  let parsed;
  try {
    parsed = parseSvg(svgString);
  } catch (e) {
    warnings.push(`SVG parse error: ${e instanceof Error ? e.message : String(e)}`);
    return { nodes: [], rootIds: [], warnings };
  }

  if (parsed.elements.length === 0) {
    warnings.push('SVG contains no visible elements');
    return { nodes: [], rootIds: [], warnings };
  }

  // Step 2: Convert to Quar nodes
  const { nodes, rootIds } = convertSvgToNodes(parsed, generateId);

  if (nodes.length === 0) {
    warnings.push('No convertible elements found in SVG');
    return { nodes: [], rootIds: [], warnings };
  }

  // Step 3: Compute bounds and apply transformations
  if (centerAtOrigin || position || scale !== 1) {
    const bounds = computeNodesBounds(nodes);

    if (bounds) {
      const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
      const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;

      // Moving to a target scales about the artwork's center, which lands on
      // the target; scaling alone scales about the origin
      const reposition = centerAtOrigin || !!position;
      const fromX = reposition ? centerX : 0;
      const fromY = reposition ? centerY : 0;
      const toX = reposition ? (position?.x ?? 0) : 0;
      const toY = reposition ? (position?.y ?? 0) : 0;

      for (const node of nodes) {
        const pos = node.transform.position;
        if (rootIds.includes(node.id) || !node.parent) {
          pos.x = (pos.x - fromX) * scale + toX;
          pos.y = (pos.y - fromY) * scale + toY;
        } else {
          // In its group's space, which moves with the group: its offset
          // from the group's origin scales with the shapes
          pos.x *= scale;
          pos.y *= scale;
        }

        // Scale dimensions for shape nodes
        if (scale !== 1) {
          scaleNodeDimensions(node, scale);
        }
      }
    }
  }

  // Step 4: Add nodes to scene graph
  // Add nodes in dependency order (parents before children)
  const added = new Set<string>();

  const addNode = (nodeId: string) => {
    if (added.has(nodeId)) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // If this node has a parent in the import, add parent first
    if (node.parent && !added.has(node.parent)) {
      addNode(node.parent);
    }

    // Determine the scene graph parent
    let sgParent: string | undefined;
    if (node.parent && added.has(node.parent)) {
      sgParent = node.parent;
    } else if (parentId) {
      sgParent = parentId;
    }

    // Reset parent/children before adding (SceneGraph.addNode manages these)
    node.parent = null;
    const children = [...node.children];
    node.children = [];

    sceneGraph.addNode(node, sgParent);
    added.add(node.id);

    // Re-store expected children so we can add them
    node.children = []; // SceneGraph.addNode will rebuild this
    for (const childId of children) {
      addNode(childId);
    }
  };

  for (const rootId of rootIds) {
    addNode(rootId);
  }

  return { nodes, rootIds, warnings };
}

// ============================================================================
// Bounds Calculation
// ============================================================================

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Where the imported artwork lies: every shape's bounds, placed by its own
 * transform and its groups' as the scene graph will place them. Groups have
 * no area of their own; taken as a point at their origin, they centered an
 * SVG wrapped in a <g> on that point instead of on its artwork.
 */
function computeNodesBounds(nodes: Node[]): Bounds | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const worlds = new Map<string, Matrix3>();
  const worldMatrix = (node: Node): Matrix3 => {
    const known = worlds.get(node.id);
    if (known) return known;
    // Composed as the scene graph composes it: no anchor
    const { position, rotation, scale } = node.transform;
    const local = mat3.compose(position, rotation, scale);
    const parent = node.parent ? byId.get(node.parent) : undefined;
    const world = parent ? mat3.multiply(worldMatrix(parent), local) : local;
    worlds.set(node.id, world);
    return world;
  };

  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  for (const node of nodes) {
    if (node.type === 'group') continue;

    const world = worldMatrix(node);
    const [x0, y0, x1, y1] = getNodeLocalBounds(node);
    for (const corner of [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]) {
      const p = mat3.transformPoint(world, corner);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function scaleNodeDimensions(node: Node, scale: number): void {
  // Outlines grow with the artwork (an icon's 2-unit stroke, drawn at twice the size, is 4)
  if ('strokes' in node && node.strokes) {
    node.strokes = node.strokes.map((stroke) => ({
      ...stroke,
      width: stroke.width * scale,
      ...(stroke.dashArray && { dashArray: stroke.dashArray.map((dash) => dash * scale) }),
      ...(stroke.dashOffset !== undefined && { dashOffset: stroke.dashOffset * scale }),
    }));
  }
  switch (node.type) {
    case 'rectangle':
      node.width *= scale;
      node.height *= scale;
      node.cornerRadius = node.cornerRadius.map(
        (radius) => radius * scale
      ) as typeof node.cornerRadius;
      break;
    case 'ellipse':
      node.radiusX *= scale;
      node.radiusY *= scale;
      break;
    case 'path':
      for (const point of node.points) {
        point.position.x *= scale;
        point.position.y *= scale;
        if (point.handleIn) {
          point.handleIn.x *= scale;
          point.handleIn.y *= scale;
        }
        if (point.handleOut) {
          point.handleOut.x *= scale;
          point.handleOut.y *= scale;
        }
      }
      if (node.subpaths) {
        for (const sp of node.subpaths) {
          for (const point of sp) {
            point.position.x *= scale;
            point.position.y *= scale;
            if (point.handleIn) {
              point.handleIn.x *= scale;
              point.handleIn.y *= scale;
            }
            if (point.handleOut) {
              point.handleOut.x *= scale;
              point.handleOut.y *= scale;
            }
          }
        }
      }
      break;
  }
}
