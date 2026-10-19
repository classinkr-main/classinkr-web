import "server-only"

// Compass 제출 → public.leads 미러 오케스트레이터(설계 META-RECEIVER-FINAL §4-2 H6a·H6d, 설계 B §4-3).
//
// 한 번의 미러(runMetaLeadMirror):
//  ① 전환 스위치를 읽는다. shadow 면 쓰지 않는다(대조 보고는 H6c). admin 이고 롤백 잔여분 창도 없으면 skipped.
//  ② 대상: public.compass_meta_submissions_v(창 안) + 폴백 public.compass_lead_refs_v(meta_leadgen) 중 제출 행이
//     없는 것. PostgREST 1000행 상한은 fetchSupabasePages 로 넘긴다. 크론은 received_at <= now-2분(Compass 커밋
//     여유), webhook after() 경로는 요청 id 만 최대 waitForCompassMs 동안 2초 간격으로 기다린다(보이면 커밋된 것).
//  ③ 원장에 이미 끝난(inserted·adopted·skipped) leadgen 은 뺀다. 최종 판정은 RPC 가 다시 한다.
//  ④ 신원은 public.compass_leads_v 에서 id,name,phone_key,email_key 를 200개 청크로 읽는다(bridge.ts 는 쓰지
//     않는다). 리드가 없으면 skip_reason 'compass_lead_deleted'.
//  ⑤ 합성 field_data = [full_name, phone_number, email, ...form_answers] → 어드민 웹훅과 같은 빌더
//     buildLeadCapturePayload → buildLeadPayload. 이메일 형식 오류면 이메일만 비우고 다시 조립한다(emailDropped).
//  ⑥ meta_lead_mirror_apply 를 100건씩 부른다(한 호출 = 한 트랜잭션, advisory 잠금·원장 PK 로 정확히 1행).
//  ⑦ inserted 에만 runLeadCaptureEffects(토글 = cutover.side_effects, 서버 전환·site_inflow 끔) →
//     meta_lead_mirror_mark_side_effects. 부수효과가 15분 넘게 미완인 행은 다음 실행이 다시 돌리고(24시간 상한),
//     그보다 오래된 것은 포기 표시만 한다.
//
// 크론·관리 실행(runMetaLeadMirrorCycle)은 여기에 H6d 를 붙인다: 미러 → (폴백 훅, H6b) → 건강 RPC 경보
// (지표별 6시간 스로틀, meta_lead_mirror_state.alert_state) → 심장박동(매 실행) → 감사(바뀐 실행만).
//
// 규칙: 쓰기는 public 에만(RPC·meta_lead_mirror_state·audit_logs). 절대 던지지 않는다 — 실패는 status 로 알린다.
// 경보·심장박동·감사에는 건수와 식별자만 싣고 이름·전화·이메일 값은 싣지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js"

import { logAudit } from "@/lib/auth/audit"
import type { LeadPayload } from "@/lib/lead-types"
import { buildLeadCapturePayload, type MetaLeadDetail } from "@/lib/meta/lead-ads-payload"
import {
  META_LEAD_MIRROR_LEDGER_TABLE,
  readMetaLeadgenCutover,
  type MetaLeadgenCutover,
  type MetaLeadgenMode,
  type MetaLeadgenSideEffects,
} from "@/lib/meta/leadgen-cutover"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import type { NotificationSeverity } from "@/lib/notifications/types"
import { getResolvedSettings } from "@/lib/repositories/settings"
import {
  buildLeadPayload,
  runLeadCaptureEffects,
  type LeadCaptureEffectToggles,
  type LeadCaptureEffectsOptions,
} from "@/lib/server/lead-capture"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages, type SupabasePageResult } from "@/lib/supabase/pagination"

// ─── 이름·상수 ───────────────────────────────────────────────────────────────

export const COMPASS_META_SUBMISSIONS_VIEW = "compass_meta_submissions_v"
export const COMPASS_LEAD_REFS_VIEW = "compass_lead_refs_v"
export const COMPASS_LEADS_VIEW = "compass_leads_v"
export const COMPASS_ADS_VIEW = "compass_ads_v"
export const META_LEAD_MIRROR_STATE_TABLE = "meta_lead_mirror_state"
export const META_LEAD_MIRROR_APPLY_RPC = "meta_lead_mirror_apply"
export const META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC = "meta_lead_mirror_mark_side_effects"
export const META_LEAD_MIRROR_HEALTH_RPC = "meta_lead_mirror_health"
export const META_LEADGEN_REF_SYSTEM = "meta_leadgen"

/** 크론 대상은 Compass 수신 뒤 2분이 지난 제출만(Compass 커밋 여유) — 설계 B §4-3 2 */
export const COMPASS_COMMIT_LAG_MS = 2 * 60_000
/** 롤백 잔여분 창 — meta_lead_mirror_eligible 과 같은 10분 */
export const MIRROR_RESIDUAL_WINDOW_MS = 10 * 60_000
export const MIRROR_APPLY_BATCH_SIZE = 100
export const MIRROR_ID_CHUNK = 200
/** 창 스캔 상한(폭주 방지) — 넘으면 truncated 로 보고하고 다음 실행이 잇는다 */
export const MIRROR_SCAN_MAX_ROWS = 10_000
export const MIRROR_WAIT_POLL_MS = 2_000
/** 기다림이 끝난 뒤 조립·적용에 남기는 시간 */
export const MIRROR_WAIT_RESERVE_MS = 5_000
/** 이보다 오래 미완인 부수효과만 다시 돌린다(동시에 도는 after()·크론이 같은 알림을 두 번 내지 않게) */
export const MIRROR_EFFECTS_RETRY_MIN_AGE_MS = 15 * 60_000
/** 이보다 오래 미완인 부수효과는 포기 표시만 한다(설계 B §4-3 5 "24시간 상한") */
export const MIRROR_EFFECTS_RETRY_MAX_AGE_MS = 24 * 60 * 60_000
export const MIRROR_EFFECTS_CONCURRENCY = 4
export const MIRROR_REQUEST_TIMEOUT_MS = 10_000
/** webhook after() 기본 예산 — 라우트 maxDuration 30초 안 */
export const MIRROR_WEBHOOK_BUDGET_MS = 27_000
/** 크론·관리 기본 예산 — 라우트 maxDuration 60초, 설계 H7 예산 45초 안 */
export const MIRROR_RUN_BUDGET_MS = 40_000
/** 경보 스로틀 — 지표별 6시간에 한 번(설계 §4-2 H6d) */
export const MIRROR_ALERT_THROTTLE_MS = 6 * 60 * 60_000

export const MIRROR_SKIP_REASON_COMPASS_LEAD_DELETED = "compass_lead_deleted"

const AUDIT_ACTION = "meta_lead_mirror.run"
const AUDIT_ACTOR_NAME = "Meta 리드 미러"
const AUDIT_INSERTED_CAP = 200

const SUBMISSION_COLUMNS =
  "leadgen_id,lead_id,outcome,via,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,page_id,platform,submitted_at,received_at,form_answers"
const REF_COLUMNS = "lead_id,external_id,created_at"
const LEDGER_COLUMNS = "leadgen_id,state,origin,public_lead_id,side_effects_done_at,updated_at"
const IDENTITY_COLUMNS = "id,name,phone_key,email_key,meta_ad_id,campaign_id"
const AD_COLUMNS = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,day"

/** 빌더가 신원으로 읽는 키 — form_answers 에 섞여 오면 버린다(신원은 compass_leads_v 에서만) */
const IDENTITY_FIELD_KEYS = new Set([
  "full_name",
  "name",
  "성명",
  "이름",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "성",
  "email",
  "email_address",
  "이메일",
  "phone_number",
  "phone",
  "mobile",
  "mobile_number",
  "전화번호",
  "휴대폰",
])

const LEADGEN_ID_PATTERN = /^[0-9]+$/

// ─── 공개 타입 ───────────────────────────────────────────────────────────────

export type MetaLeadMirrorTrigger = "webhook" | "cron" | "admin"

/** 테스트가 시계·대기를 바꿔 끼우는 자리. 운영에서는 넘기지 않는다. */
export interface MetaLeadMirrorClock {
  now(): number
  sleep(ms: number): Promise<void>
}

