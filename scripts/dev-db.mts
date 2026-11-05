/**
 * Local MongoDB for development without Atlas: a single-node replica set
 * (transactions work) that keeps its data in .data/mongo between runs.
 *
 *   npm run dev:db        # leave running in its own terminal
 *
 * Then set in .env.local:
 *   MONGODB_URI=mongodb://127.0.0.1:27017/rds_crm?replicaSet=rds-local
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const port = Number(process.env.DEV_DB_PORT ?? 27017);
const dbPath = path.resolve(".data/mongo");
mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: "rds-local", count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port, dbPath }],
});

console.log(`
✓ Local MongoDB running (data kept in .data/mongo)

  MONGODB_URI=mongodb://127.0.0.1:${port}/rds_crm?replicaSet=rds-local

Press Ctrl+C to stop.
`);

const stop = async () => {
  await replSet.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
