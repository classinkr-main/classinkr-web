import "server-only"

import { getBranchRevSourceRecordKey } from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  CrmRevenueDashboard,
  CrmRevenueDocumentRow,
  CrmRevenueIdentitySummary,
  CrmRevenueMonthlyPoint,
  CrmRevenuePartnerRow,
  CrmRevenueRiskItem,
  CrmRevenueSheetMatchRow,
  CrmRevenueSheetSummary,
  CrmRevenueSource,
  CrmSourceLinkStatus,
} from "@/lib/admin-crm-revenue-types"

interface LegacyPartnerRow {
  id: string
  name: string
  status: string
  pipeline_stage: string
  deal_amount: number | null
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
  metadata: { target_label?: unknown } | null
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
  error: string | null
  updated_at: string
}

interface CrmWriteRequestRow {
  id: string
  source_system: string
  object_api_key: string
  operation: string
  status: string
  created_at: string
  updated_at: string
}

interface QueryResult<T> {
  rows: T[]
  source: CrmRevenueSource
  warning: string | null
}

// 시트 status는 자유 입력이라 enum이 없다. 취소·중단 계열 키워드만 예상 매출에서 제외한다.
const SHEET_INACTIVE_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i

function hasValue(value: string | undefined) {
  return Boolean(value?.trim())
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
      recordCount: recordsResult.rows.length,
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

  const configured =
    hasValue(process.env.XIAOSHOUYI_BASE_URL) ||
    hasValue(process.env.XIAOSHOUYI_API_BASE_URL) ||
    hasValue(process.env.XIAOSHOUYI_API_URL) ||
    hasValue(process.env.COMPANY_CRM_API_URL) ||
    hasValue(process.env.CRM_API_URL)
  const objectKeys = new Set(recordsResult.rows.map((record) => record.object_api_key))
  const pendingWrites = writeRequestsResult.rows.filter((request) =>
    ["draft", "approved", "sent"].includes(request.status)
  ).length
  const failedRuns = syncRunsResult.rows.filter((run) => run.status === "failed").length

  return {
    key: "xiaoshouyi_snapshot",
    label: "Xiaoshouyi CRM Snapshot",
    status: recordsResult.rows.length > 0 ? "connected" : configured ? "configured" : "not_configured",
    mode: "read",
    recordCount: recordsResult.rows.length,
    latencyMs:
      (recordsResult.source.latencyMs ?? 0) +
      (syncRunsResult.source.latencyMs ?? 0) +
      (writeRequestsResult.source.latencyMs ?? 0),
    lastSyncedAt: maxDate([
      ...recordsResult.rows.map((record) => record.synced_at),
      ...syncRunsResult.rows.map((run) => run.finished_at ?? run.started_at),
    ]),
    description:
      recordsResult.rows.length > 0
        ? `${objectKeys.size}개 객체 snapshot을 읽습니다. 대기 중인 write request ${pendingWrites}건, 실패 sync ${failedRuns}건.`
        : configured
          ? "외부 CRM credential은 준비됐지만 아직 snapshot 레코드가 없습니다."
          : "Xiaoshouyi/eeoCRM은 read-only snapshot sync부터 연결합니다.",
    actionLabel: configured || recordsResult.rows.length > 0 ? "Snapshot 상태 확인" : "환경변수 연결 필요",
    actionHref: "/admin/settings",
  }
}

