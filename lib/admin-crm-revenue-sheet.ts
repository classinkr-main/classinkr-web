import "server-only"

import { unstable_cache } from "next/cache"
import { getBranchRevSourceRecordKey, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { dealHasColorData, splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import { getCompassRevenue } from "@/lib/compass/bridge"
import type {
  AdminCrmRevenueSheetBreakdownRow,
  AdminCrmRevenueSheetCompassCompare,
  AdminCrmRevenueSheetManualLedgerGap,
  AdminCrmRevenueSheetMonthPoint,
  AdminCrmRevenueSheetRow,
  AdminCrmRevenueSheetWorkspace,
  RevenueSheetLinkStatus,
} from "@/lib/admin-crm-revenue-sheet-types"

interface BranchSalesLedgerEntryAmountRow {
  amount: number | string | null
  applied_at: string | null
  // manual-new(장부에서 새로 만든 행) | manual-edit(시트 행 정정). 구 호출·테스트 입력에는 없을 수 있다 —
  // 없으면 신규로 센다(정정으로 세면 빠진 매출을 숨기게 되므로 보수적인 쪽).
  entry_type?: string | null
}

interface BranchRevDealRow {
  id: string
  sheet_row: number
  customer_name: string
  branch_contact: string | null
  team: string | null
  manager: string | null
  deal_type: string | null
  status: string | null
  first_payment: string | null
  product_version: string | null
  region: string | null
  importance: string | null
  note: string | null
  contract_target: number | string | null
  monthly_payments: Record<string, number> | null
  monthly_confirmed: Record<string, number> | null
  monthly_high_conf: Record<string, number> | null
  synced_at: string
}

interface CrmSourceLinkRow {
  id: string
  source_record_key: string
  target_type: string
  target_id: string
  confidence: number | null
  status: Exclude<RevenueSheetLinkStatus, null>
  metadata: Record<string, unknown> | null
  confirmed_at: string | null
  updated_at: string
}

const INACTIVE_STATUS_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i
const QUERY_LIMIT = 1200

function numberValue(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function sumRecord(record: Record<string, number> | null | undefined) {
  return Object.values(record ?? {}).reduce((sum, value) => sum + numberValue(value), 0)
}

function getCurrentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function statusRank(status: RevenueSheetLinkStatus) {
  if (status === "confirmed") return 4
  if (status === "candidate") return 3
  if (status === "stale") return 2
  if (status === "rejected") return 1
  return 0
}

function chooseBestLink(links: CrmSourceLinkRow[]) {
  return [...links].sort((a, b) => {
    const statusDelta = statusRank(b.status) - statusRank(a.status)
    if (statusDelta !== 0) return statusDelta
    return Number(b.confidence ?? 0) - Number(a.confidence ?? 0)
  })[0] ?? null
}

function emptyBreakdown(label: string): AdminCrmRevenueSheetBreakdownRow {
  return {
    key: label,
    label,
    rowCount: 0,
    scheduledAmount: 0,
    confirmedAmount: 0,
    highConfidenceAmount: 0,
    expectedAmount: 0,
  }
}

function addToBreakdown(
  map: Map<string, AdminCrmRevenueSheetBreakdownRow>,
  key: string | null | undefined,
  row: Pick<AdminCrmRevenueSheetRow, "scheduledAmount" | "confirmedAmount" | "highConfidenceAmount" | "expectedAmount">
) {
  const label = key?.trim() || "미지정"
  const current = map.get(label) ?? emptyBreakdown(label)
  current.rowCount += 1
  current.scheduledAmount += row.scheduledAmount
  current.confirmedAmount += row.confirmedAmount
  current.highConfidenceAmount += row.highConfidenceAmount
  current.expectedAmount += row.expectedAmount
  map.set(label, current)
}

function addMonth(
  map: Map<string, AdminCrmRevenueSheetMonthPoint>,
  month: string,
  field: keyof Omit<AdminCrmRevenueSheetMonthPoint, "month">,
  amount: number
) {
  if (!Number.isFinite(amount) || amount <= 0) return
  const current =
    map.get(month) ??
    {
      month,
      scheduledAmount: 0,
      confirmedAmount: 0,
      highConfidenceAmount: 0,
      expectedAmount: 0,
      pastUnconfirmedAmount: 0,
    }
  current[field] += amount
  map.set(month, current)
}

// M8 — rev-sheet "Compass 대조" 배지. 어드민이 실제로 데이터를 가진 달(monthlyPoints)만
// Compass에 물어본다(전체 연혁을 다 끌어오지 않음). month 키는 두 쪽 모두 "YYYY-MM" 실측 확인됨
// (2026-08-28, compass_revenue_v.month 표본 조회) — 별도 포맷 변환 없이 그대로 매칭한다.
// down이면 compassAmount/diffAmount를 0으로 두고 down 플래그만 화면에 전달한다(무음 오염 금지).
export async function getCompassRevenueCompare(
  monthlyPoints: AdminCrmRevenueSheetMonthPoint[]
): Promise<AdminCrmRevenueSheetCompassCompare> {
  const months = monthlyPoints.map((point) => point.month)
  const adminAmount = monthlyPoints.reduce((sum, point) => sum + point.scheduledAmount, 0)

  if (months.length === 0) {
    return { down: false, months, adminAmount, compassAmount: 0, diffAmount: 0 }
  }

  const result = await getCompassRevenue(months)
  if (result.down) {
    return { down: true, months, adminAmount, compassAmount: 0, diffAmount: 0 }
  }

  // 요청한 달 밖의(또는 month가 비어 있는) 행은 방어적으로 제외한다 — getCompassRevenue가
  // 이미 .in("month", months)로 거르지만, 브리지 계약이 바뀌어도 합계가 조용히 부풀지 않게 한다.
  const monthSet = new Set(months)
  const compassAmount = result.rows.reduce((sum, row) => {
    if (!row.month || !monthSet.has(row.month)) return sum
    return sum + numberValue(row.amount)
  }, 0)
  return { down: false, months, adminAmount, compassAmount, diffAmount: compassAmount - adminAmount }
}

function getTargetLabel(
  link: CrmSourceLinkRow | null,
  labels: {
    partnerAccounts: Map<string, string>
    customers: Map<string, string>
    deals: Map<string, string>
  }
) {
  if (!link) return null
  const metadataLabel = getMetadataString(link.metadata, "target_label")
  if (metadataLabel) return metadataLabel
  if (link.target_type === "partner_account") return labels.partnerAccounts.get(link.target_id) ?? null
  if (link.target_type === "customer") return labels.customers.get(link.target_id) ?? null
  if (link.target_type === "deal") return labels.deals.get(link.target_id) ?? null
  return null
}

// 품질 감사 2026-09-10 — #1(P0, 이중 진실): 순수 집계 함수로 분리해 단위 테스트 가능하게 한다
// (tests/branch/crm-revenue-sheet-manual-ledger-gap.test.ts). applied_at 오름차순이 아니어도
// 안전하도록 매번 Date 비교로 최댓값을 찾는다 — 빈 배열이면 count/amount 0, latestAppliedAt null.
// 라운드 5 S-7: 신규(manual-new)와 정정(manual-edit)을 나눠 센다. 정정은 시트 행의 그 달 값을 "대체"하는 값이라
// 금액을 더하면 빠진 매출이 아니라 대체값 총액이 된다 — 장부의 "장부 가감" 타일(신규만 더함)과 정의를 맞춘다.
export function computeManualLedgerGap(rows: BranchSalesLedgerEntryAmountRow[]): AdminCrmRevenueSheetManualLedgerGap {
  const newRows = rows.filter((row) => row.entry_type !== "manual-edit")
  return {
    count: rows.length,
    newCount: newRows.length,
    newAmount: newRows.reduce((sum, row) => sum + numberValue(row.amount), 0),
    editCount: rows.length - newRows.length,
    amount: rows.reduce((sum, row) => sum + numberValue(row.amount), 0),
    latestAppliedAt: rows.reduce<string | null>((latest, row) => {
      if (!row.applied_at) return latest
      if (!latest) return row.applied_at
      return new Date(row.applied_at).getTime() > new Date(latest).getTime() ? row.applied_at : latest
    }, null),
  }
}

async function computeAdminCrmRevenueSheetWorkspace(): Promise<AdminCrmRevenueSheetWorkspace> {
  const sb = createSupabaseAdminClient()
  const warnings: string[] = []
  const currentMonth = getCurrentMonthKey()

  const [sheetResult, linksResult, accountsResult, customersResult, dealsResult, manualLedgerResult] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select(
        "id, sheet_row, customer_name, branch_contact, team, manager, deal_type, status, first_payment, product_version, region, importance, note, contract_target, monthly_payments, monthly_confirmed, monthly_high_conf, synced_at"
      )
      .order("sheet_row", { ascending: true })
      .limit(QUERY_LIMIT),
    sb
      .from("crm_source_links")
      .select("id, source_record_key, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at")
      .eq("source_system", "branch_rev_sheet")
      .eq("source_object", "branch_rev_deals")
      .order("updated_at", { ascending: false })
      .limit(QUERY_LIMIT * 3),
    sb.from("partner_accounts").select("id, name").limit(2000),
    sb.from("customers").select("id, name, campus_name").limit(2000),
    sb.from("deals").select("id, deal_code, title").limit(2000),
    // 품질 감사 2026-09-10 — #1: 장부 콕핏/입력 레일에서 적용까지 마친 수기 입력·정정은
    // branch_rev_deals(REV 시트 동기화 산물)를 절대 건드리지 않는다 — 이 화면은 그 매출을
    // 구조적으로 볼 수 없다. 서버 병합(row 단위 매칭) 대신 규모만 세어 배지로 알린다.
    sb
      .from("branch_sales_ledger_entries")
      .select("amount, applied_at, entry_type")
      .eq("entry_status", "active")
      .limit(QUERY_LIMIT),
  ])

  if (sheetResult.error) throw sheetResult.error
  if (linksResult.error) warnings.push(`REV 매칭 링크를 읽지 못했습니다: ${linksResult.error.message}`)
  if (accountsResult.error) warnings.push(`파트너 계정 라벨을 읽지 못했습니다: ${accountsResult.error.message}`)
  if (customersResult.error) warnings.push(`고객 라벨을 읽지 못했습니다: ${customersResult.error.message}`)
  if (dealsResult.error) warnings.push(`거래 라벨을 읽지 못했습니다: ${dealsResult.error.message}`)
  // 내부 원장 테이블 자체가 아직 없는 환경(마이그 미적용)도 있을 수 있다 — 그 경우도 "미반영
  // 0건"이 아니라 "확인 불가"로 다뤄야 하므로 별도 경고를 남기고 gap 카운트는 0으로 fail-soft한다.
  if (manualLedgerResult.error) {
    warnings.push(`장부 내부 원장(수기 입력) 반영 여부를 확인하지 못했습니다: ${manualLedgerResult.error.message}`)
  }
  if ((manualLedgerResult.data?.length ?? 0) >= QUERY_LIMIT) {
    warnings.push(
      `장부 내부 원장(수기 입력)이 ${QUERY_LIMIT.toLocaleString("ko-KR")}건 이상입니다 — 미반영 배지 수치가 과소집계일 수 있습니다.`
    )
  }
  const manualLedgerGap: AdminCrmRevenueSheetManualLedgerGap = manualLedgerResult.error
    ? { count: 0, amount: 0, latestAppliedAt: null, newCount: 0, newAmount: 0, editCount: 0 }
    : computeManualLedgerGap((manualLedgerResult.data ?? []) as BranchSalesLedgerEntryAmountRow[])

  // 상한에 정확히 닿았다면 그 뒤가 잘렸을 수 있다. 형제 모듈(admin-crm-revenue)은 같은 위험을
  // getQueryLimitWarning으로 알리는데 여기만 조용히 잘라, 요약·팀별 집계가 소리 없이 과소 집계된다.
  if ((sheetResult.data?.length ?? 0) >= QUERY_LIMIT) {
    warnings.push(
      `REV 시트: ${QUERY_LIMIT.toLocaleString("ko-KR")}건까지만 읽었습니다. 요약·팀별 집계가 이후 행을 포함하지 않습니다.`
    )
  }
  if ((linksResult.data?.length ?? 0) >= QUERY_LIMIT * 3) {
    warnings.push(
      `REV 매칭 링크: ${(QUERY_LIMIT * 3).toLocaleString("ko-KR")}건까지만 읽었습니다. 일부 행의 연결 상태가 비어 보일 수 있습니다.`
    )
  }

  const partnerAccounts = new Map(
    ((accountsResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
  )
  const customers = new Map(
    ((customersResult.data ?? []) as Array<{ id: string; name: string; campus_name: string | null }>).map((row) => [
      row.id,
      [row.name, row.campus_name].filter(Boolean).join(" · "),
    ])
  )
  const deals = new Map(
    ((dealsResult.data ?? []) as Array<{ id: string; deal_code: string; title: string }>).map((row) => [
      row.id,
      `${row.deal_code} · ${row.title}`,
    ])
  )

  const linksByKey = new Map<string, CrmSourceLinkRow[]>()
  for (const link of (linksResult.data ?? []) as CrmSourceLinkRow[]) {
    const list = linksByKey.get(link.source_record_key) ?? []
    list.push(link)
    linksByKey.set(link.source_record_key, list)
  }

  const monthMap = new Map<string, AdminCrmRevenueSheetMonthPoint>()
  const rows = ((sheetResult.data ?? []) as BranchRevDealRow[]).map((deal): AdminCrmRevenueSheetRow => {
    const contractTarget = numberValue(deal.contract_target)
    const sourceRecordKey = getBranchRevSourceRecordKey({
      sheet_row: deal.sheet_row,
      customer_name: deal.customer_name,
      first_payment: deal.first_payment,
      contract_target: contractTarget,
    })
    const link = chooseBestLink(linksByKey.get(sourceRecordKey) ?? [])
    const scheduledAmount = sumRecord(deal.monthly_payments)
    // 확도 분해는 캐논 splitter(rev-confirmed.ts)로 일원화 — raw monthly_confirmed 합산은
    // red-불리언·무색상 폴백이 빠져 장부 확정보다 과소집계된다(구 임포터 ¥103만 vs ¥680만 사건과 동류).
    const hasColorData = dealHasColorData(deal)
    let confirmedAmount = 0
    let highConfidenceAmount = 0
    let expectedAmount = 0
    let pastUnconfirmedAmount = 0

    for (const [month, rawAmount] of Object.entries(deal.monthly_payments ?? {})) {
      const amount = numberValue(rawAmount)
      const {
        confirmed,
        highConfidence,
        expected: uncolored,
      } = splitMonthConfidence(deal, month, amount, hasColorData, currentMonth)
      confirmedAmount += confirmed
      highConfidenceAmount += highConfidence

      addMonth(monthMap, month, "scheduledAmount", amount)
      addMonth(monthMap, month, "confirmedAmount", confirmed)
      addMonth(monthMap, month, "highConfidenceAmount", highConfidence)

      if (uncolored > 0 && month < currentMonth) {
        pastUnconfirmedAmount += uncolored
        addMonth(monthMap, month, "pastUnconfirmedAmount", uncolored)
      } else if (uncolored > 0) {
        expectedAmount += uncolored
        addMonth(monthMap, month, "expectedAmount", uncolored)
      }
    }

    return {
      id: deal.id,
      sheetRow: deal.sheet_row,
      sourceRecordKey,
      customerName: deal.customer_name,
      branchContact: deal.branch_contact,
      team: deal.team,
      manager: deal.manager,
      dealType: deal.deal_type,
      status: deal.status,
      firstPayment: deal.first_payment,
      productVersion: deal.product_version,
      region: deal.region,
      importance: deal.importance,
      note: deal.note,
      contractTarget,
      scheduledAmount,
      confirmedAmount,
      highConfidenceAmount,
      expectedAmount,
      pastUnconfirmedAmount,
      monthCount: Object.keys(deal.monthly_payments ?? {}).length,
      linkId: link?.id ?? null,
      linkStatus: link?.status ?? null,
      targetType: link?.target_type ?? null,
      targetId: link?.target_id ?? null,
      targetLabel: getTargetLabel(link, { partnerAccounts, customers, deals }),
      confidence: link?.confidence ?? null,
      placeholder: isPlaceholderCrmName(deal.customer_name),
      syncedAt: deal.synced_at,
    }
  })

  const activeRows = rows.filter((row) => !INACTIVE_STATUS_PATTERN.test(row.status ?? ""))
  const matchableRows = activeRows.filter((row) => !row.placeholder)
  const teamMap = new Map<string, AdminCrmRevenueSheetBreakdownRow>()
  const managerMap = new Map<string, AdminCrmRevenueSheetBreakdownRow>()
  const statusMap = new Map<string, AdminCrmRevenueSheetBreakdownRow>()

  for (const row of activeRows) {
    addToBreakdown(teamMap, row.team, row)
    addToBreakdown(managerMap, row.manager, row)
    addToBreakdown(statusMap, row.status, row)
  }

  const linkedRows = matchableRows.filter((row) => row.linkStatus === "confirmed")
  const candidateRows = matchableRows.filter((row) => row.linkStatus === "candidate" || row.linkStatus === "stale")
  const unmatchedRows = matchableRows.filter((row) => row.linkStatus !== "confirmed")
  const latestSyncedAt = rows.reduce<string | null>((latest, row) => {
    if (!latest) return row.syncedAt
    return new Date(row.syncedAt).getTime() > new Date(latest).getTime() ? row.syncedAt : latest
  }, null)

  const monthly = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month))
  const compass = await getCompassRevenueCompare(monthly)

  return {
    generatedAt: new Date().toISOString(),
    currentMonth,
    summary: {
      rowCount: rows.length,
      activeRowCount: activeRows.length,
      linkedRowCount: linkedRows.length,
      candidateRowCount: candidateRows.length,
      unmatchedRowCount: unmatchedRows.length,
      contractTargetAmount: activeRows.reduce((sum, row) => sum + row.contractTarget, 0),
      scheduledAmount: activeRows.reduce((sum, row) => sum + row.scheduledAmount, 0),
      confirmedAmount: activeRows.reduce((sum, row) => sum + row.confirmedAmount, 0),
      highConfidenceAmount: activeRows.reduce((sum, row) => sum + row.highConfidenceAmount, 0),
      expectedAmount: activeRows.reduce((sum, row) => sum + row.expectedAmount, 0),
      pastUnconfirmedAmount: activeRows.reduce((sum, row) => sum + row.pastUnconfirmedAmount, 0),
      linkedAmount: linkedRows.reduce((sum, row) => sum + row.scheduledAmount, 0),
      unmatchedAmount: unmatchedRows.reduce((sum, row) => sum + row.scheduledAmount, 0),
      latestSyncedAt,
    },
    rows,
    teams: Array.from(teamMap.values()).sort((a, b) => b.scheduledAmount - a.scheduledAmount),
    managers: Array.from(managerMap.values()).sort((a, b) => b.scheduledAmount - a.scheduledAmount).slice(0, 12),
    statuses: Array.from(statusMap.values()).sort((a, b) => b.scheduledAmount - a.scheduledAmount),
    monthly,
    compass,
    manualLedgerGap,
    warnings,
  }
}

// 무효화 원천(D1): branch_rev_deals 동기화(app/api/admin/branch/sync — sources에 rev 포함 시)와
// crm_source_links 변경(source-links bulk·manual·generate·[id])이 revalidateTag(tag, "max")로
// stale 표시한다. 외부 CRM 동기화·write-request 실행은 이 조립의 입력(branch_rev_deals·
// branch_rev_sheet 링크·라벨 3종)을 건드리지 않으므로 여기 태그를 걸지 않는다.
export const ADMIN_CRM_REVENUE_SHEET_CACHE_TAG = "admin-crm-revenue-sheet"

// REV 시트 전행(최대 QUERY_LIMIT) + 매칭 링크(×3) + 라벨 조회 3종을 매 호출 병렬 실행하는
// 무거운 조립이라 60초 캐시한다. Compass 브리지 호출(getCompassRevenueCompare)도 down 플래그가
// 결과(compass.down)에 그대로 담기므로 캐시 안에 포함해도 안전하다. cookies()/headers()는 읽지
// 않고(admin service-role 클라이언트만 사용) 인자도 없어 unstable_cache에 안전하다.
const getCachedAdminCrmRevenueSheetWorkspace = unstable_cache(
  computeAdminCrmRevenueSheetWorkspace,
  ["admin-crm-revenue-sheet"],
  { revalidate: 60, tags: [ADMIN_CRM_REVENUE_SHEET_CACHE_TAG] }
)

// 함수 시그니처·이름 불변 유지: 소유 밖 호출부(app/api/admin/crm/revenue-sheet/route.ts)가
// 이 이름으로 그대로 가져다 쓰므로, 캐시 배선은 내부 위임으로만 추가한다.
export async function getAdminCrmRevenueSheetWorkspace(): Promise<AdminCrmRevenueSheetWorkspace> {
  return getCachedAdminCrmRevenueSheetWorkspace()
}
