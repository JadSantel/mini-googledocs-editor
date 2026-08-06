# Real-Time Collaborative Document Editor

A portfolio project implementing a Google Docs / Notion–style collaborative
editor: multiple users editing the same document simultaneously, with
conflict-free synchronization, live cursors, comments, and version history.

## Architecture

This is a **monorepo** (pnpm workspaces) containing two independently
deployable applications, plus a shared types package:

```
apps/
  web/                 Next.js (App Router) — UI, auth, document CRUD, dashboard
  realtime-server/     Standalone Node.js WebSocket server — Yjs sync, presence
packages/
  shared-types/        TypeScript types shared between web and realtime-server
```

### Why split the WebSocket server out of Next.js?

Next.js Route Handlers run in a request/response, serverless-friendly model.
WebSocket connections are long-lived and stateful — that's a poor fit for
serverless execution and isn't well supported by Next.js's own routing layer.

Instead, `apps/realtime-server` is a plain Node.js process dedicated to:
- accepting WebSocket connections
- syncing Yjs document updates between connected clients
- broadcasting presence / cursor state
- (later) publishing/subscribing through Redis so the app can run on
  multiple server instances without losing sync

This mirrors how production collaborative editors (Figma, Linear, Notion)
typically separate their realtime transport layer from their main web app.

### Why a shared-types package?

`apps/web` and `apps/realtime-server` talk to each other over WebSocket
messages. Without a single source of truth for what those messages look
like, the two codebases can silently drift apart (e.g. a field renamed on
one side but not the other), and that class of bug only shows up at
runtime. `packages/shared-types` gives both apps the same TypeScript
definitions, so mismatches are caught at compile time.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Next.js (App Router) + React + TypeScript | File-based routing, server components, strong typing |
| Styling | TailwindCSS | Utility-first, fast iteration, no context-switching to separate CSS files |
| Rich text editor | TipTap | Headless (UI-agnostic), ProseMirror-based, first-class Yjs bindings |
| CRDT / sync engine | Yjs | Conflict-free merging of concurrent edits without a central lock |
| Realtime transport | y-websocket + a custom Node.js `ws` server | Syncs Yjs updates between clients |
| Backend data layer | PostgreSQL + Prisma | Type-safe queries, relational fit for users/documents/permissions |
| Pub/sub & scaling | Redis | Lets the realtime server run on multiple instances |
| Auth | Auth.js | Session handling, secure password hashing, protected routes |

## Status

**Phase 1 — Project Initialization: complete.**

- [x] Monorepo scaffold (pnpm workspaces)
- [x] `apps/web` — Next.js + TypeScript + Tailwind + ESLint
- [x] `apps/realtime-server` — Node.js + TypeScript skeleton (no logic yet)
- [x] `packages/shared-types` — empty package, wired into workspace
- [x] Prisma initialized in `apps/web` (schema is empty until Phase 3)
- [x] `.env.example` for both apps
- [x] Root Prettier + `.gitignore`

Next up: **Phase 2 — Authentication**.

## Getting Started

```bash
pnpm install

# copy env files and fill in real values
cp apps/web/.env.example apps/web/.env
cp apps/realtime-server/.env.example apps/realtime-server/.env

# run the Next.js app
pnpm dev:web

# run the realtime server (skeleton only until Phase 6)
pnpm dev:realtime
```
