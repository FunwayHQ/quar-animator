# The Binary File Format

## Why JSON Isn't Enough

Every graphic editor needs to save and load projects. The simplest approach — and the one we used for the first two versions of the file format — is to serialize the entire project state as JSON. `JSON.stringify` the scene graph, the timeline, the settings, write it to a file, done. Loading is `JSON.parse` and restore. It works, it's debuggable, and it's trivially correct.

Until the user drops an image onto the canvas. A 400×300 PNG becomes a 200KB data URI — a base64-encoded string embedded directly in the JSON. Base64 inflates binary data by 33%, so the 150KB PNG file becomes a 200KB string. Add a few more images, and a project that should be 2MB is 8MB of JSON, with most of it being base64 text that no human will ever read. The JSON parser has to allocate and decode megabytes of string data that was only encoded as a string because JSON has no binary type.

This chapter builds a binary container format — `.quar` v3.0 — that keeps the JSON structure for everything it's good at (scene graphs, timelines, settings) while extracting images into raw binary buffers. The format is inspired by glTF's approach: a small structured header, a JSON chunk for metadata, and binary buffers for bulk data. The result is a format that's ~33% smaller for image-heavy projects, faster to parse, and backward-compatible with every previous version.

## Format Evolution

The `.quar` format has gone through three versions, each adding capability without breaking the previous:

**v1.0 — Single Page JSON.** The original format. One scene graph, one timeline, one settings block, all in a JSON file. This was the format from Chapter 5 through Chapter 20, before pages existed.

**v2.0 — Multi-Page JSON.** When Chapter 27 added multi-page projects, the format wrapped the single scene graph into a `pages[]` array. Each page carried its own scene graph and timeline. A `version: '2.0'` field distinguished it from v1.0, and a migration function wrapped old single-page projects into the new structure.

**v3.0 — Binary Container.** The version we're building now. The JSON still describes the project structure, but images are extracted from their data URI strings into raw binary buffers appended after the JSON. A `version: '3.0'` field marks the JSON, and a four-byte magic number marks the binary file.

The migration chain is linear: v1 → v2 → v3. Every old file loads into the current editor. Every save writes v3 binary. This "migrate on read, always write latest" pattern means the user never has to think about format versions.

## The Binary Layout

The `.quar` v3.0 binary file has a fixed header followed by a JSON chunk and zero or more binary buffers:

```
Offset    Size    Field
──────    ────    ─────
0         4       Magic: 0x52415551 ("QUAR" in little-endian)
4         4       Format version: 3
8         4       Flags: 0 (reserved for future use)
12        4       JSON chunk length in bytes
16        var     JSON chunk (UTF-8 encoded)
16+J      4       Buffer count
          ── per buffer ──
          4       Buffer data length
          4       MIME type string length
          var     MIME type (UTF-8, e.g. "image/png")
          var     Buffer data (raw bytes)
```

The magic bytes serve as a file type identifier. When the editor opens a file, it reads the first four bytes. If they spell `QUAR` (0x52415551 in little-endian), it's a binary v3 file. If not, it falls back to JSON parsing. This auto-detection means the editor opens both old JSON files and new binary files with the same menu item.

The flags field is reserved. Future versions might use it for compression, encryption, or other container-level features. For now it's always zero, and the decoder ignores it.

## Encoding: From Project to Binary

The encoding pipeline has three stages: serialize the project to JSON, extract images into binary buffers, and pack everything into the binary layout.

### Stage 1: Serialize to JSON

The serialization layer from Chapter 27 already knows how to convert the editor state into a `ProjectDataV3` object:

```typescript
export interface ProjectDataV3 {
  version: '3.0';
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: SerializedPage[];
  activePageId: string;
  settings: {
    timelineDuration: number;
    frameRate: number;
    autoKeyframe: boolean;
    onionSkin: OnionSkinSettings;
    guides?: Guide[];
  };
  rigging?: {
    vitruvianControllers?: VitruvianController[];
    dynamicChains?: DynamicChain[];
    globalWind?: WindSettings;
  };
  symbols?: SymbolDefinition[];
}
```

Each page contains a scene graph snapshot and a timeline. Images embedded in the scene graph are still data URIs at this point — the next stage handles them.

