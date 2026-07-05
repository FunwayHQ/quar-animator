# Quar Animator Backend Agents

Specialized agent definitions for building the **Rust / Axum + MySQL backend** and its **hosted
MCP server** (see [`docs/BACKEND_PLAN.md`](../../docs/BACKEND_PLAN.md) for the architecture and
[`docs/BACKEND_SPRINT_PLAN.md`](../../docs/BACKEND_SPRINT_PLAN.md) for the sprint breakdown).

These complement the existing product agents in [`agents/`](../). Where the product agents build the
web/WASM animation engine, these build the server that persists projects as files, exposes them over
a REST/WS API, and drives them through a Figma-grade MCP.

## Agent Overview

| Agent                                                               | Owns                                                                                         | Primary Crates              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| [Backend Lead](./backend-lead.md)                                   | Architecture, crate boundaries, cross-cutting decisions, review                              | `quar-server`, workspace    |
| [Rust API Engineer](./rust-api-engineer.md)                         | Axum REST + WebSocket, middleware, DTOs, error model                                         | `quar-api`                  |
| [Database Engineer](./database-engineer.md)                         | MySQL schema, sqlx queries, migrations, indexing                                             | `quar-db`                   |
| [Storage & Format Engineer](./storage-format-engineer.md)           | `.quar` binary port, blob store (FS/S3), content addressing                                  | `quar-format`, `quar-store` |
| [Auth & Security Engineer](./auth-security-engineer.md)             | JWT/refresh, OAuth 2.1/PKCE, ACL, untrusted-input hardening                                  | `quar-core::auth`           |
| [MCP Server Engineer](./mcp-server-engineer.md)                     | rmcp tools/resources/prompts, Streamable HTTP, semantic + render tools                       | `quar-mcp`                  |
| [Frontend Integration Engineer](./frontend-integration-engineer.md) | Wire backend + MCP into `apps/web`: cloud sync, auth UI, version history, AI-edit visibility | `apps/web` (client)         |
| [Backend QA Engineer](./backend-qa-engineer.md)                     | sqlx::test, testcontainers, API e2e, MCP conformance, golden parity                          | all (tests)                 |
| [DevOps Engineer](./devops-engineer.md)                             | docker-compose, deploy, observability, config, quotas                                        | `quar-server`, infra        |

## Shared Ground Rules (all backend agents)

1. **One source of format truth.** All project reads/writes flow through `quar-format` +
   `quar-core` domain services. Never re-implement `.quar` parsing, validation, or node mutation
   inside `quar-api` or `quar-mcp` — call the shared crate. (The current codebase defines the format
   in three places — `quarFormat.ts`, `projectSerializer.ts`, `quar_format.py` — and this backend
   exists partly to collapse that.)
2. **Blobs are files, metadata is rows.** The `.quar` bytes live in the blob store; MySQL holds
   metadata + relational data + a `blobs` pointer. Never stream a multi-MB blob through a DB column.
3. **Every mutation is a version.** Saves are immutable, sequential (`project_versions.seq`),
   optimistic-concurrency-checked, and audited. Undo = restore a prior version.
4. **The MCP shares the API's auth, ACL, and storage.** An AI edit and a UI edit are indistinguishable
   at the storage layer and produce byte-identical `.quar` output.
5. **Untrusted input is validated at the boundary.** `.quar` uploads, MCP tool args, and OAuth
   payloads are all validated with explicit bounds before touching core services.
6. **Compile-time-checked SQL.** Use `sqlx::query!`/`query_as!` macros so schema drift is a build
   error, not a runtime 500.

## Invoking

```
Use the [Agent Name] backend agent to [task]. Load docs/BACKEND_PLAN.md and the relevant sprint
from docs/BACKEND_SPRINT_PLAN.md for context.
```
