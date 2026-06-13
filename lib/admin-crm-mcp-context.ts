import "server-only"

import { getXiaoshouyiSyncPreflight } from "@/lib/external-crm/xiaoshouyi-sync"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface SourcePriorityRow {
  source_system: string
  label: string
  priority: number
  trust_tier: string
  is_primary: boolean
  read_policy: string
  write_policy: string
  freshness_window_hours: number | null
}

interface QueryCatalogRow {
  object_api_key: string
  source_system: string
  fields: string[]
  where_clause: string | null
  order_by: string
  page_size: number
  max_pages: number
  sync_priority: number
  is_default_enabled: boolean
  is_write_allowed: boolean
}

const FALLBACK_SOURCE_PRIORITIES: SourcePriorityRow[] = [
  {
    source_system: "app_v2",
    label: "ClassIn app CRM",
    priority: 10,
    trust_tier: "authoritative",
    is_primary: true,
    read_policy: "read_write_internal",
    write_policy: "internal_app",
    freshness_window_hours: null,
  },
  {
    source_system: "xiaoshouyi",
    label: "Xiaoshouyi / eeoCRM",
    priority: 20,
    trust_tier: "high",
    is_primary: true,
    read_policy: "read_snapshot",
    write_policy: "approval_queue_only",
    freshness_window_hours: 24,
  },
  {
    source_system: "lead",
    label: "Inbound leads",
    priority: 30,
    trust_tier: "high",
    is_primary: true,
    read_policy: "read_intake",
    write_policy: "convert_v2",
    freshness_window_hours: 24,
  },
  {
    source_system: "branch_rev_sheet",
    label: "Branch REV sheet",
    priority: 80,
    trust_tier: "supporting",
    is_primary: false,
    read_policy: "read_compare_only",
    write_policy: "disabled",
    freshness_window_hours: 48,
  },
]

async function readSourcePriorities() {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_source_priorities")
    .select("source_system, label, priority, trust_tier, is_primary, read_policy, write_policy, freshness_window_hours")
    .order("priority", { ascending: true })
    .limit(50)

  if (error || !data?.length) {
    return {
      rows: FALLBACK_SOURCE_PRIORITIES,
      source: error ? "fallback_missing_table" : "fallback_empty_table",
      error: error?.message,
    }
  }

  return {
    rows: data as SourcePriorityRow[],
    source: "database",
  }
}

async function readQueryCatalog() {
  const syncPreflight = getXiaoshouyiSyncPreflight()
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
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
      ].join(", ")
    )
    .eq("is_default_enabled", true)
    .order("sync_priority", { ascending: true })
    .limit(50)

  if (error || !data?.length) {
    return {
      rows: syncPreflight.objects.map((object, index): QueryCatalogRow => ({
        object_api_key: object.objectApiKey,
        source_system: "xiaoshouyi",
        fields: object.fields,
        where_clause: null,
        order_by: object.orderBy,
        page_size: syncPreflight.pageSize,
        max_pages: syncPreflight.maxPages,
        sync_priority: (index + 1) * 10,
        is_default_enabled: true,
        is_write_allowed: false,
      })),
      source: error ? "fallback_runtime_config" : "fallback_runtime_config_empty_table",
      error: error?.message,
      syncPreflight,
    }
  }

  return {
    rows: data as unknown as QueryCatalogRow[],
    source: "database",
    syncPreflight,
  }
}

export async function getAdminCrmMcpContext() {
  const [sourcePriorities, queryCatalog] = await Promise.all([
    readSourcePriorities(),
    readQueryCatalog(),
  ])
  const configured = queryCatalog.syncPreflight.configured

  return {
    generatedAt: new Date().toISOString(),
    purpose:
      "Compact, secret-free CRM context for MCP/subagent loaders before pulling raw CRM, lead, or spreadsheet data.",
    sourcePriority: {
      policy:
        "Use app_v2 and Xiaoshouyi/eeoCRM as primary CRM truth. Use leads as high-priority intake. Use Branch REV sheets only as supporting comparison unless a source link is confirmed.",
      catalogSource: sourcePriorities.source,
      rows: sourcePriorities.rows,
      error: sourcePriorities.error,
    },
    xiaoshouyi: {
      configured,
      authMode: queryCatalog.syncPreflight.authMode,
      pageSize: queryCatalog.syncPreflight.pageSize,
      maxPages: queryCatalog.syncPreflight.maxPages,
      queryCatalogSource: queryCatalog.source,
      queryCatalog: queryCatalog.rows,
      error: queryCatalog.error,
    },
    matching: {
      normalizedNameFunction: "normalizeCrmName",
      secondarySignals: ["manager_name", "owner_name", "lead_assigned_to", "crm_match_aliases", "confirmed_lead_links"],
      reviewThreshold: {
        normalCandidate: 0.72,
        secondaryEvidenceCandidate: 0.45,
      },
      targetTypes: ["partner_account", "customer", "deal"],
    },
    endpoints: [
      { method: "GET", path: "/api/admin/crm/readiness", use: "schema, credential, and contract readiness" },
      { method: "GET", path: "/api/admin/crm/overview", use: "admin CRM dashboard summary" },
      { method: "GET", path: "/api/admin/crm/revenue", use: "CRM revenue/source-link dashboard data" },
      { method: "POST", path: "/api/admin/crm/external-sync", use: "server-side Xiaoshouyi snapshot sync" },
      { method: "POST", path: "/api/admin/crm/source-links/generate", use: "generate CRM-first source-link candidates" },
      { method: "GET", path: "/api/admin/crm/source-links/targets", use: "manual fuzzy target search" },
      { method: "POST", path: "/api/admin/crm/source-links/manual", use: "add manual source-link candidate" },
      { method: "GET", path: "/api/admin/crm/mcp-context", use: "compact MCP/subagent loader context" },
    ],
    mcpPolicy: {
      personalOAuth: "inspection_only",
      serverSync: "service_credential_or_access_token",
      dataExchange:
        "Load this context first, then pull bounded dashboard or snapshot pages. Do not shuttle raw CRM payloads through MCP unless a task explicitly needs row-level evidence.",
      writes:
        "External CRM writes must be created as crm_write_requests, approved by an admin, and executed through the server-side write route.",
    },
  }
}
