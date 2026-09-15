import "server-only"

// 어드민 폴백 — Compass 에 흔적이 없는 compass 모드 증인을 어드민 앱 토큰으로 대신 저장한다
// (설계 META-RECEIVER-FINAL §4-2 H6b, 이식 G2).
//
// 한 번의 폴백(runMetaLeadFallback):
//  ① meta_lead_fallback_claim(20) — fallback_after_minutes 가 지나도 Compass 제출 행·lead_refs 가 없는 compass
//     모드 증인을 원장 fallback_pending 으로 선점한다(RPC 안에서 adopt 가 먼저 돈다 → 끝나지 않은 앞 실행이 만든
//     행은 여기서 inserted 로 바로잡힌다).
//  ② leadgen 마다 fetchMetaLeadDetail(어드민 토큰). **상세가 없으면 저장하지 않고 failed** — 빈 껍데기 행을 만들지
//     않는다(field_data 에 값이 하나도 없는 응답도 실패로 본다).
//  ③ submitLeadCapture(buildLeadCapturePayload(증인, 상세)) — 어드민 웹훅과 같은 빌더·같은 부수효과.
//     400 이 이메일 형식 때문이면(이메일만 빼면 조립되면) 이메일을 비워 한 번 더 부른다.
//  ④ meta_lead_fallback_finish(id, inserted·failed, leadId, 오류).
//     - 저장 성공(stored) → inserted · 그 밖 → failed(지수 대기 10·20·40…분).
//     - **60초 중복으로 저장 안 함(ok·stored=false)도 failed(capture_deduped)다 — deduped 로 닫지 않는다.**
//       선점은 leadgen 마다 하나이고 같은 leadgen 의 재선점은 15분 이상 떨어지므로, 폴백 안에서 60초 키
//       (source·ad_name·이메일/전화)가 부딪히는 상대는 늘 **다른 leadgen**(같은 사람의 다른 제출)이다.
//       deduped → 원장 skipped 로 닫으면 그 제출은 Compass 에도 public.leads 에도 없는데 at_risk·admin_only_saved·
//       V5 MISSING 어디에도 안 잡힌다. failed 로 두면 10분 뒤 재시도가 60초 창 밖에서 저장한다(웹훅과 같은 leadgen 당 1행).
//       SQL finish 는 'deduped' 를 여전히 받지만(검증된 SQL 원문 유지) 폴백은 보내지 않는다.
//     - finish 가 not_pending 인데 이번에 행을 만들었으면 원장이 다른 행을 가리키는지 보고, 그렇다면 같은 leadgen 이
//       public.leads 에 2행일 수 있으니 경보한다(건강 H4 와 같은 뜻).
//
// 규칙:
//  - **모드와 무관하게 돈다.** 스위치를 읽지 않는다(롤백 뒤에도 compass 구간 증인은 끝까지 간다 — 로컬 F9).
//  - 절대 던지지 않는다. 쓰기는 public 에만(RPC 둘). 오류·경보에는 식별자와 건수만 싣고 이름·전화·이메일 값은 싣지 않는다.
//  - 예산이 끝나면 선점했지만 시작하지 않은 leadgen 은 fallback_pending 으로 둔다 — 15분 뒤 다시 선점된다(로컬 F6).
//  - dryRun 은 선점하지 않는다(선점 자체가 원장 쓰기다).
//  - 어드민에만 저장된 리드(admin_only_saved)의 치명 경보는 같은 사이클의 건강 단계(H6d)가 낸다.

import type { SupabaseClient } from "@supabase/supabase-js"

import { fetchMetaLeadDetail } from "@/lib/meta/lead-ads-graph"
import { buildLeadCapturePayload, type MetaLeadDetail, type MetaLeadValue } from "@/lib/meta/lead-ads-payload"
import { META_LEAD_MIRROR_LEDGER_TABLE } from "@/lib/meta/leadgen-cutover"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { buildLeadPayload, submitLeadCapture, type LeadSubmissionResult } from "@/lib/server/lead-capture"
import type {
  MetaLeadMirrorClock,
  MetaLeadMirrorFallbackContext,
  MetaLeadMirrorFallbackStepResult,
} from "@/lib/server/meta-lead-mirror"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// ─── 이름·상수 ───────────────────────────────────────────────────────────────

