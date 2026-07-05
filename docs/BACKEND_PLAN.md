# Quar Animator — Backend Plan (Rust / Axum + MySQL)

> Status: proposal / design. Target: a hosted, multi-tenant backend for Quar Animator with
> file-based project storage, a REST/WebSocket API for the web app, and a **first-class remote
> MCP server** (Figma-style: HTTP transport + OAuth) that lets AI assistants operate on real
> server-side projects. Supersedes the local stdio Python MCP in `tools/quar-mcp`.

---

## 1. Goals & Non-Goals

### Goals

1. **Persist projects server-side** so they are no longer trapped in a single browser's IndexedDB.
   - Project _blobs_ (`.quar` binary) live **outside the database as files** (local FS in dev, S3-compatible object storage in prod).
   - MySQL holds **metadata + pointers + relational data** (users, projects, versions, sharing, MCP sessions), never the multi-MB blob.
2. **Multi-tenant auth**: users, sessions, organizations/teams, per-project access control.
3. **A powerful remote MCP server** ("proper MCP like Figma") embedded in the backend:
   - Streamable-HTTP transport (not stdio), OAuth 2.1 authorization, multi-tenant, operates on the
     caller's real hosted projects.
   - A **semantic** tool surface (design-context reads, structured animation, render/preview, export,
     batch edits) — a strict superset of the current 25-tool Python server, which is being retired.
4. **Zero data-format churn**: the wire/storage format stays the existing `.quar` v3 binary
   (`QUAR` magic + `ProjectDataV2/V3` JSON + extracted image buffers). The backend is format-aware
   but format-compatible with the current TS reader/writer.
5. **Incremental adoption**: the web app keeps working offline against IndexedDB; the backend is an
   opt-in sync/collaboration/AI layer on top, not a hard dependency.

### Non-Goals (v1)

- Real-time multiplayer co-editing (CRDT/OT). We design the version/locking model so it's _possible_
  later, but v1 is single-writer with optimistic concurrency.
- Server-side WebGL rendering for full video export (kept client-side via FFmpeg.wasm for now; the
  backend exposes an _export job_ API surface so this can move server-side in a later phase).
- Replacing the native `.quar` format. We wrap it, we don't redesign it.

---

## 2. Where This Fits (current state → target)

**Today:** `apps/web` serializes editor state → `ProjectDataV2` → `writeQuarFile()` → binary
`ArrayBuffer` → **IndexedDB** (`projectStorage.ts`). No server exists. The only "API" is a local
**stdio** Python FastMCP server (`tools/quar-mcp`) that reads/writes `.quar` files on the user's disk.

**Target:**

```
┌──────────────┐      REST/WS (JWT)        ┌───────────────────────────┐
│  apps/web    │ ────────────────────────► │      Rust / Axum backend  │
│ (React,      │ ◄──────────────────────── │                           │
│  Zustand,    │   project blobs + meta    │  ┌─────────────────────┐  │
│  IndexedDB   │                           │  │ REST API (axum)     │  │
│  offline cache)                          │  │ WS sync/presence    │  │
└──────────────┘                           │  ├─────────────────────┤  │
                                           │  │ MCP server (HTTP)   │  │  ◄─ Claude / any
        ┌──────────────┐   OAuth 2.1       │  │  Streamable HTTP    │  │     MCP client
        │ AI assistant │ ────────────────► │  │  + OAuth 2.1        │  │
        │ (Claude etc.)│ ◄──────────────── │  └─────────────────────┘  │
        └──────────────┘   MCP JSON-RPC    │           │               │
                                           │   ┌───────┴────────┐      │
                                           │   ▼                ▼      │
                                     ┌──────────┐        ┌─────────────┐
                                     │  MySQL   │        │ Blob store  │
                                     │ metadata │        │ .quar files │
                                     │ + rel'l  │        │ (FS / S3)   │
                                     └──────────┘        └─────────────┘
```

