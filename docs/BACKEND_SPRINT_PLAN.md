# Quar Animator — Backend Sprint Plan (Rust/Axum + MySQL + MCP)

**Companion to:** [`docs/BACKEND_PLAN.md`](./BACKEND_PLAN.md) (architecture) and
[`agents/backend/`](../agents/backend/) (specialized agents).
**Sprint length:** 2 weeks. **Prefix:** `B` (to distinguish from product Sprints 1–48).

Each sprint below has **Goals**, **Agent Assignments**, **Deliverables**, and a **comprehensive LLM
Prompt** ready to hand to the assigned agent. Every prompt assumes the agent has loaded
`docs/BACKEND_PLAN.md` and its own `agents/backend/*.md` definition.

---

## Overview & Sequencing

| Sprint | Title                                        | Primary Agents                               | Integration?       |
| ------ | -------------------------------------------- | -------------------------------------------- | ------------------ |
| **B0** | Workspace + `quar-format` foundation         | Backend Lead, Storage & Format, QA           | —                  |
| **B1** | Persistence: `quar-store` + `quar-db`        | Storage & Format, Database, QA               | —                  |
| **B2** | Auth + OAuth 2.1 server                      | Auth & Security, Rust API, Database          | —                  |
| **B3** | Projects REST API (versioned save/load)      | Rust API, Storage & Format, Database         | —                  |
| **B4** | **Frontend integration I — cloud sync**      | Frontend Integration, Rust API, QA           | **✔ web ↔ API**    |
| **B5** | MCP core — transport, OAuth, read/edit tools | MCP Server, Auth & Security                  | —                  |
| **B6** | MCP power — render, batch, rig, export       | MCP Server, Core Engine, Export              | —                  |
| **B7** | **Frontend integration II — MCP in the UI**  | Frontend Integration, MCP Server             | **✔ MCP ↔ UI**     |
| **B8** | Hardening, ops & Python-MCP cutover          | DevOps, Auth & Security, QA                  | —                  |
| **B9** | **MCP design/animation Skill**               | MCP Server, Frontend Designer, Documentation | **✔ AI ↔ product** |

**Dependency spine:** B0 → B1 → B3 (needs B2 for auth) ; B4 needs B3 ; B5 needs B2+B3 ; B6 needs B5 ;
B7 needs B5/B6 + B4 ; B8 spans all ; B9 needs B6. B2 can run parallel to B1.

**Guiding invariants (every sprint):** one format source of truth (`quar-format`/`quar-core`); blobs
are files, metadata is rows; every save is an immutable, concurrency-checked, audited version; MCP
and REST share auth/ACL/storage and produce byte-identical `.quar`.

---

## B0 — Workspace + `quar-format` Foundation

**Goals:** Stand up the Rust workspace and port the `.quar` format to Rust with byte-exact parity to
the TypeScript implementation. De-risk the thing everything else depends on.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| Backend Lead | Workspace layout, crate boundaries, dependency direction |
| Storage & Format | `quar-format` port (binary, model, migrate, validate) |
| Backend QA | Golden cross-impl parity harness + fixtures |

**Deliverables:**

- [ ] `backend/` cargo workspace with the 7 empty crates + `quar-server` bin skeleton.
- [ ] `quar-format`: `encode_quar_binary` / `decode_quar_binary`, image buffer extract/restore,
      `ProjectDataV2/V3` serde model (unknown-field-preserving), v1→v2→v3 migration, structural
      validation — all ported from `quarFormat.ts`, `quarMigration.ts`, `projectSerializer.ts`.
- [ ] Golden parity suite: real `.quar` fixtures decode/re-encode byte-identical vs TS output.
- [ ] `cargo build` + `cargo test` green; parity suite wired as a local pre-merge gate.

**LLM Prompt:**

