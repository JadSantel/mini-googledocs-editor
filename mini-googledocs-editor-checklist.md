# Real-Time Collaborative Editor — Build Checklist

Work through this top to bottom. Don't skip ahead — each phase proves one
new piece works in isolation before the next phase depends on it. Check
items off as you go. Anything already marked `[✅]` was completed together
in this conversation; everything else is the path forward.

Tools you'll use throughout: **pnpm**, a code editor, **curl**/**Postman**
for testing REST endpoints, a **WebSocket client** (e.g. `wscat` or
browser devtools) for testing realtime events, **Prisma Studio** or
`psql` for peeking at the database, and two browser windows/profiles for
every multi-user test.

---

## Phase 1 — Monorepo & tooling

**Goal:** prove the workspace, both apps, and the type pipeline all boot
before any real feature exists.

- [✅] Create the pnpm workspace root
  ```bash
  mkdir collab-editor && cd collab-editor
  mkdir -p apps packages/shared-types
  ```
  ```yaml
  # pnpm-workspace.yaml
  packages:
    - "apps/*"
    - "packages/*"
  ```
- [✅] Scaffold `apps/web` (Next.js App Router + TypeScript + Tailwind + ESLint)
  ```bash
  npx create-next-app@latest web --typescript --tailwind --eslint --app
  ```
- [✅] Scaffold `apps/realtime-server` as a bare Node.js + TypeScript skeleton
      (`src/socket/`, `src/yjs/`, `src/redis/`, `src/lib/` created empty —
      populated in later phases, not now)
  ```json
  // apps/realtime-server/package.json (key parts)
  { "scripts": { "dev": "tsx watch src/index.ts", "build": "tsc -p tsconfig.json" } }
  ```
- [✅] Create `packages/shared-types` and reference it from both apps
      (kept empty until Phase 6 defines the WebSocket message protocol)
- [✅] Initialize Prisma in `apps/web` pointed at PostgreSQL
  ```bash
  npx prisma init --datasource-provider postgresql
  ```
  ```env
  # apps/web/.env
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/collab_editor?schema=public"
  ```
- [✅] Add root Prettier config + `.gitignore` (`node_modules`, `.next`, `dist`, `.env`)
- [✅] Add `.env.example` for both apps
- [✅] Run `pnpm install` from the repo root and confirm zero errors
- [✅] **Test:** type-check both apps
  ```bash
  cd apps/web && npx tsc --noEmit
  cd apps/realtime-server && npx tsc --noEmit
  ```
  Expect: no output, no errors, from either command.
- [✅] **Test:** boot the Next.js app locally
  ```bash
  pnpm dev:web
  ```
  Visit `http://localhost:3000` — expect the default Next.js welcome page.
- [✅] **Test:** boot the realtime server skeleton
  ```bash
  pnpm dev:realtime
  ```
  Expect a console log confirming it started (no real socket logic yet).

✅ **Checkpoint:** both apps boot independently, share a type package, and
Prisma is wired to a real Postgres connection string. Do not add features
until this is true on your machine.

---

## Phase 2 — Authentication (Auth.js)

**Goal:** register, log in, log out, and protect routes — before any
document or editor code exists.

- [✅] Install Auth.js and Prisma adapter
  ```bash
  cd apps/web
  pnpm add next-auth@beta @auth/prisma-adapter bcryptjs
  pnpm add -D @types/bcryptjs
  ```
- [✅] Add `User` model to `prisma/schema.prisma` (fields only — relations
      to `Document`/`Collaborator` come in Phase 3)
  ```prisma
  model User {
    id        String   @id @default(cuid())
    username  String   @unique
    email     String   @unique
    password  String
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
  }
  ```
- [✅] Run the first migration
  ```bash
  npx prisma migrate dev --name init_user
  ```
- [✅] Create `lib/auth.ts` — Auth.js config with a **Credentials provider**
      that verifies `bcrypt.compare(password, user.password)`
- [✅] Create `lib/prisma.ts` — a singleton Prisma client (guard against
      multiple instances in Next.js dev hot-reload)