export const META_LEAD_FALLBACK_CLAIM_RPC = "meta_lead_fallback_claim"
export const META_LEAD_FALLBACK_FINISH_RPC = "meta_lead_fallback_finish"

/** 한 번에 선점하는 증인 수 — 설계 §4-2 H6b `meta_lead_fallback_claim(20)` */
export const FALLBACK_CLAIM_LIMIT = 20
/** 동시에 처리하는 leadgen 수 */
export const FALLBACK_CONCURRENCY = 4
/** 한 번 실행의 기본 예산(단독 호출). 크론 사이클은 deadlineAt 을 넘긴다 */
export const FALLBACK_RUN_BUDGET_MS = 40_000
/** 남은 예산이 이보다 적으면 선점하지 않는다(선점만 하고 못 끝내면 15분 동안 묶인다) */
export const FALLBACK_MIN_CLAIM_BUDGET_MS = 8_000
/** Graph 상세 조회 상한 */
export const FALLBACK_DETAIL_TIMEOUT_MS = 10_000
/** RPC 상한 */
export const FALLBACK_RPC_TIMEOUT_MS = 10_000
/** finish 오류 문자열 상한(SQL 이 200자로 다시 자른다) */
const FALLBACK_ERROR_MAX = 180
/** 경보·결과에 싣는 식별자 수 상한 */
const FALLBACK_ID_CAP = 50

const LEADGEN_ID_PATTERN = /^[0-9]+$/

// ─── 공개 타입 ───────────────────────────────────────────────────────────────

/** 폴백이 finish 에 보내는 결과. SQL 은 'deduped' 도 받지만 폴백은 쓰지 않는다(머리 주석 ④) */
export type MetaLeadFallbackOutcome = "inserted" | "failed"

/** failed 의 원인 분류(finish p_error 의 앞머리) */
export type MetaLeadFallbackFailureReason =
  | "detail_fetch_failed"
  | "detail_empty"
  | "capture_rejected"
  | "capture_not_stored"
  /** 60초 중복 키 충돌(ok·stored=false) — 폴백 안에서는 늘 다른 leadgen 과의 충돌이라 재시도한다 */
  | "capture_deduped"
  | "capture_error"

export interface RunMetaLeadFallbackOptions {
  dryRun?: boolean
  /** epoch ms — 이 시각 뒤로는 선점·새 leadgen 처리를 시작하지 않는다. 기본: 지금 + 40초 */
  deadlineAt?: number
  /** 선점 수(기본 20) */
  limit?: number
  clock?: Pick<MetaLeadMirrorClock, "now">
}

export interface MetaLeadFallbackRunResult {
  /** ok: 선점한 것을 모두 끝냈다(0건 포함) · failed: 선점·finish RPC 실패 · timeout: 예산이 끝나 남겼다 */
  status: "ok" | "failed" | "timeout"
  dryRun: boolean
  claimed: number
  inserted: number
  failed: number
  /** 이메일 형식 오류로 이메일을 비우고 저장한 수 */
  emailDropped: number
  /** 선점했지만 예산이 끝나 시작하지 않은 수 — fallback_pending 으로 남아 15분 뒤 다시 선점된다 */
  deferred: number
  /** finish 가 not_pending 을 돌려준 수 */
  notPending: number
  /** 그중 이번에 행을 만들었는데 원장이 다른 행(또는 없음)을 가리킨 수 — 중복 가능, 경보 대상 */
  notPendingDuplicate: number
  /** finish RPC 자체가 실패한 수(행은 다음 선점의 adopt·15분 재선점이 바로잡는다) */
  finishErrors: number
  failureReasons: Partial<Record<MetaLeadFallbackFailureReason, number>>
  /** 이번에 만든 public.leads 행(감사 근거, 식별자만) */
  insertedRows: Array<{ leadgenId: string; leadId: string }>
  /** not_pending 중복 경보를 보냈는지 */
  alerted: boolean
  /** 오류 메시지(값·PII 없음) */
  errors: string[]
}