The **existing Python MCP** becomes a thin optional "local files" adapter or is deprecated outright;
the canonical MCP is now the hosted one that shares the backend's auth and storage.

---

## 3. Technology Choices

| Concern         | Choice                                                                                                                | Rationale                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP framework  | **axum 0.7+** (on tokio + hyper + tower)                                                                              | Requested; ecosystem-standard, tower middleware, great WS + streaming support for MCP SSE.                                                                 |
| DB access       | **sqlx 0.8** (async, compile-time-checked queries) against MySQL                                                      | Requested MySQL. sqlx keeps SQL explicit and verifiable at compile time; no heavy ORM lock-in. (SeaORM is the fallback if we want richer entity modeling.) |
| Migrations      | **sqlx-cli** (`migrations/*.sql`)                                                                                     | Versioned, reviewable SQL; runs in CI and on boot.                                                                                                         |
| Blob storage    | Trait `BlobStore` with **local-FS** and **S3-compatible** (`aws-sdk-s3` / MinIO) impls                                | "Projects saved outside the DB as files" — files on disk in dev, object storage in prod, same interface.                                                   |
| Auth (users)    | **JWT access tokens** (short-lived) + rotating refresh tokens; `argon2` password hashing                              | Stateless API auth; refresh tokens tracked in DB for revocation.                                                                                           |
| Auth (MCP)      | **OAuth 2.1 + PKCE** authorization-code flow, per the MCP auth spec                                                   | This is exactly how Figma's remote MCP authenticates AI clients; MCP clients do dynamic client registration + browser consent.                             |
| MCP protocol    | **`rmcp`** (official Rust MCP SDK) mounted as an axum sub-router over **Streamable HTTP**                             | First-class MCP with tools/resources/prompts, server-initiated messages, and SSE streaming.                                                                |
| Serialization   | **serde / serde_json** for the `.quar` JSON chunk; a small `quar_format` crate for the binary envelope                | Mirror `quarFormat.ts` byte-for-byte in Rust.                                                                                                              |
| Validation      | **`validator`** + hand-written structural checks matching `validateProjectData`                                       | Reject malformed `.quar` server-side.                                                                                                                      |
| Background jobs | tokio tasks + a DB-backed `jobs` table (export, thumbnail render)                                                     | Simple, durable; upgrade to a real queue (NATS/Redis) later.                                                                                               |
| Observability   | `tracing` + `tracing-subscriber`, OpenTelemetry export; `/healthz` `/readyz`                                          | Standard.                                                                                                                                                  |
| Config          | `figment`/`envy` layered env + file                                                                                   | 12-factor.                                                                                                                                                 |
| Tests           | `cargo test`, `sqlx::test` against an ephemeral MySQL (testcontainers), `httpc-test` for API, MCP conformance harness | End-to-end confidence.                                                                                                                                     |

---

## 4. Rust Workspace Layout

A Cargo workspace under a new top-level `backend/` (keeps the pnpm JS monorepo untouched):

```
backend/
├── Cargo.toml                # workspace
├── crates/
│   ├── quar-format/          # .quar binary envelope + ProjectData types (port of quarFormat.ts)
│   │   ├── src/binary.rs      #   encode/decode QUAR magic, JSON chunk, image buffers
│   │   ├── src/model.rs        #   serde types: ProjectDataV2/V3, Page, Node, Timeline, Track…
│   │   ├── src/migrate.rs      #   v1→v2→v3 migration (port of quarMigration.ts)
│   │   └── src/validate.rs     #   structural validation (port of projectSerializer validators)
│   ├── quar-store/           # BlobStore trait + FS + S3 impls; content-addressed layout
│   ├── quar-db/              # sqlx models, queries, migrations runner
│   ├── quar-core/            # domain services: Projects, Versions, Users, Auth, ACL, Jobs
│   ├── quar-api/             # axum REST + WS routers, DTOs, middleware
│   ├── quar-mcp/             # MCP server: tools/resources/prompts over rmcp, OAuth glue
│   └── quar-server/          # bin: composes api + mcp + oauth under one axum app, config, boot
└── migrations/              # *.sql (sqlx)
```

