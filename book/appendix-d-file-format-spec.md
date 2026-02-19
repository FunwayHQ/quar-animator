# Appendix D — File Format Specification

This appendix documents the `.quar` file format across all three versions: v1.0 (legacy single-page JSON), v2.0 (multi-page JSON), and v3.0 (binary container with extracted image buffers).

## Format Overview

| Version | Encoding | Pages    | Images                      | Status                             |
| ------- | -------- | -------- | --------------------------- | ---------------------------------- |
| 1.0     | JSON     | Single   | Inline data URIs            | Deprecated (auto-migrated on load) |
| 2.0     | JSON     | Multiple | Inline data URIs            | Supported (auto-migrated on load)  |
| 3.0     | Binary   | Multiple | Extracted to binary buffers | Current (default save format)      |

All three versions load seamlessly. The `parseQuarFile()` function auto-detects the format and runs the migration chain to produce a v3.0 in-memory object.

## V3.0 Binary Layout

### Header (16 bytes)

| Offset | Size    | Type      | Field       | Value                                  |
| ------ | ------- | --------- | ----------- | -------------------------------------- |
| 0–3    | 4 bytes | uint32 LE | Magic       | `0x52415551` ("QUAR" in little-endian) |
| 4–7    | 4 bytes | uint32 LE | Version     | `3`                                    |
| 8–11   | 4 bytes | uint32 LE | Flags       | `0` (reserved)                         |
| 12–15  | 4 bytes | uint32 LE | JSON Length | N (size of JSON chunk in bytes)        |

### JSON Chunk

| Offset | Size    | Type  | Description                                                      |
| ------ | ------- | ----- | ---------------------------------------------------------------- |
| 16     | N bytes | UTF-8 | Minified JSON (ProjectDataV3 with `"buffer:N"` image references) |

### Buffer Count

| Offset | Size    | Type      | Description             |
| ------ | ------- | --------- | ----------------------- |
| 16 + N | 4 bytes | uint32 LE | Number of image buffers |

### Buffer Entries (repeated for each buffer)

Each buffer is stored sequentially with no padding:

| Field       | Size              | Type       | Description                         |
| ----------- | ----------------- | ---------- | ----------------------------------- |
| Data Length | 4 bytes           | uint32 LE  | Size of raw image data              |
| MIME Length | 4 bytes           | uint32 LE  | Size of MIME type string            |
| MIME Type   | MIME Length bytes | UTF-8      | e.g., `"image/png"`, `"image/jpeg"` |
| Data        | Data Length bytes | Raw binary | Image bytes (not base64)            |

### Visual Layout

```
┌──────────────────────────────────────────────────┐
│ Magic (4B) │ Version (4B) │ Flags (4B) │ JSON Len (4B) │  ← Header (16 bytes)
├──────────────────────────────────────────────────┤
│ JSON chunk (UTF-8, minified)                     │  ← JSON Length bytes
├──────────────────────────────────────────────────┤
│ Buffer Count (4B)                                │
├──────────────────────────────────────────────────┤
│ Buffer 0: DataLen(4B) MIMELen(4B) MIME Data      │
│ Buffer 1: DataLen(4B) MIMELen(4B) MIME Data      │
│ ...                                              │
└──────────────────────────────────────────────────┘
```

## Image Extraction and Restoration

### Extraction (on save)

The `extractImageBuffers()` function walks the JSON tree and finds all `src` fields matching the data URI pattern:

```
data:(image/[type]);base64,[base64data]
```

Each matching field is:

1. Decoded from base64 to raw binary
2. Stored in a buffer array with its MIME type
3. Replaced in the JSON with a reference string: `"buffer:0"`, `"buffer:1"`, etc.

Identical data URIs are deduplicated — if two ImageNodes share the same `src`, they reference the same buffer index.

### Restoration (on load)

The `restoreImageBuffers()` function walks the JSON tree and finds all `src` fields matching `buffer:N`. Each is replaced with a reconstructed data URI:

```
data:[mimeType];base64,[base64data]
```

### Size Savings

Base64 encoding uses 4 characters for every 3 bytes of binary data — a 33% overhead. For a project with 5 MB of images, the binary format saves approximately 1.7 MB compared to JSON with inline data URIs.

## JSON Schema: ProjectDataV3

```typescript
interface ProjectDataV3 {
  version: '3.0';
  name: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  pages: SerializedPage[];
  activePageId: string;
  settings: ProjectSettings;
  rigging?: RiggingData;
  symbols?: SymbolDefinition[];
}
```

### SerializedPage

```typescript
interface SerializedPage {
  id: string;
  name: string;
  sceneGraph: {
    nodes: Node[]; // All nodes (see Appendix B)
    rootNodeIds: string[]; // Top-level node IDs (ordered)
  };
  timeline: Timeline;
}
```

### ProjectSettings

```typescript
interface ProjectSettings {
  timelineDuration: number; // Frames
  frameRate: number; // FPS (24, 30, or 60)
  autoKeyframe: boolean;
  onionSkin: OnionSkinSettings;
  guides?: Guide[];
}

interface OnionSkinSettings {
  enabled: boolean;
  beforeCount: number; // 1–5
  afterCount: number; // 1–5
  beforeColor: string; // Hex color (default: red)
  afterColor: string; // Hex color (default: teal)
  opacity: number; // 0–1
  falloff: number; // 0–1
  showDuringPlayback: boolean;
}

interface Guide {
  id: string;
  axis: 'horizontal' | 'vertical';
  position: number; // World-space coordinate
}
```

