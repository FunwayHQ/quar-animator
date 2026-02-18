# Multi-Page Projects

## One Document, Many Canvases

Until now, every project has been a single canvas — one scene graph, one timeline, one selection, one undo history. That is enough for a quick animation or a logo design, but it breaks down for anything larger. A character sheet needs separate pages for the front view, side view, and three-quarter pose. A UI mockup needs a page for each screen. A storyboard needs a page per shot. The user should not have to save, close, and open a new file every time they want a different canvas. They need pages.

The challenge is that pages are not just visual dividers. Each page has its own scene graph full of nodes, its own timeline full of keyframes, its own selection state, and its own undo/redo history. Switching pages means tearing down the current editor state and rebuilding it from a stored snapshot — a mini-serialization cycle that happens instantly, triggered by a single click on a tab. Getting this right requires every piece of transient state to be identified, saved, restored, or cleared at the exact right moment.

## The PageData Type

A page is a frozen snapshot of everything the editor needs to reconstruct a canvas:

```typescript
export interface PageData {
  id: string;
  name: string;
  sceneGraphJSON: { nodes: Node[]; rootNodeIds: string[] };
  timeline: Timeline;
  selectedNodeIds: string[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}
```

The `sceneGraphJSON` field stores the scene graph as a JSON-serializable structure — the same format used by `sceneGraph.toJSON()` and `sceneGraph.fromJSON()`. The timeline is stored as a plain object with tracks and keyframes. Selected node IDs are stored as an array (not a `Set`, because sets do not survive `structuredClone`). The undo and redo stacks are arrays of history snapshots, each containing a full scene graph clone and a selection set.

The store holds a `pages: PageData[]` array and an `activePageId: string`. The active page's data lives in the store's normal state fields — the scene graph is loaded, the timeline is the live timeline, the undo stacks are the active stacks. Inactive pages exist only as frozen `PageData` objects in the array, waiting to be activated.

A default page is created at store initialization:

```typescript
function createDefaultPage(name: string = 'Page 1'): PageData {
  return {
    id: generatePageId(),
    name,
    sceneGraphJSON: { nodes: [], rootNodeIds: [] },
    timeline: createTimeline({ duration: 300, frameRate: 30 }),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  };
}
```

The ID generator combines `Date.now()` with an incrementing counter to avoid collisions even when pages are created in the same millisecond.

## Adding and Deleting Pages

Adding a page is a three-step operation: save the current page, create a new empty page, and switch to it.

```typescript
addPage: (sceneGraph: SceneGraphLike) => {
  const state = get();
  // Save current page state (immutable update)
  const updatedPages = state.pages.map(p => {
    if (p.id !== state.activePageId) return p;
    return {
      ...p,
      sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
      timeline: structuredClone(state.timeline),
      selectedNodeIds: Array.from(state.selectedNodeIds),
      undoStack: state.undoStack,
      redoStack: state.redoStack,
    };
  });

  const newPage = createDefaultPage(`Page ${state.pages.length + 1}`);
  sceneGraph.fromJSON(newPage.sceneGraphJSON);

  set({
    pages: [...updatedPages, newPage],
    activePageId: newPage.id,
    timeline: structuredClone(newPage.timeline),
    selectedNodeIds: new Set<string>(),
    selectedKeyframeIds: new Set<string>(),
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    enteredGroupId: null,
    clipboard: null,
    currentFrame: 0,
    isPlaying: false,
  });
},
```

The immutable page update pattern — `pages.map(p => p.id !== activePageId ? p : { ...p, ... })` — ensures that unchanged pages keep their reference identity. Only the current page gets a new snapshot.

Deleting a page enforces a minimum of one page — the last page cannot be removed. When the active page is deleted, the store switches to the adjacent page (the one at the same index, or the last page if the deleted page was at the end):

```typescript
deletePage: (pageId: string, sceneGraph: SceneGraphLike) => {
  const state = get();
  if (state.pages.length <= 1) return;
  const pageIndex = state.pages.findIndex(p => p.id === pageId);
  if (pageIndex === -1) return;
  const newPages = state.pages.filter(p => p.id !== pageId);

  if (state.activePageId === pageId) {
    const switchToIndex = Math.min(pageIndex, newPages.length - 1);
    const switchTo = newPages[switchToIndex]!;
    sceneGraph.fromJSON(structuredClone(switchTo.sceneGraphJSON));
    set({
      pages: newPages,
      activePageId: switchTo.id,
      timeline: structuredClone(switchTo.timeline),
      selectedNodeIds: new Set(switchTo.selectedNodeIds),
      undoStack: switchTo.undoStack,
      redoStack: switchTo.redoStack,
      // ... clear transient state
    });
  } else {
    set({ pages: newPages });
  }
},
```

