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
export type ScheduleKind = "meeting" | "follow_up" | "deadline" | "renewal"
export type ScheduleStatus = "planned" | "completed" | "canceled"
export type AutomationStatus = "active" | "paused"

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

export interface PartnerWorkspace {
  partner: PartnerSummary
  deals: PartnerDeal[]
  documents: PartnerDocument[]
  schedule: PartnerScheduleItem[]
  sales: PartnerSalesRecord[]
  automations: PartnerAutomation[]
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
