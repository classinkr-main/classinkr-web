import "server-only"

import { createHash } from "crypto"

import { normalizeCrmName } from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type ExternalCrmSyncTrigger = "manual" | "cron" | "import"

interface XiaoshouyiObjectConfig {
  objectApiKey: string
  fields: string[]
  displayNameFields: string[]
  orderBy?: string
  whereClause?: string | null
  ownerFields?: string[]
  statusFields?: string[]
  amountFields?: string[]
  occurredAtFields?: string[]
  pageSize?: number
  maxPages?: number
  syncPriority?: number
  catalogSource?: "database" | "runtime"
}

interface XiaoshouyiConfig {
  baseUrl: string
  accessToken?: string
  clientId?: string
  clientSecret?: string
  username?: string
  password?: string
}

interface ExternalRecordRow {
  source_system: "xiaoshouyi"
  object_api_key: string
  external_id: string
  normalized_name: string | null
  display_name: string | null
  owner_name: string | null
  status: string | null
  amount: number | null
  occurred_at: string | null
  payload: Record<string, unknown>
  payload_hash: string
  synced_at: string
  last_seen_run_id: string
  is_stale: boolean
  stale_at: null
}

interface XiaoshouyiQueryCatalogRow {
  object_api_key: string
  fields: string[]
  where_clause: string | null
  order_by: string
  page_size: number
  max_pages: number
  sync_priority: number
  metadata: Record<string, unknown> | null
}

export interface ExternalCrmSyncObjectResult {
  objectApiKey: string
  status: "success" | "failed" | "skipped"
  rowsScanned: number
  rowsUpserted: number
  pagesScanned?: number
  staleMarked?: number
  cursorValue?: string
  error?: string
}

export interface ExternalCrmSyncResult {
  ok: boolean
  skipped?: boolean
  objects: ExternalCrmSyncObjectResult[]
  error?: string
}

export interface ExternalCrmSyncPreflightObject {
  objectApiKey: string
  fields: string[]
  orderBy: string
  whereClause?: string | null
  pageSize?: number
  maxPages?: number
  syncPriority?: number
  catalogSource?: "database" | "runtime"
}

export interface ExternalCrmSyncPreflight {
  configured: boolean
  hasBaseUrl: boolean
  hasAccessToken: boolean
  hasServiceCredentials: boolean
  authMode: "access_token" | "service_oauth" | "missing"
  missingEnvGroups: string[]
  pageSize: number
  maxPages: number
  objects: ExternalCrmSyncPreflightObject[]
}

export interface ExternalCrmSyncSchemaCheck {
  key: string
  label: string
  ok: boolean
  detail: string
  action?: string
}

export interface ExternalCrmSyncSchemaReadiness {
  ok: boolean
  checks: ExternalCrmSyncSchemaCheck[]
  error?: string
}

const DEFAULT_SYNC_PAGE_SIZE = 100
const DEFAULT_SYNC_MAX_PAGES = 20
const MAX_SYNC_PAGE_SIZE = 100

