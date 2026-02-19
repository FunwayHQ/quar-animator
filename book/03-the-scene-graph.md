# The Scene Graph

## The Data Structure at the Heart of Every Graphic Editor

Open any graphic editor — Figma, Photoshop, Illustrator, Animate — and look at the Layers panel. You'll see a tree of elements: groups containing groups containing shapes. Drag a layer into a group, and the shape moves with it. Hide a group, and all its children disappear. Rotate a group, and every shape inside rotates with it.

This tree is a _scene graph_. It's the central data structure of the application — the single source of truth for what exists in the document and how it's organized. Every other system reads from it: the renderer traverses it to draw shapes, the selection tool queries it for hit testing, the properties panel binds to it for editing, the serializer converts it to JSON for saving. The scene graph doesn't depend on any of these systems, but they all depend on it.

This chapter builds the scene graph from scratch: its type system, CRUD operations, hierarchical transform computation, traversal methods, serialization, and event system. By the end, you'll have a tree data structure that can represent any document structure a graphic editor needs.

## Why a Tree, Not a Flat List

The simplest possible document structure is an array of objects:

```typescript
const shapes = [
  { id: 'rect-1', x: 100, y: 200, width: 50, height: 50 },
  { id: 'rect-2', x: 300, y: 200, width: 80, height: 40 },
];
```

This works for a drawing app where every shape is independent. But the moment users want to group shapes, move them together, nest groups inside groups, or control visibility/opacity at the group level, a flat list becomes a liability. You'd need parallel data structures to track "which shapes belong to which group," and every operation (move, delete, serialize) would need to maintain consistency across them.

A tree makes these relationships native. A group _contains_ its children. Deleting a group deletes its children. Moving a group moves its children. The hierarchy _is_ the data.

Here's the same document as a tree:

```
Root
├── rect-1
└── group-1
    ├── rect-2
    └── rect-3
```

The tree isn't just for groups. Artboards contain children. Boolean operations combine children. Symbol instances reference definition trees. Every hierarchical relationship in a graphic editor maps naturally to parent-child relationships in a tree.

## Node Types

Before building the tree, we need to define what lives in it. Every node in our scene graph shares a common base:

```typescript
export interface BaseNode {
  id: string;
  name: string;
  type: NodeType;
  parent: string | null;
  children: string[];
  transform: Transform;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  effects?: Effect[];
  exports?: ExportSetting[];
}
```

Let's go through each field:

**`id: string`** — A unique identifier. We use `crypto.randomUUID()` at creation time. IDs are permanent — they survive serialization, undo/redo, and clipboard operations. Every reference between nodes uses IDs, not object references. This makes the graph serializable as plain JSON.

**`name: string`** — Display name for the Layers panel. Defaults to the type ("Rectangle", "Path"), but users can rename.

**`type: NodeType`** — A discriminated union tag. TypeScript uses this for type narrowing: when `node.type === 'rectangle'`, the compiler knows `node` has `width` and `height` properties.

**`parent: string | null`** — ID of the parent node, or `null` for root-level nodes. This is the upward link in our tree. Together with `children`, it lets us traverse both up (ancestors) and down (descendants).

**`children: string[]`** — Ordered list of child node IDs. The order matters — it determines rendering order (last child draws on top) and display order in the Layers panel.

**`transform: Transform`** — Position, rotation, scale, anchor, and skew. We'll cover this in detail in the next section.

**`visible: boolean`** and **`locked: boolean`** — Visibility controls rendering (invisible nodes skip rendering and hit testing). Locked nodes can't be selected or edited.

**`opacity: number`** — 0 to 1. Group opacity is multiplicative: a shape at 0.8 opacity inside a group at 0.5 opacity renders at 0.4 effective opacity.

**`blendMode: BlendMode`** — One of 16 blend modes (normal, multiply, screen, overlay, etc.) that control how the node composites with content below it.

### The Node Type Union

Each shape type extends `BaseNode` with its specific properties:

```typescript
export interface RectangleNode extends BaseNode {
  type: 'rectangle';
  width: number;
  height: number;
  cornerRadius: [number, number, number, number];
  fills: Fill[];
  strokes: Stroke[];
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  radiusX: number;
  radiusY: number;
  fills: Fill[];
  strokes: Stroke[];
}

export interface PathNode extends BaseNode {
  type: 'path';
  points: PathPoint[];
  subpaths?: PathPoint[][];
  closed: boolean;
  fillRule?: 'nonzero' | 'evenodd';
  fills: Fill[];
  strokes: Stroke[];
}

export interface GroupNode extends BaseNode {
  type: 'group';
  booleanOp?: BooleanOp;
}
```

