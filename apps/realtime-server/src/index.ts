/**
 * Realtime server entrypoint.
 *
 * This is intentionally a minimal skeleton for Phase 1.
 * WebSocket connection handling, Yjs document sync, and Redis pub/sub
 * are added in Phases 6, 7, and 12 respectively — introduced with
 * full explanations at that point, not dumped in here now.
 */
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

function main() {
  console.log(`[realtime-server] skeleton starting on port ${PORT} (no server bound yet — Phase 6)`);
}

main();
