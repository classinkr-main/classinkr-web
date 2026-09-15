import "server-only"

// 그림자(shadow) 대조 보고 — 어드민 웹훅이 만든 meta_lead_ads 행과 Compass 제출·증인을 leadgen 단위로 맞춰 본다
// (설계 META-RECEIVER-FINAL §4-2 H6c, §6, §7 P5 게이트 G2–G5 · 설계 B §4-3 3-b).
//
// 쓰기 없음. **건수만** 돌려준다(이름·전화·이메일·주소·답변 값은 결과에 싣지 않는다).
//
// 집합(창 = [from, to), to = 지금 − 정착 여유 15분, from = max(shadow_since, 지금 − days)):
//   A 어드민  = public.leads(source='meta_lead_ads') 의 message `leadgen_id=` 줄. leadgen 마다 첫 행(created_at, id)이 대표.
//   C Compass = public.compass_meta_submissions_v ∪ public.compass_lead_refs_v(system='meta_leadgen').
//   R 증인    = public.meta_leadgen_receipts.
//   "창 안" 은 대표 행·제출·링크·증인의 시각으로 가르고, "있는가" 는 창보다 하루 앞부터 지금까지 읽은 전체로 본다
//   (경계 몇 초 차이로 한쪽만 창에 들어가 거짓 only 가 되는 것을 막는다).
//
// 분류(설계 §4-2 H6c):
//   both · compass_only(어드민이 놓침 — 컷오버 뒤 미러 몫) · admin_only(Compass 가 놓침 — 게이트 G2 목표 0,
//   admin_only_in_compass_failures 는 그중 Compass 실패 보관에 있는 것) · receipts_not_in_compass(G3 목표 0) ·
//   compass_not_in_receipts(G4 — 증인이 못 본 것) · admin_retry_duplicate_rows · admin_contactless_shells
//   (대표 행에 이름·전화·이메일이 모두 없음) · admin_rows_without_leadgen.
//
// 필드 동등성(both 이면서 제출 행이 있는 leadgen):
//   미러와 **같은 조립**(buildMetaLeadMirrorPayload — 합성 field_data → 어드민 웹훅 빌더)으로 미러 행을 만들어 대표 행과
//   컬럼마다 비교한다. 컬럼 = name, org, role, size, branch, email, phone, source_detail, utm_source/medium/campaign/
//   term/content, lead_magnet, message. created_at 은 초 차이 구간으로 따로 센다.
//   불일치마다 설명 분류를 붙인다(설계 §6): phone_format · admin_missing_identity · reinflow_identity · graph_shell ·
//   address_excluded · fields_line_allowlist. 붙지 않으면 unexplained(게이트 G5 목표 0).

import type { SupabaseClient } from "@supabase/supabase-js"

import { normalizePhoneKey } from "@/lib/compass/normalize"
import { readMetaLeadgenCutover, type MetaLeadgenMode } from "@/lib/meta/leadgen-cutover"
import {
  COMPASS_LEAD_REFS_VIEW,
  COMPASS_LEADS_VIEW,
  COMPASS_META_SUBMISSIONS_VIEW,
  META_LEADGEN_REF_SYSTEM,
  buildMetaLeadMirrorPayload,
  sanitizeMirrorFormAnswers,
  toMetaLeadMirrorApplyRow,
  type MetaLeadMirrorIdentity,
  type MetaLeadMirrorTarget,
} from "@/lib/server/meta-lead-mirror"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages, type SupabasePageResult } from "@/lib/supabase/pagination"

// ─── 이름·상수 ───────────────────────────────────────────────────────────────

export const COMPASS_META_LEADGEN_FAILURES_VIEW = "compass_meta_leadgen_failures_v"
export const META_LEADGEN_RECEIPTS_TABLE = "meta_leadgen_receipts"
export const LEADS_TABLE = "leads"
export const META_LEAD_ADS_SOURCE = "meta_lead_ads"

