# Symbols — Reusable Components

## The One-Change-Many Problem

A user designs a button — rounded rectangle, label text, subtle shadow — and places it in twelve different locations across a multi-page project. Then the client asks for the corner radius to change from 8px to 12px. Without a reuse mechanism, the user must find all twelve buttons and manually edit each one, hoping they don't miss any. In Figma, Sketch, and every serious design tool, the answer is _components_ — a single definition that spawns any number of instances. Edit the definition once, and every instance updates automatically.

Quar Animator calls these **Symbols**. A `SymbolDefinition` is a frozen snapshot of scene graph nodes stored globally in the editor store. A `SymbolInstanceNode` sits in the actual scene graph, carrying only a `symbolId` reference and an array of `overrides`. At render time, the definition is deep-cloned, the overrides are applied, and the result is drawn as if the original nodes were present. The pattern is conceptually simple — definition plus instances — but the implementation touches nearly every system: rendering, selection, bounds computation, serialization, and editing mode.

## The Type System

Three types define the symbol system. They live in `@quar/types` where the rest of the scene graph type hierarchy is declared:

```typescript
/** Partial property replacement keyed by descendant node ID within a symbol */
export interface SymbolOverride {
  nodeId: string; // ID of descendant within symbol definition
  properties: Record<string, unknown>; // partial properties to override
}

/** Symbol definition stored in EditorStore (global, cross-page) */
export interface SymbolDefinition {
  id: string;
  name: string;
  sceneGraphJSON: { nodes: Node[]; rootNodeIds: string[] };
}

/** Scene graph node representing an instance of a symbol */
export interface SymbolInstanceNode extends BaseNode {
  type: 'symbol-instance';
  symbolId: string; // references SymbolDefinition.id
  overrides: SymbolOverride[];
}
```

The definition stores a `sceneGraphJSON` — the same `{ nodes, rootNodeIds }` structure used for pages and serialization. This is deliberate. The symbol's internal structure _is_ a scene graph, and the same `fromJSON`/`toJSON` mechanisms that power page switching can power symbol editing mode. The override system is intentionally flat: an array of `{ nodeId, properties }` entries, where `properties` is a shallow merge bag. No nested override trees, no path-based targeting — just find the node by ID and spread the properties. Simple enough to serialize, simple enough to invalidate.

The `SymbolInstanceNode` extends `BaseNode` like every other node type, which means it carries a transform, opacity, blend mode, and parent/children arrays. But its `children` array is always empty — the instance has no _real_ scene graph children. Its visual children are virtual, resolved at render time from the definition. This asymmetry creates problems that ripple through selection, bounds computation, and layer panel display.

## Resolving Instances — Pure Functions with Cache

The core resolution logic lives in `packages/core/src/symbols/symbolResolver.ts` — a pure module with no side effects, no DOM dependencies, and no store imports. Four functions do all the work:

```typescript
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
```

The cache key is `symbolId + '|' + JSON.stringify(overrides)`. This means two instances of the same symbol with identical overrides share the same resolved nodes — a significant optimization when a page has dozens of identical button instances. The `structuredClone` call ensures that modifying a resolved node (for example, during rendering) never corrupts the definition. Without deep cloning, changing a color during override application would propagate to the source definition and silently corrupt every future resolve.

The `applyOverrides` function is straightforward but deserves attention for what it _doesn't_ do:

```typescript
export function applyOverrides(nodes: Node[], overrides: SymbolOverride[]): Node[] {
  if (overrides.length === 0) return nodes;

  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  for (const override of overrides) {
    const target = nodeMap.get(override.nodeId);
    if (!target) continue;
    if (typeof override.properties !== 'object' || override.properties === null) continue;

    const props: Record<string, unknown> = override.properties;
    for (const key of Object.keys(props)) {
      (target as Record<string, unknown>)[key] = props[key];
    }
  }

  return nodes;
}
```

It shallow-merges. If an override sets `{ fills: [...] }`, the entire fills array is replaced, not merged element-by-element. This matches Figma's behavior — overriding a fill replaces the fill, not individual color channels. The function also silently skips overrides for non-existent node IDs. This is important for forward compatibility: if a user edits a symbol definition and removes a child node, existing instances might carry stale overrides for that deleted child. Rather than throwing an error, the resolver ignores them.