const DEFAULT_OBJECTS: XiaoshouyiObjectConfig[] = [
  {
    objectApiKey: "account",
    fields: ["id", "accountName", "ownerId", "entityType", "phone", "createdAt", "updatedAt"],
    displayNameFields: ["accountName", "name"],
    ownerFields: ["ownerName", "ownerId-label", "ownerId"],
    statusFields: ["status", "entityType-label", "entityType"],
    occurredAtFields: ["updatedAt", "createdAt"],
  },
  {
    objectApiKey: "contact",
    fields: ["id", "contactName", "mobile", "accountId", "ownerId", "createdAt", "updatedAt"],
    displayNameFields: ["contactName", "name"],
    ownerFields: ["ownerName", "ownerId-label", "ownerId"],
    occurredAtFields: ["updatedAt", "createdAt"],
  },
  {
    objectApiKey: "opportunity",
    fields: ["id", "opportunityName", "money", "ownerId", "accountId", "saleStageId", "closeDate", "createdAt", "updatedAt"],
    displayNameFields: ["opportunityName", "name"],
    ownerFields: ["ownerName", "ownerId-label", "ownerId"],
    statusFields: ["saleStageId-label", "saleStageId", "status"],
    amountFields: ["money", "amount"],
    occurredAtFields: ["closeDate", "updatedAt", "createdAt"],
  },
  {
    objectApiKey: "ShroffAccount__c",
    fields: [
      "id",
      "name",
      "uid__c",
      "schoolName__c",
      "Account__c",
      "expireTime__c",
      "currency__c",
      "CurrencyAmount__c",
      "PersonHourMargin__c",
      "serviceState__c",
      "ServiceStatus__c",
      "LastClassDate__c",
      "createdAt",
      "updatedAt",
    ],
    displayNameFields: ["schoolName__c", "name", "uid__c"],
    statusFields: ["ServiceStatus__c", "serviceState__c"],
    amountFields: ["CurrencyAmount__c", "currency__c"],
    occurredAtFields: ["expireTime__c", "LastClassDate__c", "updatedAt", "createdAt"],
  },
  {
    objectApiKey: "Collection__c",
    fields: [
      "id",
      "name",
      "ownerId",
      "Amount__c",
      "ActualTime__c",
      "CollectionDate__c",
      "approvalStatus",
      "Contract__c",
      "orderAccountId__c",
      "createdAt",
      "updatedAt",
    ],
    displayNameFields: ["name"],
    ownerFields: ["ownerName", "ownerId-label", "ownerId"],
    statusFields: ["approvalStatus-label", "approvalStatus"],
    amountFields: ["Amount__c"],
    occurredAtFields: ["ActualTime__c", "CollectionDate__c", "updatedAt", "createdAt"],
  },
  {
    objectApiKey: "SalesPerformance__c",
    fields: [
      "id",
      "name",
      "amount_Collected__c",
      "GetDate__c",
      "type__c",
      "product_famliy__c",
      "new_or_addon__c",
      "Account__c",
      "ShroffAccount__c",
      "IsCheckedOver__c",
      "AccountGet__c",
      "ownerId",
      "createdAt",
      "updatedAt",
    ],
    displayNameFields: ["name", "Account__c-label", "ShroffAccount__c-label"],
    ownerFields: ["ownerName", "ownerId-label", "ownerId"],
    statusFields: ["type__c-label", "type__c", "new_or_addon__c-label", "new_or_addon__c"],
    amountFields: ["amount_Collected__c"],
    occurredAtFields: ["GetDate__c", "updatedAt", "createdAt"],
  },
  {
    objectApiKey: "CollectionPlan__c",
    fields: [
      "id",
      "name",
      "EstimatedTime__c",
      "collectStatus__c",
      "Amount__c",
      "accountId",
      "ownerId",
      "createdAt",
      "updatedAt",
    ],
    displayNameFields: ["name", "accountId-label"],
    ownerFields: ["ownerName", "ownerId-label", "ownerId"],
    statusFields: ["collectStatus__c-label", "collectStatus__c"],
    amountFields: ["Amount__c"],
    occurredAtFields: ["EstimatedTime__c", "updatedAt", "createdAt"],
  },
  {
    objectApiKey: "FinancialInformation__c",
    fields: [
      "id",
      "ShroffAccInfor__c",
      "currency__c",
      "AmountReal__c",
      "GetDate__c",
      "orderType__c",
      "PaymentType__c",
      "orderId__c",
      "ServiceVersion__c",
      "newType__c",
      "refunded__c",
      "createdAt",
      "updatedAt",
    ],
    displayNameFields: ["ShroffAccInfor__c-label", "orderId__c"],
    statusFields: ["orderType__c-label", "orderType__c", "PaymentType__c-label", "PaymentType__c"],
    amountFields: ["AmountReal__c", "currency__c"],
    occurredAtFields: ["GetDate__c", "updatedAt", "createdAt"],
  },
  {
    objectApiKey: "ResourceInformation__c",
    fields: [
      "id",
      "ShroffAccount__c",
      "ChangeType__c",
      "ChangeCause__c",
      "ChangeDetail__c",
      "ChangeNumber__c",
      "ChangeTime__c",
      "Margin__c",
      "ServiceType__c",
      "Amount__c",
      "createdAt",
      "updatedAt",
    ],
    displayNameFields: ["ShroffAccount__c-label", "ChangeDetail__c"],
    statusFields: ["ChangeType__c-label", "ChangeType__c", "ServiceType__c-label", "ServiceType__c"],
    amountFields: ["Amount__c", "ChangeNumber__c"],
    occurredAtFields: ["ChangeTime__c", "updatedAt", "createdAt"],
  },
]

