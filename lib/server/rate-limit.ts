/**
 * 간단한 메모리 기반 IP rate limiter.
 * Vercel serverless 환경에서는 인스턴스별로 독립적이므로
 * 엄격한 제한이 아닌 기본적인 스팸 방지 용도로 사용.
 * 프로덕션에서 더 강력한 제한이 필요하다면 Upstash Redis를 사용할 것
 * (checkRateLimitDistributed 참고 — env 설정 시 분산 제한 활성화).
 */

import { readUpstashRestConfig } from "./upstash"

interface RateLimitEntry {
  count: number
  resetAt: number
  /** 이 창의 한도 — 상한에서 버릴 키를 고를 때 막혀 있는 키를 남기려고 둔다 */
  max: number
}

const store = new Map<string, RateLimitEntry>()

/**
 * 메모리 저장소 키 수 상한 — 키 하나는 약 250B 라 약 12MB. 넘치면 만료 키를 먼저 쓸고, 그래도 넘치면 한도에 닿지 않은
 * 오래된 키부터 버린다(그 키의 카운트가 처음부터 다시 셀 뿐이다). 한도에 닿아 막혀 있는 키는 마지막까지 남긴다 — 버리면 막힘이 풀린다.
 */
export const RATE_LIMIT_MAX_KEYS = 50_000
/** 만료된 키를 쓸어 내는 간격 — 호출마다 전체를 훑지 않는다. */
const SWEEP_INTERVAL_MS = 10_000
let lastSweepAt = 0

function sweepAll(now: number) {
  lastSweepAt = now
  for (const [k, e] of store) if (now > e.resetAt) store.delete(k)
}

function sweepExpired(now: number) {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  sweepAll(now)
}

/**
 * 상한에 닿으면: 만료 키를 바로 쓸고(쓸기 간격을 기다리지 않는다), 그래도 넘치면 10% 를 한 번에 버린다 — 하나씩 버리면 Map 의
 * 앞쪽 빈 칸을 매번 건너뛰느라 느려진다. Map 순서는 창이 시작된 순서다(창이 새로 시작하면 맨 뒤로 옮긴다, checkRateLimit).
 * 한도에 닿지 않은 키를 먼저 버리고, 모자랄 때만 막혀 있는 키를 오래된 순으로 버린다.
 */
function evictOverflow(now: number) {
  if (store.size < RATE_LIMIT_MAX_KEYS) return
  sweepAll(now)
  if (store.size < RATE_LIMIT_MAX_KEYS) return
  let drop = Math.ceil(RATE_LIMIT_MAX_KEYS / 10)
  for (const [k, e] of store) {
    if (e.count >= e.max) continue
    store.delete(k)
    if (--drop <= 0) return
  }
  for (const k of store.keys()) {
    store.delete(k)
    if (--drop <= 0) return
  }
}

/** 시험 전용 */
export function resetRateLimitStoreForTest() {
  store.clear()
  lastSweepAt = 0
}
export function rateLimitStoreSizeForTest() {
  return store.size
}

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
  sweepExpired(now)
  const entry = store.get(storeKey)

  if (!entry || now > entry.resetAt) {
    const resetAt = now + options.windowMs
    // 창이 새로 시작한 키는 지웠다 다시 넣어 Map 맨 뒤로 보낸다 — 처음 들어온 순서로 남으면 상한에서 살아 있는 키가 먼저 버려진다
    if (entry) store.delete(storeKey)
    else evictOverflow(now)
    store.set(storeKey, { count: 1, resetAt, max: options.max })
    return { allowed: true, remaining: options.max - 1, resetAt }
  }

  if (entry.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: options.max - entry.count, resetAt: entry.resetAt }
}

/**
 * Upstash 호출 시간 제한 — 넘으면 인스턴스 메모리 카운트로 폴백한다(공유되지 않아 한도가 인스턴스 수만큼 약해진다).
 * 0.5초로 줄였다가 1.5초로 되돌렸다: 서버리스 첫 연결(DNS·TLS)이 0.5초를 넘기 쉬워, 관리자 로그인 등 모든 분산 한도가
 * 그때마다 약해졌다. Upstash 가 느린 장애 때만 요청 앞에 최대 1.5초가 붙는다. 시험: tests/server/rate-limit-store.test.ts.
 */
const UPSTASH_TIMEOUT_MS = 1500

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
  // env 가 없으면 분산 모드를 쓰지 않고 즉시 메모리 폴백.
  const config = readUpstashRestConfig()
  if (!config) {
    return checkRateLimit(ip, key, options)
  }
  const { url, token } = config

  const storeKey = `${key}:${ip}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS)

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