Key design point: `quar-format` and `quar-store` are **UI-agnostic and reusable** — the same crate
backs both the REST API and the MCP server, so an AI edit and a UI edit go through identical
validation and identical file writes. No format drift (a top finding of the code review: the
`.quar` format is currently defined in `quarFormat.ts`, `projectSerializer.ts`, _and_
`tools/quar-mcp/app/quar_format.py`, three places that can diverge — Rust collapses this to one).

---

## 5. Data Model (MySQL)

Blobs live in the blob store; MySQL stores metadata, relational structure, and small hot fields.
All ids are `CHAR(26)` **ULIDs** (sortable, URL-safe) unless noted. `utf8mb4`, InnoDB.

```sql
-- Users & teams -----------------------------------------------------------
CREATE TABLE users (
  id            CHAR(26)     PRIMARY KEY,
  email         VARCHAR(320) NOT NULL UNIQUE,
  display_name  VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255)  NULL,           -- null for SSO-only accounts
  avatar_url    VARCHAR(1024) NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE teams (
  id         CHAR(26) PRIMARY KEY,
  name       VARCHAR(160) NOT NULL,
  slug       VARCHAR(160) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE team_members (
  team_id CHAR(26) NOT NULL,
  user_id CHAR(26) NOT NULL,
  role    ENUM('owner','admin','editor','viewer') NOT NULL DEFAULT 'editor',
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Projects (metadata only; the .quar bytes live in the blob store) --------
CREATE TABLE projects (
  id             CHAR(26)     PRIMARY KEY,
  owner_user_id  CHAR(26)     NOT NULL,
  team_id        CHAR(26)     NULL,           -- null = personal
  name           VARCHAR(255) NOT NULL,
  slug           VARCHAR(255) NULL,
  -- denormalized summary for cheap listing (kept in sync on each save):
  format_version SMALLINT     NOT NULL DEFAULT 3,
  page_count     INT          NOT NULL DEFAULT 1,
  node_count     INT          NOT NULL DEFAULT 0,
  duration_frames INT         NOT NULL DEFAULT 0,
  frame_rate     INT          NOT NULL DEFAULT 24,
  thumbnail_blob_id CHAR(26)  NULL,
  current_version_id CHAR(26) NULL,           -- points at project_versions.id
  size_bytes     BIGINT       NOT NULL DEFAULT 0,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at     DATETIME(3)  NULL,           -- soft delete
  INDEX idx_projects_owner (owner_user_id, updated_at),
  INDEX idx_projects_team  (team_id, updated_at),
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- Immutable version history; each save writes a new blob + row -------------
CREATE TABLE project_versions (
  id            CHAR(26)     PRIMARY KEY,
  project_id    CHAR(26)     NOT NULL,
  seq           INT          NOT NULL,        -- 1,2,3… per project (optimistic concurrency token)
  blob_id       CHAR(26)     NOT NULL,        -- -> blobs.id ; the .quar file for this version
  content_hash  CHAR(64)     NOT NULL,        -- sha256 of the .quar bytes (dedup / integrity)
  author_user_id CHAR(26)    NULL,
  author_kind   ENUM('user','mcp','system') NOT NULL DEFAULT 'user',
  message       VARCHAR(500) NULL,            -- optional "commit" note (great for MCP edits)
  size_bytes    BIGINT       NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_project_seq (project_id, seq),
  INDEX idx_versions_project (project_id, created_at),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Blob registry: pointer + metadata for every file kept outside the DB ----
CREATE TABLE blobs (
  id           CHAR(26)     PRIMARY KEY,
  store        ENUM('fs','s3') NOT NULL,
  storage_key  VARCHAR(1024) NOT NULL,        -- path/object key, e.g. projects/{proj}/{hash}.quar
  content_hash CHAR(64)      NOT NULL,
  mime_type    VARCHAR(255)  NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   BIGINT        NOT NULL,
  created_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_blob_hash (content_hash),      -- content-addressed dedup across projects
  INDEX idx_blob_key (storage_key)
);

-- Sharing / ACL beyond team membership ------------------------------------
CREATE TABLE project_collaborators (
  project_id CHAR(26) NOT NULL,
  user_id    CHAR(26) NOT NULL,
  role       ENUM('editor','viewer') NOT NULL DEFAULT 'viewer',
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Auth: refresh tokens, personal API keys ---------------------------------
CREATE TABLE refresh_tokens (
  id         CHAR(26)    PRIMARY KEY,
  user_id    CHAR(26)    NOT NULL,
  token_hash CHAR(64)    NOT NULL,            -- sha256(refresh token)
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_refresh_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- OAuth 2.1 for MCP clients (dynamic client registration + tokens) --------
CREATE TABLE oauth_clients (
  id            CHAR(26)     PRIMARY KEY,       -- client_id
  client_secret_hash VARCHAR(255) NULL,         -- null for public/PKCE clients
  redirect_uris JSON         NOT NULL,
  name          VARCHAR(255) NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE oauth_grants (
  id             CHAR(26)    PRIMARY KEY,
  client_id      CHAR(26)    NOT NULL,
  user_id        CHAR(26)    NOT NULL,
  scopes         JSON        NOT NULL,           -- e.g. ["projects:read","projects:write"]
  code_hash      CHAR(64)    NULL,               -- authorization code (short-lived)
  code_challenge VARCHAR(255) NULL,              -- PKCE S256
  access_hash    CHAR(64)    NULL,
  refresh_hash   CHAR(64)    NULL,
  expires_at     DATETIME(3) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_grants_client_user (client_id, user_id),
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- MCP sessions + audit of AI edits ----------------------------------------
CREATE TABLE mcp_sessions (
  id         CHAR(26)    PRIMARY KEY,
  user_id    CHAR(26)    NOT NULL,
  client_id  CHAR(26)    NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE audit_log (
  id         CHAR(26)    PRIMARY KEY,
  actor_kind ENUM('user','mcp','system') NOT NULL,
  actor_id   CHAR(26)    NULL,
  project_id CHAR(26)    NULL,
  action     VARCHAR(80) NOT NULL,             -- e.g. "project.save","mcp.add_node"
  detail     JSON        NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_project (project_id, created_at)
);

-- Async jobs (export, thumbnail) ------------------------------------------
CREATE TABLE jobs (
  id          CHAR(26)   PRIMARY KEY,
  kind        VARCHAR(40) NOT NULL,            -- "export.lottie","export.png_seq","thumbnail"
  project_id  CHAR(26)    NULL,
  status      ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  params      JSON        NOT NULL,
  result_blob_id CHAR(26) NULL,
  error       TEXT        NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_jobs_status (status, created_at)
);
```

