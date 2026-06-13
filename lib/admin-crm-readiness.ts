import "server-only"

import { getCrmDuplicatePreflightReport } from "@/lib/admin-crm-duplicate-preflight"
import { getCrmSchemaContractReadiness } from "@/lib/admin-crm-schema-contract"
import { getXiaoshouyiSyncPreflight, getXiaoshouyiSyncSchemaReadiness } from "@/lib/external-crm/xiaoshouyi-sync"
import { getXiaoshouyiWriteMetadataPreflight, getXiaoshouyiWriteSchemaReadiness } from "@/lib/external-crm/xiaoshouyi-write"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type CrmReadinessStatus = "ok" | "warning" | "blocked"

export interface CrmReadinessCheck {
  key: string
  label: string
  status: CrmReadinessStatus
  detail: string
  action?: string
}

export interface CrmReadinessSummary {
  ok: number
  warning: number
  blocked: number
}

export interface CrmReadinessReport {
  generatedAt: string
  overallStatus: CrmReadinessStatus
  summary: CrmReadinessSummary
  checks: CrmReadinessCheck[]
}

function summarize(checks: CrmReadinessCheck[]): CrmReadinessSummary {
  return checks.reduce<CrmReadinessSummary>(
    (acc, check) => {
      acc[check.status] += 1
      return acc
    },
    { ok: 0, warning: 0, blocked: 0 }
  )
}

function getOverallStatus(summary: CrmReadinessSummary): CrmReadinessStatus {
  if (summary.blocked > 0) return "blocked"
  if (summary.warning > 0) return "warning"
  return "ok"
}