export interface MetaLeadFallbackClaim {
  leadgenId: string
  pageId: string | null
  formId: string | null
  adId: string | null
  attempt: number | null
}

// ─── 순수 도우미 ─────────────────────────────────────────────────────────────

type ClaimRow = {
  out_leadgen_id?: unknown
  out_page_id?: unknown
  out_form_id?: unknown
  out_ad_id?: unknown
  out_attempt?: unknown
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

/** claim RPC 행 → 선점 목록. 숫자가 아닌 id 는 버린다(원장 check 가 이미 막는다). */
export function parseMetaLeadFallbackClaims(data: unknown): MetaLeadFallbackClaim[] {
  if (!Array.isArray(data)) return []
  const claims: MetaLeadFallbackClaim[] = []
  const seen = new Set<string>()
  for (const row of data as ClaimRow[]) {
    const leadgenId = text(row?.out_leadgen_id)
    if (!leadgenId || !LEADGEN_ID_PATTERN.test(leadgenId) || seen.has(leadgenId)) continue
    seen.add(leadgenId)
    const attempt = typeof row.out_attempt === "number" ? row.out_attempt : Number(row.out_attempt)
    claims.push({
      leadgenId,
      pageId: text(row.out_page_id),
      formId: text(row.out_form_id),
      adId: text(row.out_ad_id),
      attempt: Number.isInteger(attempt) ? attempt : null,
    })
  }
  return claims
}

/** 증인 → 웹훅 value 모양(빌더의 message 줄 leadgen_id·page_id·form_id·ad 가 웹훅과 같게) */
export function metaLeadFallbackValue(claim: MetaLeadFallbackClaim): MetaLeadValue {
  return {
    leadgen_id: claim.leadgenId,
    ...(claim.pageId ? { page_id: claim.pageId } : {}),
    ...(claim.formId ? { form_id: claim.formId } : {}),
    ...(claim.adId ? { ad_id: claim.adId } : {}),
  }
}

/**
 * 저장해도 되는 상세인가 — 객체이고, id 가 있으면 요청한 leadgen 과 같고, field_data 에 값이 하나 이상 있다.
 * 아니면 빈 껍데기 행이 되므로 저장하지 않는다.
 */
export function isUsableMetaLeadDetail(detail: unknown, leadgenId: string): detail is MetaLeadDetail {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return false
  const record = detail as MetaLeadDetail
  if (record.id != null && String(record.id) !== leadgenId) return false
  if (!Array.isArray(record.field_data)) return false
  return record.field_data.some(
    (field) =>
      Array.isArray(field?.values) && field.values.some((value) => typeof value === "string" && value.trim() !== "")
  )
}

/** buildLeadPayload 가 이메일 형식 때문에만 거절하는가(이메일을 빼면 조립된다) */
export function isEmailOnlyRejection(payload: Record<string, unknown>): boolean {
  if (typeof payload.email !== "string" || !payload.email.trim()) return false
  try {
    buildLeadPayload(payload)
    return false
  } catch {
    try {
      buildLeadPayload({ ...payload, email: undefined })
      return true
    } catch {
      return false
    }
  }
}

/**
 * submitLeadCapture 결과 → finish 결과.
 * ok·stored=false(60초 중복)는 failed(capture_deduped) — 폴백 안에서는 다른 leadgen 과의 충돌이므로 닫지 않고
 * 지수 대기 뒤 다시 저장한다(머리 주석 ④).
 */
export function classifyMetaLeadFallbackCapture(
  result: LeadSubmissionResult
): { outcome: "inserted"; leadId: string } | { outcome: "failed"; reason: MetaLeadFallbackFailureReason; error: string } {
  const body = result.body
  if (result.status < 400 && body.ok) {
    if (body.stored && typeof body.leadId === "string" && body.leadId) return { outcome: "inserted", leadId: body.leadId }
    if (!body.stored) {
      return { outcome: "failed", reason: "capture_deduped", error: "60초 중복 키 충돌(다른 leadgen) — 창이 지난 뒤 재시도" }
    }
    return { outcome: "failed", reason: "capture_error", error: "저장됐다고 했지만 leadId 없음" }
  }
  const message = body.ok ? "" : body.error
  return {
    outcome: "failed",
    reason: result.status === 502 ? "capture_not_stored" : "capture_rejected",
    error: `submitLeadCapture ${result.status}${message ? `: ${message}` : ""}`,
  }
}

function errorLabel(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message)
  return String(error)
}