### Why blobs stay out of the DB

- A `.quar` can be many MB (embedded images). Keeping them in MySQL bloats the buffer pool, slows
  backups, and blows past `max_allowed_packet`. Content-addressed files on FS/S3 with a `blobs`
  pointer table give cheap dedup (same image across versions/projects stored once), streaming
  download, cheap listing, and clean CDN caching for thumbnails.
- **Storage layout** (content-addressed): `projects/{project_id}/{content_hash}.quar` and
  `thumbnails/{project_id}/{version_seq}.png`. The `blobs` row is the source of truth for the key.

---

## 6. Project Save/Load Semantics

**Save** (`PUT /v1/projects/{id}`):

1. Client sends the `.quar` bytes (the same `writeQuarFile()` output it already produces) with an
   `If-Match: <current seq>` header for optimistic concurrency.
2. Backend: validate magic/version, parse JSON chunk, run `validateProjectData`, recompute summary
   fields (page/node counts, duration, fps), compute `sha256`.
3. If `content_hash` already in `blobs` → reuse; else write to blob store.
4. Insert `project_versions` row with `seq = current+1` (fails the transaction if `seq` collides →
   returns `409 Conflict`, surfacing a concurrent write — the client then rebases/merges).
5. Update `projects.current_version_id`, summary fields, `updated_at`; enqueue a thumbnail job.
6. Append `audit_log`.

