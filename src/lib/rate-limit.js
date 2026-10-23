/**
 * A tiny per-instance rate limiter.
 *
 * Honest limitation: serverless runs many instances, so this bounds abuse per
 * instance, not globally. It still stops a single client from hammering one
 * warm function, which is the realistic failure mode (a script pointed at
 * /api/resolve or a download loop).
 *
 * No dependency, no timers: a Map of counters with a sliding window, pruned on
 * write so a long-lived instance cannot grow without bound.
 */

const buckets = new Map()

/** Drop expired buckets once the map gets big. */
function prune(now, windowMs) {
  if (buckets.size < 500) return
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > windowMs) buckets.delete(key)
  }
}

/**
 * @param {string} key        usually `${ip}:${route}`
 * @param {{limit?: number, windowMs?: number, now?: number}} [options]
 * @returns {{allowed: boolean, remaining: number, retryAfterSeconds: number}}
 */
export function rateLimit(key, { limit = 20, windowMs = 60_000, now = Date.now() } = {}) {
  prune(now, windowMs)

  const bucket = buckets.get(key)
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  bucket.count += 1
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000))
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 }
}

/** Test seam. */
export function _resetRateLimit() {
  buckets.clear()
}

/**
 * Where a redirect may point.
 *
 * The proxy follows redirects, and a media CDN that answers 302 to
 * `http://169.254.169.254/` would turn the proxy into an SSRF gadget. Every hop
 * must stay on the same allowlist, and never on a private address.
 */
export function redirectIsSafe(finalUrl, { allowlist, isPrivate, isAllowed }) {
  if (!finalUrl) return false
  let parsed
  try {
    parsed = new URL(finalUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  if (isPrivate(parsed.hostname)) return false
  return isAllowed(parsed.hostname, allowlist)
}
