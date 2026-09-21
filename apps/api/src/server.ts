import { createApp } from "./app.ts";
import { loadEnv } from "./config/env.ts";
import { connectDatabase, disconnectDatabase } from "./db/connection.ts";
import { GenerationQueue, releaseInterruptedKits } from "./jobs/generation-queue.ts";

const env = loadEnv();

await connectDatabase(env.MONGODB_URI);
const released = await releaseInterruptedKits();
if (released > 0) {
  process.stdout.write(`marked ${released} interrupted kit(s) as failed after restart\n`);
}

const queue = new GenerationQueue({ concurrency: env.GENERATION_CONCURRENCY });
const server = createApp({ env, queue }).listen(env.PORT, () => {
  process.stdout.write(`api listening on http://localhost:${env.PORT} (${env.NODE_ENV})\n`);
});

const shutdown = async (signal: string) => {
  process.stdout.write(`\n${signal} received, shutting down\n`);
  await queue.shutdown();
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