function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : null
}

function getXiaoshouyiConfig(): XiaoshouyiConfig | null {
  const baseUrl =
    readEnv("XIAOSHOUYI_BASE_URL") ??
    readEnv("XIAOSHOUYI_API_BASE_URL") ??
    readEnv("XIAOSHOUYI_API_URL") ??
    readEnv("COMPANY_CRM_API_URL") ??
    readEnv("CRM_API_URL")

  if (!baseUrl) return null

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    accessToken: readEnv("XIAOSHOUYI_ACCESS_TOKEN") ?? readEnv("XIAOSHOUYI_SERVICE_ACCESS_TOKEN") ?? undefined,
    clientId: readEnv("XIAOSHOUYI_CLIENT_ID") ?? undefined,
    clientSecret: readEnv("XIAOSHOUYI_CLIENT_SECRET") ?? undefined,
    username: readEnv("XIAOSHOUYI_USERNAME") ?? readEnv("XIAOSHOUYI_SERVICE_USERNAME") ?? undefined,
    password: readEnv("XIAOSHOUYI_PASSWORD") ?? readEnv("XIAOSHOUYI_SERVICE_PASSWORD") ?? undefined,
  }
}

function getSelectedObjects() {
  const selected = getSelectedObjectKeys()

  if (!selected?.length) return DEFAULT_OBJECTS

  return selected.map((objectApiKey) => {
    return getKnownObjectConfig(objectApiKey) ?? getGenericObjectConfig(objectApiKey)
  })
}

