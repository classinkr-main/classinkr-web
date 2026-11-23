// 총판 정산 스냅샷(2026-11-23) — 쿼드러닝 계정 잔액 보드의 데이터 모양과 읽기 검사.
//
// 스냅샷은 저장소 밖 정산 대조 스크립트가 만든 JSON 한 덩어리다(금액은 모두 원).
// scripts/upload-partner-settlement-snapshot.mjs 가 public.partner_settlement_snapshots 에 총판마다 한 행으로 올리고,
// lib/repositories/partner-settlement-snapshot.ts 가 읽어 /api/admin/partner-settlement 로 내보낸다.
// 순수 모듈 — 저장소·화면 양쪽이 쓴다.

export const QUAD_PARTNER_KEY = "quad"

/** due=쿼드가 더 보내야 함 · credit=받은 돈이 공급가보다 많음 · unverified=입금 근거가 매출장부뿐 · settled=딱 맞음 */
export type DealStatus = "due" | "credit" | "unverified" | "settled"
/** partner=쿼드가 고객에게 받고 우리에게 이체 · card=고객이 우리에게 카드 직결제 · mixed=카드와 이체가 섞임 */
export type Route = "partner" | "card" | "mixed"
export type ReceiptKind = "transfer" | "card" | "ledger"

export interface Deal {
  id: string
  customer: string
  owner: string
  /** 정산시트 표기 그대로 (예: "8/19~8/24") */
  installDate: string
  /** 공급가 청구액 */
  supply: number
  /** 고객 카드 총액 */
  card: number
  /** 쿼드 계좌이체 (정산시트 배분 기준) */
  transfer: number
  /** 매출장부만 보고 입금 처리한 금액 */
  ledgerPaid: number
  paid: number
  /** supply − paid. 양수 = 쿼드가 더 보내야 함, 음수 = 우리가 더 받음 */
  diff: number
  route: Route
  status: DealStatus
  /** 한 줄 판정 */
  note: string
}

/** NEO 回款 1건. collected = NEO 의 수금일 */
export interface NeoClaim {
  customer: string
  amount: number
  channel: string
  ref: string
  collected: string
  /** 같은 날 들어온 입금(묶음 이체). 없으면 null */
  receipt: string | null
  receiptLabel: string | null
}

export interface Receipt {
  id: string
  dateLabel: string
  kind: ReceiptKind
  amount: number
  /** 정산시트 표기 */
  label: string
  /** 붙은 건 id. 어느 건인지 모르는 입금은 null */
  deal: string | null
  customer: string
  evidence: string
  /** 통장 대조 결과. 카드는 카드 내역이 올 때까지 null */
  bank: { at: string; amount: number; source: string } | null
}

export interface StatementEntry {
  date: string
  dateLabel: string
  type: "charge" | ReceiptKind
  label: string
  detail: string
  /** 청구는 +, 받은 돈은 − */
  amount: number
  balance: number
  deal: string | null
  evidence: string
}

export interface MonthRow {
  /** "8월" 형태 */
  month: string
  endBalance: number
}

export interface Issue {
  id: string
  severity: "high" | "mid" | "low"
  kind: string
  title: string
  amount: number | null
  deals: string[]
  detail: string
  /** 잔액에 미치는 영향 */
  effect: string
  action: string
}

export interface BacklogItem {
  title: string
  amount: number | null
  rows: number[]
  detail: string
}

export interface Totals {
  supply: number
  transfer: number
  card: number
  ledgerPaid: number
  transferCount: number
  cardCount: number
  ledgerCount: number
  receiptCount: number
  /** 통장과 맞춘 받은 돈 건수 */
  bankMatched: number
  /** 어느 건인지 모르는 입금 합계 (잔액에는 들어감) */
  unallocated: number
  /** 우리가 쿼드로 보낸 돈 중 정체를 모르는 것의 합계 */
  outflow: number
  /** 쿼드가 더 보내야 할 건의 합 */
  due: number
  /** 받은 돈이 공급가보다 많은 건의 합 */
  credit: number
  /** 정산시트엔 없고 NEO 에만 있는 금액 */
  neoOnly: number
  counts: Record<DealStatus, number>
  /** supply − transfer − card − ledgerPaid = due − credit − unallocated */
  balance: number
  /** balance − neoOnly (NEO 에만 있는 입금이 실제로 들어왔으면) */
  low: number
  /** balance + outflow (쿼드로 보낸 돈이 '더 받은 돈' 반환이면) */
  high: number
}

