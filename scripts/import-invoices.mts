/**
 * Imports invoices made outside the CRM (old PDFs) from a JSON file, creating
 * a won lead and a customer for each, then issuing the invoice under its
 * original number. Safe to re-run: anything already imported is skipped.
 *
 *   npm run import-invoices -- --email you@example.com [--file imports/invoices.json] [--dry-run]
 *
 * Point it at the live database with ENV_FILE (PowerShell):
 *   $env:ENV_FILE=".env.atlas"; npm run import-invoices -- --email you@example.com
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { bootstrap, fail, parseArgs } from "./lib/bootstrap.mts";

const args = parseArgs();
const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
const file = path.resolve(typeof args.file === "string" ? args.file : "imports/invoices.json");
const dryRun = Boolean(args["dry-run"]);
if (!email) fail("Usage: npm run import-invoices -- --email you@example.com [--file imports/invoices.json] [--dry-run]");

let data: unknown;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  fail(`Could not read ${file}: ${(error as Error).message}`);
}

const { mongoose } = await bootstrap();
const { UserModel } = await import("../src/models/user.ts");
const { permissionsFor } = await import("../src/lib/permissions.ts");
const { importInvoices } = await import("../src/services/invoice-import.service.ts");

const account = await UserModel.findOne({ email, isActive: true }).lean();
if (!account) {
  await mongoose.disconnect();
  fail(`No active user with the email ${email} in this database.`);
}

const user = {
  id: account._id.toString(),
  name: account.name,
  email: account.email,
  role: account.role,
  permissions: permissionsFor(account.role),
  mustChangePassword: false,
};

console.log(`\nDatabase: ${mongoose.connection.name}${dryRun ? "   (dry run — nothing is saved)" : ""}\n`);
try {
  const report = await importInvoices(user, data, { dryRun });
  for (const line of report) console.log(`  • ${line}`);
  console.log(`\n✓ ${dryRun ? "Dry run finished. Run again without --dry-run to save." : "Import finished."}\n`);
} catch (error) {
  console.error(`\n✖ ${(error as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
