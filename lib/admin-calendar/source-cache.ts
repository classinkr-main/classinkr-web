/**
 * source-cache.ts — 어드민 캘린더 외부 소스 공용 SWR 캐시 (2026-08-28)
 *
 * 왜: 캘린더 한 화면은 8개 소스를 Promise.all로 모은다. 소스마다 제각각인 인메모리 TTL만
 * 있던 시절엔 ①TTL이 지나는 순간 화면이 원천 왕복을 동기로 기다렸고(콜드 지연 = 가장 느린
 * 소스), ②소스별 마감이 없어 한 소스가 행이면 캘린더 전체가 행이었다.
 *
 * 규약(모든 어댑터가 이 규약 하나를 공유한다):
 *   - 신선(ttlMs 이내): 즉시 반환, 원천 호출 없음.
 *   - 스테일(ttlMs 경과 ~ staleMs 이내): 즉시 스테일 반환 + 백그라운드 1회 갱신.
 *     갱신 실패는 스테일 데이터를 지우지 않고 degraded만 올린다.
 *   - 콜드(캐시 없음 또는 staleMs 초과): 원천을 timeoutMs로 레이스. 마감 초과·실패면
 *     fallback(대개 빈 배열) + degraded=true. 다른 7개 소스는 그대로 뜬다.
 *   - 레이스에서 진 원천 호출은 취소하지 않는다 — 늦게라도 끝나면 캐시에 앉아 다음 요청이
 *     그 결과를 받는다. 원천 호출 자체의 하드 마감(AbortSignal·gaxios timeout)은 각 어댑터가
 *     따로 건다. 여기서 끊으면 "항상 조금 느린 소스"가 영원히 캐시에 못 앉는다.
 *   - 실패를 캐시에 굳히지 않는다. 실패는 데이터를 덮지 않고, 다음 요청이 다시 시도한다.
 *     (반복 실패가 확정된 소스의 재시도 억제는 어댑터의 네거티브 캐시 몫 — 예: 팀원 캘린더)
 *
 * 인메모리라 서버리스 인스턴스 단위다. 인스턴스를 넘겨 살아남아야 하는 소형 외부 페이로드는
 * 어댑터가 withPersistentSourceCache()로 한 겹 더 감싼다.
 *
 * 의도된 트레이드오프 — 이중 SWR의 신선도 지연(2026-08-28 교차리뷰):
 *   withPersistentSourceCache()를 쓰는 소스(노션·쇼룸·공휴일)는 SWR이 두 겹이다. 인메모리
 *   층이 TTL 만료로 백그라운드 갱신을 띄워도, next 데이터 캐시가 자기 revalidate 창 안이면
 *   그 층이 다시 "스테일 즉시 반환 + 내부 갱신"을 한다. 그래서 진짜 새 값은 그다음 주기에
 *   들어오고, 원천 신선도가 최대 TTL 한 주기만큼(공휴일은 약 2시간) 더 늦는다. 이 구간의
 *   ageMs·degraded도 실제 원천보다 낙관적으로 기록된다.
 *   고치지 않는 이유: 이 캐시의 목적은 "화면이 원천 왕복을 기다리지 않는 것"이고, 대상 소스는
 *   전부 하루 단위로도 잘 안 바뀌는 일정 데이터다(공휴일·노션 캘린더·쇼룸 예약). 지연 없는
 *   응답을 한 주기 빠른 신선도보다 앞에 둔다. 실시간성이 필요한 소스가 생기면 그 소스만
 *   persistent 층을 빼면 된다 — 인메모리 층만으로 위 규약은 그대로 성립한다.
 */
import { createHash } from "node:crypto"

import { unstable_cache } from "next/cache"
import { after } from "next/server"

export interface SourceCacheStats {
  /** 이번 반환값이 "방금 확인된 최신"이 아님 — 콜드 실패·마감 초과·직전 갱신 실패 */
  degraded: boolean
  /** 반환한 데이터가 만들어진 뒤 흐른 시간(ms). 콜드 성공은 0 */
  ageMs: number
  /** 마지막으로 실측한 원천 소요시간(ms) — 관측용 */
  durationMs: number
}

