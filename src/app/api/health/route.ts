import { db } from "@/lib/db";
import { ok } from "@/lib/api/response";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness + database reachability, for uptime checks and deploy gates. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return ok({ status: "ok", database: "reachable", time: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Database unreachable." } },
      { status: 503 },
    );
  }
}