```
You are bootstrapping the Quar Animator backend. Read docs/BACKEND_PLAN.md (esp. §4 workspace, §5
schema is for later, and the .quar format sections). The native format lives in
packages/core/src/format/quarFormat.ts (+ quarMigration.ts) and the project model in
apps/web/src/services/projectSerializer.ts. Do NOT change any TS.

Task 1 — Workspace: create backend/ as a cargo workspace with crates quar-format, quar-store,
quar-db, quar-core, quar-api, quar-mcp, and a quar-server binary. Set dependency direction:
format/store depend on nothing internal; core depends on format/store/db; api and mcp depend on core
and never on each other; server composes all. Add rustfmt + clippy config.

Task 2 — Port the binary format in quar-format/src/binary.rs:
- encode_quar_binary(&QuarFile) -> Bytes and decode_quar_binary(&[u8]) -> Result<QuarFile, FormatError>.
- Header: "QUAR" magic (u32 LE 0x52415551), version u32 (=3), flags u32, json_len u32; then json;
  then buffer_count u32; then per buffer data_len u32, mime_len u32, mime, data.
- Port extractImageBuffers/restoreImageBuffers (data:image/... <-> "buffer:N", dedup identical URIs).
- Keep EVERY bounds check from decodeQuarBinary (too-small, wrong magic, unsupported version,
  json/buffer offsets exceeding file, truncated buffer headers) and add hard caps (MAX total, max
  json chunk, max buffer count/size).

Task 3 — Model + migration + validation:
- serde structs for ProjectDataV2/V3, SerializedPage, Node (id/type/transform + rest), Timeline,
  settings, rigging, symbols. Preserve unknown fields (serde flatten `extra`) so newer web fields
  survive a round-trip.
- Port v1->v2 and v2->v3 migration.
- Port validateProjectData structural checks (version, non-empty pages, node id/type/transform,
  numeric timelineDuration/frameRate).

Task 4 — Golden parity: create tests/golden/ with real .quar fixtures (ask for exports: minimal,
image-bearing, multi-page, rigged, symbol-heavy). Test that decode->re-encode is byte-identical to
the original and that the decoded model matches the TS-decoded JSON.

Acceptance: cargo build + cargo test green; parity suite passes on all fixtures; a deliberately
corrupted fixture is rejected with a typed error (no panic).
```

---

## B1 — Persistence: `quar-store` + `quar-db`

**Goals:** Projects can be **saved as files outside the DB**. Blob storage abstraction (FS + S3) and
the full MySQL schema with sqlx repositories and the optimistic-concurrency invariant.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| Storage & Format | `BlobStore` trait, `FsBlobStore`, `S3BlobStore`, content addressing |
| Database | MySQL schema, migrations, sqlx repos, seq/concurrency invariant |
| Backend QA | Blobstore parity tests, DB migration + concurrency tests |

**Deliverables:**

- [ ] `quar-store`: `BlobStore` trait + FS and S3 (MinIO) impls; content-addressed keys; streaming get.
- [ ] `quar-db`: migration `0001_init.sql` (full §5 schema); sqlx repos for projects, versions, blobs,
      users, teams, oauth, jobs, audit; migrate-on-boot.
- [ ] Version insert uses `UNIQUE(project_id, seq)` to enforce optimistic concurrency.
- [ ] Tests: FS vs S3 behavioral parity; two concurrent version inserts → one success + one conflict.

**LLM Prompt:**

```
Read docs/BACKEND_PLAN.md §5 (schema) and §6 (save/load semantics), and agents/backend/
storage-format-engineer.md + database-engineer.md.

Task 1 — quar-store: define the BlobStore trait (put/get/get_stream/presign_get/delete/exists over
key+mime+bytes, keys server-derived and content-addressed: projects/{project_id}/{hash}.quar,
thumbnails/{project_id}/{seq}.png). Implement FsBlobStore (BLOB_ROOT) and S3BlobStore (aws-sdk-s3,
MinIO-compatible). Stream gets for large blobs; presigned GET for S3 only. Never accept a
client-supplied key.

Task 2 — quar-db schema: write migrations/0001_init.sql with the full schema from §5 (users, teams,
team_members, projects with denormalized summary + current_version_id, project_versions with
UNIQUE(project_id, seq), blobs with UNIQUE(content_hash), project_collaborators, refresh_tokens,
oauth_clients, oauth_grants, mcp_sessions, audit_log, jobs). CHAR(26) ULIDs, InnoDB, utf8mb4,
DATETIME(3). Add the indexes listed in the plan.

Task 3 — repos (sqlx compile-time macros): implement quar-db repos for projects, versions
(insert_version allocates seq = MAX+1 and relies on the UNIQUE constraint to reject concurrent
writers), blobs (dedup on content_hash), users/teams, oauth, jobs, audit. Provide migrate-on-boot.

Task 4 — tests: a shared BlobStore test suite run against FsBlobStore (tmpdir) and S3BlobStore
(MinIO testcontainer) asserting identical behavior incl. missing-key errors and dedup. A sqlx::test
(MySQL testcontainer) proving two concurrent insert_version calls yield exactly one success and one
conflict, and that soft-deleted projects are excluded from listing.

Acceptance: both stores pass the shared suite; migrations up/down clean; the concurrency test is
deterministic and green.
```

