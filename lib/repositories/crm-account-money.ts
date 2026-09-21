import "server-only"

import { unstable_cache } from "next/cache"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"
import { isInactiveSheetStatus, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import {
  buildCrmMoneyLineItems,
  buildUnmatchedOutboundCandidates,
  type CrmMoneyLineItem,
  type CrmMoneyLineItemsMeta,
  type CrmUnmatchedOutboundCandidate,
  type MoneyDealLineItemRow,
  type MoneyHwOutboundRow,
} from "@/lib/crm/money-line-items"
import { listBranchRevDeals, type BranchRevDeal } from "@/lib/repositories/branch-deals"
import { listHwOutbound, type HwOutbound } from "@/lib/repositories/branch-hw"
import { listConfirmedHwOutboundAccountLinks } from "@/lib/repositories/crm-source-links"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// ── 고객 360 제품 매출 요약 (계정키 조인) ────────────────────────────────────
//
// account-key.ts 규약(normalizedAccountKey)으로 고객명을 REV 원장·HW 출고에 조인해
// 드로어 머니 섹션에 3수치를 채운다. account-master(REV 집계)·hw-rev-reconcile(HW by
// account)와 같은 원천·같은 필터(비활성 상태/placeholder 제외, planned 제외)를 재사용한다.
//
// 통화 규범(운영 캐논 §5): SW/HW 결제 누적은 REV 원장 값이라 위안화(CNY). HW 출고 시트의
// revenue(USD)는 여기서 절대 CNY로 섞지 않는다 — HW 출고는 "칠판 대수" 카운트에만 쓴다.

export interface CrmAccountProductSummary {
  /** REV 원장에서 이 계정 + 제품군=software 누적(CNY) */
  swCumulativeCNY: number | null
  /** REV 원장에서 이 계정 + 제품군=hardware 누적(CNY) */
  hwCumulativeCNY: number | null
  /** HW 출고 원장에서 이 계정으로 실출고된 칠판(board/IFP) 대수(planned 제외) */
  hwBoardCount: number | null
  /** 계정키로 REV/HW 원장에 연결된 행이 하나라도 있으면 true */
  matched: boolean
}

export const EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY: CrmAccountProductSummary = {
  swCumulativeCNY: null,
  hwCumulativeCNY: null,
  hwBoardCount: null,
  matched: false,
}

// hw-rev-reconcile와 동일 규칙 — progress에 '예정'이 있거나 출고일이 없으면 실출고 아님.
const PLANNED_PATTERN = /예정|planned|pending/i

function isPlannedOutbound(row: HwOutbound): boolean {
  if (PLANNED_PATTERN.test(row.progress ?? "")) return true
  return !row.outbound_date
}

// 칠판(전자칠판/IFP) 판별 — 키워드 또는 인치 사이즈(65/70/75/86/98/110형)로 폭넓게.
// 스탠드·벽걸이·카메라 등 부속은 board가 아니므로 대수에서 제외된다(휴리스틱, 오탐 여지 있음).
const BOARD_KEYWORD_PATTERN = /전자칠판|칠판|board|whiteboard|ifp/i
const BOARD_SIZE_PATTERN = /(?:^|[^0-9])(?:65|70|75|86|98|110)\s*(?:형|인치|inch|")/i

function isBoardProduct(product: string | null | undefined): boolean {
  const text = String(product ?? "").normalize("NFKC")
  if (!text.trim()) return false
  return BOARD_KEYWORD_PATTERN.test(text) || BOARD_SIZE_PATTERN.test(text)
}

function sumMonthly(payments: Record<string, number> | null | undefined): number {
  let sum = 0
  for (const value of Object.values(payments ?? {})) {
    const amount = Number(value)
    if (Number.isFinite(amount)) sum += amount
  }
  return sum
}

// 고객명(header.name)을 계정키로 정규화해 REV/HW 원장 전량에서 이 계정만 필터·집계한다.
// 리더(listBranchRevDeals·listHwOutbound)는 unstable_cache(60s)라 계정별 반복 호출도 저렴하다.
export async function getCrmAccountProductSummary(
  name: string | null | undefined,
): Promise<CrmAccountProductSummary> {
  const accountKey = normalizedAccountKey(name)
  if (!accountKey) return EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY

  const [revDeals, hwOutbound] = await Promise.all([
    listBranchRevDeals().catch(() => [] as BranchRevDeal[]),
    listHwOutbound().catch(() => [] as HwOutbound[]),
  ])

  let swCumulativeCNY = 0
  let hwCumulativeCNY = 0
  let revMatchedRows = 0
  for (const deal of revDeals) {
    if (normalizedAccountKey(deal.customer_name) !== accountKey) continue
    if (isInactiveSheetStatus(deal.status) || isPlaceholderCrmName(deal.customer_name)) continue
    revMatchedRows += 1
    const amount = sumMonthly(deal.monthly_payments)
    const category = classifySalesLedgerProductCategory({
      product: deal.product_version,
      account: deal.deal_type,
      rawText: deal.note,
    })
    if (category === "hardware") hwCumulativeCNY += amount
    else swCumulativeCNY += amount
  }

  let hwBoardCount = 0
  let hwMatchedRows = 0
  for (const row of hwOutbound) {
    if (normalizedAccountKey(row.destination) !== accountKey) continue
    hwMatchedRows += 1
    if (isPlannedOutbound(row)) continue
    if (!isBoardProduct(row.product)) continue
    const qty = Number(row.quantity)
    if (Number.isFinite(qty)) hwBoardCount += qty
  }

  const matched = revMatchedRows > 0 || hwMatchedRows > 0
  if (!matched) return EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY

  return { swCumulativeCNY, hwCumulativeCNY, hwBoardCount, matched: true }
}

// ── 360 M2·M4 — 품목별 대수 표 · 미매칭 출고 후보 ─────────────────────────
//
// Portal V2 딜(`deals`/`deal_line_items`)과 HW 출고(`branch_hw_outbound`)를 계정키로 조인해
// 품목·대수·근거(확정/추정)를 계산한다. 근거 판정·합산·정렬·유사도 산식은 전부
// lib/crm/money-line-items.ts(순수)에 있다 — 이 파일은 원천 조회와 계정 매칭 필터만 한다.

export interface CrmMoneyLineItemsSummary {
  lineItems: CrmMoneyLineItem[]
  lineItemsMeta: CrmMoneyLineItemsMeta
  unmatchedOutbound: CrmUnmatchedOutboundCandidate[]
}

export const EMPTY_CRM_MONEY_LINE_ITEMS_SUMMARY: CrmMoneyLineItemsSummary = {
  lineItems: [],
  lineItemsMeta: { truncated: false, sources: [] },
  unmatchedOutbound: [],
}

// deals.customer_id는 NOT NULL FK라 이 조인에 걸리는 라인아이템은 전부 "고객 레코드에 구조적으로
// 연결됨" — money-line-items.ts가 이 사실을 근거로 deal_line_items 행을 항상 confirmed로 둔다.
const PORTAL_DEAL_LINE_ITEM_QUERY_LIMIT = 5000
// 이 원천을 무효화하는 쓰기 경로가 아직 없다(Portal V2 딜은 이 CRM 화면 밖에서만 쓰기가
// 일어난다) — account-master.ts의 "부분 커버리지, TTL만" 관례와 같다. 쓰기 트리거가 생기면
// 이 태그를 revalidateTag(tag, "max")로 걸면 된다.
export const CRM_MONEY_LINE_ITEMS_CACHE_TAG = "crm-money-line-items"
const CRM_MONEY_LINE_ITEMS_REVALIDATE_SECONDS = 60

interface PortalDealLineItemJoinRow {
  id: string
  deal_id: string
  product_name: string
  quantity: number | string | null
  unit_price: number | string | null
  amount: number | string | null
  updated_at: string | null
  deals: {
    id: string
    deal_code: string | null
    customer_id: string | null
    customers: {
      id: string
      name: string | null
      campus_name: string | null
      contact_name: string | null
    } | null
  } | null
}

interface PortalDealLineItemsSnapshot {
  rows: PortalDealLineItemJoinRow[]
  truncated: boolean
}

// deal_line_items → deals → customers를 임베디드 셀렉트 한 번으로 읽는다(lib/portal/repositories
// 가 이미 쓰는 `!inner(...)` 패턴). deal_id 목록으로 .in()을 거는 대신 이 방식을 쓰는 이유는
// 계정이 많을 때 URL 길이 상한(수천 UUID)을 피하기 위해서다 — 전량을 60초 캐시로 재사용한다.
async function listPortalDealLineItemsUncached(): Promise<PortalDealLineItemsSnapshot> {
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("deal_line_items")
    .select(
      "id, deal_id, product_name, quantity, unit_price, amount, updated_at, deals!inner(id, deal_code, customer_id, customers!inner(id, name, campus_name, contact_name))"
    )
    .limit(PORTAL_DEAL_LINE_ITEM_QUERY_LIMIT)

  if (error) throw error
  const rows = ((data ?? []) as unknown[]) as PortalDealLineItemJoinRow[]
  return { rows, truncated: rows.length >= PORTAL_DEAL_LINE_ITEM_QUERY_LIMIT }
}

const listCachedPortalDealLineItems = unstable_cache(
  listPortalDealLineItemsUncached,
  ["crm-money-line-items-portal-deals"],
  { revalidate: CRM_MONEY_LINE_ITEMS_REVALIDATE_SECONDS, tags: [CRM_MONEY_LINE_ITEMS_CACHE_TAG] }
)

function toFiniteNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 360 매출 탭 M2(품목별 대수)·M4(미매칭 출고 후보) 조립. `accountId`가 null이면(리드 대상)
 * 품목 조인 대상이 아니라는 사실 자체를 note로 밝히고 빈 배열을 돌려준다 — NEO 계정으로
 * 등록되기 전 리드는 애초에 어느 NEO 계정과도 확정 링크를 가질 수 없기 때문이다.
 */
export async function getCrmMoneyLineItemsSummary(input: {
  name: string | null | undefined
  /** NEO 계정 id. lead 대상은 null. */
  accountId: string | null
}): Promise<CrmMoneyLineItemsSummary> {
  const accountKey = normalizedAccountKey(input.name)
  if (!accountKey) return EMPTY_CRM_MONEY_LINE_ITEMS_SUMMARY

  if (!input.accountId) {
    return {
      lineItems: [],
      lineItemsMeta: {
        truncated: false,
        sources: [],
        note: "리드는 품목 조인 대상이 아닙니다 · NEO 계정 등록 후 표시됩니다.",
      },
      unmatchedOutbound: [],
    }
  }

  const [portalSnapshot, hwOutbound, confirmedHwLinks] = await Promise.all([
    listCachedPortalDealLineItems().catch(() => ({ rows: [], truncated: false }) as PortalDealLineItemsSnapshot),
    listHwOutbound().catch(() => [] as HwOutbound[]),
    listConfirmedHwOutboundAccountLinks().catch(() => new Map<string, string>()),
  ])

  const dealLineItems: MoneyDealLineItemRow[] = []
  for (const row of portalSnapshot.rows) {
    const deal = row.deals
    const customer = deal?.customers ?? null
    if (!deal || !customer) continue
    const customerKeys = [
      normalizedAccountKey(customer.name),
      normalizedAccountKey(customer.campus_name),
      normalizedAccountKey(customer.contact_name),
    ].filter(Boolean)
    if (!customerKeys.includes(accountKey)) continue

    dealLineItems.push({
      ref: deal.deal_code ?? row.deal_id,
      product: row.product_name,
      quantity: toFiniteNumberOrNull(row.quantity),
      unitPrice: toFiniteNumberOrNull(row.unit_price),
      amount: toFiniteNumberOrNull(row.amount),
      currency: "KRW",
      at: row.updated_at,
    })
  }

  const hwOutboundRows: MoneyHwOutboundRow[] = hwOutbound.map((row) => ({
    id: row.id,
    ref: row.logistics_no ?? row.id,
    product: row.product,
    quantity: toFiniteNumberOrNull(row.quantity),
    revenue: toFiniteNumberOrNull(row.revenue),
    destination: row.destination,
    serials: Array.isArray(row.serials) ? row.serials : [],
    outboundDate: row.outbound_date,
    isPlanned: isPlannedOutbound(row),
    confirmedAccountId: confirmedHwLinks.get(`hw:outbound:${row.id}`) ?? null,
  }))

  const built = buildCrmMoneyLineItems(
    { accountId: input.accountId, accountName: input.name ?? "" },
    { dealLineItems, hwOutbound: hwOutboundRows },
    { truncated: portalSnapshot.truncated }
  )

  const unmatchedOutbound = buildUnmatchedOutboundCandidates(input.name ?? "", built.unlinkedHwOutbound, 5)

  return { lineItems: built.lineItems, lineItemsMeta: built.meta, unmatchedOutbound }
}
