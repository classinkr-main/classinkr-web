import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type CrmWriteOperation = "create" | "update" | "transfer_owner"
export type CrmWriteRequestStatus = "draft" | "approved" | "sent" | "succeeded" | "failed" | "cancelled"
type CrmWriteRequestAction = "approve" | "cancel" | "retry"
type CrmWriteRequestEventType = "created" | "approved" | "cancelled" | "sent" | "failed" | "succeeded" | "retry_requested"

const MAX_WRITE_ATTEMPTS = 3
const RETRY_DELAY_MINUTES = [5, 15]

interface XiaoshouyiConfig {
  baseUrl: string
  accessToken?: string
  clientId?: string
  clientSecret?: string
  username?: string
  password?: string
}

interface CrmWriteRequestRow {
  id: string
  source_system: string
  object_api_key: string
  external_id: string | null
  operation: CrmWriteOperation
  payload: Record<string, unknown>
  preview_payload: Record<string, unknown> | null
  status: CrmWriteRequestStatus
  requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  executed_at: string | null
  response_payload: Record<string, unknown> | null
  error: string | null
  attempt_count?: number | null
  last_attempt_at?: string | null
  next_retry_at?: string | null
  last_attempt_error?: string | null
  created_at: string
  updated_at: string
}

export interface CrmWritePreview {
  sourceSystem: "xiaoshouyi"
  operation: CrmWriteOperation
  objectApiKey: string
  externalId: string | null
  method: "POST" | "PATCH"
  urlPath: string
  body: Record<string, unknown>
  warnings: string[]
}

export interface CreateCrmWriteRequestInput {
  objectApiKey: string
  operation: CrmWriteOperation
  externalId?: string | null
  payload: Record<string, unknown>
  requestedBy?: string | null
}

export interface XiaoshouyiWriteMetadataObjectStatus {
  objectApiKey: string
  label: string
  readOnly: boolean
  status: "ok" | "failed" | "skipped" | "read_only"
  validationMode: "query_probe"
  allowedFields: string[]
  requiredCreateFields: string[]
  ownerTransferField: string | null
  error?: string
}

export interface XiaoshouyiWriteMetadataPreflight {
  ok: boolean
  configured: boolean
  validationMode: "query_probe"
  objects: XiaoshouyiWriteMetadataObjectStatus[]
  error?: string
}

export interface XiaoshouyiWriteSchemaCheck {
  key: string
  label: string
  ok: boolean
  detail: string
  action?: string
}

export interface XiaoshouyiWriteSchemaReadiness {
  ok: boolean
  checks: XiaoshouyiWriteSchemaCheck[]
  error?: string
}

interface XiaoshouyiWriteObjectPolicy {
  label: string
  operations: ReadonlySet<CrmWriteOperation>
  allowedFields: ReadonlySet<string>
  requiredCreateFields?: readonly string[]
  ownerTransferField?: string
  readOnlyReason?: string
}

const XIAOSHOUYI_WRITE_POLICIES: Record<string, XiaoshouyiWriteObjectPolicy> = {
  account: {
    label: "고객/회사",
    operations: new Set(["create", "update", "transfer_owner"]),
    allowedFields: new Set(["accountName", "name", "phone", "address", "entityType", "ownerId"]),
    requiredCreateFields: ["accountName"],
    ownerTransferField: "ownerId",
  },
  contact: {
    label: "연락처",
    operations: new Set(["create", "update", "transfer_owner"]),
    allowedFields: new Set(["contactName", "name", "mobile", "phone", "email", "accountId", "ownerId"]),
    requiredCreateFields: ["contactName"],
    ownerTransferField: "ownerId",
  },
  lead: {
    label: "리드",
    operations: new Set(["create", "update", "transfer_owner"]),
    allowedFields: new Set(["leadName", "name", "company", "mobile", "phone", "email", "ownerId", "source", "remark"]),
    requiredCreateFields: ["leadName"],
    ownerTransferField: "ownerId",
  },
  opportunity: {
    label: "영업기회",
    operations: new Set(["create", "update", "transfer_owner"]),
    allowedFields: new Set(["opportunityName", "name", "money", "amount", "ownerId", "accountId", "saleStageId", "closeDate"]),
    requiredCreateFields: ["opportunityName"],
    ownerTransferField: "ownerId",
  },
  Collection__c: {
    label: "수금",
    operations: new Set(["create", "update", "transfer_owner"]),
    allowedFields: new Set(["name", "ownerId", "amount", "money", "Amount__c", "CollectionAmount__c", "GetDate__c"]),
    requiredCreateFields: ["name"],
    ownerTransferField: "ownerId",
  },
  ShroffAccount__c: {
    label: "EEO 계정",
    operations: new Set([]),
    allowedFields: new Set([]),
    readOnlyReason: "EEO 계정 상태 객체는 read-only snapshot으로만 다룹니다.",
  },
}

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

