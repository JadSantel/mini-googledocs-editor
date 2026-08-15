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
            console.log(`[yjs] hydrated document=${documentId} from snapshot`)
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
            
        }
    }
}