import { connection } from "next/server";

/**
 * Liveness check for uptime monitoring and deployment verification.
 * Reports only non-sensitive status; database health is added once the
 * MongoDB connection layer exists.
 */
export async function GET() {
  await connection(); // always evaluate at request time, never prerender

  return Response.json(
    { status: "ok", service: "rds-crm", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
