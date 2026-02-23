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
  if (cached) {
    return cached.nodes;
  }

  // Deep-clone the definition's nodes
  const clonedNodes: Node[] = structuredClone(definition.sceneGraphJSON.nodes) as Node[];

  // Apply overrides
  const resolved = applyOverrides(clonedNodes, instance.overrides);

  // Cache result
  resolvedSymbolCache.set(cacheKey, { nodes: resolved });

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
      case 'artboard': {
        const r = node as Record<string, unknown>;
        w = typeof r.width === 'number' && isFinite(r.width) ? r.width : 0;
        h = typeof r.height === 'number' && isFinite(r.height) ? r.height : 0;
        break;
      }
      case 'image': {
        const img = node as Record<string, unknown>;
        w = typeof img.width === 'number' && isFinite(img.width) ? img.width : 0;
        h = typeof img.height === 'number' && isFinite(img.height) ? img.height : 0;
        break;
      }
      case 'ellipse': {
        const e = node as Record<string, unknown>;
        const rx = typeof e.radiusX === 'number' && isFinite(e.radiusX) ? e.radiusX : 0;
        const ry = typeof e.radiusY === 'number' && isFinite(e.radiusY) ? e.radiusY : 0;
        w = rx * 2;
        h = ry * 2;
        break;
      }
      case 'polygon': {
        const p = node as Record<string, unknown>;
        const rad = typeof p.radius === 'number' && isFinite(p.radius) ? p.radius : 0;
        w = rad * 2;
        h = rad * 2;
        break;
      }
      default:
        // For paths, text, groups, etc. — use 0 to avoid inflating bounds
        w = 0;
        h = 0;
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