---

## B2 — Auth + OAuth 2.1 Server

**Goals:** User auth (argon2 + JWT + refresh rotation) and the **OAuth 2.1 + PKCE authorization
server** MCP clients will use (the Figma model). ACL resolution.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| Auth & Security | Password hashing, JWT, refresh rotation, OAuth server, scopes, ACL |
| Rust API | `/v1/auth/*` and `/oauth/*` routes, middleware wiring |
| Database | `refresh_tokens`, `oauth_clients`, `oauth_grants` repos |

**Deliverables:**

- [ ] Register/login/refresh/logout; argon2id; JWT access + rotating refresh with reuse detection.
- [ ] OAuth 2.1: `/.well-known/oauth-authorization-server`, dynamic client registration,
      `/authorize` (PKCE S256 + consent + project-scope choice), `/token` (code+refresh grants).
- [ ] `AuthUser` extractor + ACL guard (owner/team/collaborator → role) + MCP scope checks.
- [ ] Tests: refresh reuse revokes family; PKCE mismatch/code-replay/redirect tampering rejected.

**LLM Prompt:**

```
Read agents/backend/auth-security-engineer.md and docs/BACKEND_PLAN.md §8.1 (MCP auth) + §9
(security).

Task 1 — user auth: argon2id password hashing; POST /v1/auth/register, /login (-> access JWT + refresh),
/refresh, /logout, GET /v1/me. Access token short-lived (<=15 min, claims sub/scopes/exp/jti).
Refresh tokens opaque, stored as sha256 with a family id, single-use: rotate on use; if a used token
reappears, revoke the whole family (theft). Logout revokes the family.

Task 2 — OAuth 2.1 server for MCP clients:
- GET /.well-known/oauth-authorization-server discovery.
- POST /oauth/register (dynamic client registration) -> oauth_clients.
- GET /oauth/authorize: PKCE S256 required, exact redirect_uri match, consent screen showing client
  name + scopes (projects:read, projects:write, export) + a project-scope choice (single project like
  Figma Dev Mode, or account-wide). Issue a single-use, short-lived, hashed authorization code bound
  to the code_challenge.
- POST /oauth/token: exchange code+verifier -> scoped access+refresh; and the refresh grant.

Task 3 — authz: AuthUser extractor (verify JWT); ACL service resolving effective project role as
max(owner, team role, collaborator role); an axum ACL guard for project routes; a scope check helper
for MCP tools.

Acceptance tests: happy-path login+refresh; refresh-reuse revokes the family; OAuth happy path;
PKCE verifier mismatch, code replay, and redirect_uri tampering all rejected; a projects:read token
denied by a write-scoped check.
```

---

## B3 — Projects REST API (Versioned Save/Load)

**Goals:** The web app's core server contract: create/list/get/save/delete projects, versioned save
with optimistic concurrency, streaming blob download, thumbnail jobs.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| Rust API | Project + version + sharing + export routes, error model, streaming |
| Storage & Format | `ProjectService::save_version` (validate → blob → version → summary → audit) |
| Database | Version/summary transaction, list pagination |

**Deliverables:**

- [ ] `GET/POST /v1/projects`, `GET/PUT/PATCH/DELETE /v1/projects/{id}`, `GET …/blob` (stream),
      `GET …/versions`, `POST …/versions/{seq}/restore`, `GET …/thumbnail`, collaborators routes.
- [ ] `PUT` requires `If-Match: seq` → 409 on stale; success returns new seq + summary.
- [ ] Thumbnail job enqueued on save; `jobs` processing worker.
- [ ] e2e tests: lifecycle, concurrency 409, ACL denials, oversized upload 413.

**LLM Prompt:**