export interface SwrSourceResult<T> extends SourceCacheStats {
  data: T
}

export interface SwrSourceOptions<T> {
  /** 캐시 키. 월 단위 소스는 `notion:2026-08`처럼 소스 접두사를 붙인다 */
  key: string
  /** 이 시간까지는 원천을 부르지 않는다 */
  ttlMs: number
  /** 이 시간까지는 스테일을 내주고 뒤에서 갱신한다. 넘으면 콜드 취급 */
  staleMs: number
  /** 콜드 경로의 응답 마감 */
  timeoutMs: number
  /** 콜드 실패 시 돌려줄 값 */
  fallback: T
  /** 관측 라벨(대개 EventSource). readSourceCacheStats로 마지막 상태를 읽는다 */
  label?: string
  fetcher: () => Promise<T>
  /**
   * 응답을 보낸 뒤에도 이 갱신이 끝까지 달리도록 런타임에 위탁한다.
   * 기본값은 next/server의 after() — 주입은 테스트·스크립트용이다(아래 registerAfterResponse 주석).
   */
  registerBackground?: (promise: Promise<unknown>) => void
}

interface CacheEntry<T> {
  data: T
  storedAt: number
  durationMs: number
  degraded: boolean
}

const entries = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()
const lastStats = new Map<string, SourceCacheStats & { key: string }>()

class SourceTimeoutError extends Error {
  constructor(key: string, timeoutMs: number) {
    super(`[admin-calendar] source "${key}" exceeded ${timeoutMs}ms response budget`)
    this.name = "SourceTimeoutError"
  }
}

/**
 * 백그라운드 갱신·늦은 승자를 서버리스에서 완주시킨다.
 *
 * 이 캐시의 규약은 "레이스에서 진 원천 호출을 취소하지 않는다 — 늦게라도 끝나면 캐시에 앉는다"인데,
 * 그건 프로세스가 계속 살아 있을 때만 참이다. Vercel 인스턴스는 응답을 보내는 순간 얼어붙거나
 * 종료될 수 있어서, 3.5초 마감을 넘긴 승자도 TTL 만료 백그라운드 갱신도 완료되지 못한다.
 * 그러면 다음 요청이 또 콜드 미스가 되고, "늘 조금 느린 소스"는 영원히 캐시에 못 앉는다.
 * after()로 한 번 등록해 두면 런타임이 응답 이후까지 인스턴스를 붙잡아 준다.
 *
 * 요청 컨텍스트 밖(vitest·스크립트·정적 렌더)에서는 after()가 던진다 — 그 경우는 조용히 no-op다.
 * 장기 실행 프로세스에서는 원래 약속이 그대로 완주하므로 잃는 게 없다.
 */
function registerAfterResponse(promise: Promise<unknown>): void {
  after(() =>
    promise.then(
      () => {},
      () => {}
    )
  )
}

/**
 * 원천 호출 1회. 같은 키로 이미 달리고 있으면 그 약속을 그대로 준다(중복 왕복 방지).
 * 성공하면 캐시를 갈아끼우고, 실패하면 기존 데이터를 남긴 채 degraded만 올린다.
 */
function startRefresh<T>(options: SwrSourceOptions<T>): Promise<T> {
  const existing = inFlight.get(options.key)
  if (existing) return existing as Promise<T>

  const startedAt = Date.now()
  const run = (async () => {
    try {
      const data = await options.fetcher()
      entries.set(options.key, {
        data,
        storedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        degraded: false,
      })
      return data
    } catch (error) {
      const previous = entries.get(options.key) as CacheEntry<T> | undefined
      if (previous) {
        // 나이(storedAt)는 건드리지 않는다 — 실패가 스테일 창을 연장하면 안 된다.
        entries.set(options.key, {
          ...previous,
          degraded: true,
          durationMs: Date.now() - startedAt,
        })
      }
      throw error
    } finally {
      inFlight.delete(options.key)
    }
  })()

  inFlight.set(options.key, run)
  try {
    ;(options.registerBackground ?? registerAfterResponse)(run)
  } catch {
    /* 등록 실패(요청 컨텍스트 밖 등)가 갱신 자체를 막지는 않는다 */
  }
  return run
}

