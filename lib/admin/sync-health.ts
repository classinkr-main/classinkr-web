// 동기화 건강 읽기 모델 — 원천별 "마지막 성공·마지막 시도 결과·연속 실패"를 한 모양으로 접는다.
//
// 왜(2026-09-24 운영 실측): NEO 읽기 크론(sync-external-crm)은 06-22부터 매번 env 누락으로
// 건너뛰었고(자동 성공 0회, 마지막 수동 성공 08-28), KR Team 시트 동기화(sync-branch REV/DSH/KPI)는
// 08-18 이후 시트 권한 오류로 전부 실패했다. 그동안 원천 고객·매출 장부·매칭 화면은 4~5주 전 값을
// 아무 경고 없이 보여줬다. 이 모듈은 실행 기록만으로 "무엇이 멈췄고, 화면 값이 언제 것이며,
// 누가 무엇을 하면 풀리는지"를 계산한다. 조회(DB)는 lib/admin/sync-health-server.ts가 하고,
// 여기는 순수 함수만 둔다 — 서버 셸과 클라이언트 어디서든 같은 판정·문구를 쓰게 하려고
// "server-only"를 달지 않는다.
//
// 재사용(중복 모델 금지):
//  - KR Team 시트·HW의 연속 실패 판정은 크론 알림·KR Team 요약과 같은
//    lib/branch/sync/failure-streak.ts computeSyncFailureStreak / isPermissionError를 그대로 쓴다.
//  - 경과시간·상대시간 문구는 lib/crm/sync-freshness.ts(hoursSinceIso·formatAgeHours)를 쓴다.
//
// 정직 규칙: 원문 오류 문자열은 화면·로그로 내보내지 않는다. 분류(권한/설정 누락/네트워크/기타)와
// 고정 문구 힌트로만 바꾼다 — 키·토큰·내부 URL이 오류 문구에 섞여 있을 수 있다.

import { getBusinessDateParts } from "@/lib/business-time"
import {
  computeSyncFailureStreak,
  isPermissionError,
  type SyncRunLike,
} from "@/lib/branch/sync/failure-streak"
import { DAILY_SYNC_STALE_AFTER_HOURS, formatAgeHours, hoursSinceIso } from "@/lib/crm/sync-freshness"

// ─── 원천 ───────────────────────────────────────────────────────

export type SyncHealthSourceKey = "neo" | "sheets" | "hw"

export const SYNC_HEALTH_SOURCES: readonly SyncHealthSourceKey[] = ["neo", "sheets", "hw"]

export const SYNC_HEALTH_SOURCE_LABEL: Record<SyncHealthSourceKey, string> = {
  neo: "NEO CRM 읽기",
  sheets: "KR Team 시트(REV·DSH·KPI)",
  hw: "하드웨어 시트",
}

/** "이 화면의 ○○ 수치는 그 시점 값"의 ○○ — 원천이 화면에 싣는 데이터 범위. */
const SOURCE_SCOPE_LABEL: Record<SyncHealthSourceKey, string> = {
  neo: "NEO",
  sheets: "시트(REV·DSH·KPI)",
  hw: "하드웨어",
}

export function isSyncHealthSourceKey(value: unknown): value is SyncHealthSourceKey {
  return typeof value === "string" && (SYNC_HEALTH_SOURCES as readonly string[]).includes(value)
}

// ─── 모델 ───────────────────────────────────────────────────────

export type SyncAttemptOutcome = "success" | "failed" | "skipped"
export type SyncTriggerKind = "cron" | "manual" | "other"
/** 원문 사유를 대신하는 분류 — 화면에는 이 값과 고정 문구만 나간다. */
export type SyncFailureClass = "permission" | "config" | "network" | "other"
/** 분류 안에서 "누가 무엇을 하면 풀리는지"를 고르는 고정 힌트. 원문을 싣지 않는다. */
export type SyncFailureHint =
  | "neo_base_url"
  | "neo_credentials"
  | "sheet_share"
  | "sheet_credentials"
  | "sheet_env"
  | null

/**
 * ok      — 마지막 시도가 성공했고 마지막 성공이 임계(36시간) 안.
 * stale   — 마지막 시도는 성공(또는 시도 기록 없음)인데 마지막 성공이 임계 밖 — 크론이 안 돌고 있다.
 * failing — 마지막 성공 이후 실패·건너뜀이 1회 이상.
 * unknown — 실행 기록 조회 자체가 실패했다. 정상인 척하지 않고 "확인 불가"로 보인다.
 */
