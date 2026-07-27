import "server-only"

import { promises as fs } from "fs"
import path from "path"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

import type {
  PartnerActivityLog,
  PartnerActivityLogInput,
  PartnerContactInput,
  PartnerDataSource,
  PartnerAutomation,
  PartnerChecklistInput,
  PartnerContact,
  PartnerDeal,
  PartnerDealInput,
  PartnerDocument,
  PartnerDocumentDeliverySummary,
  PartnerDocumentInput,
  PartnerIssueInput,
  PartnerOpsChecklistItem,
  PartnerOpsIssue,
  PartnerQuoteDetails,
  PartnerQuoteLineItem,
  PartnerQueueSummary,
  PartnerSalesInput,
  PartnerSalesRecord,
  PartnerScheduleInput,
  PartnerScheduleItem,
  PartnerSummary,
  PartnerSummaryInput,
  PartnerWorkspaceShell,
  PartnerWorkspace,
} from "./partners-types"

const LOCAL_FILE = path.join(process.cwd(), "data", "partners-workspaces.json")
const BUSINESS_TIME_ZONE = "Asia/Seoul"
// Asia/Seoul 고정 오프셋(DST 없음) — 오프셋 없는 입력을 timestamptz 에 넣을 때 명시한다.
const BUSINESS_UTC_OFFSET = "+09:00"
// 'Z' 또는 '±hh(:)mm' 로 끝나는, 이미 절대 시각인 값 판별용
const EXPLICIT_OFFSET_REGEX = /(?:Z|[+-]\d{2}:?\d{2})$/i
const PARTNER_STATUSES = ["lead", "active", "paused", "churn_risk"] as const
const PARTNER_CHANNELS = ["reseller", "referral", "branch", "direct"] as const
const DEAL_STAGES = ["discovery", "quoted", "contract_sent", "active", "closed_won", "closed_lost"] as const
const DOCUMENT_KINDS = ["quote", "contract", "receipt"] as const
const DOCUMENT_STATUSES = ["draft", "sent", "signed", "paid", "overdue", "archived"] as const
const DOCUMENT_DELIVERY_CHANNELS = ["pdf", "kakao", "link"] as const
const DOCUMENT_DELIVERY_STATUSES = ["draft", "ready", "sent", "opened", "expired", "revoked", "failed"] as const
const QUOTE_WORKFLOW_STATUSES = [
  "draft",
  "ready",
  "sent",
  "viewed",
  "revised",
  "accepted",
  "rejected",
  "expired",
  "converted",
  "archived",
] as const
const QUOTE_LINE_ITEM_TYPES = ["hardware", "installation", "shipping", "service", "discount", "note_only"] as const
const QUOTE_LINE_ITEM_STATUSES = ["priced", "pending_price", "separate_billing", "informational"] as const
const QUOTE_BILLING_MODES = ["included_in_quote", "separate_invoice", "tbd"] as const
const SCHEDULE_KINDS = ["meeting", "follow_up", "deadline", "renewal"] as const
const SCHEDULE_STATUSES = ["planned", "completed", "canceled"] as const
const AUTOMATION_STATUSES = ["active", "paused"] as const
const TODO_STATUSES = ["open", "waiting_partner", "waiting_internal", "blocked", "done", "canceled"] as const
const INSTALL_STATUSES = ["planned", "ordered", "delivered", "installed", "verified", "issue"] as const
const ISSUE_STATUSES = ["open", "waiting", "blocked", "resolved"] as const
const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const
const ACTIVITY_LOG_STATUSES = [
  "recorded",
  "follow_up_needed",
  "waiting_partner",
  "waiting_internal",
  "blocked",
  "resolved",
  "canceled",
] as const

interface PartnerListResult {
  workspaces: PartnerWorkspace[]
  source: PartnerDataSource
  warning?: string
}

interface PartnerSummaryListResult {
  summaries: PartnerQueueSummary[]
  source: PartnerDataSource
  warning?: string
}

interface PartnerDetailResult {
  workspace: PartnerWorkspace | null
  source: PartnerDataSource
  warning?: string
}

interface PartnerShellResult {
  shell: PartnerWorkspaceShell | null
  source: PartnerDataSource
  warning?: string
}

interface PartnerMutationResult {
  workspace: PartnerWorkspace | null
  source: PartnerDataSource
  warning?: string
}

interface PartnerRow {
  id: string
  name: string
  status: PartnerSummary["status"]
  channel: PartnerSummary["channel"]
  region: string | null
  owner_name: string | null
  owner_email: string | null
  account_manager_name: string | null
  tags: string[] | null
  notes: string | null
}

interface PartnerContactRow {
  id: string
  partner_id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  is_primary: boolean | null
}

interface PartnerDealRow {
  id: string
  partner_id: string
  title: string
  stage: PartnerDeal["stage"]
  quote_amount: number | string | null
  expected_close_at: string | null
  contract_start_at: string | null
  contract_end_at: string | null
  sales_units: number | null
  owner_name: string | null
}

interface PartnerDocumentRow {
  id: string
  partner_id: string
  deal_id: string | null
  kind: PartnerDocument["kind"]
  status: PartnerDocument["status"]
  title: string
  document_number: string | null
  source_file_name: string | null
  amount: number | string | null
  issued_at: string | null
  due_at: string | null
  file_path: string | null
  external_url: string | null
  metadata: Record<string, unknown> | null
}

interface PartnerDocumentDeliveryRow {
  id: string
  partner_document_id: string
  partner_id: string
  delivery_channel: PartnerDocumentDeliverySummary["deliveryChannel"]
  status: PartnerDocumentDeliverySummary["status"]
  recipient_name: string | null
  recipient_email: string | null
  recipient_phone: string | null
  expires_at: string | null
  password_enabled: boolean | null
  allow_download: boolean | null
  allow_print: boolean | null
  sent_at: string | null
  last_viewed_at: string | null
  view_count: number | null
}

interface PartnerScheduleRow {
  id: string
  partner_id: string
  deal_id: string | null
  kind: PartnerScheduleItem["kind"]
  status: PartnerScheduleItem["status"]
  title: string
  starts_at: string
  ends_at: string | null
  owner_name: string | null
}

interface PartnerSalesRow {
  id: string
  partner_id: string
  deal_id: string | null
  sales_month: string
  units_sold: number | null
  gross_amount: number | string | null
  net_amount: number | string | null
}

interface PartnerAutomationRow {
  id: string
  partner_id: string
  deal_id: string | null
  name: string
  status: PartnerAutomation["status"]
  trigger_type: string
  action_type: string
  destination: string | null
  last_run_at: string | null
  next_run_at: string | null
}

interface PartnerChecklistRow {
  id: string
  partner_id: string
  deal_id: string | null
  parent_item_id: string | null
  checklist_group: string
  title: string
  item_category: string | null
  item_code: string | null
  item_name: string | null
  planned_quantity: number | null
  confirmed_quantity: number | null
  todo_status: PartnerOpsChecklistItem["todoStatus"]
  install_status: PartnerOpsChecklistItem["installStatus"]
  owner_name: string | null
  due_at: string | null
  completed_at: string | null
  notes: string | null
}

interface PartnerIssueRow {
  id: string
  partner_id: string
  deal_id: string | null
  related_document_id: string | null
  related_checklist_item_id: string | null
  title: string
  category: string
  severity: PartnerOpsIssue["severity"]
  status: PartnerOpsIssue["status"]
  facts: string | null
  unresolved_points: string | null
  current_assumption: string | null
  verify_with: string | null
  owner_name: string | null
  next_check_at: string | null
  due_at: string | null
  resolved_at: string | null
  resolution_summary: string | null
}

interface PartnerActivityLogRow {
  id: string
  partner_id: string
  deal_id: string | null
  document_id: string | null
  schedule_item_id: string | null
  checklist_item_id: string | null
  issue_id: string | null
  subject_type: string
  subject_id: string | null
  log_category: string
  status: PartnerActivityLog["status"]
  actor_name: string | null
  action: string
  summary: string
  details: string | null
  next_action: string | null
  due_at: string | null
  occurred_at: string
}

function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

function hasSupabaseServiceEnv() {
  return Boolean(readEnv("SUPABASE_SECRET_KEY") ?? readEnv("SUPABASE_SERVICE_ROLE_KEY"))
}

export function hasPartnersSupabaseConfig() {
  return hasSupabaseBrowserEnv() && hasSupabaseServiceEnv()
}

function isEnumValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T)
}

function toOptionalString(value: unknown) {
  if (value == null) return undefined
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function toString(value: unknown) {
  return toOptionalString(value) ?? ""
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => toString(item)).filter(Boolean)
}

function toObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

function formatBusinessDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00"

  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`
}

function formatDateTime(value: string | null | undefined) {
  const text = toOptionalString(value)
  if (!text) return undefined

  const normalized = text.replace(" ", "T")
  // timestamptz 왕복값(오프셋 포함, 예: '2026-07-27T05:00:00+00:00')은 KST 벽시계로 환산
  if (EXPLICIT_OFFSET_REGEX.test(normalized)) {
    const parsed = new Date(normalized)
    if (!Number.isNaN(parsed.getTime())) return formatBusinessDateTime(parsed)
  }

  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (match) return `${match[1]} ${match[2]}`

  return text
}

function formatDate(value: string | null | undefined) {
  const text = toOptionalString(value)
  if (!text) return undefined

  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? text
}

function normalizeQuoteLineItem(value: unknown, index: number): PartnerQuoteLineItem {
  const item = toObject(value)

  return {
    id: toString(item?.id) || makeId("quote_item"),
    documentId: toOptionalString(item?.documentId),
    sortOrder: item?.sortOrder == null ? index + 1 : Math.max(1, toNumber(item.sortOrder)),
    lineNumber: item?.lineNumber == null ? index + 1 : Math.max(1, toNumber(item.lineNumber)),
    itemType: isEnumValue(QUOTE_LINE_ITEM_TYPES, item?.itemType) ? item.itemType : "hardware",
    itemCode: toOptionalString(item?.itemCode),
    itemName: toString(item?.itemName) || "새 견적 품목",
    itemDescription: toOptionalString(item?.itemDescription),
    unitPrice: item?.unitPrice == null ? undefined : toNumber(item.unitPrice),
    quantity: item?.quantity == null ? undefined : toNumber(item.quantity),
    quantityUnit: toOptionalString(item?.quantityUnit),
    lineSupplyAmount: item?.lineSupplyAmount == null ? undefined : toNumber(item.lineSupplyAmount),
    vatIncluded: item?.vatIncluded == null ? true : Boolean(item.vatIncluded),
    lineStatus: isEnumValue(QUOTE_LINE_ITEM_STATUSES, item?.lineStatus) ? item.lineStatus : undefined,
    billingMode: isEnumValue(QUOTE_BILLING_MODES, item?.billingMode) ? item.billingMode : undefined,
    remark: toOptionalString(item?.remark),
    linkedQuantityRowId: toOptionalString(item?.linkedQuantityRowId),
    linkedChecklistTemplateId: toOptionalString(item?.linkedChecklistTemplateId),
  }
}

function normalizeQuoteDetails(
  value: unknown,
  defaults?: { issuedAt?: string; validUntil?: string; grandTotalAmount?: number }
): PartnerQuoteDetails | undefined {
  const quote = toObject(value)
  if (!quote) return undefined

  const lineItems = Array.isArray(quote.lineItems) ? quote.lineItems.map((item, index) => normalizeQuoteLineItem(item, index)) : []

  return {
    templateId: toOptionalString(quote.templateId),
    estimateNumber: toOptionalString(quote.estimateNumber),
    workflowStatus: isEnumValue(QUOTE_WORKFLOW_STATUSES, quote.workflowStatus) ? quote.workflowStatus : undefined,
    issuedAt: formatDate(toOptionalString(quote.issuedAt) ?? defaults?.issuedAt),
    validUntil: formatDate(toOptionalString(quote.validUntil) ?? defaults?.validUntil),
    subjectText: toOptionalString(quote.subjectText),
    recipientCompanyName: toOptionalString(quote.recipientCompanyName),
    recipientContactName: toOptionalString(quote.recipientContactName),
    recipientPhone: toOptionalString(quote.recipientPhone),
    recipientEmail: toOptionalString(quote.recipientEmail),
    referenceName: toOptionalString(quote.referenceName),
    supplierBusinessName: toOptionalString(quote.supplierBusinessName),
    supplierBusinessRegistrationNumber: toOptionalString(quote.supplierBusinessRegistrationNumber),
    supplierRepresentativeName: toOptionalString(quote.supplierRepresentativeName),
    supplierAddress: toOptionalString(quote.supplierAddress),
    supplierContactName: toOptionalString(quote.supplierContactName),
    supplierContactPhone: toOptionalString(quote.supplierContactPhone),
    supplierContactEmail: toOptionalString(quote.supplierContactEmail),
    currencyUnitLabel: toOptionalString(quote.currencyUnitLabel),
    vatIncluded: toOptionalBoolean(quote.vatIncluded),
    vatPolicyLabel: toOptionalString(quote.vatPolicyLabel),
    deliveryLocationNote: toOptionalString(quote.deliveryLocationNote),
    paymentTerms: toOptionalString(quote.paymentTerms),
    installationPolicy: toOptionalString(quote.installationPolicy),
    warrantyNote: toOptionalString(quote.warrantyNote),
    generalNotes: toOptionalString(quote.generalNotes),
    specialTerms: toOptionalString(quote.specialTerms),
    footerContactText: toOptionalString(quote.footerContactText),
    internalMemo: toOptionalString(quote.internalMemo),
    subtotalAmount: quote.subtotalAmount == null ? undefined : toNumber(quote.subtotalAmount),
    vatAmount: quote.vatAmount == null ? undefined : toNumber(quote.vatAmount),
    discountAmount: quote.discountAmount == null ? undefined : toNumber(quote.discountAmount),
    grandTotalAmount:
      quote.grandTotalAmount == null
        ? defaults?.grandTotalAmount
        : toNumber(quote.grandTotalAmount),
    hasPendingAmounts: toOptionalBoolean(quote.hasPendingAmounts),
    pendingAmountNote: toOptionalString(quote.pendingAmountNote),
    lineItems,
  }
}

function toStorageDateTime(value?: string) {
  const text = toOptionalString(value)
  if (!text) return undefined

  const normalized = text.replace(" ", "T")
  // 이미 오프셋을 가진 절대 시각은 그대로 저장(이중 보정 방지)
  if (EXPLICIT_OFFSET_REGEX.test(normalized)) return normalized

  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  // 오프셋 없는 datetime-local 입력은 KST 벽시계 — 명시하지 않으면 timestamptz 가 UTC 로 해석해 9시간 스큐
  if (match) return `${match[1]}T${match[2]}${BUSINESS_UTC_OFFSET}`

  return normalized
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function makePartnerCode(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  return `${base || "partner"}-${Date.now().toString().slice(-6)}`
}

const MAIN_DEAL_STAGE_PRIORITY: Record<PartnerDeal["stage"], number> = {
  active: 0,
  contract_sent: 1,
  quoted: 2,
  discovery: 3,
  closed_won: 4,
  closed_lost: 5,
}

function asArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

function sortSchedule(items: PartnerScheduleItem[]) {
  return [...items].sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || ""))
}

function getBusinessDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value ?? "0000"
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  const day = parts.find((part) => part.type === "day")?.value ?? "01"

  return {
    date: `${year}-${month}-${day}`,
    month: `${year}-${month}`,
  }
}

function getMainDeal(deals: PartnerDeal[]) {
  return [...deals].sort((left, right) => {
    const priorityDelta = MAIN_DEAL_STAGE_PRIORITY[left.stage] - MAIN_DEAL_STAGE_PRIORITY[right.stage]
    if (priorityDelta !== 0) return priorityDelta

    return (right.expectedCloseAt ?? right.contractStartAt ?? right.title).localeCompare(
      left.expectedCloseAt ?? left.contractStartAt ?? left.title,
      "ko"
    )
  })[0]
}

function normalizePartner(partner: Partial<PartnerSummary> | null | undefined): PartnerSummary {
  return {
    id: toString(partner?.id) || makeId("partner"),
    name: toString(partner?.name) || "이름 없는 파트너",
    status: isEnumValue(PARTNER_STATUSES, partner?.status) ? partner.status : "lead",
    channel: isEnumValue(PARTNER_CHANNELS, partner?.channel) ? partner.channel : "direct",
    region: toOptionalString(partner?.region) ?? "미지정",
    ownerName: toOptionalString(partner?.ownerName) ?? "미지정",
    ownerEmail: toOptionalString(partner?.ownerEmail) ?? "미지정",
    accountManager: toOptionalString(partner?.accountManager) ?? "미지정",
    nextActionAt: formatDateTime(partner?.nextActionAt),
    tags: toStringArray(partner?.tags),
    notes: toOptionalString(partner?.notes),
  }
}

function normalizeDeal(partnerId: string, deal: Partial<PartnerDeal> | null | undefined): PartnerDeal {
  return {
    id: toString(deal?.id) || makeId("deal"),
    partnerId: toString(deal?.partnerId) || partnerId,
    title: toString(deal?.title) || "새 거래",
    stage: isEnumValue(DEAL_STAGES, deal?.stage) ? deal.stage : "discovery",
    quoteAmount: toNumber(deal?.quoteAmount),
    expectedCloseAt: formatDate(deal?.expectedCloseAt),
    contractStartAt: formatDate(deal?.contractStartAt),
    contractEndAt: formatDate(deal?.contractEndAt),
    salesUnits: toNumber(deal?.salesUnits),
    manager: toOptionalString(deal?.manager) ?? "미지정",
  }
}

function normalizeDocument(
  partnerId: string,
  document: (Omit<Partial<PartnerDocument>, "quoteDetails"> & { quoteDetails?: unknown }) | null | undefined
): PartnerDocument {
  const documentId = toString(document?.id) || makeId("doc")
  const issuedAt = formatDate(document?.issuedAt)
  const dueAt = formatDate(document?.dueAt)
  const amount = document?.amount == null ? undefined : toNumber(document.amount)
  const quoteDetails = normalizeQuoteDetails(document?.quoteDetails, {
    issuedAt,
    validUntil: dueAt,
    grandTotalAmount: amount,
  })

  return {
    id: documentId,
    partnerId: toString(document?.partnerId) || partnerId,
    dealId: toOptionalString(document?.dealId),
    kind: isEnumValue(DOCUMENT_KINDS, document?.kind) ? document.kind : "quote",
    status: isEnumValue(DOCUMENT_STATUSES, document?.status) ? document.status : "draft",
    title: toString(document?.title) || "새 문서",
    amount: amount ?? quoteDetails?.grandTotalAmount,
    issuedAt: issuedAt ?? quoteDetails?.issuedAt,
    dueAt: dueAt ?? quoteDetails?.validUntil,
    fileLabel: toOptionalString(document?.fileLabel) ?? "첨부 문서",
    externalUrl: toOptionalString(document?.externalUrl),
    lineItemCount: document?.lineItemCount ?? quoteDetails?.lineItems.length,
    quoteDetails,
    deliveries: Array.isArray(document?.deliveries)
      ? document.deliveries.map((delivery) => normalizeDocumentDelivery(documentId, delivery))
      : [],
  }
}

function normalizeDocumentDelivery(
  partnerDocumentId: string,
  delivery: Partial<PartnerDocumentDeliverySummary> | null | undefined
): PartnerDocumentDeliverySummary {
  return {
    id: toString(delivery?.id) || makeId("delivery"),
    partnerDocumentId: toString(delivery?.partnerDocumentId) || partnerDocumentId,
    deliveryChannel: isEnumValue(DOCUMENT_DELIVERY_CHANNELS, delivery?.deliveryChannel) ? delivery.deliveryChannel : "link",
    status: isEnumValue(DOCUMENT_DELIVERY_STATUSES, delivery?.status) ? delivery.status : "draft",
    recipientName: toOptionalString(delivery?.recipientName),
    recipientEmail: toOptionalString(delivery?.recipientEmail),
    recipientPhone: toOptionalString(delivery?.recipientPhone),
    expiresAt: formatDateTime(delivery?.expiresAt),
    passwordEnabled: Boolean(delivery?.passwordEnabled),
    allowDownload: delivery?.allowDownload !== false,
    allowPrint: delivery?.allowPrint !== false,
    sentAt: formatDateTime(delivery?.sentAt),
    lastViewedAt: formatDateTime(delivery?.lastViewedAt),
    viewCount: delivery?.viewCount == null ? 0 : toNumber(delivery.viewCount),
  }
}

function normalizeScheduleItem(partnerId: string, item: Partial<PartnerScheduleItem> | null | undefined): PartnerScheduleItem {
  return {
    id: toString(item?.id) || makeId("schedule"),
    partnerId: toString(item?.partnerId) || partnerId,
    dealId: toOptionalString(item?.dealId),
    kind: isEnumValue(SCHEDULE_KINDS, item?.kind) ? item.kind : "meeting",
    status: isEnumValue(SCHEDULE_STATUSES, item?.status) ? item.status : "planned",
    title: toString(item?.title) || "새 일정",
    startsAt: formatDateTime(item?.startsAt) ?? "",
    endsAt: formatDateTime(item?.endsAt),
    owner: toOptionalString(item?.owner) ?? "미지정",
  }
}

function normalizeSalesRecord(partnerId: string, record: Partial<PartnerSalesRecord> | null | undefined): PartnerSalesRecord {
  return {
    id: toString(record?.id) || makeId("sales"),
    partnerId: toString(record?.partnerId) || partnerId,
    dealId: toOptionalString(record?.dealId),
    salesMonth: formatDate(record?.salesMonth) ?? "",
    unitsSold: toNumber(record?.unitsSold),
    grossAmount: toNumber(record?.grossAmount),
    netAmount: toNumber(record?.netAmount),
  }
}

function normalizeAutomation(partnerId: string, automation: Partial<PartnerAutomation> | null | undefined): PartnerAutomation {
  return {
    id: toString(automation?.id) || makeId("automation"),
    partnerId: toString(automation?.partnerId) || partnerId,
    name: toString(automation?.name) || "새 자동화",
    status: isEnumValue(AUTOMATION_STATUSES, automation?.status) ? automation.status : "active",
    trigger: toString(automation?.trigger) || "manual",
    action: toString(automation?.action) || "notify",
    destination: toOptionalString(automation?.destination) ?? "미지정",
    lastRunAt: formatDateTime(automation?.lastRunAt),
    nextRunAt: formatDateTime(automation?.nextRunAt),
  }
}

function normalizeContact(partnerId: string, contact: Partial<PartnerContact> | null | undefined): PartnerContact {
  return {
    id: toString(contact?.id) || makeId("contact"),
    partnerId: toString(contact?.partnerId) || partnerId,
    name: toString(contact?.name) || "미지정 연락처",
    role: toOptionalString(contact?.role),
    email: toOptionalString(contact?.email),
    phone: toOptionalString(contact?.phone),
    isPrimary: Boolean(contact?.isPrimary),
  }
}

function syncPartnerSummaryFromPrimaryContact(workspace: PartnerWorkspace) {
  const primaryContact = workspace.contacts.find((contact) => contact.isPrimary) ?? workspace.contacts[0]
  if (!primaryContact) return

  workspace.partner.ownerName = primaryContact.name
  workspace.partner.ownerEmail = primaryContact.email ?? ""
}

function syncPrimaryContactFromPartnerSummary(workspace: PartnerWorkspace) {
  const primaryContact = workspace.contacts.find((contact) => contact.isPrimary)

  if (primaryContact) {
    primaryContact.name = workspace.partner.ownerName
    primaryContact.email = workspace.partner.ownerEmail || undefined
    return
  }

  workspace.contacts.unshift({
    id: makeId("contact"),
    partnerId: workspace.partner.id,
    name: workspace.partner.ownerName,
    role: undefined,
    email: workspace.partner.ownerEmail || undefined,
    phone: undefined,
    isPrimary: true,
  })
}

function normalizeChecklist(partnerId: string, item: Partial<PartnerOpsChecklistItem> | null | undefined): PartnerOpsChecklistItem {
  return {
    id: toString(item?.id) || makeId("checklist"),
    partnerId: toString(item?.partnerId) || partnerId,
    dealId: toOptionalString(item?.dealId),
    parentItemId: toOptionalString(item?.parentItemId),
    checklistGroup: toString(item?.checklistGroup) || "기본",
    title: toString(item?.title) || "새 체크리스트",
    itemCategory: toOptionalString(item?.itemCategory),
    itemCode: toOptionalString(item?.itemCode),
    itemName: toOptionalString(item?.itemName),
    plannedQuantity: item?.plannedQuantity == null ? undefined : toNumber(item.plannedQuantity),
    confirmedQuantity: item?.confirmedQuantity == null ? undefined : toNumber(item.confirmedQuantity),
    todoStatus: isEnumValue(TODO_STATUSES, item?.todoStatus) ? item.todoStatus : "open",
    installStatus: isEnumValue(INSTALL_STATUSES, item?.installStatus) ? item.installStatus : "planned",
    owner: toOptionalString(item?.owner) ?? "미지정",
    dueAt: formatDateTime(item?.dueAt),
    completedAt: formatDateTime(item?.completedAt),
    notes: toOptionalString(item?.notes),
  }
}

function normalizeIssue(partnerId: string, issue: Partial<PartnerOpsIssue> | null | undefined): PartnerOpsIssue {
  return {
    id: toString(issue?.id) || makeId("issue"),
    partnerId: toString(issue?.partnerId) || partnerId,
    dealId: toOptionalString(issue?.dealId),
    relatedDocumentId: toOptionalString(issue?.relatedDocumentId),
    relatedChecklistItemId: toOptionalString(issue?.relatedChecklistItemId),
    title: toString(issue?.title) || "새 이슈",
    category: toString(issue?.category) || "general",
    severity: isEnumValue(ISSUE_SEVERITIES, issue?.severity) ? issue.severity : "medium",
    status: isEnumValue(ISSUE_STATUSES, issue?.status) ? issue.status : "open",
    facts: toOptionalString(issue?.facts),
    unresolvedPoints: toOptionalString(issue?.unresolvedPoints),
    currentAssumption: toOptionalString(issue?.currentAssumption),
    verifyWith: toOptionalString(issue?.verifyWith),
    owner: toOptionalString(issue?.owner) ?? "미지정",
    nextCheckAt: formatDateTime(issue?.nextCheckAt),
    dueAt: formatDateTime(issue?.dueAt),
    resolvedAt: formatDateTime(issue?.resolvedAt),
    resolutionSummary: toOptionalString(issue?.resolutionSummary),
  }
}

function normalizeActivityLog(partnerId: string, log: Partial<PartnerActivityLog> | null | undefined): PartnerActivityLog {
  return {
    id: toString(log?.id) || makeId("activity"),
    partnerId: toString(log?.partnerId) || partnerId,
    dealId: toOptionalString(log?.dealId),
    documentId: toOptionalString(log?.documentId),
    scheduleItemId: toOptionalString(log?.scheduleItemId),
    checklistItemId: toOptionalString(log?.checklistItemId),
    issueId: toOptionalString(log?.issueId),
    subjectType: toString(log?.subjectType) || "partner",
    subjectId: toOptionalString(log?.subjectId),
    logCategory: toString(log?.logCategory) || "operations_internal",
    status: isEnumValue(ACTIVITY_LOG_STATUSES, log?.status) ? log.status : "recorded",
    actor: toOptionalString(log?.actor) ?? "미지정",
    action: toString(log?.action) || "recorded",
    summary: toString(log?.summary) || "활동 기록",
    details: toOptionalString(log?.details),
    nextAction: toOptionalString(log?.nextAction),
    dueAt: formatDateTime(log?.dueAt),
    occurredAt: formatDateTime(log?.occurredAt) ?? formatDateTime(new Date().toISOString()) ?? "",
  }
}

function normalizeWorkspace(workspace: PartnerWorkspace | Partial<PartnerWorkspace> | null | undefined): PartnerWorkspace {
  const partner = normalizePartner(workspace?.partner)
  const contacts = asArray(workspace?.contacts).map((contact) => normalizeContact(partner.id, contact))
  const deals = asArray(workspace?.deals).map((deal) => normalizeDeal(partner.id, deal))
  const documents = asArray(workspace?.documents).map((document) => normalizeDocument(partner.id, document))
  const schedule = sortSchedule(asArray(workspace?.schedule).map((item) => normalizeScheduleItem(partner.id, item)))
  const sales = asArray(workspace?.sales).map((record) => normalizeSalesRecord(partner.id, record))
  const automations = asArray(workspace?.automations).map((automation) => normalizeAutomation(partner.id, automation))
  const checklists = asArray(workspace?.checklists).map((item) => normalizeChecklist(partner.id, item))
  const issues = asArray(workspace?.issues).map((issue) => normalizeIssue(partner.id, issue))
  const activityLogs = asArray(workspace?.activityLogs).map((log) => normalizeActivityLog(partner.id, log))
  const nextActionAt = partner.nextActionAt ?? schedule.find((item) => item.status === "planned")?.startsAt

  return {
    partner: {
      ...partner,
      nextActionAt,
    },
    contacts,
    deals,
    documents,
    schedule,
    sales,
    automations,
    checklists,
    issues,
    activityLogs,
  }
}

function groupByPartner<T extends { partnerId: string }>(items: T[]) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    if (!acc[item.partnerId]) acc[item.partnerId] = []
    acc[item.partnerId].push(item)
    return acc
  }, {})
}

async function ensureLocalWorkspaceFile() {
  try {
    await fs.access(LOCAL_FILE)
  } catch {
    await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
    await fs.writeFile(LOCAL_FILE, JSON.stringify([], null, 2), "utf-8")
  }
}

async function readLocalWorkspaces() {
  await ensureLocalWorkspaceFile()
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    const workspaces = Array.isArray(parsed) ? parsed : []
    return workspaces.map((workspace) => normalizeWorkspace(workspace as Partial<PartnerWorkspace>))
  } catch {
    return []
  }
}

async function writeLocalWorkspaces(workspaces: PartnerWorkspace[]) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
  // 임시 파일 + rename으로 원자적 교체 — 동시 쓰기 시 반쯤 쓰인 JSON 방지
  const tmpPath = `${LOCAL_FILE}.${process.pid}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify(workspaces.map(normalizeWorkspace), null, 2), "utf-8")
  await fs.rename(tmpPath, LOCAL_FILE)
}

