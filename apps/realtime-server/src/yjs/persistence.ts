import * as Y from "yjs";
import { prisma } from "../lib/prisma.js";

const DEBOUNCE_MS = 30_000;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const dirtyDocs = new Set<string>();

export async function loadSnapshot(
  documentId: string,
): Promise<Uint8Array | null> {
  const row = await prisma.documentSnapshot.findFirst({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    select: { snapshot: true },
  });

  if (!row) {
    return null;
  }

  return new Uint8Array(row.snapshot);
}

export async function saveSnapshot(
  documentId: string,
  ydoc: Y.Doc,
): Promise<void> {
  const update = Y.encodeStateAsUpdate(ydoc);

  await prisma.documentSnapshot.create({
    data: {
      documentId,
      snapshot: Buffer.from(update),
    },
  });

  console.log(`[persistence] saved snapshot document=${documentId}`);
}

function scheduleSave(documentId: string, ydoc: Y.Doc): void {
  dirtyDocs.add(documentId);

  const existing = pendingTimers.get(documentId);
  if (existing) {
    clearTimeout(existing);
  }

  pendingTimers.set(
    documentId,
    setTimeout(() => {
      void flush(documentId, ydoc);
    }, DEBOUNCE_MS),
  );
}

export async function flush(documentId: string, ydoc: Y.Doc): Promise<void> {
  const timer = pendingTimers.get(documentId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(documentId);
  }

  if (!dirtyDocs.has(documentId)) {
    return;
  }

  dirtyDocs.delete(documentId);
  await saveSnapshot(documentId, ydoc);
}

export function bindPersistence(documentId: string, ydoc: Y.Doc): void {
  ydoc.on("update", () => {
    scheduleSave(documentId, ydoc);
  });
}

export async function flushOnClose(
  documentId: string,
  ydoc: Y.Doc,
): Promise<void> {
  dirtyDocs.add(documentId);
  await flush(documentId, ydoc);
}