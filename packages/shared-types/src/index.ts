/**
 * Shared type definitions used by BOTH apps/web and apps/realtime-server.
 *
 * Why this package exists:
 * The Next.js app and the realtime server communicate over WebSocket
 * messages. If each app defined its own copy of "what a message looks
 * like," they could silently drift out of sync (e.g. web sends
 * `{ type: "cursor-update" }` but the server expects `{ type: "cursorUpdate" }`).
 * A single shared source of truth eliminates that class of bug at
 * compile time instead of at runtime.
 *
 * This file is intentionally empty of real content in Phase 1 —
 * concrete message shapes (WebSocketEvent, PresenceState, etc.) are
 * added in Phase 6 when we design the WebSocket protocol.
 */

export type Placeholder = never;