**Load** (`GET /v1/projects/{id}?version=latest`): resolve blob key → stream `.quar` bytes (or a
presigned S3 URL). The web app deserializes with its existing `parseQuarFile` path — **no client
format change**.

**Offline-first**: `apps/web` keeps IndexedDB as a local cache/offline store; a small sync layer
reconciles on reconnect using `seq` + `content_hash`. Backend is authoritative when online.

---

## 7. REST API Surface (v1)

```
Auth
  POST   /v1/auth/register
  POST   /v1/auth/login                 -> { access, refresh }
  POST   /v1/auth/refresh
  POST   /v1/auth/logout
  GET    /v1/me

Projects
  GET    /v1/projects                   ?team=&cursor=      (paginated list, summary only)
  POST   /v1/projects                   (create; empty or from uploaded .quar)
  GET    /v1/projects/{id}              (metadata)
  GET    /v1/projects/{id}/blob         (stream .quar; supports ?version=)
  PUT    /v1/projects/{id}              (save new version; If-Match: seq)
  PATCH  /v1/projects/{id}              (rename, move to team, share)
  DELETE /v1/projects/{id}              (soft delete)
  GET    /v1/projects/{id}/versions     (history)
  POST   /v1/projects/{id}/versions/{seq}/restore
  GET    /v1/projects/{id}/thumbnail

Sharing
  POST   /v1/projects/{id}/collaborators
  DELETE /v1/projects/{id}/collaborators/{userId}

Export jobs
  POST   /v1/projects/{id}/exports      { format: lottie|png_seq|sprite|gif, options }
  GET    /v1/jobs/{jobId}
  GET    /v1/jobs/{jobId}/result        (stream result blob)

Realtime
  WS     /v1/projects/{id}/live         (presence + change notifications; CRDT-ready envelope)

MCP + OAuth  (see §8)
  GET    /.well-known/oauth-authorization-server
  POST   /oauth/register                (dynamic client registration)
  GET    /oauth/authorize
  POST   /oauth/token
  ALL    /mcp                           (Streamable HTTP MCP endpoint)
```

Middleware stack (tower): request-id + tracing, CORS (locked to the web origins), auth extractor
(JWT → `AuthUser`), per-user rate limiting, body-size limits, and an ACL guard that resolves
`project_id` → role before handlers run.

---

## 8. The MCP Server — "proper MCP like Figma"

This is the headline. The current stdio Python server (25 CRUD tools over local files) is **weak**:
it is single-user, local-only, unauthenticated, and its tools are 1:1 with node CRUD. The new MCP
is a hosted, authenticated, **semantic** interface to real projects.

### 8.1 Transport & Auth (the Figma model)

- **Streamable HTTP** transport mounted at `/mcp` in the same axum app (via `rmcp`), supporting
  SSE for server-initiated messages and long-running tool progress.
- **OAuth 2.1 + PKCE** with **dynamic client registration** and a browser consent screen, exactly
  the flow Figma's remote MCP uses. An MCP client (Claude Desktop/Code, etc.) is pointed at
  `https://api.animator.quar.pro/mcp`, discovers auth via `/.well-known/oauth-authorization-server`,
  registers, sends the user through consent, and receives a scoped token
  (`projects:read`, `projects:write`, `export`). Tokens map to `oauth_grants`; every MCP call runs
  as a real user with real ACLs.
- **Scoping**: a session can be pinned to one project (like "Figma Dev Mode on the current file") or
  browse all projects the user can access. Per-tool scope checks + `audit_log` for every mutation.

### 8.2 Tool design philosophy

Figma's MCP is powerful because its tools return **context**, not just rows: `get_code`,
`get_variable_defs`, `get_image`, `get_code_connect_map`. We mirror that: tools should give an AI
**enough structured context to reason about the animation**, plus **coarse-grained, intent-level
edits** (not just "set property X"), plus **rendering** so the model can see results.