export const PARITY_DEFAULT_DAYS = 7
/** form_answers 는 뷰가 45일만 연다 — 그보다 긴 창은 답변이 비어 거짓 불일치가 난다 */
export const PARITY_MAX_DAYS = 45
/** 창 끝 — 두 경로가 저장을 끝낼 여유(설계 B §4-3 3-b 15분) */
export const PARITY_SETTLE_MINUTES = 15
/** "있는가" 판정을 창보다 앞으로 넓히는 폭 */
export const PARITY_MEMBERSHIP_MARGIN_MS = 24 * 60 * 60_000
export const PARITY_SCAN_MAX_ROWS = 20_000
export const PARITY_ID_CHUNK = 200
export const PARITY_REQUEST_TIMEOUT_MS = 15_000

export const PARITY_COLUMNS = [
  "name",
  "org",
  "role",
  "size",
  "branch",
  "email",
  "phone",
  "source_detail",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "lead_magnet",
  "message",
] as const
export type ParityColumn = (typeof PARITY_COLUMNS)[number]

export const PARITY_EXPLANATIONS = [
  /** 전화 원문(+82 10-…) vs Compass 정규화(010…) — 키는 같다 */
  "phone_format",
  /** 어드민 키 목록 밖 신원 필드(성함·연락처·성/이름·work_email)라 어드민 행이 비었고 미러가 채운다 */
  "admin_missing_identity",
  /** 재제출 — Compass 리드의 기존 이름·전화·이메일을 유지한다 */
  "reinflow_identity",
  /** 어드민이 Graph 상세 조회에 실패해 만든 빈 껍데기 행 */
  "graph_shell",
  /** 주소(address·주소)만 있는 폼 — 미러는 주소를 열지 않아 branch 가 빈다 */
  "address_excluded",
  /** message 의 fields= 줄 — 미러는 신원 3필드 + 허용 키 답변만 싣는다 */
  "fields_line_allowlist",
] as const
export type ParityExplanation = (typeof PARITY_EXPLANATIONS)[number]

const LEADGEN_LINE = /(?:^|\n)leadgen_id=([0-9]+)/
const FIELDS_LINE = /(?:^|\n)fields=([^\n]*)/
const REGION_KEYS = ["city", "region", "province", "지역", "도시"]
const ADDRESS_KEYS = ["address", "주소"]
const REINFLOW_OUTCOMES = new Set(["reinflow", "original"])
const IDENTITY_COLUMNS = new Set<ParityColumn>(["name", "email", "phone"])

const ADMIN_COLUMNS =
  "id,created_at,message,name,org,role,size,branch,email,phone,source_detail,lead_magnet,utm_source,utm_medium,utm_campaign,utm_term,utm_content"
const SUBMISSION_COLUMNS =
  "leadgen_id,lead_id,outcome,via,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,page_id,received_at,form_answers"
const REF_COLUMNS = "lead_id,external_id,created_at"
const RECEIPT_COLUMNS = "leadgen_id,first_received_at"

// ─── 공개 타입 ───────────────────────────────────────────────────────────────

export interface ParityColumnCounts {
  /** 정규화(앞뒤 공백·빈 값, 이메일 소문자) 뒤에도 값이 다른 leadgen 수 = explained 합 + unexplained */
  mismatched: number
  explained: Partial<Record<ParityExplanation, number>>
  unexplained: number
}