When deleting a non-active page, no scene graph swap is needed — the array is simply filtered. This distinction matters for performance: `sceneGraph.fromJSON()` is the most expensive operation in the entire page system, and avoiding it when possible keeps inactive-page deletion instantaneous.

## The switchPage Operation

Page switching is the heart of the multi-page system. It saves the current page's live state, loads the target page's frozen state, and clears all transient editor state in a single atomic store update.

```typescript
switchPage: (pageId: string, sceneGraph: SceneGraphLike) => {
  const state = get();
  if (pageId === state.activePageId) return;

  const targetPage = state.pages.find(p => p.id === pageId);
  if (!targetPage) return;

  // Force-stop Smart Bone recording before switching
  if (state.smartBoneRecordingActionId) {
    set({
      smartBoneRecordingActionId: null,
      smartBoneRecordingTargetId: null,
      activeTool: state.smartBoneRecordingPrevTool ?? 'selection',
    });
  }

  // Save current page state
  const updatedPages = state.pages.map(p => {
    if (p.id !== state.activePageId) return p;
    return {
      ...p,
      sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
      timeline: structuredClone(state.timeline),
      selectedNodeIds: Array.from(state.selectedNodeIds),
      undoStack: state.undoStack,
      redoStack: state.redoStack,
    };
  });

  // Load target page
  sceneGraph.fromJSON(structuredClone(targetPage.sceneGraphJSON));

  set({
    pages: updatedPages,
    activePageId: pageId,
    timeline: structuredClone(targetPage.timeline),
    selectedNodeIds: new Set(targetPage.selectedNodeIds),
    selectedKeyframeIds: new Set<string>(),
    undoStack: targetPage.undoStack,
    redoStack: targetPage.redoStack,
    canUndo: targetPage.undoStack.length > 0,
    canRedo: targetPage.redoStack.length > 0,
    enteredGroupId: null,
    clipboard: null,
    currentFrame: 0,
    isPlaying: false,
  });
},
```

Several details deserve attention.

**The self-switch guard.** If `pageId === state.activePageId`, the function returns immediately. Without this guard, the store would snapshot the current page, call `fromJSON` with its own data, and reset transient state for no reason.

**`structuredClone` everywhere.** Every piece of data crossing the boundary between "live state" and "frozen snapshot" passes through `structuredClone`. This prevents the common bug where modifying a keyframe in the live timeline also modifies the stored page's timeline because both hold the same object reference. The clone cost is negligible compared to `sceneGraph.fromJSON()`.

**`Array.from(selectedNodeIds)`.** The store's selection is a `Set<string>`, but `Set` does not survive JSON serialization or `structuredClone` cleanly across all environments. Converting to an array for storage and back to a `Set` for activation keeps the format portable.

**Transient state clearing.** `enteredGroupId` is set to `null` — the user cannot be "inside" a group on a page they were not editing. `clipboard` is cleared because the clipboard may reference nodes that do not exist on the target page. `currentFrame` resets to 0 because the target page has its own timeline with potentially different duration. `isPlaying` is set to `false` — more on this shortly.

**Smart Bone recording bail-out.** If the user switches pages while recording a Smart Bone morph target, the recording is stopped first. The bone's rotation is not restored (it was on the old page), and the tool is switched back to selection. This prevents the recording state from leaking across pages.

## Stopping Playback on Page Switch

When `switchPage` sets `isPlaying: false`, the PlaybackController — which runs in a `useEffect` via the `usePlayback` hook — needs to stop its `requestAnimationFrame` loop. The hook subscribes to store changes and watches for this exact transition:

```typescript
const unsub = useEditorStore.subscribe((curr, prev) => {
  // ...
  // Stop playback controller when store says not playing (e.g. page switch)
  if (!curr.isPlaying && prev.isPlaying && ctrl.isPlaying) {
    ctrl.pause();
  }
  // ...
});
```

The triple condition — `!curr.isPlaying && prev.isPlaying && ctrl.isPlaying` — ensures the pause only fires when the store transitions from playing to not-playing and the controller is actually running. This prevents false triggers during initialization or when the user manually pauses.

