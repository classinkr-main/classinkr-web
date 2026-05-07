/**
 * 간단한 메모리 기반 IP rate limiter.
 * Vercel serverless 환경에서는 인스턴스별로 독립적이므로
 * 엄격한 제한이 아닌 기본적인 스팸 방지 용도로 사용.
 * 프로덕션에서 더 강력한 제한이 필요하다면 Upstash Redis를 사용할 것.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

interface RateLimitOptions {
  /** 제한 시간 창 (밀리초) */
  windowMs: number
  /** 창 내 최대 요청 수 */
  max: number
}

export function checkRateLimit(
  ip: string,
  key: string,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const storeKey = `${key}:${ip}`
  const entry = store.get(storeKey)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + options.windowMs
    store.set(storeKey, { count: 1, resetAt })
    return { allowed: true, remaining: options.max - 1, resetAt }
  }

  if (entry.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: options.max - entry.count, resetAt: entry.resetAt }
}

export function getClientIp(req: Request): string {
  const forwarded = (req.headers as Headers).get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return "unknown"
}
