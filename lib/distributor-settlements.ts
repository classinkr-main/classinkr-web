import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"
import {
  CLASSIN_QUOTE_SUPPLIER,
  STANDARD_QUOTE_SUPPLIER,
  finalizeStandardQuoteDetails,
} from "@/lib/standard-quote-template"

// 총판 정산(2026-10-23) — 고객 견적 1장에 붙는 '총판용 견적서'와 미수금의 순수 규칙.
// 정본 설명: docs/hardware-ops/distributor-settlement.md
//
// 하드웨어 물량은 견적마다 두 방식 중 하나다(로트 이름의 첫 글자와 같다 — C1 로트 / H1~H8 로트).
//  - C방식: 회사가 하드웨어를 원가(구입가)로 미리 사 둔다. 고객은 총액을 하드웨어 총판(퀴드러닝)에게 내고,
//    총판이 그중 원가를 회사로 입금한다(예: 고객 630만원 → 총판이 회사로 530~550만원).
//    총판용 견적서는 고객 견적과 같은 양식이고 금액(원가 = 총판 입금가)만 다르다. 공급자 = 회사, 수신 = 총판.
//    회사 매출은 총판 입금 확인 시점(lib/admin/handoff/distributor-payment-to-ledger-draft.ts).
//  - H방식: 총판이 먼저 사 둔(수입한) 물량이다. 총판용 견적서·원가 미수가 없고, 설치 완료(출고 확정) 뒤
//    직원이 검토하고 '매출 잡기'를 누른 시점에 매출을 잡는다.
//
//  - 대상 품목 기본값: itemType=hardware + AI Suite(online-suite-monthly). 설치·소프트웨어 등은 기본 제외(직접 포함 가능).
//  - 원가(코드상 unitPrice): 직접 입력 또는 원가 템플릿(품목 코드 × 최소 수량 구간). 구매 대수·고객마다 달라 견적마다 덮어쓸 수 있다.
//  - 발행 시점: 고객 동의(on_accept, 자동 발행) 또는 설치 완료(on_install — 출고 확정 때 초안 자동 준비 ·
//    검토 요청, 직원이 '검토 완료'로 발행). manual 은 사람이 직접 발행.
//  - 미수: 발행 금액 − 입금 합계. 입금이 합계 이상이면 paid, 일부면 partial.
//
// 서버·클라이언트 공용이다(server-only 금지). DB 접근은 lib/repositories/distributor-settlements.ts.

export const AI_SUITE_ITEM_CODE = "online-suite-monthly"

export const DISTRIBUTOR_FULFILLMENT_MODES = ["C", "H"] as const
export type DistributorFulfillmentMode = (typeof DISTRIBUTOR_FULFILLMENT_MODES)[number]

export const DISTRIBUTOR_MODE_LABELS: Record<DistributorFulfillmentMode, { title: string; summary: string }> = {
  C: {
    title: "C방식 · 회사 선매입",
    summary: "회사가 원가로 미리 사 둔 물량. 고객은 총액을 총판에 내고, 총판이 원가를 회사로 입금 — 입금 확인 시 매출.",
  },
  H: {
    title: "H방식 · 총판 선매입",
    summary: "총판이 먼저 사 둔 물량. 총판 견적서·원가 미수 없음 — 설치 완료(출고 확정) 후 검토하고 매출 잡기.",
  },
}

/**
 * 하드웨어 총판 기본값 — 퀴드러닝. 하드웨어 고객 견적의 표준 공급자(STANDARD_QUOTE_SUPPLIER)와 같은 회사이고,
 * 견적서에 찍히는 이름은 등록 정보 그대로 쓴다(대표 조혜리 · 담당자 배철웅 — 호칭을 붙이거나 바꾸지 않는다).
 * 내부에서 '배 대표님'이라고 부르면 이 총판(퀴드러닝)을 뜻한다.
 * 처음 정산을 만들 때만 채우고, 이후에는 마지막에 저장한 총판 정보를 쓴다.
 */
export const DEFAULT_HARDWARE_DISTRIBUTOR = {
  distributorName: STANDARD_QUOTE_SUPPLIER.businessName,
  distributorContactName: STANDARD_QUOTE_SUPPLIER.contactName,
  distributorEmail: STANDARD_QUOTE_SUPPLIER.contactEmail || null,
  distributorPhone: STANDARD_QUOTE_SUPPLIER.contactPhone,
} as const