export type SyncHealthState = "ok" | "stale" | "failing" | "unknown"

export interface SyncSourceHealth {
  source: SyncHealthSourceKey
  state: SyncHealthState
  lastSuccessAt: string | null
  lastSuccessTrigger: SyncTriggerKind | null
  lastAttemptAt: string | null
  lastAttemptOutcome: SyncAttemptOutcome | null
  lastAttemptTrigger: SyncTriggerKind | null
  /** 마지막 시도가 성공이 아닐 때만 채운다. */
  failureClass: SyncFailureClass | null
  failureHint: SyncFailureHint
  /** 마지막 성공 이후 실패·건너뜀 시도 수(수동 재시도 포함). */
  consecutiveFailures: number
  /**
   * 그 실패·건너뜀이 있었던 서로 다른 KST 날짜 수 — 심각도(danger) 판정 기준.
   * 크론 실패 뒤 같은 날 수동 재시도가 한 번 더 실패해도 하루로 센다(크론 알림 failedDays와 같은 규칙).
   */
  consecutiveFailureDays: number
  /** 조회한 기록 안에서 성공을 못 만났다 — 실제 연속 실패는 이보다 길 수 있다. */
  failuresTruncated: boolean
  /** 조회한 기록 안에서 자동(크론) 실행이 한 번이라도 성공했는가. */
  autoSucceededInWindow: boolean
}

export interface SyncHealthReport {
  generatedAt: string
  sources: SyncSourceHealth[]
}

export function unknownSyncSourceHealth(source: SyncHealthSourceKey): SyncSourceHealth {
  return {
    source,
    state: "unknown",
    lastSuccessAt: null,
    lastSuccessTrigger: null,
    lastAttemptAt: null,
    lastAttemptOutcome: null,
    lastAttemptTrigger: null,
    failureClass: null,
    failureHint: null,
    consecutiveFailures: 0,
    consecutiveFailureDays: 0,
    failuresTruncated: false,
    autoSucceededInWindow: false,
  }
}

/** 시각(ISO) 목록 → 서로 다른 KST 날짜 수. 파싱 불가 값은 세지 않는다. */
function countKstDays(values: ReadonlyArray<string | null | undefined>): number {
  const days = new Set<string>()
  for (const value of values) {
    const at = timeOf(value)
    if (at === null) continue
    days.add(getBusinessDateParts(new Date(at)).date)
  }
  return days.size
}

function normalizeTrigger(value: string | null | undefined): SyncTriggerKind | null {
  if (!value) return null
  if (value === "cron") return "cron"
  if (value === "manual") return "manual"
  return "other"
}

function resolveState(input: {
  consecutiveFailures: number
  lastSuccessAt: string | null
  nowMs: number
}): SyncHealthState {
  if (input.consecutiveFailures > 0) return "failing"
  const hours = hoursSinceIso(input.lastSuccessAt, input.nowMs)
  if (hours === null || hours > DAILY_SYNC_STALE_AFTER_HOURS) return "stale"
  return "ok"
}

// ─── 사유 분류 ──────────────────────────────────────────────────

const CONFIG_PATTERN = /missing (?:env|xiaoshouyi|google|service|sheet)|not configured|환경변수|설정되지 않/i
const NEO_BASE_URL_PATTERN = /base url/i
const NEO_CREDENTIAL_PATTERN = /access token|service credentials|client_id|client secret/i
const SHEET_ENV_PATTERN = /google_branch_|sheet_id|google_service_account|google_private_key/i
const CREDENTIAL_PATTERN = /invalid_grant|unauthori[sz]ed|\b401\b|invalid jwt|invalid_client|insufficient authentication/i
const FORBIDDEN_PATTERN = /forbidden|access denied|권한/i
const NETWORK_PATTERN =
  /fetch failed|econnreset|econnrefused|etimedout|enotfound|eai_again|socket hang up|network|timed out|timeout|\b50[0234]\b|bad gateway|service unavailable|\b429\b|rate limit|quota/i

/**
 * 원문 오류를 분류와 고정 힌트로 바꾼다. 원문은 반환하지 않는다.
 * 순서: 설정 누락(env) → 권한·인증 → 네트워크·일시 오류 → 기타.
 * 권한 판정은 크론 알림과 같은 isPermissionError를 먼저 쓴다(같은 오류가 화면과 알림에서 다르게 읽히지 않게).
 */
