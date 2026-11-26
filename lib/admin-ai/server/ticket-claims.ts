import "server-only"

// 확인표 일회용 판정 — "이 표 id 를 썼다"를 여러 서버가 함께 보는 저장소에 원자적으로 한 번만 적는다.
//
// 저장소: 분산 요청 제한(lib/server/rate-limit.ts)과 같은 Upstash Redis REST 연결(lib/server/upstash.ts,
// UPSTASH_REDIS_REST_URL·UPSTASH_REDIS_REST_TOKEN). `SET key 1 NX PX ttl` — 이미 있으면 null 이 와서 "이미 씀"이다.
// 만료는 표 만료(15분) + 여유 5분. 저장소 호출이 실패하면 던진다(확인 경로는 실행하지 않고 503 — 실패하면 닫힌다).
//
// 저장소가 설정되지 않았을 때(readConfirmSetup) — 열어 둘 곳을 좁게 적고 나머지는 모두 닫는다:
//  - 로컬 개발·시험(NODE_ENV 가 정확히 "development"·"test" 이고 VERCEL_ENV 가 "production"·"preview" 가 아님):
//    인스턴스 메모리로 대신한다(kind "memory") — 응답과 로그에 그렇다고 표시한다.
//  - 그 밖의 모든 곳(Vercel 운영·미리보기, 자체 호스팅 `next build && next start`, 값이 없거나 어긋난 경우):
//    쓰기 확인을 열지 않는다 — 표를 발급하지 않고(카드는 "화면에서 직접 등록"), 확인 경로는 503(claim_store_missing).
//    "production" 한 값에 기대면 그 값이 빠진 배포가 메모리로 열리므로, 운영인지가 아니라 로컬인지를 본다.
import { readUpstashRestConfig, type UpstashRestConfig } from "@/lib/server/upstash"

import { readTicketSecret, TICKET_TTL_MS } from "./tickets"

export const TICKET_CLAIM_TTL_MS = TICKET_TTL_MS + 5 * 60 * 1000
const CLAIM_KEY_PREFIX = "admin-ai:ticket-used:"
const CLAIM_TIMEOUT_MS = 1500

export type ClaimOutcome = "claimed" | "already_used"

export interface TicketClaimStore {
  /** distributed: 여러 서버가 함께 보는 저장소. memory: 이 인스턴스만(로컬 개발·시험). */
  kind: "distributed" | "memory"
  /** 표 id 를 원자적으로 한 번만 적는다. 저장소 오류면 던진다. */
  claim: (ticketId: string) => Promise<ClaimOutcome>
}

export class ClaimStoreError extends Error {
  constructor(message = "확인 저장소에 닿지 못했다.") {
    super(message)
    this.name = "ClaimStoreError"
  }
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>

/** 다른 일회용 판정(예: 위컴 수신구의 msgid 중복 제거)이 같은 저장소를 쓸 때 — 키 앞머리와 만료만 바꾼다. */
export interface ClaimStoreOptions {
  prefix?: string
  ttlMs?: number
}

/** Upstash REST `SET NX PX` — 있으면 실패하는 쓰기. */
export function createUpstashClaimStore(config: UpstashRestConfig, fetcher: Fetcher = fetch, options: ClaimStoreOptions = {}): TicketClaimStore {
  const prefix = options.prefix ?? CLAIM_KEY_PREFIX
  const ttlMs = options.ttlMs ?? TICKET_CLAIM_TTL_MS
  return {
    kind: "distributed",
    async claim(ticketId) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), CLAIM_TIMEOUT_MS)
      try {
        const res = await fetcher(config.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(["SET", `${prefix}${ticketId}`, "1", "NX", "PX", String(ttlMs)]),
          signal: controller.signal,
        })
        if (!res.ok) throw new ClaimStoreError(`확인 저장소 응답 ${res.status}`)
        const data = (await res.json().catch(() => null)) as { result?: unknown; error?: unknown } | null
        if (!data || data.error !== undefined || !("result" in data)) throw new ClaimStoreError("확인 저장소 응답을 읽지 못했다.")
        if (data.result === "OK") return "claimed"
        if (data.result === null) return "already_used"
        throw new ClaimStoreError("확인 저장소 응답이 예상과 다르다.")
      } catch (error) {
        if (error instanceof ClaimStoreError) throw error
        // 연결 실패·시간 초과 — 값·주소는 싣지 않는다.
        throw new ClaimStoreError()
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

/** 인스턴스 메모리 — 로컬 개발·시험에서만(allowsMemoryClaims). 판정이 동기라 같은 인스턴스 안의 동시 요청도 한 번만 통과한다. */
export function createMemoryClaimStore(now: () => number = Date.now, options: Pick<ClaimStoreOptions, "ttlMs"> = {}): TicketClaimStore {
  const used = new Map<string, number>()
  const ttlMs = options.ttlMs ?? TICKET_CLAIM_TTL_MS
  return {
    kind: "memory",
    async claim(ticketId) {
      const at = now()
      for (const [id, until] of used) if (until <= at) used.delete(id)
      if (used.has(ticketId)) return "already_used"
      used.set(ticketId, at + ttlMs)
      return "claimed"
    },
  }
}

const instanceMemoryStore = createMemoryClaimStore()

const MEMORY_NODE_ENVS = new Set(["development", "test"])
const DEPLOYED_VERCEL_ENVS = new Set(["production", "preview"])

/** 메모리 대신 판정을 허용하는 곳 — 로컬 `next dev`·시험뿐. 값은 다듬어 비교하고, 모르면 닫는다. */
export function allowsMemoryClaims(env: Record<string, string | undefined>): boolean {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase() ?? ""
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase() ?? ""
  return MEMORY_NODE_ENVS.has(nodeEnv) && !DEPLOYED_VERCEL_ENVS.has(vercelEnv)
}

export interface ConfirmSetup {
  /** 표 서명 비밀(ADMIN_AI_TICKET_SECRET). */
  secret: string | null
  /** 일회용 판정 저장소. 분산 저장소가 없고 로컬 개발·시험도 아니면 null. */
  claims: TicketClaimStore | null
  /**
   * 대화 쪽이 오더 카드에 표를 실을 때 쓰는 비밀 — 확인을 열 수 있을 때(비밀 + 저장소)만 값이 있다.
   * 카드가 확인 버튼을 보일지는 표가 있는지로 정해지므로, 이 칸 하나가 그 판정이다.
   */
  cardSecret: string | null
  /** 확인을 열지 못하는 까닭. */
  blocked?: "no_secret" | "claim_store_missing"
}

/** 쓰기 확인을 열 수 있는지 한 곳에서 판정한다(대화 deps·확인 라우트가 같이 쓴다). */
export function readConfirmSetup(env: Record<string, string | undefined> = process.env, fetcher?: Fetcher): ConfirmSetup {
  const secret = readTicketSecret(env)
  const upstash = readUpstashRestConfig(env)
  const claims = upstash
    ? createUpstashClaimStore(upstash, fetcher)
    : allowsMemoryClaims(env)
      ? instanceMemoryStore
      : null
  const blocked = !secret ? ("no_secret" as const) : !claims ? ("claim_store_missing" as const) : undefined
  return { secret, claims, cardSecret: blocked ? null : secret, ...(blocked ? { blocked } : {}) }
}