Tool families (a superset of the retired 25):

**Discovery & context (read)**

- `list_projects`, `get_project` — summary, pages, counts, thumbnail URL.
- `get_scene_context(project, page)` — **the flagship read**: a compact, token-efficient structured
  snapshot of the scene: node tree with _computed_ world transforms, resolved fills/strokes,
  symbol-instance expansion, and per-node "what's animated" flags. The Figma-`get_code` analogue.
- `get_node(project, node_id)` — full node incl. bezier path data, bindings.
- `get_timeline(project, page)` — tracks, keyframes, easing, as structured JSON.
- `get_animatable_properties(node_type)` — property paths + interpolation types.
- `render_frame(project, page, frame, {width, scale})` — returns a **PNG image** of a frame so the
  model can _see_ the current state (server-side render via headless GL / the shared renderer, or a
  rasterized fallback). This is the single biggest capability gap vs. the current server.
- `render_preview(project, {frames|gif})` — short animated preview for review.

**Editing (intent-level, write)**

- `add_node`, `update_node`, `delete_node`, `duplicate_node`, `group_nodes`, `reorder_nodes`.
- `set_style(node, {fill, stroke, opacity, gradient})` — resolves colors, gradients in one call.
- `add_keyframe`, `remove_keyframe`, `move_keyframes`, `set_easing` — with all 30+ presets + custom
  cubic bezier.
- `animate(node, property, keyframes[])` — **batch**: create a whole animation curve in one call
  (e.g. a bounce) instead of N `add_keyframe` round-trips.
- `apply_edit_batch(ops[])` — transactional multi-op edit; all-or-nothing, one new version, one
  audit entry, one `message`. Critical for AI: dozens of tweaks land as a single reviewable "commit".
- Page ops: `add_page`, `delete_page`, `rename_page`, `duplicate_page`.
- Rigging (unique to Quar; entirely absent from the Python server): `add_bone`, `bind_mesh`,
  `set_ik_target`, `pose_bone` — expose the rig pipeline to AI.

**Export & delivery**

- `export(project, format, options)` — kicks a job (`lottie`, `png_seq`, `sprite`, `gif`), returns a
  job handle; `get_export(job)` streams the result. Lets an assistant produce a shippable Lottie.

**Safety & ergonomics for AI**

- **Optimistic concurrency**: writes carry the version `seq`; conflicts return a structured error the
  model can recover from.
- **Dry-run / preview**: mutating tools accept `dry_run: true` → return the _diff_ + a `render_frame`
  of the would-be result without committing.
- **Undo affordance**: because every save is an immutable version, "undo my last MCP change" is
  `versions/{seq-1}/restore`.
- **Rich errors**: typed error payloads (validation path, offending node id) so the model self-corrects.

**Resources** (`resources/list` + `resources/read`)

- `quar://schema/node-types`, `quar://schema/easing-functions`,
  `quar://schema/animatable-properties`, `quar://schema/color-format` (ported from the Python
  server), **plus** `quar://project/{id}/scene`, `quar://project/{id}/timeline`,
  `quar://project/{id}/thumbnail` as live, subscribable resources.

**Prompts**

- `animate_node`, `design_scene` (ported), plus `rig_character`, `polish_timing`, `port_to_lottie`.

### 8.3 Shared core (no logic duplication)

All MCP tools call the same `quar-core` domain services and the same `quar-format` validation the
REST API uses. An MCP `add_keyframe` and a UI keyframe edit produce byte-identical `.quar` output and
identical version history. This directly fixes the review's "format defined in three places" finding.

---

## 9. Security

- **Transport**: TLS everywhere; HSTS. CORS restricted to the web origins.
- **AuthN**: argon2id password hashing; short-lived JWT (≤15 min) + rotating refresh tokens with
  reuse-detection (revoke family on replay). OAuth 2.1 mandates PKCE; no implicit flow.
