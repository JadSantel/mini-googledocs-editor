"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Toolbar } from "./Toolbar";

interface EditorProps {
  documentId: string;
  readOnly?: boolean;
}

export function Editor({ documentId, readOnly = false }: EditorProps) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);

  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [isSynced, setIsSynced] = useState(false);

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

      wsProvider.on("status", ({ status }) => {
        setConnectionStatus(status);
      });

      wsProvider.on("sync", (synced) => {
        setIsSynced(synced);
      });

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

  // Refresh token before the 60s TTL expires (realtime-token route uses 60s)
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

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !readOnly,
      extensions: [
        StarterKit.configure({
          // REQUIRED when using Yjs — Yjs owns undo/redo
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
        <span>{readOnly ? "View only" : "Collaborative editing"}</span>
        <span>{statusLabel}</span>
      </div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}