### Stage 2: Extract Image Buffers

This is where the size savings happen. `extractImageBuffers` deep-walks the JSON structure, finds every `src` field containing a data URI, decodes it to raw bytes, and replaces the field with a buffer reference:

```typescript
export function extractImageBuffers(json: unknown): { json: unknown; buffers: QuarBuffer[] } {
  const buffers: QuarBuffer[] = [];
  const seen = new Map<string, number>(); // dedup: data URI → buffer index

  function walk(obj: unknown): unknown {
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj === null || typeof obj !== 'object') return obj;

    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(record)) {
      if (key === 'src' && typeof record[key] === 'string') {
        const match = (record[key] as string).match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          const dataUri = record[key] as string;
          let index = seen.get(dataUri);
          if (index === undefined) {
            index = buffers.length;
            buffers.push({
              data: base64ToBytes(match[2]),
              mimeType: match[1],
            });
            seen.set(dataUri, index);
          }
          result[key] = `buffer:${index}`;
          continue;
        }
      }
      result[key] = walk(record[key]);
    }
    return result;
  }

  return { json: walk(json), buffers };
}
```

The `seen` map handles deduplication. If the same image appears on three different nodes — say, a texture used by three symbol instances — it's stored once in the buffer array. All three `src` fields point to `buffer:0`. For projects with repeated assets, this can save significantly more than the 33% base64 overhead.

The regex `/^data:(image\/[^;]+);base64,(.+)$/` matches only image data URIs. Non-image data (like SVG strings or mesh vertex data) stays in the JSON untouched. This is deliberate — images are the only fields large enough to benefit from binary storage.

### Stage 3: Pack the Binary

With the JSON cleaned of data URIs and the buffers extracted, `encodeQuarBinary` assembles the final binary:

```typescript
export function encodeQuarBinary(file: QuarFile): ArrayBuffer {
  const jsonBytes = encodeUTF8(JSON.stringify(file.json));

  // Calculate total size
  let totalSize = HEADER_SIZE + jsonBytes.length + 4; // header + json + bufferCount
  for (const buf of file.buffers) {
    const mimeBytes = encodeUTF8(buf.mimeType);
    totalSize += 4 + 4 + mimeBytes.length + buf.data.length;
  }

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let offset = 0;

  // Header
  view.setUint32(offset, QUAR_MAGIC, true);
  offset += 4;
  view.setUint32(offset, FORMAT_VERSION, true);
  offset += 4;
  view.setUint32(offset, 0, true);
  offset += 4; // flags
  view.setUint32(offset, jsonBytes.length, true);
  offset += 4;

  // JSON chunk
  bytes.set(jsonBytes, offset);
  offset += jsonBytes.length;

  // Buffers
  view.setUint32(offset, file.buffers.length, true);
  offset += 4;
  for (const buf of file.buffers) {
    const mimeBytes = encodeUTF8(buf.mimeType);
    view.setUint32(offset, buf.data.length, true);
    offset += 4;
    view.setUint32(offset, mimeBytes.length, true);
    offset += 4;
    bytes.set(mimeBytes, offset);
    offset += mimeBytes.length;
    bytes.set(buf.data, offset);
    offset += buf.data.length;
  }

  return arrayBuffer;
}
```

The function pre-calculates the total size, allocates a single `ArrayBuffer`, and writes everything in one pass using `DataView` for integers and `Uint8Array.set` for byte blocks. All integers are little-endian — the same byte order as the magic number.

The `encodeUTF8` and `decodeUTF8` helpers abstract over the environment difference between browsers (which have `TextEncoder`) and Node.js (which has `Buffer`):

```typescript
function encodeUTF8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  return new Uint8Array(Buffer.from(str, 'utf-8'));
}
```

This matters because the format tests run in Node.js via Vitest, while the editor runs in the browser.

## Decoding: From Binary to Project

Decoding reverses the process. `decodeQuarBinary` validates the header, parses the JSON chunk, and reads each buffer with its MIME type:

