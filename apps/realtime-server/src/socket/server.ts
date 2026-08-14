import { createServer, type Server, type IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket, type RawData } from "ws";
import { verifySocketToken } from "../lib/auth.js";
import { joinRoom, leaveCurrentRoom, getCurrentDocument } from "./rooms.js";
import type { ClientMessage, ServerMessage } from "@collab-editor/shared-types";

interface AuthenticatedRequest extends IncomingMessage {
  userId?: string;
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
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
    console.log(`[socket] connected user=${userId}`);

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
          console.log(`[socket] user=${userId} joined document=${message.documentId}`);
          break;
        }
        case "leave-document": {
          const currentDocument = getCurrentDocument(ws);
          leaveCurrentRoom(ws);
          console.log(`[socket] user=${userId} left document=${currentDocument ?? message.documentId}`);
          break;
        }
        default:
          send(ws, { type: "error", message: "Unknown message type" });
      }
    });

    ws.on("close", () => {
      const currentDocument = getCurrentDocument(ws);
      leaveCurrentRoom(ws);
      console.log(`[socket] disconnected user=${userId} (was in document=${currentDocument ?? "none"})`);
    });
  });

  return httpServer;
}