async function querySupabasePartnerWorkspaces(partnerId?: string) {
  const supabase = createSupabaseAdminClient()

  const partnersQuery = supabase
    .from("partners")
    .select("id, name, status, channel, region, owner_name, owner_email, account_manager_name, tags, notes")
    .is("archived_at", null)
    .order("name", { ascending: true })

  const filteredPartnersQuery = partnerId ? partnersQuery.eq("id", partnerId) : partnersQuery
  const contactsQuery = supabase
    .from("partner_contacts")
    .select("id, partner_id, name, role, email, phone, is_primary")
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true })
  const dealsQuery = supabase
    .from("partner_deals")
    .select("id, partner_id, title, stage, quote_amount, expected_close_at, contract_start_at, contract_end_at, sales_units, owner_name")
    .order("created_at", { ascending: false })
  const documentsQuery = supabase
    .from("partner_documents")
    .select("id, partner_id, deal_id, kind, status, title, document_number, source_file_name, amount, issued_at, due_at, file_path, external_url, metadata")
    .is("archived_at", null)
    .order("issued_at", { ascending: false })
  const documentDeliveriesQuery = supabase
    .from("partner_document_deliveries")
    .select("id, partner_document_id, partner_id, delivery_channel, status, recipient_name, recipient_email, recipient_phone, expires_at, password_enabled, allow_download, allow_print, sent_at, last_viewed_at, view_count")
    .order("created_at", { ascending: false })
  const scheduleQuery = supabase
    .from("partner_schedule_items")
    .select("id, partner_id, deal_id, kind, status, title, starts_at, ends_at, owner_name")
    .order("starts_at", { ascending: true })
  const salesQuery = supabase
    .from("partner_sales_records")
    .select("id, partner_id, deal_id, sales_month, units_sold, gross_amount, net_amount")
    .order("sales_month", { ascending: false })
  const automationsQuery = supabase
    .from("partner_automations")
    .select("id, partner_id, deal_id, name, status, trigger_type, action_type, destination, last_run_at, next_run_at")
    .order("created_at", { ascending: false })
  const checklistQuery = supabase
    .from("partner_ops_checklist_items")
    .select("id, partner_id, deal_id, parent_item_id, checklist_group, title, item_category, item_code, item_name, planned_quantity, confirmed_quantity, todo_status, install_status, owner_name, due_at, completed_at, notes")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  const issuesQuery = supabase
    .from("partner_ops_issues")
    .select("id, partner_id, deal_id, related_document_id, related_checklist_item_id, title, category, severity, status, facts, unresolved_points, current_assumption, verify_with, owner_name, next_check_at, due_at, resolved_at, resolution_summary")
    .order("updated_at", { ascending: false })
  const activityLogsQuery = supabase
    .from("partner_activity_logs")
    .select("id, partner_id, deal_id, document_id, schedule_item_id, checklist_item_id, issue_id, subject_type, subject_id, log_category, status, actor_name, action, summary, details, next_action, due_at, occurred_at")
    .order("occurred_at", { ascending: false })

  const filteredContactsQuery = partnerId ? contactsQuery.eq("partner_id", partnerId) : contactsQuery
  const filteredDealsQuery = partnerId ? dealsQuery.eq("partner_id", partnerId) : dealsQuery
  const filteredDocumentsQuery = partnerId ? documentsQuery.eq("partner_id", partnerId) : documentsQuery
  const filteredDocumentDeliveriesQuery = partnerId
    ? documentDeliveriesQuery.eq("partner_id", partnerId)
    : documentDeliveriesQuery
  const filteredScheduleQuery = partnerId ? scheduleQuery.eq("partner_id", partnerId) : scheduleQuery
  const filteredSalesQuery = partnerId ? salesQuery.eq("partner_id", partnerId) : salesQuery
  const filteredAutomationsQuery = partnerId ? automationsQuery.eq("partner_id", partnerId) : automationsQuery
  const filteredChecklistQuery = partnerId ? checklistQuery.eq("partner_id", partnerId) : checklistQuery
  const filteredIssuesQuery = partnerId ? issuesQuery.eq("partner_id", partnerId) : issuesQuery
  const filteredActivityLogsQuery = partnerId ? activityLogsQuery.eq("partner_id", partnerId) : activityLogsQuery

  const [
    { data: partners, error: partnersError },
    { data: contacts, error: contactsError },
    { data: deals, error: dealsError },
    { data: documents, error: documentsError },
    { data: documentDeliveries, error: documentDeliveriesError },
    { data: schedule, error: scheduleError },
    { data: sales, error: salesError },
    { data: automations, error: automationsError },
    { data: checklists, error: checklistsError },
    { data: issues, error: issuesError },
    { data: activityLogs, error: activityLogsError },
  ] = await Promise.all([
    filteredPartnersQuery,
    filteredContactsQuery,
    filteredDealsQuery,
    filteredDocumentsQuery,
    filteredDocumentDeliveriesQuery,
    filteredScheduleQuery,
    filteredSalesQuery,
    filteredAutomationsQuery,
    filteredChecklistQuery,
    filteredIssuesQuery,
    filteredActivityLogsQuery,
  ])

  // 어느 테이블이 죽었는지 에러에 남긴다 — 테이블 부재가 무음 폴백 뒤에 숨었던 전례 방지
  const queryErrors: Array<[table: string, queryError: { message: string } | null]> = [
    ["partners", partnersError],
    ["partner_contacts", contactsError],
    ["partner_deals", dealsError],
    ["partner_documents", documentsError],
    ["partner_document_deliveries", documentDeliveriesError],
    ["partner_schedule_items", scheduleError],
    ["partner_sales_records", salesError],
    ["partner_automations", automationsError],
    ["partner_ops_checklist_items", checklistsError],
    ["partner_ops_issues", issuesError],
    ["partner_activity_logs", activityLogsError],
  ]
  for (const [table, queryError] of queryErrors) {
    if (queryError) {
      throw new Error(`${table}: ${queryError.message}`)
    }
  }

  const normalizedContacts: PartnerContact[] = ((contacts ?? []) as PartnerContactRow[]).map((contact) => ({
    id: contact.id,
    partnerId: contact.partner_id,
    name: contact.name,
    role: contact.role ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
    isPrimary: Boolean(contact.is_primary),
  }))

  const normalizedDeals: PartnerDeal[] = ((deals ?? []) as PartnerDealRow[]).map((deal) => ({
    id: deal.id,
    partnerId: deal.partner_id,
    title: deal.title,
    stage: deal.stage,
    quoteAmount: toNumber(deal.quote_amount),
    expectedCloseAt: formatDate(deal.expected_close_at),
    contractStartAt: formatDate(deal.contract_start_at),
    contractEndAt: formatDate(deal.contract_end_at),
    salesUnits: toNumber(deal.sales_units),
    manager: deal.owner_name ?? "미지정",
  }))

  const normalizedDocumentDeliveries: PartnerDocumentDeliverySummary[] = (
    (documentDeliveries ?? []) as PartnerDocumentDeliveryRow[]
  ).map((delivery) => ({
    id: delivery.id,
    partnerDocumentId: delivery.partner_document_id,
    deliveryChannel: delivery.delivery_channel,
    status: delivery.status,
    recipientName: delivery.recipient_name ?? undefined,
    recipientEmail: delivery.recipient_email ?? undefined,
    recipientPhone: delivery.recipient_phone ?? undefined,
    expiresAt: formatDateTime(delivery.expires_at),
    passwordEnabled: Boolean(delivery.password_enabled),
    allowDownload: delivery.allow_download !== false,
    allowPrint: delivery.allow_print !== false,
    sentAt: formatDateTime(delivery.sent_at),
    lastViewedAt: formatDateTime(delivery.last_viewed_at),
    viewCount: delivery.view_count == null ? 0 : toNumber(delivery.view_count),
  }))

  const deliveriesByDocument = normalizedDocumentDeliveries.reduce<Record<string, PartnerDocumentDeliverySummary[]>>((acc, delivery) => {
    const key = delivery.partnerDocumentId
    if (!acc[key]) acc[key] = []
    acc[key].push(delivery)
    return acc
  }, {})

  const normalizedDocuments: PartnerDocument[] = ((documents ?? []) as PartnerDocumentRow[]).map((document) => ({
    ...normalizeDocument(document.partner_id, {
      id: document.id,
      partnerId: document.partner_id,
      dealId: document.deal_id ?? undefined,
      kind: document.kind,
      status: document.status,
      title: document.title,
      amount: document.amount == null ? undefined : toNumber(document.amount),
      issuedAt: formatDate(document.issued_at),
      dueAt: formatDate(document.due_at),
      fileLabel: document.source_file_name ?? document.file_path ?? document.external_url ?? "첨부 문서",
      externalUrl: document.external_url ?? undefined,
      quoteDetails: {
        ...(toObject(document.metadata)?.quoteDetails as Record<string, unknown> | undefined),
        estimateNumber:
          toOptionalString((toObject(document.metadata)?.quoteDetails as Record<string, unknown> | undefined)?.estimateNumber) ??
          (document.document_number ?? undefined),
      },
      deliveries: deliveriesByDocument[document.id] ?? [],
    }),
  }))

  const normalizedSchedule: PartnerScheduleItem[] = ((schedule ?? []) as PartnerScheduleRow[]).map((item) => ({
    id: item.id,
    partnerId: item.partner_id,
    dealId: item.deal_id ?? undefined,
    kind: item.kind,
    status: item.status,
    title: item.title,
    startsAt: formatDateTime(item.starts_at) ?? item.starts_at,
    endsAt: formatDateTime(item.ends_at) ?? undefined,
    owner: item.owner_name ?? "미지정",
  }))

  const normalizedSales: PartnerSalesRecord[] = ((sales ?? []) as PartnerSalesRow[]).map((sale) => ({
    id: sale.id,
    partnerId: sale.partner_id,
    dealId: sale.deal_id ?? undefined,
    salesMonth: formatDate(sale.sales_month) ?? sale.sales_month,
    unitsSold: toNumber(sale.units_sold),
    grossAmount: toNumber(sale.gross_amount),
    netAmount: toNumber(sale.net_amount),
  }))

  const normalizedAutomations: PartnerAutomation[] = ((automations ?? []) as PartnerAutomationRow[]).map((automation) => ({
    id: automation.id,
    partnerId: automation.partner_id,
    dealId: automation.deal_id ?? undefined,
    name: automation.name,
    status: automation.status,
    trigger: automation.trigger_type,
    action: automation.action_type,
    destination: automation.destination ?? "미지정",
    lastRunAt: formatDateTime(automation.last_run_at),
    nextRunAt: formatDateTime(automation.next_run_at),
  }))

  const normalizedChecklists: PartnerOpsChecklistItem[] = ((checklists ?? []) as PartnerChecklistRow[]).map((item) => ({
    id: item.id,
    partnerId: item.partner_id,
    dealId: item.deal_id ?? undefined,
    parentItemId: item.parent_item_id ?? undefined,
    checklistGroup: item.checklist_group,
    title: item.title,
    itemCategory: item.item_category ?? undefined,
    itemCode: item.item_code ?? undefined,
    itemName: item.item_name ?? undefined,
    plannedQuantity: item.planned_quantity == null ? undefined : toNumber(item.planned_quantity),
    confirmedQuantity: item.confirmed_quantity == null ? undefined : toNumber(item.confirmed_quantity),
    todoStatus: item.todo_status,
    installStatus: item.install_status,
    owner: item.owner_name ?? "미지정",
    dueAt: formatDateTime(item.due_at),
    completedAt: formatDateTime(item.completed_at),
    notes: item.notes ?? undefined,
  }))

  const normalizedIssues: PartnerOpsIssue[] = ((issues ?? []) as PartnerIssueRow[]).map((issue) => ({
    id: issue.id,
    partnerId: issue.partner_id,
    dealId: issue.deal_id ?? undefined,
    relatedDocumentId: issue.related_document_id ?? undefined,
    relatedChecklistItemId: issue.related_checklist_item_id ?? undefined,
    title: issue.title,
    category: issue.category,
    severity: issue.severity,
    status: issue.status,
    facts: issue.facts ?? undefined,
    unresolvedPoints: issue.unresolved_points ?? undefined,
    currentAssumption: issue.current_assumption ?? undefined,
    verifyWith: issue.verify_with ?? undefined,
    owner: issue.owner_name ?? "미지정",
    nextCheckAt: formatDateTime(issue.next_check_at),
    dueAt: formatDateTime(issue.due_at),
    resolvedAt: formatDateTime(issue.resolved_at),
    resolutionSummary: issue.resolution_summary ?? undefined,
  }))

  const normalizedActivityLogs: PartnerActivityLog[] = ((activityLogs ?? []) as PartnerActivityLogRow[]).map((log) => ({
    id: log.id,
    partnerId: log.partner_id,
    dealId: log.deal_id ?? undefined,
    documentId: log.document_id ?? undefined,
    scheduleItemId: log.schedule_item_id ?? undefined,
    checklistItemId: log.checklist_item_id ?? undefined,
    issueId: log.issue_id ?? undefined,
    subjectType: log.subject_type,
    subjectId: log.subject_id ?? undefined,
    logCategory: log.log_category,
    status: log.status,
    actor: log.actor_name ?? "미지정",
    action: log.action,
    summary: log.summary,
    details: log.details ?? undefined,
    nextAction: log.next_action ?? undefined,
    dueAt: formatDateTime(log.due_at),
    occurredAt: formatDateTime(log.occurred_at) ?? log.occurred_at,
  }))

  const contactsByPartner = groupByPartner(normalizedContacts)
  const dealsByPartner = groupByPartner(normalizedDeals)
  const documentsByPartner = groupByPartner(normalizedDocuments)
  const scheduleByPartner = groupByPartner(normalizedSchedule)
  const salesByPartner = groupByPartner(normalizedSales)
  const automationsByPartner = groupByPartner(normalizedAutomations)
  const checklistsByPartner = groupByPartner(normalizedChecklists)
  const issuesByPartner = groupByPartner(normalizedIssues)
  const activityLogsByPartner = groupByPartner(normalizedActivityLogs)

  return ((partners ?? []) as PartnerRow[]).map((partner) =>
    normalizeWorkspace({
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
        channel: partner.channel,
        region: partner.region ?? "미지정",
        ownerName: partner.owner_name ?? "미지정",
        ownerEmail: partner.owner_email ?? "미지정",
        accountManager: partner.account_manager_name ?? "미지정",
        nextActionAt: undefined,
        tags: partner.tags ?? [],
        notes: partner.notes ?? undefined,
      },
      contacts: contactsByPartner[partner.id] ?? [],
      deals: dealsByPartner[partner.id] ?? [],
      documents: documentsByPartner[partner.id] ?? [],
      schedule: scheduleByPartner[partner.id] ?? [],
      sales: salesByPartner[partner.id] ?? [],
      automations: automationsByPartner[partner.id] ?? [],
      checklists: checklistsByPartner[partner.id] ?? [],
      issues: issuesByPartner[partner.id] ?? [],
      activityLogs: activityLogsByPartner[partner.id] ?? [],
    })
  )
}

