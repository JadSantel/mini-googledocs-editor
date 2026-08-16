# Phase 8 — Presence: Code Handoff

Work through these files **in order** (dependencies first). Each section tells you
exactly which file to touch and what to do.

---

## 1 · `packages/shared-types/src/index.ts`

**Action:** Replace the entire file.

```ts
export interface JoinDocumentMessage {
  type: "join-document";
  documentId: string;
}

export interface LeaveDocumentMessage {
  type: "leave-document";
  documentId: string;
}

/** Every message shape a client is allowed to send. */
export type ClientMessage = JoinDocumentMessage | LeaveDocumentMessage;

export interface JoinedMessage {
  type: "joined";
  documentId: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

// ─── Phase 8: Presence ───────────────────────────────────────────────────────

/** A single user visible in the presence bar. */
export interface PresenceUser {
  id: string;
  username: string;
  color: string;
}

/**
 * Broadcast from the server whenever the presence set for a document changes.
 * In practice this is carried over the Yjs awareness protocol, but we document
 * the logical shape here so every layer agrees on the field names.
 */
export interface PresenceUpdateMessage {
  type: "presence-update";
  users: PresenceUser[];
}

/** Every message shape the server is allowed to send back. */
export type ServerMessage = JoinedMessage | ErrorMessage | PresenceUpdateMessage;
```

---

## 2 · `apps/realtime-server/src/lib/userColor.ts`  *(NEW FILE)*

Create this file from scratch.

```ts
/**
 * Derives a stable color for a user from their ID.
 * The hash is deterministic, so the same userId always yields the same color
 * across restarts, reconnects, and both client + server environments.
 */

const PALETTE = [
  "#f87171", // red-400
  "#fb923c", // orange-400
  "#facc15", // yellow-400
  "#4ade80", // green-400
  "#34d399", // emerald-400
  "#22d3ee", // cyan-400
  "#60a5fa", // blue-400
  "#818cf8", // indigo-400
  "#c084fc", // purple-400
  "#f472b6", // pink-400
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0; // keep unsigned 32-bit
  }
  return hash;
}

export function getUserColor(userId: string): string {
  return PALETTE[hashString(userId) % PALETTE.length];
}
```

---

## 3 · `apps/realtime-server/src/socket/server.ts`

**Action:** Replace the entire file.

Key changes vs. the current version:
- Import `prisma` to look up the connecting user's `username`.
- Pass `{ userId, username }` into `setupDocumentConnection`.

```ts
import { createServer, type Server, type IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket, type RawData } from "ws";
import { verifySocketToken } from "../lib/auth.js";
import { getUserRole } from "../lib/permission.js";
import { prisma } from "../lib/prisma.js";
import { setupDocumentConnection } from "../yjs/docManager.js";
import { joinRoom, leaveCurrentRoom, getCurrentDocument } from "./rooms.js";
import type { ClientMessage, ServerMessage } from "@collab-editor/shared-types";

interface AuthenticatedRequest extends IncomingMessage {
  userId?: string;
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function parseDocumentId(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  const pathname = new URL(url, "http://localhost").pathname;
  const documentId = decodeURIComponent(pathname.slice(1));

  return documentId.length > 0 ? documentId : null;
}

export function createSocketServer(): Server {
  const httpServer = createServer();

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, callback) => {
      const url = new URL(info.req.url ?? "", "http://localhost");
      const token = url.searchParams.get("token");
      const payload = token ? verifySocketToken(token) : null;

      if (!payload) {
        callback(false, 401, "Unauthorized");
        return;
      }

      (info.req as AuthenticatedRequest).userId = payload.userId;
      callback(true);
    },
  });

  wss.on("connection", (ws: WebSocket, req: AuthenticatedRequest) => {
    const userId = req.userId ?? "unknown";
    const documentId = parseDocumentId(req.url);

    // Phase 7+ path: ws://host/{documentId}?token=...
    if (documentId) {
      void (async () => {
        const role = await getUserRole(userId, documentId);
        if (!role) {
          ws.close(4403, "Forbidden");
          return;
        }

        // Phase 8: look up the username so the doc manager can send it
        // back to the client for awareness population.
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true },
        });
        const username = user?.username ?? "Unknown";

        console.log(
          `[socket] user=${userId} (${username}) connected to document=${documentId} role=${role}`,
        );

        try {
          await setupDocumentConnection(ws, documentId, userId, username);
        } catch (err) {
          console.error("[socket] failed to setup document connection", err);
          ws.close(1011, "Internal error");
        }
      })();

      return;
    }

    // Phase 6 legacy path: ws://host?token=... + JSON join/leave
    console.log(`[socket] connected user=${userId} (legacy JSON mode)`);

    ws.on("message", (raw: RawData) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", message: "Malformed message" });
        return;
      }

      switch (message.type) {
        case "join-document": {
          joinRoom(message.documentId, ws);
          send(ws, { type: "joined", documentId: message.documentId });
          console.log(
            `[socket] user=${userId} joined document=${message.documentId}`,
          );
          break;
        }
        case "leave-document": {
          const currentDocument = getCurrentDocument(ws);
          leaveCurrentRoom(ws);
          console.log(
            `[socket] user=${userId} left document=${currentDocument ?? message.documentId}`,
          );
          break;
        }
        default:
          send(ws, { type: "error", message: "Unknown message type" });
      }
    });

    ws.on("close", () => {
      const currentDocument = getCurrentDocument(ws);
      leaveCurrentRoom(ws);
      console.log(
        `[socket] disconnected user=${userId} (was in document=${currentDocument ?? "none"})`,
      );
    });
  });

  return httpServer;
}
```

