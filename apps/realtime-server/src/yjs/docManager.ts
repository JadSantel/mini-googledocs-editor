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

  // ── 2. Identity frame (JSON)  ───────────────────────────────────
  sendIdentity(conn, userId, username);

  console.log(
    `[yjs] connected document=${documentId} user=${userId} clients=${doc.conns.size}`,
  );
}