## Renaming, Duplicating, and Reordering

The remaining page operations are simpler because they do not require scene graph swaps.

**Renaming** is a pure data update — find the page by ID, spread a new name:

```typescript
renamePage: (pageId: string, name: string) => {
  set(state => ({
    pages: state.pages.map(p => p.id === pageId ? { ...p, name } : p),
  }));
},
```

**Duplicating** clones the source page's scene graph and timeline but starts with empty undo stacks and no selection. The copy is inserted immediately after the source in the array. If the active page is being duplicated, its live state is saved first so the clone reflects the current canvas rather than a stale snapshot:

```typescript
duplicatePage: (pageId: string, sceneGraph: SceneGraphLike) => {
  const state = get();
  let sourcePage = state.pages.find(p => p.id === pageId);
  if (!sourcePage) return;

  let updatedPages = state.pages;
  if (pageId === state.activePageId) {
    updatedPages = state.pages.map(p => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
        timeline: structuredClone(state.timeline),
        selectedNodeIds: Array.from(state.selectedNodeIds),
        undoStack: state.undoStack,
        redoStack: state.redoStack,
      };
    });
    sourcePage = updatedPages.find(p => p.id === pageId)!;
  }

  const newPage: PageData = {
    id: generatePageId(),
    name: `${sourcePage.name} Copy`,
    sceneGraphJSON: structuredClone(sourcePage.sceneGraphJSON),
    timeline: structuredClone(sourcePage.timeline),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  };

  const sourceIndex = updatedPages.findIndex(p => p.id === pageId);
  const newPages = [...updatedPages];
  newPages.splice(sourceIndex + 1, 0, newPage);
  set({ pages: newPages });
},
```

Note that `duplicatePage` does not switch to the new page. The user stays on their current page and can switch manually. This matches Figma's behavior — duplicate creates a copy but does not navigate to it.

**Reordering** uses splice to move a page from one index to another:

```typescript
reorderPages: (fromIndex: number, toIndex: number) => {
  set(state => {
    if (fromIndex < 0 || fromIndex >= state.pages.length ||
        toIndex < 0 || toIndex >= state.pages.length ||
        fromIndex === toIndex) return {};
    const newPages = [...state.pages];
    const [moved] = newPages.splice(fromIndex, 1);
    newPages.splice(toIndex, 0, moved!);
    return { pages: newPages };
  });
},
```

Bounds checking prevents out-of-range indices from corrupting the array. The no-op check for `fromIndex === toIndex` avoids an unnecessary re-render.

## Project Serialization v2.0

The original project format (v1.0) stored a single scene graph and timeline at the top level. Multi-page support requires a new format where each page's scene graph and timeline are stored independently.

The v1.0 format:

```typescript
interface ProjectDataV1 {
  version: '1.0';
  name: string;
  sceneGraph: { nodes: Node[]; rootNodeIds: string[] };
  timeline: Timeline;
  settings: { timelineDuration: number; frameRate: number /* ... */ };
}
```

The v2.0 format:

```typescript
interface ProjectDataV2 {
  version: '2.0';
  name: string;
  pages: SerializedPage[];
  activePageId: string;
  settings: { timelineDuration: number; frameRate: number /* ... */ };
  rigging?: {
    /* vitruvian controllers, dynamic chains, wind */
  };
  symbols?: SymbolDefinition[];
}

interface SerializedPage {
  id: string;
  name: string;
  sceneGraph: { nodes: Node[]; rootNodeIds: string[] };
  timeline: Timeline;
}
```

Settings (frame rate, auto-keyframe, onion skinning, guides) remain global — they apply to all pages equally. Rigging data and symbol definitions are also global. Only the scene graph, timeline, and per-page metadata vary.

### Serialization

`serializeProject` snapshots the active page from the live scene graph and inactive pages from their stored JSON:

```typescript
export function serializeProject(
  name: string,
  sceneGraph: SceneGraph,
  editorState: EditorStateSnapshot
): ProjectDataV2 {
  let pages: SerializedPage[];
  if (editorState.pages && editorState.pages.length > 0 && editorState.activePageId) {
    pages = editorState.pages.map((page) => {
      if (page.id === editorState.activePageId) {
        return {
          id: page.id,
          name: page.name,
          sceneGraph: sceneGraph.toJSON(),
          timeline: structuredClone(editorState.timeline),
        };
      } else {
        return {
          id: page.id,
          name: page.name,
          sceneGraph: structuredClone(page.sceneGraphJSON),
          timeline: structuredClone(page.timeline),
        };
      }
    });
  }
  // ...
}
```

