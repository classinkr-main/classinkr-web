import "server-only"

// 세그먼트 → 메시지 발송 1단계(대상 미리보기, 2026-09-25) — 서버 해석기. 읽기 전용이다(쓰기·감사 로그·발송 없음).
//
// 흐름: 모집단(통합 목록과 같은 계산·정렬, 스냅샷 60초 캐시 위 메모리 필터) → 행 키를 원천별 id 로 나눔 →
//   leads·customers·crm_neo_customer_snapshots 에서 id 100개씩 이메일·전화를 다시 읽음(통합 행의 contact 는
//   전화·이메일 중 하나만 담아 채널 판정에 못 쓴다) → 동의 인덱스(lib/messaging/marketing-consent.ts, 실패 = 거부)
//   → lib/crm/segment-audience.ts 순수 분류 → 건수만 돌려준다(연락처 원문·표본·행 키 없음).
// Home 테이블만 읽는다 — Compass crm 스키마·외부 NEO 에는 아무것도 쓰지 않는다. 원천 한 덩어리가 실패하면 그
// 덩어리의 행을 unresolved 로 센다(0 과 구분). NEO 스냅샷은 이메일이 없어 NEO 계정은 늘 "이메일 없음"이다.

import { describeSegmentFilter } from "@/lib/crm/customer-segment-filter"
import type { CustomerSegmentFilter } from "@/lib/crm/saved-segment-api"
import {
  SEGMENT_AUDIENCE_MAX_ROWS,
  classifySegmentAudience,
  type SegmentAudienceContact,
  type SegmentAudienceKind,
  type SegmentAudiencePreview,
} from "@/lib/crm/segment-audience"
import { parseUnifiedCustomerTargetKey } from "@/lib/crm/unified-customer-key"
import type { UnifiedQueryOptions } from "@/lib/crm/unified-query-options"
import { classifyEmailConsent, loadLeadMarketingConsentIndex } from "@/lib/messaging/marketing-consent"
import { isSolapiConfigured } from "@/lib/messaging/solapi"
import {
  CRM_UNIFIED_EXPORT_MAX_ROWS,
  evaluateCrmSegmentFilters,
  getCrmUnifiedCustomersForExport,
} from "@/lib/repositories/crm-unified-customers"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/** id in(...) 필터는 URL 에 실린다 — UUID 100개 ≈ 3.7KB(일괄 할 일과 같은 청크). */
const ID_CHUNK = 100
/** 원천 조회 동시 요청 수 — 5,000행이면 원천당 최대 50청크라 한 번에 몰지 않는다. */
const LOOKUP_CONCURRENCY = 4
const NEO_SOURCE_SYSTEM = "xiaoshouyi"

/** 모집단 — 행 키(목록과 같은 모집단)와 전체 건수. */
export interface SegmentAudiencePopulation {
  keys: string[]
  total: number
  truncated: boolean
  sources: SegmentAudiencePreview["sources"]
  labels: string[]
}

export interface SegmentAudienceMeta {
  id: string | null
  name: string | null
  archived: boolean
  /** 조회자가 발송 권한(SUPER_ADMIN·ADMIN)을 가졌는가 — 라우트가 검증된 역할로 채운다 */
  canSend: boolean
}

/**
 * 저장 세그먼트 모집단 — 세그먼트 허브 일괄 평가와 같은 모집단(저장 뷰 all · 담당 없음 · 미확인 리드 제외)이라
 * 허브 건수·회원(members) 라우트와 같은 행이다. 핵심 원천이 빠진 미완성 스냅샷이면 sources: "incomplete".
 */
export async function loadSavedSegmentAudiencePopulation(filter: CustomerSegmentFilter): Promise<SegmentAudiencePopulation> {
  const batch = await evaluateCrmSegmentFilters([filter], { maxKeys: SEGMENT_AUDIENCE_MAX_ROWS })
  const result = batch.results[0]
  if (!result) throw new Error("세그먼트 평가 결과가 비었습니다.")
  return {
    keys: result.keys,
    total: result.total,
    truncated: result.truncated,
    sources: batch.sources.complete && batch.sources.tagsOk ? "ok" : "incomplete",
    labels: describeSegmentFilter(filter),
  }
}

/** 저장 전 조건(통합 목록 쿼리) 모집단 — CSV 내보내기와 같은 계산·상한. 원천 완성 여부는 이 경로에 없다(unknown). */
export async function loadQueryAudiencePopulation(options: UnifiedQueryOptions): Promise<SegmentAudiencePopulation> {
  const result = await getCrmUnifiedCustomersForExport(options, Math.min(CRM_UNIFIED_EXPORT_MAX_ROWS, SEGMENT_AUDIENCE_MAX_ROWS))
  return {
    keys: result.rows.map((row) => row.key),
    total: result.total,
    truncated: result.truncated,
    sources: "unknown",
    labels: result.segmentLabels,
  }
}

type ContactRecord = { email: string | null; phone: string | null }
type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

