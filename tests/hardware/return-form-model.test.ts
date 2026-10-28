import { describe, expect, it } from "vitest"

import {
  buildReturnPayload,
  defaultReturnQuantity,
  initialReturnForm,
  normalizeReturnCandidate,
  returnCandidateTypeLabel,
  validateReturnForm,
  type ReturnCandidate,
} from "@/components/admin/hardware/inventory/return-form-model"

const candidate: ReturnCandidate = {
  id: "out-1",
  productName: '86" IFP',
  lotNo: "C2",
  quantity: 5,
  returned: 2,
  returnable: 3,
  occurredAt: "2026-10-01",
  toLocation: "남명학원",
  customerId: "cust-1",
  outboundType: "sample",
  owner: "김매니저",
}

describe("회수 후보 정리", () => {
  it("응답 줄을 화면 타입으로 — 모르는 유형·음수·소수는 정리한다", () => {
    expect(
      normalizeReturnCandidate({
        id: "out-1",
        productName: "S1",
        lotNo: "",
        quantity: 4.6,
        returned: -1,
        returnable: 4,
        occurredAt: null,
        toLocation: "가온학원",
        customerId: null,
        outboundType: "rental",
        owner: " ",
      })
    ).toEqual({
      id: "out-1",
      productName: "S1",
      lotNo: null,
      quantity: 4,
      returned: 0,
      returnable: 4,
      occurredAt: null,
      toLocation: "가온학원",
      customerId: null,
      outboundType: null,
      owner: null,
    })
    expect(normalizeReturnCandidate({ productName: "S1" })).toBeNull()
    expect(normalizeReturnCandidate(null)).toBeNull()
  })

  it("유형 라벨과 기본 수량(남은 전부)", () => {
    expect(returnCandidateTypeLabel(candidate)).toBe("샘플")
    expect(returnCandidateTypeLabel({ outboundType: null })).toBe("유형 미상")
    expect(defaultReturnQuantity(candidate)).toBe("3")
    expect(defaultReturnQuantity({ returnable: 0 })).toBe("")
  })
})

describe("회수 입력 검사", () => {
  const form = { ...initialReturnForm("2026-10-28"), candidateId: "out-1", quantity: "3" }

  it("원 출고 건을 골라야 하고, 남은 수량까지만 받는다", () => {
    expect(validateReturnForm(null, form)).toBe("회수할 원 출고 건을 고르세요.")
    expect(validateReturnForm(candidate, { ...form, candidateId: "other" })).toBe("회수할 원 출고 건을 고르세요.")
    expect(validateReturnForm(candidate, form)).toBeNull()
    expect(validateReturnForm(candidate, { ...form, quantity: "4" })).toBe("회수 가능 수량은 3대입니다.")
    expect(validateReturnForm(candidate, { ...form, quantity: "0" })).toBe("회수 수량은 1 이상 정수여야 합니다.")
    expect(validateReturnForm(candidate, { ...form, quantity: "1.5" })).toBe("회수 수량은 1 이상 정수여야 합니다.")
    expect(validateReturnForm({ ...candidate, returnable: 0 }, form)).toBe("이 출고 건은 이미 전부 회수했습니다.")
  })

  it("회수일은 필수이고 원 출고일보다 빠를 수 없다", () => {
    expect(validateReturnForm(candidate, { ...form, occurredAt: "" })).toBe("회수일을 입력하세요.")
    expect(validateReturnForm(candidate, { ...form, occurredAt: "2026-09-30" })).toBe("회수일이 원 출고일보다 빠릅니다.")
  })

  it("저장 본문은 원 출고에 연결되고 품목·물류번호·고객·유형을 원 출고에서 가져온다", () => {
    expect(buildReturnPayload(candidate, { ...form, quantity: "2", memo: " 불량 ", toLocation: "수리" })).toEqual({
      movementType: "return",
      returnOfMovementId: "out-1",
      productName: '86" IFP',
      quantity: 2,
      occurredAt: "2026-10-28",
      fromLocation: "남명학원",
      toLocation: "수리",
      status: "회수",
      lotNo: "C2",
      memo: "불량",
      customerId: "cust-1",
      outboundType: "sample",
    })
    const bare = buildReturnPayload({ ...candidate, customerId: null, outboundType: null, toLocation: null, lotNo: null }, form)
    expect(bare).not.toHaveProperty("customerId")
    expect(bare).not.toHaveProperty("outboundType")
    expect(bare.fromLocation).toBe("고객")
    expect(bare.lotNo).toBe("")
  })
})