export interface MetaLeadParityReport {
  generatedAt: string
  mode: MetaLeadgenMode | null
  window: { from: string; to: string; days: number; settleMinutes: number; shadowSince: string | null } | null
  /** 뷰·표를 읽었는가 — false 인 쪽에 기대는 분류는 믿을 수 없다 */
  sources: { adminLeads: boolean; submissions: boolean; refs: boolean; receipts: boolean; failures: boolean; compassLeads: boolean }
  /** 모든 출처를 끝까지 읽었다(오류·스캔 상한 없음) */
  complete: boolean
  totals: { adminLeadgens: number; adminRows: number; compassLeadgens: number; receipts: number }
  categories: {
    both: number
    compass_only: number
    admin_only: number
    admin_only_in_compass_failures: number
    receipts_not_in_compass: number
    compass_not_in_receipts: number
    admin_retry_duplicate_rows: number
    admin_contactless_shells: number
    admin_rows_without_leadgen: number
  }
  fields: {
    compared: number
    notComparable: { refOnly: number; compassLeadDeleted: number; buildFailed: number }
    /** 미러 조립에서 이메일 형식 오류로 이메일을 비운 수 */
    emailDropped: number
    columns: Record<ParityColumn, ParityColumnCounts>
    /** (leadgen, 컬럼) 쌍 기준 설명 분류 합 */
    explained: Record<ParityExplanation, number>
    unexplained: number
    /** 설명되지 않은 불일치가 하나라도 있는 leadgen 수 */
    leadgensWithUnexplained: number
    /** |어드민 created_at − Compass received_at| 초 */
    createdAt: {
      compared: number
      withinMinute: number
      within5Minutes: number
      withinHour: number
      overHour: number
      /** 1분 넘게 차이 나는 것 중 Compass 재처리(via=replay)로 들어온 것 — 복구 시각 기준이라 설명된다 */
      replayOverMinute: number
      maxAbsSeconds: number | null
    }
  }
  /** 오류 메시지(값·PII 없음) */
  errors: string[]
}

export interface BuildMetaLeadParityReportOptions {
  /** 창 길이(일). 1–45, 기본 7. shadow_since 가 더 늦으면 거기서부터 */
  days?: number
  settleMinutes?: number
  clock?: { now(): number }
}

/** 한 컬럼 비교에 필요한 어드민 행 문맥 */
export interface ParityRowContext {
  /** 어드민 행 message 에 fields= 줄이 없다(Graph 상세 실패로 만든 껍데기) */
  adminShell: boolean
  /** 어드민 행 fields= 줄에 있는 키(소문자) — 값은 담지 않는다 */
  adminFieldKeys: Set<string>
  /** Compass 제출 outcome(created·reinflow·original) */
  outcome: string | null
}

// ─── 순수 도우미 ─────────────────────────────────────────────────────────────

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toInteger(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isInteger(parsed) ? parsed : null
}

export function parseLeadgenIdFromMessage(message: unknown): string | null {
  if (typeof message !== "string") return null
  return message.match(LEADGEN_LINE)?.[1] ?? null
}

/**
 * message 의 fields= 줄에서 키만 뽑는다(buildMetaMessage 형식 `fields=키: 값 / 키: 값`).
 * 값에 " / " 가 들어 있으면 그 뒤 조각이 키처럼 보일 수 있다 — 키 존재 판정용이라 허용한다.
 */
export function parseMessageFieldKeys(message: unknown): { hasFieldsLine: boolean; keys: Set<string> } {
  const keys = new Set<string>()
  if (typeof message !== "string") return { hasFieldsLine: false, keys }
  const line = message.match(FIELDS_LINE)?.[1]
  if (line == null) return { hasFieldsLine: false, keys }
  for (const part of line.split(" / ")) {
    const separator = part.indexOf(": ")
    if (separator <= 0) continue
    keys.add(part.slice(0, separator).trim().toLowerCase())
  }
  return { hasFieldsLine: true, keys }
}

function stripFieldsLine(message: string | null): string | null {
  if (message == null) return null
  return message
    .split("\n")
    .filter((line) => !line.startsWith("fields="))
    .join("\n")
}

/** 비교용 정규화 — 앞뒤 공백·빈 값 null, 이메일 소문자 */
export function normalizeParityValue(column: ParityColumn, value: unknown): string | null {
  const normalized = text(value)
  if (normalized == null) return null
  return column === "email" ? normalized.toLowerCase() : normalized
}

/**
 * 한 컬럼의 차이를 설명 분류에 넣는다. 같으면 "same", 설명이 없으면 "unexplained".
 * 규칙 순서: graph_shell → 컬럼별(phone_format·admin_missing_identity·reinflow_identity·address_excluded·
 * fields_line_allowlist) → unexplained.
 */