---

## 4 · `apps/realtime-server/src/yjs/docManager.ts`

**Action:** Replace the entire file.

Key changes vs. the current version:
- `setupDocumentConnection` now accepts `userId` and `username`.
- After the sync step-1 handshake, the server sends a single JSON frame
  `{ type: "user-identity", userId, username }` so the client knows what to
  write into its own awareness state.
- Removed the erroneous `import { addListener }` and `import { Underline }` lines
  that were in the original file.

```ts
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { WebSocket, RawData } from "ws";
import {
  bindPersistence,
  flushOnClose,
  loadSnapshot,
} from "./persistence.js";

const messageSync = 0;
const messageAwareness = 1;

const WS_CONNECTING = 0;
const WS_OPEN = 1;

class WSSharedDoc extends Y.Doc {
  name: string;
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
  }
}

const docs = new Map<string, WSSharedDoc>();
const loadingDocs = new Map<string, Promise<WSSharedDoc>>();

function send(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array): void {
  if (
    conn.readyState !== WS_CONNECTING &&
    conn.readyState !== WS_OPEN
  ) {
    closeConn(doc, conn);
    return;
  }

  try {
    conn.send(message, (err) => {
      if (err) {
        closeConn(doc, conn);
      }
    });
  } catch {
    closeConn(doc, conn);
  }
}

function broadcast(doc: WSSharedDoc, message: Uint8Array): void {
  doc.conns.forEach((_, conn) => {
    send(doc, conn, message);
  });
}

const updateHandler = (
  update: Uint8Array,
  _origin: unknown,
  doc: WSSharedDoc,
): void => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  broadcast(doc, encoding.toUint8Array(encoder));
};

async function getOrCreateDoc(documentId: string): Promise<WSSharedDoc> {
  const existing = docs.get(documentId);
  if (existing) {
    return existing;
  }

  const inflight = loadingDocs.get(documentId);
  if (inflight) {
    return inflight;
  }

  const loadPromise = (async () => {
    const doc = new WSSharedDoc(documentId);

    const snapshot = await loadSnapshot(documentId);
    if (snapshot) {
      Y.applyUpdate(doc, snapshot);
      console.log(`[yjs] hydrated document=${documentId} from snapshot`);
    }

    doc.on("update", updateHandler);
    bindPersistence(documentId, doc);

    docs.set(documentId, doc);
    loadingDocs.delete(documentId);
    return doc;
  })();

  loadingDocs.set(documentId, loadPromise);
  return loadPromise;
}

function messageListener(
  conn: WebSocket,
  doc: WSSharedDoc,
  message: Uint8Array,
): void {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);

        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      }
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
      }
      default:
        console.warn(`[yjs] unknown message type=${messageType}`);
    }
  } catch (err) {
    console.error("[yjs] message handling failed", err);
    closeConn(doc, conn);
  }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket): void {
  const controlledIds = doc.conns.get(conn);
  if (controlledIds) {
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      conn,
    );
  }

  doc.conns.delete(conn);

  if (doc.conns.size === 0) {
    void flushOnClose(doc.name, doc).finally(() => {
      doc.destroy();
      docs.delete(doc.name);
      console.log(`[yjs] destroyed in-memory document=${doc.name}`);
    });
  }
}

// ─── Phase 8: identity frame ──────────────────────────────────────────────────
/**
 * Sent once per connection, right after the sync step-1 Yjs handshake frame.
 * The client reads this JSON message and uses the fields to populate its own
 * Yjs awareness state (userId → stable color, username → label).
 */
interface UserIdentityMessage {
  type: "user-identity";
  userId: string;
  username: string;
}

function sendIdentity(conn: WebSocket, userId: string, username: string): void {
  const payload: UserIdentityMessage = { type: "user-identity", userId, username };
  conn.send(JSON.stringify(payload));
}
// ─────────────────────────────────────────────────────────────────────────────

export async function setupDocumentConnection(
  conn: WebSocket,
  documentId: string,
  userId: string,   // ← Phase 8 addition
  username: string, // ← Phase 8 addition
): Promise<void> {
  conn.binaryType = "arraybuffer";

  const doc = await getOrCreateDoc(documentId);
  doc.conns.set(conn, new Set());

  const awarenessChangeHandler = (
    {
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    },
    _origin: unknown,
  ): void => {
    const changedClients = added.concat(updated, removed);
    const connControlledIds = doc.conns.get(conn);

    if (connControlledIds !== undefined) {
      added.forEach((clientId) => {
        connControlledIds.add(clientId);
      });
      removed.forEach((clientId) => {
        connControlledIds.delete(clientId);
      });
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients),
    );
    broadcast(doc, encoding.toUint8Array(encoder));
  };

  doc.awareness.on("update", awarenessChangeHandler);

  conn.on("message", (raw: RawData) => {
    const data =
      raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : Buffer.isBuffer(raw)
          ? new Uint8Array(raw)
          : new Uint8Array(raw as unknown as ArrayBuffer);

    messageListener(conn, doc, data);
  });

  conn.on("close", () => {
    doc.awareness.off("update", awarenessChangeHandler);
    closeConn(doc, conn);
    console.log(`[yjs] disconnected from document=${documentId}`);
  });

  conn.on("error", () => {
    doc.awareness.off("update", awarenessChangeHandler);
    closeConn(doc, conn);
  });

  // ── 1. Yjs sync step-1 (binary) ──────────────────────────────────────────
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));
  }

  // ── 2. Identity frame (JSON) — Phase 8 ───────────────────────────────────
  sendIdentity(conn, userId, username);

  console.log(
    `[yjs] connected document=${documentId} user=${userId} clients=${doc.conns.size}`,
  );
}
```

