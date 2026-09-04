/**
 * In-process rate limiter used as a safe single-instance fallback.
 * It is deliberately small and self-cleaning. For horizontally scaled
 * production deployments, replace the storage layer with Redis/Upstash while
 * keeping this function's return contract unchanged.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = 0;

function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
}

export function checkRateLimit(bucket: string, identifier: string, opts?: { windowMs?: number; max?: number }) {
  const windowMs = Math.max(1_000, opts?.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000));
  const max = Math.max(1, opts?.max ?? Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60));
  const now = Date.now();
  cleanup(now);
  const key = `${bucket}:${identifier}`;
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, max - 1), resetAt: now + windowMs };
  }
  if (entry.count >= max) return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now, resetAt: entry.resetAt };
  entry.count += 1;
  return { allowed: true, remaining: Math.max(0, max - entry.count), resetAt: entry.resetAt };
}

export function getClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
