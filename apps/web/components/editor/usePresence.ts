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

        function buildUserlist(): PresenceUser[] {
            const result: PresenceUser[] = [];
            const localClientId = awareness.clientID;

            awareness.getStates().forEach((state: AwarenessState, clientID) => {
                if (clientID == localClientId) return;
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

        function handleChange(){
            setUsers(buildUserlist());
        }

        awareness.on("change", handleChange);
        setUsers(buildUserlist());

        return () => {
            awareness.off("change", handleChange);
        };
    }, [provider]);

    return users;
}