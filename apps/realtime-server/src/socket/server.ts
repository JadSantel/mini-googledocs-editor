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

    if (documentId) {
      void (async () => {
        const role = await getUserRole(userId, documentId);
        if (!role) {
          ws.close(4403, "Forbidden");
          return;
        }


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