async function listLocalPartnerWorkspaces() {
  return readLocalWorkspaces()
}

async function getLocalPartnerWorkspace(id: string) {
  const workspaces = await readLocalWorkspaces()
  return workspaces.find((workspace) => workspace.partner.id === id) ?? null
}

async function createLocalPartner(summary: PartnerSummaryInput) {
  const workspaces = await readLocalWorkspaces()
  const partnerId = makeId("partner")
  const workspace = normalizeWorkspace({
    partner: {
      id: partnerId,
      name: summary.name,
      status: summary.status,
      channel: summary.channel,
      region: summary.region,
      ownerName: summary.ownerName,
      ownerEmail: summary.ownerEmail,
      accountManager: summary.accountManager,
      nextActionAt: undefined,
      tags: summary.tags,
      notes: summary.notes,
    },
    deals: [],
    documents: [],
    schedule: [],
    sales: [],
    automations: [],
    contacts: [],
    checklists: [],
    issues: [],
    activityLogs: [],
  })
  syncPrimaryContactFromPartnerSummary(workspace)
  const normalizedWorkspace = normalizeWorkspace(workspace)
  workspaces.unshift(normalizedWorkspace)
  await writeLocalWorkspaces(workspaces)
  return normalizedWorkspace
}

async function updateLocalPartner(id: string, summary: Partial<PartnerSummaryInput>) {
  const workspaces = await readLocalWorkspaces()
  const index = workspaces.findIndex((workspace) => workspace.partner.id === id)
  if (index < 0) return null

  const current = workspaces[index]
  const nextWorkspace = normalizeWorkspace({
    ...current,
    partner: {
      ...current.partner,
      name: summary.name ?? current.partner.name,
      status: summary.status ?? current.partner.status,
      channel: summary.channel ?? current.partner.channel,
      region: summary.region ?? current.partner.region,
      ownerName: summary.ownerName ?? current.partner.ownerName,
      ownerEmail: summary.ownerEmail ?? current.partner.ownerEmail,
      accountManager: summary.accountManager ?? current.partner.accountManager,
      tags: summary.tags ?? current.partner.tags,
      notes: summary.notes ?? current.partner.notes,
    },
  })
  syncPrimaryContactFromPartnerSummary(nextWorkspace)
  workspaces[index] = normalizeWorkspace(nextWorkspace)

  await writeLocalWorkspaces(workspaces)
  return workspaces[index]
}

