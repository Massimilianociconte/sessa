import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeInternalJob(request: Request): boolean {
  const expected = process.env.MAINTENANCE_SECRET?.trim() ?? "";
  if (expected.length < 32) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const provided = bearer || request.headers.get("x-maintenance-secret")?.trim() || "";
  return Boolean(provided && safeEqual(provided, expected));
}
