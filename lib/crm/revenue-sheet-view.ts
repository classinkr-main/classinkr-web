// 매출시트(/admin/crm/deals/rev-sheet) 화면의 순수 헬퍼 — 라운드 5 B3·S-6·S-9.
// 필터 URL 보존, 장부 입력 딥링크(라운드 4 P2-10), CSV 행 조립, 동기화 기준 시각 판정.
// 화면(app/admin/crm/deals/rev-sheet/page.tsx)은 이 함수들만 부르고, 테스트는 렌더 없이 이 파일을 검증한다.

import type { AdminCrmRevenueSheetRow, RevenueSheetLinkStatus } from "@/lib/admin-crm-revenue-sheet-types"
import type { DelimitedCell } from "@/lib/export/delimited"

export type RevenueSheetStatusFilter = "all" | "review" | "confirmed" | "candidate" | "stale" | "rejected" | "unmatched"

export const REVENUE_SHEET_STATUS_FILTERS: ReadonlyArray<{ key: RevenueSheetStatusFilter; label: string }> = [
  { key: "review", label: "검토 필요" },
  { key: "all", label: "전체" },
  { key: "confirmed", label: "확정" },
  { key: "candidate", label: "후보" },
  { key: "stale", label: "재검수" },
  { key: "unmatched", label: "미매칭" },
  { key: "rejected", label: "제외" },
]

export interface RevenueSheetUrlState {
  status: RevenueSheetStatusFilter
  team: string
  q: string
}

export const DEFAULT_REVENUE_SHEET_URL_STATE: RevenueSheetUrlState = { status: "review", team: "all", q: "" }

function isStatusFilter(value: string | null): value is RevenueSheetStatusFilter {
  return REVENUE_SHEET_STATUS_FILTERS.some((filter) => filter.key === value)
}

/** URL 쿼리 → 필터 상태. 없거나 모르는 값은 기본값(검토 필요 · 전체 팀 · 검색 없음). */
export function parseRevenueSheetUrlState(search: string): RevenueSheetUrlState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const status = params.get("status")
  const team = params.get("team")?.trim()
  return {
    status: isStatusFilter(status) ? status : DEFAULT_REVENUE_SHEET_URL_STATE.status,
    team: team ? team : DEFAULT_REVENUE_SHEET_URL_STATE.team,
    q: params.get("q") ?? "",
  }
}

/** 필터 상태 → URL 쿼리(기본값은 적지 않는다 — 장부 워크벤치와 같은 "생략=기본값" 규약). */
export function serializeRevenueSheetUrlState(state: RevenueSheetUrlState): string {
  const params = new URLSearchParams()
  if (state.status !== DEFAULT_REVENUE_SHEET_URL_STATE.status) params.set("status", state.status)
  if (state.team && state.team !== DEFAULT_REVENUE_SHEET_URL_STATE.team) params.set("team", state.team)
  if (state.q.trim()) params.set("q", state.q.trim())
  return params.toString()
}

const LEDGER_TEAMS = new Set(["BD", "MKT", "CSM"])

/**
 * 행 → 매출 장부의 그 행으로 바로 가는 링크(라운드 4 P2-10). REV 렌즈 · 월 기간(M) · 당월 · 고객명 검색.
 * - 장부는 period=M일 때만 month를 쓴다 — 특정 월로 들어가려면 둘을 함께 싣는다.
 * - 임시명 행은 이름 검색이 의미가 없어 시트 행 번호로 찾는다(장부 검색은 시트 행 번호도 본다).
 * - 팀은 장부가 아는 값(BD·MKT·CSM)일 때만 — 다른 값을 넣으면 장부가 기본값(전체)으로 돌린다.
 */
export function buildLedgerEntryHref(
  row: Pick<AdminCrmRevenueSheetRow, "customerName" | "placeholder" | "sheetRow" | "team">,
  month: string,
): string {
  const params = new URLSearchParams({ lens: "rev", period: "M" })
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) params.set("month", month)
  const query = row.placeholder && row.sheetRow ? String(row.sheetRow) : row.customerName.trim()
  if (query) params.set("q", query)
  const team = row.team?.trim().toUpperCase()
  if (team && LEDGER_TEAMS.has(team)) params.set("team", team)
  return `/admin/branch/ledger?${params.toString()}`
}

/** 장부 수기 입력 확인 링크 — 적용 초안 원천(origin=draft)만, 회계연도 전체(period=Y). */
export const LEDGER_MANUAL_ENTRIES_HREF = "/admin/branch/ledger?origin=draft&period=Y"

const LINK_STATUS_LABEL: Record<Exclude<RevenueSheetLinkStatus, null>, string> = {
  candidate: "후보",
  confirmed: "확정",
  rejected: "제외",
  stale: "재검수",
}

export function revenueSheetLinkStatusLabel(status: RevenueSheetLinkStatus): string {
  return status ? LINK_STATUS_LABEL[status] : "미매칭"
}

/**
 * 현재 필터 결과 → CSV 행(머리글 포함). 금액은 시트 통화(¥) 정수 그대로 — 화면의 만 단위 축약은 표시 전용이다.
 * 표시 상한(80행)과 무관하게 넘겨받은 행 전체를 담는다.
 */
export function buildRevenueSheetCsvRows(rows: ReadonlyArray<AdminCrmRevenueSheetRow>): DelimitedCell[][] {
  const header: DelimitedCell[] = [
    "시트 행",
    "고객",
    "임시명",
    "팀",
    "담당",
    "지역",
    "브랜치/유형",
    "상태",
    "초입금",
    "확정 표시(¥)",
    "확정 임박(¥)",
    "예정(¥)",
    "전환 대기(¥)",
    "CRM 연결",
    "연결 대상",
    "신뢰도(%)",
    "메모",
    "동기화 시각",
  ]
  const body = rows.map((row): DelimitedCell[] => [
    row.sheetRow,
    row.customerName,
    row.placeholder,
    row.team,
    row.manager,
    row.region,
    row.branchContact ?? row.dealType,
    row.status,
    row.firstPayment,
    Math.round(row.confirmedAmount),
    Math.round(row.highConfidenceAmount),
    Math.round(row.expectedAmount),
    Math.round(row.pastUnconfirmedAmount),
    revenueSheetLinkStatusLabel(row.linkStatus),
    row.targetLabel,
    row.confidence == null ? null : Math.round(row.confidence * 100),
    row.note ?? row.productVersion,
    row.syncedAt,
  ])
  return [header, ...body]
}

// 크론은 하루 한 번(lib/branch/sync/schedule.ts)이라 하루를 넘기면 "어제 크론도 실패했다"는 뜻이다 —
// 여유 2시간을 둔 26시간을 넘으면 기준 시각을 경고 톤으로 보인다.
export const REVENUE_SHEET_STALE_AFTER_MS = 26 * 60 * 60 * 1000

export function isRevenueSheetSyncStale(latestSyncedAt: string | null | undefined, now: number): boolean {
  if (!latestSyncedAt) return true
  const synced = Date.parse(latestSyncedAt)
  if (!Number.isFinite(synced)) return true
  return now - synced > REVENUE_SHEET_STALE_AFTER_MS
}
