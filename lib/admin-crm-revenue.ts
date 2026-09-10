import "server-only"

import { unstable_cache } from "next/cache"
import { shareInFlight } from "@/lib/server/share-in-flight"

import { getBranchRevSourceRecordKey, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { readRevDealsFromActiveImport } from "@/lib/repositories/sales-ledger-imports"
import { fyOf } from "@/lib/branch/fiscal"
import { dealHasColorData, splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import type {
  CrmRevenueDashboard,
  CrmRevenueDocumentRow,
  CrmRevenueExternalLinkRow,
  CrmRevenueExternalRecordRow,
  CrmRevenueExternalSnapshotObjectRow,
  CrmRevenueExternalSnapshotSummary,
  CrmRevenueIdentitySummary,
  CrmRevenueMonthlyPoint,
  CrmRevenuePartnerRow,
  CrmRevenueRiskItem,
  CrmRevenueSheetMatchRow,
  CrmRevenueSheetSummary,
  CrmRevenueSource,
  CrmRevenueWriteRequestRow,
  CrmSourceLinkStatus,
  CrmWriteRequestOperation,
  CrmWriteRequestStatus,
} from "@/lib/admin-crm-revenue-types"

interface LegacyPartnerRow {
  id: string
  name: string
  status: string
  created_at: string
  updated_at: string
}

interface LegacyQuoteRow {
  id: string
  quote_number: string
  partner_id: string
  title: string
  status: string
  total_amount: number
  sent_at: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

interface LegacyContractRow {
  id: string
  contract_number: string
  partner_id: string
  quote_id: string | null
  title: string
  status: string
  total_amount: number
  partner_signed_at: string | null
  admin_signed_at: string | null
  created_at: string
  updated_at: string
}

interface LegacyReceiptRow {
  id: string
  receipt_number: string
  contract_id: string
  partner_id: string
  total_amount: number
  payment_method: string
  paid_at: string | null
  created_at: string
  updated_at: string
}

interface PartnerAccountRow {
  id: string
  name: string
  status: string
  updated_at: string
}

interface CustomerRow {
  id: string
  partner_account_id: string
  name: string
  campus_name: string | null
  region_label: string | null
  updated_at: string
}

interface DealRow {
  id: string
  partner_account_id: string
  customer_id: string
  deal_code: string
  title: string
  status: string
  current_stage: string
  expected_amount: number
  contracted_amount: number
  installed_amount: number
  paid_amount: number
  outstanding_amount: number
  payment_status: string
  closed_at: string | null
  created_at: string
  updated_at: string
}

interface SheetRevDealRow {
  id: string
  sheet_row: number
  customer_name: string
  team: string | null
  manager: string | null
  status: string | null
  first_payment: string | null
  contract_target: number | null
  monthly_payments: Record<string, number> | null
  monthly_red: Record<string, boolean> | null
  monthly_confirmed?: Record<string, number> | null
  monthly_high_conf?: Record<string, number> | null
  synced_at: string
}

interface CrmSourceLinkRow {
  id: string
  source_system: string
  source_object: string
  source_record_key: string
  normalized_name: string | null
  target_type: string
  target_id: string
  confidence: number | null
  status: CrmSourceLinkStatus
  metadata: Record<string, unknown> | null
  confirmed_at: string | null
  updated_at: string
}

interface ExternalCrmRecordRow {
  id: string
  source_system: string
  object_api_key: string
  external_id: string
  normalized_name: string | null
  display_name: string | null
  owner_name: string | null
  status: string | null
  amount: number | null
  occurred_at: string | null
  synced_at: string
  updated_at: string
}

interface ExternalCrmSyncRunRow {
  id: string
  source_system: string
  object_api_key: string
  status: string
  trigger: string
  started_at: string
  finished_at: string | null
  rows_scanned: number | null
  rows_upserted: number | null
  cursor_value: string | null
  error: string | null
  metadata: Record<string, unknown> | null
  updated_at: string
}

interface CrmWriteRequestRow {
  id: string
  source_system: string
  object_api_key: string
  external_id: string | null
  operation: CrmWriteRequestOperation
  status: CrmWriteRequestStatus
  payload: Record<string, unknown> | null
  preview_payload: Record<string, unknown> | null
  approved_at: string | null
  executed_at: string | null
  attempt_count: number | null
  last_attempt_at: string | null
  next_retry_at: string | null
  last_attempt_error: string | null
  error: string | null
  created_at: string
  updated_at: string
}

interface QueryResult<T> {
  rows: T[]
  source: CrmRevenueSource
  warning: string | null
  limit: number | null
}

// 대시보드 조립은 14개 테이블을 병렬 스캔하는 무거운 경로다. 짧은 TTL 캐시를 씌워
// 연속 요청(폴링·새로고침)의 Supabase 왕복을 없앤다. 앱 밖(임포트/동기화) 변경은 최대 45초 지연 허용.
export const ADMIN_CRM_REVENUE_CACHE_TAG = "admin-crm-revenue"
const ADMIN_CRM_REVENUE_REVALIDATE_SECONDS = 45
// getAdminCrmRevenueDashboard(months)가 받는 범위의 상한(=clamp 상한과 동일).
const ADMIN_CRM_REVENUE_MAX_MONTHS = 12

// 시트 status는 자유 입력이라 enum이 없다. 취소·중단 계열 키워드만 예상 매출에서 제외한다.
const SHEET_INACTIVE_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i
const CRM_WRITE_REQUEST_BASE_SELECT =
  "id, source_system, object_api_key, external_id, operation, status, payload, preview_payload, approved_at, executed_at, error, created_at, updated_at"
const CRM_WRITE_REQUEST_RETRY_SELECT =
  `${CRM_WRITE_REQUEST_BASE_SELECT}, attempt_count, last_attempt_at, next_retry_at, last_attempt_error`
const CRM_WRITE_REQUEST_RETRY_COLUMNS = ["attempt_count", "last_attempt_at", "next_retry_at", "last_attempt_error"]
const QUERY_LIMITS = {
  defaultRows: 1000,
  sourceLinks: 2000,
  externalRecords: 2000,
  syncRuns: 200,
  writeRequests: 200,
} as const
const DISPLAY_LIMITS = {
  sheetMatches: 12,
  externalRecords: 48,
  externalLinks: 20,
  writeRequests: 20,
  partners: 10,
  risks: 8,
  documents: 20,
} as const
const EXTERNAL_CRM_OBJECTS = [
  "account",
  "contact",
  "opportunity",
  "ShroffAccount__c",
  "Collection__c",
  "SalesPerformance__c",
  "CollectionPlan__c",
  "FinancialInformation__c",
  "ResourceInformation__c",
]
const EXTERNAL_CRM_PREVIEW_PER_OBJECT = 5
const EXTERNAL_CRM_RECORD_SELECT =
  "id, source_system, object_api_key, external_id, normalized_name, display_name, owner_name, status, amount, occurred_at, synced_at, updated_at"
// 집계(getAdminCrmRevenueDashboard)가 실제로 참조하는 REV 시트 컬럼만 읽는다.
// monthly_confirmed/monthly_high_conf/monthly_red는 색 금액 분해용(optional, ?? {}로 방어),
// 대형 raw JSON blob은 집계에서 쓰지 않으므로 제외해 전송량을 줄인다.
const BRANCH_REV_DEAL_AGGREGATION_SELECT =
  "id, sheet_row, customer_name, team, manager, status, first_payment, contract_target, monthly_payments, monthly_red, monthly_confirmed, monthly_high_conf, synced_at"

function hasValue(value: string | undefined) {
  return Boolean(value?.trim())
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getMetadataNumber(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  if (value == null || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getMonthKey(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function getMonthKeys(months: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const keys: string[] = []

  for (let index = 0; index < months; index += 1) {
    const current = new Date(start.getFullYear(), start.getMonth() + index, 1)
    keys.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`)
  }

  return keys
}

function sumBy<T>(rows: T[], selector: (row: T) => number | null | undefined) {
  return rows.reduce((sum, row) => sum + Number(selector(row) ?? 0), 0)
}

function getSheetDealAmount(deal: SheetRevDealRow) {
  return sumBy(Object.values(deal.monthly_payments ?? {}), (amount) => Number(amount) || 0)
}

function maxDate(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null
}

function getExternalSource(
  key: string,
  label: string,
  configured: boolean,
  description: string,
  actionHref?: string
): CrmRevenueSource {
  return {
    key,
    label,
    status: configured ? "configured" : "not_configured",
    mode: "planned",
    recordCount: 0,
    latencyMs: null,
    lastSyncedAt: null,
    description,
    actionLabel: configured ? "읽기 연결 준비됨" : "환경변수 연결 필요",
    actionHref,
  }
}

function buildExternalCrmSource(
  recordsResult: QueryResult<ExternalCrmRecordRow>,
  syncRunsResult: QueryResult<ExternalCrmSyncRunRow>,
  writeRequestsResult: QueryResult<CrmWriteRequestRow>
): CrmRevenueSource {
  if (
    recordsResult.source.status === "error" ||
    syncRunsResult.source.status === "error" ||
    writeRequestsResult.source.status === "error"
  ) {
    return {
      key: "xiaoshouyi_snapshot",
      label: "Xiaoshouyi CRM Snapshot",
      status: "error",
      mode: "read",
      recordCount: recordsResult.source.recordCount,
      latencyMs:
        (recordsResult.source.latencyMs ?? 0) +
        (syncRunsResult.source.latencyMs ?? 0) +
        (writeRequestsResult.source.latencyMs ?? 0),
      lastSyncedAt: maxDate([
        ...recordsResult.rows.map((record) => record.synced_at),
        ...syncRunsResult.rows.map((run) => run.finished_at ?? run.started_at),
      ]),
      description: "외부 CRM snapshot 테이블을 읽는 중 오류가 발생했습니다.",
    }
  }

  const hasBaseUrl =
    hasValue(process.env.XIAOSHOUYI_BASE_URL) ||
    hasValue(process.env.XIAOSHOUYI_API_BASE_URL) ||
    hasValue(process.env.XIAOSHOUYI_API_URL) ||
    hasValue(process.env.COMPANY_CRM_API_URL) ||
    hasValue(process.env.CRM_API_URL)
  const hasToken =
    hasValue(process.env.XIAOSHOUYI_ACCESS_TOKEN) ||
    hasValue(process.env.XIAOSHOUYI_SERVICE_ACCESS_TOKEN)
  const hasServiceCredentials =
    hasValue(process.env.XIAOSHOUYI_CLIENT_ID) &&
    hasValue(process.env.XIAOSHOUYI_CLIENT_SECRET) &&
    (hasValue(process.env.XIAOSHOUYI_USERNAME) || hasValue(process.env.XIAOSHOUYI_SERVICE_USERNAME)) &&
    (hasValue(process.env.XIAOSHOUYI_PASSWORD) || hasValue(process.env.XIAOSHOUYI_SERVICE_PASSWORD))
  const configured = hasBaseUrl && (hasToken || hasServiceCredentials)
  const objectKeys = new Set(recordsResult.rows.map((record) => record.object_api_key))
  const loadedRecordCount = Math.max(recordsResult.source.recordCount, recordsResult.rows.length)
  const pendingWrites = writeRequestsResult.rows.filter((request) =>
    ["draft", "approved", "sent"].includes(request.status)
  ).length
  const failedRuns = syncRunsResult.rows.filter((run) => run.status === "failed").length
  const skippedRuns = syncRunsResult.rows.filter((run) => run.status === "skipped").length
  const latestRun = syncRunsResult.rows[0] ?? null
  const latestSuccessRun = syncRunsResult.rows.find((run) => run.status === "success") ?? null
  const latestMetadata = latestSuccessRun?.metadata ?? latestRun?.metadata ?? null
  const pagesScanned = getMetadataNumber(latestMetadata, "pagesScanned")
  const staleMarked = getMetadataNumber(latestMetadata, "staleMarked")
  const truncated = latestMetadata?.truncated === true
  const cursorValue = latestSuccessRun?.cursor_value ?? latestRun?.cursor_value ?? null
  const syncDetails = [
    pagesScanned == null ? null : `최근 sync ${pagesScanned}페이지`,
    staleMarked == null ? null : `stale ${staleMarked}건`,
    truncated && cursorValue ? `cursor ${cursorValue}` : null,
  ].filter(Boolean)

  return {
    key: "xiaoshouyi_snapshot",
    label: "Xiaoshouyi CRM Snapshot",
    status: loadedRecordCount > 0 ? "connected" : configured ? "configured" : "not_configured",
    mode: "read",
    recordCount: loadedRecordCount,
    latencyMs:
      (recordsResult.source.latencyMs ?? 0) +
      (syncRunsResult.source.latencyMs ?? 0) +
      (writeRequestsResult.source.latencyMs ?? 0),
    lastSyncedAt: maxDate([
      ...recordsResult.rows.map((record) => record.synced_at),
      ...syncRunsResult.rows.map((run) => run.finished_at ?? run.started_at),
    ]),
    description:
      loadedRecordCount > 0
        ? `${objectKeys.size}개 객체 preview · ${loadedRecordCount.toLocaleString("ko-KR")} snapshot records. ${syncDetails.length > 0 ? `${syncDetails.join(", ")}. ` : ""}대기 중인 write request ${pendingWrites}건, 실패 sync ${failedRuns}건, skipped ${skippedRuns}건.`
        : configured
          ? `외부 CRM credential은 준비됐지만 아직 snapshot 레코드가 없습니다.${syncDetails.length > 0 ? ` 최근 상태: ${syncDetails.join(", ")}.` : ""}`
          : hasBaseUrl
            ? "Xiaoshouyi base URL은 있으나 token/service credential이 없어 sync를 건너뜁니다."
            : skippedRuns > 0
              ? `Xiaoshouyi credential 미설정으로 최근 sync ${skippedRuns}건을 건너뛰었습니다.`
              : "Xiaoshouyi/eeoCRM은 read-only snapshot sync부터 연결합니다.",
    actionLabel: configured || loadedRecordCount > 0 ? "Snapshot 상태 확인" : "환경변수 연결 필요",
    actionHref: "/admin/settings",
  }
}

async function runQuery<T>(
  key: string,
  label: string,
  promise: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  limit: number | null = null
): Promise<QueryResult<T>> {
  const startedAt = Date.now()

  try {
    const { data, error } = await promise
    const latencyMs = Date.now() - startedAt

    if (error) {
      return {
        rows: [],
        warning: `${label}: ${error.message}`,
        limit,
        source: {
          key,
          label,
          status: "error",
          mode: "read",
          recordCount: 0,
          latencyMs,
          lastSyncedAt: null,
          description: "읽기 중 오류가 발생했습니다.",
        },
      }
    }

    const rows = (data ?? []) as T[]
    return {
      rows,
      warning: null,
      limit,
      source: {
        key,
        label,
        status: "connected",
        mode: "read",
        recordCount: rows.length,
        latencyMs,
        lastSyncedAt: maxDate(rows.map((row) => (row as { updated_at?: string }).updated_at)),
        description: "필요 필드만 읽어 집계합니다.",
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류"
    return {
      rows: [],
      warning: `${label}: ${message}`,
      limit,
      source: {
        key,
        label,
        status: "error",
        mode: "read",
        recordCount: 0,
        latencyMs: Date.now() - startedAt,
        lastSyncedAt: null,
        description: "읽기 중 오류가 발생했습니다.",
      },
    }
  }
}

async function getExternalCrmSnapshotQuery(
  supabase: ReturnType<typeof createSupabaseAdminClient>
): Promise<QueryResult<ExternalCrmRecordRow> & { summary: CrmRevenueExternalSnapshotSummary | null }> {
  const startedAt = Date.now()

  try {
    // 팬아웃 축소: object별 COUNT head 쿼리 + 전체 stale count를 단일 집계 뷰로 대체하고,
    // 렌더 rows를 채우는 per-object 미리보기 쿼리만 개별 실행한다. 뷰가 아직 배포되지 않은
    // DB에서는 뷰 쿼리가 relation/permission 오류로 실패하므로, 그때는 기존 per-object count
    // 팬아웃으로 폴백한다(마이그레이션 적용 전/후 모두 동작).
    const [snapshotResult, previewResults] = await Promise.all([
      supabase
        .from("external_crm_object_snapshot")
        .select("object_api_key, active_count, latest_synced_at, stale_count")
        .eq("source_system", "xiaoshouyi"),
      Promise.all(
        EXTERNAL_CRM_OBJECTS.map(async (objectApiKey) => {
          const rowsResult = await supabase
            .from("external_crm_records")
            .select(EXTERNAL_CRM_RECORD_SELECT)
            .eq("source_system", "xiaoshouyi")
            .eq("object_api_key", objectApiKey)
            .eq("is_stale", false)
            .order("synced_at", { ascending: false })
            .limit(EXTERNAL_CRM_PREVIEW_PER_OBJECT)

          return {
            objectApiKey,
            rowsResult,
          }
        })
      ),
    ])

    const latencyMs = Date.now() - startedAt

    const previewError = previewResults.find((result) => result.rowsResult.error)?.rowsResult.error
    if (previewError) {
      return {
        rows: [],
        warning: `External CRM Snapshot: ${previewError.message}`,
        limit: null,
        summary: null,
        source: {
          key: "external_crm_records",
          label: "External CRM Snapshot",
          status: "error",
          mode: "read",
          recordCount: 0,
          latencyMs,
          lastSyncedAt: null,
          description: "Neo CRM snapshot read failed.",
        },
      }
    }

    // 뷰 집계 경로: object_api_key로 인덱싱해 EXTERNAL_CRM_OBJECTS 순서로 재구성한다.
    // 뷰 쿼리가 실패하면 per-object count 팬아웃으로 폴백해 동일한 집계를 얻는다.
    let objectCountMap: Map<string, { activeCount: number; latestSyncedAt: string | null }>
    let staleRecordCount: number

    if (snapshotResult.error) {
      const countFanout = await Promise.all([
        Promise.all(
          EXTERNAL_CRM_OBJECTS.map(async (objectApiKey) => {
            const countResult = await supabase
              .from("external_crm_records")
              .select("id", { count: "exact", head: true })
              .eq("source_system", "xiaoshouyi")
              .eq("object_api_key", objectApiKey)
              .eq("is_stale", false)
            return { objectApiKey, countResult }
          })
        ),
        supabase
          .from("external_crm_records")
          .select("id", { count: "exact", head: true })
          .eq("source_system", "xiaoshouyi")
          .eq("is_stale", true),
      ])
      const [fanoutObjects, fanoutStale] = countFanout

      const fanoutError = fanoutObjects.find((result) => result.countResult.error)?.countResult.error ?? fanoutStale.error
      if (fanoutError) {
        return {
          rows: [],
          warning: `External CRM Snapshot: ${fanoutError.message}`,
          limit: null,
          summary: null,
          source: {
            key: "external_crm_records",
            label: "External CRM Snapshot",
            status: "error",
            mode: "read",
            recordCount: 0,
            latencyMs: Date.now() - startedAt,
            lastSyncedAt: null,
            description: "Neo CRM snapshot read failed.",
          },
        }
      }

      objectCountMap = new Map(
        fanoutObjects.map((result) => [
          result.objectApiKey,
          { activeCount: result.countResult.count ?? 0, latestSyncedAt: null as string | null },
        ])
      )
      staleRecordCount = fanoutStale.count ?? 0
    } else {
      const snapshotRows = (snapshotResult.data ?? []) as Array<{
        object_api_key: string
        active_count: number | null
        latest_synced_at: string | null
        stale_count: number | null
      }>
      objectCountMap = new Map(
        snapshotRows.map((row) => [
          row.object_api_key,
          { activeCount: Number(row.active_count ?? 0), latestSyncedAt: row.latest_synced_at ?? null },
        ])
      )
      staleRecordCount = snapshotRows.reduce((sum, row) => sum + Number(row.stale_count ?? 0), 0)
    }

    const objectCounts: CrmRevenueExternalSnapshotObjectRow[] = EXTERNAL_CRM_OBJECTS.map((objectApiKey) => {
      const previewRows = ((previewResults.find((result) => result.objectApiKey === objectApiKey)?.rowsResult.data ??
        []) as ExternalCrmRecordRow[])
      const aggregate = objectCountMap.get(objectApiKey)
      return {
        objectApiKey,
        recordCount: aggregate?.activeCount ?? 0,
        latestSyncedAt: aggregate?.latestSyncedAt ?? maxDate(previewRows.map((row) => row.synced_at)),
      }
    })
    const rows = previewResults
      .flatMap((result) => (result.rowsResult.data ?? []) as ExternalCrmRecordRow[])
      .slice(0, DISPLAY_LIMITS.externalRecords)
    const totalRecordCount = objectCounts.reduce((sum, object) => sum + object.recordCount, 0)
    const latestSyncedAt = maxDate([
      ...objectCounts.map((object) => object.latestSyncedAt),
      ...rows.map((row) => row.synced_at),
    ])
    const summary: CrmRevenueExternalSnapshotSummary = {
      totalRecordCount,
      staleRecordCount,
      latestSyncedAt,
      objectCounts,
    }

    return {
      rows,
      warning: null,
      limit: null,
      summary,
      source: {
        key: "external_crm_records",
        label: "External CRM Snapshot",
        status: totalRecordCount > 0 ? "connected" : "not_configured",
        mode: "read",
        recordCount: totalRecordCount,
        latencyMs,
        lastSyncedAt: latestSyncedAt,
        description: `${totalRecordCount.toLocaleString("ko-KR")} Neo CRM snapshot records loaded.`,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    return {
      rows: [],
      warning: `External CRM Snapshot: ${message}`,
      limit: null,
      summary: null,
      source: {
        key: "external_crm_records",
        label: "External CRM Snapshot",
        status: "error",
        mode: "read",
        recordCount: 0,
        latencyMs: Date.now() - startedAt,
        lastSyncedAt: null,
        description: "Neo CRM snapshot read failed.",
      },
    }
  }
}

function createEmptyDashboard(months: number, warnings: string[]): CrmRevenueDashboard {
  const monthKeys = getMonthKeys(months)

  return {
    generatedAt: new Date().toISOString(),
    range: {
      months,
      startMonth: monthKeys[0],
      endMonth: monthKeys[monthKeys.length - 1],
    },
    summary: {
      quotedAmount: 0,
      acceptedQuoteAmount: 0,
      deliveryTotalAmount: 0,
      contractedAmount: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      expectedPipelineAmount: 0,
      activeDealCount: 0,
      customerCount: 0,
      partnerCount: 0,
      sourceRecordCount: 0,
    },
    sheet: null,
    identity: null,
    sheetMatches: [],
    externalSnapshot: null,
    externalRecords: [],
    externalLinks: [],
    writeRequests: [],
    monthly: monthKeys.map((month) => ({
      month,
      quotedAmount: 0,
      contractedAmount: 0,
      paidAmount: 0,
      expectedAmount: 0,
      sheetConfirmedAmount: 0,
      sheetHighConfidenceAmount: 0,
      sheetExpectedAmount: 0,
    })),
    partners: [],
    risks: [],
    documents: [],
    sources: [
      getExternalSource(
        "xiaoshouyi_snapshot",
        "Xiaoshouyi CRM Snapshot",
        hasValue(process.env.XIAOSHOUYI_BASE_URL) ||
          hasValue(process.env.XIAOSHOUYI_API_BASE_URL) ||
          hasValue(process.env.XIAOSHOUYI_API_URL) ||
          hasValue(process.env.COMPANY_CRM_API_URL) ||
          hasValue(process.env.CRM_API_URL),
        "외부 CRM은 read-only snapshot sync부터 연결합니다."
      ),
      getExternalSource(
        "crm_sheet",
        "회사 시트",
        hasValue(process.env.CRM_SHEET_ID) || hasValue(process.env.GOOGLE_SHEETS_CRM_SPREADSHEET_ID),
        "시트는 원본이 아니라 import/sync 보조 소스로 취급합니다."
      ),
    ],
    warnings,
  }
}

function addMonthlyAmount(
  monthly: Map<string, CrmRevenueMonthlyPoint>,
  dateValue: string | null | undefined,
  key: keyof Omit<CrmRevenueMonthlyPoint, "month">,
  amount: number
) {
  const month = getMonthKey(dateValue)
  if (!month) return
  addMonthlyAmountByKey(monthly, month, key, amount)
}

// 시트 데이터는 이미 "YYYY-MM" 키라서 Date 파싱(타임존 의존)을 거치지 않고 직접 귀속한다.
function addMonthlyAmountByKey(
  monthly: Map<string, CrmRevenueMonthlyPoint>,
  monthKey: string,
  key: keyof Omit<CrmRevenueMonthlyPoint, "month">,
  amount: number
) {
  const point = monthly.get(monthKey)
  if (!point) return
  point[key] += amount
}

function getQueryLimitWarning<T>(result: QueryResult<T>) {
  if (!result.limit || result.source.status === "error" || result.rows.length < result.limit) return null
  return `${result.source.label}: ${result.limit.toLocaleString("ko-KR")}건까지만 로드했습니다. 전체 정리를 위해 pagination/export가 필요할 수 있습니다.`
}

function getDisplayLimitWarning(label: string, totalRows: number, displayedRows: number) {
  if (totalRows <= displayedRows) return null
  return `${label}: 화면에는 ${displayedRows.toLocaleString("ko-KR")} / ${totalRows.toLocaleString("ko-KR")}건만 표시됩니다.`
}

function getPartnerAccumulator(
  rows: Map<string, CrmRevenuePartnerRow>,
  id: string,
  name: string
) {
  const current = rows.get(id)
  if (current) return current

  const next: CrmRevenuePartnerRow = {
    id,
    name,
    quotedAmount: 0,
    contractedAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    activeDealCount: 0,
    latestActivityAt: null,
  }
  rows.set(id, next)
  return next
}

// 캐시된 조립은 항상 최대 범위(12개월)로 계산한다 — 아래 getAdminCrmRevenueDashboard(months)
// 참고: 14개 테이블 쿼리가 전부 updated_at 최신순 limit이라 이 조립 자체는 months와 무관하게
// 같은 행을 읽으므로, 인자를 받지 않아야 unstable_cache가 요청마다 다른 캐시 키를 만들지 않는다.
async function assembleAdminCrmRevenueDashboard(): Promise<CrmRevenueDashboard> {
  const safeMonths = ADMIN_CRM_REVENUE_MAX_MONTHS
  const monthKeys = getMonthKeys(safeMonths)
  const monthly = new Map<string, CrmRevenueMonthlyPoint>(
    monthKeys.map((month) => [
      month,
      {
        month,
        quotedAmount: 0,
        contractedAmount: 0,
        paidAmount: 0,
        expectedAmount: 0,
        sheetConfirmedAmount: 0,
        sheetHighConfidenceAmount: 0,
        sheetExpectedAmount: 0,
      },
    ])
  )

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase 서버 환경이 설정되지 않았습니다."
    return createEmptyDashboard(safeMonths, [message])
  }

  const [
    partnersResult,
    quotesResult,
    contractsResult,
    receiptsResult,
    accountsResult,
    customersResult,
    dealsResult,
    sheetResult,
    sourceLinksResult,
    externalSourceLinksResult,
    externalSnapshotResult,
    externalSyncRunsResult,
    writeRequestsResult,
  ] =
    await Promise.all([
      runQuery<LegacyPartnerRow>(
        "legacy_partners",
        "레거시 파트너",
        supabase
          .from("partners")
          .select("id, name, status, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<LegacyQuoteRow>(
        "legacy_quotes",
        "견적",
        supabase
          .from("quotes")
          .select("id, quote_number, partner_id, title, status, total_amount, sent_at, accepted_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<LegacyContractRow>(
        "legacy_contracts",
        "계약",
        supabase
          .from("contracts")
          .select("id, contract_number, partner_id, quote_id, title, status, total_amount, partner_signed_at, admin_signed_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<LegacyReceiptRow>(
        "legacy_receipts",
        "수납/영수증",
        supabase
          .from("receipts")
          .select("id, receipt_number, contract_id, partner_id, total_amount, payment_method, paid_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<PartnerAccountRow>(
        "partner_accounts",
        "파트너 계정",
        supabase
          .from("partner_accounts")
          .select("id, name, status, updated_at")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<CustomerRow>(
        "customers",
        "고객사",
        supabase
          .from("customers")
          .select("id, partner_account_id, name, campus_name, region_label, updated_at")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<DealRow>(
        "deals",
        "거래 파이프라인",
        supabase
          .from("deals")
          .select("id, partner_account_id, customer_id, deal_code, title, status, current_stage, expected_amount, contracted_amount, installed_amount, paid_amount, outstanding_amount, payment_status, closed_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<SheetRevDealRow>(
        "crm_sheet",
        "회사 시트 (REV)",
        // 집계가 실제로 읽는 컬럼만 명시한다. 대형 raw JSON blob은 제외.
        supabase
          .from("branch_rev_deals")
          .select(BRANCH_REV_DEAL_AGGREGATION_SELECT)
          .limit(QUERY_LIMITS.defaultRows),
        QUERY_LIMITS.defaultRows
      ),
      runQuery<CrmSourceLinkRow>(
        "crm_source_links",
        "REV 매칭 링크",
        supabase
          .from("crm_source_links")
          .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at")
          .eq("source_system", "branch_rev_sheet")
          .eq("source_object", "branch_rev_deals")
          .limit(QUERY_LIMITS.sourceLinks),
        QUERY_LIMITS.sourceLinks
      ),
      runQuery<CrmSourceLinkRow>(
        "xiaoshouyi_source_links",
        "Xiaoshouyi 매칭 링크",
        supabase
          .from("crm_source_links")
          .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at")
          .eq("source_system", "xiaoshouyi")
          .order("updated_at", { ascending: false })
          .limit(QUERY_LIMITS.sourceLinks),
        QUERY_LIMITS.sourceLinks
      ),
      getExternalCrmSnapshotQuery(supabase),
      runQuery<ExternalCrmSyncRunRow>(
        "external_crm_sync_runs",
        "외부 CRM Sync",
        supabase
          .from("external_crm_sync_runs")
          .select("id, source_system, object_api_key, status, trigger, started_at, finished_at, rows_scanned, rows_upserted, cursor_value, error, metadata, updated_at")
          .eq("source_system", "xiaoshouyi")
          .order("started_at", { ascending: false })
          .limit(QUERY_LIMITS.syncRuns),
        QUERY_LIMITS.syncRuns
      ),
      runQuery<CrmWriteRequestRow>(
        "crm_write_requests",
        "CRM 쓰기 요청",
        (async () => {
          const query = (select: string) =>
            supabase
              .from("crm_write_requests")
              .select(select)
              .eq("source_system", "xiaoshouyi")
              .order("created_at", { ascending: false })
              .limit(QUERY_LIMITS.writeRequests)

          const withRetryState = await query(CRM_WRITE_REQUEST_RETRY_SELECT)
          if (!withRetryState.error) return withRetryState

          const missingRetryColumn = CRM_WRITE_REQUEST_RETRY_COLUMNS.some((column) =>
            withRetryState.error?.message.includes(column)
          )
          if (!missingRetryColumn) return withRetryState

          return query(CRM_WRITE_REQUEST_BASE_SELECT)
        })(),
        QUERY_LIMITS.writeRequests
      ),
    ])

  const warnings = [
    partnersResult.warning,
    quotesResult.warning,
    contractsResult.warning,
    receiptsResult.warning,
    accountsResult.warning,
    customersResult.warning,
    dealsResult.warning,
    sheetResult.warning,
    sourceLinksResult.warning,
    externalSourceLinksResult.warning,
    externalSnapshotResult.warning,
    externalSyncRunsResult.warning,
    writeRequestsResult.warning,
    getQueryLimitWarning(partnersResult),
    getQueryLimitWarning(quotesResult),
    getQueryLimitWarning(contractsResult),
    getQueryLimitWarning(receiptsResult),
    getQueryLimitWarning(accountsResult),
    getQueryLimitWarning(customersResult),
    getQueryLimitWarning(dealsResult),
    getQueryLimitWarning(sheetResult),
    getQueryLimitWarning(sourceLinksResult),
    getQueryLimitWarning(externalSourceLinksResult),
    getQueryLimitWarning(externalSnapshotResult),
    getQueryLimitWarning(externalSyncRunsResult),
    getQueryLimitWarning(writeRequestsResult),
  ].filter((warning): warning is string => Boolean(warning))

  const partners = partnersResult.rows
  const quotes = quotesResult.rows
  const contracts = contractsResult.rows
  const receipts = receiptsResult.rows
  const accounts = accountsResult.rows
  const customers = customersResult.rows
  const deals = dealsResult.rows
  // 시트 미러 fetch(runQuery)는 소스 카드 텔레메트리용으로 유지하되, 집계는 장부와
  // 동일한 REV 데이터셋 규약(DB-native 액티브 임포트 우선)을 따른다 — 미러에는 색(확도)
  // 데이터가 없는 행이 많아(2026-07 실측 310/398) 그대로 집계하면 장부 확정과 어긋난다.
  // record key(getBranchRevSourceRecordKey)는 sheet_row·고객명·first_payment·계약목표로
  // 유도되는 계산 필드라 두 데이터셋에서 동일하게 나온다(링크 매칭 무손실).
  const activeImportDeals = await readRevDealsFromActiveImport(fyOf(new Date())).catch(() => null)
  const sheetDeals = activeImportDeals ?? sheetResult.rows
  const sourceLinks = sourceLinksResult.rows
  const externalSourceLinks = externalSourceLinksResult.rows
  const externalRecordRows: CrmRevenueExternalRecordRow[] = externalSnapshotResult.rows.map((record) => ({
    objectApiKey: record.object_api_key,
    externalId: record.external_id,
    displayName: record.display_name,
    ownerName: record.owner_name,
    status: record.status,
    amount: record.amount,
    occurredAt: record.occurred_at,
    syncedAt: record.synced_at,
  }))
  const partnerNameById = new Map(partners.map((partner) => [partner.id, partner.name]))
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const customerNameById = new Map(
    customers.map((customer) => [
      customer.id,
      [customer.name, customer.campus_name].filter(Boolean).join(" · "),
    ])
  )
  const dealNameById = new Map(deals.map((deal) => [deal.id, `${deal.deal_code} · ${deal.title}`]))
  const partnerRows = new Map<string, CrmRevenuePartnerRow>()

  for (const quote of quotes) {
    const owner = getPartnerAccumulator(
      partnerRows,
      `legacy:${quote.partner_id}`,
      partnerNameById.get(quote.partner_id) ?? "미지정 파트너"
    )
    owner.quotedAmount += quote.total_amount
    owner.latestActivityAt = maxDate([owner.latestActivityAt, quote.updated_at, quote.accepted_at, quote.sent_at])
    addMonthlyAmount(monthly, quote.accepted_at ?? quote.sent_at ?? quote.created_at, "quotedAmount", quote.total_amount)
  }

  for (const contract of contracts.filter((item) => item.status !== "cancelled")) {
    const owner = getPartnerAccumulator(
      partnerRows,
      `legacy:${contract.partner_id}`,
      partnerNameById.get(contract.partner_id) ?? "미지정 파트너"
    )
    owner.contractedAmount += contract.total_amount
    owner.latestActivityAt = maxDate([owner.latestActivityAt, contract.updated_at, contract.admin_signed_at, contract.partner_signed_at])
    addMonthlyAmount(monthly, contract.admin_signed_at ?? contract.partner_signed_at ?? contract.created_at, "contractedAmount", contract.total_amount)
  }

  for (const receipt of receipts) {
    const owner = getPartnerAccumulator(
      partnerRows,
      `legacy:${receipt.partner_id}`,
      partnerNameById.get(receipt.partner_id) ?? "미지정 파트너"
    )
    owner.paidAmount += receipt.total_amount
    owner.latestActivityAt = maxDate([owner.latestActivityAt, receipt.paid_at, receipt.updated_at])
    addMonthlyAmount(monthly, receipt.paid_at ?? receipt.created_at, "paidAmount", receipt.total_amount)
  }

  for (const deal of deals) {
    const ownerId = `v2:${deal.partner_account_id}`
    const owner = getPartnerAccumulator(
      partnerRows,
      ownerId,
      accountNameById.get(deal.partner_account_id) ?? "미지정 파트너 계정"
    )
    owner.contractedAmount += deal.contracted_amount
    owner.paidAmount += deal.paid_amount
    owner.outstandingAmount += deal.outstanding_amount
    owner.latestActivityAt = maxDate([owner.latestActivityAt, deal.updated_at, deal.closed_at])
    if (deal.status === "active") owner.activeDealCount += 1
    addMonthlyAmount(monthly, deal.updated_at, "expectedAmount", deal.expected_amount)
  }

  // 시트(branch_rev_deals)는 고객명 문자열만 있어 앱 파트너와 조인할 수 없다.
  // 매칭 레이어 전까지는 합산하지 않고 비교용 지표(sheet)로만 집계한다.
  //
  // 시트 운영 규칙: 주차(w1~w5) 칸의 빨간 글자 = 확정 매출, 파란 글자 = 클로징 임박(90%+),
  // 나머지는 예상·목표. 파서가 월별 "금액" 맵(monthly_confirmed/monthly_high_conf)으로 분해해 둔다.
  // 색 데이터가 전혀 없는 행은 브랜치 집계(pipeline/summary)와 동일하게
  // 과거~당월분을 전액 확정으로 간주한다(색 규칙 도입 전 동기화분 fallback).
  const currentMonthKey = getMonthKey(new Date().toISOString()) ?? ""
  const activeSheetDeals = sheetDeals.filter((deal) => !SHEET_INACTIVE_PATTERN.test(deal.status ?? ""))
  let sheetConfirmedAmount = 0
  let sheetHighConfidenceAmount = 0
  let sheetExpectedAmount = 0
  let sheetUnconfirmedPastAmount = 0
  const sheetRisks: CrmRevenueRiskItem[] = []
  const sourceLinksByKey = new Map<string, CrmSourceLinkRow[]>()
  for (const link of sourceLinks) {
    const links = sourceLinksByKey.get(link.source_record_key) ?? []
    links.push(link)
    sourceLinksByKey.set(link.source_record_key, links)
  }
  const confirmedSheetKeys = new Set(
    sourceLinks
      .filter((link) => link.status === "confirmed")
      .map((link) => link.source_record_key)
  )
  // 확정 source link 기준으로 시트 금액을 매칭/미매칭으로 분리한다.
  // 매칭된 금액만 앱 매출과 대조(dedupe)할 수 있고, 미매칭 금액이 "따로 노는" 잔량이다.
  let sheetLinkedAmount = 0
  let sheetUnlinkedAmount = 0
  let sheetLinkedDealCount = 0
  const sheetMatches: CrmRevenueSheetMatchRow[] = []

  for (const deal of activeSheetDeals) {
    const recordKey = getBranchRevSourceRecordKey(deal)
    const links = sourceLinksByKey.get(recordKey) ?? []
    const sheetDealAmount = getSheetDealAmount(deal)
    // HW/SW/MKT 접두 임시 고객은 매칭 후순위라 linked/unlinked 분리 지표에서 제외한다.
    if (!isPlaceholderCrmName(deal.customer_name)) {
      if (confirmedSheetKeys.has(recordKey)) {
        sheetLinkedAmount += sheetDealAmount
        sheetLinkedDealCount += 1
      } else {
        sheetUnlinkedAmount += sheetDealAmount
      }
    }
    // 확도 3분해는 캐논 splitter(rev-confirmed.ts)로 일원화 — 무색상 행의 "과거~당월만
    // 전액 확정" 월 가드를 포함해 장부·주간마감과 동일한 규칙을 쓴다.
    const hasColorData = dealHasColorData(deal)
    let pastUnconfirmed = 0
    for (const [month, rawAmount] of Object.entries(deal.monthly_payments ?? {})) {
      const total = Number(rawAmount) || 0
      const {
        confirmed,
        highConfidence: highConf,
        expected: remaining,
      } = splitMonthConfidence(deal, month, total, hasColorData, currentMonthKey)

      if (confirmed > 0) {
        sheetConfirmedAmount += confirmed
        addMonthlyAmountByKey(monthly, month, "sheetConfirmedAmount", confirmed)
      }
      if (highConf > 0) {
        sheetHighConfidenceAmount += highConf
        addMonthlyAmountByKey(monthly, month, "sheetHighConfidenceAmount", highConf)
      }
      if (remaining > 0) {
        addMonthlyAmountByKey(monthly, month, "sheetExpectedAmount", remaining)
        if (month >= currentMonthKey) sheetExpectedAmount += remaining
        else pastUnconfirmed += remaining
      }
    }
    if (pastUnconfirmed > 0) {
      sheetUnconfirmedPastAmount += pastUnconfirmed
      sheetRisks.push({
        id: `sheet:${deal.id}`,
        title: deal.customer_name,
        ownerName: [deal.team, deal.manager].filter(Boolean).join(" · ") || "담당 미지정",
        amount: pastUnconfirmed,
        reason: "시트 과거 예정액 미확정",
        // 시트 리스크는 매출 장부 REV 렌즈에서 해당 고객 행으로 바로 검수한다.
        href: deal.customer_name
          ? `/admin/branch/ledger?lens=rev&q=${encodeURIComponent(deal.customer_name)}`
          : "/admin/branch/ledger?lens=rev",
      })
    }
    const baseMatch = {
      sheetRow: deal.sheet_row,
      customerName: deal.customer_name,
      ownerName: [deal.team, deal.manager].filter(Boolean).join(" · ") || "담당 미지정",
      status: deal.status,
      amount: getSheetDealAmount(deal),
      monthCount: Object.keys(deal.monthly_payments ?? {}).length,
    }

    if (links.length === 0) {
      sheetMatches.push({
        key: recordKey,
        linkId: null,
        ...baseMatch,
        linkStatus: null,
        targetType: null,
        targetId: null,
        targetLabel: null,
        confidence: null,
      })
    } else {
      for (const link of links) {
        sheetMatches.push({
          key: `${recordKey}:${link.id}`,
          linkId: link.id,
          ...baseMatch,
          linkStatus: link.status,
          targetType: link.target_type,
          targetId: link.target_id,
          targetLabel:
            typeof link.metadata?.target_label === "string" ? link.metadata.target_label : null,
          confidence: link.confidence,
        })
      }
    }
  }

  const sheetSummary: CrmRevenueSheetSummary | null =
    sheetResult.source.status === "connected"
      ? {
          targetAmount: sumBy(activeSheetDeals, (deal) => deal.contract_target),
          confirmedAmount: sheetConfirmedAmount,
          highConfidenceAmount: sheetHighConfidenceAmount,
          expectedAmount: sheetExpectedAmount,
          unconfirmedPastAmount: sheetUnconfirmedPastAmount,
          dealCount: sheetDeals.length,
          activeDealCount: activeSheetDeals.length,
          linkedDealCount: sheetLinkedDealCount,
          linkedAmount: sheetLinkedAmount,
          unlinkedAmount: sheetUnlinkedAmount,
        }
      : null

  // 미매칭 카운트도 임시(placeholder) 고객을 제외한 실제 매칭 대상 기준으로 계산한다.
  const matchableSheetDeals = activeSheetDeals.filter((deal) => !isPlaceholderCrmName(deal.customer_name))
  const activeSheetKeys = new Set(matchableSheetDeals.map((deal) => getBranchRevSourceRecordKey(deal)))
  const activeConfirmedSheetKeys = new Set(
    Array.from(confirmedSheetKeys).filter((key) => activeSheetKeys.has(key))
  )
  const identitySummary: CrmRevenueIdentitySummary | null =
    sheetResult.source.status === "connected"
      ? {
          totalLinks: sourceLinks.length,
          confirmedLinks: sourceLinks.filter((link) => link.status === "confirmed").length,
          candidateLinks: sourceLinks.filter((link) => link.status === "candidate").length,
          rejectedLinks: sourceLinks.filter((link) => link.status === "rejected").length,
          staleLinks: sourceLinks.filter((link) => link.status === "stale").length,
          linkedSheetDealCount: activeConfirmedSheetKeys.size,
          unmatchedSheetDealCount: Math.max(0, matchableSheetDeals.length - activeConfirmedSheetKeys.size),
          targetCustomerCount: new Set(
            sourceLinks
              .filter((link) => link.status === "confirmed" && link.target_type === "customer")
              .map((link) => link.target_id)
          ).size,
          targetDealCount: new Set(
            sourceLinks
              .filter((link) => link.status === "confirmed" && link.target_type === "deal")
              .map((link) => link.target_id)
          ).size,
          lastLinkedAt: maxDate(sourceLinks.map((link) => link.confirmed_at ?? link.updated_at)),
        }
      : null

  const externalLinkRows: CrmRevenueExternalLinkRow[] = externalSourceLinks
    .map((link) => {
      const targetLabel =
        getMetadataString(link.metadata, "target_label") ??
        (link.target_type === "partner_account"
          ? accountNameById.get(link.target_id)
          : link.target_type === "customer"
            ? customerNameById.get(link.target_id)
            : link.target_type === "deal"
              ? dealNameById.get(link.target_id)
              : null) ??
        null

      return {
        linkId: link.id,
        sourceObject: link.source_object,
        sourceRecordKey: link.source_record_key,
        sourceLabel:
          getMetadataString(link.metadata, "source_label") ??
          getMetadataString(link.metadata, "source_customer_name") ??
          link.normalized_name,
        sourceOwner: getMetadataString(link.metadata, "owner_name") ?? getMetadataString(link.metadata, "source_owner"),
        sourceStatus: getMetadataString(link.metadata, "source_status"),
        sourceAmount: getMetadataNumber(link.metadata, "source_amount"),
        occurredAt: getMetadataString(link.metadata, "occurred_at"),
        syncedAt: getMetadataString(link.metadata, "synced_at"),
        linkStatus: link.status,
        targetType: link.target_type,
        targetId: link.target_id,
        targetLabel,
        confidence: link.confidence,
        updatedAt: link.updated_at,
      }
    })
    .sort((a, b) => {
      const statusRank: Record<CrmSourceLinkStatus, number> = {
        candidate: 0,
        stale: 1,
        confirmed: 2,
        rejected: 3,
      }
      const rankGap = statusRank[a.linkStatus] - statusRank[b.linkStatus]
      if (rankGap !== 0) return rankGap
      if ((a.confidence ?? 0) !== (b.confidence ?? 0)) return (b.confidence ?? 0) - (a.confidence ?? 0)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  const externalLinks = externalLinkRows.slice(0, DISPLAY_LIMITS.externalLinks)

  const writeRequestRows: CrmRevenueWriteRequestRow[] = writeRequestsResult.rows
    .map((request) => ({
      id: request.id,
      sourceSystem: request.source_system,
      objectApiKey: request.object_api_key,
      externalId: request.external_id,
      operation: request.operation,
      status: request.status,
      payload: request.payload ?? {},
      previewPayload: request.preview_payload,
      approvedAt: request.approved_at,
      executedAt: request.executed_at,
      attemptCount: request.attempt_count ?? 0,
      lastAttemptAt: request.last_attempt_at,
      nextRetryAt: request.next_retry_at,
      lastAttemptError: request.last_attempt_error,
      error: request.error,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
    }))
  const writeRequests = writeRequestRows.slice(0, DISPLAY_LIMITS.writeRequests)

  for (const row of partnerRows.values()) {
    if (row.outstandingAmount === 0) {
      row.outstandingAmount = Math.max(0, row.contractedAmount - row.paidAmount)
    }
  }

  const activeDeals = deals.filter((deal) => deal.status === "active")
  const contractedAmount =
    sumBy(contracts.filter((contract) => contract.status !== "cancelled"), (contract) => contract.total_amount) +
    sumBy(deals, (deal) => deal.contracted_amount)
  const paidAmount = sumBy(receipts, (receipt) => receipt.total_amount) + sumBy(deals, (deal) => deal.paid_amount)
  const outstandingAmount =
    sumBy(deals, (deal) => deal.outstanding_amount) +
    Math.max(
      0,
      sumBy(contracts.filter((contract) => contract.status !== "cancelled"), (contract) => contract.total_amount) -
        sumBy(receipts, (receipt) => receipt.total_amount)
    )

  const riskRows: CrmRevenueRiskItem[] = [
    ...sheetRisks,
    ...deals
      .filter((deal) => deal.outstanding_amount > 0 || deal.payment_status !== "paid")
      .map((deal) => ({
        id: `deal:${deal.id}`,
        title: deal.title,
        ownerName: customerNameById.get(deal.customer_id) ?? accountNameById.get(deal.partner_account_id) ?? "고객 미지정",
        amount: deal.outstanding_amount || Math.max(0, deal.contracted_amount - deal.paid_amount),
        reason: deal.payment_status === "paid" ? "정산 확인 필요" : "미수 또는 부분 수납",
        href: `/admin/crm/deals/orders?deal=${deal.id}`,
      })),
    ...contracts
      .filter((contract) => contract.status !== "cancelled")
      .map((contract) => {
        const receiptTotal = sumBy(
          receipts.filter((receipt) => receipt.contract_id === contract.id),
          (receipt) => receipt.total_amount
        )
        return {
          id: `contract:${contract.id}`,
          title: contract.title,
          ownerName: partnerNameById.get(contract.partner_id) ?? "미지정 파트너",
          amount: Math.max(0, contract.total_amount - receiptTotal),
          reason: "계약 대비 수납 잔액",
          href: `/admin/quotes?tab=contracts`,
        }
      })
      .filter((item) => item.amount > 0),
  ]
    .sort((a, b) => b.amount - a.amount)
  const risks = riskRows.slice(0, DISPLAY_LIMITS.risks)

  const documentRows: CrmRevenueDocumentRow[] = [
    ...quotes.map((quote) => ({
      id: quote.id,
      kind: "quote" as const,
      title: `${quote.quote_number} · ${quote.title}`,
      ownerName: partnerNameById.get(quote.partner_id) ?? "미지정 파트너",
      status: quote.status,
      amount: quote.total_amount,
      occurredAt: quote.accepted_at ?? quote.sent_at ?? quote.created_at,
      href: "/admin/quotes?tab=hardware",
    })),
    ...contracts.map((contract) => ({
      id: contract.id,
      kind: "contract" as const,
      title: `${contract.contract_number} · ${contract.title}`,
      ownerName: partnerNameById.get(contract.partner_id) ?? "미지정 파트너",
      status: contract.status,
      amount: contract.total_amount,
      occurredAt: contract.admin_signed_at ?? contract.partner_signed_at ?? contract.created_at,
      href: "/admin/quotes?tab=contracts",
    })),
    ...receipts.map((receipt) => ({
      id: receipt.id,
      kind: "receipt" as const,
      title: `${receipt.receipt_number} · ${receipt.payment_method}`,
      ownerName: partnerNameById.get(receipt.partner_id) ?? "미지정 파트너",
      status: receipt.paid_at ? "paid" : "issued",
      amount: receipt.total_amount,
      occurredAt: receipt.paid_at ?? receipt.created_at,
      href: "/admin/quotes?tab=receipts",
    })),
    ...deals.map((deal) => ({
      id: deal.id,
      kind: "deal" as const,
      title: `${deal.deal_code} · ${deal.title}`,
      ownerName: customerNameById.get(deal.customer_id) ?? accountNameById.get(deal.partner_account_id) ?? "고객 미지정",
      status: `${deal.current_stage}/${deal.payment_status}`,
      amount: deal.expected_amount,
      occurredAt: deal.updated_at,
      href: "/admin/crm/deals/orders",
    })),
  ]
    .sort((a, b) => new Date(b.occurredAt ?? 0).getTime() - new Date(a.occurredAt ?? 0).getTime())
  const documents = documentRows.slice(0, DISPLAY_LIMITS.documents)

  const sortedSheetMatches = sheetMatches.sort((a, b) => {
    const aLinked = a.linkStatus === "confirmed" ? 1 : 0
    const bLinked = b.linkStatus === "confirmed" ? 1 : 0
    if (aLinked !== bLinked) return aLinked - bLinked
    return b.amount - a.amount
  })
  const displayedSheetMatches = sortedSheetMatches.slice(0, DISPLAY_LIMITS.sheetMatches)
  const partnerDisplayRows = Array.from(partnerRows.values())
    .sort((a, b) => b.contractedAmount + b.quotedAmount - (a.contractedAmount + a.quotedAmount))
    .slice(0, DISPLAY_LIMITS.partners)

  warnings.push(
    ...[
      getDisplayLimitWarning("REV 매칭 테이블", sortedSheetMatches.length, displayedSheetMatches.length),
      getDisplayLimitWarning("Xiaoshouyi 후보 검수", externalLinkRows.length, externalLinks.length),
      getDisplayLimitWarning("외부 CRM 쓰기 승인 큐", writeRequestRows.length, writeRequests.length),
      getDisplayLimitWarning("파트너/고객 랭킹", partnerRows.size, partnerDisplayRows.length),
      getDisplayLimitWarning("정리 리스크", riskRows.length, risks.length),
      getDisplayLimitWarning("최근 CRM 문서/거래", documentRows.length, documents.length),
    ].filter((warning): warning is string => Boolean(warning))
  )

  const sheetSource: CrmRevenueSource = {
    ...sheetResult.source,
    lastSyncedAt: maxDate(sheetDeals.map((deal) => deal.synced_at)),
    description:
      sheetResult.source.status === "connected"
        ? "브랜치 REV 시트 동기화본(branch_rev_deals)을 읽어 비교용으로 병기합니다. 앱 집계와 합산하지 않습니다."
        : sheetResult.source.description,
  }

  const externalCrmSource = buildExternalCrmSource(
    externalSnapshotResult,
    externalSyncRunsResult,
    writeRequestsResult
  )

  if (contracts.length > 0 && deals.length > 0) {
    warnings.push("계약/영수증 레거시 데이터와 V2 거래 파이프라인이 함께 집계됩니다. 외부 ID 매핑 전에는 일부 금액이 중복될 수 있습니다.")
  }

  return {
    // 캐시 본문은 순수하게 유지한다 — generatedAt은 캐시된 값을 감싼 뒤 wrapper에서 찍는다.
    generatedAt: "",
    range: {
      months: safeMonths,
      startMonth: monthKeys[0],
      endMonth: monthKeys[monthKeys.length - 1],
    },
    summary: {
      quotedAmount: sumBy(quotes, (quote) => quote.total_amount),
      acceptedQuoteAmount: sumBy(
        quotes.filter((quote) => quote.status === "accepted" || quote.status === "converted"),
        (quote) => quote.total_amount
      ),
      deliveryTotalAmount: sumBy(deals, (deal) => deal.installed_amount),
      contractedAmount,
      paidAmount,
      outstandingAmount,
      expectedPipelineAmount: sumBy(activeDeals, (deal) => deal.expected_amount),
      activeDealCount: activeDeals.length,
      customerCount: customers.length,
      partnerCount: partners.length + accounts.length,
      sourceRecordCount:
        partners.length +
        quotes.length +
        contracts.length +
        receipts.length +
        accounts.length +
        customers.length +
        deals.length +
        sheetDeals.length +
        sourceLinks.length +
        externalSourceLinks.length +
        (externalSnapshotResult.summary?.totalRecordCount ?? externalSnapshotResult.rows.length) +
        writeRequestsResult.rows.length,
    },
    sheet: sheetSummary,
    identity: identitySummary,
    sheetMatches: displayedSheetMatches,
    externalSnapshot: externalSnapshotResult.summary,
    externalRecords: externalRecordRows,
    externalLinks,
    writeRequests,
    monthly: Array.from(monthly.values()),
    partners: partnerDisplayRows,
    risks,
    documents,
    sources: [
      partnersResult.source,
      quotesResult.source,
      contractsResult.source,
      receiptsResult.source,
      accountsResult.source,
      customersResult.source,
      dealsResult.source,
      externalCrmSource,
      {
        ...sourceLinksResult.source,
        description:
          sourceLinksResult.source.status === "connected"
            ? "CRM·리드·REV 원천 레코드를 앱 파트너·고객·거래에 연결하는 identity layer입니다."
            : "crm_source_links 마이그레이션 적용 후 CRM/리드/REV 매칭 상태를 읽습니다.",
      },
      {
        ...externalSourceLinksResult.source,
        description:
          externalSourceLinksResult.source.status === "connected"
            ? "Xiaoshouyi snapshot 후보와 확정 링크를 검수합니다."
            : "Xiaoshouyi source link 후보 생성 후 검수 상태를 읽습니다.",
      },
      sheetSource,
    ],
    warnings,
  }
}

// 무거운 조립 결과를 45초 캐시한다. Supabase admin 클라이언트는 모듈 레벨에서
// 서비스 롤 secret key로 생성되는 요청 무관(non-cookie) 클라이언트라 unstable_cache가 안전하다.
// generatedAt은 캐시 본문에서 뺐으므로 캐시 body는 순수하게 유지된다.
//
// T3 근본 원인(admin-performance-plan 다음 라운드): 이전엔 이 unstable_cache 콜백이
// safeMonths를 인자로 받았다 — assembleAdminCrmRevenueDashboard의 14개 테이블 쿼리는 전부
// updated_at 최신순 limit이라 months와 무관하게 같은 행을 읽는데도, unstable_cache는
// 인자를 캐시 키의 일부로 삼으므로(JSON.stringify(args)) months=3/6/12별로 최대 10갈래
// 캐시 엔트리가 생겨 같은 45초 창을 나눠 썼다 — months=6 요청만 반복해도 사이에 다른
// months 요청이 섞이면 콜드로 돌아갔다(측정: p50 1.1s, p95 9.1s — 사실상 거의 매번 재조립).
// 실제로 months에 의존하는 건 monthly[]/range뿐이고(addMonthlyAmountByKey가 유일한 월
// 종속 지점), 그마저도 12개월 슈퍼셋의 접미부 슬라이스로 표현할 수 있다(getMonthKeys는
// "지금"에서 역산하는 연속 월이라 6개월 창은 12개월 창의 마지막 6개와 같다). 그래서
// assembleAdminCrmRevenueDashboard를 인자 없이(12개월 고정) 단일 키로 캐시하고, 요청
// months로 좁히는 건 이 아래 deriveRevenueDashboardForMonths가 캐시 밖에서 순수 슬라이스로
// 처리한다 — T1/T2와 같은 "인자 없는" unstable_cache 패턴으로 수렴시킨 것이 수정이다.
const getCachedAdminCrmRevenueDashboard = unstable_cache(
  // 같은 인스턴스의 동시 미스는 shareInFlight 로 한 번만 조립한다(14-테이블 병렬 스캔).
  () => shareInFlight(ADMIN_CRM_REVENUE_CACHE_TAG, assembleAdminCrmRevenueDashboard),
  [ADMIN_CRM_REVENUE_CACHE_TAG],
  { revalidate: ADMIN_CRM_REVENUE_REVALIDATE_SECONDS, tags: [ADMIN_CRM_REVENUE_CACHE_TAG] },
)

// 캐시된 12개월 대시보드에서 요청 months만큼 접미부를 잘라낸다. monthly[]·range 외의 모든
// 필드(summary·partners·risks·documents·sheetMatches·sources·identity·externalSnapshot 등)는
// months에 의존하지 않으므로 그대로 통과시킨다.
function deriveRevenueDashboardForMonths(
  dashboard: CrmRevenueDashboard,
  months: number
): CrmRevenueDashboard {
  const safeMonths = Math.min(ADMIN_CRM_REVENUE_MAX_MONTHS, Math.max(3, Math.floor(months)))
  const monthly = dashboard.monthly.slice(-safeMonths)
  const startMonth = monthly[0]?.month ?? dashboard.range.startMonth
  const endMonth = monthly[monthly.length - 1]?.month ?? dashboard.range.endMonth

  return {
    ...dashboard,
    range: { months: safeMonths, startMonth, endMonth },
    monthly,
  }
}

export async function getAdminCrmRevenueDashboard(months = 6): Promise<CrmRevenueDashboard> {
  const dashboard = await getCachedAdminCrmRevenueDashboard()
  const scoped = deriveRevenueDashboardForMonths(dashboard, months)
  // 캐시된 순수 body에 요청 시각을 찍는다(캐시 히트여도 최신 timestamp 반환).
  return { ...scoped, generatedAt: new Date().toISOString() }
}