function formatSupabaseError(error: { code?: string; details?: string; hint?: string; message?: string } | null) {
  if (!error) return "unknown database error"
  const parts = [error.message, error.details, error.hint, error.code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.join(" · ") || "unknown database error"
}

async function checkDatabaseShape(
  key: string,
  label: string,
  promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  okDetail: string,
  action: string
): Promise<CrmReadinessCheck> {
  const { error } = await promise
  if (error) {
    return {
      key,
      label,
      status: "blocked",
      detail: formatSupabaseError(error),
      action,
    }
  }

  return {
    key,
    label,
    status: "ok",
    detail: okDetail,
  }
}

export async function getAdminCrmReadinessReport(): Promise<CrmReadinessReport> {
  const sb = createSupabaseAdminClient()

  const [
    syncSchema,
    writeSchema,
    schemaContract,
    duplicatePreflight,
    sourceLinks,
    sourcePriorities,
    matchAliases,
    queryCatalog,
    branchRev,
    syncPreflight,
    writeMetadata,
  ] = await Promise.all([
    getXiaoshouyiSyncSchemaReadiness(),
    getXiaoshouyiWriteSchemaReadiness(),
    getCrmSchemaContractReadiness(),
    getCrmDuplicatePreflightReport(),
    checkDatabaseShape(
      "crm_source_links",
      "CRM source link schema",
      sb
        .from("crm_source_links")
        .select(
          [
            "id",
            "source_system",
            "source_object",
            "source_record_key",
            "normalized_name",
            "target_type",
            "target_id",
            "confidence",
            "status",
            "metadata",
            "confirmed_by",
            "confirmed_at",
            "created_at",
            "updated_at",
          ].join(", ")
        )
        .limit(1),
      "REV/Xiaoshouyi source-link runtime column contract 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_crm_source_links.sql 적용"
    ),
    checkDatabaseShape(
      "crm_source_priorities",
      "CRM source priority schema",
      sb
        .from("crm_source_priorities")
        .select(
          [
            "source_system",
            "label",
            "priority",
            "trust_tier",
            "is_primary",
            "read_policy",
            "write_policy",
            "freshness_window_hours",
            "metadata",
          ].join(", ")
        )
        .limit(1),
      "CRM 우선순위/신뢰도 정책 table 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_crm_source_priority_aliases_catalog.sql 적용"
    ),
    checkDatabaseShape(
      "crm_match_aliases",
      "CRM fuzzy alias schema",
      sb
        .from("crm_match_aliases")
        .select(
          [
            "id",
            "alias",
            "normalized_alias",
            "canonical_name",
            "normalized_canonical_name",
            "target_type",
            "target_id",
            "manager_name",
            "normalized_manager_name",
            "confidence_boost",
            "status",
            "metadata",
          ].join(", ")
        )
        .limit(1),
      "리드/시트/CRM 이름 불일치 alias table 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_crm_source_priority_aliases_catalog.sql 적용"
    ),
    checkDatabaseShape(
      "crm_xiaoshouyi_query_catalog",
      "Xiaoshouyi query catalog schema",
      sb
        .from("crm_xiaoshouyi_query_catalog")
        .select(
          [
            "object_api_key",
            "source_system",
            "fields",
            "where_clause",
            "order_by",
            "page_size",
            "max_pages",
            "sync_priority",
            "is_default_enabled",
            "is_write_allowed",
            "metadata",
          ].join(", ")
        )
        .limit(1),
      "MCP/동기화 공용 Xiaoshouyi query catalog 확인",
      "Supabase 운영 DB에 supabase/migrations/20260610_crm_source_priority_aliases_catalog.sql 적용"
    ),
    checkDatabaseShape(
      "branch_rev_deals",
      "Branch REV sheet schema",
      sb.from("branch_rev_deals").select("id, monthly_confirmed, monthly_high_conf").limit(1),
      "REV 시트 동기화본과 색상 금액 column 확인",
      "Supabase 운영 DB에 supabase/migrations/20260427_branch_dashboard.sql 이후 supabase/migrations/20260610_rev_color_amounts.sql 적용"
    ),
    Promise.resolve(getXiaoshouyiSyncPreflight()),
    getXiaoshouyiWriteMetadataPreflight(),
  ])

  const checks: CrmReadinessCheck[] = [
    ...syncSchema.checks.map((check): CrmReadinessCheck => ({
      key: check.key,
      label: check.label,
      status: check.ok ? "ok" : "blocked",
      detail: check.detail,
      action: check.action,
    })),
    sourceLinks,
    sourcePriorities,
    matchAliases,
    queryCatalog,
    branchRev,
    ...duplicatePreflight.checks.map((check): CrmReadinessCheck => ({
      key: check.key,
      label: check.label,
      status: check.status,
      detail: check.detail,
      action: check.action,
    })),
    ...schemaContract.checks.map((check): CrmReadinessCheck => ({
      key: check.key,
      label: check.label,
      status: check.ok ? "ok" : "blocked",
      detail: check.detail,
      action: check.action,
    })),
    ...writeSchema.checks.map((check): CrmReadinessCheck => ({
      key: check.key,
      label: check.label,
      status: check.ok ? "ok" : "blocked",
      detail: check.detail,
      action: check.action,
    })),
    syncPreflight.configured
      ? {
          key: "xiaoshouyi_sync_env",
          label: "Xiaoshouyi sync credential",
          status: "ok",
          detail: `${syncPreflight.authMode} · ${syncPreflight.objects.length}개 객체 · page ${syncPreflight.pageSize} x ${syncPreflight.maxPages}`,
        }
      : {
          key: "xiaoshouyi_sync_env",
          label: "Xiaoshouyi sync credential",
          status: "blocked",
          detail: syncPreflight.missingEnvGroups.join(", ") || "credential 미설정",
          action: "운영 env에 XIAOSHOUYI_BASE_URL과 access token 또는 service OAuth credential 설정",
        },
    writeMetadata.ok
      ? {
          key: "xiaoshouyi_write_metadata",
          label: "Xiaoshouyi write metadata",
          status: "ok",
          detail: `${writeMetadata.objects.filter((object) => object.status === "ok").length}개 writable object field probe 통과`,
        }
      : {
          key: "xiaoshouyi_write_metadata",
          label: "Xiaoshouyi write metadata",
          status: writeMetadata.configured ? "blocked" : "warning",
          detail:
            writeMetadata.error ??
            writeMetadata.objects.find((object) => object.status === "failed")?.error ??
            "metadata probe 미완료",
          action: writeMetadata.configured
            ? "Xiaoshouyi object/field allowlist와 live metadata probe 결과 확인"
            : "credential 연결 후 metadata preflight 재실행",
        },
  ]

  const summary = summarize(checks)

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: getOverallStatus(summary),
    summary,
    checks,
  }
}
