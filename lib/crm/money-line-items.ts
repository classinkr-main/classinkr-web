// CRM 360 매출 탭 M2·M4 — 품목별 대수 합산·근거(확정/추정) 판정·정렬, 미매칭 출고 유사도.
//
// 순수 함수만 둔다(I/O 없음, "server-only" 금지) — DB 접근(고객·딜·HW 출고 조회, 확정 링크
// 조회)은 lib/repositories/crm-account-money.ts가 맡고, 여기서 만든 함수에 이미 이 계정과
// 관련된(또는 관련 후보인) 행만 넘긴다. 근거 판정 규칙(확정/추정)과 카테고리 휴리스틱은
// 이 파일 한 곳에만 둔다 — 다른 곳에서 board/stand/camera/software 정규식을 새로 만들지 않는다.
//
// 통화 규범: 딜(deal_line_items)은 자체 집계 원화(KRW), HW 출고(hw_outbound)의 revenue는
// 달러(USD) — lib/repositories/crm-account-money.ts의 기존 주석과 같은 캐논. 같은 품목이라도
// 통화·근거·출처가 다르면 절대 한 행으로 합치지 않는다(합산 오독 방지).

import { normalizedAccountKey } from "@/lib/branch/account-key"

export type CrmMoneyLineItemCategory = "board" | "stand" | "camera" | "software" | "other"
export type CrmMoneyLineItemSource = "deal_line_items" | "hw_outbound"
export type CrmMoneyLineItemEvidence = "confirmed" | "estimated"
export type CrmMoneyLineItemCurrency = "USD" | "CNY" | "KRW"

export interface CrmMoneyLineItemDetail {
  /** 딜 코드·출고 물류번호 등 사람이 알아볼 수 있는 참조 번호. */
  ref: string
  at: string | null
  quantity: number
  serials: string[]
}

export interface CrmMoneyLineItem {
  /** 그룹 키(source·evidence·currency·정규화 품목명) — React key로도 쓸 수 있게 결정적이다. */
  key: string
  product: string
  category: CrmMoneyLineItemCategory
  quantity: number
  unitPrice: number | null
  amount: number | null
  currency: CrmMoneyLineItemCurrency | null
  source: CrmMoneyLineItemSource
  evidence: CrmMoneyLineItemEvidence
  lastAt: string | null
  details: CrmMoneyLineItemDetail[]
}

export interface CrmMoneyLineItemsMeta {
  /** 원천 조회가 상한(캐시 페이지 상한 등)에 걸려 일부만 반영됐을 수 있다. */
  truncated: boolean
  sources: CrmMoneyLineItemSource[]
  note?: string
}

