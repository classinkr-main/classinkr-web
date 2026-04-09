export type PartnerStatus = "lead" | "active" | "paused" | "churn_risk"
export type PartnerChannel = "reseller" | "referral" | "branch" | "direct"
export type PartnerDataSource = "local" | "supabase"
export type DealStage =
  | "discovery"
  | "quoted"
  | "contract_sent"
  | "active"
  | "closed_won"
  | "closed_lost"
export type DocumentKind = "quote" | "contract" | "receipt"
export type DocumentStatus = "draft" | "sent" | "signed" | "paid" | "overdue" | "archived"
export type DocumentDeliveryChannel = "pdf" | "kakao" | "link"
export type DocumentDeliveryStatus = "draft" | "ready" | "sent" | "opened" | "expired" | "revoked" | "failed"
export type PartnerQuoteWorkflowStatus =
  | "draft"
  | "ready"
  | "sent"
  | "viewed"
  | "revised"
  | "accepted"
  | "rejected"
  | "expired"
  | "converted"
  | "archived"
export type QuoteLineItemType = "hardware" | "installation" | "shipping" | "service" | "discount" | "note_only"
export type QuoteLineItemStatus = "priced" | "pending_price" | "separate_billing" | "informational"
export type QuoteBillingMode = "included_in_quote" | "separate_invoice" | "tbd"
export type ScheduleKind = "meeting" | "follow_up" | "deadline" | "renewal"
export type ScheduleStatus = "planned" | "completed" | "canceled"
export type AutomationStatus = "active" | "paused"
export type PartnerTodoStatus = "open" | "waiting_partner" | "waiting_internal" | "blocked" | "done" | "canceled"
export type PartnerInstallStatus = "planned" | "ordered" | "delivered" | "installed" | "verified" | "issue"
export type PartnerIssueStatus = "open" | "waiting" | "blocked" | "resolved"
export type PartnerIssueSeverity = "low" | "medium" | "high" | "critical"
export type PartnerActivityLogStatus =
  | "recorded"
  | "follow_up_needed"
  | "waiting_partner"
  | "waiting_internal"
  | "blocked"
  | "resolved"
  | "canceled"

export interface PartnerContact {
  id: string
  partnerId: string
  name: string
  role?: string
  email?: string
  phone?: string
  isPrimary: boolean
}

export interface PartnerSummary {
  id: string
  name: string
  status: PartnerStatus
  channel: PartnerChannel
  region: string
  ownerName: string
  ownerEmail: string
  accountManager: string
  nextActionAt?: string
  tags: string[]
  notes?: string
}

export interface PartnerDeal {
  id: string
  partnerId: string
  title: string
  stage: DealStage
  quoteAmount: number
  expectedCloseAt?: string
  contractStartAt?: string
  contractEndAt?: string
  salesUnits: number
  manager: string
}

export interface PartnerDocument {
  id: string
  partnerId: string
  dealId?: string
  kind: DocumentKind
  status: DocumentStatus
  title: string
  amount?: number
  issuedAt?: string
  dueAt?: string
  fileLabel: string
  externalUrl?: string
  lineItemCount?: number
  quoteDetails?: PartnerQuoteDetails
  deliveries: PartnerDocumentDeliverySummary[]
}

export interface PartnerQuoteLineItem {
  id: string
  documentId?: string
  sortOrder: number
  lineNumber: number
  itemType: QuoteLineItemType
  itemCode?: string
  itemName: string
  itemDescription?: string
  unitPrice?: number
  quantity?: number
  quantityUnit?: string
  lineSupplyAmount?: number
  vatIncluded: boolean
  lineStatus?: QuoteLineItemStatus
  billingMode?: QuoteBillingMode
  remark?: string
  linkedQuantityRowId?: string
  linkedChecklistTemplateId?: string
}

export interface PartnerQuoteDetails {
  templateId?: string
  estimateNumber?: string
  workflowStatus?: PartnerQuoteWorkflowStatus
  issuedAt?: string
  validUntil?: string
  subjectText?: string
  recipientCompanyName?: string
  recipientContactName?: string
  recipientPhone?: string
  recipientEmail?: string
  referenceName?: string
  supplierBusinessName?: string
  supplierBusinessRegistrationNumber?: string
  supplierRepresentativeName?: string
  supplierAddress?: string
  supplierContactName?: string
  supplierContactPhone?: string
  supplierContactEmail?: string
  currencyUnitLabel?: string
  vatIncluded?: boolean
  vatPolicyLabel?: string
  deliveryLocationNote?: string
  paymentTerms?: string
  installationPolicy?: string
  warrantyNote?: string
  generalNotes?: string
  specialTerms?: string
  footerContactText?: string
  internalMemo?: string
  subtotalAmount?: number
  vatAmount?: number
  discountAmount?: number
  grandTotalAmount?: number
  hasPendingAmounts?: boolean
  pendingAmountNote?: string
  lineItems: PartnerQuoteLineItem[]
}