function getSelectedObjectKeys() {
  return readEnv("XIAOSHOUYI_SYNC_OBJECTS")
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function getKnownObjectConfig(objectApiKey: string) {
  return DEFAULT_OBJECTS.find((item) => item.objectApiKey === objectApiKey) ?? null
}

function getGenericObjectConfig(objectApiKey: string): XiaoshouyiObjectConfig {
  return {
    objectApiKey,
    fields: ["id", "name", "createdAt", "updatedAt"],
    displayNameFields: ["name"],
    occurredAtFields: ["updatedAt", "createdAt"],
    catalogSource: "runtime",
  }
}

function getSyncPageSize() {
  const parsed = Number(readEnv("XIAOSHOUYI_SYNC_PAGE_SIZE") ?? readEnv("XIAOSHOUYI_SYNC_LIMIT"))
  if (!Number.isFinite(parsed)) return DEFAULT_SYNC_PAGE_SIZE
  return Math.min(MAX_SYNC_PAGE_SIZE, Math.max(1, Math.floor(parsed)))
}

function getSyncMaxPages() {
  const parsed = Number(readEnv("XIAOSHOUYI_SYNC_MAX_PAGES"))
  if (!Number.isFinite(parsed)) return DEFAULT_SYNC_MAX_PAGES
  return Math.min(200, Math.max(1, Math.floor(parsed)))
}

function getMetadataStringArray(metadata: Record<string, unknown>, key: string, fallback: string[] = []) {
  const value = metadata[key]
  if (!Array.isArray(value)) return fallback
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
  return items.length > 0 ? items : fallback
}

function toCatalogObjectConfig(row: XiaoshouyiQueryCatalogRow): XiaoshouyiObjectConfig {
  const known = getKnownObjectConfig(row.object_api_key)
  const metadata = row.metadata ?? {}
  return {
    objectApiKey: row.object_api_key,
    fields: row.fields.length > 0 ? row.fields : known?.fields ?? ["id", "name", "createdAt", "updatedAt"],
    displayNameFields: getMetadataStringArray(metadata, "displayNameFields", known?.displayNameFields ?? ["name"]),
    orderBy: row.order_by,
    whereClause: row.where_clause,
    ownerFields: getMetadataStringArray(metadata, "ownerFields", known?.ownerFields ?? []),
    statusFields: getMetadataStringArray(metadata, "statusFields", known?.statusFields ?? []),
    amountFields: getMetadataStringArray(metadata, "amountFields", known?.amountFields ?? []),
    occurredAtFields: getMetadataStringArray(metadata, "occurredAtFields", known?.occurredAtFields ?? ["updatedAt", "createdAt"]),
    pageSize: Math.min(MAX_SYNC_PAGE_SIZE, Math.max(1, Math.floor(Number(row.page_size) || DEFAULT_SYNC_PAGE_SIZE))),
    maxPages: Math.min(200, Math.max(1, Math.floor(Number(row.max_pages) || DEFAULT_SYNC_MAX_PAGES))),
    syncPriority: Math.max(1, Math.floor(Number(row.sync_priority) || 100)),
    catalogSource: "database",
  }
}

async function getRuntimeSelectedObjects(): Promise<XiaoshouyiObjectConfig[]> {
  const selected = getSelectedObjectKeys()
  const sb = createSupabaseAdminClient()
  const query = sb
    .from("crm_xiaoshouyi_query_catalog")
    .select("object_api_key, fields, where_clause, order_by, page_size, max_pages, sync_priority, metadata")
    .eq("is_default_enabled", true)
    .order("sync_priority", { ascending: true })
    .limit(50)

  const result = selected?.length ? await query.in("object_api_key", selected) : await query

  if (result.error || !result.data?.length) {
    return getSelectedObjects().map((object, index) => ({
      ...object,
      pageSize: getSyncPageSize(),
      maxPages: getSyncMaxPages(),
      syncPriority: (index + 1) * 10,
      catalogSource: "runtime",
    }))
  }

  const catalogObjects = (result.data as unknown as XiaoshouyiQueryCatalogRow[]).map(toCatalogObjectConfig)
  if (!selected?.length) return catalogObjects

  const found = new Set(catalogObjects.map((object) => object.objectApiKey))
  const missing = selected
    .filter((objectApiKey) => !found.has(objectApiKey))
    .map((objectApiKey, index) => ({
      ...(getKnownObjectConfig(objectApiKey) ?? getGenericObjectConfig(objectApiKey)),
      pageSize: getSyncPageSize(),
      maxPages: getSyncMaxPages(),
      syncPriority: 1000 + index,
      catalogSource: "runtime" as const,
    }))

  return [...catalogObjects, ...missing]
}

export function getXiaoshouyiSyncPreflight(): ExternalCrmSyncPreflight {
  const hasBaseUrl = Boolean(
    readEnv("XIAOSHOUYI_BASE_URL") ??
      readEnv("XIAOSHOUYI_API_BASE_URL") ??
      readEnv("XIAOSHOUYI_API_URL") ??
      readEnv("COMPANY_CRM_API_URL") ??
      readEnv("CRM_API_URL")
  )
  const hasAccessToken = Boolean(readEnv("XIAOSHOUYI_ACCESS_TOKEN") ?? readEnv("XIAOSHOUYI_SERVICE_ACCESS_TOKEN"))
  const hasServiceCredentials = Boolean(
    readEnv("XIAOSHOUYI_CLIENT_ID") &&
      readEnv("XIAOSHOUYI_CLIENT_SECRET") &&
      (readEnv("XIAOSHOUYI_USERNAME") || readEnv("XIAOSHOUYI_SERVICE_USERNAME")) &&
      (readEnv("XIAOSHOUYI_PASSWORD") || readEnv("XIAOSHOUYI_SERVICE_PASSWORD"))
  )
  const missingEnvGroups: string[] = []
  if (!hasBaseUrl) missingEnvGroups.push("XIAOSHOUYI_BASE_URL")
  if (!hasAccessToken && !hasServiceCredentials) {
    missingEnvGroups.push("XIAOSHOUYI_ACCESS_TOKEN 또는 service OAuth credentials")
  }

  const pageSize = getSyncPageSize()
  const maxPages = getSyncMaxPages()
  const objects = getSelectedObjects().map((object) => ({
    objectApiKey: object.objectApiKey,
    fields: object.fields,
    orderBy: object.orderBy ?? (object.fields.includes("updatedAt") ? "updatedAt DESC" : "id DESC"),
  }))

  return {
    configured: hasBaseUrl && (hasAccessToken || hasServiceCredentials),
    hasBaseUrl,
    hasAccessToken,
    hasServiceCredentials,
    authMode: hasAccessToken ? "access_token" : hasServiceCredentials ? "service_oauth" : "missing",
    missingEnvGroups,
    pageSize,
    maxPages,
    objects,
  }
}

export async function getXiaoshouyiSyncRuntimePreflight(): Promise<ExternalCrmSyncPreflight> {
  const base = getXiaoshouyiSyncPreflight()
  const objects = await getRuntimeSelectedObjects()

  return {
    ...base,
    objects: objects.map((object) => ({
      objectApiKey: object.objectApiKey,
      fields: object.fields,
      orderBy: object.orderBy ?? (object.fields.includes("updatedAt") ? "updatedAt DESC" : "id DESC"),
      whereClause: object.whereClause ?? null,
      pageSize: object.pageSize ?? base.pageSize,
      maxPages: object.maxPages ?? base.maxPages,
      syncPriority: object.syncPriority,
      catalogSource: object.catalogSource ?? "runtime",
    })),
  }
}

function getRecordArray(payload: unknown): Array<Record<string, unknown>> {
  const value = payload as {
    result?: { records?: unknown }
    data?: { records?: unknown } | unknown
    records?: unknown
  }
  const records =
    value.result?.records ??
    (value.data as { records?: unknown } | undefined)?.records ??
    value.records

  return Array.isArray(records) ? records.filter((record): record is Record<string, unknown> => Boolean(record && typeof record === "object")) : []
}

function formatSupabaseError(error: { code?: string; details?: string; hint?: string; message?: string } | null) {
  if (!error) return "unknown database error"
  const parts = [error.message, error.details, error.hint, error.code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.join(" · ") || "unknown database error"
}

async function checkSyncSchemaShape(
  key: string,
  label: string,
  promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  okDetail: string,
  action: string
): Promise<ExternalCrmSyncSchemaCheck> {
  const { error } = await promise
  if (error) {
    return {
      key,
      label,
      ok: false,
      detail: formatSupabaseError(error),
      action,
    }
  }

  return {
    key,
    label,
    ok: true,
    detail: okDetail,
  }
}

export async function getXiaoshouyiSyncSchemaReadiness(): Promise<ExternalCrmSyncSchemaReadiness> {
  const sb = createSupabaseAdminClient()
  const checks = await Promise.all([
    checkSyncSchemaShape(
      "external_crm_sync_runs",
      "외부 CRM sync run schema",
      sb
        .from("external_crm_sync_runs")
        .select(
          [
            "id",
            "source_system",
            "object_api_key",
            "status",
            "trigger",
            "started_at",
            "finished_at",
            "rows_scanned",
            "rows_upserted",
            "cursor_value",
            "error",
            "metadata",
            "created_at",
            "updated_at",
          ].join(", ")
        )
        .limit(1),
      "sync run runtime column contract 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_external_crm_snapshots.sql 적용"
    ),
    checkSyncSchemaShape(
      "external_crm_records",
      "외부 CRM snapshot schema",
      sb
        .from("external_crm_records")
        .select(
          [
            "id",
            "source_system",
            "object_api_key",
            "external_id",
            "normalized_name",
            "display_name",
            "owner_name",
            "status",
            "amount",
            "occurred_at",
            "payload",
            "payload_hash",
            "synced_at",
            "last_seen_run_id",
            "is_stale",
            "stale_at",
            "created_at",
            "updated_at",
          ].join(", ")
        )
        .limit(1),
      "snapshot runtime/stale tracking column contract 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_external_crm_snapshots.sql 이후 supabase/migrations/20260610_external_crm_stale_tracking.sql 적용"
    ),
  ])
  const failed = checks.filter((check) => !check.ok)

  return {
    ok: failed.length === 0,
    checks,
    error: failed.length > 0 ? failed.map((check) => `${check.label}: ${check.detail}`).join("; ") : undefined,
  }
}

function firstString(record: Record<string, unknown>, keys: string[] = []) {
  for (const key of keys) {
    const value = record[key]
    if (value == null || value === "") continue
    return String(value)
  }
  return null
}

function firstNumber(record: Record<string, unknown>, keys: string[] = []) {
  for (const key of keys) {
    const value = record[key]
    if (value == null || value === "") continue
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return null
}

function normalizeExternalDate(value: unknown): string | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null
  const date = numeric == null ? new Date(String(value)) : new Date(numeric)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function firstDate(record: Record<string, unknown>, keys: string[] = []) {
  for (const key of keys) {
    const value = normalizeExternalDate(record[key])
    if (value) return value
  }
  return null
}

function hashPayload(record: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex")
}

async function getAccessToken(config: XiaoshouyiConfig) {
  if (config.accessToken) return config.accessToken
  if (!config.clientId || !config.clientSecret || !config.username || !config.password) return null

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    username: config.username,
    password: config.password,
  })

  const response = await fetch(`${config.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!response.ok) {
    throw new Error(`Xiaoshouyi token request failed: ${response.status}`)
  }

  const payload = (await response.json()) as { access_token?: unknown }
  return typeof payload.access_token === "string" ? payload.access_token : null
}

async function queryXiaoshouyiRecords(
  config: XiaoshouyiConfig,
  token: string,
  object: XiaoshouyiObjectConfig,
  pageSize: number,
  offset: number
) {
  const orderBy = object.orderBy ?? (object.fields.includes("updatedAt") ? "updatedAt DESC" : "id DESC")
  const whereClause = object.whereClause?.trim()
  const whereSql = whereClause ? ` WHERE ${whereClause}` : ""
  const query = `SELECT ${object.fields.join(",")} FROM ${object.objectApiKey}${whereSql} ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${offset}`
  const url = new URL(`${config.baseUrl}/rest/data/v2/query`)
  url.searchParams.set("q", query)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Xiaoshouyi query failed (${object.objectApiKey}): ${response.status} ${body.slice(0, 200)}`)
  }

  return getRecordArray(await response.json())
}