async function runWithConcurrency<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      await worker(item)
    }
  })
  await Promise.all(runners)
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

interface LookupJob {
  kind: SegmentAudienceKind
  ids: string[]
}

async function fetchContactChunk(supabase: SupabaseAdmin, job: LookupJob): Promise<Array<[string, ContactRecord]>> {
  if (job.kind === "neo_account") {
    const { data, error } = await supabase
      .from("crm_neo_customer_snapshots")
      .select("account_id, phone")
      .eq("source_system", NEO_SOURCE_SYSTEM)
      .in("account_id", job.ids)
    if (error) throw new Error(error.message ?? "neo lookup failed")
    return ((data ?? []) as Array<{ account_id: string; phone: string | null }>).map((row) => [
      row.account_id,
      { email: null, phone: textOrNull(row.phone) },
    ])
  }
  const table = job.kind === "lead" ? "leads" : "customers"
  const { data, error } = await supabase.from(table).select("id, email, phone").in("id", job.ids)
  if (error) throw new Error(error.message ?? `${table} lookup failed`)
  return ((data ?? []) as Array<{ id: string; email: string | null; phone: string | null }>).map((row) => [
    String(row.id).toLowerCase(),
    { email: textOrNull(row.email), phone: textOrNull(row.phone) },
  ])
}

/** 행 키 → 분류 입력. 조회 실패한 청크·원천에 없는 행·해석 못 한 키는 unresolved. 입력 순서 유지. */
async function loadAudienceContacts(keys: readonly string[]): Promise<SegmentAudienceContact[]> {
  const parsed = keys.map((key) => parseUnifiedCustomerTargetKey(key))
  const idsByKind: Record<SegmentAudienceKind, Set<string>> = {
    lead: new Set(),
    neo_account: new Set(),
    customer: new Set(),
  }
  for (const target of parsed) {
    if (target) idsByKind[target.targetType].add(target.targetId)
  }

  const jobs: LookupJob[] = []
  for (const kind of Object.keys(idsByKind) as SegmentAudienceKind[]) {
    for (const ids of chunkItems([...idsByKind[kind]], ID_CHUNK)) jobs.push({ kind, ids })
  }

  const found: Record<SegmentAudienceKind, Map<string, ContactRecord>> = {
    lead: new Map(),
    neo_account: new Map(),
    customer: new Map(),
  }
  const failed: Record<SegmentAudienceKind, Set<string>> = { lead: new Set(), neo_account: new Set(), customer: new Set() }

  if (jobs.length > 0) {
    const supabase = createSupabaseAdminClient()
    let failures = 0
    await runWithConcurrency(jobs, LOOKUP_CONCURRENCY, async (job) => {
      try {
        for (const [id, record] of await fetchContactChunk(supabase, job)) found[job.kind].set(id, record)
      } catch {
        failures += 1
        for (const id of job.ids) failed[job.kind].add(id)
      }
    })
    if (failures > 0) console.warn(`[crm-segment-audience] 연락처 조회 ${failures}청크 실패 — 해당 행은 판정 못 함으로 센다`)
  }

  return parsed.map((target): SegmentAudienceContact => {
    if (!target) return { kind: null, email: null, phone: null, unresolved: true }
    const kind = target.targetType
    const record = found[kind].get(target.targetId)
    if (!record || failed[kind].has(target.targetId)) return { kind, email: null, phone: null, unresolved: true }
    return { kind, email: record.email, phone: record.phone }
  })
}

function detectEmailProvider(): SegmentAudiencePreview["channels"]["email"] {
  if (process.env.RESEND_API_KEY) return "resend"
  if (process.env.EMAIL_WEBHOOK_URL) return "webhook"
  return "none"
}

/** 모집단 → 대상 미리보기(건수만). 동의 조회 실패는 consent: "unavailable"(발송 가능 0)로 강등하고 던지지 않는다. */
export async function resolveSegmentAudiencePreview(
  population: SegmentAudiencePopulation,
  meta: SegmentAudienceMeta
): Promise<SegmentAudiencePreview> {
  const [contacts, consentIndex] = await Promise.all([
    loadAudienceContacts(population.keys),
    loadLeadMarketingConsentIndex().catch((error: unknown) => {
      console.warn("[crm-segment-audience] 수신 동의 목록 조회 실패 — 발송 가능 0(미확인 = 거부)", error instanceof Error ? error.name : "Error")
      return null
    }),
  ])

  const classification = classifySegmentAudience(
    contacts,
    consentIndex ? (email) => classifyEmailConsent(email, consentIndex) : null,
    { totalRows: population.total, truncated: population.truncated }
  )

  return {
    generatedAt: new Date().toISOString(),
    segment: { id: meta.id, name: meta.name, labels: population.labels, archived: meta.archived },
    ...classification,
    channels: { email: detectEmailProvider(), smsConfigured: isSolapiConfigured() },
    sources: population.sources,
    viewer: { canSend: meta.canSend },
  }
}
