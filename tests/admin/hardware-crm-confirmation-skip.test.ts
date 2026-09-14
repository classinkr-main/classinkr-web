import { describe, expect, it } from "vitest"

import { shouldSkipCrmConfirmation } from "@/components/admin/hardware/inventory/shared"

// 감사(2026-09-07 #8): 가장 흔한 트랜잭션(실제 판매 출고 1건)마다 CRM 확인 모달이 후보·경고
// 유무와 무관하게 강제로 떴다(클릭 3 + 키 10 + 대기 2). HardwareInventoryClient.openCrmConfirmation이
// 이 순수 함수로 "모달을 건너뛰어도 되는지"를 판단한다 — 여기서 그 규칙 자체를 고정한다.
describe("shouldSkipCrmConfirmation", () => {
  it("skips the modal when there are no candidates and no warnings (nothing new to show)", () => {
    expect(shouldSkipCrmConfirmation([], [])).toBe(true)
  })

  it("keeps the modal when at least one CRM candidate exists — never auto-link silently", () => {
    expect(shouldSkipCrmConfirmation([{ id: "candidate-1" }], [])).toBe(false)
  })

  it("keeps the modal when there are warnings even with zero candidates", () => {
    expect(shouldSkipCrmConfirmation([], ["여러 품목명이 비슷해 자동 매칭을 건너뛰었습니다"])).toBe(false)
  })

  it("keeps the modal when both candidates and warnings are present", () => {
    expect(shouldSkipCrmConfirmation([{ id: "candidate-1" }], ["주의: 수량 불일치"])).toBe(false)
  })
})
