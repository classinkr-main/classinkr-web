import "server-only"

import { promises as fs } from "fs"
import path from "path"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

import {
  getPartnerWorkspace as getDemoPartnerWorkspace,
  listPartnerWorkspaces as listDemoPartnerWorkspaces,
} from "./partners-demo-data"
import type {
  PartnerDataSource,
  PartnerAutomation,
  PartnerDeal,
  PartnerDealInput,
  PartnerDocument,
  PartnerDocumentInput,
  PartnerSalesInput,
  PartnerSalesRecord,
  PartnerScheduleInput,
  PartnerScheduleItem,
  PartnerSummary,
  PartnerSummaryInput,
  PartnerWorkspace,
} from "./partners-types"

const LOCAL_FILE = path.join(process.cwd(), "data", "partners-workspaces.json")
const PARTNER_STATUSES = ["lead", "active", "paused", "churn_risk"] as const
const PARTNER_CHANNELS = ["reseller", "referral", "branch", "direct"] as const
const DEAL_STAGES = ["discovery", "quoted", "contract_sent", "active", "closed_won", "closed_lost"] as const
const DOCUMENT_KINDS = ["quote", "contract", "receipt"] as const
const DOCUMENT_STATUSES = ["draft", "sent", "signed", "paid", "overdue", "archived"] as const
const SCHEDULE_KINDS = ["meeting", "follow_up", "deadline", "renewal"] as const
const SCHEDULE_STATUSES = ["planned", "completed", "canceled"] as const
const AUTOMATION_STATUSES = ["active", "paused"] as const

interface PartnerListResult {
  workspaces: PartnerWorkspace[]
  source: PartnerDataSource
  warning?: string
}