```
Read agents/backend/rust-api-engineer.md and docs/BACKEND_PLAN.md §6 (save/load) + §7 (REST surface).
All bytes flow through quar-format/quar-core — no parsing in handlers.

Task 1 — ProjectService (quar-core): save_version(project_id, actor, bytes) validates the .quar via
quar-format, computes sha256, writes/reuses the blob (dedup), inserts a project_versions row
(seq=current+1) in a transaction, updates projects.current_version_id + summary
(page/node/duration/fps/size), appends audit_log, enqueues a thumbnail job — all atomic. Also
load_version, list_versions, restore_version.

Task 2 — routes (quar-api): implement the project/version/sharing routes from §7. PUT /v1/projects/
{id} requires If-Match: seq (428 if absent, 409 with current seq if stale), streams+caps the body to
MAX_QUAR_BYTES (413 if larger), returns { seq, versionId, updatedAt, summary }. GET …/blob streams
from quar-store (or presigned URL). Cursor-paginated GET /v1/projects. One ApiError enum -> correct
statuses.

Task 3 — jobs worker: a bounded tokio worker that drains jobs of kind 'thumbnail' (render a small
PNG for the current version — a simple rasterization is fine for now) and writes it to the blob store
+ updates projects.thumbnail_blob_id.

Acceptance (e2e, httpc-test + MySQL/MinIO testcontainers): full create->save->load->list->restore
lifecycle round-trips a real .quar unchanged; concurrent PUTs -> one 200 + one 409; viewer role gets
403 on PUT and non-member gets 404; a 60MB upload gets 413.
```

---

## B4 — Frontend Integration I: Cloud Sync 🔗

**Goals:** Wire `apps/web` to the backend so projects live in the cloud while offline still works.
This is the first **integration** sprint — the API meets the React/Zustand editor.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| Frontend Integration | `backendClient`, `syncEngine`, `authClient`, hooks, feature flag |
| Frontend Designer | **New UI**: auth screens, cloud project browser, sync/conflict UX, account/quota |
| Rust API | DTO/contract alignment, CORS, any endpoint gaps found during integration |
| Backend QA | Sync-scenario tests incl. conflict path |

**Deliverables:**

- [ ] `apps/web/src/services/backendClient.ts` (auth, projects, versions, exports) + `authClient.ts`
      (token storage + transparent refresh).
- [ ] `syncEngine.ts`: IndexedDB ↔ server reconciliation on `seq`/`content_hash`; offline write queue;
      409 conflict UX.
- [ ] Feature flag `cloudSync`: off → today's local-only behavior unchanged. Projects page lists
      server projects when on.
- [ ] Save/load routed through `serializeProjectToBinary`/`parseQuarFile` — no second serialization path.
- [ ] **New UI surfaces** (with Frontend Designer, using the `/frontend-design` skill): sign-in /
      register / account screens; the **cloud project browser** (personal + team + shared-with-me,
      thumbnails, search/sort, trash + restore); a **sync-status** indicator (online/offline/syncing);
      and a **conflict-resolution dialog** (keep mine / take server / open both). Match the existing
      Neo-Industrial Studio aesthetic and dark-mode default.

**LLM Prompt:**

```
Read agents/backend/frontend-integration-engineer.md. The web app persists to IndexedDB via
apps/web/src/services/projectStorage.ts and already serializes with serializeProjectToBinary /
parseQuarFile (projectSerializer.ts). Do NOT change the .quar format or add a second serialization
path. Everything is behind a `cloudSync` feature flag; when off, behavior is exactly as today.

Task 1 — backendClient.ts: typed client for /v1/auth, /v1/projects (+ blob), /v1/projects/{id}/
versions, /v1/exports, matching the backend DTOs. authClient.ts: access token in memory, refresh
token in secure storage, transparent single-flight refresh on 401, redirect to login on failure.

Task 2 — syncEngine.ts: reconcile IndexedDB with the server. On open: compare local cached
seq/content_hash with GET /v1/projects/{id}. server-newer -> pull blob + parseQuarFile + load;
local-unsynced -> push serializeProjectToBinary via PUT with If-Match; diverged -> surface a conflict
(keep mine / take server / open both), never silently drop work. Queue writes offline, flush on
reconnect. Keep IndexedDB and server writes byte-consistent.

Task 3 — wire into the editor: extend useProjectActions.ts to route save/load through the backend
when cloudSync is on; add a SyncStatus indicator (online/offline/syncing/conflict); make Projects.tsx
list server projects. Keep all network off the render loop.

Acceptance: with the flag on, creating/saving/loading a project round-trips through the server and the
editor state is identical; killing the network queues edits and reconnect flushes them; a forced
divergence shows the conflict UI. Unit-test each sync branch incl. the 409.
```

