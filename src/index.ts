import { createApp } from "./server.js";

const PORT = parseInt(process.env.PORT || "3457", 10);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[claude-bridge] listening on port ${PORT}`);
  console.log(`[claude-bridge] POST /chat  |  GET /health`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n[claude-bridge] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log("[claude-bridge] HTTP server closed");
    process.exit(0);
  });

  // Force exit after 5s
  setTimeout(() => {
    console.error("[claude-bridge] Forced shutdown after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
