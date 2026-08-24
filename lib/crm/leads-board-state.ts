import type { LeadRecord, LeadStatus } from "@/lib/repositories/leads"
import { RESPONSE_TARGET_SOURCES } from "@/lib/crm/lead-attribution"

// 리드 보드의 순수 규칙 — 뷰 축·필터 축·컬럼 분배·시간 술어.
//
// 이 파일이 정본이고 components/admin/crm/leads/shared.tsx 는 기존 import 경로 유지를 위해
// 다시 내보내기만 한다(유입 규칙을 lib/crm/lead-attribution 으로 옮겼던 것과 같은 패턴).
// 서버 집계(lib/admin/overview)와 화면이 같은 표를 봐야 해서 lib 쪽에 둔다 — 반대로 두면
// lib → components 역방향 의존이 생긴다.
//
// 설계 정본: docs/active/crm-lead-console-board-design-2026-08-21.md

// ─── 시간 헬퍼 ─────────────────────────────────────────────────

export function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

// 팔로업은 날짜만 고른다. 자정으로 두면 타임존에 따라 하루 밀려 "어제 예정"으로 보이므로
// 정오로 고정한다 — 등록 API(app/api/admin/leads/route.ts)도 같은 규약을 쓴다.
export function toFollowUpTimestamp(date: string) {
  return `${date}T12:00:00.000Z`
}

export function daysBetween(from: string | Date, to: string | Date = new Date()) {
  const fromDate = from instanceof Date ? from : new Date(from)
  const toDate = to instanceof Date ? to : new Date(to)
  return Math.max(0, Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000))
}

export function hoursBetween(from: string | Date, to: string | Date = new Date()) {
  const fromDate = from instanceof Date ? from : new Date(from)
  const toDate = to instanceof Date ? to : new Date(to)
  return Math.max(0, Math.floor((toDate.getTime() - fromDate.getTime()) / 3_600_000))
}

// ─── 리드 술어 ─────────────────────────────────────────────────

export function isActiveLead(status: LeadStatus) {
  return status !== "converted" && status !== "closed"
}

export function isResponseTargetLead(lead: LeadRecord) {
  return RESPONSE_TARGET_SOURCES.has(lead.source)
}

export function isUnrespondedLead(lead: LeadRecord) {
  return lead.status === "new" && isResponseTargetLead(lead)
}

// 공개 채널(문의·데모·뉴스레터·Meta 리드애즈 등)에서 들어와 아직 검토되지 않은 리드.
// 어드민 수기 등록은 생성 시점에 confirmed_at이 채워져 항상 false.
export function isUnconfirmedLead(lead: LeadRecord) {
  return !lead.confirmed_at
}

// ─── 필터 축 ───────────────────────────────────────────────────

export type LeadFilter =
  | LeadStatus
  | "all"
  | "unresponded"
  | "unresponded_24h"
  | "unresponded_48h"
  | "unassigned"
  | "unconfirmed"

export const LEAD_FILTER_KEYS: LeadFilter[] = [
  "all", "new", "contacted", "converted", "closed",
  "unresponded", "unresponded_24h", "unresponded_48h", "unassigned", "unconfirmed",
]

// 이 필터들은 "응대·확인이 필요하다"는 게 관점 자체라 미확인 리드를 그대로 보여준다.
// 그 외 필터(전체/신규/연락중/...)는 검토 전 리드를 숨겨 기본 화면을 깨끗하게 유지한다.
export const CONFIRMATION_GATE_EXEMPT_FILTERS = new Set<LeadFilter>([
  "unconfirmed", "unresponded", "unresponded_24h", "unresponded_48h",
])

// ─── 뷰 축 ─────────────────────────────────────────────────────

export type LeadsView = "console" | "board"
export const LEADS_VIEW_DEFAULT: LeadsView = "console"
export const LEADS_VIEW_PARAM = "view"

export function isLeadsView(value: unknown): value is LeadsView {
  return value === "console" || value === "board"
}

export function readLeadsView(value: string | null | undefined): LeadsView {
  return isLeadsView(value) ? value : LEADS_VIEW_DEFAULT
}

/** 기본값은 URL에서 지운다 — 콘솔은 `?view=` 없이 열리는 것이 정상 주소다. */
export function applyLeadsViewParam(url: URL, view: LeadsView) {
  if (view === LEADS_VIEW_DEFAULT) url.searchParams.delete(LEADS_VIEW_PARAM)
  else url.searchParams.set(LEADS_VIEW_PARAM, view)
}

// ─── 보드 컬럼 ─────────────────────────────────────────────────

export type BoardColumnKey = "unconfirmed" | LeadStatus

export const BOARD_COLUMN_KEYS: BoardColumnKey[] = [
  "unconfirmed", "new", "contacted", "converted", "closed",
]

export const BOARD_COLUMN_LABEL: Record<BoardColumnKey, string> = {
  unconfirmed: "미확인", new: "신규", contacted: "연락중", converted: "전환", closed: "종료",
}

/**
 * 카드가 놓일 컬럼. 확인 게이트는 **활성 리드에만** 건다 —
 * 전환·종료된 리드는 이미 사람 손을 탄 것이라 confirmed_at 이 비어 있어도 미확인이 아니다.
 * (게이트를 무조건 앞세우면 전환 리드가 미확인 컬럼에 섞여 전환 수가 사라진다.)
 */
export function resolveBoardColumn(lead: LeadRecord): BoardColumnKey {
  if (isActiveLead(lead.status) && isUnconfirmedLead(lead)) return "unconfirmed"
  return lead.status
}

export function partitionLeadsToBoardColumns(
  leads: readonly LeadRecord[]
): Record<BoardColumnKey, LeadRecord[]> {
  const columns = {
    unconfirmed: [] as LeadRecord[],
    new: [] as LeadRecord[],
    contacted: [] as LeadRecord[],
    converted: [] as LeadRecord[],
    closed: [] as LeadRecord[],
  } satisfies Record<BoardColumnKey, LeadRecord[]>
  for (const lead of leads) columns[resolveBoardColumn(lead)].push(lead)
  return columns
}

/**
 * 상태와 같은 축인 필터는 보드에서 행을 지우지 않고 **컬럼 포커스**로 강등한다.
 * 그대로 AND로 걸면 5컬럼 중 4개가 설명 없이 비기 때문이다.
 * `all` 은 아무것도 포커스하지 않는다.
 */
export function resolveBoardColumnFocus(filter: LeadFilter): BoardColumnKey | null {
  if (filter === "all") return null
  return BOARD_COLUMN_KEYS.includes(filter as BoardColumnKey) ? (filter as BoardColumnKey) : null
}

/**
 * 상태 축과 직교하는 필터(시간·배정)만 컬럼을 가로질러 AND로 적용한다.
 * 이 값이 true인 필터에서는 컬럼 헤더가 `필터 n / 전체 N` 두 숫자를 쓴다.
 */
export function appliesAcrossBoardColumns(filter: LeadFilter): boolean {
  return filter !== "all" && resolveBoardColumnFocus(filter) === null
}
