import { describe, expect, it } from "vitest"

import {
  customerOutboundStatus,
  INITIAL_OUTBOUND_V2_STATE,
  isCustomerOutbound,
  outboundV2InputFromDraft,
  outboundV2Issues,
  processDraftFields,
  validateInboundAdjustExtras,
  validateOutboundV2,
  type OutboundV2Input,
} from "@/components/admin/hardware/inventory/outbound-v2-model"

const base = (patch: Partial<OutboundV2Input> = {}): OutboundV2Input => ({
  movementType: "outbound",
  productName: '86" IFP',
  quantity: 2,
  occurredAt: "2026-10-28",
  fromLocation: "창고",
  toLocation: "남명학원",
  outboundType: "sales",
  customerId: "cust-1",
  customerMode: "crm",
  expectedReturnAt: null,
  lotNo: "C3",
  lot: { lotTracked: true, lots: [{ lotNo: "C3", remaining: 5 }] },
  ...patch,
})

describe("고객 출고 판정", () => {
  it("내부 위치(사무실·샘플·수리·창고)로 가는 출고는 고객 출고가 아니다", () => {
    for (const to of ["사무실", "샘플", "수리", "창고", " 샘플 "]) {
      expect(isCustomerOutbound({ movementType: "outbound", toLocation: to })).toBe(false)
    }
  })
  it("도착이 비어 있어도 출고면 고객 출고로 본다 — 고객을 고르라고 묻기 위해서다", () => {
    expect(isCustomerOutbound({ movementType: "outbound", toLocation: "" })).toBe(true)
    expect(isCustomerOutbound({ movementType: "return", toLocation: "남명학원" })).toBe(false)
  })
  it("진행 상태는 고정 두 값이다", () => {
    expect(customerOutboundStatus(true)).toBe("배송 예정")
    expect(customerOutboundStatus(false)).toBe("설치 완료")
  })
})

describe("출고 등록 v2 검증", () => {
  it("규칙을 모두 지킨 고객 출고는 통과한다", () => {
    expect(outboundV2Issues(base())).toEqual([])
    expect(validateOutboundV2(base())).toBeNull()
  })

  it("고객 출고는 출고일과 유형이 필수다", () => {
    const issues = outboundV2Issues(base({ occurredAt: "", outboundType: "" }))
    expect(issues.map((issue) => issue.field)).toEqual(["occurredAt", "outboundType"])
  })

  it("CRM 모드에서 고객을 고르지 않으면 막고, 직접 입력 모드는 이름만 본다", () => {
    expect(outboundV2Issues(base({ customerId: null })).map((issue) => issue.field)).toEqual(["customer"])
    expect(outboundV2Issues(base({ customerId: null, customerMode: "free" }))).toEqual([])
    expect(outboundV2Issues(base({ customerId: null, customerMode: "free", toLocation: "  " }))[0]?.field).toBe("customer")
  })

  it("바구니 줄(모드 없음)은 고객 id 가 있으면 CRM, 없으면 직접 입력으로 본다", () => {
    expect(outboundV2Issues(base({ customerId: null, customerMode: undefined }))).toEqual([])
  })

  it("샘플 출고는 반납 예정일이 필수이고 출고일보다 빠를 수 없다", () => {
    expect(validateOutboundV2(base({ outboundType: "sample" }))).toBe("샘플 출고는 반납 예정일이 필요합니다.")
    expect(validateOutboundV2(base({ outboundType: "sample", expectedReturnAt: "2026-10-01" }))).toBe("반납 예정일이 출고일보다 빠릅니다.")
    expect(validateOutboundV2(base({ outboundType: "sample", expectedReturnAt: "2026-11-30" }))).toBeNull()
  })

  it("물류번호 관리 품목은 물류번호를 골라야 하고 잔여를 넘으면 막는다", () => {
    expect(validateOutboundV2(base({ lotNo: "" }))).toContain("물류번호를 골라야")
    expect(validateOutboundV2(base({ quantity: 6 }))).toContain("C3 잔여는 5대입니다(요청 6대)")
    expect(validateOutboundV2(base({ lotNo: "C9" }))).toContain("C9 잔여는 0대")
  })

  it("잔여를 아직 모르면(불러오는 중) 필수 여부만 보고 초과는 서버에 맡긴다", () => {
    const lot = { lotTracked: true, lots: null }
    expect(validateOutboundV2(base({ lot, lotNo: "" }))).toContain("물류번호를 골라야")
    expect(validateOutboundV2(base({ lot, lotNo: "C1", quantity: 999 }))).toBeNull()
  })

  it("수량만 관리하는 품목과 사무실 반출은 물류번호를 묻지 않는다", () => {
    expect(validateOutboundV2(base({ lot: { lotTracked: false, lots: [] }, lotNo: "" }))).toBeNull()
    expect(validateOutboundV2(base({ fromLocation: "사무실", lotNo: "" }))).toBeNull()
  })

  it("창고에서 내부 위치로 가는 출고는 물류번호를 묻지 않는다 — 서버가 FIFO 로 배정한다(W1 계약)", () => {
    expect(validateOutboundV2(base({ toLocation: "샘플", outboundType: "", customerId: null, lotNo: "" }))).toBeNull()
  })

  it("내부 이동(사무실 샘플 풀)은 유형·고객·출고일을 묻지 않는다", () => {
    const internal = base({ toLocation: "샘플", fromLocation: "사무실", outboundType: "", customerId: null, occurredAt: "", lotNo: "" })
    expect(outboundV2Issues(internal)).toEqual([])
  })

  it("출고가 아니면 아무것도 묻지 않는다", () => {
    expect(outboundV2Issues(base({ movementType: "inbound", outboundType: "", lotNo: "" }))).toEqual([])
  })

  it("드래프트에서 입력을 만든다", () => {
    const input = outboundV2InputFromDraft(
      {
        movementType: "outbound",
        productName: "S1",
        quantity: 1,
        occurredAt: "2026-10-28",
        fromLocation: "창고",
        toLocation: "가온학원",
        lotNo: "",
        outboundType: "promotion",
      },
      { lotTracked: false, lots: null },
      "free"
    )
    expect(input).toMatchObject({ outboundType: "promotion", customerId: null, customerMode: "free", expectedReturnAt: null })
    expect(validateOutboundV2(input)).toBeNull()
  })
})