The active page gets the live `sceneGraph.toJSON()` — the freshest possible data. Inactive pages use `structuredClone(page.sceneGraphJSON)` because their scene graphs are not loaded into the live scene graph object.

### The v1 → v2 Migration

When deserializing, the loader checks the version field and migrates if necessary. The v1 → v2 migration wraps the single scene graph and timeline into a one-element `pages[]` array:

```typescript
function migrateV1ToV2(data: ProjectDataV1): ProjectDataV2 {
  const pageId = `page-migrated-${Date.now()}`;
  return {
    version: '2.0',
    name: data.name,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    pages: [
      {
        id: pageId,
        name: 'Page 1',
        sceneGraph: data.sceneGraph,
        timeline: data.timeline,
      },
    ],
    activePageId: pageId,
    settings: data.settings,
    rigging: data.rigging,
  };
}
```

The migration is lossless — the same nodes, keyframes, and settings survive. The only addition is the page wrapper. Old `.quar` files open seamlessly in the multi-page editor.

### Deserialization

`deserializeProject` normalizes any version to v2.0, loads the active page's scene graph via `sceneGraph.fromJSON()`, and builds a `PageData[]` array for the store:

```typescript
export function deserializeProject(
  data: ProjectData,
  sceneGraph: SceneGraph,
  applyEditorState: (state: Partial<EditorStateSnapshot>) => void
): void {
  const v2 =
    data.version === '2.0' || data.version === '3.0'
      ? (data as ProjectDataV2)
      : migrateV1ToV2(data);

  const activePage = v2.pages.find((p) => p.id === v2.activePageId) ?? v2.pages[0]!;
  sceneGraph.fromJSON(activePage.sceneGraph);

  const pages: PageData[] = v2.pages.map((p) => ({
    id: p.id,
    name: p.name,
    sceneGraphJSON: structuredClone(p.sceneGraph),
    timeline: structuredClone(p.timeline),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  }));

  applyEditorState({
    timeline: structuredClone(activePage.timeline),
    pages,
    activePageId: activePage.id,
    // ... settings, rigging, symbols
  });
}
```

Fresh `PageData` objects get empty selection and undo stacks — the undo history does not persist across save/load cycles. The `applyEditorState` callback injects the deserialized data into the Zustand store without the store needing to know about the serialization format.

## The PageTabs UI

The `PageTabs` component renders a horizontal tab bar positioned between the toolbar and the workspace. It subscribes to `pages` and `activePageId` via Zustand hooks:

```typescript
export function PageTabs() {
  const pages = usePages();
  const activePageId = useActivePageId();
  const sceneGraph = useSceneGraph();
  // ...
}
```

Each page renders as a `<button>` with the page name. The active tab gets an `active` CSS class. A close button (X icon) appears on each tab when multiple pages exist — it is hidden when only one page remains, enforcing the minimum-one-page invariant at the UI level.

Interactions map directly to store actions:

- **Click** a tab → `switchPage(pageId, sceneGraph)`
- **Double-click** a tab → enters inline rename mode (shows an `<input>` replacing the tab name)
- **Right-click** a tab → opens a context menu with Rename, Duplicate, and Delete options
- **Click the "+" button** → `addPage(sceneGraph)`
- **Click the X button** → `deletePage(pageId, sceneGraph)` (with `stopPropagation` to prevent switching)

The rename flow uses local React state (`renamingPageId`, `renameValue`) and an input ref for auto-focus and auto-select. Enter commits, Escape cancels, blur commits. The context menu is positioned at the mouse coordinates and dismissed on any outside click.

The close button's `stopPropagation` call is essential. Without it, clicking X would bubble to the tab's click handler and trigger a page switch before the deletion fires. The event never reaches the tab, so the page is deleted without an unnecessary intermediate switch.

## Resetting on New Project

Creating a new project wipes the entire page system and starts fresh:

