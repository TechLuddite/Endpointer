/**
 * Fixed-window per-IP rate limiting.
 *
 * The proxy, batch pinger and AI endpoints are all unauthenticated. Without a
 * limit, /api/ai-* lets anyone drain the operator's Gemini billing and
 * /api/ping-batch turns the host into a request amplifier.
 */

import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;

export function createRateLimiter(limitPerMinute: number) {
  const buckets = new Map<string, Bucket>();

  // Keep the map from growing without bound on a long-lived process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, WINDOW_MS);
  sweep.unref?.();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    if (limitPerMinute <= 0) return next();

    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > limitPerMinute) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: `Rate limit exceeded: ${limitPerMinute} requests/minute. Retry in ${retryAfter}s.`,
      });
      return;
    }

    next();
  };
}