- **AuthZ**: every project route resolves role via `team_members` / `project_collaborators` before
  the handler; MCP tokens are scoped and per-tool checked.
- **`.quar` ingestion is untrusted input** (the review flagged SVG/format parsing as attack surface):
  validate magic/version, cap JSON chunk + buffer sizes, cap total file size, reject buffer offsets
  that exceed the file (the Rust port keeps the existing bounds checks in `decodeQuarBinary`), and
  parse with `serde` (no `eval`, no prototype-pollution surface). Strip/deny any `src` that isn't a
  recognized image MIME on the extracted buffers.
- **Blob keys are server-derived** (content hash), never client-supplied paths → no path traversal
  (a specific concern called out for the Python MCP's file tools).
- **Rate limits** per user + per MCP client; body-size limits; export job quotas.
- **Audit** every mutation with actor kind (user/mcp/system).

---

## 10. Migration & Interop

- **Format parity test**: a golden-file suite feeds real `.quar` files through _both_ the TS
  `parseQuarFile`/`writeQuarFile` and the Rust `quar-format` crate and asserts byte/semantic
  equality. Gate CI on it so the two implementations can't drift.
- **Web app adoption**: add a thin `backendClient` in `apps/web/src/services` alongside the existing
  `projectStorage.ts`; a feature flag switches "local only" → "cloud sync". `serializeProjectToBinary`
  already produces exactly what the API wants — minimal client change.
- **Retire the Python MCP**: keep it available for pure-local workflows during transition, but the
  docs point AI users at the hosted MCP. Eventually delete `tools/quar-mcp` (the review found real
  bugs there and it duplicates format logic).

---

## 11. Testing Strategy

- **Unit**: `quar-format` (round-trip, migration v1→v2→v3, corrupt-input rejection — port the TS test
  vectors), `quar-store` (FS + S3 via MinIO testcontainer), domain services.
- **DB**: `sqlx::test` against ephemeral MySQL (testcontainers); migration up/down.
- **API**: end-to-end auth + project lifecycle + optimistic-concurrency conflict + ACL denials.
- **MCP conformance**: a harness that speaks the MCP handshake, runs each tool, asserts schemas, and
  verifies OAuth flow + scope enforcement; snapshot tests on `get_scene_context` output.
- **Cross-impl golden files** (see §10).
- **Load**: k6 against list/save/render to validate the 60fps-adjacent latency budget for `render_frame`.

---

## 12. Deployment & Ops

- **Artifact**: single static Rust binary (musl) + `migrations/`; runs migrations on boot (guarded).
- **Local dev**: `docker-compose` with MySQL 8 + MinIO; blob store = FS or MinIO; `.env` config.
- **Prod**: containerized behind a load balancer; MySQL (managed / RDS-style) with read replica for
  listing; S3-compatible object storage; object-storage lifecycle rules for old versions/thumbnails.
- **Config** (env): `DATABASE_URL`, `BLOB_STORE=fs|s3`, `BLOB_ROOT`/`S3_*`, `JWT_SECRET`,
  `OAUTH_ISSUER`, `WEB_ORIGINS`, `MAX_QUAR_BYTES`.
- **Observability**: `tracing` spans per request/tool; `/healthz` (liveness), `/readyz` (DB + blob
  reachability); metrics for save latency, render latency, MCP tool call counts.

---

## 13. Phased Roadmap

| Phase                             | Deliverable                                                                                                                                                                            | Notes                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **0. Foundations**                | Workspace, `quar-format` crate (port + golden tests), `quar-store` (FS), `quar-db` + migrations, config/boot, `/healthz`.                                                              | De-risks the format port first — everything depends on it.     |
| **1. Auth + Projects REST**       | users/teams, JWT+refresh, project CRUD, versioned save/load with optimistic concurrency, blob store, thumbnails job.                                                                   | Backend is usable headless; test via `httpc-test`.             |
| **2. Web integration**            | `backendClient` + sync layer in `apps/web`, feature-flagged cloud save/load/list, offline reconcile.                                                                                   | Users' projects escape IndexedDB.                              |
| **3. MCP core**                   | `quar-mcp` crate over `rmcp` Streamable HTTP, OAuth 2.1 + consent, read tools (`get_scene_context`, `get_node`, `get_timeline`) + edit tools + `apply_edit_batch`, resources, prompts. | Reaches parity with the Python server, authenticated + hosted. |
| **4. MCP power features**         | `render_frame`/`render_preview`, `animate` batch, rigging tools, `export` jobs, dry-run/diff, live resources.                                                                          | The "much stronger than Figma-tier" surface.                   |
| **5. Hardening & ops**            | Rate limits, quotas, audit dashboards, S3 in prod, load tests, docs, deprecate Python MCP.                                                                                             | Production-ready.                                              |
| **6. MCP design/animation skill** | A Claude skill that drives the MCP to design and animate scenes end-to-end (render-verify loop, recipe library).                                                                       | Depends on Phase 4's full MCP surface.                         |

**Execution detail:** this roadmap is broken into ten 2-week sprints (B0–B9) with per-sprint agent
assignments and comprehensive LLM prompts in [`docs/BACKEND_SPRINT_PLAN.md`](./BACKEND_SPRINT_PLAN.md).
The specialized agents that execute them live in [`agents/backend/`](../agents/backend/).

**Frontend/MCP integration is a first-class track**, not an afterthought: sprint **B4** integrates the
REST API into the web app (cloud sync, offline reconcile), **B7** integrates the MCP into the UI
(AI-edit visibility, version history/restore, MCP connection + consent, live updates), and **B9**
delivers the AI design/animation skill. The **Frontend Integration Engineer** agent owns this track.

**The backend implies significant new client UI.** The app today has no accounts, cloud projects,
sharing, version history, or AI-collaboration surfaces — the backend introduces all of them
(sign-in/account, cloud project browser, sync/conflict UX, version history + restore, MCP
connect/consent, sharing/collaborators, live presence, export-job progress). These are built by the
Frontend Integration Engineer (wiring) with the **Frontend Designer** (visual design, via
`/frontend-design`), match the existing Neo-Industrial Studio aesthetic, and stay behind the
`cloudSync` flag. The full surface list + sprint mapping is in
[`docs/BACKEND_SPRINT_PLAN.md`](./BACKEND_SPRINT_PLAN.md) → "New UI Surfaces Introduced by the Backend".

---

## 14. Key Open Questions (need product decisions)

1. **Server-side rendering for `render_frame`**: headless WebGL (e.g. via a Chromium worker or a
   native GL context reusing the WGSL/GLSL shaders) vs. a simpler CPU rasterizer for previews. This
   is the biggest technical unknown and gates the strongest MCP feature. _Recommendation:_ ship a
   CPU/vector rasterized preview in Phase 4, upgrade to true GL parity later.
2. **Collaboration depth**: is single-writer + version history enough for v1, or is live co-editing a
   near-term requirement? (Affects whether we invest in CRDT envelopes now.) _Recommendation:_
   single-writer v1, CRDT-ready WS envelope.
3. **Tenancy model**: personal projects only, or teams/orgs from day one? (Schema supports both;
   affects UI + billing.)
4. **Blob GC**: retention policy for old versions (keep N / time-based) to bound storage.
5. **Auth provider**: roll our own email/password + OAuth, or integrate an IdP (Auth0/Clerk/WorkOS)?
   _Recommendation:_ own it for the MCP OAuth server anyway; optionally federate SSO later.

---

_Grounded in the current codebase: `.quar` v3 binary format (`packages/core/src/format/quarFormat.ts`),
`ProjectDataV2/V3` (`apps/web/src/services/projectSerializer.ts`), current IndexedDB persistence
(`apps/web/src/services/projectStorage.ts`), and the existing local MCP (`tools/quar-mcp`) that this
backend's hosted MCP supersedes._