- [✅] Create the registration API route (`app/api/register/route.ts`) that
      hashes the password with `bcrypt.hash(password, 10)` **before**
      saving — never store plaintext
- [✅] Wire up `app/api/auth/[...nextauth]/route.ts` for Auth.js's own
      login/session endpoints
- [✅] Build minimal `Register` and `Login` pages/forms (no styling polish
      yet — function first)
- [✅] Add a `middleware.ts` that redirects unauthenticated requests away
      from protected routes (e.g. `/dashboard`, `/documents/*`)
- [✅] **Test — register:**
  ```bash
  curl -X POST http://localhost:3000/api/register \
    -H "Content-Type: application/json" \
    -d '{"username":"alice","email":"alice@test.com","password":"password123"}'
  ```
  Expect: success response, and confirm in Prisma Studio (`npx prisma studio`)
  that the stored `password` field is a bcrypt hash, **not plaintext**.
- [✅] **Test — login through the UI:** submit the login form, confirm you
      land on a protected page and a session cookie is set (check devtools
      → Application → Cookies).
- [✅] **Test — route guard:** while logged out, visit a protected route
      directly by URL — confirm you're redirected to `/login`.
- [✅] **Test — logout:** confirm the session cookie is cleared and
      protected routes become inaccessible again.

✅ **Checkpoint:** full register → login → protected-route → logout cycle
works, and passwords are verifiably hashed at rest. Nothing past this
point should ever touch a plaintext password.

---

## Phase 3 — Database models

**Goal:** the full relational schema exists and every relation is
provably correct via Prisma Studio, before any UI reads or writes to it.

- [✅] Extend `prisma/schema.prisma` with the remaining models
  ```prisma
  model Document {
    id        String   @id @default(cuid())
    title     String
    ownerId   String
    owner     User     @relation(fields: [ownerId], references: [id])
    collaborators Collaborator[]
    comments  Comment[]
    snapshots DocumentSnapshot[]
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
  }

  enum Role {
    OWNER
    EDITOR
    VIEWER
  }

  model Collaborator {
    id         String   @id @default(cuid())
    documentId String
    userId     String
    role       Role
    document   Document @relation(fields: [documentId], references: [id])
    user       User     @relation(fields: [userId], references: [id])

    @@unique([documentId, userId])
  }

  model Comment {
    id            String   @id @default(cuid())
    documentId    String
    authorId      String
    text          String
    startPosition Int
    endPosition   Int
    document      Document @relation(fields: [documentId], references: [id])
    author        User     @relation(fields: [authorId], references: [id])
    createdAt     DateTime @default(now())
  }

  model DocumentSnapshot {
    id         String   @id @default(cuid())
    documentId String
    snapshot   Bytes
    document   Document @relation(fields: [documentId], references: [id])
    createdAt  DateTime @default(now())
  }
  ```
- [✅] Add the reverse relations to `User` (`documents`, `collaborations`,
      `comments`) so Prisma's type generation is bidirectional
- [✅] Run the migration
  ```bash
  npx prisma migrate dev --name add_documents_collaborators_comments
  ```
- [✅] Create a `prisma/seed.ts` script that creates 2 test users, 1
      document owned by user A, and adds user B as an `EDITOR` collaborator
- [✅] Wire the seed script into `package.json`
  ```json
  "prisma": { "seed": "tsx prisma/seed.ts" }
  ```
- [✅] **Test:** run the seed and open Prisma Studio
  ```bash
  npx prisma db seed
  npx prisma studio
  ```
  Confirm visually: the document row has the correct `ownerId`, and the
  `Collaborator` table has one row linking user B to that document with
  role `EDITOR`.
- [ ] **Test — cascade sanity check:** in Studio, manually delete the
      seeded document and confirm (per your `onDelete` rules, which you
      should set explicitly) collaborators/comments/snapshots either
      cascade-delete or are blocked — decide and document which, don't
      leave it to Prisma's default.

✅ **Checkpoint:** schema fully matches the spec, migrations apply
cleanly from scratch, and relations are verified by hand — not assumed.