interface PartnerDetailResult {
  workspace: PartnerWorkspace | null
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
  amount: number | string | null
  issued_at: string | null
  due_at: string | null
  file_path: string | null
  external_url: string | null
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

function toNumber(value: unknown) {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatDateTime(value: string | null | undefined) {
  const text = toOptionalString(value)
  if (!text) return undefined

  const normalized = text.replace(" ", "T")
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

function toStorageDateTime(value?: string) {
  const text = toOptionalString(value)
  if (!text) return undefined

  const normalized = text.replace(" ", "T")
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (match) return `${match[1]}T${match[2]}`

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

function cloneDemoSeed() {
  return JSON.parse(JSON.stringify(listDemoPartnerWorkspaces())) as PartnerWorkspace[]
}

function asArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

function sortSchedule(items: PartnerScheduleItem[]) {
  return [...items].sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || ""))
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

function normalizeDocument(partnerId: string, document: Partial<PartnerDocument> | null | undefined): PartnerDocument {
  return {
    id: toString(document?.id) || makeId("doc"),
    partnerId: toString(document?.partnerId) || partnerId,
    dealId: toOptionalString(document?.dealId),
    kind: isEnumValue(DOCUMENT_KINDS, document?.kind) ? document.kind : "quote",
    status: isEnumValue(DOCUMENT_STATUSES, document?.status) ? document.status : "draft",
    title: toString(document?.title) || "새 문서",
    amount: document?.amount == null ? undefined : toNumber(document.amount),
    issuedAt: formatDate(document?.issuedAt),
    dueAt: formatDate(document?.dueAt),
    fileLabel: toOptionalString(document?.fileLabel) ?? "첨부 문서",
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

function normalizeWorkspace(workspace: PartnerWorkspace | Partial<PartnerWorkspace> | null | undefined): PartnerWorkspace {
  const partner = normalizePartner(workspace?.partner)
  const deals = asArray(workspace?.deals).map((deal) => normalizeDeal(partner.id, deal))
  const documents = asArray(workspace?.documents).map((document) => normalizeDocument(partner.id, document))
  const schedule = sortSchedule(asArray(workspace?.schedule).map((item) => normalizeScheduleItem(partner.id, item)))
  const sales = asArray(workspace?.sales).map((record) => normalizeSalesRecord(partner.id, record))
  const automations = asArray(workspace?.automations).map((automation) => normalizeAutomation(partner.id, automation))
  const nextActionAt = schedule.find((item) => item.status === "planned")?.startsAt

  return {
    partner: {
      ...partner,
      nextActionAt,
    },
    deals,
    documents,
    schedule,
    sales,
    automations,
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
    await fs.writeFile(LOCAL_FILE, JSON.stringify(cloneDemoSeed().map(normalizeWorkspace), null, 2), "utf-8")
  }
}

async function readLocalWorkspaces() {
  await ensureLocalWorkspaceFile()
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    const workspaces = Array.isArray(parsed) ? parsed : cloneDemoSeed()
    return workspaces.map((workspace) => normalizeWorkspace(workspace as Partial<PartnerWorkspace>))
  } catch {
    return cloneDemoSeed().map(normalizeWorkspace)
  }
}

async function writeLocalWorkspaces(workspaces: PartnerWorkspace[]) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true })
  await fs.writeFile(LOCAL_FILE, JSON.stringify(workspaces.map(normalizeWorkspace), null, 2), "utf-8")
}

async function querySupabasePartnerWorkspaces(partnerId?: string) {
  const supabase = createSupabaseAdminClient()

  const partnersQuery = supabase
    .from("partners")
    .select("id, name, status, channel, region, owner_name, owner_email, account_manager_name, tags, notes")
    .is("archived_at", null)
    .order("name", { ascending: true })

  const filteredPartnersQuery = partnerId ? partnersQuery.eq("id", partnerId) : partnersQuery
  const dealsQuery = supabase
    .from("partner_deals")
    .select("id, partner_id, title, stage, quote_amount, expected_close_at, contract_start_at, contract_end_at, sales_units, owner_name")
    .order("created_at", { ascending: false })
  const documentsQuery = supabase
    .from("partner_documents")
    .select("id, partner_id, deal_id, kind, status, title, amount, issued_at, due_at, file_path, external_url")
    .is("archived_at", null)
    .order("issued_at", { ascending: false })
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

  const filteredDealsQuery = partnerId ? dealsQuery.eq("partner_id", partnerId) : dealsQuery
  const filteredDocumentsQuery = partnerId ? documentsQuery.eq("partner_id", partnerId) : documentsQuery
  const filteredScheduleQuery = partnerId ? scheduleQuery.eq("partner_id", partnerId) : scheduleQuery
  const filteredSalesQuery = partnerId ? salesQuery.eq("partner_id", partnerId) : salesQuery
  const filteredAutomationsQuery = partnerId ? automationsQuery.eq("partner_id", partnerId) : automationsQuery

  const [
    { data: partners, error: partnersError },
    { data: deals, error: dealsError },
    { data: documents, error: documentsError },
    { data: schedule, error: scheduleError },
    { data: sales, error: salesError },
    { data: automations, error: automationsError },
  ] = await Promise.all([
    filteredPartnersQuery,
    filteredDealsQuery,
    filteredDocumentsQuery,
    filteredScheduleQuery,
    filteredSalesQuery,
    filteredAutomationsQuery,
  ])

  const firstError = partnersError ?? dealsError ?? documentsError ?? scheduleError ?? salesError ?? automationsError
  if (firstError) {
    throw new Error(firstError.message)
  }

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

  const normalizedDocuments: PartnerDocument[] = ((documents ?? []) as PartnerDocumentRow[]).map((document) => ({
    id: document.id,
    partnerId: document.partner_id,
    dealId: document.deal_id ?? undefined,
    kind: document.kind,
    status: document.status,
    title: document.title,
    amount: document.amount == null ? undefined : toNumber(document.amount),
    issuedAt: formatDate(document.issued_at),
    dueAt: formatDate(document.due_at),
    fileLabel: document.file_path ?? document.external_url ?? "첨부 문서",
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
    name: automation.name,
    status: automation.status,
    trigger: automation.trigger_type,
    action: automation.action_type,
    destination: automation.destination ?? "미지정",
    lastRunAt: formatDateTime(automation.last_run_at),
    nextRunAt: formatDateTime(automation.next_run_at),
  }))

  const dealsByPartner = groupByPartner(normalizedDeals)
  const documentsByPartner = groupByPartner(normalizedDocuments)
  const scheduleByPartner = groupByPartner(normalizedSchedule)
  const salesByPartner = groupByPartner(normalizedSales)
  const automationsByPartner = groupByPartner(normalizedAutomations)

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
      deals: dealsByPartner[partner.id] ?? [],
      documents: documentsByPartner[partner.id] ?? [],
      schedule: scheduleByPartner[partner.id] ?? [],
      sales: salesByPartner[partner.id] ?? [],
      automations: automationsByPartner[partner.id] ?? [],
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
  })
  workspaces.unshift(workspace)
  await writeLocalWorkspaces(workspaces)
  return workspace
}