async function upsertLocalDeal(partnerId: string, input: PartnerDealInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null

  const nextDeal: PartnerDeal = {
    id: input.id ?? makeId("deal"),
    partnerId,
    title: input.title,
    stage: input.stage,
    quoteAmount: input.quoteAmount,
    expectedCloseAt: input.expectedCloseAt,
    contractStartAt: input.contractStartAt,
    contractEndAt: input.contractEndAt,
    salesUnits: input.salesUnits,
    manager: input.manager,
  }

  const index = workspace.deals.findIndex((deal) => deal.id === nextDeal.id)
  if (index >= 0) workspace.deals[index] = nextDeal
  else workspace.deals.unshift(nextDeal)

  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

async function upsertLocalDocument(partnerId: string, input: PartnerDocumentInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null
  ensureWorkspaceDealOwnership(workspace, input.dealId)
  const currentDocument = input.id
    ? workspace.documents.find((document) => document.id === input.id)
    : undefined

  const nextDocument: PartnerDocument = {
    id: input.id ?? makeId("doc"),
    partnerId,
    dealId: input.dealId,
    kind: input.kind,
    status: input.status,
    title: input.title,
    amount: input.amount,
    issuedAt: input.issuedAt,
    dueAt: input.dueAt,
    fileLabel: input.fileLabel,
    externalUrl: input.externalUrl ?? currentDocument?.externalUrl,
    lineItemCount: input.quoteDetails?.lineItems?.length ?? currentDocument?.lineItemCount,
    quoteDetails:
      normalizeQuoteDetails(input.quoteDetails, {
        issuedAt: input.issuedAt,
        validUntil: input.dueAt,
        grandTotalAmount: input.amount,
      }) ?? currentDocument?.quoteDetails,
    deliveries: currentDocument?.deliveries ?? [],
  }

  const index = workspace.documents.findIndex((document) => document.id === nextDocument.id)
  if (index >= 0) workspace.documents[index] = nextDocument
  else workspace.documents.unshift(nextDocument)

  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

async function upsertLocalSchedule(partnerId: string, input: PartnerScheduleInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null
  ensureWorkspaceDealOwnership(workspace, input.dealId)

  const nextItem: PartnerScheduleItem = {
    id: input.id ?? makeId("schedule"),
    partnerId,
    dealId: input.dealId,
    kind: input.kind,
    status: input.status,
    title: input.title,
    startsAt: toStorageDateTime(input.startsAt) ?? input.startsAt,
    endsAt: toStorageDateTime(input.endsAt),
    owner: input.owner,
  }

  const index = workspace.schedule.findIndex((item) => item.id === nextItem.id)
  if (index >= 0) workspace.schedule[index] = nextItem
  else workspace.schedule.unshift(nextItem)

  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

async function upsertLocalSales(partnerId: string, input: PartnerSalesInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null
  ensureWorkspaceDealOwnership(workspace, input.dealId)

  const nextRecord: PartnerSalesRecord = {
    id: input.id ?? makeId("sales"),
    partnerId,
    dealId: input.dealId,
    salesMonth: input.salesMonth,
    unitsSold: input.unitsSold,
    grossAmount: input.grossAmount,
    netAmount: input.netAmount,
  }

  const index = workspace.sales.findIndex((item) => item.id === nextRecord.id)
  if (index >= 0) workspace.sales[index] = nextRecord
  else workspace.sales.unshift(nextRecord)

  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

async function upsertLocalContact(partnerId: string, input: PartnerContactInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null

  const existing = input.id ? workspace.contacts.find((contact) => contact.id === input.id) : undefined
  const isPrimary =
    input.isPrimary ??
    existing?.isPrimary ??
    workspace.contacts.length === 0

  const nextContact: PartnerContact = {
    id: input.id ?? makeId("contact"),
    partnerId,
    name: input.name,
    role: input.role,
    email: input.email,
    phone: input.phone,
    isPrimary,
  }

  if (nextContact.isPrimary) {
    workspace.contacts = workspace.contacts.map((contact) => ({ ...contact, isPrimary: false }))
  }

  const index = workspace.contacts.findIndex((contact) => contact.id === nextContact.id)
  if (index >= 0) workspace.contacts[index] = nextContact
  else workspace.contacts.unshift(nextContact)

  syncPartnerSummaryFromPrimaryContact(workspace)
  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

function ensureWorkspaceDealOwnership(workspace: PartnerWorkspace, dealId?: string) {
  if (!dealId) return
  const exists = workspace.deals.some((deal) => deal.id === dealId)
  if (!exists) {
    throw new Error("해당 거래는 현재 파트너에 속하지 않습니다.")
  }
}

function ensureWorkspaceEntityOwnership(
  items: Array<{ id: string }>,
  entityId: string | undefined,
  label: string
) {
  if (!entityId) return
  const exists = items.some((item) => item.id === entityId)
  if (!exists) {
    throw new Error(`해당 ${label}는 현재 파트너에 속하지 않습니다.`)
  }
}

function ensureWorkspaceDocumentOwnership(workspace: PartnerWorkspace, documentId?: string) {
  ensureWorkspaceEntityOwnership(workspace.documents, documentId, "문서")
}

function ensureWorkspaceChecklistOwnership(workspace: PartnerWorkspace, checklistItemId?: string) {
  ensureWorkspaceEntityOwnership(workspace.checklists, checklistItemId, "체크리스트")
}

function ensureWorkspaceScheduleOwnership(workspace: PartnerWorkspace, scheduleItemId?: string) {
  ensureWorkspaceEntityOwnership(workspace.schedule, scheduleItemId, "일정")
}

function ensureWorkspaceIssueOwnership(workspace: PartnerWorkspace, issueId?: string) {
  ensureWorkspaceEntityOwnership(workspace.issues, issueId, "이슈")
}

async function ensureSupabaseDealOwnership(partnerId: string, dealId?: string) {
  if (!dealId) return
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("partner_deals")
    .select("id")
    .eq("id", dealId)
    .eq("partner_id", partnerId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    throw new Error("해당 거래는 현재 파트너에 속하지 않습니다.")
  }
}

async function ensureSupabaseEntityOwnership(
  partnerId: string,
  table: string,
  entityId: string | undefined,
  label: string
) {
  if (!entityId) return

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", entityId)
    .eq("partner_id", partnerId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    throw new Error(`해당 ${label}는 현재 파트너에 속하지 않습니다.`)
  }
}

async function ensureSupabaseDocumentOwnership(partnerId: string, documentId?: string) {
  return ensureSupabaseEntityOwnership(partnerId, "partner_documents", documentId, "문서")
}

async function ensureSupabaseChecklistOwnership(partnerId: string, checklistItemId?: string) {
  return ensureSupabaseEntityOwnership(partnerId, "partner_ops_checklist_items", checklistItemId, "체크리스트")
}

async function ensureSupabaseScheduleOwnership(partnerId: string, scheduleItemId?: string) {
  return ensureSupabaseEntityOwnership(partnerId, "partner_schedule_items", scheduleItemId, "일정")
}

async function ensureSupabaseIssueOwnership(partnerId: string, issueId?: string) {
  return ensureSupabaseEntityOwnership(partnerId, "partner_ops_issues", issueId, "이슈")
}

async function upsertLocalChecklist(partnerId: string, input: PartnerChecklistInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null
  ensureWorkspaceDealOwnership(workspace, input.dealId)
  ensureWorkspaceChecklistOwnership(workspace, input.parentItemId)

  const nextItem: PartnerOpsChecklistItem = {
    id: input.id ?? makeId("checklist"),
    partnerId,
    dealId: input.dealId,
    parentItemId: input.parentItemId,
    checklistGroup: input.checklistGroup,
    title: input.title,
    itemCategory: input.itemCategory,
    itemCode: input.itemCode,
    itemName: input.itemName,
    plannedQuantity: input.plannedQuantity,
    confirmedQuantity: input.confirmedQuantity,
    todoStatus: input.todoStatus,
    installStatus: input.installStatus,
    owner: input.owner,
    dueAt: toStorageDateTime(input.dueAt),
    completedAt: toStorageDateTime(input.completedAt),
    notes: input.notes,
  }

  const index = workspace.checklists.findIndex((item) => item.id === nextItem.id)
  if (index >= 0) workspace.checklists[index] = nextItem
  else workspace.checklists.unshift(nextItem)

  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

async function upsertLocalIssue(partnerId: string, input: PartnerIssueInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null
  ensureWorkspaceDealOwnership(workspace, input.dealId)
  ensureWorkspaceDocumentOwnership(workspace, input.relatedDocumentId)
  ensureWorkspaceChecklistOwnership(workspace, input.relatedChecklistItemId)

  const nextIssue: PartnerOpsIssue = {
    id: input.id ?? makeId("issue"),
    partnerId,
    dealId: input.dealId,
    relatedDocumentId: input.relatedDocumentId,
    relatedChecklistItemId: input.relatedChecklistItemId,
    title: input.title,
    category: input.category,
    severity: input.severity,
    status: input.status,
    facts: input.facts,
    unresolvedPoints: input.unresolvedPoints,
    currentAssumption: input.currentAssumption,
    verifyWith: input.verifyWith,
    owner: input.owner,
    nextCheckAt: toStorageDateTime(input.nextCheckAt),
    dueAt: toStorageDateTime(input.dueAt),
    resolvedAt: toStorageDateTime(input.resolvedAt),
    resolutionSummary: input.resolutionSummary,
  }

  const index = workspace.issues.findIndex((item) => item.id === nextIssue.id)
  if (index >= 0) workspace.issues[index] = nextIssue
  else workspace.issues.unshift(nextIssue)

  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

async function upsertLocalActivityLog(partnerId: string, input: PartnerActivityLogInput) {
  const workspaces = await readLocalWorkspaces()
  const workspace = workspaces.find((item) => item.partner.id === partnerId)
  if (!workspace) return null
  ensureWorkspaceDealOwnership(workspace, input.dealId)
  ensureWorkspaceDocumentOwnership(workspace, input.documentId)
  ensureWorkspaceScheduleOwnership(workspace, input.scheduleItemId)
  ensureWorkspaceChecklistOwnership(workspace, input.checklistItemId)
  ensureWorkspaceIssueOwnership(workspace, input.issueId)

  const nextLog: PartnerActivityLog = {
    id: input.id ?? makeId("activity"),
    partnerId,
    dealId: input.dealId,
    documentId: input.documentId,
    scheduleItemId: input.scheduleItemId,
    checklistItemId: input.checklistItemId,
    issueId: input.issueId,
    subjectType: input.subjectType ?? "partner",
    subjectId: input.subjectId,
    logCategory: input.logCategory,
    status: input.status,
    actor: input.actor,
    action: input.action,
    summary: input.summary,
    details: input.details,
    nextAction: input.nextAction,
    dueAt: toStorageDateTime(input.dueAt),
    occurredAt: toStorageDateTime(input.occurredAt) ?? input.occurredAt,
  }

  const index = workspace.activityLogs.findIndex((item) => item.id === nextLog.id)
  if (index >= 0) workspace.activityLogs[index] = nextLog
  else workspace.activityLogs.unshift(nextLog)

  await writeLocalWorkspaces(workspaces)
  return normalizeWorkspace(workspace)
}

function buildPartnerWorkspaceShell(workspace: PartnerWorkspace): PartnerWorkspaceShell {
  const { date: today, month: currentMonth } = getBusinessDateParts()
  const pendingDocumentCount = workspace.documents.filter((document) => ["draft", "sent", "overdue"].includes(document.status)).length
  const openIssueCount = workspace.issues.filter((issue) => issue.status !== "resolved").length
  const todayTodoCount =
    workspace.schedule.filter((item) => item.status === "planned" && item.startsAt.startsWith(today)).length +
    workspace.checklists.filter((item) => item.todoStatus !== "done" && item.todoStatus !== "canceled").length
  const currentMonthSales = workspace.sales.filter((sale) => sale.salesMonth.startsWith(currentMonth))
  const checklistItems = workspace.checklists.filter((item) => item.todoStatus !== "canceled")
  const completedChecklistItems = checklistItems.filter((item) => item.todoStatus === "done")
  const fulfillmentProgress =
    checklistItems.length === 0 ? 0 : Math.round((completedChecklistItems.length / checklistItems.length) * 100)
  const lastMeetingAt = workspace.activityLogs.find((log) => log.logCategory === "meeting" || log.action.includes("meeting"))?.occurredAt

  return {
    partner: workspace.partner,
    mainDeal: getMainDeal(workspace.deals),
    nextActionAt: workspace.partner.nextActionAt,
    todayTodoCount,
    openIssueCount,
    pendingDocumentCount,
    currentMonthSalesUnits: currentMonthSales.reduce((sum, sale) => sum + sale.unitsSold, 0),
    currentMonthNetAmount: currentMonthSales.reduce((sum, sale) => sum + sale.netAmount, 0),
    lastMeetingAt,
    fulfillmentProgress,
  }
}

function buildPartnerQueueSummary(workspace: PartnerWorkspace): PartnerQueueSummary {
  const latestActivity = workspace.activityLogs[0]
  const overdueDocumentCount = workspace.documents.filter((document) => document.status === "overdue").length
  const pendingSettlementCount = workspace.documents.filter((document) =>
    document.kind === "receipt" && ["draft", "sent", "overdue"].includes(document.status)
  ).length
  const openIssueCount = workspace.issues.filter((issue) => issue.status !== "resolved").length
  const openChecklistCount = workspace.checklists.filter((item) => item.todoStatus !== "done" && item.todoStatus !== "canceled").length
  const mainDeal = getMainDeal(workspace.deals)
  const riskScore = [overdueDocumentCount > 0, openIssueCount > 0, workspace.partner.status === "churn_risk"].filter(Boolean).length

  return {
    partnerId: workspace.partner.id,
    partnerName: workspace.partner.name,
    status: workspace.partner.status,
    channel: workspace.partner.channel,
    region: workspace.partner.region,
    accountManager: workspace.partner.accountManager,
    ownerName: workspace.partner.ownerName,
    mainDealStage: mainDeal?.stage,
    mainDealTitle: mainDeal?.title,
    nextActionAt: workspace.partner.nextActionAt,
    openChecklistCount,
    openIssueCount,
    overdueDocumentCount,
    pendingSettlementCount,
    latestActivitySummary: latestActivity?.summary,
    latestActivityAt: latestActivity?.occurredAt,
    riskLevel: riskScore >= 2 ? "high" : riskScore === 1 ? "medium" : "low",
  }
}

async function createSupabasePartner(summary: PartnerSummaryInput) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("partners")
    .insert({
      code: makePartnerCode(summary.name),
      name: summary.name,
      status: summary.status,
      channel: summary.channel,
      region: summary.region,
      owner_name: summary.ownerName,
      owner_email: summary.ownerEmail,
      account_manager_name: summary.accountManager,
      tags: summary.tags,
      notes: summary.notes ?? null,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  const { error: contactError } = await supabase.from("partner_contacts").insert({
    partner_id: data.id,
    name: summary.ownerName,
    role: null,
    email: summary.ownerEmail || null,
    phone: null,
    is_primary: true,
  })
  if (contactError) throw new Error(contactError.message)

  return readUpdatedSupabaseWorkspace(data.id)
}

async function updateSupabasePartner(id: string, summary: Partial<PartnerSummaryInput>) {
  const supabase = createSupabaseAdminClient()
  const payload: Record<string, unknown> = {}

  if (summary.name != null) payload.name = summary.name
  if (summary.status != null) payload.status = summary.status
  if (summary.channel != null) payload.channel = summary.channel
  if (summary.region != null) payload.region = summary.region
  if (summary.ownerName != null) payload.owner_name = summary.ownerName
  if (summary.ownerEmail != null) payload.owner_email = summary.ownerEmail
  if (summary.accountManager != null) payload.account_manager_name = summary.accountManager
  if (summary.tags != null) payload.tags = summary.tags
  if (summary.notes !== undefined) payload.notes = summary.notes ?? null

  const { error } = await supabase.from("partners").update(payload).eq("id", id)
  if (error) throw new Error(error.message)
  await syncSupabasePrimaryContactFromPartnerSummary(id, summary, supabase)
  return readUpdatedSupabaseWorkspace(id)
}

async function upsertSupabaseContact(partnerId: string, input: PartnerContactInput) {
  const supabase = createSupabaseAdminClient()

  if (input.isPrimary) {
    const { error: resetError } = await supabase
      .from("partner_contacts")
      .update({ is_primary: false })
      .eq("partner_id", partnerId)
    if (resetError) throw new Error(resetError.message)
  }

  const payload = {
    partner_id: partnerId,
    name: input.name,
    role: input.role ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    is_primary: input.isPrimary ?? false,
  }

  const query = input.id
    ? supabase
        .from("partner_contacts")
        .update(payload)
        .eq("id", input.id)
        .eq("partner_id", partnerId)
        .select("id")
        .single()
    : supabase.from("partner_contacts").insert(payload).select("id").single()

  const { error } = await query
  if (error) throw new Error(error.message)

  if (input.isPrimary) {
    const partnerPayload: Record<string, unknown> = {
      owner_name: input.name,
      owner_email: input.email ?? null,
    }

    const { error: partnerError } = await supabase.from("partners").update(partnerPayload).eq("id", partnerId)
    if (partnerError) throw new Error(partnerError.message)
  }

  return readUpdatedSupabaseWorkspace(partnerId)
}

async function upsertSupabaseDeal(partnerId: string, input: PartnerDealInput) {
  const supabase = createSupabaseAdminClient()
  const payload = {
    partner_id: partnerId,
    title: input.title,
    stage: input.stage,
    quote_amount: input.quoteAmount,
    expected_close_at: input.expectedCloseAt ?? null,
    contract_start_at: input.contractStartAt ?? null,
    contract_end_at: input.contractEndAt ?? null,
    sales_units: input.salesUnits,
    owner_name: input.manager,
  }

  const query = input.id
    ? supabase.from("partner_deals").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_deals").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return readUpdatedSupabaseWorkspace(partnerId)
}

async function upsertSupabaseDocument(partnerId: string, input: PartnerDocumentInput) {
  const supabase = createSupabaseAdminClient()
  await ensureSupabaseDealOwnership(partnerId, input.dealId)
  let existingMetadata: Record<string, unknown> = {}
  let existingDocumentNumber: string | null = null

  if (input.id) {
    const { data: currentDocument, error: currentDocumentError } = await supabase
      .from("partner_documents")
      .select("metadata, document_number")
      .eq("id", input.id)
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (currentDocumentError) {
      throw new Error(currentDocumentError.message)
    }

    existingMetadata = toObject(currentDocument?.metadata) ?? {}
    existingDocumentNumber = currentDocument?.document_number ?? null
  }

  const nextQuoteDetails = input.quoteDetails
    ? normalizeQuoteDetails(input.quoteDetails, {
        issuedAt: input.issuedAt,
        validUntil: input.dueAt,
        grandTotalAmount: input.amount,
      })
    : normalizeQuoteDetails(existingMetadata.quoteDetails, {
        issuedAt: input.issuedAt,
        validUntil: input.dueAt,
        grandTotalAmount: input.amount,
      })

  const metadata: Record<string, unknown> = {
    ...existingMetadata,
  }

  if (nextQuoteDetails) {
    metadata.quoteDetails = nextQuoteDetails
  } else {
    delete metadata.quoteDetails
  }

  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    kind: input.kind,
    status: input.status,
    title: input.title,
    document_number: nextQuoteDetails?.estimateNumber ?? existingDocumentNumber,
    source_file_name: input.fileLabel,
    amount: input.amount ?? null,
    issued_at: input.issuedAt ?? null,
    due_at: input.dueAt ?? null,
    file_path: input.fileLabel,
    external_url: input.externalUrl ?? null,
    metadata,
  }

  const query = input.id
    ? supabase.from("partner_documents").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_documents").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return readUpdatedSupabaseWorkspace(partnerId)
}

async function upsertSupabaseSchedule(partnerId: string, input: PartnerScheduleInput) {
  const supabase = createSupabaseAdminClient()
  await ensureSupabaseDealOwnership(partnerId, input.dealId)
  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    kind: input.kind,
    status: input.status,
    title: input.title,
    starts_at: toStorageDateTime(input.startsAt),
    ends_at: toStorageDateTime(input.endsAt) ?? null,
    owner_name: input.owner,
  }

  const query = input.id
    ? supabase.from("partner_schedule_items").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_schedule_items").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return readUpdatedSupabaseWorkspace(partnerId)
}

async function upsertSupabaseSales(partnerId: string, input: PartnerSalesInput) {
  const supabase = createSupabaseAdminClient()
  await ensureSupabaseDealOwnership(partnerId, input.dealId)
  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    sales_month: input.salesMonth,
    units_sold: input.unitsSold,
    gross_amount: input.grossAmount,
    net_amount: input.netAmount,
  }

  // 신규 저장은 (partner_id, deal_id, sales_month) 유니크 기준 upsert —
  // 같은 달 실적 재입력이 새 행으로 쌓여 이중계상되지 않게 기존 행을 덮어쓴다.
  const query = input.id
    ? supabase.from("partner_sales_records").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_sales_records").upsert(payload, { onConflict: "partner_id,deal_id,sales_month" })

  const { error } = await query
  if (error) {
    if (error.code === "23505") {
      throw new Error("같은 파트너·거래·월의 실적이 이미 있습니다. 기존 기록을 수정해 주세요.")
    }
    throw new Error(error.message)
  }
  return readUpdatedSupabaseWorkspace(partnerId)
}

async function upsertSupabaseChecklist(partnerId: string, input: PartnerChecklistInput) {
  const supabase = createSupabaseAdminClient()
  await ensureSupabaseDealOwnership(partnerId, input.dealId)
  await ensureSupabaseChecklistOwnership(partnerId, input.parentItemId)
  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    parent_item_id: input.parentItemId ?? null,
    checklist_group: input.checklistGroup,
    title: input.title,
    item_category: input.itemCategory ?? null,
    item_code: input.itemCode ?? null,
    item_name: input.itemName ?? null,
    planned_quantity: input.plannedQuantity ?? null,
    confirmed_quantity: input.confirmedQuantity ?? null,
    todo_status: input.todoStatus,
    install_status: input.installStatus,
    owner_name: input.owner ?? null,
    due_at: toStorageDateTime(input.dueAt) ?? null,
    completed_at: toStorageDateTime(input.completedAt) ?? null,
    notes: input.notes ?? null,
  }

  const query = input.id
    ? supabase.from("partner_ops_checklist_items").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_ops_checklist_items").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return readUpdatedSupabaseWorkspace(partnerId)
}

async function upsertSupabaseIssue(partnerId: string, input: PartnerIssueInput) {
  const supabase = createSupabaseAdminClient()
  await ensureSupabaseDealOwnership(partnerId, input.dealId)
  await Promise.all([
    ensureSupabaseDocumentOwnership(partnerId, input.relatedDocumentId),
    ensureSupabaseChecklistOwnership(partnerId, input.relatedChecklistItemId),
  ])
  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    related_document_id: input.relatedDocumentId ?? null,
    related_checklist_item_id: input.relatedChecklistItemId ?? null,
    title: input.title,
    category: input.category,
    severity: input.severity,
    status: input.status,
    facts: input.facts ?? null,
    unresolved_points: input.unresolvedPoints ?? null,
    current_assumption: input.currentAssumption ?? null,
    verify_with: input.verifyWith ?? null,
    owner_name: input.owner ?? null,
    next_check_at: toStorageDateTime(input.nextCheckAt) ?? null,
    due_at: toStorageDateTime(input.dueAt) ?? null,
    resolved_at: toStorageDateTime(input.resolvedAt) ?? null,
    resolution_summary: input.resolutionSummary ?? null,
  }

  const query = input.id
    ? supabase.from("partner_ops_issues").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_ops_issues").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return readUpdatedSupabaseWorkspace(partnerId)
}

async function upsertSupabaseActivityLog(partnerId: string, input: PartnerActivityLogInput) {
  const supabase = createSupabaseAdminClient()
  await ensureSupabaseDealOwnership(partnerId, input.dealId)
  await Promise.all([
    ensureSupabaseDocumentOwnership(partnerId, input.documentId),
    ensureSupabaseScheduleOwnership(partnerId, input.scheduleItemId),
    ensureSupabaseChecklistOwnership(partnerId, input.checklistItemId),
    ensureSupabaseIssueOwnership(partnerId, input.issueId),
  ])
  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    document_id: input.documentId ?? null,
    schedule_item_id: input.scheduleItemId ?? null,
    checklist_item_id: input.checklistItemId ?? null,
    issue_id: input.issueId ?? null,
    subject_type: input.subjectType ?? "partner",
    subject_id: input.subjectId ?? null,
    log_category: input.logCategory,
    status: input.status,
    actor_name: input.actor ?? null,
    action: input.action,
    summary: input.summary,
    details: input.details ?? null,
    next_action: input.nextAction ?? null,
    due_at: toStorageDateTime(input.dueAt) ?? null,
    occurred_at: toStorageDateTime(input.occurredAt) ?? input.occurredAt,
  }

  const query = input.id
    ? supabase.from("partner_activity_logs").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_activity_logs").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return readUpdatedSupabaseWorkspace(partnerId)
}

async function readUpdatedSupabaseWorkspace(partnerId: string): Promise<PartnerDetailResult> {
  const workspaces = await querySupabasePartnerWorkspaces(partnerId)
  const workspace = workspaces[0] ?? null

  if (!workspace) {
    throw new Error("저장 후 파트너 워크스페이스를 다시 불러오지 못했습니다.")
  }

  return {
    workspace,
    source: "supabase",
  }
}

async function syncSupabasePrimaryContactFromPartnerSummary(
  partnerId: string,
  summary: Partial<PartnerSummaryInput>,
  supabase = createSupabaseAdminClient()
) {
  if (summary.ownerName == null && summary.ownerEmail == null) return

  const { data: primaryContacts, error: primaryContactsError } = await supabase
    .from("partner_contacts")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_primary", true)
    .order("created_at", { ascending: true })
    .limit(1)
  if (primaryContactsError) throw new Error(primaryContactsError.message)

  const primaryContact = primaryContacts?.[0]
  if (primaryContact) {
    const contactPayload: Record<string, unknown> = {}
    if (summary.ownerName != null) contactPayload.name = summary.ownerName
    if (summary.ownerEmail != null) contactPayload.email = summary.ownerEmail || null

    if (Object.keys(contactPayload).length > 0) {
      const { error: contactUpdateError } = await supabase
        .from("partner_contacts")
        .update(contactPayload)
        .eq("id", primaryContact.id)
        .eq("partner_id", partnerId)
      if (contactUpdateError) throw new Error(contactUpdateError.message)
    }
    return
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("owner_name, owner_email")
    .eq("id", partnerId)
    .maybeSingle()
  if (partnerError) throw new Error(partnerError.message)

  const { error: contactInsertError } = await supabase.from("partner_contacts").insert({
    partner_id: partnerId,
    name: summary.ownerName ?? partner?.owner_name ?? "미지정 연락처",
    role: null,
    email: summary.ownerEmail != null ? summary.ownerEmail || null : partner?.owner_email ?? null,
    phone: null,
    is_primary: true,
  })
  if (contactInsertError) throw new Error(contactInsertError.message)
}

export async function listPartnerWorkspaceSummariesData(): Promise<PartnerSummaryListResult> {
  const result = await listPartnerWorkspacesData()
  return {
    summaries: result.workspaces.map(buildPartnerQueueSummary),
    source: result.source,
    warning: result.warning,
  }
}

export async function getPartnerWorkspaceShellData(id: string): Promise<PartnerShellResult> {
  const result = await getPartnerWorkspaceData(id)
  return {
    shell: result.workspace ? buildPartnerWorkspaceShell(result.workspace) : null,
    source: result.source,
    warning: result.warning,
  }
}

export async function listPartnerWorkspacesData(): Promise<PartnerListResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspaces: await listLocalPartnerWorkspaces(),
      source: "local",
      warning: "Supabase 환경변수가 없어 로컬 저장소 데이터로 표시 중입니다.",
    }
  }

  try {
    const workspaces = await querySupabasePartnerWorkspaces()
    return { workspaces, source: "supabase" }
  } catch (error) {
    // 폴백은 유지하되 서버 로그에는 반드시 남긴다 — 무음 폴백이 스키마 부재를 몇 달 숨긴 전례
    console.error("[partners-data] Supabase 파트너 목록 조회 실패 — 로컬 JSON 폴백:", error)
    return {
      workspaces: await listLocalPartnerWorkspaces(),
      source: "local",
      warning: error instanceof Error
        ? `Supabase 조회 실패로 로컬 저장소 데이터로 대체했습니다: ${error.message}`
        : "Supabase 조회 실패로 로컬 저장소 데이터로 대체했습니다.",
    }
  }
}