export function classifyParityDifference(
  column: ParityColumn,
  adminValue: unknown,
  mirrorValue: unknown,
  context: ParityRowContext
): ParityExplanation | "same" | "unexplained" {
  const admin = normalizeParityValue(column, adminValue)
  const mirror = normalizeParityValue(column, mirrorValue)
  if (admin === mirror) return "same"
  if (context.adminShell) return "graph_shell"

  if (column === "phone") {
    const adminKey = normalizePhoneKey(admin)
    const mirrorKey = normalizePhoneKey(mirror)
    if (adminKey != null && adminKey === mirrorKey) return "phone_format"
  }

  if (IDENTITY_COLUMNS.has(column)) {
    if (admin == null && mirror != null) return "admin_missing_identity"
    if (admin != null && mirror != null && context.outcome != null && REINFLOW_OUTCOMES.has(context.outcome)) {
      return "reinflow_identity"
    }
    return "unexplained"
  }

  if (column === "branch") {
    const hasAddress = ADDRESS_KEYS.some((key) => context.adminFieldKeys.has(key))
    const hasRegion = REGION_KEYS.some((key) => context.adminFieldKeys.has(key))
    if (admin != null && hasAddress && !hasRegion) return "address_excluded"
    return "unexplained"
  }

  if (column === "message") {
    if (stripFieldsLine(admin) === stripFieldsLine(mirror)) return "fields_line_allowlist"
    return "unexplained"
  }

  return "unexplained"
}

function emptyColumns(): Record<ParityColumn, ParityColumnCounts> {
  return Object.fromEntries(
    PARITY_COLUMNS.map((column) => [column, { mismatched: 0, explained: {}, unexplained: 0 }])
  ) as Record<ParityColumn, ParityColumnCounts>
}

function emptyExplained(): Record<ParityExplanation, number> {
  return Object.fromEntries(PARITY_EXPLANATIONS.map((item) => [item, 0])) as Record<ParityExplanation, number>
}

export function emptyMetaLeadParityReport(nowIso: string): MetaLeadParityReport {
  return {
    generatedAt: nowIso,
    mode: null,
    window: null,
    sources: { adminLeads: false, submissions: false, refs: false, receipts: false, failures: false, compassLeads: false },
    complete: false,
    totals: { adminLeadgens: 0, adminRows: 0, compassLeadgens: 0, receipts: 0 },
    categories: {
      both: 0,
      compass_only: 0,
      admin_only: 0,
      admin_only_in_compass_failures: 0,
      receipts_not_in_compass: 0,
      compass_not_in_receipts: 0,
      admin_retry_duplicate_rows: 0,
      admin_contactless_shells: 0,
      admin_rows_without_leadgen: 0,
    },
    fields: {
      compared: 0,
      notComparable: { refOnly: 0, compassLeadDeleted: 0, buildFailed: 0 },
      emailDropped: 0,
      columns: emptyColumns(),
      explained: emptyExplained(),
      unexplained: 0,
      leadgensWithUnexplained: 0,
      createdAt: {
        compared: 0,
        withinMinute: 0,
        within5Minutes: 0,
        withinHour: 0,
        overHour: 0,
        replayOverMinute: 0,
        maxAbsSeconds: null,
      },
    },
    errors: [],
  }
}

/** 한 leadgen 의 컬럼 비교 결과를 보고서에 더한다(값은 남기지 않는다). */
export function accumulateParityRow(
  fields: MetaLeadParityReport["fields"],
  adminRow: Record<string, unknown>,
  mirrorRow: Record<string, unknown>,
  context: ParityRowContext
): void {
  fields.compared += 1
  let unexplained = false
  for (const column of PARITY_COLUMNS) {
    const verdict = classifyParityDifference(column, adminRow[column], mirrorRow[column], context)
    if (verdict === "same") continue
    const counts = fields.columns[column]
    counts.mismatched += 1
    if (verdict === "unexplained") {
      counts.unexplained += 1
      fields.unexplained += 1
      unexplained = true
    } else {
      counts.explained[verdict] = (counts.explained[verdict] ?? 0) + 1
      fields.explained[verdict] += 1
    }
  }
  if (unexplained) fields.leadgensWithUnexplained += 1
}

