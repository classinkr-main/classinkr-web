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
  warnings: string[]
}