```typescript
export function decodeQuarBinary(buffer: ArrayBuffer): QuarFile {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error('File too small to be a valid .quar file');
  }

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Validate header
  const magic = view.getUint32(offset, true);
  offset += 4;
  if (magic !== QUAR_MAGIC) {
    throw new Error('Not a .quar file: wrong magic bytes');
  }

  const version = view.getUint32(offset, true);
  offset += 4;
  if (version > FORMAT_VERSION) {
    throw new Error(`Unsupported .quar version ${version} (max ${FORMAT_VERSION})`);
  }

  offset += 4; // skip flags

  // Read JSON chunk
  const jsonLength = view.getUint32(offset, true);
  offset += 4;
  const jsonStr = decodeUTF8(bytes.slice(offset, offset + jsonLength));
  const json = JSON.parse(jsonStr);
  offset += jsonLength;

  // Read buffers
  const buffers: QuarBuffer[] = [];
  if (offset + 4 <= buffer.byteLength) {
    const bufferCount = view.getUint32(offset, true);
    offset += 4;

    for (let i = 0; i < bufferCount; i++) {
      const dataLength = view.getUint32(offset, true);
      offset += 4;
      const mimeLength = view.getUint32(offset, true);
      offset += 4;
      const mimeType = decodeUTF8(bytes.slice(offset, offset + mimeLength));
      offset += mimeLength;
      const data = new Uint8Array(buffer.slice(offset, offset + dataLength));
      offset += dataLength;
      buffers.push({ data, mimeType });
    }
  }

  return { json, buffers };
}
```

The error messages are specific: "wrong magic bytes", "unsupported version", "truncated buffer header". When a user opens a corrupted file, the error should tell them — or the developer — exactly where decoding failed.

After decoding, `restoreImageBuffers` walks the JSON and converts every `buffer:N` reference back to a full data URI:

```typescript
export function restoreImageBuffers(json: unknown, buffers: QuarBuffer[]): unknown {
  function walk(obj: unknown): unknown {
    if (typeof obj === 'string') {
      const match = obj.match(/^buffer:(\d+)$/);
      if (match) {
        const index = parseInt(match[1], 10);
        if (index < buffers.length) {
          const buf = buffers[index];
          return `data:${buf.mimeType};base64,${bytesToBase64(buf.data)}`;
        }
      }
      return obj;
    }
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj === null || typeof obj !== 'object') return obj;

    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      result[key] = walk(record[key]);
    }
    return result;
  }

  return walk(json);
}
```

The restoration converts raw bytes back to base64 because the rest of the editor — the texture cache, the image renderer, the export pipeline — expects data URIs. The binary format is a transport optimization, not an architectural change. Once a file is loaded, the editor works with data URIs as before.

## The Migration Chain

Format migrations let old files load in new editors. Each migration is a pure function that takes one version's data and returns the next:

```typescript
export function migrateV1ToV2(data: Record<string, unknown>): Record<string, unknown> {
  const pageId = `page-migrated-${Date.now()}`;
  return {
    version: '2.0',
    name: data.name || 'Untitled Project',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    pages: [
      {
        id: pageId,
        name: 'Page 1',
        sceneGraph: data.sceneGraph,
        timeline: data.timeline || { tracks: [] },
      },
    ],
    activePageId: pageId,
    settings: data.settings,
    rigging: data.rigging,
    symbols: data.symbols,
  };
}

export function migrateV2ToV3(data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, version: '3.0' };
}
```

The v1→v2 migration wraps the single scene graph and timeline into a `pages[0]` entry — the same transformation we described in Chapter 27. The v2→v3 migration is trivial: it bumps the version string. The actual work of v3 (image extraction to binary buffers) happens at write time, not migration time. This is intentional — after migration, the data is a valid v3 JSON structure. Binary encoding is a serialization concern, not a data model concern.

The `migrateToLatest` function chains the migrations:

```typescript
export function migrateToLatest(data: Record<string, unknown>): Record<string, unknown> {
  const version = data.version as string | undefined;

  if (version === '3.0') return data;
  if (version === '2.0') return migrateV2ToV3(data);

  // v1.0 or unversioned
  return migrateV2ToV3(migrateV1ToV2(data));
}
```