---

## Phase 4 — Dashboard (document CRUD, no editor yet)

**Goal:** create, rename, delete, search, and list documents through a
real UI, using plain HTTP — before WebSockets or the rich text editor
enter the picture.

- [✅] Create `app/api/documents/route.ts` — `GET` (list owned + shared
      documents for the logged-in user) and `POST` (create)
- [✅] Create `app/api/documents/[id]/route.ts` — `PATCH` (rename) and
      `DELETE`
- [✅] Add a `lib/permissions.ts` helper: `getUserRole(userId, documentId)`
      that returns `OWNER | EDITOR | VIEWER | null` — this becomes the
      single source of truth every later route checks against
- [✅] Build `Dashboard` page: list of documents (title, updated-at,
      your role), a "New Document" button, search input, delete button
      (owner-only — disabled/hidden otherwise)
- [✅] Add optimistic UI for create/rename/delete using React Query
      mutations, so the list updates before the network round-trip
      completes
- [✅] **Test — create:** click "New Document," confirm it appears
      immediately in the list and persists after a page refresh.
- [✅] **Test — rename:** rename a document, confirm the new title
      persists after refresh.
- [✅] **Test — search:** create 3 documents with distinct titles, confirm
      the search box filters correctly.
- [✅] **Test — permission boundary:** log in as the non-owner collaborator
      seeded in Phase 3, confirm the delete button is hidden/disabled for
      documents you don't own.
- [✅] **Test — direct API bypass attempt:** as the non-owner user, call
      the delete endpoint directly with `curl` (bypassing the UI):
  ```bash
  curl -X DELETE http://localhost:3000/api/documents/<doc-id> \
    -H "Cookie: <session-cookie>"
  ```
  Expect: `403 Forbidden`, **not** a successful delete. The UI hiding a
  button is not security — the server check is.

✅ **Checkpoint:** document CRUD works end-to-end and permission checks
are enforced server-side, independent of what the UI shows or hides.

---

## Phase 5 — TipTap editor (local only, no collaboration yet)

**Goal:** prove the rich text editor itself works — formatting, tables,
undo/redo — while it's still only talking to local component state.

- [ ] Install TipTap core + starter extensions
  ```bash
  pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit \
    @tiptap/extension-link @tiptap/extension-table \
    @tiptap/extension-table-row @tiptap/extension-table-cell \
    @tiptap/extension-table-header @tiptap/extension-underline
  ```
- [ ] Create `components/editor/Editor.tsx` using `useEditor()` with
      `StarterKit` (headings, bold, italic, lists, code block, blockquote,
      undo/redo come bundled) plus Link, Table, Underline
- [ ] Build `components/editor/Toolbar.tsx` as a **separate** component
      that reads `editor` state and calls `editor.chain().focus()...run()`
      commands — keep it decoupled from `Editor.tsx` per the
      separation-of-concerns rule
- [ ] Wire a document's page (`app/documents/[id]/page.tsx`) to render
      `<Editor />`, initially with hardcoded placeholder content
- [ ] **Test — formatting:** for each of bold, italic, underline, strike,
      headings (H1–H3), bullet list, ordered list, code block, blockquote,
      and link — apply it via the toolbar and confirm the DOM updates
      correctly.
- [ ] **Test — table:** insert a table, add/remove a row and column,
      confirm it renders correctly.
- [ ] **Test — undo/redo:** make 5 edits, undo all 5, redo all 5, confirm
      state matches at each step.
- [ ] **Test — keyboard shortcuts:** confirm `Cmd/Ctrl+B`, `Cmd/Ctrl+I`,
      `Cmd/Ctrl+Z` work without touching the toolbar.

✅ **Checkpoint:** the editor is fully functional as a **single-user,
local-only** rich text editor. Nothing here persists or syncs yet — that's
deliberate, so you know any bugs after this point come from the
collaboration layer, not the editor itself.

---

## Phase 6 — WebSocket server

**Goal:** a client can open a socket, send a message, and receive one
back — before Yjs, presence, or cursors touch it.