---

## B5 — MCP Core: Transport, OAuth, Read/Edit Tools

**Goals:** A hosted, authenticated MCP at `/mcp` reaching parity with the retired Python server —
but remote, OAuth-secured, multi-tenant, on the shared core.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| MCP Server | rmcp Streamable HTTP mount, session, read + edit tools, resources, prompts |
| Auth & Security | OAuth token → session/scope binding, per-tool scope checks |

**Deliverables:**

- [ ] `quar-mcp` mounted at `/mcp` (rmcp, Streamable HTTP + SSE); session bound to an OAuth grant.
- [ ] Read: `list_projects`, `get_project`, `get_scene_context`, `get_node`, `get_timeline`,
      `get_animatable_properties`. Edit: node CRUD, `set_style`, keyframe CRUD/`set_easing`,
      `apply_edit_batch`, page ops.
- [ ] Resources `quar://schema/*` + live `quar://project/{id}/*`; prompts `animate_node`, `design_scene`.
- [ ] Every tool calls `quar-core`; every mutation → version + audit (`author_kind='mcp'`).

**LLM Prompt:**

```
Read agents/backend/mcp-server-engineer.md and docs/BACKEND_PLAN.md §8. Build quar-mcp with the rmcp
Rust SDK over Streamable HTTP, mounted at /mcp in the same axum app. Depend on quar-core only. Never
re-implement .quar parsing or node/keyframe math — call core services so an MCP edit and a UI edit
produce byte-identical .quar via the same version/audit path.

Task 1 — transport + auth: mount the rmcp server with SSE for server-initiated messages/progress.
Bind each session to the caller's OAuth grant (user + scopes). Read tools require projects:read;
edit tools require projects:write. ACL-check every project access; audit mutations with
author_kind='mcp'.

Task 2 — read/context tools: implement get_scene_context(project, page?, node_id?, depth?) returning
a compact tree with COMPUTED values (resolved world transforms, resolved fill/stroke/opacity, symbol
instance expansion, bbox, per-node animated property->keyframe-count), token-efficient (omit defaults,
round floats). Plus list_projects, get_project, get_node, get_timeline, get_animatable_properties.

Task 3 — edit tools: add_node, update_node, delete_node, duplicate_node, group_nodes, reorder_nodes,
set_style, add_keyframe, remove_keyframe, move_keyframes, set_easing, page ops. And apply_edit_batch
(ops[], message?, dry_run?): apply all ops transactionally against an in-memory project via core,
then either commit as ONE version+audit or (dry_run) return a structured diff. Mutations carry the
version seq; conflict returns current seq.

Task 4 — resources + prompts: quar://schema/{node-types,easing-functions,animatable-properties,
color-format} and live quar://project/{id}/{scene,timeline,thumbnail}; prompts animate_node,
design_scene.

Acceptance (conformance test): OAuth+PKCE -> projects:write token -> open session -> list tools (each
declares a JSON schema) -> get_scene_context -> apply_edit_batch(dry_run) -> commit -> verify a new
version with author_kind='mcp' exists; a projects:read token is rejected by every write tool.
```

---

## B6 — MCP Power: Render, Batch Animate, Rig, Export

**Goals:** The capabilities that make this MCP _stronger than Figma-tier_ — the model can **see**
frames, build whole animation curves at once, rig characters, and produce shippable exports.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| MCP Server | `render_frame`/`render_preview`, `animate`, rigging tools, `export`, dry-run diffs |
| Core Engine | Server-side frame rendering service (CPU raster now, GL parity later) |
| Export Pipeline | Server export jobs (Lottie/PNG-seq/sprite/GIF) reusing `@quar/export` logic |

**Deliverables:**

- [ ] `render_frame(project, page, frame, {width, scale})` → PNG; `render_preview` → short clip/GIF.
- [ ] `animate(node, property, keyframes[])` batch curve; rigging tools `add_bone`, `bind_mesh`,
      `set_ik_target`, `pose_bone`.
