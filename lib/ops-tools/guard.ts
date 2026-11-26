/**
 * 쓰기 도구 안전장치 — 호출자별 분당 상한과 idempotency_key(같은 키면 한 번만 실행).
 *
 * 둘 다 **서버리스 인스턴스 메모리 기준**이다. Vercel 은 요청을 여러 인스턴스에 나눠 보내고 인스턴스가 식으면
 * 기억이 사라지므로:
 * - 분당 상한은 인스턴스마다 따로 센다(실제 상한 = WRITE_RATE_LIMIT.max × 동시 인스턴스 수). 사고를 줄이는 장치지
 *   정확한 한도가 아니다.
 * - idempotency_key 도 같은 인스턴스·보관 시간(IDEMPOTENCY_TTL_MS) 안에서만 확실하다. HW 배송 예정은 도메인 행
 *   (hardware_movements.raw.mcp)에 키 해시와 인자 지문을 실어 인스턴스가 달라도 DB 에서 다시 찾고, 지문이 다르면
 *   거절한다(lookup). 같은 키 동시 두 번은 유니크 색인(마이그레이션 적용 뒤)이 막고 23505 를 처음 결과로 돌려준다.
 *   견적 초안은 실을 칸이 없어 공용 저장소(Upstash, lib/ops-tools/idempotency-store.ts)에서 판정하고, 저장소가 없으면
 *   메모리만 쓴다(그때는 응답·로그에 표시) — docs/active/home-mcp-operations.md.
 */
import { createHash } from "crypto"

import { OpsToolError } from "@/lib/ops-tools/errors"

export const WRITE_RATE_LIMIT = { windowMs: 60_000, max: 10 } as const
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
export const IDEMPOTENCY_MAX_ENTRIES = 1000
export const IDEMPOTENCY_KEY_MAX = 200

const writeHits = new Map<string, number[]>()

export type WriteSlot = { allowed: boolean; retryAfterMs: number; release: () => void }

/** 호출자별 쓰기 한 번을 센다. 넘으면 allowed=false(세지 않는다). release() 는 센 한 번을 되돌린다(입력 오류로 실행 전에 끝났을 때) */
export function takeWriteSlot(caller: string, now: number = Date.now()): WriteSlot {
  const since = now - WRITE_RATE_LIMIT.windowMs
  const hits = (writeHits.get(caller) ?? []).filter((t) => t > since)
  if (hits.length >= WRITE_RATE_LIMIT.max) {
    writeHits.set(caller, hits)
    return { allowed: false, retryAfterMs: Math.max(0, hits[0] + WRITE_RATE_LIMIT.windowMs - now), release: () => undefined }
  }
  hits.push(now)
  writeHits.set(caller, hits)
  let released = false
  return {
    allowed: true,
    retryAfterMs: 0,
    release: () => {
      if (released) return
      released = true
      const list = writeHits.get(caller)
      const at = list?.lastIndexOf(now) ?? -1
      if (list && at >= 0) list.splice(at, 1)
    },
  }
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

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest("hex")

/**
 * 같은 키에 다른 내용이 오면 거절하려고 인자를 정렬해 해시한다(idempotency_key 자체는 뺀다).
 * 도메인 행에 실리므로 원문이 아니라 sha256 이다.
 */
export function fingerprintArgs(args: Record<string, unknown>): string {
  const sortDeep = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sortDeep)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]))
        : v
  const rest = { ...args }
  delete rest.idempotency_key
  return sha256(JSON.stringify(sortDeep(rest)) ?? "")
}

/** 도메인 행에 싣는 키 — 키 원문 대신 (호출자, 도구, 키)의 해시. 사람이 키에 적은 값이 기록·화면으로 퍼지지 않는다 */
export const idempotencyKeyHash = (caller: string, tool: string, key: string) => sha256(`${caller}\u0000${tool}\u0000${key}`)

/** 오래된 완료 항목을 지운다. 넘침을 덜 때도 실행 중(pending) 항목은 지우지 않는다(지우면 동시 재시도가 한 번 더 실행된다) */
function sweep(now: number) {
  for (const [k, e] of idemStore) if (e.done && now - e.at > IDEMPOTENCY_TTL_MS) idemStore.delete(k)
  if (idemStore.size < IDEMPOTENCY_MAX_ENTRIES) return
  for (const [k, e] of idemStore) {
    if (idemStore.size < IDEMPOTENCY_MAX_ENTRIES) break
    if (e.done) idemStore.delete(k)
  }
}

/** 도메인 표에서 찾은 기존 결과 — fingerprint 는 그 행에 실린 인자 지문(없으면 null → 같은지 알 수 없어 거절) */
export type IdempotentLookupHit<T> = { result: T; fingerprint: string | null }

export const idempotencyConflict = () => new OpsToolError("같은 idempotency_key 를 다른 내용에 썼다. 새 작업이면 새 키를 쓴다.", "idempotency_conflict")

/**
 * 키가 있으면 (호출자, 도구, 키)마다 실행을 한 번만 한다. 같은 키로 다시 오면 처음 결과를 replayed=true 로 돌려준다.
 * 판정 순서: 메모리 → (없으면) lookup(도메인 표) → execute. replay 는 execute 를 부르지 않으므로 분당 상한도 쓰지 않는다
 * (상한은 execute 안에서 센다 — lib/ops-tools/run.ts).
 * 동시에 두 번 오면 두 번째는 첫 실행을 기다린다. 실행이 실패하면 키를 지워 다시 시도할 수 있게 한다.
 * 메모리·도메인 표 어느 쪽이든 지문이 다르면 idempotency_conflict 로 거절한다.
 */
export async function runIdempotent<T>(
  scope: { caller: string; tool: string; key: string | undefined; fingerprint: string },
  execute: () => Promise<T>,
  lookup?: () => Promise<IdempotentLookupHit<T> | null>,
  now: () => number = Date.now
): Promise<{ result: T; replayed: boolean }> {
  if (!scope.key) return { result: await execute(), replayed: false }
  const storeKey = `${scope.caller}\u0000${scope.tool}\u0000${scope.key}`
  sweep(now())
  const existing = idemStore.get(storeKey)
  if (existing) {
    if (existing.fingerprint !== scope.fingerprint) throw idempotencyConflict()
    if (existing.done) return { result: existing.result as T, replayed: true }
    if (existing.pending) return { result: (await existing.pending) as T, replayed: true }
  }
  if (idemStore.size >= IDEMPOTENCY_MAX_ENTRIES) {
    // 실행 중 항목만으로 꽉 찼다 — 지우지 않고 새 키를 받지 않는다
    throw new OpsToolError("동시에 진행 중인 쓰기가 너무 많다. 잠시 뒤 다시 시도한다.", "rate_limited")
  }
  const entry: IdemEntry = { fingerprint: scope.fingerprint, at: now(), done: false }
  const pending = (async () => {
    const found = lookup ? await lookup() : null
    if (found != null) {
      if (found.fingerprint !== scope.fingerprint) throw idempotencyConflict()
      return { value: found.result, replayed: true }
    }
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
