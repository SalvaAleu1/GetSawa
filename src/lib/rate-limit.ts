/**
 * Minimal in-process rate limiter keyed by (bucket, identifier). Suitable
 * for a single-instance deployment; for multi-instance production
 * deployments swap this for a Redis-backed limiter without changing the
 * call sites below.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(bucket: string, identifier: string, opts?: { windowMs?: number; max?: number }) {
  const windowMs = opts?.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  const max = opts?.max ?? Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60);

  const key = `${bucket}:${identifier}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, remaining: max - entry.count };
}

export function getClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