Cache invalidation happens through `invalidateSymbolCache`:

```typescript
export function invalidateSymbolCache(symbolId?: string): void {
  if (symbolId) {
    for (const [key] of resolvedSymbolCache) {
      if (key.startsWith(symbolId + '|')) {
        resolvedSymbolCache.delete(key);
      }
    }
  } else {
    resolvedSymbolCache.clear();
  }
}
```

The targeted invalidation iterates all cache keys and deletes those matching the symbol ID prefix. A global clear is used when the entire symbol registry changes. The store calls `invalidateSymbolCache(symbolId)` whenever a definition is updated — after exiting symbol edit mode, after deleting a symbol, after modifying overrides.

The test suite validates all of this:

```typescript
it('uses cache on second call with same overrides', () => {
  const rect = makeRect('r1');
  const def = makeDefinition('sym-1', [rect]);
  const inst = makeInstance('sym-1');

  const resolved1 = resolveSymbolInstance(inst, def);
  const resolved2 = resolveSymbolInstance(inst, def);
  expect(resolved1).toBe(resolved2); // Same reference = cache hit
});

it('invalidates cache when overrides differ', () => {
  const rect = makeRect('r1');
  const def = makeDefinition('sym-1', [rect]);
  const inst1 = makeInstance('sym-1');
  const inst2 = makeInstance('sym-1', [{ nodeId: 'r1', properties: { opacity: 0.3 } }]);

  const resolved1 = resolveSymbolInstance(inst1, def);
  const resolved2 = resolveSymbolInstance(inst2, def);
  expect(resolved1).not.toBe(resolved2);
});
```

The `toBe` check (reference equality) is the critical assertion. If two calls return the same object, the cache is working. If they return different objects with the same content, the cache is broken and performance will degrade.

## Creating Symbols — Selection to Definition

The `createSymbol` store action transforms a user's selection into a definition plus an instance. The algorithm has several non-obvious steps:

```typescript
createSymbol: (sceneGraph: SceneGraphLike): string | null => {
  const state = get();
  const selectedIds = Array.from(state.selectedNodeIds);
  if (selectedIds.length === 0) return null;

  state.pushUndo(sceneGraph);

  // Collect selected nodes + descendants
  const allNodeIds = new Set<string>();
  for (const id of selectedIds) {
    allNodeIds.add(id);
    const descendants = sceneGraph.getDescendants(id);
    for (const d of descendants) {
      allNodeIds.add(d.id);
    }
  }

  // Get root-level selected nodes (not descendants of other selected)
  const rootSelectedIds = selectedIds.filter((id) => {
    const node = sceneGraph.getNode(id);
    if (!node) return false;
    let current = node.parent;
    while (current) {
      if (allNodeIds.has(current)) return false;
      const parentNode = sceneGraph.getNode(current);
      current = parentNode?.parent ?? null;
    }
    return true;
  });
```