- [ ] Define the shared message protocol in `packages/shared-types`
  ```ts
  export type ClientMessage =
    | { type: "join-document"; documentId: string }
    | { type: "leave-document"; documentId: string };

  export type ServerMessage =
    | { type: "joined"; documentId: string }
    | { type: "error"; message: string };
  ```
- [ ] Implement `apps/realtime-server/src/socket/server.ts` — bind a `ws`
      `WebSocketServer` to an HTTP server, log connect/disconnect
- [ ] Implement basic auth on connect: read a session token from the
      connection query string or headers, validate it (reuse Auth.js's
      session-verification logic via a shared secret/JWT — decide and
      document which approach, since this is the one place your two apps
      must agree on a security contract)
- [ ] Handle `join-document` / `leave-document` messages, tracking which
      documentId each socket is currently in (in-memory `Map` for now —
      Redis comes in Phase 12)
- [ ] Add a `NEXT_PUBLIC_REALTIME_WS_URL` env var in `apps/web` and a
      thin `lib/socket.ts` client wrapper
- [ ] **Test — manual connect:** using `wscat` or browser devtools:
  ```bash
  npx wscat -c "ws://localhost:4000?token=<session-token>"
  ```
  Send `{"type":"join-document","documentId":"<id>"}`, expect
  `{"type":"joined","documentId":"<id>"}` back.
- [ ] **Test — unauthenticated connection:** attempt to connect without a
      valid token, confirm the server rejects/closes the connection
      rather than accepting it silently.
- [ ] **Test — disconnect cleanup:** connect, join a document, close the
      connection, confirm server logs show it removed from the in-memory
      tracking (add a temporary debug log if needed).

✅ **Checkpoint:** the socket layer authenticates connections and tracks
document membership correctly. This is the foundation everything else in
Phases 7–9 is built on top of — don't proceed until reconnects and
disconnects behave predictably.

---

## Phase 7 — Yjs integration (the CRDT sync core)

**Goal:** two browser tabs editing the same document merge changes
automatically, with no central lock and no lost keystrokes.

> **Before writing code:** this phase gets the full "what/why/how" — Yjs
> is a CRDT (Conflict-free Replicated Data Type). Instead of one client
> "owning" the document and others sending patches to it, every client
> holds a replica of the same data structure, and updates merge
> deterministically no matter what order they arrive in or whether the
> network dropped for a while. That's what "never overwrite another
> user's work" actually means at the algorithm level, not just as a
> feature description.

- [ ] Install Yjs + bindings
  ```bash
  # apps/web
  pnpm add yjs y-websocket @tiptap/extension-collaboration \
    @tiptap/extension-collaboration-cursor
  # apps/realtime-server
  pnpm add yjs y-protocols
  ```
- [ ] Implement the server-side Yjs document manager
      (`apps/realtime-server/src/yjs/docManager.ts`) — one `Y.Doc` per
      `documentId`, held in memory, applying/broadcasting binary updates
      to every socket in that document's room
- [ ] Wire `document-update` binary messages through the socket layer
      from Phase 6 (Yjs updates are binary, not JSON — this is a
      different message path than `join-document`)
- [ ] On the client, replace TipTap's plain content with the
      `Collaboration` extension bound to a `Y.Doc`, connected via
      `y-websocket`'s `WebsocketProvider`
- [ ] Add periodic persistence: on an interval (or on last-client-leaves),
      serialize the `Y.Doc` state and write it as a `DocumentSnapshot` row
      via Prisma, so a fresh server restart doesn't lose data
- [ ] On document load, if a snapshot exists, hydrate the `Y.Doc` from it
      before accepting new connections
- [ ] **Test — two-tab sync:** open the same document in two browser tabs
      (or two browsers), type in tab A, confirm text appears in tab B
      within roughly a second, with correct cursor position (not jumping
      to the end).
- [ ] **Test — simultaneous typing:** type in both tabs at the same time,
      in different parts of the document — confirm both sets of changes
      are present in both tabs afterward, nothing overwritten.