async function runQuery<T>(
  key: string,
  label: string,
  promise: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<QueryResult<T>> {
  const startedAt = Date.now()

  try {
    const { data, error } = await promise
    const latencyMs = Date.now() - startedAt

    if (error) {
      return {
        rows: [],
        warning: `${label}: ${error.message}`,
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

export async function getAdminCrmRevenueDashboard(months = 6): Promise<CrmRevenueDashboard> {
  const safeMonths = Math.min(12, Math.max(3, Math.floor(months)))
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
    externalRecordsResult,
    externalSyncRunsResult,
    writeRequestsResult,
  ] =
    await Promise.all([
      runQuery<LegacyPartnerRow>(
        "legacy_partners",
        "레거시 파트너",
        supabase
          .from("partners")
          .select("id, name, status, pipeline_stage, deal_amount, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
      runQuery<LegacyQuoteRow>(
        "legacy_quotes",
        "견적",
        supabase
          .from("quotes")
          .select("id, quote_number, partner_id, title, status, total_amount, sent_at, accepted_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
      runQuery<LegacyContractRow>(
        "legacy_contracts",
        "계약",
        supabase
          .from("contracts")
          .select("id, contract_number, partner_id, quote_id, title, status, total_amount, partner_signed_at, admin_signed_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
      runQuery<LegacyReceiptRow>(
        "legacy_receipts",
        "수납/영수증",
        supabase
          .from("receipts")
          .select("id, receipt_number, contract_id, partner_id, total_amount, payment_method, paid_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
      runQuery<PartnerAccountRow>(
        "partner_accounts",
        "파트너 계정",
        supabase
          .from("partner_accounts")
          .select("id, name, status, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
      runQuery<CustomerRow>(
        "customers",
        "고객사",
        supabase
          .from("customers")
          .select("id, partner_account_id, name, campus_name, region_label, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
      runQuery<DealRow>(
        "deals",
        "거래 파이프라인",
        supabase
          .from("deals")
          .select("id, partner_account_id, customer_id, deal_code, title, status, current_stage, expected_amount, contracted_amount, paid_amount, outstanding_amount, payment_status, closed_at, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(1000)
      ),
      runQuery<SheetRevDealRow>(
        "crm_sheet",
        "회사 시트 (REV)",
        // 색 금액(rev_color_amounts) 마이그레이션 적용 전 DB에서도 깨지지 않도록 컬럼을 명시하지 않는다
        supabase
          .from("branch_rev_deals")
          .select("*")
          .limit(1000)
      ),
      runQuery<CrmSourceLinkRow>(
        "crm_source_links",
        "CRM 매칭 링크",
        supabase
          .from("crm_source_links")
          .select("id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at")
          .eq("source_system", "branch_rev_sheet")
          .eq("source_object", "branch_rev_deals")
          .limit(2000)
      ),
      runQuery<ExternalCrmRecordRow>(
        "external_crm_records",
        "외부 CRM Snapshot",
        supabase
          .from("external_crm_records")
          .select("id, source_system, object_api_key, external_id, normalized_name, display_name, owner_name, status, amount, occurred_at, synced_at, updated_at")
          .eq("source_system", "xiaoshouyi")
          .order("synced_at", { ascending: false })
          .limit(2000)
      ),
      runQuery<ExternalCrmSyncRunRow>(
        "external_crm_sync_runs",
        "외부 CRM Sync",
        supabase
          .from("external_crm_sync_runs")
          .select("id, source_system, object_api_key, status, trigger, started_at, finished_at, rows_scanned, rows_upserted, error, updated_at")
          .eq("source_system", "xiaoshouyi")
          .order("started_at", { ascending: false })
          .limit(200)
      ),
      runQuery<CrmWriteRequestRow>(
        "crm_write_requests",
        "CRM 쓰기 요청",
        supabase
          .from("crm_write_requests")
          .select("id, source_system, object_api_key, operation, status, created_at, updated_at")
          .eq("source_system", "xiaoshouyi")
          .order("created_at", { ascending: false })
          .limit(200)
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
    externalRecordsResult.warning,
    externalSyncRunsResult.warning,
    writeRequestsResult.warning,
  ].filter((warning): warning is string => Boolean(warning))

  const partners = partnersResult.rows
  const quotes = quotesResult.rows
  const contracts = contractsResult.rows
  const receipts = receiptsResult.rows
  const accounts = accountsResult.rows
  const customers = customersResult.rows
  const deals = dealsResult.rows
  const sheetDeals = sheetResult.rows
  const sourceLinks = sourceLinksResult.rows
  const externalRecords = externalRecordsResult.rows

  const partnerNameById = new Map(partners.map((partner) => [partner.id, partner.name]))
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const customerNameById = new Map(
    customers.map((customer) => [
      customer.id,
      [customer.name, customer.campus_name].filter(Boolean).join(" · "),
    ])
  )
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
  const sheetMatches: CrmRevenueSheetMatchRow[] = []

  for (const deal of activeSheetDeals) {
    const recordKey = getBranchRevSourceRecordKey(deal)
    const links = sourceLinksByKey.get(recordKey) ?? []
    const redMap = deal.monthly_red ?? {}
    const confirmedMap = deal.monthly_confirmed ?? {}
    const highConfMap = deal.monthly_high_conf ?? {}
    const hasColorData =
      Object.keys(redMap).length > 0 ||
      Object.keys(confirmedMap).length > 0 ||
      Object.keys(highConfMap).length > 0
    let pastUnconfirmed = 0
    for (const [month, rawAmount] of Object.entries(deal.monthly_payments ?? {})) {
      const total = Number(rawAmount) || 0
      let confirmed = Math.min(total, Number(confirmedMap[month]) || 0)
      // 금액 분해 컬럼 도입 전 동기화분 호환: monthly_red=true면 그 달 전액 확정으로 간주
      if (confirmed === 0 && redMap[month]) confirmed = total
      if (!hasColorData && month <= currentMonthKey) confirmed = total
      const highConf = Math.min(Math.max(0, total - confirmed), Number(highConfMap[month]) || 0)
      const remaining = Math.max(0, total - confirmed - highConf)

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
        href: "/admin/branch",
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
        }
      : null

  const confirmedSheetKeys = new Set(
    sourceLinks
      .filter((link) => link.status === "confirmed")
      .map((link) => link.source_record_key)
  )
  const activeSheetKeys = new Set(activeSheetDeals.map((deal) => getBranchRevSourceRecordKey(deal)))
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
          unmatchedSheetDealCount: Math.max(0, activeSheetDeals.length - activeConfirmedSheetKeys.size),
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

  const risks: CrmRevenueRiskItem[] = [
    ...sheetRisks,
    ...deals
      .filter((deal) => deal.outstanding_amount > 0 || deal.payment_status !== "paid")
      .map((deal) => ({
        id: `deal:${deal.id}`,
        title: deal.title,
        ownerName: customerNameById.get(deal.customer_id) ?? accountNameById.get(deal.partner_account_id) ?? "고객 미지정",
        amount: deal.outstanding_amount || Math.max(0, deal.contracted_amount - deal.paid_amount),
        reason: deal.payment_status === "paid" ? "정산 확인 필요" : "미수 또는 부분 수납",
        href: `/admin/crm/partners/portal?deal=${deal.id}`,
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
    .slice(0, 8)

  const documents: CrmRevenueDocumentRow[] = [
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
      href: "/admin/crm/partners/portal",
    })),
  ]
    .sort((a, b) => new Date(b.occurredAt ?? 0).getTime() - new Date(a.occurredAt ?? 0).getTime())
    .slice(0, 20)

  const sheetSource: CrmRevenueSource = {
    ...sheetResult.source,
    lastSyncedAt: maxDate(sheetDeals.map((deal) => deal.synced_at)),
    description:
      sheetResult.source.status === "connected"
        ? "브랜치 REV 시트 동기화본(branch_rev_deals)을 읽어 비교용으로 병기합니다. 앱 집계와 합산하지 않습니다."
        : sheetResult.source.description,
  }

  const externalCrmSource = buildExternalCrmSource(
    externalRecordsResult,
    externalSyncRunsResult,
    writeRequestsResult
  )

  if (contracts.length > 0 && deals.length > 0) {
    warnings.push("계약/영수증 레거시 데이터와 V2 거래 파이프라인이 함께 집계됩니다. 외부 ID 매핑 전에는 일부 금액이 중복될 수 있습니다.")
  }

  return {
    generatedAt: new Date().toISOString(),
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
        externalRecords.length,
    },
    sheet: sheetSummary,
    identity: identitySummary,
    sheetMatches: sheetMatches
      .sort((a, b) => {
        const aLinked = a.linkStatus === "confirmed" ? 1 : 0
        const bLinked = b.linkStatus === "confirmed" ? 1 : 0
        if (aLinked !== bLinked) return aLinked - bLinked
        return b.amount - a.amount
      })
      .slice(0, 12),
    monthly: Array.from(monthly.values()),
    partners: Array.from(partnerRows.values())
      .sort((a, b) => b.contractedAmount + b.quotedAmount - (a.contractedAmount + a.quotedAmount))
      .slice(0, 10),
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
      sheetSource,
      {
        ...sourceLinksResult.source,
        description:
          sourceLinksResult.source.status === "connected"
            ? "시트/외부 CRM 레코드와 앱 고객·거래를 연결하는 identity layer입니다."
            : "crm_source_links 마이그레이션 적용 후 매칭 상태를 읽습니다.",
      },
      externalCrmSource,
    ],
    warnings,
  }
}