export interface PartnerSettlementSnapshot {
  generatedAt: string
  partner: string
  /** 정산 방식 예시 (가격표의 대표 1세트) */
  rule: { item: string; market: number; supply: number; margin: number }
  sources: Array<{ key: string; name: string; detail: string }>
  totals: Totals
  deals: Deal[]
  receipts: Receipt[]
  /** 정산시트엔 입금이 없고 NEO 에만 있으며, 붙을 입금도 없는 것 */
  neoOnly: NeoClaim[]
  /** 정산시트엔 입금이 없지만 NEO 수금일이 다른 건의 입금과 같은 날인 것 */
  neoSameTransfer: NeoClaim[]
  statement: StatementEntry[]
  months: MonthRow[]
  issues: Issue[]
  /** 통장으로 확인돼 닫힌 것 */
  resolved: Array<{ title: string; amount: number; detail: string }>
  backlog: BacklogItem[]
  /** 우리 → 쿼드 출금 (통장). label = 분류된 출금 이름, 모르면 null */
  outflows: Array<{ at: string; amount: number; memo: string; label: string | null }>
  outflowNote: string
  /** 정산 기간 전 쿼드 입금 */
  preAugust: Array<{ at: string; amount: number }>
  priceTable: Array<{ product: string; tiers: Array<{ qty: string; supply: number; market: number }> }>
  priceNote: string
}

/** Overview 카드가 쓰는 값 — 청구 − 쿼드 이체 − 고객 카드(− 장부 기준) = 잔액. */
export interface PartnerSettlementSummary {
  billed: number
  transfers: number
  card: number
  /** 매출장부만 보고 입금 처리한 금액 — 0 이 아니면 식에 한 줄 더 붙는다. */
  ledger: number
  balance: number
  generatedAt: string
}

const TOTAL_NUMBERS = [
  "supply", "transfer", "card", "ledgerPaid", "transferCount", "cardCount", "ledgerCount", "receiptCount",
  "bankMatched", "unallocated", "outflow", "due", "credit", "neoOnly", "balance", "low", "high",
] as const
const LISTS = [
  "sources", "deals", "receipts", "neoOnly", "neoSameTransfer", "statement", "months", "issues", "resolved",
  "backlog", "outflows", "preAugust", "priceTable",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value)

/**
 * DB 의 jsonb 를 보드가 읽을 수 있는 스냅샷으로 받아들인다. 모양이 다르면 null.
 * 보드가 바로 읽는 자리(머리 문자열·합계 숫자·목록)만 본다 — 목록 안 행은 보드의 오류 경계가 막는다.
 */
export function parsePartnerSettlementSnapshot(raw: unknown): PartnerSettlementSnapshot | null {
  if (!isRecord(raw) || typeof raw.generatedAt !== "string" || typeof raw.partner !== "string") return null
  const { totals, rule } = raw
  if (!isRecord(totals) || !isRecord(totals.counts) || !TOTAL_NUMBERS.every((key) => isFiniteNumber(totals[key]))) return null
  if (!isRecord(rule) || !isFiniteNumber(rule.market) || !isFiniteNumber(rule.supply) || !isFiniteNumber(rule.margin)) return null
  if (!LISTS.every((key) => Array.isArray(raw[key]))) return null
  // 잔액 흐름 그래프가 첫 줄의 날짜와 달 목록으로 축을 잡는다 — 비어 있으면 그릴 수 없다.
  if ((raw.statement as unknown[]).length === 0 || (raw.months as unknown[]).length === 0) return null
  return raw as unknown as PartnerSettlementSnapshot
}

export function summarizePartnerSettlement(snapshot: PartnerSettlementSnapshot): PartnerSettlementSummary {
  const { totals } = snapshot
  return {
    billed: totals.supply,
    transfers: totals.transfer,
    card: totals.card,
    ledger: totals.ledgerPaid,
    balance: totals.balance,
    generatedAt: snapshot.generatedAt,
  }
}