function toExternalRecord(
  object: XiaoshouyiObjectConfig,
  record: Record<string, unknown>,
  syncedAt: string,
  runId: string
): ExternalRecordRow | null {
  const externalId = record.id == null ? null : String(record.id)
  if (!externalId) return null

  const displayName = firstString(record, object.displayNameFields)

  return {
    source_system: "xiaoshouyi",
    object_api_key: object.objectApiKey,
    external_id: externalId,
    normalized_name: displayName ? normalizeCrmName(displayName) : null,
    display_name: displayName,
    owner_name: firstString(record, object.ownerFields),
    status: firstString(record, object.statusFields),
    amount: firstNumber(record, object.amountFields),
    occurred_at: firstDate(record, object.occurredAtFields),
    payload: record,
    payload_hash: hashPayload(record),
    synced_at: syncedAt,
    last_seen_run_id: runId,
    is_stale: false,
    stale_at: null,
  }
}

async function createRun(objectApiKey: string, trigger: ExternalCrmSyncTrigger, status: "running" | "skipped" = "running", error?: string) {
  const sb = createSupabaseAdminClient()
  const now = new Date().toISOString()
  const { data, error: insertError } = await sb
    .from("external_crm_sync_runs")
    .insert({
      source_system: "xiaoshouyi",
      object_api_key: objectApiKey,
      trigger,
      status,
      started_at: now,
      finished_at: status === "skipped" ? now : null,
      error: error ?? null,
    })
    .select("id")
    .single()

  if (insertError) throw insertError
  return data.id as string
}

