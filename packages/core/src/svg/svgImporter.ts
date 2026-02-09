/**
 * SVG Importer
 * Orchestrator that parses, converts, and adds SVG content to the scene graph.
 */

import type { Node, Vector2 } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
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
  const {
    centerAtOrigin = true,
    scale = 1,
    position,
    parentId = null,
  } = options;

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
    const bounds = computeNodesBounds(nodes, rootIds);

    if (bounds) {
      const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
      const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;

      const targetX = position?.x ?? 0;
      const targetY = position?.y ?? 0;

      const offsetX = centerAtOrigin || position ? targetX - centerX : 0;
      const offsetY = centerAtOrigin || position ? targetY - centerY : 0;

      for (const node of nodes) {
        // Only offset root-level nodes (children are relative to parents)
        if (rootIds.includes(node.id) || !node.parent) {
          node.transform.position.x = (node.transform.position.x + offsetX) * scale;
          node.transform.position.y = (node.transform.position.y + offsetY) * scale;
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
    const node = nodes.find(n => n.id === nodeId);
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

function computeNodesBounds(nodes: Node[], rootIds: string[]): Bounds | null {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const node of nodes) {
    if (!rootIds.includes(node.id) && node.parent) continue;

    const pos = node.transform.position;
    const halfW = getNodeHalfWidth(node);
    const halfH = getNodeHalfHeight(node);

    minX = Math.min(minX, pos.x - halfW);
    maxX = Math.max(maxX, pos.x + halfW);
    minY = Math.min(minY, pos.y - halfH);
    maxY = Math.max(maxY, pos.y + halfH);
  }

  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function getNodeHalfWidth(node: Node): number {
  switch (node.type) {
    case 'rectangle': return node.width / 2;
    case 'ellipse': return node.radiusX;
    default: return 0;
  }
}

function getNodeHalfHeight(node: Node): number {
  switch (node.type) {
    case 'rectangle': return node.height / 2;
    case 'ellipse': return node.radiusY;
    default: return 0;
  }
}

function scaleNodeDimensions(node: Node, scale: number): void {
  switch (node.type) {
    case 'rectangle':
      node.width *= scale;
      node.height *= scale;
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
      break;
  }
}
