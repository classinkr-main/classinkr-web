import "server-only"

/**
 * Data Cache(unstable_cache)에 넣는 값이 JSON 왕복을 견디는지 개발·테스트 환경에서만 검사한다.
 *
 * 배경: unstable_cache 는 값을 JSON.stringify 로 저장하고 JSON.parse 로 돌려준다. Map·Set·Date·
 * 함수·클래스 인스턴스·bigint 가 들어 있으면 저장은 성공하지만 적중 뒤 `{}`·문자열·null 로 바뀌어
 * 소비처가 조용히(또는 500 으로) 깨진다 — 2026-09-04 우선순위 큐 스냅샷의 Map 이 그랬다.
 * 단위 테스트는 unstable_cache 를 통과 함수로 모킹하므로 이 결함을 잡지 못한다. 그래서 캐시
 * 콜백 안에서 이 검사를 불러 dev·vitest 에서 즉시 던지게 한다. 프로덕션에서는 비용 때문에 건너뛴다.
 */
const MAX_DEPTH = 12

function describe(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const type = typeof value
  if (type === "function") return "function"
  if (type === "bigint") return "bigint"
  if (type === "symbol") return "symbol"
  if (type !== "object") return null
  if (value instanceof Map) return "Map"
  if (value instanceof Set) return "Set"
  if (value instanceof Date) return "Date"
  if (Array.isArray(value)) return null
  const proto = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name
    return `class instance(${name ?? "anonymous"})`
  }
  return null
}

export function findNonJsonValue(
  value: unknown,
  path = "$",
  depth = 0,
  seen = new WeakSet<object>()
): { path: string; kind: string } | null {
  const kind = describe(value)
  if (kind) return { path, kind }
  if (value === null || typeof value !== "object") return null
  if (seen.has(value as object)) return null
  seen.add(value as object)
  if (depth >= MAX_DEPTH) return null
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findNonJsonValue(value[index], `${path}[${index}]`, depth + 1, seen)
      if (found) return found
    }
    return null
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const found = findNonJsonValue(child, `${path}.${key}`, depth + 1, seen)
    if (found) return found
  }
  return null
}

/** dev·test 에서만 검사한다. 위반 시 label 과 경로를 담아 던진다(프로덕션은 즉시 반환). */
export function assertJsonSafeInDev<T>(label: string, value: T): T {
  if (process.env.NODE_ENV === "production") return value
  const found = findNonJsonValue(value)
  if (found) {
    throw new Error(
      `[data-cache] ${label}: ${found.kind} at ${found.path} — unstable_cache 는 JSON 으로 저장하므로 캐시 적중 뒤 깨진다. 경계에서 배열/문자열로 바꿔라.`
    )
  }
  return value
}
