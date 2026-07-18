// 매출시트 ↔ CRM 싱크 상태 순수 규칙 (시안: docs/active/mockups/rev-crm-sync-visual-2026-07-18.html)
//
// 상태 3단계는 "계정 커버리지" 축 기준이다 — confidence 캐논(파랑 #1E5DA8, REV 3단)과는
// 별개의 축이므로 여기서 파랑은 절대 쓰지 않는다(낮음=테라코타 / 부분=앰버 / 건강=그린).
// 서버(rev-account-coverage 집계)와 클라이언트(CrmSyncStrip·SyncStatusBar 칩)가 같은
// 판정을 공유해야 하므로 server-only 의존성 없이 순수 함수로만 둔다.

export type RevSyncHealth = "low" | "partial" | "healthy"

/** 계정 커버리지 % 문턱 — [0,10) 낮음 / [10,60) 부분 / [60,∞) 건강. */
export const REV_SYNC_HEALTH_THRESHOLDS = { partial: 10, healthy: 60 } as const

/** 연결 계정 비율(%). 분모 0이면 0. */
export function revSyncAccountPct(connectedAccounts: number, totalAccounts: number): number {
  if (!Number.isFinite(connectedAccounts) || !Number.isFinite(totalAccounts) || totalAccounts <= 0) return 0
  return (Math.max(0, connectedAccounts) / totalAccounts) * 100
}

/**
 * 싱크 상태 판정 — "연결 계정"은 확정 링크가 1행이라도 있는 계정(전행 확정 + 부분 확정).
 * 분모가 0이면(시트 비어 있음/집계 실패) 낙관하지 않고 low로 본다.
 */
export function revSyncHealth(connectedAccounts: number, totalAccounts: number): RevSyncHealth {
  const pct = revSyncAccountPct(connectedAccounts, totalAccounts)
  if (totalAccounts <= 0) return "low"
  if (pct < REV_SYNC_HEALTH_THRESHOLDS.partial) return "low"
  if (pct < REV_SYNC_HEALTH_THRESHOLDS.healthy) return "partial"
  return "healthy"
}

/** 표기 규약 — 10% 미만은 소수 1자리(0.9%), 이상은 정수 반올림(87%). */
export function formatRevSyncPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "0%"
  if (pct < 10) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

// ── coverage API(revAccounts 축) additive 필드의 공용 shape ─────────────────
// 서버 집계(lib/repositories/rev-account-coverage.ts)와 클라이언트 소비자가 같은
// 선언을 쓴다. 기존 소비자(CrmCoverageStrip 등)와의 하위호환을 위해 전부 additive.

export interface RevSyncRowsCoverage {
  /** 매칭 대상 행 수 — 활성(취소/해지 제외) 중 플레이스홀더 제외 */
  matchable: number
  /** 확정 링크 행 */
  linked: number
  /** 후보(검토 대기) 행 */
  review: number
  /** 링크도 후보도 없는 행 */
  unlinked: number
}

export interface RevSyncRevenueCny {
  total: number
  linked: number
  coveragePct: number
  /** 플레이스홀더(HW/SW/MKT 접두 임시 고객) 행으로 매칭 대상에서 제외된 매출 */
  placeholder: number
}

export interface RevSyncHygiene {
  /** candidate 링크의 시트 행 키가 현 시트에 없음 — 행 이동/수정으로 고아가 된 후보 */
  orphanCandidates: number
  /** status=stale로 은퇴한 링크 */
  staleLinks: number
}

/** 클라이언트가 보는 revAccounts 축(확장분은 배포 스큐 대비 optional). */
export interface RevSyncCoverageView {
  scannedRows: number
  accounts: {
    total: number
    linked: number
    partial: number
    needsReview: number
    unlinked: number
    placeholder: number
  }
  revenue: RevSyncRevenueCny
  topUnlinked: Array<{
    accountKey: string
    name: string
    rows: number
    unlinkedRevenue: number
    manager?: string | null
  }>
  rows?: RevSyncRowsCoverage
  revenueCny?: RevSyncRevenueCny
  asOf?: string | null
  hygiene?: RevSyncHygiene
  health?: RevSyncHealth
}

/** A안 스트립 헤드라인·B안 칩이 공유하는 요약 모델. 확장 필드가 없으면(구 서버) null. */
export interface CrmSyncSummary {
  health: RevSyncHealth
  accountConnected: number
  accountTotal: number
  accountPctLabel: string
  revenueLinked: number
  revenueTotal: number
  revenuePctLabel: string
  rows: RevSyncRowsCoverage
  hygiene: RevSyncHygiene
  asOf: string | null
  /** 매칭 대상에서 제외된 플레이스홀더 행 수(scannedRows − matchable) */
  placeholderRows: number
  placeholderRevenue: number
}

export function buildCrmSyncSummary(rev: RevSyncCoverageView | null | undefined): CrmSyncSummary | null {
  if (!rev || !rev.rows || !rev.hygiene || rev.scannedRows <= 0) return null
  const revenue = rev.revenueCny ?? rev.revenue
  const accountConnected = rev.accounts.linked + rev.accounts.partial
  const accountTotal = rev.accounts.total
  const revenuePct = revenue.total > 0 ? (revenue.linked / revenue.total) * 100 : 0
  return {
    health: rev.health ?? revSyncHealth(accountConnected, accountTotal),
    accountConnected,
    accountTotal,
    accountPctLabel: formatRevSyncPct(revSyncAccountPct(accountConnected, accountTotal)),
    revenueLinked: revenue.linked,
    revenueTotal: revenue.total,
    revenuePctLabel: formatRevSyncPct(revenuePct),
    rows: rev.rows,
    hygiene: rev.hygiene,
    asOf: rev.asOf ?? null,
    placeholderRows: Math.max(0, rev.scannedRows - rev.rows.matchable),
    placeholderRevenue: revenue.placeholder,
  }
}