export async function getPartnerWorkspaceData(id: string): Promise<PartnerDetailResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await getLocalPartnerWorkspace(id),
      source: "local",
      warning: "Supabase 환경변수가 없어 로컬 저장소 데이터로 표시 중입니다.",
    }
  }

  try {
    const workspaces = await querySupabasePartnerWorkspaces(id)
    return {
      workspace: workspaces[0] ?? null,
      source: "supabase",
    }
  } catch (error) {
    console.error(`[partners-data] Supabase 파트너 상세 조회 실패(id=${id}) — 로컬 JSON 폴백:`, error)
    return {
      workspace: await getLocalPartnerWorkspace(id) ?? null,
      source: "local",
      warning: error instanceof Error
        ? `Supabase 조회 실패로 로컬 저장소 데이터로 대체했습니다: ${error.message}`
        : "Supabase 조회 실패로 로컬 저장소 데이터로 대체했습니다.",
    }
  }
}

export async function createPartnerWorkspace(summary: PartnerSummaryInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await createLocalPartner(summary),
      source: "local",
      warning: "로컬 저장소에 파트너를 생성했습니다.",
    }
  }

  const result = await createSupabasePartner(summary)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function updatePartnerSummary(id: string, summary: Partial<PartnerSummaryInput>): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await updateLocalPartner(id, summary),
      source: "local",
      warning: "로컬 저장소에 파트너 정보를 저장했습니다.",
    }
  }

  const result = await updateSupabasePartner(id, summary)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerDeal(partnerId: string, input: PartnerDealInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalDeal(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 거래를 저장했습니다.",
    }
  }

  const result = await upsertSupabaseDeal(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerContact(partnerId: string, input: PartnerContactInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalContact(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 연락처를 저장했습니다.",
    }
  }

  const result = await upsertSupabaseContact(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerDocument(partnerId: string, input: PartnerDocumentInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalDocument(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 문서를 저장했습니다.",
    }
  }

  const result = await upsertSupabaseDocument(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerSchedule(partnerId: string, input: PartnerScheduleInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalSchedule(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 일정을 저장했습니다.",
    }
  }

  const result = await upsertSupabaseSchedule(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerSales(partnerId: string, input: PartnerSalesInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalSales(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 판매 기록을 저장했습니다.",
    }
  }

  const result = await upsertSupabaseSales(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerChecklist(partnerId: string, input: PartnerChecklistInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalChecklist(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 체크리스트를 저장했습니다.",
    }
  }

  const result = await upsertSupabaseChecklist(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerIssue(partnerId: string, input: PartnerIssueInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalIssue(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 이슈를 저장했습니다.",
    }
  }

  const result = await upsertSupabaseIssue(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}

export async function upsertPartnerActivityLog(partnerId: string, input: PartnerActivityLogInput): Promise<PartnerMutationResult> {
  if (!hasPartnersSupabaseConfig()) {
    return {
      workspace: await upsertLocalActivityLog(partnerId, input),
      source: "local",
      warning: "로컬 저장소에 활동 로그를 저장했습니다.",
    }
  }

  const result = await upsertSupabaseActivityLog(partnerId, input)
  return {
    workspace: result.workspace,
    source: result.source,
    warning: result.warning,
  }
}
