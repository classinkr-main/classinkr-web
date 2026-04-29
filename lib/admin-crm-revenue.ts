import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  CrmRevenueDashboard,
  CrmRevenueDocumentRow,
  CrmRevenueMonthlyPoint,
  CrmRevenuePartnerRow,
  CrmRevenueRiskItem,
  CrmRevenueSource,
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

interface QueryResult<T> {
  rows: T[]
  source: CrmRevenueSource
  warning: string | null
}

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
    monthly: monthKeys.map((month) => ({
      month,
      quotedAmount: 0,
      contractedAmount: 0,
      paidAmount: 0,
      expectedAmount: 0,
    })),
    partners: [],
    risks: [],
    documents: [],
    sources: [
      getExternalSource(
        "company_crm",
        "회사 CRM",
        hasValue(process.env.COMPANY_CRM_API_URL) || hasValue(process.env.CRM_API_URL),
        "외부 회사 CRM은 읽기 전용 동기화부터 연결합니다."
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
  const point = monthly.get(month)
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

  const [partnersResult, quotesResult, contractsResult, receiptsResult, accountsResult, customersResult, dealsResult] =
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
    ])

  const warnings = [
    partnersResult.warning,
    quotesResult.warning,
    contractsResult.warning,
    receiptsResult.warning,
    accountsResult.warning,
    customersResult.warning,
    dealsResult.warning,
  ].filter((warning): warning is string => Boolean(warning))

  const partners = partnersResult.rows
  const quotes = quotesResult.rows
  const contracts = contractsResult.rows
  const receipts = receiptsResult.rows
  const accounts = accountsResult.rows
  const customers = customersResult.rows
  const deals = dealsResult.rows

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

  const externalSources = [
    getExternalSource(
      "company_crm",
      "회사 CRM",
      hasValue(process.env.COMPANY_CRM_API_URL) || hasValue(process.env.CRM_API_URL),
      "초기 연결은 읽기 전용 import/sync로 운영하고, 외부 ID 매핑 후 쓰기를 열어야 합니다.",
      "/admin/settings"
    ),
    getExternalSource(
      "crm_sheet",
      "회사 시트",
      hasValue(process.env.CRM_SHEET_ID) || hasValue(process.env.GOOGLE_SHEETS_CRM_SPREADSHEET_ID),
      "시트는 운영팀 입력과 검수용 보조 소스로 두고, 앱 DB를 기준 데이터로 유지합니다.",
      "/admin/settings"
    ),
  ]

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
        partners.length + quotes.length + contracts.length + receipts.length + accounts.length + customers.length + deals.length,
    },
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
      ...externalSources,
    ],
    warnings,
  }
}
