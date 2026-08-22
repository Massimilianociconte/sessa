import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("db-timeout")), 2500))
    ]);
    return NextResponse.json({
      ok: true,
      status: "ok",
      db: "up",
      latencyMs: Date.now() - started
    });
  } catch {
    return NextResponse.json(
      { ok: false, status: "degraded", db: "down", latencyMs: Date.now() - started },
      { status: 503 }
    );
  }
}