export interface RunMetaLeadMirrorOptions {
  trigger: MetaLeadMirrorTrigger
  /** 이 leadgen 만 본다(webhook after() 경로). 2분 커밋 여유를 두지 않는다 */
  leadgenIds?: string[]
  /** 제출 행이 보일 때까지 기다리는 최대 시간(ms) — webhook after() 경로 20초 */
  waitForCompassMs?: number
  /** 쓰기 없이 계산만(RPC·부수효과·감사 없음) */
  dryRun?: boolean
  /** epoch ms — 이 시각 뒤로는 새 적용 배치·부수효과를 시작하지 않는다. 기본: webhook 27초, 그 밖 40초 */
  deadlineAt?: number
  clock?: MetaLeadMirrorClock
}

export type MetaLeadMirrorStatus =
  /** 창 안 대상을 모두 처리했다(0건 포함) */
  | "ok"
  /** admin 모드이고 롤백 잔여분 창도 없다 — 아무것도 읽지 않았다 */
  | "skipped"
  /** shadow — 미러는 쓰지 않는다(대조 보고는 H6c) */
  | "shadow"
  /** Compass 브리지 뷰(제출·링크·신원·광고)를 못 읽었다 */
  | "bridge_down"
  /** 스위치·원장·적용 RPC 실패 */
  | "failed"
  /** 예산이 끝나 남은 적용·부수효과를 다음 실행에 넘겼다 */
  | "timeout"

export interface MetaLeadMirrorWindow {
  kind: "compass" | "residual"
  /** received_at 하한(포함) = mirror_since */
  from: string
  /** 롤백 잔여분 상한(미포함) = compass_ended_at + 10분. compass 모드면 null */
  before: string | null
}

export interface MetaLeadMirrorRunResult {
  status: MetaLeadMirrorStatus
  trigger: MetaLeadMirrorTrigger
  dryRun: boolean
  mode: MetaLeadgenMode | null
  window: MetaLeadMirrorWindow | null
  /** webhook 경로가 요청한 leadgen 수(중복 제거 전) */
  requested: number
  waitedMs: number
  targets: {
    submissions: number
    /** 제출 행 없이 lead_refs 로만 만든 대상 */
    refsFallback: number
    /** webhook 경로에서 기다린 뒤에도 Compass 에 보이지 않은 id — 크론·폴백이 잇는다 */
    notVisible: number
    /** 원장이 이미 끝낸 leadgen(보내지 않음) */
    inLedger: number
    /** 부수효과만 다시 돌릴 원장 행 */
    effectsRetry: number
    /** 숫자가 아닌 leadgen id(보내지 않음) */
    invalid: number
    truncated: boolean
  }
  built: { rows: number; skippedDeleted: number; emailDropped: number; buildFailed: number }
  applied: {
    batches: number
    inserted: number
    blocked: number
    skipped: number
    outsideWindow: number
    invalid: number
    existing: number
  }
  sideEffects: {
    ran: number
    /** runLeadCaptureEffects 가 돌려준 전달 오류가 있었던 행(인시던트는 그 함수가 이미 냈다) */
    deliveryErrors: number
    /** 부수효과가 던져 완료 표시를 하지 않은 행 — 15분 뒤 다시 돈다 */
    failed: number
    marked: number
    /** 24시간 넘게 미완이거나 신원이 사라져 완료 표시만 한 행 */
    abandoned: number
    /** 예산이 끝나 시작하지 않은 행 */
    deferred: number
  }
  /** 이번 실행이 만든 public.leads 행(감사 근거) */
  inserted: Array<{ leadgenId: string; leadId: string }>
  /** 오류 메시지(값·PII 없음) */
  errors: string[]
}

// ─── 순수 도우미 ─────────────────────────────────────────────────────────────

export type MetaFieldData = NonNullable<MetaLeadDetail["field_data"]>

/** 미러 대상 창. shadow 는 여기서 판단하지 않는다(호출부가 먼저 거른다). */
export function resolveMetaLeadMirrorWindow(cutover: MetaLeadgenCutover): MetaLeadMirrorWindow | null {
  if (!cutover.mirrorSince) return null
  const since = Date.parse(cutover.mirrorSince)
  if (!Number.isFinite(since)) return null
  const from = new Date(since).toISOString()
  if (cutover.mode === "compass") return { kind: "compass", from, before: null }
  if (!cutover.compassEndedAt) return null
  const ended = Date.parse(cutover.compassEndedAt)
  if (!Number.isFinite(ended)) return null
  const before = ended + MIRROR_RESIDUAL_WINDOW_MS
  if (before <= since) return null
  return { kind: "residual", from, before: new Date(before).toISOString() }
}

/** 뷰의 form_answers → field_data. 모양이 틀린 항목과 신원 키는 버린다. 순서는 유지한다. */
export function sanitizeMirrorFormAnswers(value: unknown): MetaFieldData {
  if (!Array.isArray(value)) return []
  const fields: MetaFieldData = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const name = (item as { name?: unknown }).name
    if (typeof name !== "string" || !name.trim()) continue
    if (IDENTITY_FIELD_KEYS.has(name.trim().toLowerCase())) continue
    const raw = (item as { values?: unknown }).values
    const values = Array.isArray(raw)
      ? raw.filter((entry): entry is string => typeof entry === "string")
      : typeof raw === "string"
        ? [raw]
        : []
    fields.push({ name, values })
  }
  return fields
}

export interface MetaLeadMirrorIdentity {
  name: string | null
  phoneKey: string | null
  emailKey: string | null
}

/** 합성 field_data = [full_name, phone_number, email, ...form_answers] (값이 있는 신원만) */
export function buildMirrorFieldData(identity: MetaLeadMirrorIdentity, formAnswers: MetaFieldData): MetaFieldData {
  const fields: MetaFieldData = []
  if (identity.name) fields.push({ name: "full_name", values: [identity.name] })
  if (identity.phoneKey) fields.push({ name: "phone_number", values: [identity.phoneKey] })
  if (identity.emailKey) fields.push({ name: "email", values: [identity.emailKey] })
  return [...fields, ...formAnswers]
}

export interface MetaLeadMirrorAd {
  adId: string | null
  adName: string | null
  adsetId: string | null
  adsetName: string | null
  campaignId: string | null
  campaignName: string | null
}

export interface MetaLeadMirrorTarget {
  kind: "submission" | "ref"
  leadgenId: string
  receivedAt: string
  compassLeadId: number | null
  pageId: string | null
  formId: string | null
  ad: MetaLeadMirrorAd
  formAnswers: MetaFieldData
}

/**
 * 어드민 웹훅과 같은 빌더로 LeadPayload 를 만든다. 이메일 형식 오류면 이메일만 빼고 다시 조립한다.
 * 그 밖의 조립 실패는 던진다(meta_lead_ads 는 필수 필드가 없어 이메일 말고는 실패하지 않는다).
 */
export function buildMetaLeadMirrorPayload(
  target: MetaLeadMirrorTarget,
  identity: MetaLeadMirrorIdentity
): { payload: LeadPayload; emailDropped: boolean } {
  const build = (id: MetaLeadMirrorIdentity) => {
    const detail: MetaLeadDetail = {
      id: target.leadgenId,
      form_id: target.formId ?? undefined,
      ad_id: target.ad.adId ?? undefined,
      ad_name: target.ad.adName ?? undefined,
      adset_id: target.ad.adsetId ?? undefined,
      adset_name: target.ad.adsetName ?? undefined,
      campaign_id: target.ad.campaignId ?? undefined,
      campaign_name: target.ad.campaignName ?? undefined,
      field_data: buildMirrorFieldData(id, target.formAnswers),
    }
    return buildLeadPayload(
      buildLeadCapturePayload(
        { leadgen_id: target.leadgenId, page_id: target.pageId ?? undefined, form_id: target.formId ?? undefined },
        detail
      )
    )
  }
  try {
    return { payload: build(identity), emailDropped: false }
  } catch (error) {
    if (!identity.emailKey) throw error
    return { payload: build({ ...identity, emailKey: null }), emailDropped: true }
  }
}

export type MetaLeadMirrorApplyRow = Record<string, string | number | null>

/** meta_lead_mirror_apply 한 행 — public.leads insert 컬럼(saveLead 와 같은 매핑) + 원장 키 */
export function toMetaLeadMirrorApplyRow(target: MetaLeadMirrorTarget, payload: LeadPayload): MetaLeadMirrorApplyRow {
  return {
    leadgen_id: target.leadgenId,
    received_at: target.receivedAt,
    compass_lead_id: target.compassLeadId,
    name: payload.name ?? null,
    org: payload.org ?? null,
    role: payload.role ?? null,
    size: payload.size ?? null,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    message: payload.message ?? null,
    branch: payload.branch ?? null,
    source_detail: payload.sourceDetail ?? null,
    lead_magnet: payload.leadMagnet ?? null,
    utm_source: payload.utmSource ?? null,
    utm_medium: payload.utmMedium ?? null,
    utm_campaign: payload.utmCampaign ?? null,
    utm_term: payload.utmTerm ?? null,
    utm_content: payload.utmContent ?? null,
  }
}