export const DISTRIBUTOR_SETTLEMENT_TRIGGERS = ["on_accept", "on_install", "manual"] as const
export type DistributorSettlementTrigger = (typeof DISTRIBUTOR_SETTLEMENT_TRIGGERS)[number]

export const DISTRIBUTOR_SETTLEMENT_STATUSES = ["draft", "issued", "partial", "paid", "completed", "cancelled"] as const
export type DistributorSettlementStatus = (typeof DISTRIBUTOR_SETTLEMENT_STATUSES)[number]

export type DistributorIssueReason = "customer_accepted" | "installation_completed" | "manual"
export type DistributorEmailStatus = "not_sent" | "sent" | "failed" | "skipped"

export const DISTRIBUTOR_TRIGGER_LABELS: Record<DistributorSettlementTrigger, string> = {
  on_accept: "고객 동의 시 자동 발행",
  on_install: "설치 완료 시 발행",
  manual: "직접 발행",
}

export const DISTRIBUTOR_STATUS_LABELS: Record<DistributorSettlementStatus, string> = {
  draft: "발행 전",
  issued: "입금 대기",
  partial: "일부 입금",
  paid: "입금 완료",
  completed: "설치 완료 · 매출",
  cancelled: "취소",
}

export const DISTRIBUTOR_ISSUE_REASON_LABELS: Record<DistributorIssueReason, string> = {
  customer_accepted: "고객 동의",
  installation_completed: "설치 완료",
  manual: "직접 발행",
}

export interface DistributorSettlementLine {
  /** 고객 견적의 품목 번호(1부터). 고객 견적이 바뀌었는지 대조하는 기준이다. */
  sourceLineNumber: number
  itemCode?: string
  itemName: string
  itemDescription?: string
  itemType: PartnerQuoteLineItemInput["itemType"]
  quantity: number
  quantityUnit?: string
  /** 고객 견적 단가(참고용 스냅샷). 가격 미정 품목은 null. */
  customerUnitPrice: number | null
  /** 원가. 포함 품목인데 null 이면 아직 금액을 정하지 않은 것이다. */
  unitPrice: number | null
  included: boolean
}

export interface DistributorPriceRule {
  itemCode: string
  itemName?: string
  /** 이 대수 이상부터 적용(1 이상). 같은 품목에서 조건을 만족하는 가장 큰 구간을 쓴다. */
  minQuantity: number
  unitPrice: number
}

export interface DistributorPriceTemplate {
  id: string
  name: string
  rules: DistributorPriceRule[]
  notes: string | null
  updatedAt: string
}

export interface DistributorSettlementTotals {
  subtotalAmount: number
  vatAmount: number
  totalAmount: number
  /** 포함 품목 중 원가가 비어 있는 품목 수. 0 이어야 발행할 수 있다. */
  missingPriceCount: number
  includedCount: number
}