The first subtlety is the distinction between _all selected node IDs_ (including descendants) and _root selected IDs_ (only the top-level nodes whose parents aren't also selected). If a user selects a group and one of its children, the group is the root selected node — the child is already included as a descendant. Without this deduplication, the definition would contain duplicates and the root node list would be wrong.

The second subtlety is position re-centering:

```typescript
// Compute center of selected root nodes for instance position
let sumX = 0,
  sumY = 0,
  count = 0;
for (const id of rootSelectedIds) {
  const node = sceneGraph.getNode(id);
  if (node) {
    sumX += node.transform.position.x;
    sumY += node.transform.position.y;
    count++;
  }
}
const centerX = count > 0 ? sumX / count : 0;
const centerY = count > 0 ? sumY / count : 0;

// Re-center positions relative to instance center
for (const node of nodesForDef) {
  if (rootSelectedIds.includes(node.id)) {
    node.parent = null;
    node.transform = {
      ...node.transform,
      position: {
        x: node.transform.position.x - centerX,
        y: node.transform.position.y - centerY,
      },
    };
  }
}
```

This is crucial. The definition's root nodes get their positions shifted so they're relative to the center of the original selection. The instance node is then placed at that center. Without re-centering, rendering would double-count the position: the instance transform would add the world position, and the definition's root node transforms would add the world position again, placing the shapes at twice the correct offset.

The instance itself uses anchor `(0, 0)` — not the default `(0.5, 0.5)` used by most shapes. This avoids an additional position offset that would compound with the re-centered definition positions.

After building the definition and instance, the original nodes are removed from the scene graph and the instance replaces them:

```typescript
// Remove original nodes from scene graph
for (const id of rootSelectedIds) {
  sceneGraph.removeNode(id);
}

// Create instance node at center
const instanceNode: SymbolInstanceNode = {
  id: instanceId,
  name: symbolName,
  type: 'symbol-instance',
  parent: null,
  children: [],
  transform: {
    position: { x: centerX, y: centerY },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0, y: 0 },
    skew: { x: 0, y: 0 },
  },
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  symbolId,
  overrides: [],
};

sceneGraph.addNode(instanceNode);
```

The naming heuristic picks the first node's name for single-node symbols ("Button", "Icon") and generates a sequential name for multi-node selections ("Symbol 1", "Symbol 2"). Both the definition and the instance carry this name for display in the layer panel and symbol library.

## Rendering Symbols — The Virtual Children Problem

The ShapeRenderer encounters symbol instances during its traversal of the scene graph. When it hits a node with `type: 'symbol-instance'`, it resolves the instance, builds a node map, and recursively renders the resolved children:

```typescript
if (node.type === 'symbol-instance') {
  const inst = node as SymbolInstanceNode;
  const definition = this.symbolDefinitions.get(inst.symbolId);
  if (!definition) return false; // skip if definition missing

  const resolvedNodes = resolveSymbolInstance(inst, definition);
  const rootNodes = getResolvedRootNodes(resolvedNodes, definition);
  const nodeMap = new Map<string, Node>();
  for (const rn of resolvedNodes) nodeMap.set(rn.id, rn);

  for (const child of rootNodes) {
    this.renderResolvedNode(child, worldTransform, nodeMap);
  }
}
```

The `renderResolvedNode` method is a self-contained recursive renderer. It computes a local transform matrix from the resolved node's transform, multiplies it with the parent's world transform, and dispatches to the type-specific rendering method:

```typescript
private renderResolvedNode(
  node: Node,
  parentTransform: Matrix3,
  nodeMap: Map<string, Node>
): void {
  if (!node.visible) return;

  const localMatrix = mat3.compose(
    node.transform.position,
    node.transform.rotation,
    node.transform.scale,
    node.transform.anchor
  );
  const worldTransform = mat3.multiply(parentTransform, localMatrix);

  const savedOpacity = this.currentEffectiveOpacity;
  this.currentEffectiveOpacity *= node.opacity;

  switch (node.type) {
    case 'rectangle':
      this.renderRectangle(node, worldTransform);
      break;
    case 'ellipse':
      this.renderEllipse(node, worldTransform);
      break;
    // ... all other shape types
  }

  // Render children if this is a group
  if (node.children && node.children.length > 0) {
    for (const childId of node.children) {
      const child = nodeMap.get(childId);
      if (child) {
        this.renderResolvedNode(child, worldTransform, nodeMap);
      }
    }
  }

  this.currentEffectiveOpacity = savedOpacity;
}
```

This method cannot use the normal scene graph traversal because the resolved nodes don't exist in the scene graph — they're virtual. The `nodeMap` serves as a local lookup table, replacing `sceneGraph.getNode()` for child resolution. Groups within the symbol definition work correctly because the `children` array on each node contains IDs that point into the same map.

The ShapeRenderer needs access to the symbol definitions registry. The `setSymbolDefinitions` method receives a `Map<string, SymbolDefinition>` that the Canvas component builds from the editor store's `symbols[]` array:

```typescript
setSymbolDefinitions(defs: Map<string, SymbolDefinition>): void {
  this.symbolDefinitions = defs;
}
```

This map is rebuilt whenever the symbols array changes. The Canvas passes it before each render call, ensuring the renderer always has the latest definitions.

## Symbol Editing Mode — The fromJSON Swap

Editing a symbol definition requires showing _only_ the definition's nodes on the canvas, while hiding the rest of the scene. Quar uses the same `fromJSON`/`toJSON` technique that powers page switching — save the current scene, load the symbol's scene graph, then restore the original scene when editing finishes:

```typescript
enterSymbolEdit: (symbolId: string, sceneGraph: SceneGraphLike) => {
  const state = get();
  const definition = state.symbols.find((s) => s.id === symbolId);
  if (!definition) return;

  // Save current scene state
  const prevState = {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(state.selectedNodeIds),
  };

  // Load symbol definition into scene graph
  sceneGraph.fromJSON(structuredClone(definition.sceneGraphJSON));

  set({
    editingSymbolId: symbolId,
    editingSymbolPrevState: prevState,
    selectedNodeIds: new Set<string>(),
    enteredGroupId: null,
    isDirty: true,
  });
},
```

The key insight is that `sceneGraph.fromJSON()` atomically replaces all nodes. After this call, the canvas shows only the symbol's internal nodes — the rectangles, text, paths, and groups that make up the component. The user can edit them with all the normal tools. Selection, undo/redo, transforms, property changes — everything works because the nodes are real scene graph nodes during editing.

Exiting edit mode reverses the process:

```typescript
exitSymbolEdit: (sceneGraph: SceneGraphLike) => {
  const state = get();
  if (!state.editingSymbolId || !state.editingSymbolPrevState) return;

  // Save edited symbol definition
  const updatedSceneJSON = structuredClone(sceneGraph.toJSON());
  const updatedSymbols = state.symbols.map((s) =>
    s.id === state.editingSymbolId
      ? { ...s, sceneGraphJSON: updatedSceneJSON }
      : s
  );

  // Restore previous scene
  sceneGraph.fromJSON(
    structuredClone(state.editingSymbolPrevState.sceneData)
  );

  // Invalidate cache for this symbol
  invalidateSymbolCache(state.editingSymbolId);

  set({
    symbols: updatedSymbols,
    editingSymbolId: null,
    editingSymbolPrevState: null,
    selectedNodeIds: new Set(
      state.editingSymbolPrevState.selectedNodeIds
    ),
    enteredGroupId: null,
    isDirty: true,
  });
},
```

Three things happen: the current scene graph (which contains the edited symbol) is snapshot and written back into the definition, the previous scene is restored, and the cache for this symbol is invalidated. The cache invalidation is critical — without it, all instances of the edited symbol would continue displaying the old version until some other event triggered a cache clear.

The `structuredClone` calls during both enter and exit prevent aliasing. The previous scene state is a deep copy, not a reference. If the user modifies nodes during symbol editing and then exits, the modifications are captured in the updated definition, not leaked into the restored scene.

## Detaching Instances — Breaking the Link

Sometimes a user wants to customize an instance beyond what overrides allow — adding new children, removing existing ones, or fundamentally restructuring the content. `detachInstance` resolves the symbol to concrete nodes and wraps them in a group, permanently breaking the connection to the definition:

```typescript
detachInstance: (sceneGraph: SceneGraphLike) => {
  const state = get();
  const selectedIds = Array.from(state.selectedNodeIds);
  if (selectedIds.length !== 1) return;

  const inst = sceneGraph.getNode(selectedIds[0]!) as
    SymbolInstanceNode | undefined;
  if (!inst || inst.type !== 'symbol-instance') return;

  const definition = state.symbols.find((s) => s.id === inst.symbolId);
  if (!definition) return;

  state.pushUndo(sceneGraph);

  const resolved = resolveSymbolInstance(inst, definition);
  const rootIds = new Set(definition.sceneGraphJSON.rootNodeIds);
  const rootNodes = resolved.filter((n) => rootIds.has(n.id));

  // Create a group with the resolved children
  const groupId = `group-${Date.now()}-...`;
  const group: GroupNode = {
    id: groupId,
    name: inst.name,
    type: 'group',
    parent: inst.parent,
    children: [],
    transform: { ...inst.transform },
    visible: inst.visible,
    locked: inst.locked,
    opacity: inst.opacity,
    blendMode: inst.blendMode,
  };

  sceneGraph.removeNode(inst.id);
  sceneGraph.addNode(group, inst.parent ?? undefined);

  for (const child of rootNodes) {
    const clone = structuredClone(child);
    clone.id = `detached-${Date.now()}-...`;
    sceneGraph.addNode(clone, groupId);
  }

  set({
    selectedNodeIds: new Set([groupId]),
    isDirty: true,
  });
},
```

The detached group inherits the instance's transform, visibility, opacity, and blend mode. Each resolved child receives a fresh ID to avoid conflicts with the definition's node IDs (which might appear in other instances). The selection moves to the new group, and the definition remains untouched — other instances continue working.

Deleting a symbol definition uses the same detachment logic but applies it to _every_ instance across the scene graph:

```typescript
deleteSymbol: (symbolId: string, sceneGraph: SceneGraphLike) => {
  // Find all instances referencing this symbol
  const instancesToDetach: string[] = [];
  sceneGraph.traverse((node) => {
    if (node.type === 'symbol-instance' &&
        (node as SymbolInstanceNode).symbolId === symbolId) {
      instancesToDetach.push(node.id);
    }
  });

  // Detach each instance (convert to group)
  for (const instId of instancesToDetach) {
    // ... same resolution and group creation logic
  }

  // Remove definition
  invalidateSymbolCache(symbolId);
  set({
    symbols: state.symbols.filter((s) => s.id !== symbolId),
    isDirty: true,
  });
},
```

This ensures that deleting a symbol never leaves orphaned instances in the scene graph. Every instance gets converted to a group with the resolved content, then the definition is removed. The traversal collects all instance IDs before modifying the graph — iterating and mutating simultaneously would produce undefined behavior.

## The Symbol Library Panel

The `SymbolLibraryPanel` component provides the UI for managing symbol definitions. It displays a scrollable list of all symbols with their names, diamond icons, and instance counts:

```typescript
export default function SymbolLibraryPanel() {
  const symbols = useEditorStore((state) => state.symbols);
  const placeSymbolInstance = useEditorStore(
    (state) => state.placeSymbolInstance
  );
  const enterSymbolEdit = useEditorStore(
    (state) => state.enterSymbolEdit
  );
  const sceneGraph = useSceneGraph();

  const getInstanceCount = useCallback(
    (symbolId: string): number => {
      let count = 0;
      sceneGraph.traverse((node) => {
        if (node.type === 'symbol-instance' &&
            (node as SymbolInstanceNode).symbolId === symbolId) {
          count++;
        }
      });
      return count;
    },
    [sceneGraph]
  );
```

Instance counting traverses the entire scene graph, which is fine for small projects but would be expensive for large ones. The callback is memoized with `useCallback` and depends on `sceneGraph`, so it only recreates when the scene graph reference changes. A production optimization would maintain a reactive count map in the store, but the traversal is fast enough for the current scale.

Three interaction patterns are supported:

1. **Click** places a new instance at the canvas origin — calling `placeSymbolInstance` which adds a `SymbolInstanceNode` to the scene graph.
2. **Double-click** enters symbol editing mode — calling `enterSymbolEdit` which swaps the scene graph to show the definition's contents.
3. **Right-click** opens a context menu with Edit Symbol, Rename, and Delete Symbol options.

Inline renaming follows the same pattern as page tabs — a text input replaces the name label, commits on Enter or blur, and cancels on Escape:

```typescript
{renamingId === symbol.id ? (
  <input
    className={styles.renameInput}
    value={renameValue}
    onChange={(e) => setRenameValue(e.target.value)}
    onBlur={handleRenameCommit}
    onKeyDown={(e) => {
      if (e.key === 'Enter') handleRenameCommit();
      if (e.key === 'Escape') {
        setRenamingId(null);
        setRenameValue('');
      }
    }}
    autoFocus
  />
) : (
  <span className={styles.symbolName}>{symbol.name}</span>
)}
```

The empty state shows a helpful message: "No symbols yet. Select objects and use Edit > Create Symbol." This guides discovery — new users learn the shortcut (Ctrl+Shift+K) by reading the menu path in the empty state.

## Overrides and Reset

Per-instance overrides allow each instance to diverge from the definition without editing the definition itself. The `setInstanceOverride` action finds or creates an override entry and merges the properties:

```typescript
setInstanceOverride: (
  sceneGraph: SceneGraphLike,
  instanceId: string,
  override: SymbolOverride
) => {
  const inst = sceneGraph.getNode(instanceId) as
    SymbolInstanceNode | undefined;
  if (!inst || inst.type !== 'symbol-instance') return;

  const existingIdx = inst.overrides.findIndex(
    (o) => o.nodeId === override.nodeId
  );
  const newOverrides = [...inst.overrides];
  if (existingIdx >= 0) {
    // Merge properties
    newOverrides[existingIdx] = {
      nodeId: override.nodeId,
      properties: {
        ...newOverrides[existingIdx]!.properties,
        ...override.properties,
      },
    };
  } else {
    newOverrides.push(override);
  }

  sceneGraph.updateNode(instanceId, {
    overrides: newOverrides,
  } as Partial<Node>);
  invalidateSymbolCache(inst.symbolId);
},
```

When an override for the same node already exists, properties are merged — setting `opacity: 0.5` on a node that already has a fill color override preserves the fill override. When no override exists for that node, a new entry is pushed. After updating the instance's overrides on the scene graph node, the symbol cache is invalidated so the next render resolves the instance with the new overrides.

The `resetInstanceOverrides` action clears all overrides, restoring the instance to match the definition exactly:

```typescript
resetInstanceOverrides: (sceneGraph: SceneGraphLike, instanceId: string) => {
  sceneGraph.updateNode(instanceId, {
    overrides: [],
  } as Partial<Node>);
  invalidateSymbolCache(inst.symbolId);
},
```

## The No-Children Problem

The `SymbolInstanceNode` has `children: []` — always empty. This creates a fundamental asymmetry: every other compound node type (groups, boolean groups, artboards) has real children in the scene graph, but symbol instances have virtual children that only exist during resolution. Code that walks the scene graph tree never sees the instance's visual content.

This affects three systems:

**Bounds computation.** The `SelectionManager` computes bounds by walking a node's children. For a group, it recursively collects descendant bounds. For a symbol instance, `sceneGraph.getDescendants(instanceId)` returns an empty array. The fix is to detect the `symbol-instance` type and use `getSymbolBounds(definition.sceneGraphJSON.nodes)` instead:

```typescript
export function getSymbolBounds(resolvedNodes: Node[]): Rect {
  if (resolvedNodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  for (const node of resolvedNodes) {
    if (!node.transform) continue;
    const pos = node.transform.position;
    const scale = node.transform.scale;

    // Estimate node dimensions from type-specific properties
    let w = 0,
      h = 0;
    switch (node.type) {
      case 'rectangle':
      case 'artboard':
        w = node.width ?? 0;
        h = node.height ?? 0;
        break;
      case 'ellipse':
        w = (node.radiusX ?? 0) * 2;
        h = (node.radiusY ?? 0) * 2;
        break;
      // ... other types (TypeScript narrows the union per case)
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

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
```

This function walks the definition's nodes and computes bounds from type-specific geometry. It handles the `NaN` case (all `Infinity` values remaining when no nodes have geometry) by returning a zero-area rect.

**Layer panel.** The LayerPanel displays a tree of nodes. Symbol instances appear as leaf nodes with a diamond icon (◇) rather than expandable groups. The user cannot see or select individual children through the layer panel — they must enter symbol editing mode to interact with the definition's content.

**PropertiesPanel size display.** The `getNodeSize` helper that displays a node's dimensions in the properties panel must special-case symbol instances. It resolves the definition, calls `getSymbolBounds`, and displays the bounds dimensions rather than reading `width`/`height` properties that don't exist on the instance node.

## Serialization — Symbols Are Global

Symbols are stored at the project level, not per-page. The `ProjectDataV2` type includes an optional `symbols` array alongside pages:

```typescript
export interface ProjectDataV2 {
  version: '2.0';
  name: string;
  pages: SerializedPage[];
  activePageId: string;
  settings: {
    /* ... */
  };
  rigging?: {
    /* ... */
  };
  symbols?: SymbolDefinition[];
}
```

During serialization, the store's `symbols` array is deep-cloned into the project data. During deserialization, it's restored:

```typescript
// In serializeProject:
symbols: (editorState.symbols ? structuredClone(editorState.symbols) : [],
  // In deserializeProject:
  applyEditorState({
    // ...
    symbols: v2.symbols ?? [],
  }));
```

The `?? []` fallback handles projects saved before symbols existed — older v2.0 files don't have the field, and the empty array means the editor starts with no symbols.

Instances within pages are just regular nodes with `type: 'symbol-instance'`. They serialize like any other node — the `symbolId` field is a string that references a definition by ID. If a definition is missing during load (perhaps the file was manually edited), the renderer's `if (!definition) return false` guard silently skips rendering the orphaned instance.

## Testing the Symbol System

The test suite covers the system at three levels.

**Pure resolver tests** (19 tests in `symbolResolver.test.ts`) validate the core resolution logic — cloning, overrides, cache behavior, and bounds computation. These tests use minimal node factories and don't touch the DOM or store:

```typescript
it('returns deep clones (modifying result does not affect definition)', () => {
  const rect = makeRect('r1');
  const def = makeDefinition('sym-1', [rect]);
  const inst = makeInstance('sym-1');

  const resolved = resolveSymbolInstance(inst, def);
  (resolved[0] as RectangleNode).width = 999;
  expect(rect.width).toBe(100); // Original unchanged
});
```

**Store action tests** (13 tests in `editorStore.test.ts`) validate the CRUD operations using a mock scene graph. The mock implements `addNode`, `removeNode`, `updateNode`, `traverse`, `toJSON`, and `fromJSON` — enough to test the store actions without a real WebGL renderer:

```typescript
it('createSymbol creates definition and instance', () => {
  const sg = createMockSceneGraphForSymbols();
  const rect = makeTestRect('r1');
  sg._addTestNode(rect);

  useEditorStore.setState({ selectedNodeIds: new Set(['r1']) });
  const symbolId = useEditorStore.getState().createSymbol(sg);

  expect(symbolId).toBeTruthy();
  expect(useEditorStore.getState().symbols).toHaveLength(1);
  expect(sg.removeNode).toHaveBeenCalledWith('r1');
  expect(sg.addNode).toHaveBeenCalled();
});

it('enterSymbolEdit swaps scene graph and sets editingSymbolId', () => {
  // ... create symbol ...
  useEditorStore.getState().enterSymbolEdit(symbolId, sg);

  expect(useEditorStore.getState().editingSymbolId).toBe(symbolId);
  expect(useEditorStore.getState().editingSymbolPrevState).not.toBeNull();
});

it('exitSymbolEdit saves changes and restores scene', () => {
  // ... enter edit ...
  useEditorStore.getState().exitSymbolEdit(sg);
  expect(useEditorStore.getState().editingSymbolId).toBeNull();
});
```

**UI component tests** (10 tests in `SymbolLibraryPanel.test.tsx`) validate rendering, interaction, and context menus. They use a `SceneGraphProvider` wrapper (the panel needs `useSceneGraph()`) and set store state directly:

```typescript
it('double-click enters edit mode', () => {
  useEditorStore.setState({
    symbols: [makeSymbolDef('sym-1', 'Button')],
  });

  renderWithProvider(<SymbolLibraryPanel />);
  fireEvent.doubleClick(screen.getByTestId('symbol-item-sym-1'));

  expect(useEditorStore.getState().editingSymbolId).toBe('sym-1');
});

it('right-click shows context menu', () => {
  useEditorStore.setState({
    symbols: [makeSymbolDef('sym-1', 'Button')],
  });

  renderWithProvider(<SymbolLibraryPanel />);
  fireEvent.contextMenu(screen.getByTestId('symbol-item-sym-1'));

  expect(screen.getByText('Edit Symbol')).toBeDefined();
  expect(screen.getByText('Rename')).toBeDefined();
  expect(screen.getByText('Delete Symbol')).toBeDefined();
});
```

## Lessons

**Virtual children require explicit handling everywhere.** A `SymbolInstanceNode` with `children: []` breaks every piece of code that assumes compound nodes have real children. Bounds computation, layer panel traversal, PropertiesPanel size display, and selection manager hit testing all need special-case logic for `type === 'symbol-instance'`. The cost of the virtual-children design is paid repeatedly in client code. The benefit is that the scene graph stays clean — no phantom nodes cluttering the tree, no risk of accidentally editing a definition's node through an instance's child.

**The `fromJSON`/`toJSON` swap is a powerful reuse pattern.** Pages and symbols both need to show a different scene on the canvas without losing the current state. Both use the same three-step pattern: snapshot current state with `structuredClone(sceneGraph.toJSON())`, load new content with `sceneGraph.fromJSON()`, restore on exit. The scene graph's `fromJSON` is the universal scene swap primitive.

**Cache invalidation must be explicit and comprehensive.** The resolver cache uses `symbolId + '|' + JSON.stringify(overrides)` as the key. Any mutation to a definition (editing, renaming internal nodes, adding children) requires calling `invalidateSymbolCache(symbolId)`. Missing a single invalidation site means stale renders. The store calls invalidation in `exitSymbolEdit`, `deleteSymbol`, `setInstanceOverride`, and `resetInstanceOverrides` — every code path that can change what a resolved instance looks like.

**Position re-centering prevents double-counting.** When creating a symbol, definition node positions must be made relative to the instance center. The instance sits at the original world position; the definition nodes sit at offsets from zero. Without this, `instancePos + definitionNodePos` doubles the offset. The instance anchor is `(0, 0)` to avoid adding yet another offset term to the calculation.

**Detachment is the escape hatch.** Not every customization fits the override model. When a user needs to add a new child, restructure content, or make changes that the flat `{ nodeId, properties }` system can't express, detaching converts the instance to a regular group with concrete nodes. The link to the definition breaks permanently. This is the right trade-off — overrides handle the common case (change a color, hide a layer, update text content), and detachment handles the rest.

**Shallow-merge overrides are intentionally limited.** The override system replaces entire properties, not sub-properties. Setting `{ fills: newFills }` replaces the whole fills array. This keeps the merge logic simple and predictable — no recursive deep-merge, no array element targeting, no path expressions. If a user wants to change just one gradient stop in a fill, they must override the entire fills array. The simplicity is worth the occasional redundancy.

## What We Built

This chapter covered Figma-style reusable components — a definition/instance system where editing a symbol once updates every instance across the project:

- **`SymbolDefinition`** stores a frozen scene graph snapshot (`{ nodes, rootNodeIds }`) globally in the editor store, surviving page switches. **`SymbolInstanceNode`** is a scene graph node carrying only a `symbolId` reference and an `overrides[]` array — its `children` array is always empty.
- **`resolveSymbolInstance`** deep-clones the definition's nodes, applies overrides via shallow property merge, and caches the result by `symbolId + JSON.stringify(overrides)`. Cache hits return the same object reference; invalidation is explicit via `invalidateSymbolCache`.
- **`createSymbol`** collects selected nodes and descendants, re-centers root node positions relative to the selection's center (subtracting the average position), removes the originals from the scene graph, stores the definition, and inserts an instance at the original center with anchor `(0, 0)`.
- **Symbol editing mode** uses the same `fromJSON`/`toJSON` swap as page switching — `enterSymbolEdit` saves the current scene and loads the definition, `exitSymbolEdit` snapshots the edited definition back and restores the previous scene.
- **`detachInstance`** resolves the symbol to concrete nodes, wraps them in a group inheriting the instance's transform, and breaks the link to the definition permanently. **`deleteSymbol`** detaches all instances first, then removes the definition.
- **The ShapeRenderer** resolves instances during traversal via `renderResolvedNode`, a self-contained recursive renderer that composes transforms relative to the instance's world position and looks up children from a local `nodeMap` instead of the scene graph.
- **`SymbolLibraryPanel`** lists all definitions with diamond icons, instance counts, click-to-place, double-click-to-edit, and right-click context menus for rename and delete.
- **Overrides** support per-instance customization — `setInstanceOverride` merges properties onto existing overrides, `resetInstanceOverrides` clears them all. Stale overrides for deleted nodes are silently ignored during resolution.

The next chapter shifts from reusable content to spatial organization — Artboards, named frames that define composition boundaries, clip their children, and auto-reparent nodes dragged into or out of them.
