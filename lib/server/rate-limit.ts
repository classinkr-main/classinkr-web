/**
 * 간단한 메모리 기반 IP rate limiter.
 * Vercel serverless 환경에서는 인스턴스별로 독립적이므로
 * 엄격한 제한이 아닌 기본적인 스팸 방지 용도로 사용.
 * 프로덕션에서 더 강력한 제한이 필요하다면 Upstash Redis를 사용할 것
 * (checkRateLimitDistributed 참고 — env 설정 시 분산 제한 활성화).
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

/**
 * 분산 rate limiter (Upstash Redis REST). 동기 checkRateLimit 와 동일한 형태를 반환하되,
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 가 모두 설정된 경우에만 Redis 를 사용한다.
 * 이렇게 하면 serverless 인스턴스 간에 카운트가 공유되어 effective limit = max × instanceCount 문제가 사라진다.
 * env 가 없거나 Redis 호출이 실패하면 메모리 기반 checkRateLimit 로 폴백한다(fail-open).
 *
 * 기존 호출부(~15곳)는 동기 checkRateLimit 를 그대로 사용하므로 시그니처를 바꾸지 않는다.
 */
export async function checkRateLimitDistributed(
  ip: string,
  key: string,
  options: RateLimitOptions
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  // env 가 없으면 분산 모드를 쓰지 않고 즉시 메모리 폴백.
  if (!url || !token) {
    return checkRateLimit(ip, key, options)
  }

  const storeKey = `${key}:${ip}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)

  try {
    // 원자적 INCR + (첫 요청일 때만) PEXPIRE 를 pipeline 으로 처리.
    // INCR 가 1 을 반환하면 새 창이므로 windowMs 만큼 TTL 을 설정한다.
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", storeKey],
        ["PEXPIRE", storeKey, String(options.windowMs), "NX"],
        ["PTTL", storeKey],
      ]),
      signal: controller.signal,
    })

    if (!res.ok) {
      return checkRateLimit(ip, key, options)
    }

    const data = (await res.json()) as Array<{ result?: number; error?: string }>
    const count = data?.[0]?.result
    const pttl = data?.[2]?.result

    if (typeof count !== "number" || data?.[0]?.error) {
      return checkRateLimit(ip, key, options)
    }

    // PTTL 이 음수면(만료 정보 없음) windowMs 기준으로 resetAt 을 추정.
    const ttlMs = typeof pttl === "number" && pttl > 0 ? pttl : options.windowMs
    const resetAt = Date.now() + ttlMs

    if (count > options.max) {
      return { allowed: false, remaining: 0, resetAt }
    }

    return { allowed: true, remaining: Math.max(0, options.max - count), resetAt }
  } catch {
    // 타임아웃/네트워크 오류 등 모든 예외에서 메모리 폴백(fail-open). 민감 정보는 로깅하지 않는다.
    return checkRateLimit(ip, key, options)
  } finally {
    clearTimeout(timeout)
  }
}

export function getClientIp(req: Request): string {
  const headers = req.headers as Headers
  // Vercel 프록시가 직접 설정하는 신뢰 가능한 헤더를 우선한다.
  // x-forwarded-for 는 클라이언트가 임의로 조작/추가할 수 있어 단독으로 신뢰하면 안 된다.
  // (Vercel 은 클라이언트가 보낸 x-forwarded-for 뒤에 값을 덧붙이므로, 신뢰 헤더가 항상 우선되어 스푸핑을 막는다.)
  const vercelForwarded = headers.get("x-vercel-forwarded-for")
  if (vercelForwarded) return vercelForwarded.split(",")[0].trim()

  const realIp = headers.get("x-real-ip")
  if (realIp) return realIp.split(",")[0].trim()

  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()

  return "unknown"
}
