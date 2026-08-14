import type { WebSocket } from "ws";

const rooms = new Map<string, Set<WebSocket>>();
const socketDocument = new WeakMap<WebSocket, string>();

export function joinRoom(documentId: string, ws: WebSocket): void {
    leaveCurrentRoom(ws);

    let room = rooms.get(documentId);
    if (!room) {
        room = new Set();
        rooms.set(documentId, room);
    }
    room.add(ws);
    socketDocument.set(ws, documentId);
}

export function leaveCurrentRoom(ws: WebSocket): void {
    const documentId = socketDocument.get(ws);
    if (!documentId) {
        return;
    }

    const room = rooms.get(documentId);
    room?.delete(ws);
    if (room && room.size === 0) {
        rooms.delete(documentId);
    }
    socketDocument.delete(ws);
}

export function getCurrentDocument(ws: WebSocket): string | undefined{
    return socketDocument.get(ws);
}

export function getRoomSize(documentId: string): number {
    return rooms.get(documentId)?.size ?? 0;
}