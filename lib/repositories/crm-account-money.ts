import "server-only"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"
import { isInactiveSheetStatus, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import { listBranchRevDeals, type BranchRevDeal } from "@/lib/repositories/branch-deals"
import { listHwOutbound, type HwOutbound } from "@/lib/repositories/branch-hw"

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