- [ ] `export(project, format, options)` → job; `get_export(job)` streams the result.
- [ ] Dry-run on mutating tools returns diff **+ a `render_frame` preview** of the would-be result.

**LLM Prompt:**

```
Read agents/backend/mcp-server-engineer.md §render + docs/BACKEND_PLAN.md §8.2 and §14 (open question
on server-side rendering). Continue quar-mcp.

Task 1 — rendering service (with Core Engine): a RenderService in quar-core that rasterizes a
project frame to PNG. Start with a CPU/vector rasterizer sufficient for previews (the plan's Phase-4
recommendation); design the trait so a headless-GL implementation can replace it later without
changing the tool API. Expose render_frame(project, page, frame, {width, scale}) and render_preview
(project, {frames|gif}) MCP tools returning image content.

Task 2 — batch animate + rigging: animate(node, property, keyframes[]) creates a whole curve in one
call (validate monotonic frames, easing per segment). Rigging tools add_bone, bind_mesh,
set_ik_target, pose_bone mapping onto the @quar/rigging pipeline via quar-core (no rig math in
quar-mcp).

Task 3 — export jobs (with Export Pipeline): export(project, format in {lottie,png_seq,sprite,gif},
options) enqueues a job processed by a worker that reuses the @quar/export conversion logic
server-side; get_export(job) streams the result blob. Report progress over SSE.

Task 4 — dry-run everywhere: every mutating tool accepts dry_run:true and returns a structured diff
PLUS a render_frame image of the resulting state, without committing.

Acceptance: render_frame returns a correct PNG for a known project/frame; animate creates the
expected keyframes; export produces a valid Lottie that plays; dry_run on apply_edit_batch shows the
diff + preview and leaves no new version.
```

---

## B7 — Frontend Integration II: MCP in the UI 🔗

**Goals:** Make AI collaboration visible and controllable inside the editor. Second **integration**
sprint — the MCP meets the UI. Users see, review, and undo assistant edits, connect AI clients, and
watch live changes.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| Frontend Integration | Version history panel, AI-edit indicators, MCP connect/consent UI, live presence |
| Frontend Designer | **New UI**: version-history timeline, AI-edit banners, MCP/consent screens, sharing, presence avatars, export-progress |
| MCP Server | Any server events/resources the UI needs (live scene resource, session status) |

**Deliverables:**

- [ ] `VersionHistoryPanel`: versions with author (user/mcp/system), timestamp, `message`; preview +
      one-click restore. Banner when the current version was authored by an assistant.
- [ ] MCP connection UI: initiate the OAuth consent for connecting an AI client to this account/project,
      show active MCP sessions, and a revoke control.
- [ ] Live updates over `/v1/projects/{id}/live`: when an MCP edit lands, the open editor refreshes
      the affected project/version (coalesced, off the render loop).
- [ ] "Undo the assistant's last change" = restore previous version, one click.

**LLM Prompt:**

```
Read agents/backend/frontend-integration-engineer.md. Building on B4's cloud sync and B5/B6's MCP,
make AI collaboration first-class in apps/web. Behind the same cloudSync flag.

Task 1 — VersionHistoryPanel.tsx: list GET /v1/projects/{id}/versions with author_kind
(user/mcp/system), timestamp, size, and the optional commit message an AI attached to
apply_edit_batch. Preview a version's thumbnail; restore via POST …/versions/{seq}/restore. Show a
subtle banner when the current version's author_kind is 'mcp' with a one-click "restore previous".

Task 2 — MCP connection UI: a settings panel where a user connects an AI assistant — kick off the
OAuth 2.1 consent flow (choose account-wide vs this-project scope), list active mcp_sessions with
client name + last-seen, and a revoke button (revoke the grant server-side).

Task 3 — live updates: subscribe to /v1/projects/{id}/live; when a new version arrives (esp.
author_kind='mcp'), reconcile via the B4 sync engine and refresh the editor’s affected state.
Coalesce presence/notification messages; never touch the render loop or write the store per WS frame.

Acceptance: an MCP apply_edit_batch against the open project appears in the history panel with its
message, the editor live-updates to the new version, the AI-edit banner shows, and "restore previous"
cleanly reverts. Connecting/revoking an AI client works end-to-end through the OAuth flow.
```

