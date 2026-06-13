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
  deliveryTotalAmount: number
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
  linkedDealCount: number
  linkedAmount: number
  unlinkedAmount: number
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

export interface CrmRevenueExternalLinkRow {
  linkId: string
  sourceObject: string
  sourceRecordKey: string
  sourceLabel: string | null
  sourceOwner: string | null
  sourceStatus: string | null
  sourceAmount: number | null
  occurredAt: string | null
  syncedAt: string | null
  linkStatus: CrmSourceLinkStatus
  targetType: string
  targetId: string
  targetLabel: string | null
  confidence: number | null
  updatedAt: string
}

export interface CrmRevenueExternalSnapshotObjectRow {
  objectApiKey: string
  recordCount: number
  latestSyncedAt: string | null
}

export interface CrmRevenueExternalSnapshotSummary {
  totalRecordCount: number
  staleRecordCount: number
  latestSyncedAt: string | null
  objectCounts: CrmRevenueExternalSnapshotObjectRow[]
}

export interface CrmRevenueExternalRecordRow {
  objectApiKey: string
  externalId: string
  displayName: string | null
  ownerName: string | null
  status: string | null
  amount: number | null
  occurredAt: string | null
  syncedAt: string
}

export type CrmWriteRequestStatus = "draft" | "approved" | "sent" | "succeeded" | "failed" | "cancelled"
export type CrmWriteRequestOperation = "create" | "update" | "transfer_owner"

export interface CrmRevenueWriteRequestRow {
  id: string
  sourceSystem: string
  objectApiKey: string
  externalId: string | null
  operation: CrmWriteRequestOperation
  status: CrmWriteRequestStatus
  payload: Record<string, unknown>
  previewPayload: Record<string, unknown> | null
  approvedAt: string | null
  executedAt: string | null
  attemptCount: number
  lastAttemptAt: string | null
  nextRetryAt: string | null
  lastAttemptError: string | null
  error: string | null
  createdAt: string
  updatedAt: string
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
  externalSnapshot: CrmRevenueExternalSnapshotSummary | null
  externalRecords: CrmRevenueExternalRecordRow[]
  externalLinks: CrmRevenueExternalLinkRow[]
  writeRequests: CrmRevenueWriteRequestRow[]
  monthly: CrmRevenueMonthlyPoint[]
  partners: CrmRevenuePartnerRow[]
  risks: CrmRevenueRiskItem[]
  documents: CrmRevenueDocumentRow[]
  sources: CrmRevenueSource[]
  warnings: string[]
}
