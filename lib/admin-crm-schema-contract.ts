import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface CrmSchemaContractCheck {
  key: string
  label: string
  ok: boolean
  detail: string
  action?: string
}

export interface CrmSchemaContractReadiness {
  ok: boolean
  checks: CrmSchemaContractCheck[]
}

type SupabaseErrorLike = { code?: string; details?: string; hint?: string; message?: string } | null

const CONTRACT_LABELS: Record<string, string> = {
  external_crm_records_unique_source: "External CRM snapshot upsert key",
  crm_source_links_unique_candidate: "CRM source-link upsert key",
  crm_source_links_one_confirmed_source_idx: "CRM source-link confirmed uniqueness",
  crm_write_requests_payload_object_chk: "CRM write payload JSON guard",
  crm_write_requests_preview_object_chk: "CRM write preview JSON guard",
  crm_write_requests_response_object_chk: "CRM write response JSON guard",
  crm_write_requests_external_id_required_chk: "CRM write external-id guard",
  crm_write_requests_attempt_count_chk: "CRM write retry count guard",
  crm_write_request_events_write_request_id_fkey: "CRM write audit foreign key",
  crm_write_request_events_event_type_check: "CRM write audit event guard",
}

const CONTRACT_ACTION =
  "Supabase 운영 DB에 CRM runbook 순서대로 snapshot/source-link/write guard/retry audit migration 적용"

function formatSupabaseError(error: SupabaseErrorLike) {
  if (!error) return "unknown database error"
  const parts = [error.message, error.details, error.hint, error.code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.join(" · ") || "unknown database error"
}

function toContractRows(data: unknown) {
  if (!Array.isArray(data)) return []
  return data.filter((row): row is { contract_key: string; ok: boolean; detail: string } => {
    return (
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as { contract_key?: unknown }).contract_key === "string" &&
      typeof (row as { ok?: unknown }).ok === "boolean" &&
      typeof (row as { detail?: unknown }).detail === "string"
    )
  })
}

export async function getCrmSchemaContractReadiness(): Promise<CrmSchemaContractReadiness> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb.rpc("get_crm_schema_contract_status")

  if (error) {
    return {
      ok: false,
      checks: [
        {
          key: "crm_schema_contract_rpc",
          label: "CRM schema contract function",
          ok: false,
          detail: formatSupabaseError(error),
          action: CONTRACT_ACTION,
        },
      ],
    }
  }

  const rows = toContractRows(data)
  if (rows.length === 0) {
    return {
      ok: false,
      checks: [
        {
          key: "crm_schema_contract_empty",
          label: "CRM schema contract function",
          ok: false,
          detail: "contract function returned no checks",
          action: CONTRACT_ACTION,
        },
      ],
    }
  }

  const checks = rows.map((row): CrmSchemaContractCheck => ({
    key: row.contract_key,
    label: CONTRACT_LABELS[row.contract_key] ?? row.contract_key,
    ok: row.ok,
    detail: row.detail,
    action: row.ok ? undefined : CONTRACT_ACTION,
  }))

  return {
    ok: checks.every((check) => check.ok),
    checks,
  }
}