describe("전송 칸 고르기", () => {
  const state = { ...INITIAL_OUTBOUND_V2_STATE, outboundType: "sample" as const, customerId: "cust-1", expectedReturnAt: "2026-11-30", ownerUserId: "user-2" }

  it("고객 출고에는 유형·고객·반납일·담당이 실린다", () => {
    expect(processDraftFields(state, { movementType: "outbound", toLocation: "남명학원" })).toEqual({
      outboundType: "sample",
      customerId: "cust-1",
      expectedReturnAt: "2026-11-30",
      ownerUserId: "user-2",
    })
  })

  it("샘플이 아니면 반납일을, 직접 입력이면 고객 id 를 싣지 않는다", () => {
    expect(processDraftFields({ ...state, outboundType: "sales", customerMode: "free" }, { movementType: "outbound", toLocation: "현장" })).toEqual({
      outboundType: "sales",
      ownerUserId: "user-2",
    })
  })

  it("내부 이동에는 유형·고객을 싣지 않는다", () => {
    expect(processDraftFields(state, { movementType: "outbound", toLocation: "샘플" })).toEqual({ ownerUserId: "user-2" })
  })

  it("입고는 무상 여부, 조정은 방향을 싣는다", () => {
    expect(processDraftFields({ ...INITIAL_OUTBOUND_V2_STATE, isFree: true }, { movementType: "inbound", toLocation: "창고" })).toEqual({ isFree: true })
    expect(processDraftFields({ ...INITIAL_OUTBOUND_V2_STATE, adjustDirection: "increase" }, { movementType: "adjust", toLocation: "창고" })).toEqual({
      adjustDirection: "increase",
    })
  })
})

describe("빠른 기록 시트의 입고·조정 규칙", () => {
  it("입고는 유상/무상을, 조정은 사유를 요구한다", () => {
    expect(validateInboundAdjustExtras({ movementType: "inbound", isFree: null, memo: "" })).toBe("입고는 유상/무상을 고르세요.")
    expect(validateInboundAdjustExtras({ movementType: "inbound", isFree: false, memo: "" })).toBeNull()
    expect(validateInboundAdjustExtras({ movementType: "adjust", isFree: null, memo: "  " })).toBe("재고 조정은 사유(메모)를 입력하세요.")
    expect(validateInboundAdjustExtras({ movementType: "adjust", isFree: null, memo: "실사 차이" })).toBeNull()
    expect(validateInboundAdjustExtras({ movementType: "outbound", isFree: null, memo: "" })).toBeNull()
  })
})
