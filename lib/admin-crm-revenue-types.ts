export type CrmRevenueSourceStatus = "connected" | "configured" | "not_configured" | "error"

export interface CrmRevenueSource {
  key: string
  label: string
  status: CrmRevenueSourceStatus
  mode: "read" | "read_write" | "planned"
  recordCount: number
  latencyMs: number | null
  lastSyncedAt: string | null
  description: string
  actionLabel?: string
  actionHref?: string
}

export interface CrmRevenueSummary {
  quotedAmount: number
  acceptedQuoteAmount: number
  contractedAmount: number
  paidAmount: number
  outstandingAmount: number
  expectedPipelineAmount: number
  activeDealCount: number
  customerCount: number
  partnerCount: number
  sourceRecordCount: number
}

export interface CrmRevenueMonthlyPoint {
  month: string
  quotedAmount: number
  contractedAmount: number
  paidAmount: number
  expectedAmount: number
  sheetConfirmedAmount: number
  sheetHighConfidenceAmount: number
  sheetExpectedAmount: number
}

export interface CrmRevenueSheetSummary {
  targetAmount: number
  confirmedAmount: number
  highConfidenceAmount: number
  expectedAmount: number
  unconfirmedPastAmount: number
  dealCount: number
  activeDealCount: number
}

export type CrmSourceLinkStatus = "candidate" | "confirmed" | "rejected" | "stale"

export interface CrmRevenueIdentitySummary {
  totalLinks: number
  confirmedLinks: number
  candidateLinks: number
  rejectedLinks: number
  staleLinks: number
  linkedSheetDealCount: number
  unmatchedSheetDealCount: number
  targetCustomerCount: number
  targetDealCount: number
  lastLinkedAt: string | null
}

export interface CrmRevenueSheetMatchRow {
  key: string
  linkId: string | null
  sheetRow: number
  customerName: string
  ownerName: string
  status: string | null
  amount: number
  monthCount: number
  linkStatus: CrmSourceLinkStatus | null
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  confidence: number | null
}

export interface CrmRevenuePartnerRow {
  id: string
  name: string
  quotedAmount: number
  contractedAmount: number
  paidAmount: number
  outstandingAmount: number
  activeDealCount: number
  latestActivityAt: string | null
}

export interface CrmRevenueRiskItem {
  id: string
  title: string
  ownerName: string
  amount: number
  reason: string
  href: string
}

export interface CrmRevenueDocumentRow {
  id: string
  kind: "quote" | "contract" | "receipt" | "deal"
  title: string
  ownerName: string
  status: string
  amount: number
  occurredAt: string | null
  href: string
}

export interface CrmRevenueDashboard {
  generatedAt: string
  range: {
    months: number
    startMonth: string
    endMonth: string
  }
  summary: CrmRevenueSummary
  sheet: CrmRevenueSheetSummary | null
  identity: CrmRevenueIdentitySummary | null
  sheetMatches: CrmRevenueSheetMatchRow[]
  monthly: CrmRevenueMonthlyPoint[]
  partners: CrmRevenuePartnerRow[]
  risks: CrmRevenueRiskItem[]
  documents: CrmRevenueDocumentRow[]
  sources: CrmRevenueSource[]
  warnings: string[]
}