export interface PartnerDocumentDeliverySummary {
  id: string
  partnerDocumentId: string
  deliveryChannel: DocumentDeliveryChannel
  status: DocumentDeliveryStatus
  recipientName?: string
  recipientEmail?: string
  recipientPhone?: string
  expiresAt?: string
  passwordEnabled: boolean
  allowDownload: boolean
  allowPrint: boolean
  sentAt?: string
  lastViewedAt?: string
  viewCount: number
}

export interface PartnerScheduleItem {
  id: string
  partnerId: string
  dealId?: string
  kind: ScheduleKind
  status: ScheduleStatus
  title: string
  startsAt: string
  endsAt?: string
  owner: string
}

export interface PartnerSalesRecord {
  id: string
  partnerId: string
  dealId?: string
  salesMonth: string
  unitsSold: number
  grossAmount: number
  netAmount: number
}

export interface PartnerAutomation {
  id: string
  partnerId: string
  dealId?: string
  name: string
  status: AutomationStatus
  trigger: string
  action: string
  destination: string
  lastRunAt?: string
  nextRunAt?: string
}

export interface PartnerOpsChecklistItem {
  id: string
  partnerId: string
  dealId?: string
  parentItemId?: string
  checklistGroup: string
  title: string
  itemCategory?: string
  itemCode?: string
  itemName?: string
  plannedQuantity?: number
  confirmedQuantity?: number
  todoStatus: PartnerTodoStatus
  installStatus: PartnerInstallStatus
  owner?: string
  dueAt?: string
  completedAt?: string
  notes?: string
}

export interface PartnerOpsIssue {
  id: string
  partnerId: string
  dealId?: string
  relatedDocumentId?: string
  relatedChecklistItemId?: string
  title: string
  category: string
  severity: PartnerIssueSeverity
  status: PartnerIssueStatus
  facts?: string
  unresolvedPoints?: string
  currentAssumption?: string
  verifyWith?: string
  owner?: string
  nextCheckAt?: string
  dueAt?: string
  resolvedAt?: string
  resolutionSummary?: string
}

export interface PartnerActivityLog {
  id: string
  partnerId: string
  dealId?: string
  documentId?: string
  scheduleItemId?: string
  checklistItemId?: string
  issueId?: string
  subjectType: string
  subjectId?: string
  logCategory: string
  status: PartnerActivityLogStatus
  actor?: string
  action: string
  summary: string
  details?: string
  nextAction?: string
  dueAt?: string
  occurredAt: string
}

export interface PartnerWorkspace {
  partner: PartnerSummary
  contacts: PartnerContact[]
  deals: PartnerDeal[]
  documents: PartnerDocument[]
  schedule: PartnerScheduleItem[]
  sales: PartnerSalesRecord[]
  automations: PartnerAutomation[]
  checklists: PartnerOpsChecklistItem[]
  issues: PartnerOpsIssue[]
  activityLogs: PartnerActivityLog[]
}

export interface PartnerQueueSummary {
  partnerId: string
  partnerName: string
  status: PartnerStatus
  channel: PartnerChannel
  region: string
  accountManager: string
  ownerName: string
  mainDealStage?: DealStage
  mainDealTitle?: string
  nextActionAt?: string
  openChecklistCount: number
  openIssueCount: number
  overdueDocumentCount: number
  pendingSettlementCount: number
  latestActivitySummary?: string
  latestActivityAt?: string
  riskLevel: "low" | "medium" | "high"
}

export interface PartnerWorkspaceShell {
  partner: PartnerSummary
  mainDeal?: PartnerDeal
  nextActionAt?: string
  todayTodoCount: number
  openIssueCount: number
  pendingDocumentCount: number
  currentMonthSalesUnits: number
  currentMonthNetAmount: number
  lastMeetingAt?: string
  fulfillmentProgress: number
}