function assertObjectApiKey(value: string) {
  const trimmed = value.trim()
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:__c)?$/.test(trimmed)) {
    throw new Error("Invalid Xiaoshouyi object API key")
  }
  return trimmed
}

function assertPayload(value: Record<string, unknown>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CRM write payload must be a JSON object")
  }
  if (Object.keys(value).length === 0) {
    throw new Error("CRM write payload cannot be empty")
  }
  return value
}

function getWritePolicy(objectApiKey: string) {
  const policy = XIAOSHOUYI_WRITE_POLICIES[objectApiKey]
  if (!policy) {
    throw new Error(`Unsupported Xiaoshouyi write object: ${objectApiKey}`)
  }
  return policy
}

function isBlank(value: unknown) {
  return value == null || (typeof value === "string" && value.trim().length === 0)
}

function assertJsonScalarOrArray(value: unknown, field: string) {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return
  if (Array.isArray(value)) {
    for (const item of value) assertJsonScalarOrArray(item, field)
    return
  }
  throw new Error(`Unsupported nested value for Xiaoshouyi field: ${field}`)
}

function validateWritePayload(input: {
  policy: XiaoshouyiWriteObjectPolicy
  operation: CrmWriteOperation
  payload: Record<string, unknown>
}) {
  if (input.policy.readOnlyReason) throw new Error(input.policy.readOnlyReason)
  if (!input.policy.operations.has(input.operation)) {
    throw new Error(`${input.policy.label} 객체는 ${input.operation} 작업을 허용하지 않습니다.`)
  }

  const invalidFields = Object.keys(input.payload).filter((field) => !input.policy.allowedFields.has(field))
  if (invalidFields.length > 0) {
    throw new Error(`Unsupported Xiaoshouyi fields for ${input.policy.label}: ${invalidFields.join(", ")}`)
  }

  for (const [field, value] of Object.entries(input.payload)) {
    assertJsonScalarOrArray(value, field)
  }

  if (input.operation === "create") {
    const missingRequired = (input.policy.requiredCreateFields ?? []).filter((field) => isBlank(input.payload[field]))
    if (missingRequired.length > 0) {
      throw new Error(`Missing required create fields for ${input.policy.label}: ${missingRequired.join(", ")}`)
    }
  }
}

function sanitizeExternalId(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (!/^[A-Za-z0-9_.:-]+$/.test(trimmed)) {
    throw new Error("Invalid Xiaoshouyi external id")
  }
  return trimmed
}

function xobjectPath(objectApiKey: string, externalId?: string | null) {
  return externalId
    ? `/rest/data/v2.0/xobjects/${objectApiKey}/${encodeURIComponent(externalId)}`
    : `/rest/data/v2.0/xobjects/${objectApiKey}`
}

function xobjectMutationBody(data: Record<string, unknown>) {
  return { data }
}

function unwrapPersistedPayload(payload: Record<string, unknown>) {
  const wrappedData = payload.data
  if (
    wrappedData &&
    typeof wrappedData === "object" &&
    !Array.isArray(wrappedData) &&
    Object.keys(payload).length === 1
  ) {
    return wrappedData as Record<string, unknown>
  }
  return payload
}