export function classifySyncFailure(
  source: SyncHealthSourceKey,
  raw: string | null | undefined
): { failureClass: SyncFailureClass; failureHint: SyncFailureHint } {
  const text = (raw ?? "").trim()
  if (!text) return { failureClass: "other", failureHint: null }

  if (CONFIG_PATTERN.test(text)) {
    if (source === "neo") {
      if (NEO_BASE_URL_PATTERN.test(text)) return { failureClass: "config", failureHint: "neo_base_url" }
      if (NEO_CREDENTIAL_PATTERN.test(text)) return { failureClass: "config", failureHint: "neo_credentials" }
      return { failureClass: "config", failureHint: null }
    }
    return { failureClass: "config", failureHint: SHEET_ENV_PATTERN.test(text) ? "sheet_env" : null }
  }

  if (isPermissionError(text) || FORBIDDEN_PATTERN.test(text)) {
    return { failureClass: "permission", failureHint: source === "neo" ? "neo_credentials" : "sheet_share" }
  }
  if (CREDENTIAL_PATTERN.test(text)) {
    return { failureClass: "permission", failureHint: source === "neo" ? "neo_credentials" : "sheet_credentials" }
  }

  if (NETWORK_PATTERN.test(text)) return { failureClass: "network", failureHint: null }
  return { failureClass: "other", failureHint: null }
}

// ─── NEO(external_crm_sync_runs, source_system='xiaoshouyi') ───────

/**
 * 한 번의 전체 동기화는 코디네이터 행(__sync_lock__)이 결과를 대표한다. env 누락처럼 코디네이터를
 * 만들기 전에 끝나는 경우는 object_api_key='all' 건너뜀 행 하나만 남는다(xiaoshouyi-sync.ts).
 * 객체별 행(account 등)은 부분 결과라 "시도" 단위로 세지 않는다.
 */
export const NEO_SYNC_COORDINATOR_KEY = "__sync_lock__"
export const NEO_SYNC_ALL_KEY = "all"
export const NEO_SYNC_TOP_LEVEL_KEYS = [NEO_SYNC_COORDINATOR_KEY, NEO_SYNC_ALL_KEY] as const

/** 토큰 누락 경로는 코디네이터 건너뜀 + 'all' 건너뜀 두 행을 남긴다 — 같은 시도로 접는 창. */
const NEO_DUPLICATE_SKIP_WINDOW_MS = 10 * 60_000

export interface NeoSyncRunRow {
  object_api_key: string | null
  status: string | null
  trigger: string | null
  started_at: string | null
  finished_at: string | null
  error: string | null
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : at
}

function isNeoOutcome(status: string | null): status is SyncAttemptOutcome {
  return status === "success" || status === "failed" || status === "skipped"
}

/**
 * NEO 실행 기록을 "시도" 목록(최신순)으로 접는다.
 *  - 최상위 행(코디네이터·'all')만 남긴다.
 *  - 진행 중(running)은 결과가 없어 건너뛴다.
 *  - 코디네이터 건너뜀 직후 10분 안의 'all' 건너뜀은 같은 시도의 중복이라 뺀다.
 */
export function collapseNeoSyncAttempts(rows: readonly NeoSyncRunRow[]): NeoSyncRunRow[] {
  const topLevel = rows
    .filter((row) => (NEO_SYNC_TOP_LEVEL_KEYS as readonly string[]).includes(row.object_api_key ?? ""))
    .filter((row) => isNeoOutcome(row.status) && timeOf(row.started_at) !== null)
    .slice()
    .sort((a, b) => (timeOf(b.started_at) ?? 0) - (timeOf(a.started_at) ?? 0))

  const coordinatorSkips = topLevel
    .filter((row) => row.object_api_key === NEO_SYNC_COORDINATOR_KEY && row.status === "skipped")
    .map((row) => timeOf(row.started_at) ?? 0)

  return topLevel.filter((row) => {
    if (row.object_api_key !== NEO_SYNC_ALL_KEY || row.status !== "skipped") return true
    const at = timeOf(row.started_at) ?? 0
    return !coordinatorSkips.some((coordinatorAt) => at >= coordinatorAt && at - coordinatorAt <= NEO_DUPLICATE_SKIP_WINDOW_MS)
  })
}

/**
 * @param rows 최근 NEO 실행 기록(최상위 행 위주, 어떤 순서든 된다)
 * @param latestSuccess 창 밖까지 포함한 마지막 코디네이터 성공 행(별도 조회). 없으면 창 안에서 찾는다.
 */