The full `Node` type is a union of all node types:

```typescript
export type Node =
  | GroupNode
  | RectangleNode
  | EllipseNode
  | PolygonNode
  | PathNode
  | TextNode
  | ImageNode
  | ArtboardNode
  | SymbolInstanceNode;
```

This union grows as you add features — we started with four types (group, rectangle, ellipse, path) and ended with nine. The `type` discriminant makes it safe to add new types without breaking existing code: a `switch (node.type)` that doesn't handle the new type gets a compile error if you've configured `noFallthroughCasesInSwitch`.

### The Transform Type

Every node has a transform that positions it in space:

```typescript
export interface Transform {
  position: Vector2; // Translation in world units
  rotation: number; // Degrees (not radians)
  scale: Vector2; // Separate X and Y scale
  anchor: Vector2; // 0-1 normalized pivot point
  skew: Vector2; // Skew in radians
}
```

The **anchor** is perhaps the least intuitive field. It defines the point around which rotation and scaling occur, expressed as a fraction of the node's dimensions. An anchor of `(0.5, 0.5)` means "center of the shape." An anchor of `(0, 0)` means "bottom-left corner" (we use Y-up coordinates). Changing the anchor doesn't move the shape on screen — it changes where the shape considers its origin to be.

We store rotation in degrees, not radians. This is a deliberate UX decision: the Properties Panel shows "45" not "0.7854". Conversion to radians happens at the math layer when computing matrices. Storing degrees also avoids floating-point drift from repeated degree-to-radian-to-degree conversions during editing.

### Fills and Strokes as Arrays

An early design decision was storing fills and strokes as arrays rather than single values:

```typescript
fills: Fill[];
strokes: Stroke[];
```

Figma allows multiple fills and strokes on a single shape — a gradient fill over a solid fill, or a thin stroke with a thick stroke underneath. Even if your editor only supports one fill, using an array from the start means you never need to migrate data when you add multi-fill support later. We initially used singular `fill` and `stroke` properties and had to write a migration function when we switched to arrays — a migration that still runs today whenever loading legacy files.

Each fill has a type, color, gradient, opacity, and visibility:

```typescript
export interface Fill {
  type: 'solid' | 'gradient' | 'none';
  color?: Color;
  gradient?: Gradient;
  opacity: number;
  visible: boolean;
}
```

The `visible` toggle lets users hide individual fills without deleting them — important for experimentation.

## The SceneGraph Class

With the types defined, here's the class that manages the tree:

```typescript
export class SceneGraph {
  private nodes: Map<string, Node> = new Map();
  private rootNodeIds: string[] = [];
  private worldTransformCache: Map<string, Matrix3> = new Map();
  private listeners: Map<SceneGraphEventType, Set<EventCallback>> = new Map();
}
```

Four data structures:

1. **`nodes: Map<string, Node>`** — The node lookup table. `Map` gives us O(1) access by ID, which matters when the renderer needs to look up hundreds of nodes per frame.

2. **`rootNodeIds: string[]`** — IDs of top-level nodes (those without a parent). This array defines root-level ordering. We could compute it by filtering the Map for nodes with `parent === null`, but that's O(n) for every traversal start. A dedicated array makes it O(1).

3. **`worldTransformCache: Map<string, Matrix3>`** — Cached world-space transform matrices, lazily computed and invalidated when any transform in the parent chain changes. More on this in the Transform section.

4. **`listeners: Map<SceneGraphEventType, Set<EventCallback>>`** — Event subscribers for reactive UI updates.

### CRUD Operations

**Adding a node** involves three steps: store it in the Map, link it to its parent (or the root list), and emit an event:

```typescript
addNode(node: Node, parentId?: string): void {
  if (this.nodes.has(node.id)) {
    throw new Error(`Node with id "${node.id}" already exists`);
  }

  this.nodes.set(node.id, node);

  if (parentId) {
    const parent = this.nodes.get(parentId);
    if (!parent) {
      throw new Error(`Parent node "${parentId}" not found`);
    }
    node.parent = parentId;
    parent.children.push(node.id);
  } else {
    node.parent = null;
    this.rootNodeIds.push(node.id);
  }

  this.invalidateWorldTransform(node.id);
  this.emit({ type: 'nodeAdded', nodeId: node.id, parentId });
}
```