- [ ] **Test — offline merge:** in tab A, open devtools → Network → set to
      "Offline." Type several sentences. Meanwhile type different content
      in tab B (still online). Set tab A back online. Confirm both
      changes merge into a single consistent document in both tabs.
- [ ] **Test — persistence across restart:** stop the realtime server,
      confirm a `DocumentSnapshot` row exists in Postgres, restart the
      server, reload the document, confirm content is intact.

✅ **Checkpoint:** this is the hardest and most important phase in the
whole project. Do not move on until the offline-merge test passes
reliably — that's the test that actually proves the CRDT property, not
just "typing shows up in another tab."

---

## Phase 8 — Presence

**Goal:** every connected client can see who else is currently in the
document.

- [ ] Extend the shared message protocol with `presence-update`
      (`{ type: "presence-update"; users: { id, username, color }[] }`)
- [ ] On the server, maintain an in-memory presence set per document room
      (add on join, remove on leave/disconnect), broadcast the full list
      on any change
- [ ] Assign each user a stable color (hash their user id to a color from
      a fixed palette, so it's consistent across reconnects, not random
      per session)
- [ ] Build `components/editor/PresenceAvatars.tsx` — a row of colored
      avatar circles reading from a `usePresence()` hook
- [ ] **Test — join notification:** with tab A open, open the same
      document in tab B, confirm tab A's avatar row updates to show the
      second user within a second or two, without a page refresh.
- [ ] **Test — leave:** close tab B, confirm tab A's avatar row drops
      back down.
- [ ] **Test — color stability:** disconnect and reconnect the same user
      (refresh the tab), confirm their avatar color is the same both times.
- [ ] **Test — three+ users:** open a third tab as a third seeded user,
      confirm all three avatars show correctly in every tab.

✅ **Checkpoint:** presence state is accurate and updates in real time
across joins, leaves, and reconnects.

---

## Phase 9 — Live cursors

**Goal:** see exactly where every other connected user's cursor and
selection are, updating as they type or select.

- [ ] Wire TipTap's `CollaborationCursor` extension (installed in Phase 7)
      to broadcast local cursor position/selection through the Yjs
      awareness protocol (`y-protocols/awareness` — distinct from the
      document content sync, this is ephemeral state, not persisted)
- [ ] Style remote cursors: colored caret + username label, using the
      same color assigned in Phase 8 for visual consistency
- [ ] Style remote selections: colored highlight matching that user's
      cursor color
- [ ] **Test — cursor movement:** in tab A, click around the document;
      confirm tab B sees a labeled, colored cursor move to match, with
      no more than a fraction-of-a-second lag.
- [ ] **Test — selection:** in tab A, select a range of text; confirm
      tab B sees that range highlighted in tab A's color.
- [ ] **Test — cursor cleanup:** close tab A; confirm its cursor
      disappears from tab B immediately (not a stale cursor left behind).
- [ ] **Test — many users:** with 3+ tabs open, confirm cursors don't
      visually collide/overlap illegibly and each is clearly attributable
      to its user.

✅ **Checkpoint:** cursors and selections are accurate, correctly
colored/labeled, and clean up properly on disconnect.

---

## Phase 10 — Comments

**Goal:** highlight text, attach a comment thread to it, and manage that
thread — independent of the document's live text content.

- [ ] Build the comment creation flow: select text in the editor, a
      "Add comment" affordance appears, capture the selection's
      `startPosition`/`endPosition` (TipTap gives you this via
      `editor.state.selection`)
- [ ] Create `app/api/documents/[id]/comments/route.ts` (`GET`, `POST`)
      and `app/api/comments/[id]/route.ts` (`PATCH` for resolve, supports
      replies via a self-referencing `parentId` you'll need to add to the
      `Comment` model — do this as a small migration now)
- [ ] Build `components/comments/CommentSidebar.tsx` — threaded list,
      reply input, "Resolve" button
- [ ] Highlight commented ranges in the editor itself (a TipTap mark or
      decoration tied to comment id) so clicking a sidebar comment
      scrolls to and highlights its range in the text
