import mongoose from "mongoose";

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDatabase(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) {
    mongoose.set("strictQuery", true);
    connecting = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10,
    });
  }
  await connecting;
}

export async function disconnectDatabase(): Promise<void> {
  connecting = null;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