export function computeNeoSyncHealth(
  rows: readonly NeoSyncRunRow[],
  latestSuccess: NeoSyncRunRow | null,
  nowMs: number = Date.now()
): SyncSourceHealth {
  const attempts = collapseNeoSyncAttempts(rows)

  let consecutiveFailures = 0
  const failureStartedAt: Array<string | null> = []
  let successInWindow: NeoSyncRunRow | null = null
  for (const attempt of attempts) {
    if (attempt.status === "success") {
      successInWindow = attempt
      break
    }
    consecutiveFailures += 1
    failureStartedAt.push(attempt.started_at)
  }

  const success = latestSuccess ?? successInWindow
  const lastSuccessAt = success ? (success.finished_at ?? success.started_at) : null
  const last = attempts[0] ?? null
  const lastOutcome = last && isNeoOutcome(last.status) ? last.status : null
  const failure = last && lastOutcome !== "success" ? classifySyncFailure("neo", last.error) : null

  return {
    source: "neo",
    state: resolveState({ consecutiveFailures, lastSuccessAt, nowMs }),
    lastSuccessAt,
    lastSuccessTrigger: success ? normalizeTrigger(success.trigger) : null,
    lastAttemptAt: last ? (last.finished_at ?? last.started_at) : null,
    lastAttemptOutcome: lastOutcome,
    lastAttemptTrigger: last ? normalizeTrigger(last.trigger) : null,
    failureClass: failure?.failureClass ?? null,
    failureHint: failure?.failureHint ?? null,
    consecutiveFailures,
    consecutiveFailureDays: countKstDays(failureStartedAt),
    failuresTruncated: consecutiveFailures > 0 && successInWindow === null,
    autoSucceededInWindow: attempts.some((attempt) => attempt.status === "success" && attempt.trigger === "cron"),
  }
}

// ─── KR Team 시트·HW(branch_sync_runs) ─────────────────────────────

export type BranchSyncRunRow = SyncRunLike & { trigger?: string | null }

/**
 * branch_sync_runs는 rev·hw를 둘 다 돌린 런을 "all"로, 한 원천만 돌린 런(매출 장부·매출 대시보드·
 * 매출시트의 REV 새로고침)을 그 원천 이름으로 남기고, 오류를 "rev: … | hw: …"로 잇는다. 원천별 결과
 * 해석은 크론 알림·KR Team 요약과 같은 computeSyncFailureStreak에 맡긴다(같은 기록이 화면마다
 * 다르게 읽히지 않게) — 자기 원천을 돌리지 않은 런은 거기서 건너뛴다(syncRunCoversSource).
 * 이 함수는 그 결과를 SyncSourceHealth 모양으로만 옮긴다.
 */
export function computeBranchSourceHealth(
  runs: readonly BranchSyncRunRow[],
  source: "sheets" | "hw",
  nowMs: number = Date.now()
): SyncSourceHealth {
  const key = source === "sheets" ? "rev" : "hw"
  const list = runs.slice()
  const streak = computeSyncFailureStreak(list, key)
  const autoStreak = computeSyncFailureStreak(
    list.filter((run) => run.trigger === "cron"),
    key
  )
  const triggerAt = (startedAt: string | null) =>
    startedAt ? normalizeTrigger(list.find((run) => run.started_at === startedAt)?.trigger ?? null) : null

  const failing = streak.failedRuns > 0
  const failure = failing ? classifySyncFailure(source, streak.lastError) : null
  const lastAttemptAt = failing ? streak.lastFailureAt : streak.lastSuccessAt

  return {
    source,
    state: resolveState({ consecutiveFailures: streak.failedRuns, lastSuccessAt: streak.lastSuccessAt, nowMs }),
    lastSuccessAt: streak.lastSuccessAt,
    lastSuccessTrigger: triggerAt(streak.lastSuccessAt),
    lastAttemptAt,
    lastAttemptOutcome: failing ? "failed" : streak.lastSuccessAt ? "success" : null,
    lastAttemptTrigger: triggerAt(lastAttemptAt),
    failureClass: failure?.failureClass ?? null,
    failureHint: failure?.failureHint ?? null,
    consecutiveFailures: streak.failedRuns,
    consecutiveFailureDays: streak.failedDays,
    failuresTruncated: streak.truncated,
    autoSucceededInWindow: autoStreak.lastSuccessAt !== null,
  }
}

// ─── 문구 ───────────────────────────────────────────────────────

export type SyncHealthTone = "danger" | "warning" | "neutral"

