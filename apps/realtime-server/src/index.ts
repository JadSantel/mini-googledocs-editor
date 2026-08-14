import { createSocketServer } from "./socket/server.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

function main() {
  const server = createSocketServer();
  server.listen(PORT, () => {
    console.log(`[realtime-server] listening on port ${PORT}`);
  });
}

main();