- [ ] Broadcast `comment-added` / `comment-updated` / `comment-deleted`
      over the WebSocket connection so the sidebar updates live for every
      connected user, not just on refresh
- [ ] **Test — create:** select text, add a comment, confirm it appears
      in the sidebar and the text range is visually marked.
- [ ] **Test — reply:** add a reply to that comment, confirm it nests
      correctly under the original.
- [ ] **Test — resolve:** resolve the comment, confirm it's visually
      distinguished (e.g. greyed out or moved to a "Resolved" section)
      but not deleted.
- [ ] **Test — live sync:** with two tabs open, add a comment in tab A,
      confirm it appears in tab B's sidebar without a refresh.
- [ ] **Test — permission boundary:** as a `VIEWER`-role user, confirm
      you can read comments but the "Add comment" affordance is
      unavailable — and confirm the API rejects a direct POST attempt
      too (same server-side-check principle as Phase 4).

✅ **Checkpoint:** comments are fully threaded, positioned correctly
against live text, and sync in real time across users.

---

## Phase 11 — Version history

**Goal:** browse past snapshots and restore one, without losing the
current state if you change your mind.

- [ ] Confirm `DocumentSnapshot` rows are already being written
      periodically (from Phase 7) — this phase is about **surfacing**
      them, not creating the mechanism
- [ ] Tune the snapshot interval/trigger if needed (e.g. every N minutes
      of activity, or on every N-th update, not on literally every
      keystroke — decide and document the trade-off between granularity
      and storage growth)
- [ ] Build `app/api/documents/[id]/snapshots/route.ts` (`GET` — list,
      newest first) and `.../snapshots/[snapshotId]/restore/route.ts`
      (`POST`)
- [ ] Build `components/editor/VersionHistoryPanel.tsx` — timestamped
      list, a "Preview" mode that renders a snapshot read-only without
      touching the live `Y.Doc`, and a "Restore" action
- [ ] Implement restore carefully: **don't** just overwrite — create a
      new snapshot of the current state first (so restoring is itself
      undoable), then apply the old snapshot's content as a new Yjs
      update broadcast to all connected clients
- [ ] **(Optional)** build a simple diff view comparing two snapshots'
      plain-text content
- [ ] **Test — snapshot list:** make several rounds of edits with pauses
      between them, confirm multiple distinct snapshots appear with
      correct timestamps.
