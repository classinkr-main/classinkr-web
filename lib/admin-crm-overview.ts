import "server-only"

import { getCrmDuplicatePreflightReport } from "@/lib/admin-crm-duplicate-preflight"
import { getCrmSchemaContractReadiness } from "@/lib/admin-crm-schema-contract"
import { getXiaoshouyiSyncPreflight, getXiaoshouyiSyncSchemaReadiness } from "@/lib/external-crm/xiaoshouyi-sync"
import { getXiaoshouyiWriteSchemaReadiness } from "@/lib/external-crm/xiaoshouyi-write"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type AdminCrmOverviewStatus = "ok" | "warning" | "blocked"

export interface AdminCrmOverview {
  generatedAt: string
  overallStatus: AdminCrmOverviewStatus
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
}

type SupabaseErrorLike = { code?: string; details?: string; hint?: string; message?: string } | null
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

const SOURCE_LINK_STATUSES = ["confirmed", "candidate", "rejected", "stale"] as const
const WRITE_REQUEST_STATUSES = ["draft", "approved", "sent", "failed", "succeeded", "cancelled"] as const

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

async function getSourceLinkCounts(sb: SupabaseAdminClient) {
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

function getOverallStatus(input: {
  schemaBlocked: number
  xiaoshouyiConfigured: boolean
  sourceLinksOk: boolean
  externalSnapshotsOk: boolean
  writeQueueOk: boolean
  sourceCandidates: number
  sourceStale: number
  failedWrites: number
}): AdminCrmOverviewStatus {
  if (input.schemaBlocked > 0 || !input.sourceLinksOk || !input.externalSnapshotsOk || !input.writeQueueOk) {
    return "blocked"
  }
  if (!input.xiaoshouyiConfigured || input.sourceCandidates > 0 || input.sourceStale > 0 || input.failedWrites > 0) {
    return "warning"
  }
  return "ok"
}

export async function getAdminCrmOverview(): Promise<AdminCrmOverview> {
  const sb = createSupabaseAdminClient()

  const [
    syncSchema,
    writeSchema,
    schemaContract,
    duplicatePreflight,
    syncPreflight,
    sourceLinkCounts,
    externalRecordsResult,
    staleRecordsResult,
    latestRunResult,
    writeQueueCounts,
  ] =
    await Promise.all([
      getXiaoshouyiSyncSchemaReadiness(),
      getXiaoshouyiWriteSchemaReadiness(),
      getCrmSchemaContractReadiness(),
      getCrmDuplicatePreflightReport(),
      Promise.resolve(getXiaoshouyiSyncPreflight()),
      getSourceLinkCounts(sb),
      sb
        .from("external_crm_records")
        .select("id, synced_at", { count: "exact" })
        .eq("source_system", "xiaoshouyi")
        .order("synced_at", { ascending: false })
        .limit(1),
      sb
        .from("external_crm_records")
        .select("id", { count: "exact", head: true })
        .eq("source_system", "xiaoshouyi")
        .eq("is_stale", true),
      sb
        .from("external_crm_sync_runs")
        .select("status, object_api_key, finished_at, started_at")
        .eq("source_system", "xiaoshouyi")
        .order("started_at", { ascending: false })
        .limit(1),
      getWriteQueueCounts(sb),
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
  const externalRecord = externalRecordsResult.error ? null : externalRecordsResult.data?.[0]
  const latestRun = latestRunResult.error ? null : latestRunResult.data?.[0]

  const sourceLinks = {
    ok: sourceLinkCounts.ok,
    total: sourceLinkCounts.total,
    confirmed: sourceLinkCounts.confirmed,
    candidate: sourceLinkCounts.candidate,
    rejected: sourceLinkCounts.rejected,
    stale: sourceLinkCounts.stale,
    error: sourceLinkCounts.error,
  }

  const externalSnapshots = {
    ok: !externalRecordsResult.error && !staleRecordsResult.error && !latestRunResult.error,
    recordCount: externalRecordsResult.error ? 0 : externalRecordsResult.count ?? 0,
    staleCount: staleRecordsResult.error ? 0 : staleRecordsResult.count ?? 0,
    latestSyncedAt:
      externalRecord && typeof externalRecord.synced_at === "string"
        ? externalRecord.synced_at
        : latestRun && typeof latestRun.finished_at === "string"
          ? latestRun.finished_at
          : null,
    latestRunStatus: latestRun && typeof latestRun.status === "string" ? latestRun.status : null,
    latestRunObject: latestRun && typeof latestRun.object_api_key === "string" ? latestRun.object_api_key : null,
    error:
      externalRecordsResult.error || staleRecordsResult.error || latestRunResult.error
        ? [
            formatLabeledSupabaseError("external_crm_records latest", externalRecordsResult.error),
            formatLabeledSupabaseError("external_crm_records stale", staleRecordsResult.error),
            formatLabeledSupabaseError("external_crm_sync_runs latest", latestRunResult.error),
          ]
            .filter((message): message is string => Boolean(message))
            .join("; ")
        : null,
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
      sourceCandidates: sourceLinks.candidate,
      sourceStale: sourceLinks.stale,
      failedWrites: writeQueue.failed,
    }),
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
  }
}
