/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
/**
 * Symbol Resolver — pure functions for resolving symbol instances to renderable nodes.
 * No side effects, easy to test.
 */

import type { Node, SymbolInstanceNode, SymbolDefinition, SymbolOverride, Rect } from '@quar/types';

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  nodes: Node[];
  key: string;
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

    // Shallow-merge override properties onto the node
    const props: Record<string, unknown> = override.properties;
    for (const key of Object.keys(props)) {
      (target as Record<string, unknown>)[key] = props[key];
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
  if (cached && cached.key === cacheKey) {
    return cached.nodes;
  }

  // Deep-clone the definition's nodes
  const clonedNodes: Node[] = structuredClone(definition.sceneGraphJSON.nodes) as Node[];

  // Apply overrides
  const resolved = applyOverrides(clonedNodes, instance.overrides);

  // Cache result
  resolvedSymbolCache.set(cacheKey, { nodes: resolved, key: cacheKey });

  return resolved;
}

/**
 * Compute AABB bounds from a set of resolved nodes.
 * Uses node transforms to estimate bounding rectangle.
 */
export function getSymbolBounds(resolvedNodes: Node[]): Rect {
  if (resolvedNodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of resolvedNodes) {
    if (!node.transform) continue;

    const pos = node.transform.position;
    const scale = node.transform.scale;

    // Estimate node dimensions from type-specific properties
    let w = 0;
    let h = 0;

    switch (node.type) {
      case 'rectangle':
      case 'artboard':
        w = (node as { width: number }).width;
        h = (node as { height: number }).height;
        break;
      case 'image':
        w = (node as { width: number }).width;
        h = (node as { height: number }).height;
        break;
      case 'ellipse': {
        const e = node as { radiusX: number; radiusY: number };
        w = e.radiusX * 2;
        h = e.radiusY * 2;
        break;
      }
      case 'polygon': {
        const p = node as { radius: number };
        w = p.radius * 2;
        h = p.radius * 2;
        break;
      }
      default:
        // For paths, text, etc. use a default estimation
        w = 100;
        h = 100;
        break;
    }

    const anchor = node.transform.anchor;
    const left = pos.x - w * anchor.x * Math.abs(scale.x);
    const bottom = pos.y - h * anchor.y * Math.abs(scale.y);
    const right = left + w * Math.abs(scale.x);
    const top = bottom + h * Math.abs(scale.y);

    minX = Math.min(minX, left);
    minY = Math.min(minY, bottom);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, top);
  }

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

/**
 * Get root nodes from resolved symbol nodes (nodes without parents or
 * whose parents are in the rootNodeIds list).
 */
export function getResolvedRootNodes(resolvedNodes: Node[], definition: SymbolDefinition): Node[] {
  const rootIds = new Set<string>(definition.sceneGraphJSON.rootNodeIds);
  return resolvedNodes.filter((n) => rootIds.has(n.id));
}