export function toMetaLeadMirrorSkipRow(target: MetaLeadMirrorTarget, reason: string): MetaLeadMirrorApplyRow {
  return {
    leadgen_id: target.leadgenId,
    received_at: target.receivedAt,
    compass_lead_id: target.compassLeadId,
    skip_reason: reason,
  }
}

/** 미러 부수효과 토글 — DB side_effects 4개 + 서버 전환·site_inflow 는 항상 끔(원래 Meta 는 건너뛰던 경로) */
export function mirrorLeadCaptureEffectToggles(sideEffects: MetaLeadgenSideEffects): LeadCaptureEffectToggles {
  return {
    externalForwards: sideEffects.externalForwards,
    subscriberUpsert: sideEffects.subscriberUpsert,
    automationOnSubmit: sideEffects.automationOnSubmit,
    leadCreatedNotification: sideEffects.leadCreatedNotification,
    serverConversion: false,
    siteInflow: false,
  }
}

// ─── Supabase 호출 도우미 ────────────────────────────────────────────────────

type QueryError = { message?: string; code?: string } | null
type QueryResult = { data: unknown; error: QueryError; count?: number | null }

const systemClock: MetaLeadMirrorClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

function errorLabel(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message)
  return String(error)
}

function shortError(label: string, error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined
  const text = `${label}: ${errorLabel(error)}${typeof code === "string" && code ? ` (${code})` : ""}`
  return text.length > 240 ? `${text.slice(0, 237)}...` : text
}