---

## 5 · `apps/web/lib/userColor.ts`  *(NEW FILE)*

**Identical algorithm** to the server version (step 2) — paste this in `apps/web/lib/`.

```ts
/**
 * Derives a stable color for a user from their ID.
 * Must stay in sync with apps/realtime-server/src/lib/userColor.ts.
 */

const PALETTE = [
  "#f87171", // red-400
  "#fb923c", // orange-400
  "#facc15", // yellow-400
  "#4ade80", // green-400
  "#34d399", // emerald-400
  "#22d3ee", // cyan-400
  "#60a5fa", // blue-400
  "#818cf8", // indigo-400
  "#c084fc", // purple-400
  "#f472b6", // pink-400
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getUserColor(userId: string): string {
  return PALETTE[hashString(userId) % PALETTE.length];
}
```

---

## 6 · `apps/web/components/editor/usePresence.ts`  *(NEW FILE)*

Create `apps/web/components/editor/` directory first (it doesn't exist yet), then add:

```ts
"use client";

import { useEffect, useState } from "react";
import type { WebsocketProvider } from "y-websocket";
import type { PresenceUser } from "@collab-editor/shared-types";
import { getUserColor } from "@/lib/userColor";

interface AwarenessState {
  user?: {
    userId: string;
    username: string;
  };
}

/**
 * Reads the Yjs awareness map and returns a live list of all *other*
 * users currently connected to the same document.
 */
export function usePresence(
  provider: WebsocketProvider | null,
): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!provider) {
      setUsers([]);
      return;
    }

    const awareness = provider.awareness;

    function buildUserList(): PresenceUser[] {
      const result: PresenceUser[] = [];
      const localClientId = awareness.clientID;

      awareness.getStates().forEach((state: AwarenessState, clientId) => {
        if (clientId === localClientId) return; // skip self
        const u = state.user;
        if (u?.userId && u.username) {
          result.push({
            id: u.userId,
            username: u.username,
            color: getUserColor(u.userId),
          });
        }
      });

      return result;
    }

    function handleChange() {
      setUsers(buildUserList());
    }

    awareness.on("change", handleChange);
    // Populate immediately in case peers are already present
    setUsers(buildUserList());

    return () => {
      awareness.off("change", handleChange);
    };
  }, [provider]);

  return users;
}
```

---

## 7 · `apps/web/components/editor/PresenceAvatars.tsx`  *(NEW FILE)*

```tsx
"use client";

import type { PresenceUser } from "@collab-editor/shared-types";

interface PresenceAvatarsProps {
  users: PresenceUser[];
}

const MAX_VISIBLE = 5;

function initials(username: string): string {
  return username
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export function PresenceAvatars({ users }: PresenceAvatarsProps) {
  if (users.length === 0) return null;

  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - MAX_VISIBLE;

  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`${users.length} user${users.length === 1 ? "" : "s"} in document`}
    >
      {visible.map((user) => (
        <div
          key={user.id}
          title={user.username}
          aria-label={user.username}
          style={{
            backgroundColor: user.color,
            animationName: "presenceFadeIn",
          }}
          className="
            flex h-7 w-7 items-center justify-center rounded-full
            text-[11px] font-bold text-white ring-2 ring-white
            animate-[presenceFadeIn_0.25s_ease-out]
            cursor-default select-none
          "
        >
          {initials(user.username)}
        </div>
      ))}

      {overflow > 0 && (
        <div
          title={`${overflow} more user${overflow === 1 ? "" : "s"}`}
          className="
            flex h-7 w-7 items-center justify-center rounded-full
            bg-gray-300 text-[11px] font-bold text-gray-700
            ring-2 ring-white cursor-default select-none
          "
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
```

Add the keyframe animation to `apps/web/app/globals.css` (append at the bottom):

```css
/* Phase 8 — Presence avatar entrance animation */
@keyframes presenceFadeIn {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

---

## 8 · `apps/web/components/components/Editor.tsx`

**Action:** Replace the entire file.

Key changes:
- Add `username` prop.
- Listen on the raw WebSocket for the `user-identity` JSON frame and use it
  to `setLocalStateField("user", ...)` on the awareness object.
- Call `usePresence(provider)` and render `<PresenceAvatars />`.

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Toolbar } from "./Toolbar";
import { PresenceAvatars } from "@/components/editor/PresenceAvatars";
import { usePresence } from "@/components/editor/usePresence";

interface EditorProps {
  documentId: string;
  username: string; // ← Phase 8: passed from the server page
  readOnly?: boolean;
}

export function Editor({ documentId, username, readOnly = false }: EditorProps) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);

  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [isSynced, setIsSynced] = useState(false);

  // Stable ref so the identity-frame handler always sees the latest username
  const usernameRef = useRef(username);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    let cancelled = false;
    let wsProvider: WebsocketProvider | null = null;

    async function connect() {
      const tokenResponse = await fetch("/api/realtime-token");
      if (!tokenResponse.ok) {
        throw new Error("Failed to obtain a realtime connection token");
      }

      const { token } = (await tokenResponse.json()) as { token: string };

      const wsUrl = process.env.NEXT_PUBLIC_REALTIME_WS_URL;
      if (!wsUrl) {
        throw new Error("NEXT_PUBLIC_REALTIME_WS_URL is not configured");
      }

      wsProvider = new WebsocketProvider(wsUrl, documentId, ydoc, {
        params: { token },
      });

      wsProvider.on("status", ({ status }: { status: "connecting" | "connected" | "disconnected" }) => {
        setConnectionStatus(status);
      });

      wsProvider.on("sync", (synced: boolean) => {
        setIsSynced(synced);
      });

      // ── Phase 8: listen for the user-identity JSON frame ─────────────────
      // The server sends { type: "user-identity", userId, username } once,
      // immediately after the Yjs step-1 sync frame. We use that to set our
      // own awareness state so every peer can see us in their presence list.
      const ws = wsProvider.ws;
      if (ws) {
        const identityHandler = (event: MessageEvent) => {
          // Binary frames are Yjs — skip them
          if (typeof event.data !== "string") return;

          try {
            const msg = JSON.parse(event.data) as {
              type?: string;
              userId?: string;
              username?: string;
            };
            if (msg.type === "user-identity" && msg.userId) {
              wsProvider?.awareness.setLocalStateField("user", {
                userId: msg.userId,
                username: msg.username ?? usernameRef.current,
              });
              // We only need this once — clean up
              ws.removeEventListener("message", identityHandler);
            }
          } catch {
            // Not JSON — ignore
          }
        };
        ws.addEventListener("message", identityHandler);
      }
      // ─────────────────────────────────────────────────────────────────────

      if (!cancelled) {
        setProvider(wsProvider);
      }
    }

    connect().catch((err) => {
      console.error("[editor] websocket connection failed", err);
      setConnectionStatus("disconnected");
    });

    return () => {
      cancelled = true;
      wsProvider?.destroy();
      ydoc.destroy();
      setProvider(null);
    };
  }, [documentId, ydoc]);

  // Token refresh
  useEffect(() => {
    if (!provider) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const tokenResponse = await fetch("/api/realtime-token");
        if (!tokenResponse.ok) {
          return;
        }

        const { token } = (await tokenResponse.json()) as { token: string };
        provider.params = { token };
      } catch (err) {
        console.error("[editor] token refresh failed", err);
      }
    }, 45_000);

    return () => clearInterval(interval);
  }, [provider]);

  // Phase 8: read live presence from awareness
  const presenceUsers = usePresence(provider);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !readOnly,
      extensions: [
        StarterKit.configure({
          history: false,
          link: {
            openOnClick: false,
            autolink: true,
          },
          underline: {},
        }),
        Collaboration.configure({
          document: ydoc,
        }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      editorProps: {
        attributes: {
          class: "tiptap-content focus:outline-none min-h-[60vh] px-8 py-6",
        },
      },
    },
    [ydoc, readOnly],
  );

  const statusLabel =
    connectionStatus === "connected" && isSynced
      ? "Synced"
      : connectionStatus === "connected"
        ? "Syncing…"
        : connectionStatus === "connecting"
          ? "Connecting…"
          : "Disconnected";

  return (
    <div className="rounded border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <span>{readOnly ? "View only" : "Collaborative editing"}</span>
          {/* Phase 8: Presence avatars */}
          <PresenceAvatars users={presenceUsers} />
        </div>
        <span>{statusLabel}</span>
      </div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

> [!IMPORTANT]
> `wsProvider.ws` may be `null` momentarily during connection setup in some versions
> of `y-websocket`. If you see a TypeScript error saying `.ws` doesn't exist on the
> type, you can cast: `const ws = (wsProvider as unknown as { ws: WebSocket | null }).ws`.

---

## 9 · `apps/web/app/documents/[id]/page.tsx`

**Action:** Replace the entire file — the only real change is passing `username` to `<Editor>`.

```tsx
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getUserRole } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { Editor } from "@/components/components/Editor";

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

