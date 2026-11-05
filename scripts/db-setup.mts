/**
 * Prepares a database: builds every index and seeds the default company
 * settings and RDS service catalogue. Safe to run repeatedly — existing
 * settings and services are never overwritten.
 *
 *   npm run db:setup
 */
import { bootstrap } from "./lib/bootstrap.mts";

const { mongoose } = await bootstrap();
const models = await import("../src/models/index.ts");
const { SERVICE_CATALOGUE, slugify } = await import("../src/lib/service-catalogue.ts");
const { DEFAULT_SETTINGS } = await import("../src/services/settings.service.ts");

console.log("Building indexes…");
for (const [name, model] of Object.entries(models)) {
  await model.syncIndexes();
  console.log(`  ✓ ${name.replace(/Model$/, "")}`);
}

const settings = await models.CompanySettingsModel.updateOne(
  { key: "default" },
  { $setOnInsert: { key: "default", ...DEFAULT_SETTINGS } },
  { upsert: true },
);
console.log(settings.upsertedCount ? "✓ Created default company settings" : "• Company settings already exist");

let created = 0;
for (const [index, service] of SERVICE_CATALOGUE.entries()) {
  const result = await models.ServiceModel.updateOne(
    { slug: slugify(service.name) },
    { $setOnInsert: { ...service, slug: slugify(service.name), basePricePaise: 0, isActive: true, sortOrder: index } },
    { upsert: true },
  );
  created += result.upsertedCount;
}
console.log(`✓ Service catalogue: ${created} added, ${SERVICE_CATALOGUE.length - created} already present`);

await mongoose.disconnect();
console.log("\nDatabase is ready. Next: npm run create-admin -- --email you@example.com --name \"Your Name\"\n");
