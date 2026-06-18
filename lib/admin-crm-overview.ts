import "server-only"

import { getCrmDuplicatePreflightReport } from "@/lib/admin-crm-duplicate-preflight"
import { getNeoCrmTeamReport } from "@/lib/admin-crm-neo"
import { getCrmSchemaContractReadiness } from "@/lib/admin-crm-schema-contract"
import { getXiaoshouyiSyncPreflight, getXiaoshouyiSyncSchemaReadiness } from "@/lib/external-crm/xiaoshouyi-sync"
import { getXiaoshouyiWriteSchemaReadiness } from "@/lib/external-crm/xiaoshouyi-write"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type AdminCrmOverviewStatus = "ok" | "warning" | "blocked"
export type AdminCrmCustomerLogKind = "call" | "visit" | "quote" | "order" | "payment" | "activity"

export interface AdminCrmCustomerLogItem {
  id: string
  kind: AdminCrmCustomerLogKind
  title: string
  summary: string | null
  status: string | null
  amount: number | null
  occurredAt: string | null
  customerId: string | null
  customerName: string | null
  partnerAccountId: string | null
  partnerAccountName: string | null
  dealId: string | null
  dealTitle: string | null
  href: string
}

export interface AdminCrmUpcomingEventItem {
  id: string
  kind: "install" | "visit"
  title: string
  customerName: string | null
  startsAt: string
  href: string
}

export interface AdminCrmFrequentCustomerItem {
  customerId: string
  customerName: string
  contactCount: number
  latestSummary: string | null
  latestAt: string | null
  href: string
}

export interface AdminCrmOverview {
  generatedAt: string
  overallStatus: AdminCrmOverviewStatus
  business: {
    ok: boolean
    warning: string | null
    error: string | null
    revenue: {
      deliveryTotalAmount: number
      contractedAmount: number
      paidAmount: number
      outstandingAmount: number
      expectedPipelineAmount: number
      acceptedQuoteAmount: number
    }
    kpis: {
      partnerAccountCount: number
      customerCount: number
      activeDealCount: number
      paymentRiskCount: number
      quoteDocumentCount: number
      recentActivityCount: number
    }
    customerLogs: {
      latestActivityAt: string | null
      recent: AdminCrmCustomerLogItem[]
    }
    snapshot: {
      source: "db_snapshot" | "live_query"
      refreshedAt: string | null
      stale: boolean
      maxAgeSeconds: number
    }
    upcomingThisWeek: {
      count: number
      items: AdminCrmUpcomingEventItem[]
    }
    frequentCustomers: AdminCrmFrequentCustomerItem[]
  }
  schema: {
    ok: number
    blocked: number
    firstBlocked: string | null
    firstAction: string | null
  }
  xiaoshouyi: {
    configured: boolean
    authMode: "access_token" | "service_oauth" | "missing"
    missingEnvGroups: string[]
    objectCount: number
    pageSize: number
    maxPages: number
  }
  sourceLinks: {
    ok: boolean
    total: number
    confirmed: number
    candidate: number
    rejected: number
    stale: number
    error: string | null
  }
  externalSnapshots: {
    ok: boolean
    recordCount: number
    staleCount: number
    latestSyncedAt: string | null
    latestRunStatus: string | null
    latestRunObject: string | null
    error: string | null
  }
  writeQueue: {
    ok: boolean
    active: number
    draft: number
    approved: number
    sent: number
    failed: number
    succeeded: number
    cancelled: number
    error: string | null
  }
  neoCrm: AdminCrmNeoCrmOverview
}

export interface AdminCrmNeoCrmOrderItem {
  key: string
  objectApiKey: string
  customerName: string
  ownerName: string | null
  status: string | null
  amount: number | null
  occurredAt: string | null
}

export interface AdminCrmNeoCrmOverview {
  ok: boolean
  error: string | null
  latestSyncedAt: string | null
  kpis: {
    accountCount: number
    activeAccountCountMonth: number
    salesAmountMonth: number
    salesCountMonth: number
    opportunityAmount: number
    opportunityCountMonth: number
    collectionAmountMonth: number
    collectionCountMonth: number
    collectionAmount30d: number
    collectionCount30d: number
  }
  recentOrders: AdminCrmNeoCrmOrderItem[]
}

type SupabaseErrorLike = { code?: string; details?: string; hint?: string; message?: string } | null
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

const SOURCE_LINK_STATUSES = ["confirmed", "candidate", "rejected", "stale"] as const
const WRITE_REQUEST_STATUSES = ["draft", "approved", "sent", "failed", "succeeded", "cancelled"] as const
const EXTERNAL_CRM_OVERVIEW_OBJECTS = [
  "User",
  "account",
  "contact",
  "opportunity",
  "ShroffAccount__c",
  "Collection__c",
  "SalesPerformance__c",
  "CollectionPlan__c",
  "FinancialInformation__c",
  "ResourceInformation__c",
] as const
const BUSINESS_QUERY_LIMIT = 5000
const RECENT_BUSINESS_LOG_LIMIT = 12
const RECENT_ACTIVITY_DAYS = 7
const UPCOMING_EVENT_DAYS = 7
const FREQUENT_CUSTOMER_DAYS = 14
const FREQUENT_ACTIVITY_SCAN_LIMIT = 2000
const FREQUENT_CUSTOMER_LIMIT = 5
const BUSINESS_SNAPSHOT_RPC = "admin_crm_business_overview"
const BUSINESS_SNAPSHOT_MAX_AGE_SECONDS = 300
const BUSINESS_SNAPSHOT_MISSING_WARNING =
  `${BUSINESS_SNAPSHOT_RPC} 함수가 없어 라이브 집계로 대체했습니다. ` +
  "supabase/migrations/20260613_admin_crm_overview_snapshot.sql 적용이 필요합니다."

interface BusinessPartnerAccountRow {
  id: string
  name: string
  owner_name: string | null
  status: string
  updated_at: string
}