export interface PartnerSummaryInput {
  name: string
  status: PartnerStatus
  channel: PartnerChannel
  region: string
  ownerName: string
  ownerEmail: string
  accountManager: string
  tags: string[]
  notes?: string
}

export interface PartnerDealInput {
  id?: string
  title: string
  stage: DealStage
  quoteAmount: number
  expectedCloseAt?: string
  contractStartAt?: string
  contractEndAt?: string
  salesUnits: number
  manager: string
}

export interface PartnerDocumentInput {
  id?: string
  dealId?: string
  kind: DocumentKind
  status: DocumentStatus
  title: string
  amount?: number
  issuedAt?: string
  dueAt?: string
  fileLabel: string
  externalUrl?: string
  quoteDetails?: PartnerQuoteDetailsInput
}

export interface PartnerQuoteLineItemInput {
  id?: string
  sortOrder: number
  lineNumber: number
  itemType: QuoteLineItemType
  itemCode?: string
  itemName: string
  itemDescription?: string
  unitPrice?: number
  quantity?: number
  quantityUnit?: string
  lineSupplyAmount?: number
  vatIncluded?: boolean
  lineStatus?: QuoteLineItemStatus
  billingMode?: QuoteBillingMode
  remark?: string
  linkedQuantityRowId?: string
  linkedChecklistTemplateId?: string
}

export interface PartnerQuoteDetailsInput {
  templateId?: string
  estimateNumber?: string
  workflowStatus?: PartnerQuoteWorkflowStatus
  issuedAt?: string
  validUntil?: string
  subjectText?: string
  recipientCompanyName?: string
  recipientContactName?: string
  recipientPhone?: string
  recipientEmail?: string
  referenceName?: string
  supplierBusinessName?: string
  supplierBusinessRegistrationNumber?: string
  supplierRepresentativeName?: string
  supplierAddress?: string
  supplierContactName?: string
  supplierContactPhone?: string
  supplierContactEmail?: string
  currencyUnitLabel?: string
  vatIncluded?: boolean
  vatPolicyLabel?: string
  deliveryLocationNote?: string
  paymentTerms?: string
  installationPolicy?: string
  warrantyNote?: string
  generalNotes?: string
  specialTerms?: string
  footerContactText?: string
  internalMemo?: string
  subtotalAmount?: number
  vatAmount?: number
  discountAmount?: number
  grandTotalAmount?: number
  hasPendingAmounts?: boolean
  pendingAmountNote?: string
  lineItems?: PartnerQuoteLineItemInput[]
}

export interface PartnerScheduleInput {
  id?: string
  dealId?: string
  kind: ScheduleKind
  status: ScheduleStatus
  title: string
  startsAt: string
  endsAt?: string
  owner: string
}

export interface PartnerSalesInput {
  id?: string
  dealId?: string
  salesMonth: string
  unitsSold: number
  grossAmount: number
  netAmount: number
}

export interface PartnerContactInput {
  id?: string
  name: string
  role?: string
  email?: string
  phone?: string
  isPrimary?: boolean
}

export interface PartnerChecklistInput {
  id?: string
  dealId?: string
  parentItemId?: string
  checklistGroup: string
  title: string
  itemCategory?: string
  itemCode?: string
  itemName?: string
  plannedQuantity?: number
  confirmedQuantity?: number
  todoStatus: PartnerTodoStatus
  installStatus: PartnerInstallStatus
  owner?: string
  dueAt?: string
  completedAt?: string
  notes?: string
}

export interface PartnerIssueInput {
  id?: string
  dealId?: string
  relatedDocumentId?: string
  relatedChecklistItemId?: string
  title: string
  category: string
  severity: PartnerIssueSeverity
  status: PartnerIssueStatus
  facts?: string
  unresolvedPoints?: string
  currentAssumption?: string
  verifyWith?: string
  owner?: string
  nextCheckAt?: string
  dueAt?: string
  resolvedAt?: string
  resolutionSummary?: string
}

export interface PartnerActivityLogInput {
  id?: string
  dealId?: string
  documentId?: string
  scheduleItemId?: string
  checklistItemId?: string
  issueId?: string
  subjectType?: string
  subjectId?: string
  logCategory: string
  status: PartnerActivityLogStatus
  actor?: string
  action: string
  summary: string
  details?: string
  nextAction?: string
  dueAt?: string
  occurredAt: string
}
