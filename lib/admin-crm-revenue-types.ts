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
  monthly: CrmRevenueMonthlyPoint[]
  partners: CrmRevenuePartnerRow[]
  risks: CrmRevenueRiskItem[]
  documents: CrmRevenueDocumentRow[]
  sources: CrmRevenueSource[]
  warnings: string[]
}
