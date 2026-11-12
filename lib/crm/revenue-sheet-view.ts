// 매출시트(/admin/crm/deals/rev-sheet) 화면의 순수 헬퍼 — 라운드 5 B3·S-6·S-9.
// 필터 URL 보존, 장부 입력 딥링크(라운드 4 P2-10), CSV 행 조립, 동기화 기준 시각 판정.
// 화면(app/admin/crm/deals/rev-sheet/page.tsx)은 이 함수들만 부르고, 테스트는 렌더 없이 이 파일을 검증한다.

import { isInactiveSheetStatus } from "@/lib/crm-source-linking"
import type {
  AdminCrmRevenueSheetRow,
  AdminCrmRevenueSheetSummary,
  RevenueSheetLinkStatus,
} from "@/lib/admin-crm-revenue-sheet-types"
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
/**
 * '확정 예정' 칩 툴팁(ADR-0062) — "w4 시작 10/22에 확정 전환". 월 합계 칸 예정(week 0)은 "10/01에 확정 전환".
 * 빨간 글자인데 그 주가 아직 안 온 금액이라, 그 주 시작일 이후 첫 동기화에서 확정으로 올라간다.
 */
export function formatPendingTransition(row: Pick<AdminCrmRevenueSheetRow, "pendingNextWeek" | "pendingNextStart">): string | null {
  const match = row.pendingNextStart?.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (!match || row.pendingNextWeek == null) return null
  const date = `${match[1]}/${match[2]}`
  return row.pendingNextWeek > 0 ? `w${row.pendingNextWeek} 시작 ${date}에 확정 전환` : `${date}에 확정 전환`
}

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
    // 뒤에 덧붙인다 — 기존 열 순서를 쓰는 스프레드시트 수식이 밀리지 않게.
    "확정 예정(¥)",
    "확정 전환일",
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
    Math.round(row.pendingAmount),
    row.pendingNextStart,
  ])
  return [header, ...body]
}

// 크론은 하루 3번(KST 09·13·17시, vercel.json /api/cron/sync-branch)이다. 마지막 크론(17시)과 다음 날 첫 크론(09시)
// 사이가 16시간이라, 여유를 둔 26시간을 넘기면 "하루치 크론이 모두 실패했다"는 뜻 — 기준 시각을 경고 톤으로 보인다.
export const REVENUE_SHEET_STALE_AFTER_MS = 26 * 60 * 60 * 1000

export function isRevenueSheetSyncStale(latestSyncedAt: string | null | undefined, now: number): boolean {
  if (!latestSyncedAt) return true
  const synced = Date.parse(latestSyncedAt)
  if (!Number.isFinite(synced)) return true
  return now - synced > REVENUE_SHEET_STALE_AFTER_MS
}

// ── P2 행 확정·제외 뒤 요약 다시 세기 ────────────────────────────────────────────
// 서버 요약(lib/admin-crm-revenue-sheet.ts)은 활성(취소·해지 등 아님)·실명(임시명 아님) 행만
// 매칭 분모로 센다. 행에서 바로 확정·제외하면 전체를 다시 받지 않고(서버 60초 캐시가 아직 옛 값을
// 줄 수 있다) 바뀐 행의 차이만 요약에 더한다 — 실패 복원도 같은 함수로 역방향이 된다.

type LinkSummaryFields = Pick<
  AdminCrmRevenueSheetSummary,
  "linkedRowCount" | "candidateRowCount" | "unmatchedRowCount" | "linkedAmount" | "unmatchedAmount"
>

function isMatchableRevenueSheetRow(row: AdminCrmRevenueSheetRow) {
  return !row.placeholder && !isInactiveSheetStatus(row.status)
}

function linkContribution(row: AdminCrmRevenueSheetRow): LinkSummaryFields {
  if (!isMatchableRevenueSheetRow(row)) {
    return { linkedRowCount: 0, candidateRowCount: 0, unmatchedRowCount: 0, linkedAmount: 0, unmatchedAmount: 0 }
  }
  const linked = row.linkStatus === "confirmed"
  const candidate = row.linkStatus === "candidate" || row.linkStatus === "stale"
  return {
    linkedRowCount: linked ? 1 : 0,
    candidateRowCount: candidate ? 1 : 0,
    unmatchedRowCount: linked ? 0 : 1,
    linkedAmount: linked ? row.scheduledAmount : 0,
    unmatchedAmount: linked ? 0 : row.scheduledAmount,
  }
}

/** before→after 행 배열에서 링크 상태가 바뀐 행만 골라 요약 링크 수치를 고친다(id 기준). */
export function recountRevenueSheetLinkSummary<S extends LinkSummaryFields>(
  summary: S,
  before: readonly AdminCrmRevenueSheetRow[],
  after: readonly AdminCrmRevenueSheetRow[]
): S {
  const previousById = new Map(before.map((row) => [row.id, row]))
  const next = { ...summary }
  const keys = ["linkedRowCount", "candidateRowCount", "unmatchedRowCount", "linkedAmount", "unmatchedAmount"] as const
  let changed = false
  for (const row of after) {
    const previous = previousById.get(row.id)
    if (!previous || previous.linkStatus === row.linkStatus) continue
    const from = linkContribution(previous)
    const to = linkContribution(row)
    for (const key of keys) {
      if (from[key] === to[key]) continue
      next[key] = next[key] - from[key] + to[key]
      changed = true
    }
  }
  return changed ? next : summary
}
