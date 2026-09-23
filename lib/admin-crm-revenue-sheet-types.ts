export type RevenueSheetLinkStatus = "candidate" | "confirmed" | "rejected" | "stale" | null

export interface AdminCrmRevenueSheetRow {
  id: string
  sheetRow: number
  sourceRecordKey: string
  customerName: string
  branchContact: string | null
  team: string | null
  manager: string | null
  dealType: string | null
  status: string | null
  firstPayment: string | null
  productVersion: string | null
  region: string | null
  importance: string | null
  note: string | null
  contractTarget: number
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
  pastUnconfirmedAmount: number
  monthCount: number
  linkId: string | null
  linkStatus: RevenueSheetLinkStatus
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  confidence: number | null
  placeholder: boolean
  syncedAt: string
}

export interface AdminCrmRevenueSheetSummary {
  rowCount: number
  activeRowCount: number
  linkedRowCount: number
  candidateRowCount: number
  unmatchedRowCount: number
  contractTargetAmount: number
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
  pastUnconfirmedAmount: number
  linkedAmount: number
  unmatchedAmount: number
  latestSyncedAt: string | null
}

export interface AdminCrmRevenueSheetBreakdownRow {
  key: string
  label: string
  rowCount: number
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
}

export interface AdminCrmRevenueSheetMonthPoint {
  month: string
  scheduledAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
  pastUnconfirmedAmount: number
}

// M8 — rev-sheet "Compass 대조" 배지 소스. months는 monthly[].month와 동일한 "YYYY-MM" 키
// 전량(어드민 쪽에 데이터가 있는 달)이며, adminAmount는 그 달들의 scheduledAmount 합(월별 밴드에
// 실제로 표시되는 합계와 같은 기준). down이면 compassAmount/diffAmount는 신뢰할 수 없다(0 고정).
export interface AdminCrmRevenueSheetCompassCompare {
  down: boolean
  months: string[]
  adminAmount: number
  compassAmount: number
  diffAmount: number
}

// 품질 감사 2026-09-10 — #1(P0, 이중 진실): 매출 장부 콕핏/입력 레일에서 저장→적용까지 마친
// 수기 입력·정정(branch_sales_ledger_entries, entry_status='active')은 branch_rev_deals(구글
// REV 시트 동기화 산물)를 건드리지 않는다 — 이 화면(REV 시트 기반)은 그 건들을 구조적으로 볼
// 방법이 없다. 서버 병합(두 서로 다른 식별자 체계를 매칭)은 오매칭·이중계상 위험이 커 이번
// 범위에서는 하지 않고, 대신 "이 화면 밖에 반영 안 된 장부 매출이 N건 있다"를 셈해 눈에 띄게
// 알린다 — 화면이 최신이라고 오인하지 않도록.
export interface AdminCrmRevenueSheetManualLedgerGap {
  /** 미반영 건수(신규 + 정정). */
  count: number
  /** 미반영 건 금액 합(시트 통화 ¥ — branch_sales_ledger_entries.currency 기본값 CNY). 정정 건의 대체값까지
      더한 값이라 "빠진 매출"로 읽으면 과대하다 — 화면은 newAmount를 쓴다(라운드 5 S-7). 호환을 위해 남긴다. */
  amount: number
  /** 가장 최근 적용 시각 — count가 0이면 null. */
  latestAppliedAt: string | null
  /** 장부에서 새로 만든 행(entry_type manual-new) — 이 화면에 아예 없는 매출. */
  newCount: number
  /** 신규 건 금액 합(¥). 이 화면 합계에 더해져야 할 몫. */
  newAmount: number
  /** 시트 행을 대체한 정정(entry_type manual-edit) — 이 화면은 정정 전 값을 보여 준다. 금액은 더하지 않는다. */
  editCount: number
}

export interface AdminCrmRevenueSheetWorkspace {
  generatedAt: string
  currentMonth: string
  summary: AdminCrmRevenueSheetSummary
  rows: AdminCrmRevenueSheetRow[]
  teams: AdminCrmRevenueSheetBreakdownRow[]
  managers: AdminCrmRevenueSheetBreakdownRow[]
  statuses: AdminCrmRevenueSheetBreakdownRow[]
  monthly: AdminCrmRevenueSheetMonthPoint[]
  compass: AdminCrmRevenueSheetCompassCompare
  manualLedgerGap: AdminCrmRevenueSheetManualLedgerGap
  warnings: string[]
}
