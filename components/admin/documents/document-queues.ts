/**
 * 계약서·영수증·SW 견적 코드 탭의 작업 큐 판정 — quote-queue.ts 와 같은 방식으로
 * "지금 어느 묶음(다음 할 일)인가"를 순수 함수로 정한다. 목록 묶음·상세 문구·버튼이 이 판정 하나를 공유한다.
 */

export type QueueTone = "go" | "warn" | "neutral" | "muted"

export type QueueGroup<K extends string, T> = { key: K; label: string; tone: QueueTone; items: T[] }

const DAY_MS = 86_400_000

function time(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/* ─── 계약서 ─────────────────────────────────────────────── */

export type ContractQueueKey = "sign" | "await" | "draft" | "done" | "cancelled"

export type ContractQueueInput = {
  status: string
  partner_signed_at: string | null
  admin_signed_at: string | null
  created_at: string
  updated_at: string
}

/** 그룹 표시 순서 = 처리 우선순위. */
export const CONTRACT_QUEUE_GROUPS: Array<{ key: ContractQueueKey; label: string; tone: QueueTone }> = [
  { key: "sign", label: "우리 서명 필요", tone: "go" },
  { key: "await", label: "고객 서명 대기", tone: "warn" },
  { key: "draft", label: "발송 전", tone: "warn" },
  { key: "done", label: "완료", tone: "muted" },
  { key: "cancelled", label: "취소", tone: "muted" },
]

/** 상태 정본 + 서명 시각 보조. 양측 서명이 다 있으면 상태가 늦게 따라와도 완료로 본다. */
export function getContractQueueKey(contract: ContractQueueInput): ContractQueueKey {
  if (contract.status === "cancelled") return "cancelled"
  if (contract.status === "completed" || (contract.partner_signed_at && contract.admin_signed_at)) return "done"
  if (contract.status === "partner_signed" || contract.partner_signed_at) return "sign"
  if (contract.status === "draft") return "draft"
  return "await" // sent · admin_signed(우리가 먼저 서명)
}

export function getContractSteps(contract: ContractQueueInput) {
  const key = getContractQueueKey(contract)
  const sent = contract.status !== "draft" || Boolean(contract.partner_signed_at || contract.admin_signed_at)
  return [
    { label: "작성", at: contract.created_at, done: true },
    { label: "서명 요청 발송", at: null, done: sent },
    { label: "고객 서명", at: contract.partner_signed_at, done: Boolean(contract.partner_signed_at) },
    { label: "우리 서명", at: contract.admin_signed_at, done: Boolean(contract.admin_signed_at) },
    { label: "계약 확정", at: null, done: key === "done" },
  ]
}

export function groupContracts<T extends ContractQueueInput>(contracts: T[]): Array<QueueGroup<ContractQueueKey, T>> {
  const sorted = [...contracts].sort((a, b) => time(b.updated_at) - time(a.updated_at))
  return CONTRACT_QUEUE_GROUPS.map((group) => ({
    ...group,
    items: sorted.filter((contract) => getContractQueueKey(contract) === group.key),
  })).filter((group) => group.items.length > 0)
}

/* ─── 영수증 ─────────────────────────────────────────────── */

export type ReceiptQueueInput = {
  cash_receipt_requested: boolean
  cash_receipt_number: string | null
  paid_at: string | null
  created_at: string
}

/** 고객이 현금영수증을 요청했는데 번호(발행 근거)가 비어 있다. */
export function needsCashReceipt(receipt: ReceiptQueueInput) {
  return receipt.cash_receipt_requested && !receipt.cash_receipt_number?.trim()
}

/** 월 묶음 기준 = 입금일, 없으면 발행일(로컬 시간대). */
export function getReceiptMonth(receipt: ReceiptQueueInput) {
  const date = new Date(time(receipt.paid_at) || time(receipt.created_at))
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

export function groupReceipts<T extends ReceiptQueueInput>(receipts: T[], now = Date.now()): Array<QueueGroup<string, T>> {
  const sorted = [...receipts].sort(
    (a, b) => (time(b.paid_at) || time(b.created_at)) - (time(a.paid_at) || time(a.created_at))
  )
  const today = new Date(now)
  const groups: Array<QueueGroup<string, T>> = []

  const needs = sorted.filter(needsCashReceipt)
  if (needs.length > 0) groups.push({ key: "needs", label: "현금영수증 발행 필요", tone: "warn", items: needs })

  for (const receipt of sorted) {
    if (needsCashReceipt(receipt)) continue
    const { year, month } = getReceiptMonth(receipt)
    const key = `${year}-${String(month).padStart(2, "0")}`
    let group = groups.find((item) => item.key === key)
    if (!group) {
      const current = year === today.getFullYear() && month === today.getMonth() + 1
      group = {
        key,
        label: year === today.getFullYear() ? `${month}월` : `${year}년 ${month}월`,
        tone: current ? "neutral" : "muted",
        items: [],
      }
      groups.push(group)
    }
    group.items.push(receipt)
  }

  return groups
}

/* ─── SW 견적 코드 ───────────────────────────────────────── */

export type CodeQueueKey = "soon" | "active" | "used" | "expired"

export type CodeQueueInput = {
  expiresAt: string | null
  redeemedAt: string | null
  createdAt: string
}

export const CODE_EXPIRING_DAYS = 7

export const CODE_QUEUE_GROUPS: Array<{ key: CodeQueueKey; label: string; tone: QueueTone }> = [
  { key: "soon", label: "만료 임박", tone: "warn" },
  { key: "active", label: "결제 대기", tone: "neutral" },
  { key: "used", label: "사용됨", tone: "go" },
  { key: "expired", label: "만료", tone: "muted" },
]

/** 만료까지 남은 날(올림). 만료일이 없거나 이미 지났으면 null/0. */
export function getCodeDaysLeft(code: CodeQueueInput, now = Date.now()): number | null {
  if (!code.expiresAt) return null
  const expires = time(code.expiresAt)
  if (!expires) return null
  return Math.max(0, Math.ceil((expires - now) / DAY_MS))
}

export function getCodeQueueKey(code: CodeQueueInput, now = Date.now()): CodeQueueKey {
  if (code.redeemedAt) return "used"
  if (!code.expiresAt) return "active"
  const expires = time(code.expiresAt)
  if (expires && expires < now) return "expired"
  if (expires && expires - now <= CODE_EXPIRING_DAYS * DAY_MS) return "soon"
  return "active"
}

export function groupCodes<T extends CodeQueueInput>(codes: T[], now = Date.now()): Array<QueueGroup<CodeQueueKey, T>> {
  return CODE_QUEUE_GROUPS.map((group) => {
    const items = codes.filter((code) => getCodeQueueKey(code, now) === group.key)
    // 만료 임박은 빨리 끝나는 순, 나머지는 최근 발급순.
    items.sort((a, b) =>
      group.key === "soon" ? time(a.expiresAt) - time(b.expiresAt) : time(b.createdAt) - time(a.createdAt)
    )
    return { ...group, items }
  }).filter((group) => group.items.length > 0)
}
