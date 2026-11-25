// hardware.finalize — 하드웨어 오더 승인·최종 확정(DB 유니크 인덱스로 1명, 지금 이왕찬).
// hardware.inbound — 입고관리 권한자(여러 명 가능): 입고·재고 조정, 남의 출고·실현 기록 수정·취소
//   (docs/active/hardware-inventory-process-gap-2026-10-28.md §6 D1). finalize 보유자와 슈퍼 어드민은 자동 포함.
// cs.* — 내부 CS 코파일럿의 위험 동작(외부 AI 분석 요청 dispatch, 지식 승격, 회귀 평가 실행).
//   기본 부여는 lib/admin-auth.ts CS_COPILOT_DEFAULT_CAPABILITY_ROLES 가 정한다(지금은 코파일럿 API 역할 전체 —
//   결정 11 전까지 누가 쓸 수 있는지는 그대로). 개별 계정에만 허용하려면 admin_profiles.capabilities 에 넣고
//   CS_COPILOT_STRICT_CAPABILITIES=1 로 기본 부여를 끈다.
export const ADMIN_CAPABILITIES = [
  "hardware.finalize",
  "hardware.inbound",
  "cs.dispatch",
  "cs.knowledge.promote",
  "cs.regression.run",
] as const

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