The duplicate ID check is important. Without it, a paste operation that reuses IDs from the copied nodes would silently overwrite existing nodes. We throw rather than silently failing because a duplicate ID indicates a logic bug in the caller — the paste code should generate fresh IDs before adding nodes.

**Removing a node** is recursive — it removes the node and all its descendants, bottom-up:

```typescript
removeNode(id: string): void {
  const node = this.nodes.get(id);
  if (!node) return;

  // Remove all children first (recursively)
  const children = [...node.children];
  for (const childId of children) {
    this.removeNode(childId);
  }

  // Remove from parent's children array
  if (node.parent) {
    const parent = this.nodes.get(node.parent);
    if (parent) {
      const index = parent.children.indexOf(id);
      if (index !== -1) {
        parent.children.splice(index, 1);
      }
    }
  } else {
    const index = this.rootNodeIds.indexOf(id);
    if (index !== -1) {
      this.rootNodeIds.splice(index, 1);
    }
  }

  this.nodes.delete(id);
  this.worldTransformCache.delete(id);
  this.emit({ type: 'nodeRemoved', nodeId: id });
}
```

Notice `const children = [...node.children]` — we clone the array before iterating. Each recursive `removeNode` call modifies `node.children` via `splice`, so iterating over the original array while mutating it would skip elements. This is a classic pitfall.

**Moving a node** (reparenting) is the most complex operation. It must remove the node from its old parent, add it to its new parent at the specified index, and — critically — prevent circular references:

```typescript
moveNode(id: string, newParentId: string | null, index?: number): void {
  const node = this.nodes.get(id);
  if (!node) return;

  // Prevent circular references
  if (newParentId && this.isAncestorOf(id, newParentId)) {
    throw new Error(
      `Cannot move node "${id}" to descendant "${newParentId}"`
    );
  }

  // Remove from old parent
  if (node.parent) {
    const oldParent = this.nodes.get(node.parent);
    if (oldParent) {
      const oldIndex = oldParent.children.indexOf(id);
      if (oldIndex !== -1) {
        oldParent.children.splice(oldIndex, 1);
      }
    }
  } else {
    const rootIndex = this.rootNodeIds.indexOf(id);
    if (rootIndex !== -1) {
      this.rootNodeIds.splice(rootIndex, 1);
    }
  }

  // Add to new parent
  if (newParentId) {
    const newParent = this.nodes.get(newParentId);
    if (!newParent) throw new Error(`Parent "${newParentId}" not found`);
    node.parent = newParentId;
    if (index !== undefined) {
      newParent.children.splice(index, 0, id);
    } else {
      newParent.children.push(id);
    }
  } else {
    node.parent = null;
    if (index !== undefined) {
      this.rootNodeIds.splice(index, 0, id);
    } else {
      this.rootNodeIds.push(id);
    }
  }

  this.invalidateWorldTransform(id);
  this.emit({ type: 'nodeMoved', nodeId: id, parentId: newParentId });
}
```

The circular reference check uses `isAncestorOf`, which walks the parent chain of the proposed new parent to see if the moving node appears anywhere in it:

```typescript
private isAncestorOf(ancestorId: string, nodeId: string): boolean {
  let currentId: string | null = nodeId;
  while (currentId) {
    if (currentId === ancestorId) return true;
    const current = this.nodes.get(currentId);
    if (!current) break;
    currentId = current.parent;
  }
  return false;
}
```

Without this check, dragging a group into one of its own children would create a cycle, and every traversal would loop infinitely.

**Updating a node** is deceptively simple:

```typescript
updateNode(id: string, updates: Partial<Node>): void {
  const node = this.nodes.get(id);
  if (!node) return;

  Object.assign(node, updates);

  if ('transform' in updates) {
    this.invalidateWorldTransform(id);
  }

  this.emit({ type: 'nodeChanged', nodeId: id });
}
```