function withTimeout<T>(promise: Promise<T>, key: string, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SourceTimeoutError(key, timeoutMs)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * 관측 전용 레지스트리(advisory). 키가 아니라 라벨 단위라 같은 라벨의 여러 키가 동시에 돌면
 * 마지막에 기록한 쪽이 이긴다 — health가 여러 달을 한꺼번에 조회할 때, 한 달의 실패가 다른 달의
 * 성공에 덮여 timing에서 사라질 수 있다(2026-08-28 교차리뷰 #10).
 * 이 값으로 판정하지 않기 때문에 그대로 둔다: 소스별 status/headline은 실제 조회 결과
 * (deriveFeedHealth·deriveTeamAccessHealth)가 정하고, 여기 값은 durationMs·ageMs 표시에만 쓴다.
 * 라벨별 최대 age·some(degraded)까지 정확히 말해야 할 때가 오면 키 단위 반환으로 바꾼다.
 */
function record<T>(options: SwrSourceOptions<T>, result: SwrSourceResult<T>): SwrSourceResult<T> {
  if (options.label) {
    lastStats.set(options.label, {
      key: options.key,
      degraded: result.degraded,
      ageMs: result.ageMs,
      durationMs: result.durationMs,
    })
  }
  return result
}

/**
 * 월을 오래 넘겨 다니면 키가 소스×월로 늘어난다. 스테일 창을 한참 넘긴 항목만 걷어낸다
 * (예전 어댑터별 Map은 영원히 자랐다 — 같은 자리에서 상한만 씌운다).
 */
const MAX_ENTRIES = 200

function pruneIfCrowded(staleMs: number) {
  if (entries.size <= MAX_ENTRIES) return

  const cutoff = Date.now() - staleMs
  for (const [key, entry] of entries) {
    if (entry.storedAt < cutoff && !inFlight.has(key)) entries.delete(key)
  }
  if (entries.size <= MAX_ENTRIES) return

  // 만료로는 하나도 못 걷어낸 경우(스테일 창이 6시간이라 그 안에 201개 키를 만들면 전부 살아
  // 있다) 상한이 상한이 아니게 된다 — 오래 저장된 것부터 강제로 내보낸다. 지금 달리는 키는
  // 건드리지 않는다(갱신이 끝나고 다시 앉는다).
  const evictable = Array.from(entries.entries())
    .filter(([key]) => !inFlight.has(key))
    .sort((a, b) => a[1].storedAt - b[1].storedAt)
  for (const [key] of evictable) {
    if (entries.size <= MAX_ENTRIES) break
    entries.delete(key)
  }
}

export async function swrSource<T>(options: SwrSourceOptions<T>): Promise<SwrSourceResult<T>> {
  pruneIfCrowded(options.staleMs)
  const entry = entries.get(options.key) as CacheEntry<T> | undefined
  const ageMs = entry ? Date.now() - entry.storedAt : 0

  if (entry && ageMs < options.staleMs) {
    if (ageMs >= options.ttlMs) {
      // 스테일 — 기다리지 않는다. 갱신은 뒤에서 한 번만 돌고 실패해도 조용히 스테일을 남긴다.
      void startRefresh(options).catch(() => {})
    }
    return record(options, {
      data: entry.data,
      degraded: entry.degraded,
      ageMs,
      durationMs: entry.durationMs,
    })
  }

  const startedAt = Date.now()
  try {
    const data = await withTimeout(startRefresh(options), options.key, options.timeoutMs)
    const stored = entries.get(options.key) as CacheEntry<T> | undefined
    return record(options, {
      data,
      degraded: false,
      ageMs: 0,
      durationMs: stored?.durationMs ?? Date.now() - startedAt,
    })
  } catch {
    // 마감 초과/실패 — 이 소스만 빈손으로 접고 나머지 소스는 그대로 간다.
    return record(options, {
      data: options.fallback,
      degraded: true,
      ageMs: 0,
      durationMs: Date.now() - startedAt,
    })
  }
}

/** 라벨별 마지막 관측치 — /api/admin/calendar/health 의 소스별 타이밍 병합용(관측 전용). */
export function readSourceCacheStats(
  label: string
): (SourceCacheStats & { key: string }) | null {
  return lastStats.get(label) ?? null
}

/** 테스트 전용 초기화. 운영 코드에서 부르지 않는다. */
export function resetSourceCache() {
  entries.clear()
  inFlight.clear()
  lastStats.clear()
}

function isMissingIncrementalCache(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("incrementalCache") &&
    error.message.includes("unstable_cache")
  )
}

/**
 * 인스턴스를 넘겨 사는 지속 캐시(next 데이터 캐시) 승격.
 *
 * 크기 근거: 이 헬퍼를 쓰는 소스는 전부 소형 JSON이다 — 노션 300행 상한(~150KB),
 * 쇼룸 ICS 500 VEVENT 상한(~250KB), 공휴일 100행 상한(~20KB). 저장소 규칙이 금지하는
 * 대형 페이로드(리드 전량 등 MB급)와는 자릿수가 다르다. 자격증명에 종속된 소스(팀원
 * 개인 캘린더)는 승격하지 않고 인메모리로 둔다.
 *
 * Next 런타임 밖(vitest·스크립트)에서는 unstable_cache가 incrementalCache 부재로 던진다 —
 * 그 경우에만 원본 함수로 물러선다(다른 오류는 그대로 올린다).
 */
/**
 * 원천 identity 지문 — 지속 캐시 키에 넣어 "노션 DB나 ICS 주소를 바꿨는데 옛 원천의 캐시가
 * 계속 나오는" 일을 막는다(고정 `v1` 키만으로는 원천이 바뀐 걸 캐시가 알 수 없다).
 *
 * 비밀 원문을 키에 그대로 넣지 않는다 — ICS 주소에는 캘린더 비공개 토큰이 섞여 있고 캐시 키는
 * 로그·디버거에 노출될 수 있다. sha256 앞 12자만 쓴다(충돌 가능성은 실무상 무시 가능하고,
 * 충돌해도 결과는 "옛 캐시 재사용"이라 지금과 같다).
 */
export function sourceIdentityFingerprint(value: string | null | undefined): string {
  const raw = value?.trim()
  if (!raw) return "unset"
  return createHash("sha256").update(raw).digest("hex").slice(0, 12)
}

export function withPersistentSourceCache<A extends unknown[], T>(
  fetcher: (...args: A) => Promise<T>,
  keyParts: string[],
  revalidateSeconds: number
): (...args: A) => Promise<T> {
  const cached = unstable_cache(fetcher, keyParts, { revalidate: revalidateSeconds })
  return async (...args: A) => {
    try {
      return await cached(...args)
    } catch (error) {
      if (isMissingIncrementalCache(error)) return fetcher(...args)
      throw error
    }
  }
}

/** 어댑터가 공유하는 기본 파라미터 — 소스마다 다시 정하지 않는다. */
export const EXTERNAL_SOURCE_TIMEOUT_MS = 3_500
/** 원천 호출 자체의 하드 마감. 응답 마감보다 넉넉해야 늦은 응답이 캐시에 앉는다. */
export const EXTERNAL_SOURCE_HARD_TIMEOUT_MS = 9_000
export const EXTERNAL_SOURCE_TTL_MS = 5 * 60_000
export const EXTERNAL_SOURCE_STALE_MS = 6 * 60 * 60_000
