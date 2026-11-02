// hardware.finalize — 하드웨어 오더 승인·최종 확정(DB 유니크 인덱스로 1명, 지금 이왕찬).
// hardware.inbound — 입고관리 권한자(여러 명 가능): 입고·재고 조정, 남의 출고·실현 기록 수정·취소
//   (docs/active/hardware-inventory-process-gap-2026-10-28.md §6 D1). finalize 보유자와 슈퍼 어드민은 자동 포함.
export const ADMIN_CAPABILITIES = ["hardware.finalize", "hardware.inbound"] as const

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number]

const ADMIN_CAPABILITY_SET = new Set<string>(ADMIN_CAPABILITIES)

export function isAdminCapability(value: unknown): value is AdminCapability {
  return typeof value === "string" && ADMIN_CAPABILITY_SET.has(value)
}

export function normalizeAdminCapabilities(value: unknown): AdminCapability[] | null {
  if (!Array.isArray(value)) return null

  const capabilities = value.filter(isAdminCapability)
  if (capabilities.length !== value.length) return null

  return [...new Set(capabilities)].sort()
}
