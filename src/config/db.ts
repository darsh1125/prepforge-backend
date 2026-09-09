import mongoose from "mongoose";
import { loadEnv } from "./env.js";

let connecting: Promise<typeof mongoose> | undefined;

export async function connectDb(): Promise<void> {
  const env = loadEnv();
  if (!env.MONGODB_URI) {
    console.warn(
      "[db] MONGODB_URI is not set. Persistence is disabled until it is configured.",
    );
    return;
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!connecting) {
    connecting = mongoose.connect(env.MONGODB_URI);
  }

  try {
    await connecting;
  } catch (error) {
    connecting = undefined;
    const message = error instanceof Error ? error.message : "Unknown connection error";
    throw new Error(`MongoDB connection failed: ${message}`);
  }
}

export async function disconnectDb(): Promise<void> {
  connecting = undefined;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
