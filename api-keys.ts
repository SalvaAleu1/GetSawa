import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `gs_live_${crypto.randomBytes(24).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash, prefix: raw.slice(0, 12) };
}

export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Authenticates a request against the Developer API (spec section 64).
 * Accepts `Authorization: Bearer gs_live_...`. Enforces per-client rate
 * limits (ApiClient.rateLimit) separately from the general IP-based limits
 * used elsewhere, and checks the requested scope is granted to the key.
 */
export async function requireApiKey(req: NextRequest, scope: string) {
  const authHeader = req.headers.get("authorization") || "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!raw) throw new ApiAuthError("Missing API key. Send it as `Authorization: Bearer <key>`.");

  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const client = await prisma.apiClient.findUnique({ where: { keyHash: hash } });

  if (!client || !client.isActive) throw new ApiAuthError("Invalid or revoked API key.");
  if (!client.scopes.includes(scope)) throw new ApiAuthError(`This API key does not have the "${scope}" scope.`, 403);

  const rl = checkRateLimit(`api-client:${client.id}`, "requests", { max: client.rateLimit, windowMs: 60_000 });
  if (!rl.allowed) throw new ApiAuthError("Rate limit exceeded for this API key.", 429);

  prisma.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return client;
}