export interface DistributorSettlementRecord {
  id: string
  quoteDocumentId: string
  dealId: string | null
  fulfillmentMode: DistributorFulfillmentMode
  sourceVersionId: string | null
  issuedVersionId: string | null
  distributorName: string
  distributorContactName: string | null
  distributorEmail: string | null
  distributorPhone: string | null
  issueTrigger: DistributorSettlementTrigger
  autoEmail: boolean
  priceTemplateId: string | null
  lines: DistributorSettlementLine[]
  vatIncluded: boolean
  subtotalAmount: number
  vatAmount: number
  totalAmount: number
  customerTotalAmount: number
  status: DistributorSettlementStatus
  paidAmount: number
  dueDate: string | null
  issuedAt: string | null
  issueReason: DistributorIssueReason | null
  shareToken: string | null
  emailStatus: DistributorEmailStatus
  emailedAt: string | null
  emailError: string | null
  reviewRequiredReason: string | null
  notes: string | null
  cancelledAt: string | null
  /** H방식 설치 완료 시각(= 매출 인식 시점). */
  installedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DistributorSettlementPayment {
  id: string
  settlementId: string
  amount: number
  paidOn: string
  memo: string | null
  createdBy: string | null
  createdAt: string
}

/* ─── 대상 품목 · 단가 ───────────────────────────────────── */

/** 총판에게 청구하는 기본 대상: 하드웨어 + AI Suite. */
export function isDistributorEligibleLine(line: Pick<PartnerQuoteLineItemInput, "itemType" | "itemCode">) {
  return line.itemType === "hardware" || line.itemCode === AI_SUITE_ITEM_CODE
}

function isBillableCustomerLine(line: PartnerQuoteLineItemInput) {
  // 안내문·할인 줄은 총판 문서로 옮기지 않는다.
  return line.itemType !== "note_only" && line.itemType !== "discount"
}

/** 템플릿에서 품목·수량에 맞는 원가. 맞는 구간이 없으면 null. */
export function pickTemplateUnitPrice(
  rules: readonly DistributorPriceRule[],
  itemCode: string | undefined,
  quantity: number
): number | null {
  if (!itemCode) return null
  let best: DistributorPriceRule | null = null
  for (const rule of rules) {
    if (rule.itemCode !== itemCode) continue
    if (rule.minQuantity > Math.max(quantity, 1)) continue
    if (!best || rule.minQuantity > best.minQuantity) best = rule
  }
  return best ? best.unitPrice : null
}

/**
 * 고객 견적 품목 → 총판 정산 줄 초안. 기존 줄이 있으면(같은 품목 번호·품목 코드) 사람이 정한 포함 여부와
 * 원가를 이어받고, 없으면 템플릿 단가를 채운다.
 */
export function buildDistributorLinesFromQuote(
  customerLines: readonly PartnerQuoteLineItemInput[] | undefined,
  options: { previous?: readonly DistributorSettlementLine[]; rules?: readonly DistributorPriceRule[] } = {}
): DistributorSettlementLine[] {
  const previous = new Map<string, DistributorSettlementLine>()
  for (const line of options.previous ?? []) previous.set(lineKey(line.sourceLineNumber, line.itemCode), line)

  return (customerLines ?? []).filter(isBillableCustomerLine).map((line, index) => {
    const sourceLineNumber = line.lineNumber ?? index + 1
    const quantity = Math.max(0, Math.round(Number(line.quantity ?? 0)))
    const prior = previous.get(lineKey(sourceLineNumber, line.itemCode))
    const templatePrice = pickTemplateUnitPrice(options.rules ?? [], line.itemCode, quantity)
    return {
      sourceLineNumber,
      itemCode: line.itemCode,
      itemName: line.itemName,
      itemDescription: line.itemDescription,
      itemType: line.itemType,
      quantity,
      quantityUnit: line.quantityUnit,
      customerUnitPrice: typeof line.unitPrice === "number" ? line.unitPrice : null,
      unitPrice: prior ? prior.unitPrice : templatePrice,
      included: prior ? prior.included : isDistributorEligibleLine(line),
    }
  })
}

function lineKey(lineNumber: number, itemCode?: string) {
  return `${lineNumber}:${itemCode ?? ""}`
}

/** 템플릿을 다시 적용 — 포함된 품목의 원가를 템플릿 값으로 덮어쓴다(맞는 구간이 없으면 그대로 둔다). */
export function applyPriceTemplate(
  lines: readonly DistributorSettlementLine[],
  rules: readonly DistributorPriceRule[]
): DistributorSettlementLine[] {
  return lines.map((line) => {
    if (!line.included) return line
    const price = pickTemplateUnitPrice(rules, line.itemCode, line.quantity)
    return price == null ? line : { ...line, unitPrice: price }
  })
}

export function computeDistributorTotals(
  lines: readonly DistributorSettlementLine[],
  vatIncluded: boolean
): DistributorSettlementTotals {
  let subtotalAmount = 0
  let missingPriceCount = 0
  let includedCount = 0
  for (const line of lines) {
    if (!line.included) continue
    includedCount += 1
    if (line.unitPrice == null) {
      missingPriceCount += 1
      continue
    }
    subtotalAmount += Math.max(0, Math.round(line.quantity * line.unitPrice))
  }
  const vatAmount = vatIncluded ? 0 : Math.round(subtotalAmount * 0.1)
  return { subtotalAmount, vatAmount, totalAmount: subtotalAmount + vatAmount, missingPriceCount, includedCount }
}

/** 발행할 수 없는 이유. null 이면 발행 가능. */
export function getDistributorIssueBlocker(input: {
  lines: readonly DistributorSettlementLine[]
  vatIncluded: boolean
  distributorName: string
}): string | null {
  if (!input.distributorName.trim()) return "총판 이름을 입력해 주세요."
  const totals = computeDistributorTotals(input.lines, input.vatIncluded)
  if (totals.includedCount === 0) return "총판에게 청구할 품목을 하나 이상 포함해 주세요."
  if (totals.missingPriceCount > 0) return `원가(총판 입금가)가 비어 있는 품목이 ${totals.missingPriceCount}개 있습니다.`
  if (totals.totalAmount <= 0) return "총판 청구 금액이 0원입니다."
  return null
}

/* ─── 총판용 견적서 ───────────────────────────────────────── */

/**
 * 고객 견적서와 같은 양식(성남여고 승인 디자인, QuoteDocumentPreview)의 총판용 견적서.
 * C방식에서는 회사가 총판에게 하드웨어를 공급하므로 공급자 = 회사(클래스인), 수신처 = 총판이다
 * (고객 견적의 공급자는 총판이라 그대로 두면 '총판 → 총판' 문서가 된다). 포함 품목을 원가로 다시 계산하고,
 * 참조란에 고객사를 적어 어느 고객 건인지 알 수 있게 한다.
 */
export function buildDistributorQuoteDetails(
  customer: PartnerQuoteDetailsInput,
  settlement: Pick<
    DistributorSettlementRecord,
    "distributorName" | "distributorContactName" | "distributorPhone" | "distributorEmail" | "lines" | "vatIncluded" | "notes"
  >,
  options: { issuedAt?: string | null; customerName?: string | null } = {}
): PartnerQuoteDetailsInput {
  const lineItems: PartnerQuoteLineItemInput[] = settlement.lines
    .filter((line) => line.included)
    .map((line, index) => ({
      sortOrder: index + 1,
      lineNumber: index + 1,
      itemType: line.itemType,
      itemCode: line.itemCode,
      itemName: line.itemName,
      itemDescription: line.itemDescription,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit,
      unitPrice: line.unitPrice ?? undefined,
      lineStatus: line.unitPrice == null ? "pending_price" : "priced",
      billingMode: "included_in_quote",
      vatIncluded: settlement.vatIncluded,
    }))
  const customerName = options.customerName?.trim() || customer.recipientCompanyName?.trim()

  return finalizeStandardQuoteDetails({
    ...customer,
    issuedAt: options.issuedAt?.slice(0, 10) || customer.issuedAt,
    recipientCompanyName: settlement.distributorName,
    recipientContactName: settlement.distributorContactName ?? undefined,
    recipientPhone: settlement.distributorPhone ?? undefined,
    recipientEmail: settlement.distributorEmail ?? undefined,
    referenceName: customerName ? `고객사 ${customerName}` : customer.referenceName,
    // 공급자 블록은 통째로 회사(클래스인)로 바꾼다 — 담당자·연락처는 회사 표준 정보가 없어 비워 둔다.
    supplierBusinessName: CLASSIN_QUOTE_SUPPLIER.businessName,
    supplierBusinessRegistrationNumber: CLASSIN_QUOTE_SUPPLIER.businessRegistrationNumber,
    supplierRepresentativeName: CLASSIN_QUOTE_SUPPLIER.representativeName,
    supplierAddress: CLASSIN_QUOTE_SUPPLIER.address,
    supplierContactName: undefined,
    supplierContactPhone: undefined,
    supplierContactEmail: CLASSIN_QUOTE_SUPPLIER.contactEmail || undefined,
    footerContactText: CLASSIN_QUOTE_SUPPLIER.businessName,
    vatIncluded: settlement.vatIncluded,
    // 고객 쪽 VAT 문구를 그대로 끌고 오면 총판 VAT 설정과 어긋날 수 있어 기본 문구로 다시 정한다.
    vatPolicyLabel: undefined,
    specialTerms: settlement.notes?.trim() || customer.specialTerms,
    internalMemo: undefined,
    // 고객 견적에만 해당하는 값은 넘기지 않는다 — 총판 문서는 원가 줄만으로 다시 계산한다.
    //  - 견적 할인: 고객 할인이 원가 합계에서 빠지면 '입금 요청 금액'(정산 합계)과 문서 총액이 어긋난다.
    //  - 구성 옵션: 녹화 세트 12개월 할부처럼 고객 결제 조건(월 납입 안내)이 총판 문서에 찍히지 않게 한다.
    quoteDiscount: undefined,
    optionSelections: undefined,
    lineItems,
  })
}

/* ─── 설치 완료 → 자동 준비 · 검토 요청 ─────────────────────── */
//
// 재고 앱에서 오더의 배송 예정을 출고 확정하면(진행 상태 '설치 완료') 총판 정산을 자동으로 준비하고 검토를 요청한다.
// 자동으로 발행하지 않는다 — 사람이 원가·수량을 확인하고 '검토 완료 → 발행'(C) 또는 '검토 완료 → 매출 잡기'(H)를
// 눌러야 총판에게 나가거나 매출이 잡힌다. 서버 처리: lib/server/distributor-settlement-install.ts

/** 검토 요청 사유의 머리말. 같은 오더의 출고 확정이 여러 번(품목별·부분 출고) 와도 알림은 한 번만 보낸다. */
export const INSTALL_REVIEW_PREFIX = "설치 완료 확인"

export function isInstallReviewReason(reason?: string | null) {
  return Boolean(reason?.startsWith(INSTALL_REVIEW_PREFIX))
}

/**
 * 사람이 정산을 다시 저장했을 때 남길 사유. 설치 완료 검토 요청은 발행(또는 매출 잡기)할 때까지 검토 대기에 남아야
 * 하므로 머리말(출고일·로트)만 남기고, 저장으로 해소됐을 수 있는 세부(빈 원가 등)는 지운다. 다른 보류 사유는 해소된다.
 */
export function reviewReasonAfterSave(previous?: string | null): string | null {
  if (!isInstallReviewReason(previous)) return null
  const head = (previous ?? "").split(" · ")[0]
  return `${head} · 저장됨 — 검토를 마쳤으면 발행(H방식은 매출 잡기)을 눌러 주세요`.slice(0, 300)
}

/** 로트 이름 첫 글자가 방식이다(C1 로트 = C방식, H1~H8 로트 = H방식). 모르면 null. */
export function inferFulfillmentModeFromLot(lotNo?: string | null): DistributorFulfillmentMode | null {
  const value = lotNo?.trim().toUpperCase() ?? ""
  if (/^C\d/.test(value)) return "C"
  if (/^H\d/.test(value)) return "H"
  return null
}

/**
 * 출고 확정 한 번에 로트가 여러 개일 수 있다(예: C1 2대 + H8 1대). 방식이 하나로 모이면 그 방식,
 * 섞였거나 모르면 null(기본 C 로 만들고 검토 사유에 섞였다고 적는다).
 */
export function inferFulfillmentModeFromLots(lots: ReadonlyArray<string | null | undefined>) {
  const names = [...new Set(lots.map((lot) => lot?.trim()).filter((lot): lot is string => Boolean(lot)))]
  const modes = [...new Set(names.map((lot) => inferFulfillmentModeFromLot(lot)))]
  const mixed = modes.length > 1
  return {
    mode: !mixed && modes[0] ? modes[0] : null,
    mixed,
    label: names.join("·"),
  }
}

/** 검토 요청 사유(정산 행 review_required_reason, 300자 이내). 견적 상세·검토 대기 목록·알림에 그대로 보인다. */
export function buildInstallReviewReason(input: {
  mode: DistributorFulfillmentMode
  installedOn: string | null
  created: boolean
  lotNo?: string | null
  /** 로트로 본 방식. 저장된 방식과 다르면 함께 알린다. */
  lotMode?: DistributorFulfillmentMode | null
  /** 한 번의 출고 확정에 C·H 로트가 섞였는지. */
  mixedLots?: boolean
  missingPriceCount: number
  /** 정산을 저장한 뒤 고객 견적이 이 버전으로 바뀌었으면(다시 저장해야 발행된다). */
  quoteVersionChangedTo?: number | null
}): string {
  const when = input.installedOn ? `${input.installedOn} 출고 확정` : "출고 확정"
  const lot = input.lotNo?.trim() ? `로트 ${input.lotNo.trim()}` : "로트 미지정"
  const parts = [`${INSTALL_REVIEW_PREFIX}(${when}, ${lot})`]
  if (input.mixedLots) {
    parts.push(`로트 방식이 섞여 있습니다 — ${input.mode}방식으로 두었으니 방식을 확인해 주세요`)
  } else if (input.lotMode && input.lotMode !== input.mode) {
    parts.push(`로트는 ${input.lotMode}방식인데 정산은 ${input.mode}방식입니다 — 방식을 확인해 주세요`)
  }
  if (input.mode === "H") {
    parts.push(input.created ? "H방식 정산을 자동으로 만들었습니다" : "H방식 정산입니다")
    parts.push("확인 후 '검토 완료' 버튼으로 매출을 잡아 주세요")
  } else {
    parts.push(input.created ? "총판 견적서 초안을 자동으로 만들었습니다" : "총판 견적서 초안이 준비됐습니다")
    if (input.quoteVersionChangedTo) {
      parts.push(`고객 견적이 v${input.quoteVersionChangedTo}로 바뀌어 원가를 다시 저장해야 발행됩니다`)
    }
    if (input.missingPriceCount > 0) parts.push(`원가가 빈 품목 ${input.missingPriceCount}개`)
    parts.push("원가·수량을 확인하고 '검토 완료' 버튼으로 총판 견적서를 발행해 주세요")
  }
  return parts.join(" · ").slice(0, 300)
}

/* ─── 미수 ───────────────────────────────────────────────── */

export function deriveSettlementStatus(input: {
  status: DistributorSettlementStatus
  totalAmount: number
  paidAmount: number
}): DistributorSettlementStatus {
  if (input.status === "draft" || input.status === "cancelled" || input.status === "completed") return input.status
  if (input.paidAmount <= 0) return "issued"
  if (input.paidAmount >= input.totalAmount) return "paid"
  return "partial"
}

export function getOutstandingAmount(record: Pick<DistributorSettlementRecord, "status" | "totalAmount" | "paidAmount">) {
  if (record.status !== "issued" && record.status !== "partial" && record.status !== "paid") return 0
  return Math.max(0, record.totalAmount - record.paidAmount)
}

/** 기한이 지난 미수 건인지. today 는 YYYY-MM-DD(KST 기준 날짜). */
export function isSettlementOverdue(
  record: Pick<DistributorSettlementRecord, "status" | "dueDate" | "totalAmount" | "paidAmount">,
  today: string
) {
  if (record.status !== "issued" && record.status !== "partial") return false
  if (!record.dueDate) return false
  return record.dueDate < today && getOutstandingAmount(record) > 0
}

/* ─── 입력 검증 ───────────────────────────────────────────── */

type Validated<T> = { ok: true; value: T } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function nonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LINE_ITEM_TYPES = new Set(["hardware", "installation", "shipping", "service", "discount", "note_only"])

export function normalizeDistributorLines(raw: unknown): DistributorSettlementLine[] | null {
  if (!Array.isArray(raw) || raw.length > 60) return null
  const lines: DistributorSettlementLine[] = []
  for (const [index, value] of raw.entries()) {
    if (!isRecord(value)) return null
    const itemName = optionalText(value.itemName, 200)
    if (!itemName) return null
    const quantity = nonNegativeInt(value.quantity)
    if (quantity == null) return null
    const itemType = typeof value.itemType === "string" && LINE_ITEM_TYPES.has(value.itemType)
      ? (value.itemType as DistributorSettlementLine["itemType"])
      : "hardware"
    const unitPrice = value.unitPrice == null || value.unitPrice === "" ? null : nonNegativeInt(value.unitPrice)
    if (value.unitPrice != null && value.unitPrice !== "" && unitPrice == null) return null
    const sourceLineNumber = nonNegativeInt(value.sourceLineNumber) ?? index + 1
    lines.push({
      sourceLineNumber,
      itemCode: optionalText(value.itemCode, 80) ?? undefined,
      itemName,
      itemDescription: optionalText(value.itemDescription, 400) ?? undefined,
      itemType,
      quantity,
      quantityUnit: optionalText(value.quantityUnit, 10) ?? undefined,
      customerUnitPrice: value.customerUnitPrice == null ? null : nonNegativeInt(value.customerUnitPrice),
      unitPrice,
      included: value.included !== false,
    })
  }
  return lines
}

export interface DistributorSettlementInput {
  fulfillmentMode: DistributorFulfillmentMode
  distributorName: string
  distributorContactName: string | null
  distributorEmail: string | null
  distributorPhone: string | null
  issueTrigger: DistributorSettlementTrigger
  autoEmail: boolean
  priceTemplateId: string | null
  lines: DistributorSettlementLine[]
  vatIncluded: boolean
  dueDate: string | null
  notes: string | null
}

export function validateDistributorSettlementInput(body: unknown): Validated<DistributorSettlementInput> {
  if (!isRecord(body)) return { ok: false, error: "요청 본문이 올바르지 않습니다." }
  const distributorName = optionalText(body.distributorName, 80)
  if (!distributorName) return { ok: false, error: "총판 이름을 입력해 주세요." }
  const distributorEmail = optionalText(body.distributorEmail, 200)
  if (distributorEmail && !EMAIL_RE.test(distributorEmail)) {
    return { ok: false, error: "총판 이메일 형식이 올바르지 않습니다." }
  }
  const fulfillmentMode = DISTRIBUTOR_FULFILLMENT_MODES.find((value) => value === body.fulfillmentMode) ?? "C"
  // H방식은 총판 견적서를 발행하지 않는다 — 설치 완료(직원 버튼)가 유일한 진행 시점이다.
  const issueTrigger =
    fulfillmentMode === "H"
      ? "on_install"
      : DISTRIBUTOR_SETTLEMENT_TRIGGERS.find((value) => value === body.issueTrigger) ?? "on_accept"
  const lines = normalizeDistributorLines(body.lines)
  if (!lines) return { ok: false, error: "총판 품목 형식이 올바르지 않습니다." }
  const dueDate = optionalText(body.dueDate, 10)
  if (dueDate && !DATE_RE.test(dueDate)) return { ok: false, error: "입금 기한 날짜 형식이 올바르지 않습니다." }
  const priceTemplateId = optionalText(body.priceTemplateId, 64)

  return {
    ok: true,
    value: {
      fulfillmentMode,
      distributorName,
      distributorContactName: optionalText(body.distributorContactName, 80),
      distributorEmail,
      distributorPhone: optionalText(body.distributorPhone, 40),
      issueTrigger,
      autoEmail: body.autoEmail !== false,
      priceTemplateId,
      lines,
      vatIncluded: body.vatIncluded !== false,
      dueDate,
      notes: optionalText(body.notes, 1000),
    },
  }
}

export function validateDistributorPaymentInput(
  body: unknown
): Validated<{ amount: number; paidOn: string; memo: string | null }> {
  if (!isRecord(body)) return { ok: false, error: "요청 본문이 올바르지 않습니다." }
  const amount = nonNegativeInt(body.amount)
  if (!amount || amount <= 0) return { ok: false, error: "입금액은 0보다 커야 합니다." }
  const paidOn = optionalText(body.paidOn, 10)
  if (!paidOn || !DATE_RE.test(paidOn)) return { ok: false, error: "입금일(YYYY-MM-DD)을 입력해 주세요." }
  return { ok: true, value: { amount, paidOn, memo: optionalText(body.memo, 300) } }
}

export function normalizeDistributorPriceRules(raw: unknown): DistributorPriceRule[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null
  const rules: DistributorPriceRule[] = []
  for (const value of raw) {
    if (!isRecord(value)) return null
    const itemCode = optionalText(value.itemCode, 80)
    const unitPrice = nonNegativeInt(value.unitPrice)
    const minQuantity = nonNegativeInt(value.minQuantity) ?? 1
    if (!itemCode || unitPrice == null) return null
    rules.push({
      itemCode,
      itemName: optionalText(value.itemName, 200) ?? undefined,
      minQuantity: Math.max(1, minQuantity),
      unitPrice,
    })
  }
  return rules
}

export function validateDistributorPriceTemplateInput(
  body: unknown
): Validated<{ name: string; rules: DistributorPriceRule[]; notes: string | null }> {
  if (!isRecord(body)) return { ok: false, error: "요청 본문이 올바르지 않습니다." }
  const name = optionalText(body.name, 60)
  if (!name) return { ok: false, error: "템플릿 이름을 입력해 주세요." }
  const rules = normalizeDistributorPriceRules(body.rules)
  if (!rules) return { ok: false, error: "품목 코드와 원가를 한 줄 이상 입력해 주세요." }
  return { ok: true, value: { name, rules, notes: optionalText(body.notes, 500) } }
}