### RiggingData

```typescript
interface RiggingData {
  vitruvianControllers?: VitruvianController[];
  dynamicChains?: DynamicChain[];
  globalWind?: WindSettings;
}
```

These rigging types (`VitruvianController`, `DynamicChain`, `WindSettings`) are defined in `packages/types/src/index.ts` alongside the node types documented in Appendix B.

### Timeline

```typescript
interface Timeline {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  tracks: PropertyTrack[];
  markers: Marker[];
}

interface PropertyTrack {
  id: string;
  nodeId: string;
  property: string; // Dot notation (see below)
  keyframes: Keyframe[];
}
```

### Animatable Properties (dot notation)

| Property Path          | Type             | Used By               |
| ---------------------- | ---------------- | --------------------- |
| `transform.position.x` | number           | All nodes             |
| `transform.position.y` | number           | All nodes             |
| `transform.rotation`   | number (degrees) | All nodes             |
| `transform.scale.x`    | number           | All nodes             |
| `transform.scale.y`    | number           | All nodes             |
| `opacity`              | number (0–1)     | All nodes             |
| `width`                | number           | Rectangle, Artboard   |
| `height`               | number           | Rectangle, Artboard   |
| `radiusX`              | number           | Ellipse               |
| `radiusY`              | number           | Ellipse               |
| `fills.0.color`        | Color string     | Shapes with fills     |
| `strokes.0.color`      | Color string     | Shapes with strokes   |
| `points`               | PathPoint[]      | Path (shape tweening) |

## JSON Schema: ProjectDataV2

```typescript
interface ProjectDataV2 {
  version: '2.0';
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: SerializedPage[];
  activePageId: string;
  settings: ProjectSettings;
  rigging?: RiggingData;
  symbols?: SymbolDefinition[];
}
```

Structurally identical to V3. The only difference is the version string and that images remain as inline data URIs (no buffer extraction).

## JSON Schema: ProjectDataV1

```typescript
interface ProjectDataV1 {
  version: '1.0'; // May be missing in very old files
  name: string;
  createdAt: string;
  updatedAt: string;
  sceneGraph: {
    // Single page (no pages array)
    nodes: Node[];
    rootNodeIds: string[];
  };
  timeline: Timeline;
  settings: ProjectSettings;
  rigging?: RiggingData;
}
```

No `pages` array, no `symbols` array, no `activePageId`. The single scene graph and timeline are top-level fields.

## Migration Chain

### V1 → V2: Single Page to Multi-Page

The `migrateV1ToV2()` function wraps the single scene graph and timeline into a `pages[0]` entry:

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
    symbols: data.symbols,
  };
}
```

### V2 → V3: Version Bump

The `migrateV2ToV3()` function only updates the version string. Image extraction happens later during `writeQuarFile()`, not during migration:

```typescript
function migrateV2ToV3(data: ProjectDataV2): ProjectDataV3 {
  return { ...data, version: '3.0' };
}
```

### Migration Order

```
migrateToLatest(data):
  if version is undefined or '1.0' → migrateV1ToV2 → migrateV2ToV3
  if version is '2.0'              → migrateV2ToV3
  if version is '3.0'              → return as-is
```

## Auto-Detection

The `parseQuarFile()` function accepts either `ArrayBuffer` or `string`:

1. If input is `ArrayBuffer` with ≥ 4 bytes:
   - Read first 4 bytes as uint32 LE
   - If equals `0x52415551` → binary v3: decode header, JSON chunk, buffers, restore images, migrate
   - Otherwise → decode as UTF-8 string, fall through to JSON parsing
2. If input is `string` (or fell through from step 1):
   - `JSON.parse()` the string
   - Run `migrateToLatest()`
   - Return ProjectDataV3

## Validation

The `validateProjectData()` function performs structural checks without a schema library:

| Check         | Condition                                                           |
| ------------- | ------------------------------------------------------------------- |
| Version       | Must be `'1.0'`, `'2.0'`, or `'3.0'` (string)                       |
| Pages (v2/v3) | Must be a non-empty array                                           |
| Each page     | Must have `id` (string), `name` (string), `sceneGraph` (object)     |
| Scene graph   | Must have `nodes` (array) and `rootNodeIds` (array)                 |
| Settings      | `timelineDuration` and `frameRate` must be finite numbers           |
| Nodes         | Each must have `id` (string), `type` (string), `transform` (object) |

## Error Messages

| Condition               | Error                                                    |
| ----------------------- | -------------------------------------------------------- |
| File < 16 bytes         | "Invalid .quar file: too small to contain header"        |
| Wrong magic             | "Invalid .quar file: wrong magic bytes"                  |
| Unsupported version     | "Unsupported .quar format version: {N}"                  |
| JSON extends past EOF   | "Invalid .quar file: JSON chunk extends beyond file"     |
| Malformed JSON          | "Invalid .quar file: corrupted JSON chunk"               |
| Truncated buffer header | "Invalid .quar file: truncated buffer {i} header"        |
| Truncated MIME          | "Invalid .quar file: truncated MIME type for buffer {i}" |
| Truncated buffer data   | "Invalid .quar file: truncated data for buffer {i}"      |

## Constants

```typescript
export const QUAR_MAGIC = 0x52415551; // "QUAR" little-endian
export const FORMAT_VERSION = 3;
const HEADER_SIZE = 16; // bytes
```

## File Size Limit

The `uploadProjectFile()` function enforces a 50 MB maximum file size. Format detection requires no file extension — content is inspected directly.
