"use client";

import type { ClientMessage, ServerMessage } from "@collab-editor/shared-types";

export async function connectToRealtimeServer(): Promise<WebSocket> {
    const tokenResponse = await fetch("/api/realtime-token");
    if (!tokenResponse.ok) {
        throw new Error("Failed to obtain a realtime connection token");
    }

    const { token } = (await tokenResponse.json()) as { token: string };

    const baseUrl = process.env.NEXT_PUBLIC_REALTIME_WS_URL;
    if (!baseUrl) {
        throw new Error("NEXT_PUBLIC_REALTIME_WS_URL is not configured");
    }

    return new WebSocket(`${baseUrl}?token=${encodeURIComponent(token)}`);
}

export function sendMessage(ws: WebSocket, message: ClientMessage): void {
    ws.send(JSON.stringify(message));
}

export function onServerMessage(ws: WebSocket, handler: (message: ServerMessage) => void): () => void {
    const listener =(event: MessageEvent) => {
        handler(JSON.parse(event.data) as ServerMessage);
    };
    ws.addEventListener("message", listener);
    return () => ws.removeEventListener("message", listener);
}