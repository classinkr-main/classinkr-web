import type { ContractDocumentStatus } from "@/lib/portal/types"

/**
 * 전환 계약(contract_documents)의 "확인 후 체크" 진행 규칙 — 전자서명은 보류라 서명 없이 관리자가 단계를 체크한다.
 * 서버(PUT /api/portal/contracts/[id])의 검증과 어드민 계약서 탭의 버튼이 이 표 하나를 공유한다.
 *   draft → shared(발송함) → partner_signed(고객 확인) → completed(계약 확정)
 */
export const CONTRACT_DOCUMENT_STATUSES: readonly ContractDocumentStatus[] = [
  "draft",
  "shared",
  "partner_signed",
  "admin_signed",
  "completed",
  "cancelled",
]

export function isContractDocumentStatus(value: unknown): value is ContractDocumentStatus {
  return typeof value === "string" && (CONTRACT_DOCUMENT_STATUSES as readonly string[]).includes(value)
}

/** 허용 전환. 앞으로 한 단계 + 체크 해제(한 단계 뒤로) + 취소. completed/cancelled/admin_signed(기존 서명 확정)는 끝 상태. */
export const CONTRACT_STATUS_TRANSITIONS: Record<ContractDocumentStatus, readonly ContractDocumentStatus[]> = {
  draft: ["shared", "cancelled"],
  shared: ["partner_signed", "draft", "cancelled"],
  partner_signed: ["completed", "shared", "cancelled"],
  admin_signed: [],
  completed: [],
  cancelled: [],
}

export function canTransitionContractStatus(from: ContractDocumentStatus, to: ContractDocumentStatus) {
  return CONTRACT_STATUS_TRANSITIONS[from].includes(to)
}

/** 화면·로그용 단계 이름(서명 어휘 없음). */
export const CONTRACT_STATUS_LABEL: Record<ContractDocumentStatus, string> = {
  draft: "발송 전",
  shared: "발송함",
  partner_signed: "고객 확인",
  admin_signed: "계약 확정",
  completed: "계약 확정",
  cancelled: "취소",
}