function clip(value: string, max = FALLBACK_ERROR_MAX): string {
  const oneLine = value.replace(/\s+/g, " ").trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 3)}...` : oneLine
}

function shortError(label: string, error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined
  return clip(`${label}: ${errorLabel(error)}${typeof code === "string" && code ? ` (${code})` : ""}`, 240)
}

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null }

/** 한 번의 호출 — 오류·예외·시간 초과를 모두 { error } 로 돌려준다(던지지 않음). */
async function timed(label: string, timeoutMs: number, run: (signal: AbortSignal) => PromiseLike<RpcResult>): Promise<RpcResult> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<RpcResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve({ data: null, error: { message: `${label}: ${timeoutMs}ms 초과` } })
    }, timeoutMs)
  })
  try {
    const call = Promise.resolve()
      .then(() => run(controller.signal))
      .then(
        (result) => result,
        (error: unknown) => ({ data: null, error: { message: errorLabel(error) } }) as RpcResult
      )
    return await Promise.race([call, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Graph 상세 — 상한을 넘기면 실패로 본다(늦게 온 응답으로는 저장하지 않는다). */
async function fetchDetailWithTimeout(leadgenId: string, timeoutMs: number): Promise<MetaLeadDetail> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Meta lead fetch: ${timeoutMs}ms 초과`)), timeoutMs)
  })
  try {
    return await Promise.race([fetchMetaLeadDetail(leadgenId), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function emptyResult(dryRun: boolean): MetaLeadFallbackRunResult {
  return {
    status: "ok",
    dryRun,
    claimed: 0,
    inserted: 0,
    failed: 0,
    emailDropped: 0,
    deferred: 0,
    notPending: 0,
    notPendingDuplicate: 0,
    finishErrors: 0,
    failureReasons: {},
    insertedRows: [],
    alerted: false,
    errors: [],
  }
}

// ─── 한 번의 폴백 ────────────────────────────────────────────────────────────

type ItemResult =
  | { outcome: "inserted"; leadId: string; emailDropped: boolean }
  | { outcome: "failed"; reason: MetaLeadFallbackFailureReason; error: string }

async function captureClaim(claim: MetaLeadFallbackClaim, detailTimeoutMs: number): Promise<ItemResult> {
  let detail: MetaLeadDetail
  try {
    detail = await fetchDetailWithTimeout(claim.leadgenId, detailTimeoutMs)
  } catch (error) {
    return { outcome: "failed", reason: "detail_fetch_failed", error: errorLabel(error) }
  }
  if (!isUsableMetaLeadDetail(detail, claim.leadgenId)) {
    return { outcome: "failed", reason: "detail_empty", error: "Meta 리드 상세에 field_data 값이 없음(빈 껍데기 저장 안 함)" }
  }

  const payload = buildLeadCapturePayload(metaLeadFallbackValue(claim), detail) as Record<string, unknown>
  let emailDropped = false
  let result: LeadSubmissionResult
  try {
    result = await submitLeadCapture(payload)
    if (result.status === 400 && isEmailOnlyRejection(payload)) {
      emailDropped = true
      result = await submitLeadCapture({ ...payload, email: undefined })
    }
  } catch (error) {
    return { outcome: "failed", reason: "capture_error", error: `submitLeadCapture 예외: ${errorLabel(error)}` }
  }

  const classified = classifyMetaLeadFallbackCapture(result)
  if (classified.outcome === "inserted") return { ...classified, emailDropped }
  return classified
}

async function finishClaim(
  sb: SupabaseClient,
  leadgenId: string,
  outcome: MetaLeadFallbackOutcome,
  leadId: string | null,
  error: string | null
): Promise<{ state: string | null; error?: string }> {
  const result = await timed(META_LEAD_FALLBACK_FINISH_RPC, FALLBACK_RPC_TIMEOUT_MS, (signal) =>
    sb
      .rpc(META_LEAD_FALLBACK_FINISH_RPC, {
        p_leadgen_id: leadgenId,
        p_result: outcome,
        p_public_lead_id: leadId,
        p_error: error,
      })
      .abortSignal(signal)
  )
  if (result.error) return { state: null, error: shortError(`${META_LEAD_FALLBACK_FINISH_RPC} 실패(leadgen ${leadgenId})`, result.error) }
  return { state: typeof result.data === "string" ? result.data : null }
}

/** not_pending 뒤 원장이 이번 행을 가리키는가(동시에 돈 선점의 adopt 가 같은 행을 들였으면 중복이 아니다) */
async function ledgerPointsTo(sb: SupabaseClient, leadgenId: string, leadId: string): Promise<boolean | null> {
  const result = await timed(META_LEAD_MIRROR_LEDGER_TABLE, FALLBACK_RPC_TIMEOUT_MS, (signal) =>
    sb
      .from(META_LEAD_MIRROR_LEDGER_TABLE)
      .select("leadgen_id,public_lead_id")
      .eq("leadgen_id", leadgenId)
      .abortSignal(signal)
      .maybeSingle()
  )
  if (result.error) return null
  const row = result.data as { public_lead_id?: unknown } | null
  return text(row?.public_lead_id) === leadId
}

/**
 * 어드민 폴백 한 번. 절대 던지지 않는다. 모드와 무관하게 돈다.
 * 크론 사이클에는 metaLeadFallbackStep 으로 붙인다(runMetaLeadMirrorCycle 의 fallback 훅).
 */
export async function runMetaLeadFallback(options: RunMetaLeadFallbackOptions = {}): Promise<MetaLeadFallbackRunResult> {
  const now = () => (options.clock ?? Date).now()
  const dryRun = options.dryRun === true
  const report = emptyResult(dryRun)
  if (dryRun) return report

  const deadlineAt = options.deadlineAt ?? now() + FALLBACK_RUN_BUDGET_MS
  if (deadlineAt - now() < FALLBACK_MIN_CLAIM_BUDGET_MS) {
    report.status = "timeout"
    report.errors.push("남은 예산이 적어 폴백 선점을 다음 실행에 넘김")
    return report
  }

  let sb: SupabaseClient
  try {
    sb = createSupabaseAdminClient()
  } catch (error) {
    report.status = "failed"
    report.errors.push(shortError("Supabase 클라이언트 생성 실패", error))
    return report
  }

  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? FALLBACK_CLAIM_LIMIT)))
  const claimed = await timed(META_LEAD_FALLBACK_CLAIM_RPC, FALLBACK_RPC_TIMEOUT_MS, (signal) =>
    sb.rpc(META_LEAD_FALLBACK_CLAIM_RPC, { p_limit: limit }).abortSignal(signal)
  )
  if (claimed.error) {
    report.status = "failed"
    report.errors.push(shortError(`${META_LEAD_FALLBACK_CLAIM_RPC} 실패`, claimed.error))
    return report
  }
  const claims = parseMetaLeadFallbackClaims(claimed.data)
  report.claimed = claims.length
  if (!claims.length) return report

  const duplicates: Array<{ leadgenId: string; leadId: string }> = []
  let finishFailed = false
  let cursor = 0

  const handle = async (claim: MetaLeadFallbackClaim) => {
    const remaining = deadlineAt - now()
    const item = await captureClaim(claim, Math.max(1_000, Math.min(FALLBACK_DETAIL_TIMEOUT_MS, remaining)))

    if (item.outcome === "failed") {
      report.failed += 1
      report.failureReasons[item.reason] = (report.failureReasons[item.reason] ?? 0) + 1
    } else {
      report.inserted += 1
      if (item.emailDropped) report.emailDropped += 1
      if (report.insertedRows.length < FALLBACK_ID_CAP) report.insertedRows.push({ leadgenId: claim.leadgenId, leadId: item.leadId })
    }

    const finished = await finishClaim(
      sb,
      claim.leadgenId,
      item.outcome,
      item.outcome === "inserted" ? item.leadId : null,
      item.outcome === "failed" ? clip(`${item.reason}: ${item.error}`) : null
    )
    if (finished.error) {
      report.finishErrors += 1
      finishFailed = true
      report.errors.push(finished.error)
      return
    }
    if (finished.state !== "not_pending") return
    report.notPending += 1
    if (item.outcome !== "inserted") return
    const same = await ledgerPointsTo(sb, claim.leadgenId, item.leadId)
    if (same === true) return
    report.notPendingDuplicate += 1
    duplicates.push({ leadgenId: claim.leadgenId, leadId: item.leadId })
  }

  const worker = async () => {
    while (cursor < claims.length) {
      const claim = claims[cursor]
      cursor += 1
      if (now() >= deadlineAt) {
        report.deferred += 1
        continue
      }
      try {
        await handle(claim)
      } catch (error) {
        // handle 은 던지지 않게 짰다 — 방어선. 원장은 fallback_pending 으로 남아 15분 뒤 다시 선점된다.
        report.errors.push(shortError(`폴백 처리 중 예외(leadgen ${claim.leadgenId})`, error))
        finishFailed = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FALLBACK_CONCURRENCY, claims.length) }, worker))

  if (duplicates.length) {
    try {
      await emitNotificationEvent({
        eventType: "integration.webhook_failed",
        notificationType: "incident",
        categoryTag: "system",
        severity: "warning",
        scopeTag: "critical_control",
        title: "Meta 리드 폴백 — 같은 leadgen 이 리드 2행일 수 있음",
        message: `폴백이 저장한 뒤 원장이 이미 다른 경로로 넘어간 leadgen ${duplicates.length}건 — 뒤 행을 사람이 정리(건강 H4 확인)`,
        routeUrl: "/admin/settings",
        source: "meta_lead_fallback",
        payload: {
          count: duplicates.length,
          leadgenIds: duplicates.slice(0, FALLBACK_ID_CAP).map((item) => item.leadgenId),
          leadIds: duplicates.slice(0, FALLBACK_ID_CAP).map((item) => item.leadId),
        },
        channels: ["wecom_webhook", "email"],
      })
      report.alerted = true
    } catch (error) {
      report.errors.push(shortError("폴백 중복 경보 전송 실패", error))
    }
  }

  if (finishFailed) report.status = "failed"
  else if (report.deferred > 0) report.status = "timeout"
  return report
}

