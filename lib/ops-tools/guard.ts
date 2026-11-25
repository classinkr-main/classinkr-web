/**
 * 쓰기 도구 안전장치 — 호출자별 분당 상한과 idempotency_key(같은 키면 한 번만 실행).
 *
 * 둘 다 **서버리스 인스턴스 메모리 기준**이다. Vercel 은 요청을 여러 인스턴스에 나눠 보내고 인스턴스가 식으면
 * 기억이 사라지므로:
 * - 분당 상한은 인스턴스마다 따로 센다(실제 상한 = WRITE_RATE_LIMIT.max × 동시 인스턴스 수). 사고를 줄이는 장치지
 *   정확한 한도가 아니다.
 * - idempotency_key 도 같은 인스턴스·보관 시간(IDEMPOTENCY_TTL_MS) 안에서만 확실하다. HW 배송 예정은 도메인 행
 *   (hardware_movements.raw)에 키를 실어 인스턴스가 달라도 DB 에서 다시 찾는다(lookup). 견적 초안은 키를 실을 칸이
 *   없어(마이그레이션 금지) 메모리만 쓴다 — 운영 문서 docs/active/home-mcp-operations.md.
 */
import { OpsToolError } from "@/lib/ops-tools/errors"

export const WRITE_RATE_LIMIT = { windowMs: 60_000, max: 10 } as const
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
const IDEMPOTENCY_MAX_ENTRIES = 1000
export const IDEMPOTENCY_KEY_MAX = 200

const writeHits = new Map<string, number[]>()

/** 호출자별 쓰기 한 번을 센다. 넘으면 allowed=false(세지 않는다) */
export function takeWriteSlot(caller: string, now: number = Date.now()): { allowed: boolean; retryAfterMs: number } {
  const since = now - WRITE_RATE_LIMIT.windowMs
  const hits = (writeHits.get(caller) ?? []).filter((t) => t > since)
  if (hits.length >= WRITE_RATE_LIMIT.max) {
    writeHits.set(caller, hits)
    return { allowed: false, retryAfterMs: Math.max(0, hits[0] + WRITE_RATE_LIMIT.windowMs - now) }
  }
  hits.push(now)
  writeHits.set(caller, hits)
  return { allowed: true, retryAfterMs: 0 }
}

type IdemEntry = { fingerprint: string; at: number; pending?: Promise<unknown>; result?: unknown; done: boolean }
const idemStore = new Map<string, IdemEntry>()

/** 인자 값 하나 — 1~200자, 앞뒤 공백 없이. 없으면 undefined */
export function readIdempotencyKey(args: Record<string, unknown>): string | undefined {
  const raw = args.idempotency_key
  if (raw == null || raw === "") return undefined
  if (typeof raw !== "string" || !raw.trim() || raw.trim().length > IDEMPOTENCY_KEY_MAX) {
    throw new OpsToolError(`idempotency_key 는 1~${IDEMPOTENCY_KEY_MAX}자의 글자.`)
  }
  return raw.trim()
}

/** 같은 키에 다른 내용이 오면 거절하려고 인자를 정렬해 한 줄로 만든다(idempotency_key 자체는 뺀다) */
export function fingerprintArgs(args: Record<string, unknown>): string {
  const sortDeep = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sortDeep)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]))
        : v
  const rest = { ...args }
  delete rest.idempotency_key
  return JSON.stringify(sortDeep(rest))
}

function sweep(now: number) {
  for (const [k, e] of idemStore) if (e.done && now - e.at > IDEMPOTENCY_TTL_MS) idemStore.delete(k)
  while (idemStore.size > IDEMPOTENCY_MAX_ENTRIES) {
    const oldest = idemStore.keys().next().value
    if (oldest === undefined) break
    idemStore.delete(oldest)
  }
}

/**
 * 키가 있으면 (호출자, 도구, 키)마다 실행을 한 번만 한다. 같은 키로 다시 오면 처음 결과를 replayed=true 로 돌려준다.
 * 동시에 두 번 오면 두 번째는 첫 실행을 기다린다. 실행이 실패하면 키를 지워 다시 시도할 수 있게 한다.
 * lookup 은 메모리에 없을 때 도메인 표에서 같은 키로 이미 만든 결과를 찾는다(없으면 null).
 */
export async function runIdempotent<T>(
  scope: { caller: string; tool: string; key: string | undefined; fingerprint: string },
  execute: () => Promise<T>,
  lookup?: () => Promise<T | null>,
  now: () => number = Date.now
): Promise<{ result: T; replayed: boolean }> {
  if (!scope.key) return { result: await execute(), replayed: false }
  const storeKey = `${scope.caller}\u0000${scope.tool}\u0000${scope.key}`
  sweep(now())
  const existing = idemStore.get(storeKey)
  if (existing) {
    if (existing.fingerprint !== scope.fingerprint) {
      throw new OpsToolError("같은 idempotency_key 를 다른 내용에 썼다. 새 작업이면 새 키를 쓴다.", "idempotency_conflict")
    }
    if (existing.done) return { result: existing.result as T, replayed: true }
    if (existing.pending) return { result: (await existing.pending) as T, replayed: true }
  }
  const entry: IdemEntry = { fingerprint: scope.fingerprint, at: now(), done: false }
  const pending = (async () => {
    const found = lookup ? await lookup() : null
    if (found != null) return { value: found, replayed: true }
    return { value: await execute(), replayed: false }
  })()
  entry.pending = pending.then((r) => r.value)
  entry.pending.catch(() => undefined)
  idemStore.set(storeKey, entry)
  try {
    const r = await pending
    entry.done = true
    entry.result = r.value
    entry.pending = undefined
    entry.at = now()
    return { result: r.value, replayed: r.replayed }
  } catch (e) {
    idemStore.delete(storeKey)
    throw e
  }
}

/** 시험 전용 — 메모리 상태를 비운다 */
export function resetOpsGuardsForTest() {
  writeHits.clear()
  idemStore.clear()
}