/** created_at 초 차이 구간 */
export function accumulateParityCreatedAt(
  createdAt: MetaLeadParityReport["fields"]["createdAt"],
  adminCreatedAt: unknown,
  compassReceivedAt: unknown,
  via: string | null
): void {
  const admin = typeof adminCreatedAt === "string" ? Date.parse(adminCreatedAt) : NaN
  const compass = typeof compassReceivedAt === "string" ? Date.parse(compassReceivedAt) : NaN
  if (!Number.isFinite(admin) || !Number.isFinite(compass)) return
  const seconds = Math.round(Math.abs(admin - compass) / 1000)
  createdAt.compared += 1
  createdAt.maxAbsSeconds = Math.max(createdAt.maxAbsSeconds ?? 0, seconds)
  if (seconds <= 60) createdAt.withinMinute += 1
  else if (seconds <= 300) createdAt.within5Minutes += 1
  else if (seconds <= 3600) createdAt.withinHour += 1
  else createdAt.overHour += 1
  if (seconds > 60 && via === "replay") createdAt.replayOverMinute += 1
}

// ─── 읽기 ────────────────────────────────────────────────────────────────────

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null; count?: number | null }

function errorLabel(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message)
  return String(error)
}

function shortError(label: string, error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined
  const message = `${label}: ${errorLabel(error)}${typeof code === "string" && code ? ` (${code})` : ""}`
  return message.length > 240 ? `${message.slice(0, 237)}...` : message
}

async function timed(label: string, run: (signal: AbortSignal) => PromiseLike<QueryResult>): Promise<QueryResult> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<QueryResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve({ data: null, error: { message: `${label}: ${PARITY_REQUEST_TIMEOUT_MS}ms 초과` } })
    }, PARITY_REQUEST_TIMEOUT_MS)
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

type Scan<T> = { ok: boolean; rows: T[]; truncated: boolean }

async function scan<T>(
  report: MetaLeadParityReport,
  label: string,
  build: (from: number, to: number, signal: AbortSignal) => PromiseLike<QueryResult>
): Promise<Scan<T>> {
  const paged = await fetchSupabasePages<T>({
    maxRows: PARITY_SCAN_MAX_ROWS,
    fetchPage: (from, to) => timed(label, (signal) => build(from, to, signal)) as PromiseLike<SupabasePageResult>,
  })
  if (paged.error) {
    report.errors.push(shortError(`${label} 읽기 실패`, paged.error))
    return { ok: false, rows: [], truncated: false }
  }
  if (paged.truncated) report.errors.push(`${label}: 스캔 상한 ${PARITY_SCAN_MAX_ROWS}행에 닿음 — 건수가 전체가 아니다`)
  return { ok: true, rows: paged.data, truncated: paged.truncated }
}

type AdminRow = Record<string, unknown> & { id?: unknown; created_at?: unknown; message?: unknown }
type SubmissionRow = Record<string, unknown> & { leadgen_id?: unknown; received_at?: unknown }
type RefRow = { lead_id?: unknown; external_id?: unknown; created_at?: unknown }
type ReceiptRow = { leadgen_id?: unknown; first_received_at?: unknown }
type IdentityRow = { id?: unknown; name?: unknown; phone_key?: unknown; email_key?: unknown }

function inWindow(value: unknown, fromMs: number, toMs: number): boolean {
  const at = typeof value === "string" ? Date.parse(value) : NaN
  return Number.isFinite(at) && at >= fromMs && at < toMs
}