export interface SyncHealthCopy {
  source: SyncHealthSourceKey
  tone: SyncHealthTone
  /** 무엇이 멈췄나 */
  headline: string
  /** 화면 값이 언제 것인가 */
  asOf: string
  /** 누가 무엇을 하면 풀리나 — 확인 불가 상태에는 없다. */
  action: string | null
  /** "자세히"에 펼칠 사실(원문 오류 없이). */
  details: string[]
}

export const SYNC_FAILURE_CLASS_LABEL: Record<SyncFailureClass, string> = {
  permission: "권한 오류",
  config: "설정 누락(env)",
  network: "네트워크·일시 오류",
  other: "기타 오류",
}

const OUTCOME_LABEL: Record<SyncAttemptOutcome, string> = {
  success: "성공",
  failed: "실패",
  skipped: "건너뜀",
}

const TRIGGER_LABEL: Record<SyncTriggerKind, string> = {
  cron: "자동",
  manual: "수동",
  other: "기타",
}

const KST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** ISO → KST "MM-DD" 와 "MM-DD HH:mm". 파싱 실패는 null. */
export function formatKstSyncTime(value: string | null | undefined): { day: string; dayTime: string } | null {
  const at = timeOf(value)
  if (at === null) return null
  const parts = Object.fromEntries(KST_PARTS.formatToParts(new Date(at)).map((part) => [part.type, part.value]))
  const day = `${parts.month}-${parts.day}`
  return { day, dayTime: `${day} ${parts.hour}:${parts.minute}` }
}

function successWord(trigger: SyncTriggerKind | null): string {
  if (trigger === "manual") return "수동 동기화"
  if (trigger === "cron") return "자동 동기화"
  return "동기화 성공"
}

function describeAsOf(health: SyncSourceHealth, nowMs: number): string {
  const when = formatKstSyncTime(health.lastSuccessAt)
  if (!when) {
    return health.failuresTruncated || health.consecutiveFailures > 0
      ? "최근 기록에 성공한 동기화가 없음 — 이 화면 수치의 기준 시점을 알 수 없음"
      : "동기화 기록 없음 — 이 화면 수치의 기준 시점을 알 수 없음"
  }
  const age = formatAgeHours(hoursSinceIso(health.lastSuccessAt, nowMs))
  const word = successWord(health.lastSuccessTrigger)
  const label = word === "동기화 성공" ? `마지막 동기화 성공 ${when.day}(${age})` : `마지막 ${word} ${when.day}(${age})`
  return `${label} · 이 화면의 ${SOURCE_SCOPE_LABEL[health.source]} 수치는 그 시점 값`
}

function failingHeadline(health: SyncSourceHealth): string {
  const label = SYNC_HEALTH_SOURCE_LABEL[health.source]
  const times = `${health.consecutiveFailures}회${health.failuresTruncated ? " 이상" : ""} 연속`
  if (health.source === "neo" && health.failureClass === "config") {
    return health.failureHint === "neo_credentials"
      ? "NEO 자동 동기화 인증 정보가 설정되지 않음(env 누락)"
      : "NEO 자동 동기화가 설정되지 않음(env 누락)"
  }
  if (health.failureClass === "config") return `${label} 동기화 설정 누락(env)으로 ${times} 실패`
  if (health.failureClass === "permission") return `${label} 동기화가 권한 오류로 ${times} 실패`
  if (health.failureClass === "network") return `${label} 동기화가 네트워크·일시 오류로 ${times} 실패`
  return `${label} 동기화 ${times} 실패`
}

function failingAction(health: SyncSourceHealth): string {
  switch (health.failureHint) {
    case "neo_base_url":
      return "운영 env XIAOSHOUYI_BASE_URL 설정 필요 — Vercel 운영 환경변수(개발 담당)"
    case "neo_credentials":
      return health.failureClass === "config"
        ? "운영 env에 NEO 접근 토큰 또는 서비스 계정 정보 설정 필요 — Vercel 운영 환경변수(개발 담당)"
        : "NEO 서비스 계정의 권한·토큰 확인 필요(개발 담당)"
    case "sheet_share":
      return "시트 공유 권한 확인 필요 — 시트 소유자가 서비스 계정에 뷰어로 다시 공유"
    case "sheet_credentials":
      return "서비스 계정 키 확인 필요 — Vercel 운영 환경변수(개발 담당)"
    case "sheet_env":
      return "운영 env의 시트 ID·서비스 계정 설정 확인 필요 — Vercel 운영 환경변수(개발 담당)"
    default:
      break
  }
  if (health.failureClass === "network") {
    return "일시 오류일 수 있음 — 다음 자동 동기화에서 다시 시도, 계속되면 개발 담당 확인"
  }
  if (health.failureClass === "config") return "운영 환경변수 설정 확인 필요(개발 담당)"
  return "개발 담당이 운영 상태 화면(/admin/ops)의 실행 기록 확인 필요"
}