`Object.assign` merges the updates into the existing node. If the transform changed, we invalidate the world transform cache for this node and all its descendants (since their world transforms depend on their parent's). The `nodeChanged` event triggers UI updates — the Properties Panel re-reads the node's values, the canvas re-renders.

## Hierarchical Transforms

The transform section of the scene graph is where the tree structure pays off. When a group rotates, all its children rotate with it — not because we manually rotate each child, but because each child's _world transform_ is computed by multiplying its local transform with its parent's world transform.

### Local vs. World Space

A node's `transform.position` is in _local space_ — relative to its parent. A shape at position `(50, 30)` inside a group at position `(100, 200)` appears at world position `(150, 230)` (simplified — rotation and scale complicate this).

The world transform is the accumulated result of applying every ancestor's transform in sequence. It's represented as a 2D affine transformation matrix:

```typescript
export interface Matrix3 {
  a: number; // scaleX * cos(rotation)
  b: number; // scaleX * sin(rotation)
  c: number; // -scaleY * sin(rotation)
  d: number; // scaleY * cos(rotation)
  tx: number; // translateX
  ty: number; // translateY
}
```

This 3x3 matrix (stored as 6 numbers since the bottom row is always `[0, 0, 1]`) can represent any combination of translation, rotation, scale, and skew in a single value. Multiplying two matrices combines their transforms.

### Computing the Local Matrix

A node's local transform is composed from its transform properties in a specific order: translate → rotate → scale → anchor offset:

```typescript
compose(
  position: Vector2,
  rotation: number,
  scale: Vector2,
  anchor: Vector2 = { x: 0, y: 0 }
): Matrix3 {
  const rad = rotation * (Math.PI / 180);

  let m = mat3.identity();
  m = mat3.translate(m, position.x, position.y);
  m = mat3.rotate(m, rad);
  m = mat3.scale(m, scale.x, scale.y);
  m = mat3.translate(m, -anchor.x, -anchor.y);

  return m;
}
```

The order matters. Matrix multiplication is not commutative — translating then rotating produces a different result than rotating then translating. Our order means:

1. Start at the origin
2. Translate to the node's position
3. Rotate around that position
4. Scale from that position
5. Offset by the negative anchor (so the anchor point sits at the position)

The anchor offset being _last_ (innermost, applied first to points) means the shape's geometry is shifted so that its anchor point aligns with the transform's position. A rectangle with anchor `(0.5, 0.5)` and position `(100, 100)` has its center at `(100, 100)`, not its corner.

### Computing the World Matrix

The world transform combines a node's local matrix with its parent chain:

```typescript
getWorldTransform(id: string): Matrix3 {
  const cached = this.worldTransformCache.get(id);
  if (cached) return cached;

  const node = this.nodes.get(id);
  if (!node) return mat3.identity();

  const localMatrix = this.computeLocalMatrix(node.transform);

  let worldMatrix: Matrix3;
  if (node.parent) {
    const parentWorld = this.getWorldTransform(node.parent);
    worldMatrix = mat3.multiply(parentWorld, localMatrix);
  } else {
    worldMatrix = localMatrix;
  }

  this.worldTransformCache.set(id, worldMatrix);
  return worldMatrix;
}
```

This is recursive — to get a child's world transform, we first get the parent's world transform (which may recurse to the grandparent, etc.). The cache prevents recomputation: once a world transform is computed, it's stored until the transform chain changes.

### Cache Invalidation

When a node's transform changes, its cached world transform is stale — and so are the cached transforms of all its descendants:

```typescript
private invalidateWorldTransform(id: string): void {
  this.worldTransformCache.delete(id);

  const node = this.nodes.get(id);
  if (node) {
    for (const childId of node.children) {
      this.invalidateWorldTransform(childId);
    }
  }
}
```

This recursive invalidation is called by `addNode`, `updateNode` (when the transform changed), and `moveNode`. The cache is lazily repopulated — transforms are only recomputed when `getWorldTransform` is called again, typically during the next render frame.

### Effective Opacity

Opacity is multiplicative through the parent chain. A shape at 80% opacity inside a group at 50% opacity should render at 40% effective opacity:

```typescript
getEffectiveOpacity(id: string): number {
  const node = this.nodes.get(id);
  if (!node) return 1;
  let opacity = node.opacity;
  let parentId = node.parent;
  while (parentId) {
    const parent = this.nodes.get(parentId);
    if (!parent) break;
    opacity *= parent.opacity;
    parentId = parent.parent;
  }
  return opacity;
}
```

We don't cache this because opacity changes are infrequent and the walk is cheap. If profiling showed this as a bottleneck, we'd add a cache with the same invalidation pattern as world transforms.

## Traversal

The scene graph needs to be walked frequently — for rendering, hit testing, layer panel population, and more. We provide two traversal methods.

### General Traversal

`traverse` walks every node depth-first, passing the depth level. The callback can return `false` to abort the entire traversal:

```typescript
traverse(callback: (node: Node, depth: number) => boolean | void): void {
  const visit = (nodeId: string, depth: number): boolean => {
    const node = this.nodes.get(nodeId);
    if (!node) return true;

    const result = callback(node, depth);
    if (result === false) return false;

    for (const childId of node.children) {
      if (!visit(childId, depth + 1)) return false;
    }

    return true;
  };

  for (const rootId of this.rootNodeIds) {
    if (!visit(rootId, 0)) break;
  }
}
```

### Visible Traversal

`traverseVisible` is optimized for rendering. It skips invisible nodes entirely and supports _subtree skipping_ — the callback can return `false` to skip a node's children without aborting the traversal:

```typescript
traverseVisible(
  callback: (node: Node) => boolean | void,
  onExitNode?: (node: Node) => void
): void {
  const visit = (nodeId: string): void => {
    const node = this.nodes.get(nodeId);
    if (!node || !node.visible) return;

    const result = callback(node);
    if (result === false) return; // skip children, continue siblings

    for (const childId of node.children) {
      visit(childId);
    }

    onExitNode?.(node);
  };

  for (const rootId of this.rootNodeIds) {
    visit(rootId);
  }
}
```

The `onExitNode` callback deserves attention. It fires _after_ all children have been visited, on the way back up the tree. This is essential for features that need post-children processing:

- **Artboard clipping**: Push scissor rectangle on enter, pop on exit
- **Group opacity**: Render children to a framebuffer, then composite the framebuffer with the group's opacity
- **Boolean operations**: Render children individually to compute the boolean result, then render the result geometry

The return value distinction — `false` skips children, `void` continues normally — is used for boolean groups: the renderer handles the group itself but doesn't want its children rendered individually (the boolean computation consumes them).

### Query Methods

Beyond traversal, the scene graph provides targeted queries:

```typescript
getNode<T extends Node = Node>(id: string): T | undefined
getRootNodes(): Node[]
getChildren(id: string): Node[]
getParent(id: string): Node | undefined
getAncestors(id: string): Node[]
getDescendants(id: string): Node[]
```

`getAncestors` walks up the parent chain:

```typescript
getAncestors(id: string): Node[] {
  const ancestors: Node[] = [];
  let current = this.getParent(id);
  while (current) {
    ancestors.push(current);
    current = this.getParent(current.id);
  }
  return ancestors;
}
```

`getDescendants` walks down, collecting all nodes in the subtree. It includes cycle protection via a `visited` Set — a safety measure against corrupted data where a child ID somehow appears twice:

```typescript
getDescendants(id: string): Node[] {
  const descendants: Node[] = [];
  const visited = new Set<string>();

  const collect = (nodeId: string) => {
    const n = this.nodes.get(nodeId);
    if (!n) return;
    for (const childId of n.children) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      const child = this.nodes.get(childId);
      if (child) {
        descendants.push(child);
        collect(childId);
      }
    }
  };

  collect(id);
  return descendants;
}
```

## Serialization

The scene graph must be convertible to and from plain JSON. This is needed for three things:

1. **Project save/load** — Writing the document to disk and restoring it
2. **Undo/redo** — Snapshotting the entire state before each operation
3. **Page switching** — Saving the current page's scene graph when switching to another page

### toJSON

Serialization is straightforward — extract all nodes from the Map and the root ID list:

```typescript
toJSON(): { nodes: Node[]; rootNodeIds: string[] } {
  return {
    nodes: Array.from(this.nodes.values()),
    rootNodeIds: [...this.rootNodeIds],
  };
}
```

We return shallow copies (spread for the array, `Array.from` for the Map values). For undo snapshots, the caller wraps this in `structuredClone()` to get a deep copy.

### fromJSON

Deserialization is more careful. It must handle:

- Invalid or missing data (corrupted files, old format versions)
- Missing parent references (nodes referencing parents that don't exist)
- Legacy field formats (our `fill` → `fills` migration)

Most importantly, it must be atomic — it either succeeds completely or leaves the current state unchanged:

```typescript
fromJSON(data: { nodes: Node[]; rootNodeIds: string[] }): void {
  if (!Array.isArray(data.nodes)) {
    data.nodes = [];
  }
  if (!Array.isArray(data.rootNodeIds)) {
    data.rootNodeIds = [];
  }

  // Parse into temp map — validate before destroying current state
  const newNodes = new Map<string, Node>();
  for (const node of data.nodes) {
    if (!node || typeof node.id !== 'string' || node.id.length === 0) {
      continue; // Skip invalid nodes
    }
    this.migrateNodeFillsStrokes(node);
    newNodes.set(node.id, node);
  }

  // Fix orphan references
  for (const [, node] of newNodes) {
    if (node.parent && !newNodes.has(node.parent)) {
      node.parent = null;
    }
  }

  // Filter rootNodeIds to valid IDs
  const validRootIds = data.rootNodeIds.filter(id => newNodes.has(id));

  // Atomic swap
  this.nodes = newNodes;
  this.rootNodeIds = validRootIds;
  this.worldTransformCache.clear();
}
```

The atomic swap pattern is the key design decision here. We build the new state in temporary variables (`newNodes`, `validRootIds`), validate everything, and only then replace the current state. If anything throws during parsing, the existing state is untouched.

An earlier version of this code cleared the node Map first, then added nodes one by one. This meant that if the third node was invalid and threw, the scene graph was in a half-loaded state — the first two nodes of the new data plus none of the old data. Debugging this during undo/redo operations was what motivated the atomic swap.

### Data Migration

`fromJSON` includes a migration step for legacy fill/stroke formats. When we changed from singular `fill`/`stroke` to plural `fills`/`strokes` arrays, every previously saved file needed migration:

```typescript
private migrateNodeFillsStrokes(node: Node): void {
  const raw = node as any;

  if ('fill' in raw && !('fills' in raw)) {
    raw.fills = raw.fill
      ? [{ ...raw.fill, visible: raw.fill.visible ?? true }]
      : [];
    delete raw.fill;
  }

  if ('stroke' in raw && !('strokes' in raw)) {
    raw.strokes = raw.stroke
      ? [{ ...raw.stroke, visible: raw.stroke.visible ?? true }]
      : [];
    delete raw.stroke;
  }
}
```

This migration runs on every load. It's idempotent — running it on already-migrated data is a no-op. This pattern (migrate on read, always write the latest format) means we never need to mass-update stored files.

## The Event System

The scene graph emits events when nodes change. This decouples the data structure from the UI — the Layers panel listens for `nodeAdded` and `nodeRemoved` to update its list, the Properties Panel listens for `nodeChanged` to refresh its inputs, and the project "dirty" flag listens for all three to show "unsaved changes."

```typescript
export type SceneGraphEventType =
  | 'nodeAdded'
  | 'nodeRemoved'
  | 'nodeChanged'
  | 'nodeMoved'
  | 'selectionChanged';

export interface SceneGraphEvent {
  type: SceneGraphEventType;
  nodeId?: string;
  parentId?: string;
  previousParentId?: string;
}
```

The subscription API returns an unsubscribe function, following the pattern established by RxJS and adopted by Zustand and other modern state libraries:

```typescript
on(type: SceneGraphEventType, callback: EventCallback): () => void {
  if (!this.listeners.has(type)) {
    this.listeners.set(type, new Set());
  }
  this.listeners.get(type)!.add(callback);

  return () => {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(type);
      }
    }
  };
}
```

Returning the unsubscribe function makes cleanup natural in React effects:

```typescript
useEffect(() => {
  const unsubs = [
    sceneGraph.on('nodeAdded', markDirty),
    sceneGraph.on('nodeChanged', markDirty),
    sceneGraph.on('nodeRemoved', markDirty),
  ];
  return () => unsubs.forEach((u) => u());
}, [sceneGraph]);
```

The `emit` method iterates over the listener Set:

```typescript
private emit(event: SceneGraphEvent): void {
  const callbacks = this.listeners.get(event.type);
  if (callbacks) {
    for (const callback of callbacks) {
      callback(event);
    }
  }
}
```

We use a `Set` rather than an array for listeners to avoid duplicate subscriptions and get O(1) removal. The cleanup step (deleting the Set when it's empty) is optional but prevents memory growth over long editing sessions where components mount and unmount frequently.

## Providing the Scene Graph to React

The scene graph is a singleton per editor session — one instance that every component shares. We provide it through React context:

```typescript
const SceneGraphContext = createContext<SceneGraph | null>(null);

export function SceneGraphProvider({ children }: { children: ReactNode }) {
  const sceneGraphRef = useRef<SceneGraph>(new SceneGraph());
  return (
    <SceneGraphContext.Provider value={sceneGraphRef.current}>
      {children}
    </SceneGraphContext.Provider>
  );
}

export function useSceneGraph(): SceneGraph {
  const sceneGraph = useContext(SceneGraphContext);
  if (!sceneGraph) {
    throw new Error('useSceneGraph must be used within a SceneGraphProvider');
  }
  return sceneGraph;
}
```

The `useRef` is important. Without it, React might create a new `SceneGraph` instance on re-render (especially in Strict Mode, which double-invokes render functions). `useRef` guarantees the same instance persists across renders.

Components access the scene graph via the `useSceneGraph()` hook. The scene graph itself is mutable — components call `addNode`, `updateNode`, etc. directly. React doesn't re-render when the scene graph changes (it's not React state). Instead, the event system triggers targeted updates: the canvas re-renders via `requestAnimationFrame`, and React components subscribe to specific store values through Zustand (which we'll cover in the next chapter).

This separation — mutable scene graph + event-driven UI updates — is deliberate. React's immutability model works well for UI state (selected tool, panel visibility, theme) but poorly for a scene graph that changes 60 times per second during drag operations. We want to move a shape's position without diffing the entire tree.

## The Math Library

The scene graph's transform system depends on a small but essential math library. Here are the core pieces:

### Vector2

Plain objects with x/y properties, operated on by pure functions:

```typescript
export const vec2 = {
  add(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  subtract(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  multiply(v: Vector2, scalar: number): Vector2 {
    return { x: v.x * scalar, y: v.y * scalar };
  },

  length(v: Vector2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  },

  normalize(v: Vector2): Vector2 {
    const len = vec2.length(v);
    if (len < EPSILON) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  distance(a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  },
};
```

Every function returns a _new_ object rather than mutating its inputs. This is intentional — immutability makes vector math predictable and debuggable. In a hot rendering loop, you might want mutable operations for performance, but we profile first and optimize only where measurements demand it. In practice, V8's object allocation is fast enough that this hasn't been a bottleneck.

The `EPSILON` guard in `normalize` prevents division by zero on zero-length vectors, which would produce `NaN` values that silently propagate through all subsequent math. NaN is the silent killer of visual applications — a shape with a NaN position is invisible, produces no errors, and is nearly impossible to debug without knowing to check for it.

### Matrix3

The matrix module provides the operations the scene graph's transform system needs:

```typescript
export const mat3 = {
  identity(): Matrix3 {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  },

  multiply(a: Matrix3, b: Matrix3): Matrix3 {
    return {
      a: a.a * b.a + a.c * b.b,
      b: a.b * b.a + a.d * b.b,
      c: a.a * b.c + a.c * b.d,
      d: a.b * b.c + a.d * b.d,
      tx: a.a * b.tx + a.c * b.ty + a.tx,
      ty: a.b * b.tx + a.d * b.ty + a.ty,
    };
  },

  transformPoint(m: Matrix3, p: Vector2): Vector2 {
    return {
      x: m.a * p.x + m.c * p.y + m.tx,
      y: m.b * p.x + m.d * p.y + m.ty,
    };
  },

  invert(m: Matrix3): Matrix3 | null {
    const det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) < EPSILON) return null;
    const invDet = 1 / det;
    return {
      a: m.d * invDet,
      b: -m.b * invDet,
      c: -m.c * invDet,
      d: m.a * invDet,
      tx: (m.c * m.ty - m.d * m.tx) * invDet,
      ty: (m.b * m.tx - m.a * m.ty) * invDet,
    };
  },

  toFloat32Array(m: Matrix3): Float32Array {
    // Column-major for WebGL
    return new Float32Array([m.a, m.b, 0, m.c, m.d, 0, m.tx, m.ty, 1]);
  },
};
```

`toFloat32Array` outputs in column-major order because that's what WebGL expects for `uniformMatrix3fv`. This is a minor detail that causes major confusion if you get it wrong — your shapes will be scaled and rotated incorrectly, but not in an obviously broken way.

`invert` returns `null` for degenerate matrices (zero determinant). This can happen when scale is zero on either axis, which means the matrix has "squished" 2D space into a line or point. Operations that need the inverse (like converting screen coordinates to world coordinates for hit testing) must handle the null case.

## Testing the Scene Graph

Scene graph tests are straightforward because the class is pure — no DOM, no WebGL, no React. Here's a representative sample:

```typescript
describe('SceneGraph', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
  });

  it('adds node as child when parent specified', () => {
    const parent = createGroupNode('parent', 'Parent');
    const child = createGroupNode('child', 'Child');

    sceneGraph.addNode(parent);
    sceneGraph.addNode(child, 'parent');

    expect(child.parent).toBe('parent');
    expect(parent.children).toContain('child');
  });

  it('recursively removes all descendants', () => {
    const grandparent = createGroupNode('gp', 'Grandparent');
    const parent = createGroupNode('p', 'Parent');
    const child = createGroupNode('c', 'Child');

    sceneGraph.addNode(grandparent);
    sceneGraph.addNode(parent, 'gp');
    sceneGraph.addNode(child, 'p');

    sceneGraph.removeNode('gp');

    expect(sceneGraph.getNode('gp')).toBeUndefined();
    expect(sceneGraph.getNode('p')).toBeUndefined();
    expect(sceneGraph.getNode('c')).toBeUndefined();
  });

  it('emits nodeAdded event', () => {
    const callback = vi.fn();
    sceneGraph.on('nodeAdded', callback);

    const node = createGroupNode('n1', 'Node 1');
    sceneGraph.addNode(node);

    expect(callback).toHaveBeenCalledWith({
      type: 'nodeAdded',
      nodeId: 'n1',
      parentId: undefined,
    });
  });

  it('prevents circular references when moving nodes', () => {
    const parent = createGroupNode('parent', 'Parent');
    const child = createGroupNode('child', 'Child');

    sceneGraph.addNode(parent);
    sceneGraph.addNode(child, 'parent');

    expect(() => sceneGraph.moveNode('parent', 'child')).toThrow('circular reference');
  });
});
```

These tests verify behavior, not implementation. We don't check the internal Map structure — we check that `getNode` returns the right thing, that events fire, and that invariants hold. This means we could swap the internal storage from a Map to a flat array (unlikely, but possible) without breaking any tests.

## Lessons

**Use string IDs for all node references, never object references.** String IDs make the entire graph serializable as plain JSON. Undo snapshots, clipboard, project files, and page switching all work because the graph is a data structure of primitives, not a web of object pointers.

**Deserialization must be atomic: succeed completely or leave the current state unchanged.** Build new state in temporary variables, validate everything, then swap. An earlier version cleared the node Map first and added nodes one by one; if the third node threw, the scene graph was left in a half-loaded state with two new nodes and none of the old ones.

**Clone arrays before iterating if the loop body mutates them.** Recursive `removeNode` modifies `node.children` via `splice` on each call. Iterating the original array while mutating it skips elements. `const children = [...node.children]` before the loop is the fix.

**Separate traversal from traversal purpose.** `traverse` and `traverseVisible` are generic — they don't know about rendering, hit testing, or layer panel population. The callback decides what to do with each node. This means one traversal implementation serves every subsystem.

**A mutable scene graph with an event system is the right architecture for 60fps editing.** React's immutability model works for UI state but not for a tree that changes every frame during drag operations. The scene graph mutates directly, emits events, and lets the canvas re-render via `requestAnimationFrame` while React components subscribe through Zustand selectors.

**Migrate on read, always write the latest format.** The `fill` to `fills` migration runs on every load and is idempotent. This means you never need to mass-update stored files, and any file from any version loads correctly without the user doing anything.

## What We Built

The scene graph we've built is small — about 500 lines of code — but it's the most important class in the entire application. Here's what it provides:

- **A typed node hierarchy** — 12 node types with a shared base, organized in a tree with parent/child links via string IDs.
- **CRUD operations** — Add, remove, update, and move nodes with automatic parent link maintenance, circular reference prevention, and event emission.
- **Hierarchical transforms** — World transform computation that combines local transforms through the parent chain, with lazy caching and recursive invalidation.
- **Traversal** — Depth-first traversal with visibility filtering and subtree skipping, plus targeted queries for ancestors, descendants, children, and parent.
- **Serialization** — Atomic `toJSON`/`fromJSON` with data migration and validation.
- **Events** — A publish-subscribe system that decouples the data layer from the UI layer.

Every chapter after this one either reads from the scene graph (rendering, hit testing, serialization) or writes to it (tools, property editing, clipboard operations). It's the stable foundation that everything else is built on.

In the next chapter, we add a camera — the system that maps between the infinite world space of the scene graph and the finite pixel space of the screen.
