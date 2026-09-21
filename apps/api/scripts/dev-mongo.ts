import { MongoMemoryServer } from "mongodb-memory-server";

const server = await MongoMemoryServer.create({
  instance: { dbName: "prepkit", port: Number.parseInt(process.env.DEV_MONGO_PORT ?? "27017", 10) },
});

process.stdout.write(`${server.getUri("prepkit")}\n`);
process.stdout.write("ephemeral mongodb running, data is discarded when this exits\n");

const stop = async () => {
  await server.stop();
  process.exit(0);
};

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