function describeDetails(health: SyncSourceHealth): string[] {
  const details: string[] = []
  const attempt = formatKstSyncTime(health.lastAttemptAt)
  if (attempt && health.lastAttemptOutcome) {
    const trigger = health.lastAttemptTrigger ? `${TRIGGER_LABEL[health.lastAttemptTrigger]}, ` : ""
    const reason = health.failureClass ? ` · ${SYNC_FAILURE_CLASS_LABEL[health.failureClass]}` : ""
    details.push(`마지막 시도 ${attempt.dayTime}(${trigger}${OUTCOME_LABEL[health.lastAttemptOutcome]})${reason}`)
  }
  if (health.consecutiveFailures > 0) {
    details.push(
      `마지막 성공 이후 실패·건너뜀 ${health.consecutiveFailures}회${health.failuresTruncated ? " 이상(조회한 기록 안에 성공 없음)" : ""}`
    )
  }
  if (!health.autoSucceededInWindow && health.lastAttemptAt) {
    details.push("최근 기록에서 자동(크론) 실행이 한 번도 성공하지 않음")
  }
  return details
}

/**
 * 원천 하나의 건강 상태 → 경고 문구. 정상(ok)이면 null — 띠를 그리지 않는다.
 * 확인 불가(unknown)는 정상인 척하지 않고 중립 톤 한 줄로 알린다.
 */
export function describeSyncSourceHealth(health: SyncSourceHealth, nowMs: number = Date.now()): SyncHealthCopy | null {
  const label = SYNC_HEALTH_SOURCE_LABEL[health.source]
  if (health.state === "ok") return null

  if (health.state === "unknown") {
    return {
      source: health.source,
      tone: "neutral",
      headline: `${label} 동기화 상태 확인 불가`,
      asOf: `실행 기록을 읽지 못해 이 화면의 ${SOURCE_SCOPE_LABEL[health.source]} 수치가 언제 값인지 확인하지 못했습니다`,
      action: null,
      details: [],
    }
  }

  const hours = hoursSinceIso(health.lastSuccessAt, nowMs)
  const longStale = hours === null || hours > 48

  if (health.state === "stale") {
    return {
      source: health.source,
      tone: "warning",
      headline: health.lastSuccessAt
        ? `${label} 동기화가 ${formatAgeHours(hours)}부터 돌지 않음`
        : `${label} 동기화 기록 없음`,
      asOf: describeAsOf(health, nowMs),
      action: "자동 동기화 크론이 실행되고 있는지 확인 필요(개발 담당)",
      details: describeDetails(health),
    }
  }

  // danger 기준은 실패 "일수"(KST)다 — 런 수로 세면 크론 실패 뒤 같은 날 수동 재시도 한 번만으로
  // 당일 danger가 됐다. 크론 알림(2일째 첫 알림)과 같은 축이다.
  return {
    source: health.source,
    tone: longStale || health.consecutiveFailureDays >= 2 ? "danger" : "warning",
    headline: failingHeadline(health),
    asOf: describeAsOf(health, nowMs),
    action: failingAction(health),
    details: describeDetails(health),
  }
}

const TONE_RANK: Record<SyncHealthTone, number> = { danger: 2, warning: 1, neutral: 0 }

/** 여러 문구 중 가장 심각한 톤. 비어 있으면 null. */
export function worstSyncHealthTone(copies: readonly SyncHealthCopy[]): SyncHealthTone | null {
  let worst: SyncHealthTone | null = null
  for (const copy of copies) {
    if (worst === null || TONE_RANK[copy.tone] > TONE_RANK[worst]) worst = copy.tone
  }
  return worst
}

/** 정상 원천의 조용한 한 줄(운영 상태 요약용). */
export function describeHealthySyncSource(health: SyncSourceHealth, nowMs: number = Date.now()): string {
  const when = formatKstSyncTime(health.lastSuccessAt)
  if (!when) return "정상"
  const trigger = health.lastSuccessTrigger ? `${TRIGGER_LABEL[health.lastSuccessTrigger]}, ` : ""
  return `정상 · 마지막 성공 ${when.dayTime}(${trigger}${formatAgeHours(hoursSinceIso(health.lastSuccessAt, nowMs))})`
}