interface BusinessCustomerRow {
  id: string
  partner_account_id: string
  name: string
  campus_name: string | null
  region_label: string | null
  updated_at: string
}

interface BusinessDealRow {
  id: string
  partner_account_id: string
  customer_id: string
  deal_code: string
  title: string
  status: string
  current_stage: string
  expected_amount: number
  contracted_amount: number
  installed_amount: number
  paid_amount: number
  outstanding_amount: number
  payment_status: string
  closed_at: string | null
  created_at: string
  updated_at: string
}

interface LegacyQuoteOverviewRow {
  id: string
  status: string
  total_amount: number
  accepted_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

interface LegacyContractOverviewRow {
  id: string
  status: string
  total_amount: number
  partner_signed_at: string | null
  admin_signed_at: string | null
  created_at: string
  updated_at: string
}

interface LegacyReceiptOverviewRow {
  id: string
  total_amount: number
  paid_at: string | null
  created_at: string
  updated_at: string
}

interface BusinessActivityLogRow {
  id: string
  partner_account_id: string
  customer_id: string | null
  deal_id: string | null
  action_type: string
  target_type: string
  summary: string
  created_at: string
}

interface BusinessQuoteDocumentRow {
  id: string
  deal_id: string
  quote_number: string
  status: string
  created_at: string
  updated_at: string
}

interface BusinessContractDocumentRow {
  id: string
  deal_id: string
  contract_number: string
  status: string
  created_at: string
  updated_at: string
}

interface BusinessPaymentRow {
  id: string
  partner_account_id: string
  customer_id: string
  deal_id: string
  amount: number
  paid_at: string
  payment_method: string
  memo: string | null
  created_at: string
  updated_at: string
}

interface BusinessReceiptRow {
  id: string
  partner_account_id: string
  customer_id: string
  deal_id: string
  receipt_number: string
  total_amount: number
  created_at: string
  updated_at: string
}

interface BusinessCalendarEventRow {
  id: string
  partner_account_id: string
  customer_id: string | null
  deal_id: string | null
  source_type: string
  title: string
  status: string
  starts_at: string
  ends_at: string
  created_at: string
  updated_at: string
}

function formatSupabaseError(error: SupabaseErrorLike) {
  if (!error) return "unknown database error"
  const parts = [error.message, error.details, error.hint, error.code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.join(" · ") || "unknown database error"
}

function formatLabeledSupabaseError(label: string, error: SupabaseErrorLike) {
  if (!error) return null
  const detail = formatSupabaseError(error)
  return detail === "unknown database error" ? `${label} query failed` : `${label}: ${detail}`
}

function firstError(errors: SupabaseErrorLike[]) {
  return errors.find(Boolean) ?? null
}

function rowsOrEmpty<T>(rows: T[] | null | undefined) {
  return rows ?? []
}

function sumBy<T>(rows: T[], selector: (row: T) => number | null | undefined) {
  return rows.reduce((sum, row) => {
    const value = Number(selector(row) ?? 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
}

function maxDate(values: Array<string | null | undefined>) {
  let latest: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const value of values) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (Number.isNaN(time) || time <= latestTime) continue
    latest = value
    latestTime = time
  }

  return latest
}

function getCustomerLabel(customer: BusinessCustomerRow | undefined) {
  if (!customer) return null
  return [customer.name, customer.campus_name].filter(Boolean).join(" · ")
}

function classifyCustomerLogKind(actionType: string, targetType: string, summary?: string | null): AdminCrmCustomerLogKind {
  const haystack = `${actionType} ${targetType} ${summary ?? ""}`.toLowerCase()
  if (/call|phone|전화|통화/.test(haystack)) return "call"
  if (/visit|meeting|calendar|installation|방문|미팅|설치/.test(haystack)) return "visit"
  if (/quote|견적/.test(haystack)) return "quote"
  if (/payment|receipt|수납|입금|영수/.test(haystack)) return "payment"
  if (/contract|order|주문|계약/.test(haystack)) return "order"
  return "activity"
}

function buildCustomerLogContext(input: {
  partnerAccountId: string | null
  customerId: string | null
  dealId: string | null
  accountNameById: Map<string, string>
  customerById: Map<string, BusinessCustomerRow>
  dealById: Map<string, BusinessDealRow>
}) {
  const deal = input.dealId ? input.dealById.get(input.dealId) : undefined
  const customerId = input.customerId ?? deal?.customer_id ?? null
  const partnerAccountId = input.partnerAccountId ?? deal?.partner_account_id ?? null
  const customer = customerId ? input.customerById.get(customerId) : undefined

  return {
    partnerAccountId,
    partnerAccountName: partnerAccountId ? input.accountNameById.get(partnerAccountId) ?? null : null,
    customerId,
    customerName: getCustomerLabel(customer),
    dealId: input.dealId ?? null,
    dealTitle: deal ? `${deal.deal_code} · ${deal.title}` : null,
  }
}

function getCustomerLogHref(customerId: string | null, dealId: string | null) {
  if (dealId) return `/admin/crm/deals/orders?deal=${dealId}`
  if (customerId) return `/admin/crm/customers/accounts?customer=${customerId}`
  return "/admin/crm/customers/accounts"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function toText(value: unknown, fallback = "") {
  return typeof value === "string" && value ? value : fallback
}

function toTextOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) return null
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null
}

const CUSTOMER_LOG_KINDS: readonly AdminCrmCustomerLogKind[] = ["call", "visit", "quote", "order", "payment", "activity"]

function toCustomerLogKind(value: unknown): AdminCrmCustomerLogKind {
  return CUSTOMER_LOG_KINDS.find((kind) => kind === value) ?? "activity"
}

function mapSnapshotCustomerLog(row: Record<string, unknown>): AdminCrmCustomerLogItem {
  return {
    id: toText(row.id),
    kind: toCustomerLogKind(row.kind),
    title: toText(row.title),
    summary: toTextOrNull(row.summary),
    status: toTextOrNull(row.status),
    amount: toNumberOrNull(row.amount),
    occurredAt: toTextOrNull(row.occurredAt),
    customerId: toTextOrNull(row.customerId),
    customerName: toTextOrNull(row.customerName),
    partnerAccountId: toTextOrNull(row.partnerAccountId),
    partnerAccountName: toTextOrNull(row.partnerAccountName),
    dealId: toTextOrNull(row.dealId),
    dealTitle: toTextOrNull(row.dealTitle),
    href: toText(row.href, "/admin/crm/customers/accounts"),
  }
}

function mapSnapshotUpcomingEvent(row: Record<string, unknown>): AdminCrmUpcomingEventItem {
  return {
    id: toText(row.id),
    kind: row.kind === "install" ? "install" : "visit",
    title: toText(row.title, "일정"),
    customerName: toTextOrNull(row.customerName),
    startsAt: toText(row.startsAt),
    href: toText(row.href, "/admin/crm/customers/accounts"),
  }
}

function mapSnapshotFrequentCustomer(row: Record<string, unknown>): AdminCrmFrequentCustomerItem {
  return {
    customerId: toText(row.customerId),
    customerName: toText(row.customerName, "고객 미지정"),
    contactCount: toFiniteNumber(row.contactCount),
    latestSummary: toTextOrNull(row.latestSummary),
    latestAt: toTextOrNull(row.latestAt),
    href: toText(row.href, "/admin/crm/customers/accounts"),
  }
}

function mapBusinessSnapshotPayload(payload: Record<string, unknown>): AdminCrmOverview["business"] {
  const revenue = isRecord(payload.revenue) ? payload.revenue : {}
  const kpis = isRecord(payload.kpis) ? payload.kpis : {}
  const customerLogs = isRecord(payload.customerLogs) ? payload.customerLogs : {}
  const upcoming = isRecord(payload.upcomingThisWeek) ? payload.upcomingThisWeek : {}

  const recentLogs = (Array.isArray(customerLogs.recent) ? customerLogs.recent : [])
    .filter(isRecord)
    .map(mapSnapshotCustomerLog)
  const upcomingItems = (Array.isArray(upcoming.items) ? upcoming.items : [])
    .filter(isRecord)
    .map(mapSnapshotUpcomingEvent)
  const frequentCustomers = (Array.isArray(payload.frequentCustomers) ? payload.frequentCustomers : [])
    .filter(isRecord)
    .map(mapSnapshotFrequentCustomer)

  return {
    ok: true,
    warning: null,
    error: null,
    revenue: {
      deliveryTotalAmount: toFiniteNumber(revenue.deliveryTotalAmount),
      contractedAmount: toFiniteNumber(revenue.contractedAmount),
      paidAmount: toFiniteNumber(revenue.paidAmount),
      outstandingAmount: toFiniteNumber(revenue.outstandingAmount),
      expectedPipelineAmount: toFiniteNumber(revenue.expectedPipelineAmount),
      acceptedQuoteAmount: toFiniteNumber(revenue.acceptedQuoteAmount),
    },
    kpis: {
      partnerAccountCount: toFiniteNumber(kpis.partnerAccountCount),
      customerCount: toFiniteNumber(kpis.customerCount),
      activeDealCount: toFiniteNumber(kpis.activeDealCount),
      paymentRiskCount: toFiniteNumber(kpis.paymentRiskCount),
      quoteDocumentCount: toFiniteNumber(kpis.quoteDocumentCount),
      recentActivityCount: toFiniteNumber(kpis.recentActivityCount),
    },
    customerLogs: {
      latestActivityAt: toTextOrNull(customerLogs.latestActivityAt),
      recent: recentLogs,
    },
    snapshot: {
      source: "db_snapshot",
      refreshedAt: null,
      stale: false,
      maxAgeSeconds: BUSINESS_SNAPSHOT_MAX_AGE_SECONDS,
    },
    upcomingThisWeek: {
      count: upcomingItems.length,
      items: upcomingItems,
    },
    frequentCustomers,
  }
}

function isMissingSnapshotInfraError(error: { code?: string; message?: string }) {
  const code = error.code ?? ""
  // PGRST202: PostgREST schema cache에 함수 없음 / 42883·42P01: 함수·테이블 미생성
  if (code === "PGRST202" || code === "42883" || code === "42P01") return true
  const message = error.message ?? ""
  return message.includes(BUSINESS_SNAPSHOT_RPC) && /could not find|does not exist/i.test(message)
}

async function getBusinessOverview(
  sb: SupabaseAdminClient,
  options: { force?: boolean } = {}
): Promise<AdminCrmOverview["business"]> {
  let snapshotFailure: string | null = null

  try {
    const { data, error } = await sb.rpc(BUSINESS_SNAPSHOT_RPC, {
      p_max_age_seconds: BUSINESS_SNAPSHOT_MAX_AGE_SECONDS,
      p_force: options.force ?? false,
    })
    if (error) {
      snapshotFailure = isMissingSnapshotInfraError(error)
        ? BUSINESS_SNAPSHOT_MISSING_WARNING
        : formatLabeledSupabaseError(BUSINESS_SNAPSHOT_RPC, error)
    } else if (isRecord(data) && isRecord(data.payload)) {
      const business = mapBusinessSnapshotPayload(data.payload)
      business.snapshot = {
        source: "db_snapshot",
        refreshedAt: toTextOrNull(data.refreshedAt),
        stale: data.stale === true,
        maxAgeSeconds: BUSINESS_SNAPSHOT_MAX_AGE_SECONDS,
      }
      return business
    } else {
      snapshotFailure = `${BUSINESS_SNAPSHOT_RPC} returned an unexpected payload`
    }
  } catch (error) {
    snapshotFailure =
      error instanceof Error ? `${BUSINESS_SNAPSHOT_RPC}: ${error.message}` : `${BUSINESS_SNAPSHOT_RPC} call failed`
  }

  const business = await getBusinessOverviewLive(sb)
  business.snapshot = {
    source: "live_query",
    refreshedAt: new Date().toISOString(),
    stale: false,
    maxAgeSeconds: 0,
  }
  if (snapshotFailure) {
    business.warning = business.warning ? `${snapshotFailure} · ${business.warning}` : snapshotFailure
  }
  return business
}

async function getBusinessOverviewLive(sb: SupabaseAdminClient): Promise<AdminCrmOverview["business"]> {
  const now = Date.now()
  const recentActivitySince = new Date(now - RECENT_ACTIVITY_DAYS * 86_400_000).toISOString()
  const upcomingFrom = new Date(now).toISOString()
  const upcomingUntil = new Date(now + UPCOMING_EVENT_DAYS * 86_400_000).toISOString()
  const frequentSince = new Date(now - FREQUENT_CUSTOMER_DAYS * 86_400_000).toISOString()
  const [
    accountResult,
    customerResult,
    dealResult,
    quoteResult,
    contractResult,
    receiptResult,
    activityResult,
    recentActivityCountResult,
    quoteDocumentCountResult,
    quoteDocumentResult,
    contractDocumentResult,
    paymentResult,
    receiptV2Result,
    calendarEventResult,
    upcomingEventResult,
    frequentActivityResult,
  ] = await Promise.all([
    sb
      .from("partner_accounts")
      .select("id, name, owner_name, status, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(BUSINESS_QUERY_LIMIT),
    sb
      .from("customers")
      .select("id, partner_account_id, name, campus_name, region_label, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(BUSINESS_QUERY_LIMIT),
    sb
      .from("deals")
      .select(
        "id, partner_account_id, customer_id, deal_code, title, status, current_stage, expected_amount, contracted_amount, installed_amount, paid_amount, outstanding_amount, payment_status, closed_at, created_at, updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .limit(BUSINESS_QUERY_LIMIT),
    sb
      .from("quotes")
      .select("id, status, total_amount, accepted_at, sent_at, created_at, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(BUSINESS_QUERY_LIMIT),
    sb
      .from("contracts")
      .select("id, status, total_amount, partner_signed_at, admin_signed_at, created_at, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(BUSINESS_QUERY_LIMIT),
    sb
      .from("receipts")
      .select("id, total_amount, paid_at, created_at, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(BUSINESS_QUERY_LIMIT),
    sb
      .from("activity_logs")
      .select("id, partner_account_id, customer_id, deal_id, action_type, target_type, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_BUSINESS_LOG_LIMIT * 2),
    sb
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", recentActivitySince),
    sb
      .from("quote_documents")
      .select("id", { count: "exact", head: true }),
    sb
      .from("quote_documents")
      .select("id, deal_id, quote_number, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(RECENT_BUSINESS_LOG_LIMIT),
    sb
      .from("contract_documents")
      .select("id, deal_id, contract_number, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(RECENT_BUSINESS_LOG_LIMIT),
    sb
      .from("payments_v2")
      .select("id, partner_account_id, customer_id, deal_id, amount, paid_at, payment_method, memo, created_at, updated_at")
      .order("paid_at", { ascending: false })
      .limit(RECENT_BUSINESS_LOG_LIMIT),
    sb
      .from("receipts_v2")
      .select("id, partner_account_id, customer_id, deal_id, receipt_number, total_amount, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_BUSINESS_LOG_LIMIT),
    sb
      .from("calendar_events")
      .select("id, partner_account_id, customer_id, deal_id, source_type, title, status, starts_at, ends_at, created_at, updated_at")
      .order("starts_at", { ascending: false })
      .limit(RECENT_BUSINESS_LOG_LIMIT),
    sb
      .from("calendar_events")
      .select("id, partner_account_id, customer_id, deal_id, source_type, title, status, starts_at")
      .gte("starts_at", upcomingFrom)
      .lte("starts_at", upcomingUntil)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(RECENT_BUSINESS_LOG_LIMIT * 2),
    sb
      .from("activity_logs")
      .select("id, customer_id, deal_id, action_type, summary, created_at")
      .gte("created_at", frequentSince)
      .order("created_at", { ascending: false })
      .limit(FREQUENT_ACTIVITY_SCAN_LIMIT),
  ])

  const errors = [
    formatLabeledSupabaseError("partner_accounts", accountResult.error),
    formatLabeledSupabaseError("customers", customerResult.error),
    formatLabeledSupabaseError("deals", dealResult.error),
    formatLabeledSupabaseError("quotes", quoteResult.error),
    formatLabeledSupabaseError("contracts", contractResult.error),
    formatLabeledSupabaseError("receipts", receiptResult.error),
    formatLabeledSupabaseError("activity_logs", activityResult.error),
    formatLabeledSupabaseError("activity_logs recent count", recentActivityCountResult.error),
    formatLabeledSupabaseError("quote_documents count", quoteDocumentCountResult.error),
    formatLabeledSupabaseError("quote_documents", quoteDocumentResult.error),
    formatLabeledSupabaseError("contract_documents", contractDocumentResult.error),
    formatLabeledSupabaseError("payments_v2", paymentResult.error),
    formatLabeledSupabaseError("receipts_v2", receiptV2Result.error),
    formatLabeledSupabaseError("calendar_events", calendarEventResult.error),
    formatLabeledSupabaseError("calendar_events upcoming", upcomingEventResult.error),
    formatLabeledSupabaseError("activity_logs frequency", frequentActivityResult.error),
  ].filter((message): message is string => Boolean(message))

  const accounts = rowsOrEmpty(accountResult.data as BusinessPartnerAccountRow[] | null)
  const customers = rowsOrEmpty(customerResult.data as BusinessCustomerRow[] | null)
  const deals = rowsOrEmpty(dealResult.data as BusinessDealRow[] | null)
  const quotes = rowsOrEmpty(quoteResult.data as LegacyQuoteOverviewRow[] | null)
  const contracts = rowsOrEmpty(contractResult.data as LegacyContractOverviewRow[] | null)
  const receipts = rowsOrEmpty(receiptResult.data as LegacyReceiptOverviewRow[] | null)
  const activityLogs = rowsOrEmpty(activityResult.data as BusinessActivityLogRow[] | null)
  const quoteDocuments = rowsOrEmpty(quoteDocumentResult.data as BusinessQuoteDocumentRow[] | null)
  const contractDocuments = rowsOrEmpty(contractDocumentResult.data as BusinessContractDocumentRow[] | null)
  const payments = rowsOrEmpty(paymentResult.data as BusinessPaymentRow[] | null)
  const v2Receipts = rowsOrEmpty(receiptV2Result.data as BusinessReceiptRow[] | null)
  const calendarEvents = rowsOrEmpty(calendarEventResult.data as BusinessCalendarEventRow[] | null)
  const activeDeals = deals.filter((deal) => deal.status === "active")
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const customerById = new Map(customers.map((customer) => [customer.id, customer]))
  const dealById = new Map(deals.map((deal) => [deal.id, deal]))

  const contextInput = {
    accountNameById,
    customerById,
    dealById,
  }
  const recentLogs: AdminCrmCustomerLogItem[] = [
    ...activityLogs.map((log) => {
      const context = buildCustomerLogContext({
        ...contextInput,
        partnerAccountId: log.partner_account_id,
        customerId: log.customer_id,
        dealId: log.deal_id,
      })
      return {
        id: `activity:${log.id}`,
        kind: classifyCustomerLogKind(log.action_type, log.target_type, log.summary),
        title: log.summary,
        summary: log.action_type,
        status: log.target_type,
        amount: null,
        occurredAt: log.created_at,
        ...context,
        href: getCustomerLogHref(context.customerId, context.dealId),
      }
    }),
    ...quoteDocuments.map((document) => {
      const context = buildCustomerLogContext({
        ...contextInput,
        partnerAccountId: null,
        customerId: null,
        dealId: document.deal_id,
      })
      return {
        id: `quote:${document.id}`,
        kind: "quote" as const,
        title: `견적 ${document.quote_number}`,
        summary: context.dealTitle,
        status: document.status,
        amount: dealById.get(document.deal_id)?.expected_amount ?? null,
        occurredAt: document.updated_at ?? document.created_at,
        ...context,
        href: getCustomerLogHref(context.customerId, context.dealId),
      }
    }),
    ...contractDocuments.map((document) => {
      const context = buildCustomerLogContext({
        ...contextInput,
        partnerAccountId: null,
        customerId: null,
        dealId: document.deal_id,
      })
      return {
        id: `contract:${document.id}`,
        kind: "order" as const,
        title: `계약 ${document.contract_number}`,
        summary: context.dealTitle,
        status: document.status,
        amount: dealById.get(document.deal_id)?.contracted_amount ?? null,
        occurredAt: document.updated_at ?? document.created_at,
        ...context,
        href: getCustomerLogHref(context.customerId, context.dealId),
      }
    }),
    ...payments.map((payment) => {
      const context = buildCustomerLogContext({
        ...contextInput,
        partnerAccountId: payment.partner_account_id,
        customerId: payment.customer_id,
        dealId: payment.deal_id,
      })
      return {
        id: `payment:${payment.id}`,
        kind: "payment" as const,
        title: "수납",
        summary: payment.memo || payment.payment_method,
        status: payment.payment_method,
        amount: payment.amount,
        occurredAt: payment.paid_at,
        ...context,
        href: getCustomerLogHref(context.customerId, context.dealId),
      }
    }),
    ...v2Receipts.map((receipt) => {
      const context = buildCustomerLogContext({
        ...contextInput,
        partnerAccountId: receipt.partner_account_id,
        customerId: receipt.customer_id,
        dealId: receipt.deal_id,
      })
      return {
        id: `receipt:${receipt.id}`,
        kind: "payment" as const,
        title: `영수증 ${receipt.receipt_number}`,
        summary: context.dealTitle,
        status: "issued",
        amount: receipt.total_amount,
        occurredAt: receipt.updated_at ?? receipt.created_at,
        ...context,
        href: getCustomerLogHref(context.customerId, context.dealId),
      }
    }),
    ...calendarEvents.map((event) => {
      const context = buildCustomerLogContext({
        ...contextInput,
        partnerAccountId: event.partner_account_id,
        customerId: event.customer_id,
        dealId: event.deal_id,
      })
      return {
        id: `calendar:${event.id}`,
        kind: "visit" as const,
        title: event.title,
        summary: event.source_type,
        status: event.status,
        amount: null,
        occurredAt: event.starts_at,
        ...context,
        href: getCustomerLogHref(context.customerId, context.dealId),
      }
    }),
  ]
    .sort((left, right) => new Date(right.occurredAt ?? 0).getTime() - new Date(left.occurredAt ?? 0).getTime())
    .slice(0, RECENT_BUSINESS_LOG_LIMIT)

  const upcomingEventRows = rowsOrEmpty(
    upcomingEventResult.data as Array<{
      id: string
      partner_account_id: string | null
      customer_id: string | null
      deal_id: string | null
      source_type: string | null
      title: string | null
      status: string | null
      starts_at: string
    }> | null
  )
  const upcomingItems: AdminCrmUpcomingEventItem[] = upcomingEventRows.map((event) => {
    const context = buildCustomerLogContext({
      ...contextInput,
      partnerAccountId: event.partner_account_id,
      customerId: event.customer_id,
      dealId: event.deal_id,
    })
    const haystack = `${event.source_type ?? ""} ${event.title ?? ""}`.toLowerCase()
    const kind: AdminCrmUpcomingEventItem["kind"] = /install|설치|배송|delivery/.test(haystack) ? "install" : "visit"
    return {
      id: event.id,
      kind,
      title: event.title || "일정",
      customerName: context.customerName ?? context.partnerAccountName,
      startsAt: event.starts_at,
      href: getCustomerLogHref(context.customerId, context.dealId),
    }
  })

  const frequentActivityRows = rowsOrEmpty(
    frequentActivityResult.data as Array<{
      id: string
      customer_id: string | null
      deal_id: string | null
      action_type: string | null
      summary: string | null
      created_at: string | null
    }> | null
  )
  // Rows arrive newest-first, so the first sighting of a customer is their latest log.
  const frequentMap = new Map<string, AdminCrmFrequentCustomerItem>()
  for (const log of frequentActivityRows) {
    const deal = log.deal_id ? dealById.get(log.deal_id) : undefined
    const customerId = log.customer_id ?? deal?.customer_id ?? null
    if (!customerId) continue
    const existing = frequentMap.get(customerId)
    if (existing) {
      existing.contactCount += 1
      continue
    }
    frequentMap.set(customerId, {
      customerId,
      customerName: getCustomerLabel(customerById.get(customerId)) ?? "고객 미지정",
      contactCount: 1,
      latestSummary: log.summary || log.action_type || null,
      latestAt: log.created_at,
      href: getCustomerLogHref(customerId, log.deal_id ?? deal?.id ?? null),
    })
  }
  const frequentCustomers = Array.from(frequentMap.values())
    .sort(
      (a, b) =>
        b.contactCount - a.contactCount ||
        new Date(b.latestAt ?? 0).getTime() - new Date(a.latestAt ?? 0).getTime()
    )
    .slice(0, FREQUENT_CUSTOMER_LIMIT)

  const limitedSources: Array<{ label: string; count: number | null; loaded: number }> = [
    { label: "파트너 계정", count: accountResult.count, loaded: accounts.length },
    { label: "고객사", count: customerResult.count, loaded: customers.length },
    { label: "거래", count: dealResult.count, loaded: deals.length },
    { label: "레거시 견적", count: quoteResult.count, loaded: quotes.length },
    { label: "레거시 계약", count: contractResult.count, loaded: contracts.length },
    { label: "레거시 영수증", count: receiptResult.count, loaded: receipts.length },
  ]
  const limitedCounts = limitedSources
    .filter((source): source is { label: string; count: number; loaded: number } => typeof source.count === "number" && source.count > source.loaded)
    .map((source) => `${source.label} ${source.loaded.toLocaleString("ko-KR")} / ${source.count.toLocaleString("ko-KR")}건 로드`)

  return {
    ok: errors.length === 0,
    warning: limitedCounts.length > 0 ? `${limitedCounts.join(" · ")}. 전체 집계 pagination이 필요할 수 있습니다.` : null,
    error: errors.length > 0 ? errors.join("; ") : null,
    revenue: {
      deliveryTotalAmount: sumBy(deals, (deal) => deal.installed_amount),
      contractedAmount:
        sumBy(contracts.filter((contract) => contract.status !== "cancelled"), (contract) => contract.total_amount) +
        sumBy(deals, (deal) => deal.contracted_amount),
      paidAmount: sumBy(receipts, (receipt) => receipt.total_amount) + sumBy(deals, (deal) => deal.paid_amount),
      outstandingAmount:
        sumBy(deals, (deal) => deal.outstanding_amount) +
        Math.max(
          0,
          sumBy(contracts.filter((contract) => contract.status !== "cancelled"), (contract) => contract.total_amount) -
            sumBy(receipts, (receipt) => receipt.total_amount)
        ),
      expectedPipelineAmount: sumBy(activeDeals, (deal) => deal.expected_amount),
      acceptedQuoteAmount: sumBy(
        quotes.filter((quote) => quote.status === "accepted" || quote.status === "converted"),
        (quote) => quote.total_amount
      ),
    },
    kpis: {
      partnerAccountCount: accountResult.count ?? accounts.length,
      customerCount: customerResult.count ?? customers.length,
      activeDealCount: activeDeals.length,
      paymentRiskCount: deals.filter(
        (deal) => deal.status !== "cancelled" && (deal.outstanding_amount > 0 || deal.payment_status !== "paid")
      ).length,
      quoteDocumentCount: quoteDocumentCountResult.count ?? quoteDocuments.length,
      recentActivityCount: recentActivityCountResult.count ?? 0,
    },
    customerLogs: {
      latestActivityAt: maxDate(recentLogs.map((log) => log.occurredAt)),
      recent: recentLogs,
    },
    snapshot: {
      source: "live_query",
      refreshedAt: new Date().toISOString(),
      stale: false,
      maxAgeSeconds: 0,
    },
    upcomingThisWeek: {
      count: upcomingItems.length,
      items: upcomingItems,
    },
    frequentCustomers,
  }
}

type StatusCountRow = { status: string | null; cnt: number | string | null }

function statusCountMap(data: unknown): Map<string, number> | null {
  if (!Array.isArray(data)) return null
  const map = new Map<string, number>()
  for (const row of data as StatusCountRow[]) {
    if (!row || typeof row.status !== "string") continue
    map.set(row.status, Number(row.cnt) || 0)
  }
  return map
}

async function getSourceLinkCounts(sb: SupabaseAdminClient) {
  // 단일 GROUP BY RPC 우선. 미적용/실패 시 상태별 COUNT(1+N 쿼리)로 폴백한다.
  const grouped = await sb.rpc("admin_crm_source_link_status_counts")
  const byStatus = grouped.error ? null : statusCountMap(grouped.data)
  if (byStatus) {
    const statusCounts = Object.fromEntries(
      SOURCE_LINK_STATUSES.map((status) => [status, byStatus.get(status) ?? 0])
    ) as Record<(typeof SOURCE_LINK_STATUSES)[number], number>
    let total = 0
    for (const value of byStatus.values()) total += value
    return { ok: true, total, ...statusCounts, error: null }
  }

  const [totalResult, ...statusResults] = await Promise.all([
    sb.from("crm_source_links").select("id", { count: "exact", head: true }),
    ...SOURCE_LINK_STATUSES.map((status) =>
      sb.from("crm_source_links").select("id", { count: "exact", head: true }).eq("status", status)
    ),
  ])
  const statusCounts = Object.fromEntries(
    SOURCE_LINK_STATUSES.map((status, index) => [status, statusResults[index]?.count ?? 0])
  ) as Record<(typeof SOURCE_LINK_STATUSES)[number], number>
  const error = firstError([totalResult.error, ...statusResults.map((result) => result.error)])

  return {
    ok: !error,
    total: totalResult.count ?? 0,
    ...statusCounts,
    error: error ? formatLabeledSupabaseError("crm_source_links", error) : null,
  }
}

async function getWriteQueueCounts(sb: SupabaseAdminClient) {
  // 단일 GROUP BY RPC 우선. 미적용/실패 시 상태별 COUNT(N 쿼리)로 폴백한다.
  const grouped = await sb.rpc("admin_crm_write_request_status_counts")
  const byStatus = grouped.error ? null : statusCountMap(grouped.data)
  if (byStatus) {
    const statusCounts = Object.fromEntries(
      WRITE_REQUEST_STATUSES.map((status) => [status, byStatus.get(status) ?? 0])
    ) as Record<(typeof WRITE_REQUEST_STATUSES)[number], number>
    return { ok: true, ...statusCounts, error: null }
  }

  const statusResults = await Promise.all(
    WRITE_REQUEST_STATUSES.map((status) =>
      sb
        .from("crm_write_requests")
        .select("id", { count: "exact", head: true })
        .eq("source_system", "xiaoshouyi")
        .eq("status", status)
    )
  )
  const statusCounts = Object.fromEntries(
    WRITE_REQUEST_STATUSES.map((status, index) => [status, statusResults[index]?.count ?? 0])
  ) as Record<(typeof WRITE_REQUEST_STATUSES)[number], number>
  const error = firstError(statusResults.map((result) => result.error))

  return {
    ok: !error,
    ...statusCounts,
    error: error ? formatLabeledSupabaseError("crm_write_requests", error) : null,
  }
}

async function getExternalSnapshotOverview(sb: SupabaseAdminClient): Promise<AdminCrmOverview["externalSnapshots"]> {
  // P4: 개요는 객체별 합계·최댓값만 쓰므로 3×N 라운드트립을 4개 쿼리로 합친다(의미 동일).
  const objectKeys = [...EXTERNAL_CRM_OVERVIEW_OBJECTS]
  const [activeCountResult, staleCountResult, latestSyncedResult, latestRunResult] = await Promise.all([
    sb
      .from("external_crm_records")
      .select("id", { count: "exact", head: true })
      .eq("source_system", "xiaoshouyi")
      .in("object_api_key", objectKeys)
      .eq("is_stale", false),
    sb
      .from("external_crm_records")
      .select("id", { count: "exact", head: true })
      .eq("source_system", "xiaoshouyi")
      .in("object_api_key", objectKeys)
      .eq("is_stale", true),
    sb
      .from("external_crm_records")
      .select("synced_at")
      .eq("source_system", "xiaoshouyi")
      .in("object_api_key", objectKeys)
      .order("synced_at", { ascending: false })
      .limit(1),
    sb
      .from("external_crm_sync_runs")
      .select("status, object_api_key, finished_at, started_at, error")
      .eq("source_system", "xiaoshouyi")
      .order("started_at", { ascending: false })
      .limit(1),
  ])

  const latestRun = latestRunResult.error ? null : latestRunResult.data?.[0]
  const latestRunFailed = latestRun && typeof latestRun.status === "string" && latestRun.status === "failed"
  const latestRunError = latestRun && typeof latestRun.error === "string" && latestRun.error.trim()
    ? latestRun.error.trim()
    : null
  const firstCountError = firstError([
    activeCountResult.error,
    staleCountResult.error,
    latestSyncedResult.error,
    latestRunResult.error,
  ])
  const latestSyncedRow = latestSyncedResult.error ? null : latestSyncedResult.data?.[0]
  const latestSyncedAt = maxDate([
    latestRun && typeof latestRun.finished_at === "string" ? latestRun.finished_at : null,
    latestSyncedRow && typeof latestSyncedRow.synced_at === "string" ? latestSyncedRow.synced_at : null,
  ])

  return {
    ok: !firstCountError && !latestRunFailed,
    recordCount: activeCountResult.error ? 0 : activeCountResult.count ?? 0,
    staleCount: staleCountResult.error ? 0 : staleCountResult.count ?? 0,
    latestSyncedAt,
    latestRunStatus: latestRun && typeof latestRun.status === "string" ? latestRun.status : null,
    latestRunObject: latestRun && typeof latestRun.object_api_key === "string" ? latestRun.object_api_key : null,
    error:
      firstCountError || latestRunFailed
        ? [
            firstCountError ? formatLabeledSupabaseError("external_crm_records overview", firstCountError) : null,
            latestRunFailed ? `external_crm_sync_runs latest failed${latestRunError ? `: ${latestRunError}` : ""}` : null,
          ]
            .filter((message): message is string => Boolean(message))
            .join("; ")
        : null,
  }
}

function getOverallStatus(input: {
  schemaBlocked: number
  xiaoshouyiConfigured: boolean
  sourceLinksOk: boolean
  externalSnapshotsOk: boolean
  writeQueueOk: boolean
  businessOk: boolean
  sourceCandidates: number
  sourceStale: number
  snapshotStale: number
  failedWrites: number
}): AdminCrmOverviewStatus {
  if (
    input.schemaBlocked > 0 ||
    !input.sourceLinksOk ||
    !input.externalSnapshotsOk ||
    !input.writeQueueOk ||
    !input.businessOk
  ) {
    return "blocked"
  }
  if (
    !input.xiaoshouyiConfigured ||
    input.sourceCandidates > 0 ||
    input.sourceStale > 0 ||
    input.snapshotStale > 0 ||
    input.failedWrites > 0
  ) {
    return "warning"
  }
  return "ok"
}

async function getNeoCrmOverview(options: { force?: boolean } = {}): Promise<AdminCrmNeoCrmOverview> {
  const empty: AdminCrmNeoCrmOverview = {
    ok: false,
    error: null,
    latestSyncedAt: null,
    kpis: {
      accountCount: 0,
      activeAccountCountMonth: 0,
      salesAmountMonth: 0,
      salesCountMonth: 0,
      opportunityAmount: 0,
      opportunityCountMonth: 0,
      collectionAmountMonth: 0,
      collectionCountMonth: 0,
      collectionAmount30d: 0,
      collectionCount30d: 0,
    },
    recentOrders: [],
  }

  // CRM home reuses the same current-month Neo CRM report as NeoCrmTeamPanel
  // so summary KPI tiles and the full panel stay on the same source and period.
  try {
    const report = await getNeoCrmTeamReport({ granularity: "month", offset: 0, force: options.force })

    return {
      ok: report.ok,
      error: report.error,
      latestSyncedAt: report.latestSyncedAt,
      kpis: {
        accountCount: report.account.totalCount,
        activeAccountCountMonth: report.account.activeInPeriodCount,
        salesAmountMonth: report.revenue.teamTotal,
        salesCountMonth: report.revenue.orderCount,
        opportunityAmount: report.order.amount,
        opportunityCountMonth: report.order.count,
        collectionAmountMonth: report.collection.amount,
        collectionCountMonth: report.collection.count,
        collectionAmount30d: report.collection.amount30d,
        collectionCount30d: report.collection.count30d,
      },
      recentOrders: report.order.recent.map((order) => ({
        key: order.key,
        objectApiKey: "opportunity",
        customerName: order.customerName,
        ownerName: order.ownerName,
        status: order.status,
        amount: order.amount,
        occurredAt: order.occurredAt,
      })),
    }
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "Failed to load Neo CRM KPI summary",
    }
  }
}

export async function getAdminCrmOverview(options: { force?: boolean } = {}): Promise<AdminCrmOverview> {
  const sb = createSupabaseAdminClient()

  const [
    syncSchema,
    writeSchema,
    schemaContract,
    duplicatePreflight,
    syncPreflight,
    sourceLinkCounts,
    externalSnapshots,
    writeQueueCounts,
    business,
    neoCrm,
  ] =
    await Promise.all([
      getXiaoshouyiSyncSchemaReadiness(),
      getXiaoshouyiWriteSchemaReadiness(),
      getCrmSchemaContractReadiness(),
      getCrmDuplicatePreflightReport(),
      Promise.resolve(getXiaoshouyiSyncPreflight()),
      getSourceLinkCounts(sb),
      getExternalSnapshotOverview(sb),
      getWriteQueueCounts(sb),
      getBusinessOverview(sb, { force: options.force }),
      getNeoCrmOverview({ force: options.force }),
    ])

  const schemaChecks = [
    ...syncSchema.checks.map((check) => ({ ok: check.ok, label: check.label, action: check.action })),
    ...writeSchema.checks.map((check) => ({ ok: check.ok, label: check.label, action: check.action })),
    ...schemaContract.checks.map((check) => ({ ok: check.ok, label: check.label, action: check.action })),
    ...duplicatePreflight.checks.map((check) => ({
      ok: check.status !== "blocked",
      label: check.label,
      action: check.action,
    })),
  ]
  const schemaBlocked = schemaChecks.filter((check) => !check.ok)

  const sourceLinks = {
    ok: sourceLinkCounts.ok,
    total: sourceLinkCounts.total,
    confirmed: sourceLinkCounts.confirmed,
    candidate: sourceLinkCounts.candidate,
    rejected: sourceLinkCounts.rejected,
    stale: sourceLinkCounts.stale,
    error: sourceLinkCounts.error,
  }

  const writeQueue = {
    ok: writeQueueCounts.ok,
    active: writeQueueCounts.draft + writeQueueCounts.approved + writeQueueCounts.sent + writeQueueCounts.failed,
    draft: writeQueueCounts.draft,
    approved: writeQueueCounts.approved,
    sent: writeQueueCounts.sent,
    failed: writeQueueCounts.failed,
    succeeded: writeQueueCounts.succeeded,
    cancelled: writeQueueCounts.cancelled,
    error: writeQueueCounts.error,
  }

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: getOverallStatus({
      schemaBlocked: schemaBlocked.length,
      xiaoshouyiConfigured: syncPreflight.configured,
      sourceLinksOk: sourceLinks.ok,
      externalSnapshotsOk: externalSnapshots.ok,
      writeQueueOk: writeQueue.ok,
      businessOk: business.ok,
      sourceCandidates: sourceLinks.candidate,
      sourceStale: sourceLinks.stale,
      snapshotStale: externalSnapshots.staleCount,
      failedWrites: writeQueue.failed,
    }),
    business,
    schema: {
      ok: schemaChecks.length - schemaBlocked.length,
      blocked: schemaBlocked.length,
      firstBlocked: schemaBlocked[0]?.label ?? null,
      firstAction: schemaBlocked[0]?.action ?? null,
    },
    xiaoshouyi: {
      configured: syncPreflight.configured,
      authMode: syncPreflight.authMode,
      missingEnvGroups: syncPreflight.missingEnvGroups,
      objectCount: syncPreflight.objects.length,
      pageSize: syncPreflight.pageSize,
      maxPages: syncPreflight.maxPages,
    },
    sourceLinks,
    externalSnapshots,
    writeQueue,
    neoCrm,
  }
}