This linear chain — v1 → v2 → v3 — is the simplest migration strategy. Each migration only knows about two adjacent versions. When v4.0 arrives, it will add one function (`migrateV3ToV4`) and one line in `migrateToLatest`. The intermediate versions are never skipped: a v1 file always passes through v2 on its way to v3, ensuring every migration's invariants are established in order.

## Auto-Detection: Binary or JSON?

The file parser doesn't require the user to specify which format they're opening. It detects the format automatically:

```typescript
export function parseQuarFile(data: ArrayBuffer | string): Record<string, unknown> {
  // String input: must be JSON (v1 or v2)
  if (typeof data === 'string') {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    return migrateToLatest(parsed);
  }

  // ArrayBuffer input: check for binary magic
  if (isQuarBinary(data)) {
    const file = decodeQuarBinary(data);
    const restored = restoreImageBuffers(file.json, file.buffers);
    return migrateToLatest(restored as Record<string, unknown>);
  }

  // ArrayBuffer but not binary: try as UTF-8 JSON
  const text = new TextDecoder().decode(data);
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return migrateToLatest(parsed);
}
```

The `isQuarBinary` check is a four-byte comparison:

```typescript
export function isQuarBinary(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false;
  return new DataView(data).getUint32(0, true) === QUAR_MAGIC;
}
```

The fallback path — ArrayBuffer that isn't binary — handles the case where a v1 or v2 JSON file is read as an ArrayBuffer by the file input. The `TextDecoder` converts the bytes to a string, and the normal JSON path takes over. This means `parseQuarFile` handles every combination: string JSON, ArrayBuffer JSON, and ArrayBuffer binary. The caller never needs to know which format the file was in.

## Writing: Always Binary

The `writeQuarFile` function is the counterpart to `parseQuarFile`. It always produces binary output:

```typescript
export function writeQuarFile(project: Record<string, unknown>): ArrayBuffer {
  const v3 = migrateToLatest(project);
  const { json, buffers } = extractImageBuffers(v3);
  return encodeQuarBinary({ json, buffers });
}
```

Three lines, three stages: ensure v3 structure, extract images, encode binary. The "migrate on read, write latest" pattern means the on-disk format upgrades silently. A user who opens a v1 JSON file and saves it gets a v3 binary file. They never see a migration dialog or a version warning.

## Validation Without a Schema Library

Before the editor applies a loaded project, it validates the structure. The validation is a type guard — a function that returns `true` if the data matches the expected shape and narrows the TypeScript type:

```typescript
export function validateProjectData(data: unknown): data is ProjectData {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const obj = data as Record<string, unknown>;
  const version = obj.version as string | undefined;

  if (version === '2.0' || version === '3.0') {
    return validateV2Data(obj);
  }
  return validateV1Data(obj);
}
```

The validators check structural invariants — pages is an array with at least one entry, each page has an id and a sceneGraph, each node has an id and a type, settings has finite numbers for duration and frame rate. They don't check every field exhaustively. The philosophy is to catch corrupted files (truncated JSON, wrong types) without rejecting files that have extra or missing optional fields. A file from a future version with unknown fields should load, not crash.

```typescript
function validateV2Data(obj: Record<string, unknown>): boolean {
  const pages = obj.pages;
  if (!Array.isArray(pages) || pages.length === 0) return false;

  if (typeof obj.activePageId !== 'string') return false;

  for (const page of pages) {
    if (typeof page !== 'object' || page === null) return false;
    const p = page as Record<string, unknown>;
    if (typeof p.id !== 'string') return false;
    if (typeof p.name !== 'string') return false;

    const sg = p.sceneGraph as Record<string, unknown> | undefined;
    if (!sg || !Array.isArray(sg.nodes)) return false;
    if (!Array.isArray(sg.rootNodeIds)) return false;
  }

  return validateSettings(obj);
}
```

We considered using Zod or io-ts for runtime validation but decided against it. The validator is ~60 lines. A schema library would add a dependency, increase bundle size, and introduce a DSL that doesn't match the shapes we actually need to check. For this specific problem — "is this object roughly the right shape" — hand-written checks are simpler and more maintainable.

## The Serialization Layer