function compareRowOrder(left: AdminRow, right: AdminRow): number {
  const a = Date.parse(String(left.created_at))
  const b = Date.parse(String(right.created_at))
  if (a !== b) return a - b
  const ia = String(left.id)
  const ib = String(right.id)
  return ia < ib ? -1 : ia > ib ? 1 : 0
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

/**
 * 그림자 대조 보고 한 번. 쓰기 없음, 절대 던지지 않는다. 결과는 건수뿐이다.
 * 관리 화면 GET(H8)·런북 게이트 G2–G5 확인용.
 */
export async function buildMetaLeadParityReport(options: BuildMetaLeadParityReportOptions = {}): Promise<MetaLeadParityReport> {
  const nowMs = (options.clock ?? Date).now()
  const report = emptyMetaLeadParityReport(new Date(nowMs).toISOString())
  try {
    await fillParityReport(report, nowMs, options)
  } catch (error) {
    report.complete = false
    report.errors.push(shortError("대조 보고 중 예외", error))
  }
  return report
}

async function fillParityReport(report: MetaLeadParityReport, nowMs: number, options: BuildMetaLeadParityReportOptions) {
  const rawDays = Number(options.days ?? PARITY_DEFAULT_DAYS)
  const days = Number.isFinite(rawDays) ? Math.min(PARITY_MAX_DAYS, Math.max(1, Math.floor(rawDays))) : PARITY_DEFAULT_DAYS
  const rawSettle = Number(options.settleMinutes ?? PARITY_SETTLE_MINUTES)
  const settleMinutes = Number.isFinite(rawSettle) ? Math.min(24 * 60, Math.max(0, Math.floor(rawSettle))) : PARITY_SETTLE_MINUTES

  let shadowSince: string | null = null
  let cutoverOk = true
  try {
    const cutover = await readMetaLeadgenCutover()
    report.mode = cutover.mode
    shadowSince = cutover.shadowSince
  } catch (error) {
    cutoverOk = false
    report.errors.push(shortError("전환 스위치 읽기 실패 — shadow_since 없이 days 창만 쓴다", error))
  }

  const toMs = nowMs - settleMinutes * 60_000
  let fromMs = nowMs - days * 24 * 60 * 60_000
  const shadowMs = shadowSince ? Date.parse(shadowSince) : NaN
  if (Number.isFinite(shadowMs) && shadowMs > fromMs) fromMs = shadowMs
  report.window = {
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    days,
    settleMinutes,
    shadowSince,
  }
  if (fromMs >= toMs) {
    report.complete = cutoverOk
    return
  }

  let sb: SupabaseClient
  try {
    sb = createSupabaseAdminClient()
  } catch (error) {
    report.errors.push(shortError("Supabase 클라이언트 생성 실패", error))
    return
  }
  const scanFrom = new Date(fromMs - PARITY_MEMBERSHIP_MARGIN_MS).toISOString()
  let truncated = false

  // A 어드민 행
  const adminScan = await scan<AdminRow>(report, LEADS_TABLE, (from, to, signal) =>
    sb
      .from(LEADS_TABLE)
      .select(ADMIN_COLUMNS, from === 0 ? { count: "exact" } : undefined)
      .eq("source", META_LEAD_ADS_SOURCE)
      .gte("created_at", scanFrom)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .abortSignal(signal)
  )
  report.sources.adminLeads = adminScan.ok
  truncated ||= adminScan.truncated

  // C Compass 제출·링크
  const submissionScan = await scan<SubmissionRow>(report, COMPASS_META_SUBMISSIONS_VIEW, (from, to, signal) =>
    sb
      .from(COMPASS_META_SUBMISSIONS_VIEW)
      .select(SUBMISSION_COLUMNS, from === 0 ? { count: "exact" } : undefined)
      .gte("received_at", scanFrom)
      .order("received_at", { ascending: true })
      .order("leadgen_id", { ascending: true })
      .range(from, to)
      .abortSignal(signal)
  )
  report.sources.submissions = submissionScan.ok
  truncated ||= submissionScan.truncated

  const refScan = await scan<RefRow>(report, COMPASS_LEAD_REFS_VIEW, (from, to, signal) =>
    sb
      .from(COMPASS_LEAD_REFS_VIEW)
      .select(REF_COLUMNS, from === 0 ? { count: "exact" } : undefined)
      .eq("system", META_LEADGEN_REF_SYSTEM)
      .gte("created_at", scanFrom)
      .order("created_at", { ascending: true })
      .order("external_id", { ascending: true })
      .range(from, to)
      .abortSignal(signal)
  )
  report.sources.refs = refScan.ok
  truncated ||= refScan.truncated

  // R 증인
  const receiptScan = await scan<ReceiptRow>(report, META_LEADGEN_RECEIPTS_TABLE, (from, to, signal) =>
    sb
      .from(META_LEADGEN_RECEIPTS_TABLE)
      .select(RECEIPT_COLUMNS, from === 0 ? { count: "exact" } : undefined)
      .gte("first_received_at", scanFrom)
      .order("first_received_at", { ascending: true })
      .order("leadgen_id", { ascending: true })
      .range(from, to)
      .abortSignal(signal)
  )
  report.sources.receipts = receiptScan.ok
  truncated ||= receiptScan.truncated

  // ── 집합 ──
  const adminGroups = new Map<string, AdminRow[]>()
  for (const row of adminScan.rows) {
    const leadgenId = parseLeadgenIdFromMessage(row.message)
    if (!leadgenId) {
      if (inWindow(row.created_at, fromMs, toMs)) report.categories.admin_rows_without_leadgen += 1
      continue
    }
    const group = adminGroups.get(leadgenId)
    if (group) group.push(row)
    else adminGroups.set(leadgenId, [row])
  }
  const adminWindow = new Map<string, AdminRow>()
  for (const [leadgenId, rows] of adminGroups) {
    rows.sort(compareRowOrder)
    const canonical = rows[0]
    if (!inWindow(canonical.created_at, fromMs, toMs)) continue
    adminWindow.set(leadgenId, canonical)
    report.totals.adminRows += rows.length
    report.categories.admin_retry_duplicate_rows += rows.length - 1
    if (!text(canonical.name) && !text(canonical.phone) && !text(canonical.email)) {
      report.categories.admin_contactless_shells += 1
    }
  }
  report.totals.adminLeadgens = adminWindow.size

  const submissions = new Map<string, SubmissionRow>()
  const compassAll = new Set<string>()
  const compassWindow = new Set<string>()
  for (const row of submissionScan.rows) {
    const leadgenId = text(row.leadgen_id)
    if (!leadgenId) continue
    submissions.set(leadgenId, row)
    compassAll.add(leadgenId)
    if (inWindow(row.received_at, fromMs, toMs)) compassWindow.add(leadgenId)
  }
  for (const row of refScan.rows) {
    const leadgenId = text(row.external_id)
    if (!leadgenId) continue
    compassAll.add(leadgenId)
    if (inWindow(row.created_at, fromMs, toMs)) compassWindow.add(leadgenId)
  }
  report.totals.compassLeadgens = compassWindow.size

  const receiptsAll = new Set<string>()
  const receiptsWindow = new Set<string>()
  for (const row of receiptScan.rows) {
    const leadgenId = text(row.leadgen_id)
    if (!leadgenId) continue
    receiptsAll.add(leadgenId)
    if (inWindow(row.first_received_at, fromMs, toMs)) receiptsWindow.add(leadgenId)
  }
  report.totals.receipts = receiptsWindow.size

  const adminOnly: string[] = []
  const both: string[] = []
  for (const leadgenId of adminWindow.keys()) {
    if (compassAll.has(leadgenId)) both.push(leadgenId)
    else adminOnly.push(leadgenId)
  }
  report.categories.both = both.length
  report.categories.admin_only = adminOnly.length
  for (const leadgenId of compassWindow) {
    if (!adminGroups.has(leadgenId)) report.categories.compass_only += 1
    if (!receiptsAll.has(leadgenId)) report.categories.compass_not_in_receipts += 1
  }
  for (const leadgenId of receiptsWindow) {
    if (!compassAll.has(leadgenId)) report.categories.receipts_not_in_compass += 1
  }

  // admin_only 중 Compass 실패 보관에 있는 것
  let failuresOk = true
  for (const ids of chunk(adminOnly.sort(), PARITY_ID_CHUNK)) {
    const result = await timed(COMPASS_META_LEADGEN_FAILURES_VIEW, (signal) =>
      sb.from(COMPASS_META_LEADGEN_FAILURES_VIEW).select("leadgen_id").in("leadgen_id", ids).abortSignal(signal)
    )
    if (result.error) {
      failuresOk = false
      report.errors.push(shortError(`${COMPASS_META_LEADGEN_FAILURES_VIEW} 읽기 실패`, result.error))
      break
    }
    const found = new Set(((result.data ?? []) as Array<{ leadgen_id?: unknown }>).map((row) => text(row.leadgen_id)))
    report.categories.admin_only_in_compass_failures += ids.filter((id) => found.has(id)).length
  }
  report.sources.failures = failuresOk

  // ── 필드 동등성 ──
  const comparable: Array<{ leadgenId: string; admin: AdminRow; submission: SubmissionRow; target: MetaLeadMirrorTarget }> = []
  for (const leadgenId of both.sort()) {
    const submission = submissions.get(leadgenId)
    const target = submission ? submissionTarget(submission) : null
    if (!submission || !target) {
      report.fields.notComparable.refOnly += 1
      continue
    }
    comparable.push({ leadgenId, admin: adminWindow.get(leadgenId)!, submission, target })
  }

  const identities = new Map<number, MetaLeadMirrorIdentity>()
  let identitiesOk = true
  const leadIds = [
    ...new Set(comparable.map((item) => item.target.compassLeadId).filter((id): id is number => id != null)),
  ].sort((a, b) => a - b)
  for (const ids of chunk(leadIds, PARITY_ID_CHUNK)) {
    const result = await timed(COMPASS_LEADS_VIEW, (signal) =>
      sb.from(COMPASS_LEADS_VIEW).select("id,name,phone_key,email_key").in("id", ids).abortSignal(signal)
    )
    if (result.error) {
      identitiesOk = false
      report.errors.push(shortError(`${COMPASS_LEADS_VIEW} 읽기 실패 — 필드 비교 생략`, result.error))
      break
    }
    for (const row of (result.data ?? []) as IdentityRow[]) {
      const id = toInteger(row.id)
      if (id == null) continue
      identities.set(id, { name: text(row.name), phoneKey: text(row.phone_key), emailKey: text(row.email_key) })
    }
  }
  report.sources.compassLeads = identitiesOk

  if (identitiesOk) {
    for (const item of comparable) {
      const identity = item.target.compassLeadId == null ? undefined : identities.get(item.target.compassLeadId)
      if (!identity) {
        report.fields.notComparable.compassLeadDeleted += 1
        continue
      }
      let mirrorRow: Record<string, unknown>
      try {
        const built = buildMetaLeadMirrorPayload(item.target, identity)
        if (built.emailDropped) report.fields.emailDropped += 1
        mirrorRow = toMetaLeadMirrorApplyRow(item.target, built.payload)
      } catch {
        report.fields.notComparable.buildFailed += 1
        continue
      }
      const { hasFieldsLine, keys } = parseMessageFieldKeys(item.admin.message)
      accumulateParityRow(report.fields, item.admin, mirrorRow, {
        adminShell: !hasFieldsLine,
        adminFieldKeys: keys,
        outcome: text(item.submission.outcome),
      })
      accumulateParityCreatedAt(report.fields.createdAt, item.admin.created_at, item.submission.received_at, text(item.submission.via))
    }
  }

  report.complete =
    cutoverOk &&
    !truncated &&
    report.sources.adminLeads &&
    report.sources.submissions &&
    report.sources.refs &&
    report.sources.receipts &&
    report.sources.failures &&
    report.sources.compassLeads
}