async function finishRun(
  id: string,
  patch: {
    status: "success" | "failed"
    rowsScanned?: number
    rowsUpserted?: number
    cursorValue?: string
    error?: string
    metadata?: Record<string, unknown>
  }
) {
  const sb = createSupabaseAdminClient()
  const { error } = await sb
    .from("external_crm_sync_runs")
    .update({
      status: patch.status,
      finished_at: new Date().toISOString(),
      rows_scanned: patch.rowsScanned ?? null,
      rows_upserted: patch.rowsUpserted ?? null,
      cursor_value: patch.cursorValue ?? null,
      error: patch.error ?? null,
      metadata: patch.metadata ?? {},
    })
    .eq("id", id)

  if (error) throw error
}

export async function syncXiaoshouyiSnapshots(trigger: ExternalCrmSyncTrigger = "manual"): Promise<ExternalCrmSyncResult> {
  const schema = await getXiaoshouyiSyncSchemaReadiness()
  if (!schema.ok) {
    const message = `Xiaoshouyi sync schema is not ready: ${schema.error ?? "unknown schema issue"}`
    return {
      ok: false,
      skipped: true,
      error: message,
      objects: [{ objectApiKey: "all", status: "skipped", rowsScanned: 0, rowsUpserted: 0, error: message }],
    }
  }

  const config = getXiaoshouyiConfig()
  if (!config) {
    await createRun("all", trigger, "skipped", "Missing Xiaoshouyi base URL")
    return {
      ok: true,
      skipped: true,
      objects: [{ objectApiKey: "all", status: "skipped", rowsScanned: 0, rowsUpserted: 0, error: "Missing Xiaoshouyi base URL" }],
    }
  }

  const token = await getAccessToken(config)
  if (!token) {
    await createRun("all", trigger, "skipped", "Missing Xiaoshouyi access token or service credentials")
    return {
      ok: true,
      skipped: true,
      objects: [{ objectApiKey: "all", status: "skipped", rowsScanned: 0, rowsUpserted: 0, error: "Missing Xiaoshouyi access token or service credentials" }],
    }
  }

  const results: ExternalCrmSyncObjectResult[] = []
  const runtimeObjects = await getRuntimeSelectedObjects()

  for (const object of runtimeObjects) {
    const runId = await createRun(object.objectApiKey, trigger)
    try {
      const syncedAt = new Date().toISOString()
      let rowsScanned = 0
      let rowsUpserted = 0
      let pagesScanned = 0
      let nextOffset = 0
      let truncated = false
      const sb = createSupabaseAdminClient()
      const pageSize = object.pageSize ?? getSyncPageSize()
      const maxPages = object.maxPages ?? getSyncMaxPages()

      for (let page = 0; page < maxPages; page += 1) {
        const offset = page * pageSize
        const records = await queryXiaoshouyiRecords(config, token, object, pageSize, offset)
        pagesScanned += 1
        rowsScanned += records.length
        nextOffset = offset + records.length

        const rows = records
          .map((record) => toExternalRecord(object, record, syncedAt, runId))
          .filter((row): row is ExternalRecordRow => Boolean(row))

        if (rows.length > 0) {
          const { data, error } = await sb
            .from("external_crm_records")
            .upsert(rows, { onConflict: "source_system,object_api_key,external_id" })
            .select("id")

          if (error) throw error
          rowsUpserted += data?.length ?? rows.length
        }

        if (records.length < pageSize) {
          truncated = false
          break
        }

        truncated = page === maxPages - 1
      }

      const { data: staleRows, error: staleError } = await sb
        .from("external_crm_records")
        .update({
          is_stale: true,
          stale_at: syncedAt,
        })
        .eq("source_system", "xiaoshouyi")
        .eq("object_api_key", object.objectApiKey)
        .or(`last_seen_run_id.is.null,last_seen_run_id.neq.${runId}`)
        .eq("is_stale", false)
        .select("id")

      if (staleError) throw staleError

      const cursorValue = truncated ? `offset:${nextOffset}` : "complete"
      await finishRun(runId, {
        status: "success",
        rowsScanned,
        rowsUpserted,
        cursorValue,
        metadata: {
          pageSize,
          maxPages,
          pagesScanned,
          truncated,
          staleMarked: staleRows?.length ?? 0,
          orderBy: object.orderBy ?? (object.fields.includes("updatedAt") ? "updatedAt DESC" : "id DESC"),
          whereClause: object.whereClause ?? null,
          catalogSource: object.catalogSource ?? "runtime",
          syncPriority: object.syncPriority ?? null,
        },
      })
      results.push({
        objectApiKey: object.objectApiKey,
        status: "success",
        rowsScanned,
        rowsUpserted,
        pagesScanned,
        staleMarked: staleRows?.length ?? 0,
        cursorValue,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await finishRun(runId, {
        status: "failed",
        error: message,
        rowsScanned: 0,
        rowsUpserted: 0,
        metadata: {
          pageSize: object.pageSize ?? getSyncPageSize(),
          maxPages: object.maxPages ?? getSyncMaxPages(),
          catalogSource: object.catalogSource ?? "runtime",
        },
      })
      results.push({ objectApiKey: object.objectApiKey, status: "failed", rowsScanned: 0, rowsUpserted: 0, error: message })
    }
  }

  const ok = results.every((result) => result.status === "success")
  return { ok, objects: results, error: ok ? undefined : "One or more Xiaoshouyi objects failed to sync" }
}