The serialization layer sits between the editor state and the binary format. It knows about pages, timelines, and scene graphs. The binary format knows about JSON and buffers. Neither knows about the other's details.

### Serializing the Active Project

`serializeProject` captures the current editor state as a `ProjectDataV2` (which v3 extends):

```typescript
export function serializeProject(
  name: string,
  sceneGraph: SceneGraph,
  editorState: EditorStateSnapshot,
  existingCreatedAt?: string
): ProjectDataV2 {
  const now = new Date().toISOString();
  let pages: SerializedPage[] = [];

  if (editorState.pages && editorState.pages.length > 0) {
    pages = editorState.pages.map((page) => {
      if (page.id === editorState.activePageId) {
        // Active page: use live state
        return {
          id: page.id,
          name: page.name,
          sceneGraph: sceneGraph.toJSON(),
          timeline: structuredClone(editorState.timeline),
        };
      }
      // Inactive pages: use stored snapshots
      return {
        id: page.id,
        name: page.name,
        sceneGraph: structuredClone(page.sceneGraphJSON),
        timeline: structuredClone(page.timeline),
      };
    });
  }

  return {
    version: '2.0',
    name,
    createdAt: existingCreatedAt || now,
    updatedAt: now,
    pages,
    activePageId: editorState.activePageId || pages[0]?.id || '',
    settings: {
      /* ... */
    },
    rigging: {
      /* ... */
    },
    symbols: editorState.symbols ? [...editorState.symbols] : undefined,
  };
}
```

The key subtlety: the active page uses the live scene graph (`sceneGraph.toJSON()`), while inactive pages use their stored snapshots (`page.sceneGraphJSON`). This is the same pattern as page switching in Chapter 27 — the editor only keeps one scene graph alive at a time.

`structuredClone` on every timeline and scene graph snapshot is critical. Without it, the serialized data shares object references with the live editor state. A later mutation in the editor would retroactively modify the "saved" data, producing impossible bugs where loading a file gives you a state that was never saved.

The binary wrapper is a one-liner:

```typescript
export function serializeProjectToBinary(
  name: string,
  sceneGraph: SceneGraph,
  editorState: EditorStateSnapshot,
  existingCreatedAt?: string
): ArrayBuffer {
  const project = serializeProject(name, sceneGraph, editorState, existingCreatedAt);
  return writeQuarFile(project as Record<string, unknown>);
}
```

### Deserializing a Loaded File

Deserialization reverses the process. After `parseQuarFile` returns a v3 JSON object, `deserializeProject` applies it to the editor:

```typescript
export function deserializeProject(
  data: ProjectData,
  sceneGraph: SceneGraph,
  applyEditorState: (state: Partial<EditorStateSnapshot>) => void
): void {
  // Normalize to v2 structure
  let v2 = data;
  if (data.version === '1.0' || !data.version) {
    v2 = migrateV1ToV2(data as Record<string, unknown>) as ProjectDataV2;
  }

  const project = v2 as ProjectDataV2;
  const activePage = project.pages.find((p) => p.id === project.activePageId) || project.pages[0];

  // Load the active page's scene graph
  sceneGraph.fromJSON(activePage.sceneGraph);

  // Build PageData array for the editor store
  const pages: PageData[] = project.pages.map((p) => ({
    id: p.id,
    name: p.name,
    sceneGraphJSON: p.sceneGraph,
    timeline: migrateTimeline(p.timeline, project.settings),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  }));

  applyEditorState({
    timeline: migrateTimeline(activePage.timeline, project.settings),
    pages,
    activePageId: project.activePageId,
    symbols: project.symbols,
    // ... settings, rigging, etc.
  });
}
```

The `applyEditorState` callback is dependency injection — it lets `deserializeProject` update the Zustand store without importing it. The function is pure from the serialization layer's perspective: it receives data, transforms it, and calls a callback. This makes it testable without a full React environment.

### Timeline Migration

Timelines from older projects may use property paths that have since changed. The `migrateTimeline` function rewrites them:

```typescript
function migrateTimeline(
  timeline: Timeline | undefined,
  settings: Record<string, unknown>
): Timeline {
  if (!timeline) return createTimeline();

  const migrated = structuredClone(timeline);
  for (const track of migrated.tracks) {
    // Rename old property paths
    if (track.property === 'fill.color') {
      track.property = 'fills.0.color';
    }
    if (track.property === 'stroke.color') {
      track.property = 'strokes.0.color';
    }
  }
  return migrated;
}
```

When we refactored from a single `fill` to an array of `fills` in Chapter 19, every keyframe track targeting `fill.color` became invalid. Rather than writing a separate data migration, we handle it during deserialization. The migration is idempotent — running it twice on the same timeline produces the same result — so it's safe to apply unconditionally on every load.

## File I/O in the Browser

The browser's file APIs handle the actual reading and writing. `downloadProjectFile` creates a binary blob and triggers a download:

```typescript
export function downloadProjectFile(name: string, data: ProjectData): void {
  const binary = writeQuarFile(data as Record<string, unknown>);
  const blob = new Blob([binary], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(name)}.quar`;
  a.click();

  URL.revokeObjectURL(url);
}
```

The `sanitizeFilename` helper strips characters that are illegal in filenames across operating systems: `/ \ ? % * : | " < >`. The fallback is `'untitled'` if the name becomes empty after sanitization.

`uploadProjectFile` opens a file picker and reads the selected file as an ArrayBuffer:

```typescript
export function uploadProjectFile(): Promise<ProjectData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.quar,application/json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));

      if (file.size > 50 * 1024 * 1024) {
        return reject(new Error('File too large (max 50MB)'));
      }

      const arrayBuffer = await file.arrayBuffer();
      const data = parseQuarFile(arrayBuffer);

      if (!validateProjectData(data)) {
        return reject(new Error('Invalid project file'));
      }

      resolve(data as ProjectData);
    };

    input.click();
  });
}
```

Reading as `ArrayBuffer` instead of text is important. If the file is binary v3, reading it as text would corrupt the image buffers. `parseQuarFile` handles both binary and JSON `ArrayBuffer` inputs, so reading as `ArrayBuffer` is always safe.

The 50MB limit is a pragmatic guard. A project with hundreds of high-resolution images might approach this limit, but a normal project is well under 10MB. The limit prevents the browser from freezing on an accidentally selected video file or disk image.

## IndexedDB Persistence

For auto-save and the project list, projects are stored in IndexedDB — the browser's persistent key-value database. The storage layer wraps the IndexedDB API:

```typescript
export async function saveProject(
  id: string,
  name: string,
  data: string | ArrayBuffer
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite');
    const store = tx.objectStore(PROJECTS_STORE);
    store.put({
      id,
      name,
      updatedAt: new Date().toISOString(),
      data,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

The `data` field accepts both `string` and `ArrayBuffer`. New saves use `ArrayBuffer` (v3 binary). Old projects that were saved before the binary format might have `string` data. The storage layer doesn't care — IndexedDB handles both types natively.

The database is lazily initialized. The first call to `initDB()` opens the database and caches the promise. Subsequent calls return the cached promise immediately:

```typescript
let dbPromise: Promise<IDBDatabase> | null = null;

function initDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // allow retry
      reject(request.error);
    };
  });

  return dbPromise;
}
```

Setting `dbPromise = null` on error is deliberate. If the database fails to open — perhaps because the user denied storage permission — the next operation retries instead of returning the cached rejection forever.

## The React Integration

The `useProjectActions` hook wires everything together for the UI. It returns an object of callbacks that the menu bar and keyboard shortcuts call:

```typescript
export function useProjectActions(options: UseProjectActionsOptions = {}): ProjectActions {
  const sceneGraph = useSceneGraph();
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval>>();
  const autoSavingRef = useRef(false);
  const manualSavingRef = useRef(false);

  // ... callbacks defined here

  return {
    newProject,
    saveProject,
    saveProjectAs,
    openProject,
    downloadProject,
    importProject,
    importSvg,
    importImage,
    deleteProject,
    listProjects,
  };
}
```

### Auto-Save

Auto-save runs on a 30-second interval. It only triggers if the project has been modified and isn't currently being saved:

```typescript
useEffect(() => {
  autoSaveTimerRef.current = setInterval(() => {
    const { isDirty, projectId } = useEditorStore.getState();
    if (isDirty && projectId && !autoSavingRef.current && !manualSavingRef.current) {
      autoSavingRef.current = true;
      saveProject()
        .catch(() => toast.error('Auto-save failed'))
        .finally(() => {
          autoSavingRef.current = false;
        });
    }
  }, AUTO_SAVE_INTERVAL);

  return () => clearInterval(autoSaveTimerRef.current);
}, [saveProject]);
```

Three guards prevent concurrent saves: `isDirty` ensures there's something to save, `autoSavingRef` prevents the interval from stacking saves, and `manualSavingRef` prevents auto-save from racing with a user-triggered save. Without these guards, two concurrent IndexedDB writes to the same key can produce unpredictable results.

### Auto-Load on Mount

When the editor loads, it restores the last opened project:

```typescript
useEffect(() => {
  let cancelled = false;

  async function loadOnMount() {
    let targetId: string | undefined;

    if (typeof options.loadProjectId === 'string') {
      targetId = options.loadProjectId;
    } else if (options.loadProjectId === undefined) {
      targetId = await getLastProjectId();
    }
    // null = skip auto-load entirely

    if (!targetId || cancelled) return;
    const stored = await loadProject(targetId);
    if (!stored || cancelled) return;

    deserializeProjectFromBinary(stored.data, sceneGraph, applyEditorState);
    useEditorStore.setState({
      projectId: targetId,
      projectName: stored.name,
      isDirty: false,
    });
  }

  loadOnMount();
  return () => {
    cancelled = true;
  };
}, [sceneGraph]);
```

The `cancelled` flag prevents state updates after the component unmounts. This matters in React StrictMode, where effects run twice in development: the first mount's cleanup sets `cancelled = true`, preventing the stale load from applying state to a component that has already unmounted and remounted.

## Testing the Binary Format

Binary format tests verify the round-trip: encode, decode, and check that the data survived. The tests don't need a browser, a scene graph, or React — they operate on plain objects and ArrayBuffers:

```typescript
describe('encodeQuarBinary / decodeQuarBinary', () => {
  it('round-trips JSON with no buffers', () => {
    const file: QuarFile = {
      json: { version: '3.0', pages: [] },
      buffers: [],
    };

    const binary = encodeQuarBinary(file);
    const decoded = decodeQuarBinary(binary);

    expect(decoded.json).toEqual(file.json);
    expect(decoded.buffers).toHaveLength(0);
  });

  it('round-trips JSON with image buffers', () => {
    const imageData = new Uint8Array([137, 80, 78, 71]); // PNG header
    const file: QuarFile = {
      json: { version: '3.0', pages: [] },
      buffers: [{ data: imageData, mimeType: 'image/png' }],
    };

    const binary = encodeQuarBinary(file);
    const decoded = decodeQuarBinary(binary);

    expect(decoded.buffers).toHaveLength(1);
    expect(decoded.buffers[0].mimeType).toBe('image/png');
    expect(decoded.buffers[0].data).toEqual(imageData);
  });
});
```

Image extraction tests verify that data URIs are converted to buffer references and back:

```typescript
it('extracts and restores image data URIs', () => {
  const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
  const json = {
    pages: [
      {
        sceneGraph: {
          nodes: [{ type: 'image', src: dataUri }],
        },
      },
    ],
  };

  const { json: cleaned, buffers } = extractImageBuffers(json);

  // The src field should now be a buffer reference
  expect(cleaned.pages[0].sceneGraph.nodes[0].src).toBe('buffer:0');
  expect(buffers).toHaveLength(1);
  expect(buffers[0].mimeType).toBe('image/png');

  // Restoration should produce the original data URI
  const restored = restoreImageBuffers(cleaned, buffers);
  expect(restored.pages[0].sceneGraph.nodes[0].src).toBe(dataUri);
});
```

Deduplication tests verify that identical images share a single buffer:

```typescript
it('deduplicates identical images', () => {
  const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
  const json = {
    nodes: [
      { type: 'image', src: dataUri },
      { type: 'image', src: dataUri },
      { type: 'image', src: dataUri },
    ],
  };

  const { json: cleaned, buffers } = extractImageBuffers(json);

  expect(buffers).toHaveLength(1); // one buffer, not three
  expect(cleaned.nodes[0].src).toBe('buffer:0');
  expect(cleaned.nodes[1].src).toBe('buffer:0');
  expect(cleaned.nodes[2].src).toBe('buffer:0');
});
```

The migration chain tests verify that files from every version reach v3:

```typescript
it('migrates v1 all the way to v3', () => {
  const v1 = {
    name: 'Old Project',
    sceneGraph: { nodes: [], rootNodeIds: [] },
    timeline: { tracks: [] },
    settings: { timelineDuration: 300, frameRate: 30 },
  };

  const result = migrateToLatest(v1);

  expect(result.version).toBe('3.0');
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].name).toBe('Page 1');
});
```

## Lessons

**Binary formats don't have to be complicated.** The `.quar` v3 format is a 16-byte header, a JSON string, and a sequence of typed buffers. No compression, no custom serialization, no protocol buffers. The JSON handles the complex structured data (scene graphs, timelines, keyframes). The binary buffers handle the one thing JSON is bad at: large blobs of binary data. Mixing the two is simpler than committing to either one exclusively.

**Extract binary at write time, restore at read time.** Images live as data URIs throughout the editor — in the scene graph, the texture cache, the export pipeline. The binary format is a transport optimization, not an internal representation change. This means adopting the binary format required zero changes to any rendering, editing, or export code. Only the save and load paths changed.

**Deduplication is cheap and effective.** A `Map<string, number>` from data URI to buffer index catches every duplicate image during extraction. The cost is one hash lookup per image. The savings can be dramatic for projects with symbol instances that share textures.

**Always auto-detect, never require the user to specify format.** `parseQuarFile` reads four bytes to check for the magic number. If it matches, decode as binary. If not, try as JSON. The user opens a file; the editor figures out the rest. Supporting this required exactly one `if` statement.

**The migration chain must be linear and additive.** Each migration knows only two versions: its input and its output. v1→v2 doesn't know v3 exists. v2→v3 doesn't know v1 exists. Adding v4 means adding one function and one line in `migrateToLatest`. This scales indefinitely and never requires modifying existing migrations.

**Validate structure, not schema.** The validator checks that pages is a non-empty array, that each page has an id and a sceneGraph, and that settings has finite numbers. It doesn't check every field of every node. This means files from future versions with additional fields load without errors, and files with missing optional fields degrade gracefully.

## What We Built

This chapter covered the `.quar` v3.0 binary file format — a compact container that separates structured data from binary assets:

- **Binary layout** uses a 16-byte header (magic `0x52415551`, version, flags, JSON length) followed by a UTF-8 JSON chunk and typed binary buffers. All integers are little-endian uint32.
- **`extractImageBuffers`** deep-walks the project JSON, finds `src` fields with data URIs, decodes them to raw bytes, replaces them with `buffer:N` references, and deduplicates identical images via a `Map<string, number>`.
- **`encodeQuarBinary` / `decodeQuarBinary`** pack and unpack the binary format using `DataView` for integers and `Uint8Array.set` for byte blocks, with specific error messages for every failure mode.
- **The migration chain** converts v1 (single-page JSON) → v2 (multi-page JSON) → v3 (binary container) through linear, composable pure functions. `migrateToLatest` chains them. `parseQuarFile` auto-detects the format.
- **Validation** uses hand-written type guards instead of a schema library, checking structural invariants (pages array, node ids, finite numbers) without rejecting unknown fields.
- **`serializeProject` / `deserializeProject`** bridge between the editor's live state and the file format, using `structuredClone` to prevent shared references between saved data and live state.
- **IndexedDB persistence** stores binary ArrayBuffers with lazy database initialization, quota error detection, and a `settings` store for remembering the last opened project.
- **Auto-save** runs every 30 seconds with three concurrency guards (isDirty, autoSavingRef, manualSavingRef) to prevent racing saves.

The next chapter covers selected element export — rendering individual nodes to PNG and SVG files with configurable resolution multipliers, using an offscreen WebGL canvas and the `preserveDrawingBuffer` flag that makes `toBlob()` work after rendering.
