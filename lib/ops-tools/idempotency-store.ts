import "server-only"

/**
 * 쓰기 도구 idempotency 의 공용 저장소 판정 — 도메인 행에 키를 실을 칸이 없는 도구(견적 초안)가 쓴다.
 *
 * 인스턴스 메모리(lib/ops-tools/guard.ts)는 같은 인스턴스 안의 동시 호출만 막는다. Vercel 은 요청을 여러 인스턴스에
 * 나눠 보내므로, 같은 키가 두 인스턴스에 동시에 오면 둘 다 실행된다. 이 저장소는 갈매봇 확인표 일회용 판정
 * (lib/admin-ai/server/ticket-claims.ts)과 같은 Upstash Redis REST 연결(lib/server/upstash.ts)에서
 * `SET key pending NX PX ttl` 로 "이 키를 내가 처음 잡았다"를 원자적으로 한 번만 적는다.
 *
 * 기록의 흐름: 잡기(pending, 60초) → 실행 → 끝나면 결과를 done 으로 덮어쓴다(24시간). 실행이 실패하면 지워 같은 키로
 * 다시 시도할 수 있게 한다. 진행 중인 키가 다른 인스턴스에서 오면 끝날 때까지 잠깐 기다렸다가 처음 결과를 돌려준다.
 *
 * 저장소가 없을 때(env 미설정)나 저장소 호출이 실패할 때는 닫지 않고 인스턴스 메모리 판정으로 내려간다 — MCP 는 운영에서
 * 이미 쓰이고 있어 쓰기를 막으면 안 된다. 그 경우 응답(idempotency_scope)과 로그(idem_memory)에 "메모리 판정"이라고 표시한다.
 * 값·주소·키 원문은 싣지 않는다(키는 호출자·도구·키의 sha256 이다).
 */
import type { WriteExecuteResult } from "@/lib/ops-tools/types"
import { readUpstashRestConfig, type UpstashRestConfig } from "@/lib/server/upstash"

export const SHARED_IDEMPOTENCY_PENDING_MS = 60_000
export const SHARED_IDEMPOTENCY_DONE_MS = 24 * 60 * 60 * 1000
const KEY_PREFIX = "ops-idem:"
const REQUEST_TIMEOUT_MS = 1000

export type IdempotencyRecord = { state: "pending" | "done"; fingerprint: string; result?: WriteExecuteResult }

export interface SharedIdempotencyStore {
  /** 키를 처음 잡았으면 won. 이미 있으면 그 기록(읽는 사이 사라졌으면 null). 저장소 오류면 던진다 */
  claim: (keyHash: string, fingerprint: string) => Promise<{ won: true } | { won: false; record: IdempotencyRecord | null }>
  read: (keyHash: string) => Promise<IdempotencyRecord | null>
  complete: (keyHash: string, fingerprint: string, result: WriteExecuteResult) => Promise<void>
  release: (keyHash: string) => Promise<void>
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>

export class IdempotencyStoreError extends Error {
  constructor(message = "idempotency 저장소에 닿지 못했다.") {
    super(message)
    this.name = "IdempotencyStoreError"
  }
}

function parseRecord(raw: unknown): IdempotencyRecord | null {
  if (typeof raw !== "string") return null
  try {
    const v = JSON.parse(raw) as Partial<IdempotencyRecord> | null
    if (!v || (v.state !== "pending" && v.state !== "done") || typeof v.fingerprint !== "string") return null
    return { state: v.state, fingerprint: v.fingerprint, ...(v.result ? { result: v.result } : {}) }
  } catch {
    return null
  }
}

export function createUpstashIdempotencyStore(config: UpstashRestConfig, fetcher: Fetcher = fetch): SharedIdempotencyStore {
  async function command(args: string[]): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetcher(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: controller.signal,
      })
      if (!res.ok) throw new IdempotencyStoreError(`idempotency 저장소 응답 ${res.status}`)
      const data = (await res.json().catch(() => null)) as { result?: unknown; error?: unknown } | null
      if (!data || data.error !== undefined || !("result" in data)) throw new IdempotencyStoreError("idempotency 저장소 응답을 읽지 못했다.")
      return data.result
    } catch (error) {
      if (error instanceof IdempotencyStoreError) throw error
      throw new IdempotencyStoreError() // 연결 실패·시간 초과 — 값·주소는 싣지 않는다
    } finally {
      clearTimeout(timeout)
    }
  }

  const read = async (keyHash: string) => parseRecord(await command(["GET", `${KEY_PREFIX}${keyHash}`]))

  return {
    read,
    async claim(keyHash, fingerprint) {
      const pending: IdempotencyRecord = { state: "pending", fingerprint }
      const result = await command(["SET", `${KEY_PREFIX}${keyHash}`, JSON.stringify(pending), "NX", "PX", String(SHARED_IDEMPOTENCY_PENDING_MS)])
      if (result === "OK") return { won: true }
      if (result === null) return { won: false, record: await read(keyHash) }
      throw new IdempotencyStoreError("idempotency 저장소 응답이 예상과 다르다.")
    },
    async complete(keyHash, fingerprint, result) {
      const done: IdempotencyRecord = { state: "done", fingerprint, result }
      await command(["SET", `${KEY_PREFIX}${keyHash}`, JSON.stringify(done), "PX", String(SHARED_IDEMPOTENCY_DONE_MS)])
    },
    async release(keyHash) {
      await command(["DEL", `${KEY_PREFIX}${keyHash}`])
    },
  }
}

/** 공용 저장소 — 연결이 설정돼 있을 때만. 없으면 null(호출부가 메모리 판정으로 내려가 표시한다) */
export function readSharedIdempotencyStore(env: Record<string, string | undefined> = process.env, fetcher?: Fetcher): SharedIdempotencyStore | null {
  const config = readUpstashRestConfig(env)
  return config ? createUpstashIdempotencyStore(config, fetcher) : null
}
