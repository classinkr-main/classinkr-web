import "server-only"

import { createHash } from "crypto"

import { normalizeCrmName } from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type ExternalCrmSyncTrigger = "manual" | "cron" | "import"

interface XiaoshouyiObjectConfig {
  objectApiKey: string
  fields: string[]
  displayNameFields: string[]
  ownerFields?: string[]
  statusFields?: string[]
  amountFields?: string[]
  occurredAtFields?: string[]
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
}

export interface ExternalCrmSyncObjectResult {
  objectApiKey: string
  status: "success" | "failed" | "skipped"
  rowsScanned: number
  rowsUpserted: number
  error?: string
}

export interface ExternalCrmSyncResult {
  ok: boolean
  skipped?: boolean
  objects: ExternalCrmSyncObjectResult[]
  error?: string
}

const DEFAULT_SYNC_LIMIT = 100

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
    fields: ["id", "name", "ownerId", "createdAt", "updatedAt"],
    displayNameFields: ["name"],
    ownerFields: ["ownerName", "ownerId-label", "ownerId"],
    amountFields: ["amount", "money", "Amount__c", "CollectionAmount__c"],
    occurredAtFields: ["GetDate__c", "updatedAt", "createdAt"],
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
  const selected = readEnv("XIAOSHOUYI_SYNC_OBJECTS")
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (!selected?.length) return DEFAULT_OBJECTS

  return selected.map((objectApiKey) => {
    const known = DEFAULT_OBJECTS.find((item) => item.objectApiKey === objectApiKey)
    return known ?? {
      objectApiKey,
      fields: ["id", "name", "createdAt", "updatedAt"],
      displayNameFields: ["name"],
      occurredAtFields: ["updatedAt", "createdAt"],
    }
  })
}

function getSyncLimit() {
  const parsed = Number(readEnv("XIAOSHOUYI_SYNC_LIMIT"))
  if (!Number.isFinite(parsed)) return DEFAULT_SYNC_LIMIT
  return Math.min(200, Math.max(1, Math.floor(parsed)))
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

async function queryXiaoshouyiRecords(config: XiaoshouyiConfig, token: string, object: XiaoshouyiObjectConfig) {
  const limit = getSyncLimit()
  const query = `SELECT ${object.fields.join(",")} FROM ${object.objectApiKey} LIMIT ${limit}`
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

function toExternalRecord(object: XiaoshouyiObjectConfig, record: Record<string, unknown>, syncedAt: string): ExternalRecordRow | null {
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

async function finishRun(id: string, patch: { status: "success" | "failed"; rowsScanned?: number; rowsUpserted?: number; error?: string }) {
  const sb = createSupabaseAdminClient()
  const { error } = await sb
    .from("external_crm_sync_runs")
    .update({
      status: patch.status,
      finished_at: new Date().toISOString(),
      rows_scanned: patch.rowsScanned ?? null,
      rows_upserted: patch.rowsUpserted ?? null,
      error: patch.error ?? null,
    })
    .eq("id", id)

  if (error) throw error
}

export async function syncXiaoshouyiSnapshots(trigger: ExternalCrmSyncTrigger = "manual"): Promise<ExternalCrmSyncResult> {
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

  for (const object of getSelectedObjects()) {
    const runId = await createRun(object.objectApiKey, trigger)
    try {
      const syncedAt = new Date().toISOString()
      const records = await queryXiaoshouyiRecords(config, token, object)
      const rows = records
        .map((record) => toExternalRecord(object, record, syncedAt))
        .filter((row): row is ExternalRecordRow => Boolean(row))

      let rowsUpserted = 0
      if (rows.length > 0) {
        const sb = createSupabaseAdminClient()
        const { data, error } = await sb
          .from("external_crm_records")
          .upsert(rows, { onConflict: "source_system,object_api_key,external_id" })
          .select("id")

        if (error) throw error
        rowsUpserted = data?.length ?? rows.length
      }

      await finishRun(runId, { status: "success", rowsScanned: records.length, rowsUpserted })
      results.push({ objectApiKey: object.objectApiKey, status: "success", rowsScanned: records.length, rowsUpserted })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await finishRun(runId, { status: "failed", error: message, rowsScanned: 0, rowsUpserted: 0 })
      results.push({ objectApiKey: object.objectApiKey, status: "failed", rowsScanned: 0, rowsUpserted: 0, error: message })
    }
  }

  const ok = results.every((result) => result.status === "success")
  return { ok, objects: results, error: ok ? undefined : "One or more Xiaoshouyi objects failed to sync" }
}