/** 사이클 요약용 건수(식별자·오류 문구 없음) */
export function metaLeadFallbackCounts(report: MetaLeadFallbackRunResult): Record<string, number> {
  const counts: Record<string, number> = {
    claimed: report.claimed,
    inserted: report.inserted,
    failed: report.failed,
    emailDropped: report.emailDropped,
    deferred: report.deferred,
    notPending: report.notPending,
    notPendingDuplicate: report.notPendingDuplicate,
    finishErrors: report.finishErrors,
  }
  for (const [reason, count] of Object.entries(report.failureReasons)) counts[`failed_${reason}`] = count ?? 0
  return counts
}

/**
 * runMetaLeadMirrorCycle 의 fallback 훅. 컨텍스트의 cutover(모드)는 보지 않는다 — 모드와 무관하게 돈다.
 * changed = 선점 수(선점·finish 가 원장을 바꿨다 → 감사 대상).
 */
export async function metaLeadFallbackStep(context: MetaLeadMirrorFallbackContext): Promise<MetaLeadMirrorFallbackStepResult> {
  const report = await runMetaLeadFallback({ dryRun: context.dryRun, deadlineAt: context.deadlineAt })
  return {
    status: report.status,
    changed: report.claimed,
    counts: metaLeadFallbackCounts(report),
    ...(report.errors.length ? { error: clip(report.errors.join(" | "), 480) } : {}),
  }
}