```typescript
const newProject = useCallback(() => {
  const data = sceneGraph.toJSON();
  for (const node of data.nodes) {
    sceneGraph.removeNode(node.id);
  }

  const defaultPage: PageData = {
    id: pageId,
    name: 'Page 1',
    sceneGraphJSON: { nodes: [], rootNodeIds: [] },
    timeline: createTimeline({ duration: 300, frameRate: 30 }),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  };

  useEditorStore.setState({
    pages: [defaultPage],
    activePageId: pageId,
    timeline: defaultTimeline,
    selectedNodeIds: new Set<string>(),
    clipboard: null,
    enteredGroupId: null,
    isPlaying: false,
    currentFrame: 0,
    symbols: [],
    // ... all transient state cleared
  });
  useEditorStore.getState().clearHistory();
}, [sceneGraph]);
```

The scene graph is emptied node-by-node rather than calling `fromJSON({ nodes: [], rootNodeIds: [] })`. This ensures that any event listeners (texture cleanup on `nodeRemoved`, for instance) fire for each removed node. The store is then reset to a single empty page with a fresh timeline and empty undo history.

## Lessons

**Page switching is a serialization boundary.** Every `switchPage` call is a mini-save-and-load cycle. The current page's live state is snapshotted with `structuredClone` and stored in the `pages[]` array. The target page's frozen state is cloned out and loaded into the live scene graph. This means the serialization system — `toJSON()`, `fromJSON()`, `structuredClone` — must be fast and correct, because it runs on every page click.

**Transient state must be enumerated exhaustively.** `enteredGroupId`, `clipboard`, `isPlaying`, `currentFrame`, `selectedKeyframeIds`, `smartBoneRecordingActionId` — every piece of state that is specific to the current editing session must be identified and either saved per-page (selection, undo stacks) or cleared on switch (clipboard, entered group, playback). Missing one produces subtle bugs — the user switches pages and finds a group still "entered" that does not exist, or a clipboard paste inserts nodes from the wrong page.

**The minimum-page invariant is enforced at every level.** `deletePage` checks `pages.length <= 1` and returns early. The UI hides the close button when one page remains. The serialization format requires `pages.length > 0` for v2.0 validation. Triple enforcement — data layer, store logic, UI — ensures no code path can ever produce a project with zero pages.

**Duplicate does not switch.** This matches user expectation in design tools: creating a backup copy of a page should not navigate away from the current work. The user sees the new tab appear and can switch to it when ready. Auto-switching would be disruptive — the user would lose their place and have to navigate back.

**`structuredClone` is the cheapest correct solution.** It is tempting to share object references between the live state and the stored page data to avoid cloning overhead. But shared references create aliasing bugs — editing a keyframe on Page 1 would also modify the stored snapshot for Page 1 because the timeline object is the same reference. The cloning cost is a few milliseconds even for complex scenes, far less than the debugging cost of an aliasing bug.

## What We Built

This chapter covered multi-page projects — independent canvases within a single document, each with its own scene graph, timeline, selection, and undo history:

- **`PageData`** stores a frozen snapshot of each page: scene graph JSON, timeline, selected node IDs, and undo/redo stacks. The active page's data lives in the store's normal state fields; inactive pages exist only as `PageData` objects in the `pages[]` array.
- **`addPage`** saves the current page, creates a new empty page, loads it via `sceneGraph.fromJSON()`, and clears all transient state (entered group, clipboard, playback, selection).
- **`switchPage`** snapshots the current page with `structuredClone`, loads the target page's scene graph, restores its timeline and undo stacks, and clears transient state. A self-switch guard prevents unnecessary work. Smart Bone recording is force-stopped before switching.
- **`deletePage`** enforces a minimum of one page, switches to an adjacent page when the active page is deleted, and skips the scene graph swap when deleting a non-active page.
- **`duplicatePage`** clones the source page's scene graph and timeline (saving live state first if duplicating the active page), inserts the copy after the source, and does not auto-switch — matching Figma's behavior.
- **Playback stops on page switch** because `switchPage` sets `isPlaying: false`, which the `usePlayback` hook detects via a Zustand subscription and calls `ctrl.pause()`.
- **Project serialization v2.0** wraps pages in a `pages[]` array with `activePageId`. The v1 → v2 migration wraps the single scene graph into `pages[0]`. Settings, rigging, and symbols remain global across all pages.
- **`PageTabs`** renders a horizontal tab bar with click-to-switch, double-click-to-rename, right-click context menu (Rename, Duplicate, Delete), a "+" add button, and close buttons that are hidden when only one page remains.

The next chapter moves from organizing pages to creating reusable components within them — Symbols, where a single definition spawns multiple instances with overridable properties, and editing a symbol propagates changes to every instance across every page.
