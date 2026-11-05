import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, inject } from "vitest";

/**
 * Per test file: point the app at its own database on the shared in-memory
 * replica set, so files can run in parallel without seeing each other's data.
 */
const baseUri = inject("mongoUri");
const dbName = `rds_test_${randomBytes(4).toString("hex")}`;

Object.assign(process.env, {
  MONGODB_URI: baseUri.replace(/\/(\?|$)/, `/${dbName}$1`),
  AUTH_SECRET: "test-secret-".padEnd(48, "x"),
  APP_URL: "http://localhost:3000",
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  (globalThis as { __rdsMongoose?: unknown }).__rdsMongoose = undefined;
});