---

## B8 — Hardening, Ops & Python-MCP Cutover

**Goals:** Production readiness — rate limits, quotas, observability, S3 in prod, load tests — and
retire the weak local Python MCP in favor of the hosted one.

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| DevOps | docker-compose/Dockerfile, config, observability, health, lifecycle/GC |
| Auth & Security | Rate limits, quotas, final untrusted-input audit |
| Backend QA | Load tests, full regression, migration rehearsal |

**Deliverables:**

- [ ] `docker-compose` (MySQL + MinIO + server) + multi-stage musl Dockerfile + seed script + `.env.example`.
- [ ] `tracing` spans + metrics (save/render/blob latency, 409 rate, MCP tool counts) + `/healthz` `/readyz`.
- [ ] Per-user/-client rate limits; storage + export-job quotas; blob GC + version retention.
- [ ] `tools/quar-mcp` (Python) deprecated: docs point AI users at the hosted MCP; removal PR staged.
- [ ] k6 load tests validating save/list/`render_frame` latency budgets.

**LLM Prompt:**

```
Read agents/backend/devops-engineer.md + auth-security-engineer.md. Note: this project does NOT use
GitHub Actions CI (the .github folder was removed) — gates are local + the QA suites.

Task 1 — local + prod runtime: docker-compose.yml (MySQL 8, MinIO, quar-server) and a multi-stage
musl static Dockerfile. Server waits for DB readiness, runs migrations, serves. Seed script creates a
dev user + sample project. Document env in .env.example.

Task 2 — observability + health: tracing spans (request-id, user, project, outcome) across REST+MCP;
metrics for save/render/blob latency, 409 conflict rate, MCP tool call counts, auth failures;
/healthz (liveness) and /readyz (DB + blob reachability); graceful shutdown draining in-flight work.

Task 3 — resource guards: per-user and per-MCP-client rate limits; storage + export-job quotas
enforced at PUT/export time (429/413); blob GC job deleting unreferenced blobs; version retention
policy (keep N / time-based). Final untrusted-input audit against the §9 checklist.

Task 4 — Python MCP cutover: update tools/quar-mcp/README + top-level docs to point AI users at the
hosted MCP; stage a removal PR (keep it available for pure-local workflows during transition).

Acceptance: `docker-compose up` yields a working server the web app + an MCP client connect to out of
the box; k6 shows save/list p95 within budget and render_frame within its target; quotas + rate
limits return the right statuses; the untrusted-input audit passes.
```

---

## B9 — MCP Design/Animation Skill 🔗

