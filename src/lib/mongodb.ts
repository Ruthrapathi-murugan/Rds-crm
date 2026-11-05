import "server-only";
import mongoose from "mongoose";
import { getServerEnv } from "./env";

/**
 * Reuses one Mongoose connection per server instance. In serverless
 * deployments (Vercel) a warm function keeps the cached connection between
 * invocations; in development the cache survives hot reloads.
 */
type ConnectionCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  __rdsMongoose?: ConnectionCache;
};

const cache = (globalForMongoose.__rdsMongoose ??= { conn: null, promise: null });

mongoose.set("strictQuery", true);

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  cache.promise ??= mongoose
    .connect(getServerEnv().MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
      appName: "rds-crm",
    })
    .catch((error: unknown) => {
      cache.promise = null;
      throw error;
    });

  cache.conn = await cache.promise;
  return cache.conn;
}

/**
 * Runs `fn` inside a MongoDB transaction. Used for every multi-document
 * financial write (payments, invoice balances, lead conversion) so partial
 * updates can never be committed. Requires a replica set (Atlas provides one).
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
