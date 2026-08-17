"use client";

import type { PresenceUser } from "@collab-editor/shared-types";

interface PresenceAvatarProps {
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

export function PresenceAvatarProps({ users }: PresenceAvatarProps) {
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