// The permission check pattern here (getUserRole → 404 if none, not
// 403 — so an unauthorized caller can't even confirm the document
// exists) was established in Phase 4 and is reused as-is.
export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const role = await getUserRole(session.user.id, id);
  if (!role) {
    notFound();
  }

  const document = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: { title: true },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{document.title}</h1>
        <p className="text-sm text-gray-400">Your role: {role}</p>
      </div>

      <Editor
        documentId={id}
        username={session.user.name ?? "Unknown"}
        readOnly={role === "VIEWER"}
      />
    </div>
  );
}
```

---

## Implementation Order & Checklist

Apply these in order to avoid import errors:

- [ ] `packages/shared-types/src/index.ts` — add `PresenceUser` / `PresenceUpdateMessage`
- [ ] `apps/realtime-server/src/lib/userColor.ts` — create new file
- [ ] `apps/realtime-server/src/socket/server.ts` — pass `userId` + `username`
- [ ] `apps/realtime-server/src/yjs/docManager.ts` — update signature + send identity frame
- [ ] `apps/web/lib/userColor.ts` — create new file
- [ ] `apps/web/components/editor/usePresence.ts` — create new file
- [ ] `apps/web/components/editor/PresenceAvatars.tsx` — create new file
- [ ] `apps/web/app/globals.css` — append `@keyframes presenceFadeIn`
- [ ] `apps/web/components/components/Editor.tsx` — wire presence
- [ ] `apps/web/app/documents/[id]/page.tsx` — pass `username` prop

After applying all changes, run the type-checker in both apps:

```bash
cd apps/web && npx tsc --noEmit
cd apps/realtime-server && npx tsc --noEmit
```

Then run the Phase 8 manual tests from the checklist:
1. Open document in Tab A, open same document in Tab B → avatar appears in Tab A
2. Close Tab B → avatar disappears from Tab A
3. Refresh Tab B → avatar color is unchanged
4. Open Tab C as a 3rd seeded user → 3 avatars visible in every tab
