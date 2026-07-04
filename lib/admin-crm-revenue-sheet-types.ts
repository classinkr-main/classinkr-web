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

export interface AdminCrmRevenueSheetWorkspace {
  generatedAt: string
  currentMonth: string
  summary: AdminCrmRevenueSheetSummary
  rows: AdminCrmRevenueSheetRow[]
  teams: AdminCrmRevenueSheetBreakdownRow[]
  managers: AdminCrmRevenueSheetBreakdownRow[]
  statuses: AdminCrmRevenueSheetBreakdownRow[]
  monthly: AdminCrmRevenueSheetMonthPoint[]
  warnings: string[]
}