function formatSupabaseError(error: { code?: string; details?: string; hint?: string; message?: string } | null) {
  if (!error) return "unknown database error"
  const parts = [error.message, error.details, error.hint, error.code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.join(" · ") || "unknown database error"
}

async function checkWriteSchemaShape(
  key: string,
  label: string,
  promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  okDetail: string,
  action: string
): Promise<XiaoshouyiWriteSchemaCheck> {
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

export async function getXiaoshouyiWriteSchemaReadiness(): Promise<XiaoshouyiWriteSchemaReadiness> {
  const sb = createSupabaseAdminClient()
  const checks = await Promise.all([
    checkWriteSchemaShape(
      "crm_write_requests",
      "CRM write request schema",
      sb
        .from("crm_write_requests")
        .select(
          [
            "id",
            "source_system",
            "object_api_key",
            "external_id",
            "operation",
            "payload",
            "preview_payload",
            "status",
            "requested_by",
            "approved_by",
            "approved_at",
            "executed_at",
            "response_payload",
            "error",
            "attempt_count",
            "last_attempt_at",
            "next_retry_at",
            "last_attempt_error",
            "created_at",
            "updated_at",
          ].join(", ")
        )
        .limit(1),
      "write request runtime/retry column contract 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_external_crm_snapshots.sql, supabase/migrations/20260610_external_crm_write_request_guards.sql, supabase/migrations/20260610_external_crm_write_request_retry_audit.sql 순서로 적용"
    ),
    checkWriteSchemaShape(
      "crm_write_request_events",
      "CRM write audit schema",
      sb
        .from("crm_write_request_events")
        .select("id, write_request_id, event_type, actor_user_id, from_status, to_status, message, payload, created_at")
        .limit(1),
      "write request audit event runtime column contract 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_external_crm_write_request_retry_audit.sql 적용"
    ),
  ])
  const failed = checks.filter((check) => !check.ok)

  return {
    ok: failed.length === 0,
    checks,
    error: failed.length > 0 ? failed.map((check) => `${check.label}: ${check.detail}`).join("; ") : undefined,
  }
}

async function assertXiaoshouyiWriteSchemaReady() {
  const schema = await getXiaoshouyiWriteSchemaReadiness()
  if (!schema.ok) {
    throw new Error(`Xiaoshouyi write schema is not ready: ${schema.error ?? "unknown schema issue"}`)
  }
}

function queryPath(query: string) {
  return `/rest/data/v2/query?q=${encodeURIComponent(query)}`
}

function getPolicyFieldList(policy: XiaoshouyiWriteObjectPolicy) {
  return Array.from(new Set([
    ...policy.allowedFields,
    ...(policy.requiredCreateFields ?? []),
    ...(policy.ownerTransferField ? [policy.ownerTransferField] : []),
  ])).sort()
}

function toMetadataObjectStatus(
  objectApiKey: string,
  policy: XiaoshouyiWriteObjectPolicy,
  patch: Partial<XiaoshouyiWriteMetadataObjectStatus> = {}
): XiaoshouyiWriteMetadataObjectStatus {
  return {
    objectApiKey,
    label: policy.label,
    readOnly: Boolean(policy.readOnlyReason),
    status: policy.readOnlyReason ? "read_only" : "skipped",
    validationMode: "query_probe",
    allowedFields: getPolicyFieldList(policy),
    requiredCreateFields: [...(policy.requiredCreateFields ?? [])],
    ownerTransferField: policy.ownerTransferField ?? null,
    ...patch,
  }
}

async function probeXiaoshouyiObjectFields(
  config: XiaoshouyiConfig,
  token: string,
  objectApiKey: string,
  policy: XiaoshouyiWriteObjectPolicy
) {
  const fields = getPolicyFieldList(policy)
  if (policy.readOnlyReason) return toMetadataObjectStatus(objectApiKey, policy, { status: "read_only" })
  if (fields.length === 0) return toMetadataObjectStatus(objectApiKey, policy, { status: "skipped" })

  const query = `SELECT ${fields.join(",")} FROM ${objectApiKey} LIMIT 1`
  const response = await fetch(`${config.baseUrl}${queryPath(query)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    return toMetadataObjectStatus(objectApiKey, policy, {
      status: "failed",
      error: `metadata field probe failed: ${response.status}${body ? ` ${body.slice(0, 200)}` : ""}`,
    })
  }

  return toMetadataObjectStatus(objectApiKey, policy, { status: "ok" })
}

async function validateWriteMetadataForObject(config: XiaoshouyiConfig, token: string, objectApiKey: string) {
  const policy = getWritePolicy(objectApiKey)
  const status = await probeXiaoshouyiObjectFields(config, token, objectApiKey, policy)
  if (status.status === "failed") {
    throw new Error(`Xiaoshouyi metadata validation failed for ${objectApiKey}: ${status.error}`)
  }
  if (status.status !== "ok") {
    throw new Error(`Xiaoshouyi metadata validation skipped for writable object: ${objectApiKey}`)
  }
  return status
}

export async function getXiaoshouyiWriteMetadataPreflight(): Promise<XiaoshouyiWriteMetadataPreflight> {
  const config = getXiaoshouyiConfig()
  const policies = Object.entries(XIAOSHOUYI_WRITE_POLICIES)
  if (!config) {
    return {
      ok: false,
      configured: false,
      validationMode: "query_probe",
      error: "Missing Xiaoshouyi base URL",
      objects: policies.map(([objectApiKey, policy]) =>
        toMetadataObjectStatus(objectApiKey, policy, { status: policy.readOnlyReason ? "read_only" : "skipped" })
      ),
    }
  }

  const token = await getAccessToken(config)
  if (!token) {
    return {
      ok: false,
      configured: false,
      validationMode: "query_probe",
      error: "Missing Xiaoshouyi access token or service credentials",
      objects: policies.map(([objectApiKey, policy]) =>
        toMetadataObjectStatus(objectApiKey, policy, { status: policy.readOnlyReason ? "read_only" : "skipped" })
      ),
    }
  }

  const objects = await Promise.all(
    policies.map(([objectApiKey, policy]) => probeXiaoshouyiObjectFields(config, token, objectApiKey, policy))
  )

  return {
    ok: objects.every((object) => object.status === "ok" || object.status === "read_only"),
    configured: true,
    validationMode: "query_probe",
    objects,
  }
}

function getAttemptCount(row: Pick<CrmWriteRequestRow, "attempt_count">) {
  const count = Number(row.attempt_count ?? 0)
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
}

function getNextRetryAt(attemptCount: number) {
  if (attemptCount >= MAX_WRITE_ATTEMPTS) return null
  const delayMinutes = RETRY_DELAY_MINUTES[Math.max(0, attemptCount - 1)] ?? RETRY_DELAY_MINUTES.at(-1) ?? 15
  return new Date(Date.now() + delayMinutes * 60_000).toISOString()
}

async function recordWriteRequestEvent(input: {
  requestId: string
  eventType: CrmWriteRequestEventType
  actorUserId?: string | null
  fromStatus?: CrmWriteRequestStatus | null
  toStatus?: CrmWriteRequestStatus | null
  message?: string | null
  payload?: Record<string, unknown>
}) {
  const sb = createSupabaseAdminClient()
  const { error } = await sb.from("crm_write_request_events").insert({
    write_request_id: input.requestId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    message: input.message ?? null,
    payload: input.payload ?? {},
  })

  if (error) {
    console.error("[crm_write_request_events] Failed to record event", error)
  }
}

export function buildCrmWritePreview(input: {
  objectApiKey: string
  operation: CrmWriteOperation
  externalId?: string | null
  payload: Record<string, unknown>
}): CrmWritePreview {
  const objectApiKey = assertObjectApiKey(input.objectApiKey)
  const payload = unwrapPersistedPayload(assertPayload(input.payload))
  const externalId = sanitizeExternalId(input.externalId)
  const policy = getWritePolicy(objectApiKey)
  const warnings: string[] = []

  if (input.operation === "create") {
    validateWritePayload({ policy, operation: "create", payload })
    if (externalId) warnings.push("create 요청의 external_id는 preview에만 남기고 URL에는 사용하지 않습니다.")
    return {
      sourceSystem: "xiaoshouyi",
      operation: "create",
      objectApiKey,
      externalId,
      method: "POST",
      urlPath: xobjectPath(objectApiKey),
      body: xobjectMutationBody(payload),
      warnings,
    }
  }

  if (input.operation === "update") {
    if (!externalId) throw new Error("update 요청에는 external_id가 필요합니다.")
    validateWritePayload({ policy, operation: "update", payload })
    return {
      sourceSystem: "xiaoshouyi",
      operation: "update",
      objectApiKey,
      externalId,
      method: "PATCH",
      urlPath: xobjectPath(objectApiKey, externalId),
      body: xobjectMutationBody(payload),
      warnings,
    }
  }

  if (input.operation === "transfer_owner") {
    if (!externalId) throw new Error("transfer_owner 요청에는 external_id가 필요합니다.")
    if (!policy.ownerTransferField) throw new Error(`${policy.label} 객체는 담당 이전을 허용하지 않습니다.`)
    const ownerValue = payload[policy.ownerTransferField]
    if (typeof ownerValue !== "string" || !ownerValue.trim()) {
      throw new Error(`transfer_owner 요청에는 payload.${policy.ownerTransferField}가 필요합니다.`)
    }
    validateWritePayload({
      policy,
      operation: "transfer_owner",
      payload: { [policy.ownerTransferField]: ownerValue },
    })
    return {
      sourceSystem: "xiaoshouyi",
      operation: "transfer_owner",
      objectApiKey,
      externalId,
      method: "PATCH",
      urlPath: xobjectPath(objectApiKey, externalId),
      body: xobjectMutationBody({ [policy.ownerTransferField]: ownerValue.trim() }),
      warnings,
    }
  }

  throw new Error("Unsupported CRM write operation")
}

export async function createCrmWriteRequest(input: CreateCrmWriteRequestInput) {
  const preview = buildCrmWritePreview(input)
  await assertXiaoshouyiWriteSchemaReady()
  const sb = createSupabaseAdminClient()

  const { data, error } = await sb
    .from("crm_write_requests")
    .insert({
      source_system: "xiaoshouyi",
      object_api_key: preview.objectApiKey,
      external_id: preview.externalId,
      operation: preview.operation,
      payload: unwrapPersistedPayload(assertPayload(input.payload)),
      preview_payload: preview,
      status: "draft",
      requested_by: input.requestedBy ?? null,
    })
    .select("*")
    .single()

  if (error) throw error
  await recordWriteRequestEvent({
    requestId: data.id as string,
    eventType: "created",
    actorUserId: input.requestedBy ?? null,
    toStatus: "draft",
    payload: { preview },
  })
  return data as CrmWriteRequestRow
}

export async function updateCrmWriteRequestStatus(input: {
  id: string
  action: CrmWriteRequestAction
  actorUserId?: string | null
}) {
  await assertXiaoshouyiWriteSchemaReady()
  const sb = createSupabaseAdminClient()
  const { data: current, error: readError } = await sb
    .from("crm_write_requests")
    .select("id, status, attempt_count, next_retry_at")
    .eq("id", input.id)
    .maybeSingle()

  if (readError) throw readError
  if (!current) throw new Error("CRM write request not found")

  if (input.action === "approve") {
    if (current.status !== "draft") throw new Error("Only draft CRM write requests can be approved")
    const { data, error } = await sb
      .from("crm_write_requests")
      .update({
        status: "approved",
        approved_by: input.actorUserId ?? null,
        approved_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", input.id)
      .select("*")
      .single()

    if (error) throw error
    await recordWriteRequestEvent({
      requestId: input.id,
      eventType: "approved",
      actorUserId: input.actorUserId ?? null,
      fromStatus: "draft",
      toStatus: "approved",
    })
    return data as CrmWriteRequestRow
  }

  if (input.action === "retry") {
    if (current.status !== "failed") throw new Error("Only failed CRM write requests can be retried")
    const attemptCount = getAttemptCount(current)
    if (attemptCount >= MAX_WRITE_ATTEMPTS) throw new Error("CRM write request has reached the retry limit")
    if (current.next_retry_at && new Date(current.next_retry_at).getTime() > Date.now()) {
      throw new Error("CRM write request retry window has not opened yet")
    }

    const { data, error } = await sb
      .from("crm_write_requests")
      .update({
        status: "approved",
        approved_by: input.actorUserId ?? null,
        approved_at: new Date().toISOString(),
        next_retry_at: null,
        error: null,
      })
      .eq("id", input.id)
      .select("*")
      .single()

    if (error) throw error
    await recordWriteRequestEvent({
      requestId: input.id,
      eventType: "retry_requested",
      actorUserId: input.actorUserId ?? null,
      fromStatus: "failed",
      toStatus: "approved",
      payload: { attemptCount },
    })
    return data as CrmWriteRequestRow
  }

  if (!["draft", "approved", "failed"].includes(current.status)) {
    throw new Error("Only draft, approved, or failed CRM write requests can be cancelled")
  }

  const { data, error } = await sb
    .from("crm_write_requests")
    .update({
      status: "cancelled",
      approved_by: null,
      approved_at: null,
      error: null,
    })
    .eq("id", input.id)
    .select("*")
    .single()

  if (error) throw error
  await recordWriteRequestEvent({
    requestId: input.id,
    eventType: "cancelled",
    actorUserId: input.actorUserId ?? null,
    fromStatus: current.status as CrmWriteRequestStatus,
    toStatus: "cancelled",
  })
  return data as CrmWriteRequestRow
}

async function markWriteRequestFailed(input: {
  id: string
  message: string
  responsePayload?: Record<string, unknown>
  attemptCount?: number
  actorUserId?: string | null
  fromStatus?: CrmWriteRequestStatus
}) {
  const sb = createSupabaseAdminClient()
  const nextRetryAt = input.attemptCount == null ? null : getNextRetryAt(input.attemptCount)
  const { data, error } = await sb
    .from("crm_write_requests")
    .update({
      status: "failed",
      executed_at: new Date().toISOString(),
      error: input.message,
      last_attempt_error: input.message,
      next_retry_at: nextRetryAt,
      response_payload: input.responsePayload ?? null,
    })
    .eq("id", input.id)
    .select("*")
    .single()

  if (error) throw error
  await recordWriteRequestEvent({
    requestId: input.id,
    eventType: "failed",
    actorUserId: input.actorUserId ?? null,
    fromStatus: input.fromStatus ?? "sent",
    toStatus: "failed",
    message: input.message,
    payload: {
      attemptCount: input.attemptCount ?? null,
      nextRetryAt,
      responsePayload: input.responsePayload ?? null,
    },
  })
  return data as CrmWriteRequestRow
}

export async function executeCrmWriteRequest(id: string, actorUserId?: string | null) {
  await assertXiaoshouyiWriteSchemaReady()
  const sb = createSupabaseAdminClient()
  const { data: request, error: readError } = await sb
    .from("crm_write_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (readError) throw readError
  if (!request) throw new Error("CRM write request not found")

  const row = request as CrmWriteRequestRow
  if (row.source_system !== "xiaoshouyi") throw new Error("Unsupported CRM write source")
  if (row.status !== "approved") throw new Error("Only approved CRM write requests can be executed")

  let preview: CrmWritePreview
  try {
    preview = buildCrmWritePreview({
      objectApiKey: row.object_api_key,
      operation: row.operation,
      externalId: row.external_id,
      payload: row.payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return markWriteRequestFailed({ id: row.id, message, actorUserId, fromStatus: "approved" })
  }

  const nextAttemptCount = getAttemptCount(row) + 1
  if (nextAttemptCount > MAX_WRITE_ATTEMPTS) {
    throw new Error("CRM write request has reached the retry limit")
  }

  const { data: claimed, error: claimError } = await sb
    .from("crm_write_requests")
    .update({
      status: "sent",
      preview_payload: preview,
      error: null,
      attempt_count: nextAttemptCount,
      last_attempt_at: new Date().toISOString(),
      last_attempt_error: null,
      next_retry_at: null,
    })
    .eq("id", row.id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle()

  if (claimError) throw claimError
  if (!claimed) throw new Error("CRM write request is no longer approved")
  await recordWriteRequestEvent({
    requestId: row.id,
    eventType: "sent",
    actorUserId: actorUserId ?? null,
    fromStatus: "approved",
    toStatus: "sent",
    payload: { attemptCount: nextAttemptCount, preview },
  })

  let responsePayload: Record<string, unknown>

  try {
    const config = getXiaoshouyiConfig()
    if (!config) {
      return markWriteRequestFailed({
        id: row.id,
        message: "Missing Xiaoshouyi base URL",
        attemptCount: nextAttemptCount,
        actorUserId,
      })
    }

    const token = await getAccessToken(config)
    if (!token) {
      return markWriteRequestFailed({
        id: row.id,
        message: "Missing Xiaoshouyi access token or service credentials",
        attemptCount: nextAttemptCount,
        actorUserId,
      })
    }

    await validateWriteMetadataForObject(config, token, preview.objectApiKey)

    const response = await fetch(`${config.baseUrl}${preview.urlPath}`, {
      method: preview.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preview.body),
    })

    const responseText = await response.text().catch(() => "")
    try {
      responsePayload = responseText ? JSON.parse(responseText) as Record<string, unknown> : {}
    } catch {
      responsePayload = { raw: responseText }
    }

    if (!response.ok) {
      return markWriteRequestFailed(
        {
          id: row.id,
          message: `Xiaoshouyi write request failed: ${response.status}`,
          responsePayload,
          attemptCount: nextAttemptCount,
          actorUserId,
        }
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return markWriteRequestFailed({
      id: row.id,
      message,
      attemptCount: nextAttemptCount,
      actorUserId,
    })
  }

  const { data, error } = await sb
    .from("crm_write_requests")
    .update({
      status: "succeeded",
      executed_at: new Date().toISOString(),
      response_payload: responsePayload,
      error: null,
    })
    .eq("id", row.id)
    .select("*")
    .single()

  if (error) throw error
  await recordWriteRequestEvent({
    requestId: row.id,
    eventType: "succeeded",
    actorUserId: actorUserId ?? null,
    fromStatus: "sent",
    toStatus: "succeeded",
    payload: { attemptCount: nextAttemptCount, responsePayload },
  })
  return data as CrmWriteRequestRow
}
