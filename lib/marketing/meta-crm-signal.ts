import "server-only"

import { getMarketingConversionStatus, postMetaCapiEvents } from "@/lib/marketing/server-conversions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages, type SupabasePageResult } from "@/lib/supabase/pagination"

// 메타 리드 광고 리드의 영업 단계 → Meta Conversions API('전환 리드' CRM 연동).
// 메타가 "폼만 내는 사람" 대신 "데모까지 가는 사람"에 맞춰 광고를 보내게 한다.
// 설계·켜는 법·법무 확인 항목: docs/active/meta-crm-stage-signal-2026-11-04.md
//
// 식별자는 메타 리드 번호(leadgen_id → user_data.lead_id) 하나다. 전화·이메일은 싣지 않는다.
// Meta 스펙(공식 문서 'Conversion Leads — Payload Specification'·'Implementing the CRM Integration', 2026-11-04 확인):
//  * action_source = "system_generated", custom_data.event_source = "crm", custom_data.lead_event_source = CRM 이름.
//  * event_name 은 자유 단계명. 첫 단계(리드 접수)도 리드마다 보내고, 앞 단계가 뒤 단계보다 먼저 가게 한다.
//  * event_time 은 CRM 에서 단계가 바뀐 시각 — 보내는 시각 기준 7일 안이고 리드 생성 뒤여야 한다(아니면 버려진다).
//  * 묶음 안 이벤트 하나만 틀려도 묶음 전체를 버린다 — 그래서 1건씩 보낸다.
//
// 기본은 꺼짐(META_CRM_SIGNAL_ENABLED=true 일 때만 보낸다). dryRun 은 꺼져 있어도 돈다 — 읽기만 하고 건수만 돌려준다.

/** Meta 로 나가는 event_name 그대로, 퍼널 순서. 종료(lost)·BD인계·미팅은 보내지 않는다. */
export const META_CRM_STAGES = ["initial_lead", "contacted", "trial_account", "demo", "paid"] as const
export type MetaCrmStage = (typeof META_CRM_STAGES)[number]

/** custom_data.lead_event_source — 리드가 사는 CRM 이름 */
export const META_CRM_LEAD_EVENT_SOURCE = "Compass"
/** 보낸 기록(멱등 원장). supabase/migrations/20261104_meta_crm_signal_events.sql */
export const META_CRM_SIGNAL_TABLE = "meta_crm_signal_events"
/** Meta 는 보내는 시각 기준 7일 안의 event_time 만 받는다 — 크론 간격·지연만큼 1시간 덜 본다. */
export const META_CRM_BACKFILL_MS = 7 * 24 * 60 * 60_000 - 60 * 60_000
/** 실행당 발송 상한(AGENTS.md 외부 발송 크론 규칙). 1건씩 보내므로 시간 마감도 함께 본다. */
export const META_CRM_MAX_EVENTS_PER_RUN = 50

const LEADGEN_ID = /^\d{15,17}$/
const ID_CHUNK = 200
const MAX_ROWS = 20_000

export function isMetaCrmSignalEnabled() {
  return process.env.META_CRM_SIGNAL_ENABLED?.trim() === "true"
}

// ─── 순수 판정 ──────────────────────────────────────────────────────────────

export interface MetaLeadgenRef {
  lead_id: number
  external_id: string
  created_at: string
}

export interface CompassStageRow {
  id: number
  stage: string | null
  updated_at: string | null
  demo_at: string | null
  account_at: string | null
  bd_paid_at: string | null
}

export interface CompassContactRow {
  lead_id: number
  first_connected_at: string | null
}

/** ready = 지금 보낼 것, sent = 이미 보냄, too_old = 7일 지나 Meta 가 안 받음, not_yet = 미래 시각(잡아 둔 데모),
 *  before_lead = 단계 시각이 메타 리드 접수보다 앞(이전에 있던 Compass 리드가 다시 신청한 경우). */
export type MetaCrmCandidateState = "ready" | "sent" | "too_old" | "not_yet" | "before_lead"
export type MetaCrmStageCounts = Record<MetaCrmStage, Record<MetaCrmCandidateState, number>>

export interface MetaCrmPlannedEvent {
  dedupeKey: string
  stage: MetaCrmStage
  leadgenId: string
  compassLeadId: number
  eventTimeMs: number
}