/** 한 번의 PostgREST 호출 — 오류·예외·시간 초과를 모두 { error } 로 돌려준다(던지지 않음). */
async function timed(label: string, run: (signal: AbortSignal) => PromiseLike<QueryResult>): Promise<QueryResult> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<QueryResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve({ data: null, error: { message: `${label}: ${MIRROR_REQUEST_TIMEOUT_MS}ms 초과` } })
    }, MIRROR_REQUEST_TIMEOUT_MS)
  })
  try {
    const call = Promise.resolve()
      .then(() => run(controller.signal))
      .then(
        (result) => result,
        (error: unknown) => ({ data: null, error: { message: errorLabel(error) } }) as QueryResult
      )
    return await Promise.race([call, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function toInteger(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isInteger(parsed) ? parsed : null
}

type WindowFilterable<B> = {
  gte(column: string, value: string): B
  lte(column: string, value: string): B
  lt(column: string, value: string): B
}

function applyWindow<B extends WindowFilterable<B>>(
  builder: B,
  column: string,
  window: MetaLeadMirrorWindow,
  lagBound: string | null
): B {
  let query = builder.gte(column, window.from)
  if (lagBound) query = query.lte(column, lagBound)
  if (window.before) query = query.lt(column, window.before)
  return query
}

// ─── 한 번의 미러 ────────────────────────────────────────────────────────────

type SubmissionRow = {
  leadgen_id?: unknown
  lead_id?: unknown
  ad_id?: unknown
  ad_name?: unknown
  adset_id?: unknown
  adset_name?: unknown
  campaign_id?: unknown
  campaign_name?: unknown
  form_id?: unknown
  page_id?: unknown
  received_at?: unknown
  form_answers?: unknown
}
type RefRow = { lead_id?: unknown; external_id?: unknown; created_at?: unknown }
type LedgerRow = {
  leadgen_id?: unknown
  state?: unknown
  origin?: unknown
  public_lead_id?: unknown
  side_effects_done_at?: unknown
  updated_at?: unknown
}
type IdentityRow = {
  id?: unknown
  name?: unknown
  phone_key?: unknown
  email_key?: unknown
  meta_ad_id?: unknown
  campaign_id?: unknown
}
type AdRow = {
  ad_id?: unknown
  ad_name?: unknown
  adset_id?: unknown
  adset_name?: unknown
  campaign_id?: unknown
  campaign_name?: unknown
}
type ApplyOutRow = { out_leadgen_id?: unknown; out_action?: unknown; out_public_lead_id?: unknown }

type EffectsItem = { leadgenId: string; leadId: string; payload: LeadPayload }

const LEDGER_DONE_STATES = new Set(["inserted", "adopted", "skipped"])

function emptyRunResult(options: RunMetaLeadMirrorOptions): MetaLeadMirrorRunResult {
  return {
    status: "ok",
    trigger: options.trigger,
    dryRun: options.dryRun === true,
    mode: null,
    window: null,
    requested: options.leadgenIds?.length ?? 0,
    waitedMs: 0,
    targets: { submissions: 0, refsFallback: 0, notVisible: 0, inLedger: 0, effectsRetry: 0, invalid: 0, truncated: false },
    built: { rows: 0, skippedDeleted: 0, emailDropped: 0, buildFailed: 0 },
    applied: { batches: 0, inserted: 0, blocked: 0, skipped: 0, outsideWindow: 0, invalid: 0, existing: 0 },
    sideEffects: { ran: 0, deliveryErrors: 0, failed: 0, marked: 0, abandoned: 0, deferred: 0 },
    inserted: [],
    errors: [],
  }
}

function submissionTarget(row: SubmissionRow): MetaLeadMirrorTarget | null {
  const leadgenId = text(row.leadgen_id)
  const receivedAt = text(row.received_at)
  if (!leadgenId || !receivedAt) return null
  return {
    kind: "submission",
    leadgenId,
    receivedAt,
    compassLeadId: toInteger(row.lead_id),
    pageId: text(row.page_id),
    formId: text(row.form_id),
    ad: {
      adId: text(row.ad_id),
      adName: text(row.ad_name),
      adsetId: text(row.adset_id),
      adsetName: text(row.adset_name),
      campaignId: text(row.campaign_id),
      campaignName: text(row.campaign_name),
    },
    formAnswers: sanitizeMirrorFormAnswers(row.form_answers),
  }
}

function refTarget(row: RefRow): MetaLeadMirrorTarget | null {
  const leadgenId = text(row.external_id)
  const receivedAt = text(row.created_at)
  if (!leadgenId || !receivedAt) return null
  return {
    kind: "ref",
    leadgenId,
    receivedAt,
    compassLeadId: toInteger(row.lead_id),
    pageId: null,
    formId: null,
    ad: { adId: null, adName: null, adsetId: null, adsetName: null, campaignId: null, campaignName: null },
    formAnswers: [],
  }
}

class MirrorPass {
  readonly report: MetaLeadMirrorRunResult
  private readonly clock: MetaLeadMirrorClock
  private readonly startedAt: number
  private readonly deadlineAt: number
  private readonly dryRun: boolean
  private sb!: SupabaseClient
  private cutover!: MetaLeadgenCutover
  private window!: MetaLeadMirrorWindow
  private bridgeDegraded = false
  private timedOut = false
  private settings: LeadCaptureEffectsOptions["settings"] | null = null

  constructor(private readonly options: RunMetaLeadMirrorOptions) {
    this.report = emptyRunResult(options)
    this.clock = options.clock ?? systemClock
    this.startedAt = this.clock.now()
    this.dryRun = options.dryRun === true
    this.deadlineAt =
      options.deadlineAt ??
      this.startedAt + (options.trigger === "webhook" ? MIRROR_WEBHOOK_BUDGET_MS : MIRROR_RUN_BUDGET_MS)
  }

  private fail(status: "failed" | "bridge_down", message: string): MetaLeadMirrorRunResult {
    this.report.status = status
    this.report.errors.push(message)
    return this.report
  }

  private degrade(message: string) {
    this.bridgeDegraded = true
    this.report.errors.push(message)
  }

  async run(preloaded?: { cutover: MetaLeadgenCutover } | { error: string }): Promise<MetaLeadMirrorRunResult> {
    if (preloaded && "error" in preloaded) return this.fail("failed", preloaded.error)
    try {
      this.cutover = preloaded ? preloaded.cutover : await readMetaLeadgenCutover()
    } catch (error) {
      return this.fail("failed", shortError("전환 스위치 읽기 실패", error))
    }
    this.report.mode = this.cutover.mode
    if (this.cutover.mode === "shadow") {
      this.report.status = "shadow"
      return this.report
    }
    const window = resolveMetaLeadMirrorWindow(this.cutover)
    if (!window) {
      this.report.status = "skipped"
      return this.report
    }
    this.window = window
    this.report.window = window

    const requested = this.options.leadgenIds
    if (requested && requested.length === 0) return this.report

    try {
      this.sb = createSupabaseAdminClient()
    } catch (error) {
      return this.fail("failed", shortError("Supabase 클라이언트 생성 실패", error))
    }

    const targets = requested ? await this.collectRequested(requested) : await this.collectWindow()
    if (!targets) return this.report

    const valid = targets.filter((target) => {
      if (LEADGEN_ID_PATTERN.test(target.leadgenId)) return true
      this.report.targets.invalid += 1
      return false
    })
    if (valid.length === 0) return this.finish()

    const classified = await this.classifyByLedger(valid)
    if (!classified) return this.report
    const { apply, retry, abandon } = classified

    const identities = await this.loadIdentities([...apply, ...retry.map((item) => item.target)])
    if (!identities) return this.report

    const refTargets = [...apply, ...retry.map((item) => item.target)].filter((target) => target.kind === "ref")
    let applyTargets = apply
    let retryTargets = retry
    if (refTargets.length && !(await this.fillRefAds(refTargets, identities))) {
      applyTargets = apply.filter((target) => target.kind !== "ref")
      retryTargets = retry.filter((item) => item.target.kind !== "ref")
    }

    const rows: MetaLeadMirrorApplyRow[] = []
    const payloads = new Map<string, LeadPayload>()
    for (const target of applyTargets) {
      const identity = target.compassLeadId == null ? undefined : identities.get(target.compassLeadId)
      if (!identity) {
        rows.push(toMetaLeadMirrorSkipRow(target, MIRROR_SKIP_REASON_COMPASS_LEAD_DELETED))
        this.report.built.skippedDeleted += 1
        continue
      }
      const built = this.build(target, identity)
      if (!built) continue
      payloads.set(target.leadgenId, built)
      rows.push(toMetaLeadMirrorApplyRow(target, built))
    }
    this.report.built.rows = rows.length

    const retryItems: EffectsItem[] = []
    for (const item of retryTargets) {
      const identity = item.target.compassLeadId == null ? undefined : identities.get(item.target.compassLeadId)
      const payload = identity ? this.build(item.target, identity) : null
      if (!payload) {
        abandon.push(item.target.leadgenId)
        continue
      }
      retryItems.push({ leadgenId: item.target.leadgenId, leadId: item.publicLeadId, payload })
    }

    if (this.dryRun) {
      this.report.sideEffects.abandoned = abandon.length
      return this.finish()
    }

    const ok = await this.applyRows(rows, payloads)
    if (ok) {
      await this.runEffects(retryItems)
      if (abandon.length && this.clock.now() < this.deadlineAt) await this.markSideEffects(abandon, "abandoned")
    }
    return this.finish()
  }

  private finish(): MetaLeadMirrorRunResult {
    if (this.report.status === "ok") {
      if (this.bridgeDegraded) this.report.status = "bridge_down"
      else if (this.timedOut) this.report.status = "timeout"
    }
    return this.report
  }

  private build(target: MetaLeadMirrorTarget, identity: MetaLeadMirrorIdentity): LeadPayload | null {
    try {
      const { payload, emailDropped } = buildMetaLeadMirrorPayload(target, identity)
      if (emailDropped) this.report.built.emailDropped += 1
      return payload
    } catch (error) {
      this.report.built.buildFailed += 1
      this.report.errors.push(shortError(`행 조립 실패(leadgen ${target.leadgenId})`, error))
      return null
    }
  }

  // ② 크론 대상 — 창 스캔
  private async collectWindow(): Promise<MetaLeadMirrorTarget[] | null> {
    const lagBound = new Date(this.clock.now() - COMPASS_COMMIT_LAG_MS).toISOString()
    const sb = this.sb
    const window = this.window

    const submissions = await fetchSupabasePages<SubmissionRow>({
      maxRows: MIRROR_SCAN_MAX_ROWS,
      fetchPage: (from, to) =>
        timed(COMPASS_META_SUBMISSIONS_VIEW, (signal) =>
          applyWindow(
            sb.from(COMPASS_META_SUBMISSIONS_VIEW).select(SUBMISSION_COLUMNS, from === 0 ? { count: "exact" } : undefined),
            "received_at",
            window,
            lagBound
          )
            .order("received_at", { ascending: true })
            .order("leadgen_id", { ascending: true })
            .range(from, to)
            .abortSignal(signal)
        ) as PromiseLike<SupabasePageResult>,
    })
    if (submissions.error) {
      this.fail("bridge_down", shortError(`${COMPASS_META_SUBMISSIONS_VIEW} 읽기 실패`, submissions.error))
      return null
    }
    if (submissions.truncated) {
      this.report.targets.truncated = true
      this.report.errors.push(`${COMPASS_META_SUBMISSIONS_VIEW}: 스캔 상한 ${MIRROR_SCAN_MAX_ROWS}행에 닿음 — 나머지는 다음 실행`)
    }

    const targets: MetaLeadMirrorTarget[] = []
    const seen = new Set<string>()
    for (const row of submissions.data) {
      const target = submissionTarget(row)
      if (!target || seen.has(target.leadgenId)) continue
      seen.add(target.leadgenId)
      targets.push(target)
    }
    this.report.targets.submissions = targets.length

    const refs = await fetchSupabasePages<RefRow>({
      maxRows: MIRROR_SCAN_MAX_ROWS,
      fetchPage: (from, to) =>
        timed(COMPASS_LEAD_REFS_VIEW, (signal) =>
          applyWindow(
            sb
              .from(COMPASS_LEAD_REFS_VIEW)
              .select(REF_COLUMNS, from === 0 ? { count: "exact" } : undefined)
              .eq("system", META_LEADGEN_REF_SYSTEM),
            "created_at",
            window,
            lagBound
          )
            .order("created_at", { ascending: true })
            .order("external_id", { ascending: true })
            .range(from, to)
            .abortSignal(signal)
        ) as PromiseLike<SupabasePageResult>,
    })
    if (refs.error) {
      this.degrade(shortError(`${COMPASS_LEAD_REFS_VIEW} 읽기 실패 — 제출 행 대상만 처리`, refs.error))
      return targets
    }
    if (refs.truncated) {
      this.report.targets.truncated = true
      this.report.errors.push(`${COMPASS_LEAD_REFS_VIEW}: 스캔 상한 ${MIRROR_SCAN_MAX_ROWS}행에 닿음 — 나머지는 다음 실행`)
    }

    const refCandidates: MetaLeadMirrorTarget[] = []
    for (const row of refs.data) {
      const target = refTarget(row)
      if (!target || seen.has(target.leadgenId)) continue
      seen.add(target.leadgenId)
      refCandidates.push(target)
    }
    const fallback = await this.withoutSubmission(refCandidates)
    this.report.targets.refsFallback = fallback.length
    return [...targets, ...fallback]
  }

  // ② webhook 대상 — 요청 id 만, 보일 때까지 기다림
  private async collectRequested(leadgenIds: string[]): Promise<MetaLeadMirrorTarget[] | null> {
    const pending = new Set<string>()
    for (const id of leadgenIds) {
      if (typeof id === "string" && LEADGEN_ID_PATTERN.test(id)) pending.add(id)
      else this.report.targets.invalid += 1
    }
    if (pending.size === 0) return []
    const found: MetaLeadMirrorTarget[] = []
    const waitMs = Math.max(0, this.options.waitForCompassMs ?? 0)
    const waitUntil = Math.min(this.startedAt + waitMs, this.deadlineAt - MIRROR_WAIT_RESERVE_MS)

    for (;;) {
      for (const ids of chunk([...pending], MIRROR_ID_CHUNK)) {
        const result = await timed(COMPASS_META_SUBMISSIONS_VIEW, (signal) =>
          applyWindow(
            this.sb.from(COMPASS_META_SUBMISSIONS_VIEW).select(SUBMISSION_COLUMNS).in("leadgen_id", ids),
            "received_at",
            this.window,
            null
          ).abortSignal(signal)
        )
        if (result.error) {
          this.fail("bridge_down", shortError(`${COMPASS_META_SUBMISSIONS_VIEW} 읽기 실패`, result.error))
          return null
        }
        for (const row of (result.data ?? []) as SubmissionRow[]) {
          const target = submissionTarget(row)
          if (!target || !pending.has(target.leadgenId)) continue
          pending.delete(target.leadgenId)
          found.push(target)
        }
      }
      if (pending.size === 0) break
      if (this.clock.now() + MIRROR_WAIT_POLL_MS > waitUntil) break
      await this.clock.sleep(MIRROR_WAIT_POLL_MS)
    }
    this.report.waitedMs = Math.max(0, this.clock.now() - this.startedAt)
    this.report.targets.submissions = found.length

    const refCandidates: MetaLeadMirrorTarget[] = []
    if (pending.size) {
      for (const ids of chunk([...pending], MIRROR_ID_CHUNK)) {
        const result = await timed(COMPASS_LEAD_REFS_VIEW, (signal) =>
          applyWindow(
            this.sb
              .from(COMPASS_LEAD_REFS_VIEW)
              .select(REF_COLUMNS)
              .eq("system", META_LEADGEN_REF_SYSTEM)
              .in("external_id", ids),
            "created_at",
            this.window,
            null
          ).abortSignal(signal)
        )
        if (result.error) {
          this.degrade(shortError(`${COMPASS_LEAD_REFS_VIEW} 읽기 실패 — 제출 행 대상만 처리`, result.error))
          break
        }
        for (const row of (result.data ?? []) as RefRow[]) {
          const target = refTarget(row)
          if (!target || !pending.has(target.leadgenId)) continue
          pending.delete(target.leadgenId)
          refCandidates.push(target)
        }
      }
    }
    const fallback = await this.withoutSubmission(refCandidates)
    this.report.targets.refsFallback = fallback.length
    this.report.targets.notVisible = pending.size + (refCandidates.length - fallback.length)
    return [...found, ...fallback]
  }

  /** 링크만 있는 대상 중 창 밖에라도 제출 행이 있는 것은 뺀다(폴백은 제출 행이 없을 때만) */
  private async withoutSubmission(candidates: MetaLeadMirrorTarget[]): Promise<MetaLeadMirrorTarget[]> {
    if (!candidates.length) return []
    const withSubmission = new Set<string>()
    for (const ids of chunk(
      candidates.map((target) => target.leadgenId),
      MIRROR_ID_CHUNK
    )) {
      const result = await timed(COMPASS_META_SUBMISSIONS_VIEW, (signal) =>
        this.sb.from(COMPASS_META_SUBMISSIONS_VIEW).select("leadgen_id").in("leadgen_id", ids).abortSignal(signal)
      )
      if (result.error) {
        this.degrade(shortError(`${COMPASS_META_SUBMISSIONS_VIEW} 확인 실패 — 링크 폴백 대상은 다음 실행`, result.error))
        return []
      }
      for (const row of (result.data ?? []) as SubmissionRow[]) {
        const id = text(row.leadgen_id)
        if (id) withSubmission.add(id)
      }
    }
    return candidates.filter((target) => !withSubmission.has(target.leadgenId))
  }

  // ③ 원장 대조
  private async classifyByLedger(targets: MetaLeadMirrorTarget[]): Promise<{
    apply: MetaLeadMirrorTarget[]
    retry: Array<{ target: MetaLeadMirrorTarget; publicLeadId: string }>
    abandon: string[]
  } | null> {
    const ledger = new Map<string, LedgerRow>()
    for (const ids of chunk(
      targets.map((target) => target.leadgenId),
      MIRROR_ID_CHUNK
    )) {
      const result = await timed(META_LEAD_MIRROR_LEDGER_TABLE, (signal) =>
        this.sb.from(META_LEAD_MIRROR_LEDGER_TABLE).select(LEDGER_COLUMNS).in("leadgen_id", ids).abortSignal(signal)
      )
      if (result.error) {
        this.fail("failed", shortError(`${META_LEAD_MIRROR_LEDGER_TABLE} 읽기 실패`, result.error))
        return null
      }
      for (const row of (result.data ?? []) as LedgerRow[]) {
        const id = text(row.leadgen_id)
        if (id) ledger.set(id, row)
      }
    }

    const now = this.clock.now()
    const apply: MetaLeadMirrorTarget[] = []
    const retry: Array<{ target: MetaLeadMirrorTarget; publicLeadId: string }> = []
    const abandon: string[] = []
    for (const target of targets) {
      const row = ledger.get(target.leadgenId)
      const state = row ? text(row.state) : null
      if (!row || !state || !LEDGER_DONE_STATES.has(state)) {
        apply.push(target)
        continue
      }
      this.report.targets.inLedger += 1
      const publicLeadId = text(row.public_lead_id)
      if (state !== "inserted" || text(row.origin) !== "compass_mirror" || row.side_effects_done_at != null || !publicLeadId) {
        continue
      }
      const updatedAt = Date.parse(text(row.updated_at) ?? "")
      if (!Number.isFinite(updatedAt)) continue
      const age = now - updatedAt
      if (age < MIRROR_EFFECTS_RETRY_MIN_AGE_MS) continue
      if (age > MIRROR_EFFECTS_RETRY_MAX_AGE_MS) {
        abandon.push(target.leadgenId)
        continue
      }
      retry.push({ target, publicLeadId })
    }
    this.report.targets.effectsRetry = retry.length
    return { apply, retry, abandon }
  }

  // ④ 신원
  private async loadIdentities(targets: MetaLeadMirrorTarget[]): Promise<Map<number, MetaLeadMirrorIdentity & { metaAdId: string | null; campaignId: string | null }> | null> {
    const identities = new Map<number, MetaLeadMirrorIdentity & { metaAdId: string | null; campaignId: string | null }>()
    const ids = [
      ...new Set(targets.map((target) => target.compassLeadId).filter((id): id is number => id != null)),
    ].sort((a, b) => a - b)
    for (const idChunk of chunk(ids, MIRROR_ID_CHUNK)) {
      const result = await timed(COMPASS_LEADS_VIEW, (signal) =>
        this.sb.from(COMPASS_LEADS_VIEW).select(IDENTITY_COLUMNS).in("id", idChunk).abortSignal(signal)
      )
      if (result.error) {
        this.fail("bridge_down", shortError(`${COMPASS_LEADS_VIEW} 읽기 실패`, result.error))
        return null
      }
      for (const row of (result.data ?? []) as IdentityRow[]) {
        const id = toInteger(row.id)
        if (id == null) continue
        identities.set(id, {
          name: text(row.name),
          phoneKey: text(row.phone_key),
          emailKey: text(row.email_key),
          metaAdId: text(row.meta_ad_id),
          campaignId: text(row.campaign_id),
        })
      }
    }
    return identities
  }

  /** 링크 폴백 대상의 광고 — 리드의 meta_ad_id, 이름은 compass_ads_v 최신 행(없으면 id 만). 실패하면 이번에는 뺀다. */
  private async fillRefAds(
    refTargets: MetaLeadMirrorTarget[],
    identities: Map<number, { metaAdId: string | null; campaignId: string | null }>
  ): Promise<boolean> {
    const adIds = new Set<string>()
    for (const target of refTargets) {
      const identity = target.compassLeadId == null ? undefined : identities.get(target.compassLeadId)
      if (identity?.metaAdId) adIds.add(identity.metaAdId)
    }
    const latest = new Map<string, AdRow>()
    for (const ids of chunk([...adIds].sort(), 50)) {
      const paged = await fetchSupabasePages<AdRow>({
        maxRows: 5_000,
        fetchPage: (from, to) =>
          timed(COMPASS_ADS_VIEW, (signal) =>
            this.sb
              .from(COMPASS_ADS_VIEW)
              .select(AD_COLUMNS)
              .in("ad_id", ids)
              .order("day", { ascending: false })
              .order("ad_id", { ascending: true })
              .range(from, to)
              .abortSignal(signal)
          ) as PromiseLike<SupabasePageResult>,
      })
      if (paged.error) {
        this.degrade(shortError(`${COMPASS_ADS_VIEW} 읽기 실패 — 링크 폴백 대상은 다음 실행`, paged.error))
        return false
      }
      for (const row of paged.data) {
        const id = text(row.ad_id)
        if (id && !latest.has(id)) latest.set(id, row)
      }
    }
    for (const target of refTargets) {
      const identity = target.compassLeadId == null ? undefined : identities.get(target.compassLeadId)
      const adId = identity?.metaAdId ?? null
      const ad = adId ? latest.get(adId) : undefined
      target.ad = {
        adId,
        adName: text(ad?.ad_name),
        adsetId: text(ad?.adset_id),
        adsetName: text(ad?.adset_name),
        campaignId: text(ad?.campaign_id) ?? identity?.campaignId ?? null,
        campaignName: text(ad?.campaign_name),
      }
    }
    return true
  }

  // ⑥ 적용
  private async applyRows(rows: MetaLeadMirrorApplyRow[], payloads: Map<string, LeadPayload>): Promise<boolean> {
    for (const batch of chunk(rows, MIRROR_APPLY_BATCH_SIZE)) {
      if (this.clock.now() >= this.deadlineAt) {
        this.timedOut = true
        this.report.errors.push("예산이 끝나 남은 적용 배치를 다음 실행에 넘김")
        return true
      }
      const result = await timed(META_LEAD_MIRROR_APPLY_RPC, (signal) =>
        this.sb.rpc(META_LEAD_MIRROR_APPLY_RPC, { p_rows: batch }).abortSignal(signal)
      )
      if (result.error) {
        this.fail("failed", shortError(`${META_LEAD_MIRROR_APPLY_RPC} 실패`, result.error))
        return false
      }
      this.report.applied.batches += 1

      const inserted: EffectsItem[] = []
      for (const out of (Array.isArray(result.data) ? result.data : []) as ApplyOutRow[]) {
        const action = text(out.out_action) ?? ""
        const leadgenId = text(out.out_leadgen_id) ?? ""
        if (action === "inserted") {
          this.report.applied.inserted += 1
          const leadId = text(out.out_public_lead_id)
          const payload = payloads.get(leadgenId)
          if (leadId) this.report.inserted.push({ leadgenId, leadId })
          if (leadId && payload) inserted.push({ leadgenId, leadId, payload })
        } else if (action === "blocked") this.report.applied.blocked += 1
        else if (action === "skipped") this.report.applied.skipped += 1
        else if (action === "outside_window") this.report.applied.outsideWindow += 1
        else if (action === "invalid") this.report.applied.invalid += 1
        else if (action.startsWith("exists_")) this.report.applied.existing += 1
      }
      await this.runEffects(inserted)
    }
    return true
  }

  // ⑦ 부수효과
  private async runEffects(items: EffectsItem[]): Promise<void> {
    if (!items.length) return
    if (!this.settings) {
      try {
        this.settings = await getResolvedSettings()
      } catch (error) {
        this.report.sideEffects.failed += items.length
        this.report.errors.push(shortError("설정 읽기 실패 — 부수효과는 다음 실행", error))
        return
      }
    }
    const settings = this.settings
    const toggles = mirrorLeadCaptureEffectToggles(this.cutover.sideEffects)
    const done: string[] = []
    let cursor = 0
    const worker = async () => {
      while (cursor < items.length) {
        const item = items[cursor]
        cursor += 1
        if (this.clock.now() >= this.deadlineAt) {
          this.timedOut = true
          this.report.sideEffects.deferred += 1
          continue
        }
        try {
          const deferred: Array<Promise<void>> = []
          const { errors } = await runLeadCaptureEffects(item.payload, {
            settings,
            stored: true,
            savedLeadId: item.leadId,
            conversionEventId: `lead:${item.leadId}`,
            toggles,
            context: { deferTask: (task) => void deferred.push(task()) },
          })
          await Promise.allSettled(deferred)
          this.report.sideEffects.ran += 1
          if (errors.length) this.report.sideEffects.deliveryErrors += 1
          done.push(item.leadgenId)
        } catch (error) {
          this.report.sideEffects.failed += 1
          this.report.errors.push(shortError(`부수효과 실패(leadgen ${item.leadgenId})`, error))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MIRROR_EFFECTS_CONCURRENCY, items.length) }, worker))
    if (done.length) await this.markSideEffects(done, "marked")
  }

  private async markSideEffects(leadgenIds: string[], counter: "marked" | "abandoned"): Promise<void> {
    const result = await timed(META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC, (signal) =>
      this.sb.rpc(META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC, { p_leadgen_ids: leadgenIds }).abortSignal(signal)
    )
    if (result.error) {
      this.report.errors.push(shortError(`${META_LEAD_MIRROR_MARK_SIDE_EFFECTS_RPC} 실패`, result.error))
      return
    }
    const count = typeof result.data === "number" ? result.data : Number(result.data ?? 0)
    this.report.sideEffects[counter] += Number.isFinite(count) ? count : 0
  }
}

function mirrorChanged(report: MetaLeadMirrorRunResult) {
  return report.applied.inserted + report.applied.skipped + report.sideEffects.abandoned > 0
}

function mirrorCounts(report: MetaLeadMirrorRunResult) {
  return {
    status: report.status,
    window: report.window?.kind ?? null,
    waitedMs: report.waitedMs,
    targets: report.targets,
    built: report.built,
    applied: report.applied,
    sideEffects: report.sideEffects,
    errors: report.errors.length,
  }
}

/**
 * Compass 제출 → public.leads 미러 한 번. 절대 던지지 않는다.
 * webhook after()·관리 실행이 부른다. 크론은 건강 경보·심장박동까지 하는 runMetaLeadMirrorCycle 을 부른다.
 * 바뀐 것이 있으면(dryRun 이 아닐 때) audit_logs 에 건수와 만든 행 id 를 남긴다.
 */
export async function runMetaLeadMirror(options: RunMetaLeadMirrorOptions): Promise<MetaLeadMirrorRunResult> {
  let report: MetaLeadMirrorRunResult
  try {
    report = await new MirrorPass(options).run()
  } catch (error) {
    report = emptyRunResult(options)
    report.status = "failed"
    report.errors.push(shortError("미러 실행 중 예외", error))
  }
  if (!report.dryRun && mirrorChanged(report)) {
    await recordMirrorAudit({ trigger: report.trigger, mode: report.mode, status: report.status, mirror: report, fallback: null })
  }
  return report
}

async function recordMirrorAudit(input: {
  trigger: MetaLeadMirrorTrigger
  mode: MetaLeadgenMode | null
  status: string
  mirror: MetaLeadMirrorRunResult
  fallback: MetaLeadMirrorFallbackStepResult | null
}): Promise<boolean> {
  try {
    await logAudit({
      actorUserId: null,
      actorDisplayName: AUDIT_ACTOR_NAME,
      action: AUDIT_ACTION,
      targetType: "meta_lead_mirror",
      payload: {
        trigger: input.trigger,
        mode: input.mode,
        status: input.status,
        mirror: mirrorCounts(input.mirror),
        inserted: input.mirror.inserted.slice(0, AUDIT_INSERTED_CAP),
        ...(input.mirror.inserted.length > AUDIT_INSERTED_CAP ? { insertedTruncated: true } : {}),
        ...(input.fallback ? { fallback: input.fallback } : {}),
      },
    })
    return true
  } catch (error) {
    console.error("[meta-lead-mirror] 감사 기록 실패:", errorLabel(error))
    return false
  }
}

// ─── H6d 건강 경보·심장박동 ───────────────────────────────────────────────────

/** 경보 대상 지표(건강 jsonb 키). h1b 는 h1 의 설명용 부분집합이라 따로 알리지 않는다. */
export const MIRROR_HEALTH_ALERT_METRICS = [
  "at_risk",
  "admin_only_saved",
  "fallback_failed",
  "h1_receipts_missing_in_compass_2h",
  "h2_mirror_backlog_30m",
  "h3_blocked",
  "h3b_skipped",
  "h4_duplicate_leadgens_with_mirror",
  "h5_refs_without_submission",
  "h6_side_effects_pending_1h",
] as const
export type MetaLeadMirrorHealthMetric = (typeof MIRROR_HEALTH_ALERT_METRICS)[number]

const CRITICAL_METRICS = new Set<MetaLeadMirrorHealthMetric>(["at_risk", "admin_only_saved"])
/** 누적 지표 — 0 으로 돌아가지 않으므로 "지난 기준보다 늘었을 때"만 알린다 */
const CUMULATIVE_METRICS = new Set<MetaLeadMirrorHealthMetric>(["h3b_skipped"])

const METRIC_LABELS: Record<MetaLeadMirrorHealthMetric, string> = {
  at_risk: "유실 위험(폴백 기한이 지나도 Compass·어드민 어디에도 없음)",
  admin_only_saved: "어드민에만 저장됨(Compass 등록 필요)",
  fallback_failed: "폴백 실패 대기",
  h1_receipts_missing_in_compass_2h: "증인 중 2시간 넘게 Compass 에 없음",
  h2_mirror_backlog_30m: "미러 밀림(30분 넘게 원장에 없음)",
  h3_blocked: "미러 insert 막힘",
  h3b_skipped: "미러 건너뜀 증가(Compass 리드 삭제)",
  h4_duplicate_leadgens_with_mirror: "같은 leadgen 이 리드 2행 이상",
  h5_refs_without_submission: "제출 행 없는 Compass 링크",
  h6_side_effects_pending_1h: "미러 부수효과 1시간 넘게 미완",
}

export function metaLeadMirrorMetricSeverity(metric: MetaLeadMirrorHealthMetric): NotificationSeverity {
  return CRITICAL_METRICS.has(metric) ? "critical" : "warning"
}

export type MetaLeadMirrorAlertEntry = { lastAlertAt?: string; lastValue?: number; baseline?: number }
export type MetaLeadMirrorAlertState = Partial<Record<MetaLeadMirrorHealthMetric, MetaLeadMirrorAlertEntry>>

export function parseMetaLeadMirrorAlertState(value: unknown): MetaLeadMirrorAlertState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const state: MetaLeadMirrorAlertState = {}
  for (const metric of MIRROR_HEALTH_ALERT_METRICS) {
    const entry = (value as Record<string, unknown>)[metric]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const raw = entry as Record<string, unknown>
    const parsed: MetaLeadMirrorAlertEntry = {}
    if (typeof raw.lastAlertAt === "string" && Number.isFinite(Date.parse(raw.lastAlertAt))) parsed.lastAlertAt = raw.lastAlertAt
    if (typeof raw.lastValue === "number" && Number.isFinite(raw.lastValue)) parsed.lastValue = raw.lastValue
    if (typeof raw.baseline === "number" && Number.isFinite(raw.baseline)) parsed.baseline = raw.baseline
    state[metric] = parsed
  }
  return state
}

export function readMetaLeadMirrorHealthMetrics(health: Record<string, unknown>): Record<MetaLeadMirrorHealthMetric, number | null> {
  const metrics = {} as Record<MetaLeadMirrorHealthMetric, number | null>
  for (const metric of MIRROR_HEALTH_ALERT_METRICS) {
    const value = health[metric]
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
    metrics[metric] = Number.isFinite(parsed) ? parsed : null
  }
  return metrics
}

function throttleOpen(entry: MetaLeadMirrorAlertEntry | undefined, nowMs: number) {
  if (!entry?.lastAlertAt) return true
  return nowMs - Date.parse(entry.lastAlertAt) >= MIRROR_ALERT_THROTTLE_MS
}

/** 이번 실행에 알릴 지표. 값이 없는(null) 지표는 건너뛴다. */
export function dueMetaLeadMirrorAlerts(
  metrics: Record<MetaLeadMirrorHealthMetric, number | null>,
  state: MetaLeadMirrorAlertState,
  nowMs: number
): Array<{ metric: MetaLeadMirrorHealthMetric; value: number; severity: NotificationSeverity }> {
  const due: Array<{ metric: MetaLeadMirrorHealthMetric; value: number; severity: NotificationSeverity }> = []
  for (const metric of MIRROR_HEALTH_ALERT_METRICS) {
    const value = metrics[metric]
    if (value == null || value <= 0) continue
    const entry = state[metric]
    if (CUMULATIVE_METRICS.has(metric) && value <= (entry?.baseline ?? 0)) continue
    if (!throttleOpen(entry, nowMs)) continue
    due.push({ metric, value, severity: metaLeadMirrorMetricSeverity(metric) })
  }
  return due
}

/**
 * 다음 alert_state. sent=true 면 due 지표의 lastAlertAt 을 지금으로 올린다.
 * 수준 지표가 0 이 되면 항목을 지운다(다시 생기면 바로 알린다). 누적 지표는 알린 값을 기준으로 삼고,
 * 값이 줄면 기준도 따라 내린다. 값이 없는(null) 지표는 이전 상태를 유지한다.
 */
export function nextMetaLeadMirrorAlertState(
  metrics: Record<MetaLeadMirrorHealthMetric, number | null>,
  state: MetaLeadMirrorAlertState,
  due: Array<{ metric: MetaLeadMirrorHealthMetric; value: number }>,
  sent: boolean,
  nowMs: number
): MetaLeadMirrorAlertState {
  const next: MetaLeadMirrorAlertState = {}
  const dueMetrics = new Set(due.map((item) => item.metric))
  const nowIso = new Date(nowMs).toISOString()
  for (const metric of MIRROR_HEALTH_ALERT_METRICS) {
    const value = metrics[metric]
    const entry = state[metric]
    if (value == null) {
      if (entry) next[metric] = entry
      continue
    }
    if (CUMULATIVE_METRICS.has(metric)) {
      const baseline = entry?.baseline ?? 0
      if (sent && dueMetrics.has(metric)) next[metric] = { baseline: value, lastAlertAt: nowIso }
      else if (value < baseline) next[metric] = { ...entry, baseline: value }
      else if (entry) next[metric] = entry
      continue
    }
    if (value <= 0) continue
    if (sent && dueMetrics.has(metric)) next[metric] = { lastAlertAt: nowIso, lastValue: value }
    else if (entry) next[metric] = entry
  }
  return next
}

export interface MetaLeadMirrorHealthReport {
  ok: boolean
  error?: string
  mode: string | null
  staleMinutes: number | null
  views: { submissions: boolean; refs: boolean; failures: boolean } | null
  metrics: Record<MetaLeadMirrorHealthMetric, number | null>
  /** 스로틀을 통과해 이번에 알릴(dryRun 이면 알렸을) 지표 */
  due: MetaLeadMirrorHealthMetric[]
  /** 실제로 알린 지표 */
  alerted: MetaLeadMirrorHealthMetric[]
  alertError?: string
}

/** 폴백 훅(H6b)이 돌려주는 요약 — 건수만 */
export interface MetaLeadMirrorFallbackStepResult {
  status: "ok" | "failed" | "timeout"
  /** public.leads·원장을 바꾼 건수(감사 판단) */
  changed: number
  counts: Record<string, number>
  error?: string
}

export interface MetaLeadMirrorFallbackContext {
  cutover: MetaLeadgenCutover | null
  dryRun: boolean
  deadlineAt: number
}

export type MetaLeadMirrorCycleStatus =
  | "ok"
  | "skipped"
  | "at_risk"
  | "blocked"
  | "bridge_down"
  | "failed"
  | "timeout"

export interface RunMetaLeadMirrorCycleOptions {
  trigger: "cron" | "admin"
  dryRun?: boolean
  deadlineAt?: number
  /** 미러 뒤·건강 앞에 도는 폴백(H6b). 없으면 건너뛴다 */
  fallback?: (context: MetaLeadMirrorFallbackContext) => Promise<MetaLeadMirrorFallbackStepResult>
  clock?: MetaLeadMirrorClock
}

export interface MetaLeadMirrorCycleReport {
  /** 우선순위: failed > at_risk > bridge_down > timeout > blocked > ok(shadow 포함) · skipped */
  status: MetaLeadMirrorCycleStatus
  trigger: "cron" | "admin"
  dryRun: boolean
  mode: MetaLeadgenMode | null
  mirror: MetaLeadMirrorRunResult
  fallback: MetaLeadMirrorFallbackStepResult | null
  health: MetaLeadMirrorHealthReport | null
  heartbeat: { written: boolean; error?: string }
  audited: boolean
}

type StateRead = { ok: true; alertState: MetaLeadMirrorAlertState } | { ok: false; error: string }

async function readMirrorState(sb: SupabaseClient): Promise<StateRead> {
  const result = await timed(META_LEAD_MIRROR_STATE_TABLE, (signal) =>
    sb.from(META_LEAD_MIRROR_STATE_TABLE).select("alert_state").eq("id", "default").abortSignal(signal).maybeSingle()
  )
  if (result.error) return { ok: false, error: shortError(`${META_LEAD_MIRROR_STATE_TABLE} 읽기 실패`, result.error) }
  const row = result.data as { alert_state?: unknown } | null
  return { ok: true, alertState: parseMetaLeadMirrorAlertState(row?.alert_state) }
}

function emptyMetrics(): Record<MetaLeadMirrorHealthMetric, number | null> {
  return readMetaLeadMirrorHealthMetrics({})
}

async function checkHealth(
  sb: SupabaseClient | null,
  dryRun: boolean,
  nowMs: number
): Promise<{ report: MetaLeadMirrorHealthReport; nextAlertState: MetaLeadMirrorAlertState | null }> {
  const report: MetaLeadMirrorHealthReport = {
    ok: false,
    mode: null,
    staleMinutes: null,
    views: null,
    metrics: emptyMetrics(),
    due: [],
    alerted: [],
  }
  if (!sb) {
    report.error = "Supabase 클라이언트 없음"
    return { report, nextAlertState: null }
  }
  const result = await timed(META_LEAD_MIRROR_HEALTH_RPC, (signal) => sb.rpc(META_LEAD_MIRROR_HEALTH_RPC).abortSignal(signal))
  if (result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    report.error = result.error
      ? shortError(`${META_LEAD_MIRROR_HEALTH_RPC} 실패`, result.error)
      : `${META_LEAD_MIRROR_HEALTH_RPC}: 객체가 아닌 응답`
    return { report, nextAlertState: null }
  }
  const health = result.data as Record<string, unknown>
  report.ok = true
  report.mode = text(health.mode)
  report.staleMinutes = typeof health.stale_minutes === "number" ? health.stale_minutes : null
  const views = health.views as Record<string, unknown> | undefined
  report.views = views
    ? { submissions: views.submissions === true, refs: views.refs === true, failures: views.failures === true }
    : null
  report.metrics = readMetaLeadMirrorHealthMetrics(health)

  const stateRead = await readMirrorState(sb)
  const state = stateRead.ok ? stateRead.alertState : {}
  let due = dueMetaLeadMirrorAlerts(report.metrics, state, nowMs)
  if (!stateRead.ok) {
    // 스로틀 상태를 못 읽으면 치명 지표만 알린다(10분마다 경고가 쏟아지지 않게)
    report.alertError = stateRead.error
    due = due.filter((item) => item.severity === "critical")
  }
  report.due = due.map((item) => item.metric)
  if (dryRun) return { report, nextAlertState: null }

  let sent = false
  if (due.length) {
    const critical = due.some((item) => item.severity === "critical")
    try {
      await emitNotificationEvent({
        eventType: "integration.webhook_failed",
        notificationType: "incident",
        categoryTag: "system",
        severity: critical ? "critical" : "warning",
        scopeTag: "critical_control",
        title: critical ? "Meta 리드 유실 위험 — 확인 필요" : "Meta 리드 미러 경고",
        message: due
          .map((item) => `${METRIC_LABELS[item.metric]} ${item.value}건`)
          .join(" | "),
        routeUrl: "/admin/settings",
        source: "meta_lead_mirror",
        payload: {
          mode: report.mode,
          staleMinutes: report.staleMinutes,
          metrics: Object.fromEntries(due.map((item) => [item.metric, item.value])),
        },
        channels: ["wecom_webhook", "email"],
      })
      sent = true
      report.alerted = due.map((item) => item.metric)
    } catch (error) {
      report.alertError = shortError("경보 전송 실패", error)
    }
  }
  if (!stateRead.ok) return { report, nextAlertState: null }
  return { report, nextAlertState: nextMetaLeadMirrorAlertState(report.metrics, state, due, sent, nowMs) }
}

function cycleStatus(report: MetaLeadMirrorCycleReport): MetaLeadMirrorCycleStatus {
  const mirror = report.mirror.status
  const metrics = report.health?.metrics
  if (mirror === "failed" || report.fallback?.status === "failed" || (report.health && !report.health.ok)) return "failed"
  if ((metrics?.at_risk ?? 0) > 0) return "at_risk"
  if (mirror === "bridge_down") return "bridge_down"
  if (mirror === "timeout" || report.fallback?.status === "timeout") return "timeout"
  if ((metrics?.h3_blocked ?? 0) > 0) return "blocked"
  return "ok"
}

async function writeHeartbeat(
  sb: SupabaseClient | null,
  nowMs: number,
  status: MetaLeadMirrorCycleStatus,
  summary: Record<string, unknown>,
  alertState: MetaLeadMirrorAlertState | null
): Promise<{ written: boolean; error?: string }> {
  if (!sb) return { written: false, error: "Supabase 클라이언트 없음" }
  const nowIso = new Date(nowMs).toISOString()
  const update: Record<string, unknown> = {
    last_run_at: nowIso,
    last_run_status: status,
    last_summary: summary,
    updated_at: nowIso,
  }
  if (alertState) update.alert_state = alertState
  const result = await timed(META_LEAD_MIRROR_STATE_TABLE, (signal) =>
    sb.from(META_LEAD_MIRROR_STATE_TABLE).update(update).eq("id", "default").abortSignal(signal)
  )
  if (result.error) return { written: false, error: shortError(`${META_LEAD_MIRROR_STATE_TABLE} 심장박동 실패`, result.error) }
  return { written: true }
}

/**
 * 크론·관리 실행 한 사이클: 미러 → 폴백(훅) → 건강 경보 → 심장박동 → 감사(바뀐 실행만). 절대 던지지 않는다.
 * mode=admin 이고 mirror_since 가 없으면 심장박동만 쓰고 skipped 다.
 * dryRun 은 경보·심장박동·감사를 쓰지 않는다(건강 RPC 는 읽기 전용이라 부른다).
 */
export async function runMetaLeadMirrorCycle(options: RunMetaLeadMirrorCycleOptions): Promise<MetaLeadMirrorCycleReport> {
  const clock = options.clock ?? systemClock
  const dryRun = options.dryRun === true
  const deadlineAt = options.deadlineAt ?? clock.now() + MIRROR_RUN_BUDGET_MS
  const passOptions: RunMetaLeadMirrorOptions = { trigger: options.trigger, dryRun, deadlineAt, clock }

  let cutover: MetaLeadgenCutover | null = null
  let cutoverError: string | null = null
  try {
    cutover = await readMetaLeadgenCutover()
  } catch (error) {
    cutoverError = shortError("전환 스위치 읽기 실패", error)
  }

  let sb: SupabaseClient | null = null
  try {
    sb = createSupabaseAdminClient()
  } catch (error) {
    cutoverError ??= shortError("Supabase 클라이언트 생성 실패", error)
  }

  const report: MetaLeadMirrorCycleReport = {
    status: "ok",
    trigger: options.trigger,
    dryRun,
    mode: cutover?.mode ?? null,
    mirror: emptyRunResult(passOptions),
    fallback: null,
    health: null,
    heartbeat: { written: false },
    audited: false,
  }

  if (cutover && cutover.mode === "admin" && !cutover.mirrorSince) {
    report.status = "skipped"
    report.mirror.mode = cutover.mode
    report.mirror.status = "skipped"
    if (!dryRun) {
      report.heartbeat = await writeHeartbeat(sb, clock.now(), "skipped", { trigger: options.trigger, mode: "admin" }, null)
    }
    return report
  }

  try {
    report.mirror = await new MirrorPass(passOptions).run(cutover ? { cutover } : { error: cutoverError ?? "전환 스위치 없음" })
  } catch (error) {
    report.mirror.status = "failed"
    report.mirror.errors.push(shortError("미러 실행 중 예외", error))
  }

  if (options.fallback) {
    try {
      report.fallback = await options.fallback({ cutover, dryRun, deadlineAt })
    } catch (error) {
      report.fallback = { status: "failed", changed: 0, counts: {}, error: shortError("폴백 실행 중 예외", error) }
    }
  }

  const health = await checkHealth(sb, dryRun, clock.now())
  report.health = health.report
  report.status = cycleStatus(report)

  if (dryRun) return report

  report.heartbeat = await writeHeartbeat(
    sb,
    clock.now(),
    report.status,
    {
      trigger: options.trigger,
      mode: report.mode,
      mirror: mirrorCounts(report.mirror),
      ...(report.fallback ? { fallback: { status: report.fallback.status, changed: report.fallback.changed, counts: report.fallback.counts } } : {}),
      health: report.health.ok ? report.health.metrics : { error: true },
      alerted: report.health.alerted,
    },
    health.nextAlertState
  )

  if (mirrorChanged(report.mirror) || (report.fallback?.changed ?? 0) > 0) {
    report.audited = await recordMirrorAudit({
      trigger: options.trigger,
      mode: report.mode,
      status: report.status,
      mirror: report.mirror,
      fallback: report.fallback,
    })
  }
  return report
}
