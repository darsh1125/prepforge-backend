import { connectDb, disconnectDb } from "./config/db.js";
import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`PrepForge API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Failed to start server";
  console.error(message);
  process.exit(1);
});