/** 같은 리드·같은 단계는 한 번 — 첫 단계는 메타 리드(leadgen)마다, 그 뒤 단계는 Compass 리드마다. 원장 PK 와 같은 키. */
export function metaCrmDedupeKey(stage: MetaCrmStage, leadgenId: string, compassLeadId: number) {
  return stage === "initial_lead" ? `initial_lead:${leadgenId}` : `${stage}:${compassLeadId}`
}

function zeroCounts() {
  return Object.fromEntries(
    META_CRM_STAGES.map((stage) => [stage, { ready: 0, sent: 0, too_old: 0, not_yet: 0, before_lead: 0 }])
  ) as MetaCrmStageCounts
}

function msOf(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * 접수 뒤 단계의 시각. 컨택 = 첫 연결(compass_lead_contact_v — Compass 단계는 연결돼도 유입에 머무는 일이 많다),
 * 체험 계정 = account_at, 데모 = demo_at(잡아 둔 시각이라 지나야 보낸다), 결제 = bd_paid_at.
 * 데모·결제 시각이 비었는데 단계가 그 자리면 updated_at 으로 갈음한다.
 */
function stageTimes(lead: CompassStageRow | undefined, contact: CompassContactRow | undefined) {
  return [
    ["contacted", contact?.first_connected_at ?? null],
    ["trial_account", lead?.account_at ?? null],
    ["demo", lead?.demo_at ?? (lead?.stage === "demo" ? lead.updated_at : null)],
    ["paid", lead?.bd_paid_at ?? (lead?.stage === "won" ? lead.updated_at : null)],
  ] as const
}

export function planMetaCrmSignal(input: {
  refs: readonly MetaLeadgenRef[]
  leads: readonly CompassStageRow[]
  contacts: readonly CompassContactRow[]
  sentKeys: ReadonlySet<string>
  nowMs: number
}) {
  const counts = zeroCounts()
  const ready: MetaCrmPlannedEvent[] = []
  let invalidLeadgenIds = 0

  const consider = (stage: MetaCrmStage, leadgenId: string, compassLeadId: number, eventTimeMs: number) => {
    const dedupeKey = metaCrmDedupeKey(stage, leadgenId, compassLeadId)
    const state: MetaCrmCandidateState = input.sentKeys.has(dedupeKey)
      ? "sent"
      : eventTimeMs > input.nowMs
        ? "not_yet"
        : eventTimeMs < input.nowMs - META_CRM_BACKFILL_MS
          ? "too_old"
          : "ready"
    counts[stage][state] += 1
    if (state === "ready") ready.push({ dedupeKey, stage, leadgenId, compassLeadId, eventTimeMs })
  }

  // Compass 리드 → 메타 리드들(접수 시각 오름차순). 접수 시각 = Compass 가 받은 시각(Meta 생성 시각 뒤).
  const refsByLead = new Map<number, Array<{ leadgenId: string; atMs: number }>>()
  for (const ref of input.refs) {
    const atMs = msOf(ref.created_at)
    if (!LEADGEN_ID.test(ref.external_id) || atMs == null) {
      invalidLeadgenIds += 1
      continue
    }
    const list = refsByLead.get(ref.lead_id) ?? []
    list.push({ leadgenId: ref.external_id, atMs })
    refsByLead.set(ref.lead_id, list)
  }

  const leadsById = new Map(input.leads.map((lead) => [lead.id, lead]))
  const contactsById = new Map(input.contacts.map((contact) => [contact.lead_id, contact]))
  for (const [compassLeadId, list] of refsByLead) {
    list.sort((a, b) => a.atMs - b.atMs)
    for (const ref of list) consider("initial_lead", ref.leadgenId, compassLeadId, ref.atMs)
    for (const [stage, at] of stageTimes(leadsById.get(compassLeadId), contactsById.get(compassLeadId))) {
      const atMs = msOf(at)
      if (atMs == null) continue
      // 그 단계 직전에 들어온 메타 리드에 붙인다(다시 신청한 리드는 최근 신청이 그 단계를 만든 광고다).
      const ref = list.findLast((item) => item.atMs <= atMs)
      if (!ref) counts[stage].before_lead += 1
      else consider(stage, ref.leadgenId, compassLeadId, atMs)
    }
  }

  const rank = (stage: MetaCrmStage) => META_CRM_STAGES.indexOf(stage)
  ready.sort((a, b) => a.eventTimeMs - b.eventTimeMs || rank(a.stage) - rank(b.stage))
  return { ready, counts, invalidLeadgenIds, leads: refsByLead.size }
}

/** CAPI 이벤트 1건. lead_id 는 숫자 문자열 — postMetaCapiEvents 가 JSON 숫자로 바꿔 싣는다. */
export function toMetaCrmCapiEvent(event: MetaCrmPlannedEvent) {
  return {
    event_name: event.stage,
    event_time: Math.floor(event.eventTimeMs / 1000),
    event_id: `compass-crm:${event.dedupeKey}`,
    action_source: "system_generated",
    user_data: { lead_id: event.leadgenId },
    custom_data: { event_source: "crm", lead_event_source: META_CRM_LEAD_EVENT_SOURCE },
  }
}

// ─── 실행 ───────────────────────────────────────────────────────────────────

export interface MetaCrmSignalReport {
  /** partial = 일부 건이 Meta 에서 거절·응답 불명이거나 원장 기록 실패 */
  status: "ok" | "disabled" | "not_configured" | "failed" | "partial"
  dryRun: boolean
  enabled: boolean
  /** META_TEST_EVENT_CODE 가 있어 테스트 이벤트로 보낸다 — 원장에 남기지 않는다(진짜 발송이 아니므로) */
  testMode: boolean
  /** 원장 표가 아직 없다 — dryRun 은 빈 원장으로 셌다. 실제 발송은 하지 않는다. */
  ledgerMissing?: boolean
  /** 메타 리드 번호가 붙은 Compass 리드 수 */
  leads: number
  invalidLeadgenIds: number
  stages: MetaCrmStageCounts
  /** 이번 실행에 보낼(dryRun 이면 보냈을) 건수 — 실행당 상한 적용 */
  planned: number
  sent: number
  rejected: number
  unknown: number
  ledgerWriteFailed: number
  error?: string
}

function isMissingTable(error: { code?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

function emptyReport(dryRun: boolean, status: MetaCrmSignalReport["status"], error?: string): MetaCrmSignalReport {
  return {
    status,
    dryRun,
    enabled: isMetaCrmSignalEnabled(),
    testMode: getMarketingConversionStatus().meta.testEventCodeConfigured,
    leads: 0,
    invalidLeadgenIds: 0,
    stages: zeroCounts(),
    planned: 0,
    sent: 0,
    rejected: 0,
    unknown: 0,
    ledgerWriteFailed: 0,
    ...(error ? { error } : {}),
  }
}

async function readPaged<T>(label: string, fetchPage: (from: number, to: number) => PromiseLike<SupabasePageResult>) {
  const result = await fetchSupabasePages<T>({ maxRows: MAX_ROWS, fetchPage })
  if (result.error) return { rows: [] as T[], error: result.error, label }
  // ponytail: 전량 읽기 — 메타 리드가 2만 건을 넘기면 원장·리드 조회를 접수 창(최근 N일)으로 좁힌다.
  if (result.truncated) return { rows: [] as T[], error: { message: `행 상한 ${MAX_ROWS} 도달` }, label }
  return { rows: result.data, error: null, label }
}

async function readByIds<T>(view: string, columns: string, idColumn: string, ids: readonly number[]) {
  const supabase = createSupabaseAdminClient()
  const rows: T[] = []
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const { data, error } = await supabase.from(view).select(columns).in(idColumn, ids.slice(index, index + ID_CHUNK))
    if (error) throw new Error(`${view}: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
  }
  return rows
}

/**
 * 한 번 실행. 던지지 않는다.
 *  - 꺼져 있으면(dryRun 아님) DB 도 읽지 않고 disabled.
 *  - 읽기가 하나라도 실패하면 보내지 않는다(반쪽 결과로 판정하면 이미 보낸 단계를 다시 보낸다).
 *  - 1건씩 보내고, Meta 가 받은 건만 원장에 남긴다. 거절·응답 불명은 남기지 않아 다음 실행이 다시 시도한다 —
 *    7일 창을 벗어나면 저절로 멈춘다. 같은 event_id 로 다시 가므로 Meta 쪽 중복 제거에도 걸린다.
 *  - 한 메타 리드의 앞 단계가 실패하면 이번 실행에서 그 리드의 뒤 단계는 보내지 않는다(앞 단계가 먼저 가게).
 */
export async function runMetaCrmSignal(
  options: { dryRun?: boolean; now?: Date; maxEvents?: number; deadlineAt?: number } = {}
): Promise<MetaCrmSignalReport> {
  const dryRun = options.dryRun === true
  if (!dryRun && !isMetaCrmSignalEnabled()) return emptyReport(dryRun, "disabled")
  if (!dryRun && !getMarketingConversionStatus().meta.capiConfigured) return emptyReport(dryRun, "not_configured")

  const supabase = createSupabaseAdminClient()
  let refs: MetaLeadgenRef[]
  let leads: CompassStageRow[]
  let contacts: CompassContactRow[]
  let sentKeys: Set<string>
  let ledgerMissing = false
  try {
    const refRead = await readPaged<MetaLeadgenRef>("compass_lead_refs_v", (from, to) =>
      supabase
        .from("compass_lead_refs_v")
        .select("lead_id, external_id, created_at")
        .eq("system", "meta_leadgen")
        .order("created_at", { ascending: true })
        .order("external_id", { ascending: true })
        .range(from, to)
    )
    if (refRead.error) throw new Error(`${refRead.label}: ${refRead.error.message}`)
    refs = refRead.rows

    const ledgerRead = await readPaged<{ dedupe_key: string }>(META_CRM_SIGNAL_TABLE, (from, to) =>
      supabase.from(META_CRM_SIGNAL_TABLE).select("dedupe_key").order("dedupe_key", { ascending: true }).range(from, to)
    )
    if (ledgerRead.error) {
      ledgerMissing = isMissingTable(ledgerRead.error)
      // 원장이 없으면 멱등을 지킬 수 없다 — dryRun 만 빈 원장으로 센다.
      if (!dryRun || !ledgerMissing) throw new Error(`${ledgerRead.label}: ${ledgerRead.error.message}`)
    }
    sentKeys = new Set(ledgerRead.rows.map((row) => row.dedupe_key))

    const ids = [...new Set(refs.map((ref) => ref.lead_id))]
    leads = await readByIds<CompassStageRow>(
      "compass_leads_v",
      "id, stage, updated_at, demo_at, account_at, bd_paid_at",
      "id",
      ids
    )
    contacts = await readByIds<CompassContactRow>("compass_lead_contact_v", "lead_id, first_connected_at", "lead_id", ids)
  } catch (error) {
    return emptyReport(dryRun, "failed", error instanceof Error ? error.message : String(error))
  }

  const plan = planMetaCrmSignal({ refs, leads, contacts, sentKeys, nowMs: (options.now ?? new Date()).getTime() })
  const batch = plan.ready.slice(0, options.maxEvents ?? META_CRM_MAX_EVENTS_PER_RUN)
  const report: MetaCrmSignalReport = {
    ...emptyReport(dryRun, "ok"),
    ...(ledgerMissing ? { ledgerMissing } : {}),
    leads: plan.leads,
    invalidLeadgenIds: plan.invalidLeadgenIds,
    stages: plan.counts,
    planned: batch.length,
  }
  if (dryRun) return report

  const deadlineAt = options.deadlineAt ?? Number.POSITIVE_INFINITY
  const blockedLeadgens = new Set<string>()
  for (const event of batch) {
    if (Date.now() >= deadlineAt) break
    if (blockedLeadgens.has(event.leadgenId)) continue
    let response: Awaited<ReturnType<typeof postMetaCapiEvents>>
    try {
      response = await postMetaCapiEvents([toMetaCrmCapiEvent(event)])
    } catch (error) {
      report.unknown += 1
      blockedLeadgens.add(event.leadgenId)
      report.error ??= `응답 불명: ${error instanceof Error ? error.name : "Error"}`
      continue
    }
    if (!response?.ok) {
      report.rejected += 1
      blockedLeadgens.add(event.leadgenId)
      report.error ??= response ? `Meta HTTP ${response.status}: ${response.error}` : "Meta CAPI 미설정"
      continue
    }
    report.sent += 1
    if (report.testMode) continue
    const { error } = await supabase.from(META_CRM_SIGNAL_TABLE).upsert(
      {
        dedupe_key: event.dedupeKey,
        stage: event.stage,
        leadgen_id: event.leadgenId,
        compass_lead_id: event.compassLeadId,
        event_time: new Date(event.eventTimeMs).toISOString(),
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    )
    if (error) {
      report.ledgerWriteFailed += 1
      report.error ??= `${META_CRM_SIGNAL_TABLE}: ${error.message}`
    }
  }

  if (report.rejected + report.unknown + report.ledgerWriteFailed > 0) report.status = "partial"
  return report
}
