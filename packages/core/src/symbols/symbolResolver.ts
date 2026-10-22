/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
/**
 * Symbol Resolver — pure functions for resolving symbol instances to renderable nodes.
 * No side effects, easy to test.
 */

import type {
  Node,
  SymbolInstanceNode,
  SymbolDefinition,
  SymbolOverride,
  Rect,
  Matrix3,
} from '@quar/types';
import { mat3 } from '../math';
import { getNodeLocalBounds, transformBoundsToWorld } from '../selection/localBounds';

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  nodes: Node[];
}

const resolvedSymbolCache = new Map<string, CacheEntry>();

function buildCacheKey(symbolId: string, overrides: SymbolOverride[]): string {
  return symbolId + '|' + JSON.stringify(overrides);
}

/** Clear the entire resolver cache (call when a symbol definition changes). */
export function invalidateSymbolCache(symbolId?: string): void {
  if (symbolId) {
    // Remove all entries for this symbol
    for (const [key] of resolvedSymbolCache) {
      if (key.startsWith(symbolId + '|')) {
        resolvedSymbolCache.delete(key);
      }
    }
  } else {
    resolvedSymbolCache.clear();
  }
}

// ============================================================================
// Core Resolution
// ============================================================================

/**
 * Apply overrides to a set of cloned nodes.
 * For each override, finds the node by nodeId and shallow-merges properties.
 */
export function applyOverrides(nodes: Node[], overrides: SymbolOverride[]): Node[] {
  if (overrides.length === 0) return nodes;

  // Build a lookup map for fast access
  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  for (const override of overrides) {
    const target = nodeMap.get(override.nodeId);
    if (!target) continue; // Skip overrides for non-existent nodes
    if (typeof override.properties !== 'object' || override.properties === null) continue;

    // Shallow-merge override properties onto the node (skip structural fields)
    const props: Record<string, unknown> = override.properties;
    for (const key of Object.keys(props)) {
      if (key === 'id' || key === 'type' || key === 'parent' || key === 'children') continue;
      (target as unknown as Record<string, unknown>)[key] = props[key];
    }
  }

  return nodes;
}

/**
 * Resolve a symbol instance to renderable nodes by cloning the definition
 * and applying instance overrides. Uses cache for performance.
 */
export function resolveSymbolInstance(
  instance: SymbolInstanceNode,
  definition: SymbolDefinition
): Node[] {
  const cacheKey = buildCacheKey(instance.symbolId, instance.overrides);

  const cached = resolvedSymbolCache.get(cacheKey);
  if (cached) {
    return cached.nodes;
  }

  // Deep-clone the definition's nodes
  const clonedNodes: Node[] = structuredClone(definition.sceneGraphJSON.nodes);

  // Apply overrides
  const resolved = applyOverrides(clonedNodes, instance.overrides);

  // Cache result
  resolvedSymbolCache.set(cacheKey, { nodes: resolved });

  return resolved;
}

/** The box measured so far, grown as nodes are added to it */
interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Compute AABB bounds from a set of resolved nodes, in the symbol's own space:
 * each node's own geometry (paths and text included), placed through its
 * groups' transforms the way it is drawn. Hidden layers are left out.
 * Symbols placed inside count with their artwork when their definitions are
 * among `symbols`; `within` lists the symbols these nodes are already inside
 * of (pass the measured symbol's own id), whose instances here draw nothing.
 */
export function getSymbolBounds(
  resolvedNodes: Node[],
  symbols: readonly SymbolDefinition[] = [],
  within: ReadonlySet<string> = new Set()
): Rect {
  const extent: Extent = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  measureSymbolNodes(resolvedNodes, mat3.identity(), symbols, within, extent);

  const { minX, minY, maxX, maxY } = extent;
  if (!isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Grow `extent` by a symbol's nodes, placed through `parentMatrix`. */
function measureSymbolNodes(
  nodes: Node[],
  parentMatrix: Matrix3,
  symbols: readonly SymbolDefinition[],
  within: ReadonlySet<string>,
  extent: Extent
): void {
  const byId = new Map<string, Node>();
  for (const node of nodes) byId.set(node.id, node);

  const measured = new Set<string>();
  const measure = (node: Node, outerMatrix: Matrix3): void => {
    // A node listed under two parents (or under itself) counts once
    if (measured.has(node.id)) return;
    measured.add(node.id);
    if (!node.visible || !node.transform) return;

    const { position, rotation, scale } = node.transform;
    const matrix = mat3.multiply(outerMatrix, mat3.compose(position, rotation, scale));
    const local = getNodeLocalBounds(node);
    if (local) {
      const box = transformBoundsToWorld(local, matrix);
      // A node with broken numbers (from a damaged file) mustn't spoil the rest
      if ([box.x, box.y, box.width, box.height].every(Number.isFinite)) {
        extent.minX = Math.min(extent.minX, box.x);
        extent.minY = Math.min(extent.minY, box.y);
        extent.maxX = Math.max(extent.maxX, box.x + box.width);
        extent.maxY = Math.max(extent.maxY, box.y + box.height);
      }
    }
    // A symbol placed inside this one adds its own artwork. One it is already
    // inside of draws nothing: a symbol placed in itself would never end.
    if (node.type === 'symbol-instance' && !within.has(node.symbolId)) {
      const definition = symbols.find((d) => d.id === node.symbolId);
      if (definition) {
        const inside = new Set(within).add(node.symbolId);
        const nested = resolveSymbolInstance(node, definition);
        measureSymbolNodes(nested, matrix, symbols, inside, extent);
      }
    }
    for (const childId of node.children) {
      const child = byId.get(childId);
      if (child) measure(child, matrix);
    }
  };

  // Start from the top-level nodes: those whose parent isn't among them
  for (const node of nodes) {
    if (!node.parent || !byId.has(node.parent)) measure(node, parentMatrix);
  }
}

/**
 * Get root nodes from resolved symbol nodes (nodes without parents or
 * whose parents are in the rootNodeIds list).
 */
export function getResolvedRootNodes(resolvedNodes: Node[], definition: SymbolDefinition): Node[] {
  const rootIds = new Set<string>(definition.sceneGraphJSON.rootNodeIds);
  return resolvedNodes.filter((n) => rootIds.has(n.id));
}