async function updateLocalPartner(id: string, summary: Partial<PartnerSummaryInput>) {
  const workspaces = await readLocalWorkspaces()
  const index = workspaces.findIndex((workspace) => workspace.partner.id === id)
  if (index < 0) return null

  const current = workspaces[index]
  workspaces[index] = normalizeWorkspace({
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
  return getPartnerWorkspaceData(data.id)
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
  return getPartnerWorkspaceData(id)
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
  return getPartnerWorkspaceData(partnerId)
}

async function upsertSupabaseDocument(partnerId: string, input: PartnerDocumentInput) {
  const supabase = createSupabaseAdminClient()
  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    kind: input.kind,
    status: input.status,
    title: input.title,
    amount: input.amount ?? null,
    issued_at: input.issuedAt ?? null,
    due_at: input.dueAt ?? null,
    file_path: input.fileLabel,
    external_url: null,
  }

  const query = input.id
    ? supabase.from("partner_documents").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_documents").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return getPartnerWorkspaceData(partnerId)
}

async function upsertSupabaseSchedule(partnerId: string, input: PartnerScheduleInput) {
  const supabase = createSupabaseAdminClient()
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
  return getPartnerWorkspaceData(partnerId)
}

async function upsertSupabaseSales(partnerId: string, input: PartnerSalesInput) {
  const supabase = createSupabaseAdminClient()
  const payload = {
    partner_id: partnerId,
    deal_id: input.dealId ?? null,
    sales_month: input.salesMonth,
    units_sold: input.unitsSold,
    gross_amount: input.grossAmount,
    net_amount: input.netAmount,
  }

  const query = input.id
    ? supabase.from("partner_sales_records").update(payload).eq("id", input.id).eq("partner_id", partnerId)
    : supabase.from("partner_sales_records").insert(payload)

  const { error } = await query
  if (error) throw new Error(error.message)
  return getPartnerWorkspaceData(partnerId)
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
    return {
      workspace: await getLocalPartnerWorkspace(id) ?? getDemoPartnerWorkspace(id) ?? null,
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

  try {
    const result = await createSupabasePartner(summary)
    return {
      workspace: result.workspace,
      source: result.source,
      warning: result.warning,
    }
  } catch (error) {
    return {
      workspace: await createLocalPartner(summary),
      source: "local",
      warning: error instanceof Error
        ? `Supabase 저장 실패로 로컬 저장소에 생성했습니다: ${error.message}`
        : "Supabase 저장 실패로 로컬 저장소에 생성했습니다.",
    }
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

  try {
    const result = await updateSupabasePartner(id, summary)
    return {
      workspace: result.workspace,
      source: result.source,
      warning: result.warning,
    }
  } catch (error) {
    return {
      workspace: await updateLocalPartner(id, summary),
      source: "local",
      warning: error instanceof Error
        ? `Supabase 저장 실패로 로컬 저장소에 반영했습니다: ${error.message}`
        : "Supabase 저장 실패로 로컬 저장소에 반영했습니다.",
    }
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

  try {
    const result = await upsertSupabaseDeal(partnerId, input)
    return {
      workspace: result.workspace,
      source: result.source,
      warning: result.warning,
    }
  } catch (error) {
    return {
      workspace: await upsertLocalDeal(partnerId, input),
      source: "local",
      warning: error instanceof Error
        ? `Supabase 저장 실패로 로컬 저장소에 거래를 반영했습니다: ${error.message}`
        : "Supabase 저장 실패로 로컬 저장소에 거래를 반영했습니다.",
    }
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

  try {
    const result = await upsertSupabaseDocument(partnerId, input)
    return {
      workspace: result.workspace,
      source: result.source,
      warning: result.warning,
    }
  } catch (error) {
    return {
      workspace: await upsertLocalDocument(partnerId, input),
      source: "local",
      warning: error instanceof Error
        ? `Supabase 저장 실패로 로컬 저장소에 문서를 반영했습니다: ${error.message}`
        : "Supabase 저장 실패로 로컬 저장소에 문서를 반영했습니다.",
    }
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

  try {
    const result = await upsertSupabaseSchedule(partnerId, input)
    return {
      workspace: result.workspace,
      source: result.source,
      warning: result.warning,
    }
  } catch (error) {
    return {
      workspace: await upsertLocalSchedule(partnerId, input),
      source: "local",
      warning: error instanceof Error
        ? `Supabase 저장 실패로 로컬 저장소에 일정을 반영했습니다: ${error.message}`
        : "Supabase 저장 실패로 로컬 저장소에 일정을 반영했습니다.",
    }
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

  try {
    const result = await upsertSupabaseSales(partnerId, input)
    return {
      workspace: result.workspace,
      source: result.source,
      warning: result.warning,
    }
  } catch (error) {
    return {
      workspace: await upsertLocalSales(partnerId, input),
      source: "local",
      warning: error instanceof Error
        ? `Supabase 저장 실패로 로컬 저장소에 판매 기록을 반영했습니다: ${error.message}`
        : "Supabase 저장 실패로 로컬 저장소에 판매 기록을 반영했습니다.",
    }
  }
}
