import "server-only"

// 위컴 수신구의 서버 연결 — 실제 계정 조회·조율기 deps·중복 제거 저장소·답 보내기. 시험은 이 파일을 가짜로 바꾼다.
import { randomUUID } from "crypto"

import { canReadConsultationContent, staffKey } from "@/lib/admin-ai/server/actor"
import { buildServerOrchestratorDeps, serverOpsDeps } from "@/lib/admin-ai/server/deps"
import { collectTurn, type OrchestratorDeps } from "@/lib/admin-ai/server/orchestrator"
import {
  allowsMemoryClaims,
  createMemoryClaimStore,
  createUpstashClaimStore,
  type TicketClaimStore,
} from "@/lib/admin-ai/server/ticket-claims"
import { previewWriteTurn } from "@/lib/admin-ai/server/writes"
import { SITE_URL } from "@/lib/seo"
import { postJson } from "@/lib/server/post-json"
import { readUpstashRestConfig } from "@/lib/server/upstash"

import { lookupAdminByEmail } from "./aibot-accounts"
import type { BridgeDeps } from "./aibot-bridge"
import type { WecomAibotConfig } from "./aibot-config"

/** msgid 중복 제거 기간 — 위컴은 네트워크 사정으로 같은 콜백을 다시 보낼 수 있다(100719 msgid 설명). */
export const DEDUP_TTL_MS = 6 * 60 * 60 * 1000
const DEDUP_PREFIX = "wecom-aibot:msg:"
const memoryDedup = createMemoryClaimStore(Date.now, { ttlMs: DEDUP_TTL_MS })

/**
 * msgid 한 번 쓰기 저장소 — 갈매봇 확인표와 같은 판정(ticket-claims.ts): Upstash 가 있으면 분산 저장소,
 * 없으면 로컬 개발·시험에서만 메모리, 그 밖(운영·미리보기·자체 호스팅)은 null — 수신을 열지 않는다.
 */
export function getWecomDedupStore(env: Record<string, string | undefined> = process.env): TicketClaimStore | null {
  const upstash = readUpstashRestConfig(env)
  if (upstash) return createUpstashClaimStore(upstash, fetch, { prefix: DEDUP_PREFIX, ttlMs: DEDUP_TTL_MS })
  return allowsMemoryClaims(env) ? memoryDedup : null
}

/** 단체방 — 상담 내역·관련 상담 건수·고객 이력을 떼어 낸다(브리지 groupScopedDeps 가 한 번 더 막는다). */
function withoutConsultations(deps: OrchestratorDeps): OrchestratorDeps {
  const { consultationCount: _consultationCount, ...knowledge } = deps.knowledge
  void _consultationCount
  return { ...deps, knowledge, consultations: undefined, customerHistory: undefined }
}

export function buildWecomBridgeDeps(config: WecomAibotConfig): BridgeDeps {
  return {
    userMap: config.userMap,
    lookupAdmin: (email) => lookupAdminByEmail(email),
    orchestratorDeps: (admin, chatType) => {
      const sub = staffKey(admin)
      const group = chatType === "group"
      // 단체방은 답이 방 전체에 보인다 — 담당자 찾기에서 CRM 고객 조회를 끄고, 상담 내역 갈래·관련 상담 건수를 떼어 낸다
      // (브리지 groupScopedDeps 가 한 번 더 막는다). 1:1 은 어드민 화면과 같은 역할 규칙으로 상담 글 권한을 정한다.
      const built = buildServerOrchestratorDeps({
        sub,
        canReadConsultations: !group && canReadConsultationContent(admin),
        customerContacts: !group,
      })
      const base = group ? withoutConsultations(built) : built
      // 위컴에서는 확인표를 발급하지 않는다 — 미리보기까지만(확인은 로그인한 어드민 화면에서).
      return { ...base, previewWrite: (kind, ctx) => previewWriteTurn(kind, ctx, { ops: serverOpsDeps, ticketSecret: null, sub, newId: randomUUID }) }
    },
    collectTurn,
    siteUrl: SITE_URL,
    now: Date.now,
  }
}

/** response_url 이 위컴 주소인지 — https 이고 weixin.qq.com 아래. 다른 곳이면 보내지 않는다. */
export function isWecomResponseUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === "https:" && (url.hostname === "weixin.qq.com" || url.hostname.endsWith(".weixin.qq.com"))
  } catch {
    return false
  }
}

/** response_url 로 markdown 한 번(101138: POST JSON, 1시간 안, 한 번만, content ≤ 20480바이트). */
export async function sendResponseMarkdown(responseUrl: string, content: string): Promise<{ ok: boolean; status: number | null }> {
  if (!isWecomResponseUrl(responseUrl)) return { ok: false, status: null }
  try {
    const res = await postJson(responseUrl, { msgtype: "markdown", markdown: { content } }, { timeoutMs: 8000 })
    if (!res.ok) return { ok: false, status: res.status }
    const body = (await res.json().catch(() => null)) as { errcode?: unknown } | null
    return { ok: body?.errcode === undefined || body.errcode === 0, status: res.status }
  } catch {
    return { ok: false, status: null }
  }
}
