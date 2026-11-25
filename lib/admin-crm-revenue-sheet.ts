import "server-only"

import { unstable_cache } from "next/cache"
import { getBranchRevSourceRecordKey, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { dealHasColorData, splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import { getBusinessDateParts } from "@/lib/business-time"
import { getCompassRevenue } from "@/lib/compass/bridge"
import { nextPendingTransition, pendingMonthAmount } from "@/lib/crm/revenue-sheet-pending"
import { absorptionCutoff, isSheetWriteAbsorbed, oldestSyncedAt } from "@/lib/branch/sheet-writeback/ledger-rules"
import { businessFy } from "@/lib/branch/fiscal"
import {
  isLedgerRevenueDeal,
  LEDGER_REVENUE_CACHE_TAGS,
  mergeLedgerSources,
  readLedgerOverlaySources,
  type LedgerOverlaySources,
} from "@/lib/branch/ledger-revenue"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import {
  isSheetWritesNotReadyError,
  lastSuccessfulRevSyncStartedAt,
  latestSheetWritesByDraftIds,
  type SheetWriteRecord,
} from "@/lib/repositories/branch-sales-ledger-sheet-writes"
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
  // REV 시트 쓰기(ADR-011) — 시트에 쓴 정정인지 감사 표(branch_sales_ledger_sheet_writes)에서 찾는 키.
  draft_id?: string | null
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
  // raw jsonb의 예정분만 경로 선택으로 읽는다(raw 전체는 행 원문이라 무겁다) — 파서가 없던 시기 행은 null.
  pending?: Record<string, number> | null
  pending_weeks?: Record<string, number[]> | null
  // 장부 오버레이(D1)·읽는 시점 확도(F-08·F-15)에 쓰는 raw 경로 — 정정의 원본 행을 Row ID 로 찾고, 빨간 예정 칸을 그 주
  // 시작일(KST)에 확정으로 읽는다. 없으면 null.
  row_id?: unknown
  row_id_issue?: unknown
  pending_cells?: unknown
  month_week_mismatch?: unknown
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
  row: Pick<AdminCrmRevenueSheetRow, "scheduledAmount" | "confirmedAmount" | "highConfidenceAmount" | "expectedAmount" | "pendingAmount">
) {
  const label = key?.trim() || "미지정"
  const current = map.get(label) ?? emptyBreakdown(label)
  current.rowCount += 1
  current.scheduledAmount += row.scheduledAmount
  current.confirmedAmount += row.confirmedAmount
  current.highConfidenceAmount += row.highConfidenceAmount
  // 분해 표는 열을 늘리지 않는다 — '예정'에 확정 예정(ADR-0062)을 합쳐 이전 합계를 유지한다.
  current.expectedAmount += row.expectedAmount + row.pendingAmount
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
      pendingAmount: 0,
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
// REV 시트 쓰기(ADR-011): 반영 때 '2. REV' 에도 쓴 정정은 시트 → 미러(branch_rev_deals) 동기화가 한 번 돌고 나면
// 이 화면에 이미 들어와 있다 — sheetAbsorbedDraftIds(미러에 들어온 시트 쓰기의 초안 id)에 든 항목은 미반영에서
// 뺀다(판정 isSheetWriteAbsorbedByMirror). 인자를 생략하면(감사 표 없음·조회 실패) 기존과 같다.
export function computeManualLedgerGap(
  allRows: BranchSalesLedgerEntryAmountRow[],
  sheetAbsorbedDraftIds?: ReadonlySet<string>,
): AdminCrmRevenueSheetManualLedgerGap {
  const rows =
    sheetAbsorbedDraftIds && sheetAbsorbedDraftIds.size > 0
      ? allRows.filter((row) => !(row.draft_id && sheetAbsorbedDraftIds.has(row.draft_id)))
      : allRows
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

/**
 * 시트에 쓴 정정이 미러에 들어왔는가 — 정본은 lib/branch/sheet-writeback/ledger-rules.ts isSheetWriteAbsorbed
 * (장부 화면 오버레이와 같은 함수). 이 이름은 매출시트 쪽 호출·테스트를 위한 별칭이다.
 */
export const isSheetWriteAbsorbedByMirror: (
  record: Pick<SheetWriteRecord, "status" | "writtenAt">,
  lastRevSyncStartedAt: string | null,
) => boolean = isSheetWriteAbsorbed

/**
 * 미러에 이미 들어온 "시트에 쓴 정정"의 초안 id. 시트 쓰기는 기존 행 정정(manual-edit)만 하므로 그 항목만 본다.
 * 감사 표가 없으면(마이그레이션 전) 빈 집합이 정상이고, 그 밖의 조회 실패는 빈 집합 + 경고(기존 동작 — 과대집계
 * 쪽으로 틀린다).
 */
async function readSheetAbsorbedDraftIds(
  rows: BranchSalesLedgerEntryAmountRow[],
  warnings: string[],
  mirrorSyncedAt: string | null,
): Promise<Set<string>> {
  const draftIds = rows
    .filter((row) => row.entry_type === "manual-edit" && row.draft_id)
    .map((row) => row.draft_id as string)
  if (draftIds.length === 0) return new Set()

  try {
    const [lastRevSyncStartedAt, latest] = await Promise.all([
      lastSuccessfulRevSyncStartedAt(),
      latestSheetWritesByDraftIds(draftIds),
    ])
    // 기준은 마지막 성공 동기화와 이 화면이 읽은 미러 행의 synced_at 중 이른 쪽 — 미러가 그 동기화로 아직 바뀌지 않았으면
    // 쓰기가 미러에 없다(장부 화면 오버레이와 같은 규칙, ledger-rules.ts absorptionCutoff).
    const cutoff = absorptionCutoff(lastRevSyncStartedAt, mirrorSyncedAt)
    const absorbed = new Set<string>()
    for (const [draftId, record] of latest) {
      if (isSheetWriteAbsorbedByMirror(record, cutoff)) absorbed.add(draftId)
    }
    return absorbed
  } catch (error) {
    if (!isSheetWritesNotReadyError(error)) {
      console.error("[admin-crm-revenue-sheet] 시트 쓰기 기록 조회 실패", error)
      warnings.push("시트에 쓴 장부 정정을 확인하지 못했습니다 — 미반영 배지 수치에 시트 반영분이 섞여 있을 수 있습니다.")
    }
    return new Set()
  }
}

// ── 장부 오버레이(D1) ──────────────────────────────────────────────────────────────────────
// 2026-09-10 결정(이 화면은 장부 입력을 볼 수 없어 "미반영" 배지로만 알린다)은 D1(2026-11-25)로 바뀌었다 — 매출은 시트 행 +
// 장부 항목이다. 미러 행에 장부 화면과 같은 규칙(lib/branch/ledger-overlay.ts)으로 장부 항목을 얹는다: 정정은 원본 행의
// 그 달을 대체하고, 신규는 장부 행으로 더해진다(확정 source link 가 없으니 미매칭으로 병기 — 합산하지 않는다).

function mirrorRowToDeal(row: BranchRevDealRow): BranchRevDeal {
  const raw: Record<string, unknown> = {}
  if (row.pending) raw.monthlyPending = row.pending
  if (row.pending_weeks) raw.pendingWeeks = row.pending_weeks
  if (row.row_id != null) raw.rowId = row.row_id
  if (row.row_id_issue != null) raw.rowIdIssue = row.row_id_issue
  if (row.pending_cells != null) raw.pendingCells = row.pending_cells
  if (row.month_week_mismatch != null) raw.monthWeekMismatch = row.month_week_mismatch
  return {
    id: row.id,
    sheet_row: row.sheet_row,
    customer_name: row.customer_name,
    branch_contact: row.branch_contact,
    team: row.team,
    manager: row.manager,
    deal_type: row.deal_type,
    status: row.status,
    first_payment: row.first_payment,
    product_version: row.product_version,
    region: row.region,
    importance: row.importance,
    note: row.note,
    contract_target: row.contract_target == null ? null : numberValue(row.contract_target),
    monthly_payments: row.monthly_payments ?? {},
    // 이 화면은 monthly_red 를 읽지 않는다(색 금액 맵만) — 캐논 입력을 화면과 같게 둔다.
    monthly_red: {},
    monthly_confirmed: row.monthly_confirmed,
    monthly_high_conf: row.monthly_high_conf,
    raw,
    synced_at: row.synced_at,
  }
}

function recordOf<T>(value: unknown): Record<string, T> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, T>) : null
}

/** 합친 딜 → 화면 행 원천. 장부 딜은 원본 미러 행이 없다. */
function dealToMirrorRow(deal: BranchRevDeal, original: BranchRevDealRow | undefined): BranchRevDealRow {
  return {
    ...(original ?? {}),
    id: deal.id,
    sheet_row: deal.sheet_row,
    customer_name: deal.customer_name,
    branch_contact: deal.branch_contact,
    team: deal.team,
    manager: deal.manager,
    deal_type: deal.deal_type,
    status: deal.status,
    first_payment: deal.first_payment,
    product_version: deal.product_version,
    region: deal.region,
    importance: deal.importance,
    note: deal.note,
    contract_target: deal.contract_target,
    monthly_payments: deal.monthly_payments,
    monthly_confirmed: deal.monthly_confirmed ?? null,
    monthly_high_conf: deal.monthly_high_conf ?? null,
    pending: recordOf<number>(deal.raw?.monthlyPending),
    pending_weeks: recordOf<number[]>(deal.raw?.pendingWeeks),
    // 정정한 달은 합치기(mergeLedgerIntoDeals)가 지웠다 — 원본 행 값이 아니라 합친 딜의 raw 를 쓴다.
    pending_cells: deal.raw?.pendingCells ?? null,
    month_week_mismatch: deal.raw?.monthWeekMismatch ?? null,
    synced_at: original?.synced_at ?? deal.synced_at,
  }
}

const LEDGER_OVERLAY_READ_FAILED_WARNING =
  "장부 항목을 읽지 못해 시트(2. REV) 값만 보입니다 — 장부에서 입력한 매출이 합계에서 빠져 있을 수 있습니다."

async function readWorkspaceLedgerSources(warnings: string[], now: Date): Promise<LedgerOverlaySources | null> {
  try {
    return await readLedgerOverlaySources(businessFy(now))
  } catch (error) {
    console.error("[admin-crm-revenue-sheet] 장부 항목 조회 실패", error)
    warnings.push(LEDGER_OVERLAY_READ_FAILED_WARNING)
    return null
  }
}

/** 미러 행 + 장부 항목(D1) → 화면이 셀 딜. deal 은 캐논에 넘기는 값(raw 포함), row 는 표시 원천이다. */
function mergeWorkspaceLedger(
  mirrorRows: BranchRevDealRow[],
  sources: LedgerOverlaySources | null,
  now: Date,
): Array<{ deal: BranchRevDeal; row: BranchRevDealRow; ledger: boolean }> {
  const deals = mirrorRows.map(mirrorRowToDeal)
  const merged = sources && (sources.entries.length > 0 || sources.drafts.length > 0)
    ? mergeLedgerSources(deals, sources, now).deals
    : deals
  const originalById = new Map(mirrorRows.map((row) => [row.id, row]))
  return merged.map((deal) => {
    const original = originalById.get(deal.id)
    return { deal, row: dealToMirrorRow(deal, original), ledger: isLedgerRevenueDeal(deal) }
  })
}

async function computeAdminCrmRevenueSheetWorkspace(): Promise<AdminCrmRevenueSheetWorkspace> {
  const sb = createSupabaseAdminClient()
  const warnings: string[] = []
  // 지금 → 달은 KST 영업일로만 바꾼다(서버 시계는 UTC). 캐논에는 영업일을 넘겨 빨간 예정 칸을 그 주 시작일(KST)에 올린다.
  const { date: businessDate, month: currentMonth } = getBusinessDateParts()

  const [sheetResult, linksResult, accountsResult, customersResult, dealsResult, manualLedgerResult] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select(
        "id, sheet_row, customer_name, branch_contact, team, manager, deal_type, status, first_payment, product_version, region, importance, note, contract_target, monthly_payments, monthly_confirmed, monthly_high_conf, pending:raw->monthlyPending, pending_weeks:raw->pendingWeeks, row_id:raw->rowId, row_id_issue:raw->rowIdIssue, pending_cells:raw->pendingCells, month_week_mismatch:raw->monthWeekMismatch, synced_at"
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
    // 장부 입력 건수(배지) — 매출 합계는 아래 장부 오버레이(D1)가 미러 행에 얹는다. 이 조회는 "장부 입력 N건 포함"
    // 안내만 센다(2026-09-10 "미반영" 배지를 D1 이 대신했다).
    sb
      .from("branch_sales_ledger_entries")
      .select("amount, applied_at, entry_type, draft_id")
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
    warnings.push(`장부 내부 원본(수기 입력) 반영 여부를 확인하지 못했습니다: ${manualLedgerResult.error.message}`)
  }
  if ((manualLedgerResult.data?.length ?? 0) >= QUERY_LIMIT) {
    warnings.push(
      `장부 내부 원본(수기 입력)이 ${QUERY_LIMIT.toLocaleString("ko-KR")}건 이상입니다 — 미반영 배지 수치가 과소집계일 수 있습니다.`
    )
  }
  const manualLedgerRows = (manualLedgerResult.data ?? []) as BranchSalesLedgerEntryAmountRow[]
  const manualLedgerGap: AdminCrmRevenueSheetManualLedgerGap = manualLedgerResult.error
    ? { count: 0, amount: 0, latestAppliedAt: null, newCount: 0, newAmount: 0, editCount: 0 }
    : computeManualLedgerGap(
        manualLedgerRows,
        await readSheetAbsorbedDraftIds(
          manualLedgerRows,
          warnings,
          oldestSyncedAt(((sheetResult.data ?? []) as Array<{ synced_at?: string | null }>).map((row) => ({ syncedAt: row.synced_at ?? null }))),
        ),
      )

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
  // 매출 = 미러 행 + 장부 항목(D1). 장부 항목을 못 읽으면 시트 값만 쓰고 경고한다(빈 장부를 정상처럼 보이지 않는다).
  const overlayNow = new Date()
  const ledgerSources = await readWorkspaceLedgerSources(warnings, overlayNow)
  const mergedDeals = mergeWorkspaceLedger((sheetResult.data ?? []) as BranchRevDealRow[], ledgerSources, overlayNow)
  const rows = mergedDeals.map(({ deal: canonDeal, row: deal, ledger }): AdminCrmRevenueSheetRow => {
    const contractTarget = numberValue(deal.contract_target)
    // 장부 딜은 시트 record key 를 만들지 않는다 — 원본과 같은 행 번호·고객이라 원본의 링크에 붙지 않게 'ledger:<id>'.
    const sourceRecordKey = ledger
      ? `ledger:${deal.id}`
      : getBranchRevSourceRecordKey({
          sheet_row: deal.sheet_row,
          customer_name: deal.customer_name,
          first_payment: deal.first_payment,
          contract_target: contractTarget,
        })
    const link = chooseBestLink(linksByKey.get(sourceRecordKey) ?? [])
    const scheduledAmount = sumRecord(deal.monthly_payments)
    // 확도 분해는 캐논 splitter(rev-confirmed.ts)로 일원화 — raw monthly_confirmed 합산은
    // red-불리언·무색상 폴백이 빠져 장부 확정보다 과소집계된다(구 임포터 ¥103만 vs ¥680만 사건과 동류).
    // 캐논에는 raw(빨간 예정 칸·월≠주 표시)를 실은 딜을 넘긴다 — 그 주 시작일(KST)에 확정으로 읽힌다(F-08).
    const hasColorData = dealHasColorData(canonDeal)
    let confirmedAmount = 0
    let highConfidenceAmount = 0
    let expectedAmount = 0
    let pendingAmount = 0
    const pendingMonths: string[] = []
    let pastUnconfirmedAmount = 0

    for (const [month, rawAmount] of Object.entries(deal.monthly_payments ?? {})) {
      const amount = numberValue(rawAmount)
      const {
        confirmed,
        highConfidence,
        expected: uncolored,
      } = splitMonthConfidence(canonDeal, month, amount, hasColorData, businessDate)
      confirmedAmount += confirmed
      highConfidenceAmount += highConfidence

      addMonth(monthMap, month, "scheduledAmount", amount)
      addMonth(monthMap, month, "confirmedAmount", confirmed)
      addMonth(monthMap, month, "highConfidenceAmount", highConfidence)

      if (uncolored > 0 && month < currentMonth) {
        pastUnconfirmedAmount += uncolored
        addMonth(monthMap, month, "pastUnconfirmedAmount", uncolored)
      } else if (uncolored > 0) {
        // ADR-0062: 미확정분 중 빨간 예정 칸 몫은 '확정 예정'으로 떼고 나머지만 무색 예정으로 둔다.
        // 읽는 날 기준 — 시작일이 온 빨간 칸은 캐논이 이미 확정으로 읽었다(그 몫을 '확정 예정'에 다시 넣지 않는다).
        const pending = pendingMonthAmount(deal, month, uncolored, currentMonth, businessDate)
        if (pending > 0) {
          pendingAmount += pending
          pendingMonths.push(month)
          addMonth(monthMap, month, "pendingAmount", pending)
        }
        expectedAmount += uncolored - pending
        addMonth(monthMap, month, "expectedAmount", uncolored - pending)
      }
    }

    const nextTransition = nextPendingTransition(deal, pendingMonths, businessDate)
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
      pendingAmount,
      pendingNextWeek: nextTransition?.week ?? null,
      pendingNextStart: nextTransition?.start ?? null,
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
      // 장부에서 온 행(신규·원본과 담당이 다른 정정) — 시트 행 번호가 아니다. 값이 있을 때만 키를 둔다.
      ...(ledger ? { ledgerEntry: true } : {}),
    }
  })

  const activeRows = rows.filter((row) => !INACTIVE_STATUS_PATTERN.test(row.status ?? ""))
  // 장부에서 온 행은 매칭 대상이 아니다 — REV 링크는 시트 행에만 만들 수 있어 "미매칭"으로 세면 풀 수 없는 수가 남는다.
  // 금액은 요약·분해 합계에 그대로 들어간다(D1).
  const matchableRows = activeRows.filter((row) => !row.placeholder && !row.ledgerEntry)
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
  // 동기화 시각은 시트 행만 본다 — 장부 행의 시각은 반영 시각이다.
  const latestSyncedAt = rows.filter((row) => !row.ledgerEntry).reduce<string | null>((latest, row) => {
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
      pendingAmount: activeRows.reduce((sum, row) => sum + row.pendingAmount, 0),
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
  // 장부 항목 태그도 건다 — 반영·되돌리기가 그 태그를 즉시 만료하면 시트 + 장부 매출(D1)이 함께 새로 조립된다.
  { revalidate: 60, tags: [ADMIN_CRM_REVENUE_SHEET_CACHE_TAG, ...LEDGER_REVENUE_CACHE_TAGS] }
)

// 함수 시그니처·이름 불변 유지: 소유 밖 호출부(app/api/admin/crm/revenue-sheet/route.ts)가
// 이 이름으로 그대로 가져다 쓰므로, 캐시 배선은 내부 위임으로만 추가한다.
export async function getAdminCrmRevenueSheetWorkspace(): Promise<AdminCrmRevenueSheetWorkspace> {
  return getCachedAdminCrmRevenueSheetWorkspace()
}