- [ ] **Test — preview:** preview an older snapshot, confirm the live
      document (and other connected users' views) are **unaffected**
      until you explicitly restore.
- [ ] **Test — restore:** restore an older version, confirm all connected
      tabs update to reflect it, and confirm a fresh snapshot of the
      pre-restore state now exists (so you could undo the restore too).

✅ **Checkpoint:** history is browsable, previewing is non-destructive,
and restoring is itself a recoverable action, not a one-way door.

---

## Phase 12 — Redis scaling

**Goal:** prove the realtime server works correctly across **multiple
instances**, not just as a single process — the assumption the whole
system has been quietly relying on since Phase 6.

> **Before writing code:** right now, presence and Yjs document state
> live in that one Node process's memory. If you ran two instances of
> `realtime-server` behind a load balancer, a user connected to instance
> A would never see updates from a user connected to instance B — they'd
> each think they're alone. Redis Pub/Sub fixes this: instead of
> broadcasting only to sockets it directly holds, each instance also
> publishes updates to a shared Redis channel and subscribes to it, so
> every instance relays every other instance's updates to its own
   connected clients.

- [ ] Run Redis locally
  ```bash
  docker run -d -p 6379:6379 redis:7-alpine
  ```
- [ ] Install the Redis client in `apps/realtime-server`
  ```bash
  pnpm add ioredis
  ```
- [ ] Implement `src/redis/pubsub.ts` — a publisher and subscriber client
      per document channel (`doc:<documentId>`)
- [ ] Refactor the Yjs doc manager (Phase 7) and presence tracker
      (Phase 8) so that instead of only broadcasting to local sockets,
      every update is **published to Redis**, and every instance
      **relays incoming Redis messages** to its own locally-connected
      sockets for that document
- [ ] Guard against echo loops: an instance shouldn't re-broadcast a
      message back out to Redis that it just received from Redis
- [ ] **Test — local proof, two instances:** run two copies of the
      realtime server on different ports
  ```bash
  PORT=4000 pnpm dev:realtime
  PORT=4001 pnpm dev:realtime
  ```
  Manually point tab A's socket URL at `:4000` and tab B's at `:4001`
  (temporarily hardcode this for the test). Type in tab A, confirm it
  still appears in tab B — proving sync now happens *through* Redis, not
  just in-process.
- [ ] **Test — presence across instances:** with the same two-instance
      setup, confirm tab A's presence avatars correctly show the user
      connected to the *other* instance.
- [ ] **Test — instance restart:** kill and restart one instance mid-session,
      confirm reconnecting clients recover cleanly and Redis-backed state
      is unaffected.

✅ **Checkpoint:** the realtime layer is horizontally scalable in
practice, not just in theory. This is the single most "senior engineer"
checkpoint in the project — be ready to explain this phase in an
interview.

---

## Phase 13 — Deployment

**Goal:** the whole system runs in production, reachable over the
public internet, with real environment separation.

- [ ] Provision managed PostgreSQL and Redis (e.g. Supabase/Neon for
      Postgres, Upstash/Redis Cloud for Redis) — don't self-host these
      for a portfolio deployment
- [ ] Run production migrations against the managed database
  ```bash
  npx prisma migrate deploy
  ```
- [ ] Deploy `apps/web` to Vercel (or similar), setting `DATABASE_URL`,
      `AUTH_SECRET`, and `NEXT_PUBLIC_REALTIME_WS_URL` as environment
      variables in the platform dashboard — never commit real secrets
- [ ] Deploy `apps/realtime-server` to a platform that supports long-lived
      processes/WebSockets (e.g. Railway, Fly.io, Render) — this is
      exactly the reasoning from Phase 1 paying off, since it can't run
      on Vercel's serverless functions
- [ ] Point the realtime server's `REDIS_URL` at the managed Redis
      instance from step 1
- [ ] Configure CORS/allowed origins on the realtime server to only
      accept connections from your deployed frontend's domain
- [ ] Set up basic uptime monitoring/logging (even a simple health-check
      endpoint + external pinger is enough for a portfolio project)
- [ ] **Test — cold smoke test:** from a device that's never touched the
      dev environment, register a new account, create a document, and
      confirm the editor loads.
- [ ] **Test — cross-device collaboration:** open the same document on
      two different physical devices/networks (not just two tabs on one
      machine), confirm real-time sync, presence, and cursors all work
      exactly as they did locally.
- [ ] **Test — HTTPS/WSS:** confirm the WebSocket connection upgrades to
      `wss://` (secure) in production, not falling back to plaintext `ws://`.
- [ ] **Test — restart resilience:** manually restart the deployed
      realtime server, confirm connected clients reconnect automatically
      and no data is lost (this is the same test as Phase 12, now against
      real infrastructure instead of local Docker Redis).

✅ **Final checkpoint:** the app is live, reachable by anyone with the
URL, and every property you tested locally (CRDT merging, presence,
cursors, comments, version history, multi-instance scaling) still holds
true in production. This is the version you put in front of recruiters.

---

## Stretch goals (optional, once everything above works)

- [ ] Full-text search across document titles **and** content (Postgres
      `tsvector` or a dedicated search service)
- [ ] Toast notifications for collaborator joined/left, document saved,
      comment added (the events already exist from Phases 8/10 — this is
      wiring a UI layer on top)
- [ ] Version comparison / diff view between two snapshots, side by side
- [ ] Rate limiting on the realtime server (cap messages/sec per socket)
      to protect against a misbehaving client
- [ ] Automated tests: unit tests for `lib/permissions.ts`, integration
      tests for the Yjs merge behavior from Phase 7's offline test
- [ ] CI pipeline (GitHub Actions) running lint + typecheck + tests on
      every push