**Goals:** The capstone the user requested: a **Claude Code / Claude skill for designing and
animating via the MCP** — a guided capability that drives the hosted MCP to build scenes and
animations end-to-end. (Depends on B6's full MCP surface.)

**Agent Assignments:**
| Agent | Tasks |
|-------|-------|
| MCP Server | Skill authoring, tool-sequence recipes, prompt guides |
| Frontend Designer | Design-quality guidance encoded into the skill (layout, color, motion) |
| Documentation | Skill docs, examples, troubleshooting |

**Deliverables:**

- [ ] A `quar-design` skill (SKILL.md + resources) that teaches an assistant to: connect to the MCP,
      read scene context, design a scene (composition, color, hierarchy), and animate it (timing,
      easing, secondary motion) using the MCP tools — verifying via `render_frame` at each step.
- [ ] Recipe library: "bouncing logo", "character walk cycle via rig", "kinetic typography",
      "UI micro-interaction → Lottie".
- [ ] A design-quality rubric the skill applies (spacing, palette, motion curves) and a self-check
      loop (render → critique → refine).

**LLM Prompt:**

```
Read docs/BACKEND_PLAN.md §8 (MCP tools) and agents/backend/mcp-server-engineer.md +
agents/frontend-designer.md. Author a Claude skill "quar-design" that lets an assistant design and
animate Quar projects through the hosted MCP.

Task 1 — SKILL.md: describe when to trigger (user wants to design/animate a Quar scene), and the
core loop: authenticate to the MCP -> get_scene_context to understand current state -> plan
composition -> apply_edit_batch to build/lay out nodes -> render_frame to SEE it -> critique against
a design rubric -> refine -> animate with `animate`/keyframe tools -> render_preview -> refine timing
-> export. Emphasize dry_run before commit and using render_frame as ground truth.

Task 2 — design rubric resource: encode concrete guidance (composition/hierarchy, spacing scale,
color relationships, motion principles: ease curves, anticipation, follow-through, staggering,
secondary motion) that the skill applies and self-checks via rendered frames.

Task 3 — recipe library: step-by-step tool sequences for bouncing logo, a rigged character walk
cycle (bones + IK + poses via the rigging tools), kinetic typography, and a UI micro-interaction
exported to Lottie. Each recipe: goal -> MCP tool sequence -> render checkpoints -> common pitfalls.

Task 4 — docs (Documentation agent): usage guide, prerequisites (connect the MCP, scopes), examples
with before/after renders, and troubleshooting (auth, scope, conflict, render).

Acceptance: following the skill, an assistant takes an empty project to a designed, animated, exported
result using only MCP tools, self-correcting from render_frame output. Validate on 2-3 of the recipes.
```

---

## Notes on Integration Coverage

Per the requirement that backend/MCP integration with the frontend be explicit, integration is a
**first-class, recurring track**, not an afterthought:

- **B4** integrates the **REST API into the web app** (cloud sync, auth, offline reconcile).
- **B7** integrates the **MCP into the UI** (AI-edit visibility, version history/restore, MCP
  connection/consent, live updates).
- **B9** integrates **AI-driven design/animation into the product** via a dedicated skill.

The **Frontend Integration Engineer** ([`agents/backend/frontend-integration-engineer.md`](../agents/backend/frontend-integration-engineer.md))
owns B4 and B7 and co-owns B9, ensuring the server and MCP are usable from the real editor — not just
correct in isolation.

---

## New UI Surfaces Introduced by the Backend

The backend is not just server code — it implies a substantial amount of **new client UI** in
`apps/web`. Today the app has no concept of accounts, cloud projects, sharing, versions, or AI
collaboration; the backend introduces all of them. These surfaces are built by the **Frontend
Integration Engineer** (wiring/state) together with the **Frontend Designer**
([`agents/frontend-designer.md`](../agents/frontend-designer.md), via the `/frontend-design` skill),
and must match the existing **Neo-Industrial Studio** aesthetic (violet accent, DM Sans / IBM Plex
Mono, dark-mode default, glass/blur surfaces).

| #   | UI surface                  | What it is                                                                                                    | Sprint          |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | **Auth screens**            | Sign in / register / password reset / sign-out; session-expiry handling                                       | B4              |
| 2   | **Account & storage**       | Profile, storage-usage/quota meter, connected-app management                                                  | B4 (+B8 quotas) |
| 3   | **Cloud project browser**   | Extend `Projects.tsx`: personal + team + shared-with-me, thumbnails, search/sort, rename, **trash + restore** | B4              |
| 4   | **Sync status + conflict**  | Online/offline/syncing indicator; **conflict dialog** (keep mine / take server / open both)                   | B4              |
| 5   | **Version history**         | Timeline of versions with author (user/mcp/system), messages, thumbnail preview, **one-click restore**        | B7              |
| 6   | **AI-edit indicators**      | Banner/marker when the current version was authored by an assistant; "restore previous" affordance            | B7              |
| 7   | **MCP / AI connection**     | Connect an AI assistant (initiate OAuth consent, pick scope), list active MCP sessions, revoke                | B7              |
| 8   | **Sharing & collaborators** | Invite by email, set role (editor/viewer), team management, remove access                                     | B7              |
| 9   | **Live presence**           | Who else is viewing/editing (avatars); live refresh when a remote/MCP edit lands                              | B7              |
| 10  | **Export jobs**             | Server-side export progress, download results, recent-exports list                                            | B6/B8           |
| 11  | **Onboarding / first-run**  | Prompt to sign in / stay local; explain cloud vs offline                                                      | B4              |

**Scope note:** surfaces 1–4 and 11 alone are a meaningful design+build effort — if B4 gets tight,
split it into **B4a** (auth + cloud project browser UI) and **B4b** (sync engine + conflict UX)
rather than compressing the design work. All of this stays behind the `cloudSync` feature flag so the
local-only experience is never regressed.
