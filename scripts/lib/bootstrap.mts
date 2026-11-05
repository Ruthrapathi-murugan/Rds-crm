/**
 * Shared setup for command-line scripts: loads .env.local (or the file in
 * ENV_FILE) and connects to MongoDB using the app's own connection code.
 *
 * Scripts run with `tsx --conditions=react-server` so app modules that
 * import "server-only" load outside Next.js.
 */
import { existsSync } from "node:fs";
import path from "node:path";

export async function bootstrap() {
  const envFile = path.resolve(process.env.ENV_FILE ?? ".env.local");
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  } else if (!process.env.MONGODB_URI) {
    fail(`No ${path.basename(envFile)} found and MONGODB_URI is not set. Copy .env.example to .env.local first.`);
  }
  const { connectToDatabase } = await import("../../src/lib/mongodb.ts");
  const mongoose = await connectToDatabase();
  return { mongoose };
}

export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) args[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[key] = argv[++i];
    else args[key] = true;
  }
  return args;
}