// ── 카테고리 휴리스틱 ─────────────────────────────────────────────────────
// crm-account-money.ts의 isBoardProduct(칠판 전용)를 확장해 스탠드·카메라·소프트웨어까지
// 넓힌다. 오탐 여지가 있는 휴리스틱이라 순서(칠판→카메라→스탠드→소프트웨어)가 결과에
// 영향을 준다 — "카메라 스탠드"류 복합명은 카메라로 먼저 잡는다.
const BOARD_PATTERN =
  /전자칠판|칠판|board|whiteboard|ifp|(?:^|[^0-9])(?:65|70|75|86|98|110)\s*(?:형|인치|inch|")/i
const CAMERA_PATTERN = /카메라|camera|캠코더|웹캠/i
const STAND_PATTERN = /스탠드|거치대|거치\s*스탠드|거치\s*벽걸이|거치\s*매립|마운트|mount|stand|cart|trolley|바퀴/i
const SOFTWARE_PATTERN =
  /소프트웨어|구독|라이선스|라이센스|플랫폼|좌석|연간\s*(플랜|계정)?|계정\s*권|license|licence|saas|platform|seat|classin|클래스인/i

export function categorizeMoneyLineItemProduct(product: string | null | undefined): CrmMoneyLineItemCategory {
  const text = String(product ?? "").normalize("NFKC")
  if (!text.trim()) return "other"
  if (BOARD_PATTERN.test(text)) return "board"
  if (CAMERA_PATTERN.test(text)) return "camera"
  if (STAND_PATTERN.test(text)) return "stand"
  if (SOFTWARE_PATTERN.test(text)) return "software"
  return "other"
}

// ── 입력 모양(호출부가 이미 이 계정과 관련된 행만 골라 넘긴다) ──────────────

export interface MoneyDealLineItemRow {
  /** 딜 코드 등 "주문번호" 표기용 참조. */
  ref: string
  product: string
  quantity: number | null
  unitPrice: number | null
  amount: number | null
  currency: CrmMoneyLineItemCurrency
  at: string | null
}

export interface MoneyHwOutboundRow {
  id: string
  /** 물류번호 등 "주문번호" 표기용 참조. */
  ref: string
  product: string
  quantity: number | null
  /** HW 출고 원장의 revenue(USD). null이면 금액 미상 — quantity만 대수에 반영한다. */
  revenue: number | null
  destination: string | null
  serials: string[]
  outboundDate: string | null
  isPlanned: boolean
  /** crm_source_links 확정 링크의 target_id(NEO 계정 id). 없으면 null. */
  confirmedAccountId: string | null
}

export interface MoneyLineItemAccountContext {
  /** 이 360이 보고 있는 NEO 계정 id. */
  accountId: string
  accountName: string
}

export interface BuildCrmMoneyLineItemsResult {
  lineItems: CrmMoneyLineItem[]
  meta: CrmMoneyLineItemsMeta
  /**
   * 이 계정과 확정 링크도 없고 목적지 이름도 정확히 일치하지 않는 HW 출고 — M4
   * buildUnmatchedOutboundCandidates의 입력으로 그대로 넘긴다.
   */
  unlinkedHwOutbound: MoneyHwOutboundRow[]
}

function toPositiveInt(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

function toFiniteOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

/** 여러 개의 null 허용 금액을 더한다 — 전부 null이면 null(미상), 하나라도 있으면 있는 것만 합친다. */
function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null)
  if (present.length === 0) return null
  return present.reduce((sum, value) => sum + value, 0)
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

// 그룹핑 전용 정규화 — 화면 표기(product)는 원문을 그대로 쓰고, 이 키는 "같은 품목" 판정에만 쓴다.
function normalizeProductGroupKey(product: string): string {
  return product
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

interface RawLineItemRow {
  source: CrmMoneyLineItemSource
  evidence: CrmMoneyLineItemEvidence
  product: string
  quantity: number
  amount: number | null
  unitPrice: number | null
  currency: CrmMoneyLineItemCurrency
  ref: string
  at: string | null
  serials: string[]
}

function groupKeyOf(row: RawLineItemRow): string {
  return `${row.source}:${row.evidence}:${row.currency}:${normalizeProductGroupKey(row.product)}`
}

/**
 * M2 — 딜 라인아이템·HW 출고를 품목별로 합산한다.
 *
 * 근거 판정(이 함수 안에서 고정):
 *  - deal_line_items: 항상 "confirmed". `deals.customer_id`가 NOT NULL FK라 이 행이
 *    호출부에 넘어왔다는 것 자체가 이미 고객 레코드에 구조적으로 연결됐다는 뜻이다
 *    (HW 출고의 destination 자유 텍스트 비교와 다르다).
 *  - hw_outbound: `confirmedAccountId === account.accountId`면 "confirmed"
 *    (crm_source_links 확정 링크), 아니면 목적지 이름이 이 계정과 정확히 같을 때만
 *    "estimated"로 포함한다. 그 외(다른 계정으로 확정됐거나 이름이 다름)는 lineItems에
 *    넣지 않고 unlinkedHwOutbound로 돌려 M4 후보 산정에 넘긴다.
 *
 * 같은 (source, evidence, currency, 정규화 품목명)은 한 행으로 합산(수량 합산, 건별
 * 명세는 details로 보존)하고, 통화·근거·출처가 다르면 절대 같은 행으로 합치지 않는다.
 * 정렬은 수량 내림차순.
 */
export function buildCrmMoneyLineItems(
  account: MoneyLineItemAccountContext,
  input: { dealLineItems: MoneyDealLineItemRow[]; hwOutbound: MoneyHwOutboundRow[] },
  options: { truncated?: boolean } = {}
): BuildCrmMoneyLineItemsResult {
  const accountKey = normalizedAccountKey(account.accountName)
  const plannedExcludedCount = input.hwOutbound.filter((row) => row.isPlanned).length
  const activeHw = input.hwOutbound.filter((row) => !row.isPlanned)

  const linkedHw: Array<{ row: MoneyHwOutboundRow; evidence: CrmMoneyLineItemEvidence }> = []
  const unlinkedHwOutbound: MoneyHwOutboundRow[] = []

  for (const row of activeHw) {
    if (row.confirmedAccountId) {
      if (row.confirmedAccountId === account.accountId) {
        linkedHw.push({ row, evidence: "confirmed" })
      }
      // 다른 계정으로 이미 확정된 출고는 이 계정과 무관 — 미매칭 후보에도 넣지 않는다.
      continue
    }
    const destKey = normalizedAccountKey(row.destination)
    if (accountKey && destKey && destKey === accountKey) {
      linkedHw.push({ row, evidence: "estimated" })
    } else {
      unlinkedHwOutbound.push(row)
    }
  }

  const rawRows: RawLineItemRow[] = [
    ...input.dealLineItems.map((row): RawLineItemRow => {
      const quantity = toPositiveInt(row.quantity)
      const amount = toFiniteOrNull(row.amount)
      return {
        source: "deal_line_items",
        evidence: "confirmed",
        product: row.product,
        quantity,
        amount,
        unitPrice: toFiniteOrNull(row.unitPrice) ?? (amount != null && quantity > 0 ? amount / quantity : null),
        currency: row.currency,
        ref: row.ref,
        at: row.at,
        serials: [],
      }
    }),
    ...linkedHw.map(({ row, evidence }): RawLineItemRow => {
      const quantity = toPositiveInt(row.quantity)
      const amount = toFiniteOrNull(row.revenue)
      return {
        source: "hw_outbound",
        evidence,
        product: row.product,
        quantity,
        amount,
        unitPrice: amount != null && quantity > 0 ? amount / quantity : null,
        currency: "USD",
        ref: row.ref,
        at: row.outboundDate,
        serials: row.serials,
      }
    }),
  ]

  const groups = new Map<string, RawLineItemRow[]>()
  for (const row of rawRows) {
    const key = groupKeyOf(row)
    const bucket = groups.get(key)
    if (bucket) bucket.push(row)
    else groups.set(key, [row])
  }

  const lineItems: CrmMoneyLineItem[] = [...groups.entries()].map(([key, rows]) => {
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0)
    const amount = sumNullable(rows.map((row) => row.amount))
    const unitPrice =
      amount != null && quantity > 0
        ? Math.round((amount / quantity) * 100) / 100
        : (rows.find((row) => row.unitPrice != null)?.unitPrice ?? null)
    const lastAt = rows.reduce<string | null>((latest, row) => laterIso(latest, row.at), null)
    const details: CrmMoneyLineItemDetail[] = rows
      .map((row) => ({ ref: row.ref, at: row.at, quantity: row.quantity, serials: row.serials }))
      .sort((a, b) => {
        if (!a.at && !b.at) return 0
        if (!a.at) return 1
        if (!b.at) return -1
        return new Date(b.at).getTime() - new Date(a.at).getTime()
      })
    const first = rows[0]
    return {
      key,
      product: first.product,
      category: categorizeMoneyLineItemProduct(first.product),
      quantity,
      unitPrice,
      amount,
      currency: first.currency,
      source: first.source,
      evidence: first.evidence,
      lastAt,
      details,
    }
  })

  lineItems.sort((a, b) => b.quantity - a.quantity)

  const sources = [...new Set(rawRows.map((row) => row.source))]
  const meta: CrmMoneyLineItemsMeta = {
    truncated: Boolean(options.truncated),
    sources,
    note: plannedExcludedCount > 0 ? `예정 출고 ${plannedExcludedCount}건 제외` : undefined,
  }

  return { lineItems, meta, unlinkedHwOutbound }
}

// ── M4 — 미매칭 출고 유사도 ───────────────────────────────────────────────

function tokenizeAccountName(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s()[\]{}._\-|/,·・]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

/**
 * 두 거래처명의 유사도(0~1). normalizedAccountKey 부분 포함이면 최소 0.8, 그 외에는
 * 토큰(공백·구분자 분리) 겹침 비율(작은 쪽 집합 기준)을 쓴다. 정확히 같은 정규화 키면 1.
 */
export function computeAccountNameSimilarity(accountName: string, candidateName: string): number {
  const keyA = normalizedAccountKey(accountName)
  const keyB = normalizedAccountKey(candidateName)
  if (!keyA || !keyB) return 0
  if (keyA === keyB) return 1

  const tokensA = new Set(tokenizeAccountName(accountName))
  const tokensB = new Set(tokenizeAccountName(candidateName))
  let overlap = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1
  }
  const smaller = Math.min(tokensA.size, tokensB.size) || 1
  const tokenOverlapRatio = overlap / smaller

  const isPartialMatch = keyA.includes(keyB) || keyB.includes(keyA)
  if (isPartialMatch) return Math.max(0.8, tokenOverlapRatio)
  return tokenOverlapRatio
}

