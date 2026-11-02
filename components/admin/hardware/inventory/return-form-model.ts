// 회수 등록 — 원 출고 건을 골라 그 건에 연결된 회수 기록을 만든다(정의서 §회수, 계약 §7-3).
// 품목·물류번호·고객·유형은 원 출고에서 온다(서버도 채운다). 수량은 남은 회수 가능 수량까지만. 순수 함수만 둔다.

import {
  HARDWARE_OUTBOUND_TYPE_LABELS,
  HARDWARE_PROGRESS_STATUS,
  isHardwareOutboundType,
  type HardwareOutboundType,
} from "@/lib/hardware/inventory-process"

/** GET /api/admin/hardware/return-candidates 한 줄. */
export interface ReturnCandidate {
  id: string
  productName: string
  lotNo: string | null
  quantity: number
  returned: number
  returnable: number
  occurredAt: string | null
  toLocation: string | null
  customerId: string | null
  outboundType: HardwareOutboundType | null
  owner: string | null
}

/** 회수가 들어오는 곳 — 기본 창고. 불량은 수리로 바로 받는다. */
export const RETURN_DESTINATIONS = ["창고", "사무실", "수리"] as const
export type ReturnDestination = (typeof RETURN_DESTINATIONS)[number]

export interface ReturnFormState {
  candidateId: string | null
  quantity: string
  occurredAt: string
  toLocation: ReturnDestination
  memo: string
}

export function initialReturnForm(today: string): ReturnFormState {
  return { candidateId: null, quantity: "", occurredAt: today, toLocation: "창고", memo: "" }
}

/** 응답 한 줄을 화면 타입으로 — 모르는 값은 버리고 숫자는 0 이상 정수로. */
export function normalizeReturnCandidate(raw: unknown): ReturnCandidate | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === "string" ? row.id : null
  const productName = typeof row.productName === "string" ? row.productName : null
  if (!id || !productName) return null
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0)
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)
  return {
    id,
    productName,
    lotNo: text(row.lotNo),
    quantity: count(row.quantity),
    returned: count(row.returned),
    returnable: count(row.returnable),
    occurredAt: text(row.occurredAt),
    toLocation: text(row.toLocation),
    customerId: text(row.customerId),
    outboundType: isHardwareOutboundType(row.outboundType) ? row.outboundType : null,
    owner: text(row.owner),
  }
}

export function returnCandidateTypeLabel(candidate: Pick<ReturnCandidate, "outboundType">): string {
  return candidate.outboundType ? HARDWARE_OUTBOUND_TYPE_LABELS[candidate.outboundType] : "유형 미상"
}

/** 회수 수량 기본값 — 남은 회수 가능 수량 전부. */
export function defaultReturnQuantity(candidate: Pick<ReturnCandidate, "returnable">): string {
  return candidate.returnable > 0 ? String(candidate.returnable) : ""
}

export function validateReturnForm(candidate: ReturnCandidate | null, form: ReturnFormState): string | null {
  if (!candidate || candidate.id !== form.candidateId) return "회수할 원 출고 건을 고르세요."
  if (candidate.returnable <= 0) return "이 출고 건은 이미 전부 회수했습니다."
  const quantity = Number(form.quantity)
  if (!Number.isInteger(quantity) || quantity <= 0) return "회수 수량은 1 이상 정수여야 합니다."
  if (quantity > candidate.returnable) return `회수 가능 수량은 ${candidate.returnable}대입니다.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.occurredAt)) return "회수일을 입력하세요."
  if (candidate.occurredAt && form.occurredAt < candidate.occurredAt.slice(0, 10)) return "회수일이 원 출고일보다 빠릅니다."
  return null
}

/** POST /api/admin/hardware/movements 본문. 서버가 원 출고에서 다시 채우지만 같은 값을 함께 보낸다. */
export function buildReturnPayload(candidate: ReturnCandidate, form: ReturnFormState) {
  return {
    movementType: "return" as const,
    returnOfMovementId: candidate.id,
    productName: candidate.productName,
    quantity: Number(form.quantity),
    occurredAt: form.occurredAt,
    fromLocation: candidate.toLocation ?? "고객",
    toLocation: form.toLocation,
    status: HARDWARE_PROGRESS_STATUS.returned,
    lotNo: candidate.lotNo ?? "",
    memo: form.memo.trim(),
    ...(candidate.customerId ? { customerId: candidate.customerId } : {}),
    ...(candidate.outboundType ? { outboundType: candidate.outboundType } : {}),
  }
}
