import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type CrmDuplicatePreflightStatus = "ok" | "warning" | "blocked"

export interface CrmDuplicatePreflightCheck {
  key: string
  label: string
  status: CrmDuplicatePreflightStatus
  detail: string
  action?: string
}

export interface CrmDuplicatePreflightReport {
  ok: boolean
  checks: CrmDuplicatePreflightCheck[]
}

type SupabaseErrorLike = { code?: string; details?: string; hint?: string; message?: string } | null

const DUPLICATE_SCAN_LIMIT = 5000
const DUPLICATE_ACTION =
  "CRM runbook duplicate row preflight SQL로 전체 범위를 확인하고 중복 source row를 병합하거나 stale/rejected 처리"

function formatSupabaseError(error: SupabaseErrorLike) {
  if (!error) return "unknown database error"
  const parts = [error.message, error.details, error.hint, error.code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.join(" · ") || "unknown database error"
}

function buildDuplicateCheck(input: {
  key: string
  label: string
  error: SupabaseErrorLike
  rows: Record<string, unknown>[]
  count: number | null
  fields: string[]
}) {
  if (input.error) {
    return {
      key: input.key,
      label: input.label,
      status: "warning" as const,
      detail: `duplicate preflight skipped: ${formatSupabaseError(input.error)}`,
      action: "schema readiness blocked가 먼저 해결되면 duplicate preflight 재실행",
    }
  }

  const seen = new Map<string, number>()
  for (const row of input.rows) {
    const key = input.fields.map((field) => String(row[field] ?? "")).join(" | ")
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }

  const duplicateEntries = Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"))

  if (duplicateEntries.length > 0) {
    const [sampleKey, sampleCount] = duplicateEntries[0]
    return {
      key: input.key,
      label: input.label,
      status: "blocked" as const,
      detail: `${duplicateEntries.length}개 duplicate key group 감지 · sample ${sampleKey} (${sampleCount} rows)`,
      action: DUPLICATE_ACTION,
    }
  }

  if ((input.count ?? 0) > input.rows.length) {
    return {
      key: input.key,
      label: input.label,
      status: "warning" as const,
      detail: `${input.rows.length.toLocaleString("ko-KR")} / ${(input.count ?? 0).toLocaleString("ko-KR")} rows sample에서 duplicate 없음`,
      action: "전체 중복 여부는 CRM runbook duplicate row preflight SQL로 최종 확인",
    }
  }

  return {
    key: input.key,
    label: input.label,
    status: "ok" as const,
    detail: `${input.rows.length.toLocaleString("ko-KR")} rows duplicate preflight 통과`,
  }
}

export async function getCrmDuplicatePreflightReport(): Promise<CrmDuplicatePreflightReport> {
  const sb = createSupabaseAdminClient()
  const [externalRecords, sourceCandidates, confirmedSources] = await Promise.all([
    sb
      .from("external_crm_records")
      .select("source_system, object_api_key, external_id", { count: "exact" })
      .order("synced_at", { ascending: false })
      .limit(DUPLICATE_SCAN_LIMIT),
    sb
      .from("crm_source_links")
      .select("source_system, source_object, source_record_key, target_type, target_id", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(DUPLICATE_SCAN_LIMIT),
    sb
      .from("crm_source_links")
      .select("source_system, source_object, source_record_key", { count: "exact" })
      .eq("status", "confirmed")
      .order("updated_at", { ascending: false })
      .limit(DUPLICATE_SCAN_LIMIT),
  ])

  const checks = [
    buildDuplicateCheck({
      key: "external_crm_records_duplicate_keys",
      label: "External CRM snapshot duplicate keys",
      error: externalRecords.error,
      rows: (externalRecords.data ?? []) as Record<string, unknown>[],
      count: externalRecords.count,
      fields: ["source_system", "object_api_key", "external_id"],
    }),
    buildDuplicateCheck({
      key: "crm_source_links_duplicate_candidates",
      label: "CRM source-link duplicate candidates",
      error: sourceCandidates.error,
      rows: (sourceCandidates.data ?? []) as Record<string, unknown>[],
      count: sourceCandidates.count,
      fields: ["source_system", "source_object", "source_record_key", "target_type", "target_id"],
    }),
    buildDuplicateCheck({
      key: "crm_source_links_duplicate_confirmed_sources",
      label: "CRM source-link duplicate confirmed sources",
      error: confirmedSources.error,
      rows: (confirmedSources.data ?? []) as Record<string, unknown>[],
      count: confirmedSources.count,
      fields: ["source_system", "source_object", "source_record_key"],
    }),
  ]

  return {
    ok: checks.every((check) => check.status !== "blocked"),
    checks,
  }
}