export const CRM_UNMATCHED_OUTBOUND_SIMILARITY_THRESHOLD = 0.5

export interface CrmUnmatchedOutboundCandidate {
  id: string
  product: string
  quantity: number
  destination: string
  outboundDate: string | null
  serials: string[]
  /** 0~1, 소수 둘째 자리로 반올림. */
  similarity: number
}

/**
 * buildCrmMoneyLineItems가 돌려준 unlinkedHwOutbound에서 이름이 비슷한 상위 후보를 고른다.
 * 정확히 일치하거나 확정 링크가 있는 행은 이미 buildCrmMoneyLineItems가 걸러냈으므로
 * 여기서는 순수하게 유사도 임계값(≥0.5)과 정렬·상한만 담당한다.
 */
export function buildUnmatchedOutboundCandidates(
  accountName: string,
  rows: MoneyHwOutboundRow[],
  limit = 5
): CrmUnmatchedOutboundCandidate[] {
  return rows
    .map((row) => ({ row, similarity: computeAccountNameSimilarity(accountName, row.destination ?? "") }))
    .filter(({ similarity }) => similarity >= CRM_UNMATCHED_OUTBOUND_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(({ row, similarity }) => ({
      id: row.id,
      product: row.product,
      quantity: toPositiveInt(row.quantity),
      destination: row.destination ?? "",
      outboundDate: row.outboundDate,
      serials: row.serials,
      similarity: Math.round(similarity * 100) / 100,
    }))
}
