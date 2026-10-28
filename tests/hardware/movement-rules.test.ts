// 입출고 한 줄의 재고관리 프로세스 규칙(lib/hardware/movement-rules.ts) — 갭 문서 §6·§7.
import { describe, expect, it } from "vitest"

import {
  MovementRuleError,
  prepareProcessLine,
  type ProcessLineContext,
  type ProcessLineInput,
  type ReturnOriginal,
} from "@/lib/hardware/movement-rules"

const MANAGER = { userId: "u-boss", name: "이왕찬", isInventoryManager: true }
const SELLER = { userId: "u-kim", name: "김매니저", isInventoryManager: false }

function ctx(overrides: Partial<ProcessLineContext> = {}): ProcessLineContext {
  return { actor: SELLER, lotTracked: true, destination: "customer", origin: "warehouse", ...overrides }
}

function line(overrides: Partial<ProcessLineInput> = {}): ProcessLineInput {
  return { productName: "T1", movementType: "outbound", quantity: 1, ...overrides }
}

function ruleError(run: () => unknown): MovementRuleError {
  try {
    run()
  } catch (error) {
    if (error instanceof MovementRuleError) return error
    throw error
  }
  throw new Error("규칙 위반이 나지 않았다")
}

describe("입고", () => {
  const inbound = (overrides: Partial<ProcessLineInput> = {}) =>
    line({ movementType: "inbound", toLocation: "창고", isFree: false, lotNo: "C3", ...overrides })
  const known = new Set(["H8", "C1", "C2"])

  it("입고관리 권한자만", () => {
    expect(ruleError(() => prepareProcessLine(inbound(), ctx({ knownLots: known }))).status).toBe(403)
  })

  it("유상/무상이 필요하다", () => {
    expect(() => prepareProcessLine(inbound({ isFree: null }), ctx({ actor: MANAGER, knownLots: known }))).toThrow("유상/무상")
  })

  it("새 물류번호는 다음 C 순번만, 기존 번호는 그대로 더한다", () => {
    const next = prepareProcessLine(inbound({ lotNo: "c3" }), ctx({ actor: MANAGER, knownLots: known }))
    expect(next.input.lotNo).toBe("C3")
    expect(next.newLotNo).toBe("C3")

    expect(prepareProcessLine(inbound({ lotNo: "H8" }), ctx({ actor: MANAGER, knownLots: known })).newLotNo).toBeNull()

    const skipped = ruleError(() => prepareProcessLine(inbound({ lotNo: "C5" }), ctx({ actor: MANAGER, knownLots: known })))
    expect(skipped.status).toBe(422)
    expect(skipped.message).toContain("C3 차례")
  })

  it("수량만 관리하는 품목은 물류번호를 버린다", () => {
    const result = prepareProcessLine(inbound({ productName: "OPS", lotNo: "C9" }), ctx({ actor: MANAGER, lotTracked: false }))
    expect(result.input.lotNo).toBeNull()
  })

  it("칸이 없는 DB(lotTracked null)는 예전처럼 검사하지 않는다", () => {
    const result = prepareProcessLine(inbound({ isFree: null, lotNo: "아무거나" }), ctx({ actor: MANAGER, lotTracked: null }))
    expect(result.input.lotNo).toBe("아무거나")
  })
})

describe("재고 조정", () => {
  it("입고관리 권한자만, 사유 필수, 방향을 위치로 바꾼다", () => {
    const adjust = line({ movementType: "adjust", memo: "실사 결과 1대 부족", adjustDirection: "decrease" })
    expect(ruleError(() => prepareProcessLine(adjust, ctx())).status).toBe(403)
    expect(() => prepareProcessLine({ ...adjust, memo: " " }, ctx({ actor: MANAGER }))).toThrow("사유")

    const decreased = prepareProcessLine(adjust, ctx({ actor: MANAGER }))
    expect(decreased.input).toMatchObject({ fromLocation: "창고", toLocation: null })
    const increased = prepareProcessLine({ ...adjust, adjustDirection: "increase" }, ctx({ actor: MANAGER }))
    expect(increased.input).toMatchObject({ fromLocation: null, toLocation: "창고" })
  })
})

describe("고객사 출고", () => {
  const outbound = (overrides: Partial<ProcessLineInput> = {}) =>
    line({ occurredAt: "2026-10-30", outboundType: "sales", status: "배송 예정", toLocation: "대치학원", lotNo: "C1", ...overrides })

  it("담당은 본인 계정, 진행 상태는 고정값, 물류번호 직접 선택(strictLot)", () => {
    const result = prepareProcessLine(outbound({ status: "예약" }), ctx())
    expect(result.strictLot).toBe(true)
    expect(result.input).toMatchObject({ ownerUserId: "u-kim", owner: "김매니저", createdByUserId: "u-kim", status: "배송 예정" })
    expect(prepareProcessLine(outbound({ status: "출고" }), ctx()).input.status).toBe("설치 완료")
  })

  it("출고일·유형·물류번호가 필요하다", () => {
    expect(() => prepareProcessLine(outbound({ occurredAt: null }), ctx())).toThrow("출고일")
    expect(() => prepareProcessLine(outbound({ outboundType: null }), ctx())).toThrow("출고 유형")
    expect(() => prepareProcessLine(outbound({ lotNo: "" }), ctx())).toThrow("물류번호를 골라야")
  })

  it("샘플은 반납 예정일이 필요하고, 샘플이 아니면 반납 예정일을 지운다", () => {
    expect(() => prepareProcessLine(outbound({ outboundType: "sample" }), ctx())).toThrow("반납 예정일")
    expect(prepareProcessLine(outbound({ expectedReturnAt: "2026-12-01" }), ctx()).input.expectedReturnAt).toBeNull()
  })

  it("CRM 고객을 고르면 이름을 출고처로 싣고, 없는 고객이면 404", () => {
    const picked = prepareProcessLine(outbound({ toLocation: "", customerId: "c-1" }), ctx({ customerName: "한빛학원" }))
    expect(picked.input).toMatchObject({ customerId: "c-1", toLocation: "한빛학원" })
    expect(ruleError(() => prepareProcessLine(outbound({ customerId: "c-x" }), ctx({ customerName: null }))).status).toBe(404)
  })

  it("다른 담당 지정은 입고관리 권한자만", () => {
    expect(ruleError(() => prepareProcessLine(outbound({ ownerUserId: "u-other" }), ctx())).status).toBe(403)
    expect(prepareProcessLine(outbound({ ownerUserId: "u-other", owner: "박매니저" }), ctx({ actor: MANAGER })).input)
      .toMatchObject({ ownerUserId: "u-other", owner: "박매니저" })
  })

  it("마이그레이션 전 DB(lotTracked null)는 새 필수값을 요구하지 않는다", () => {
    const legacy = prepareProcessLine(line({ toLocation: "대치학원", status: "출고" }), ctx({ lotTracked: null }))
    expect(legacy.strictLot).toBe(false)
    expect(legacy.input).toMatchObject({ status: "출고", ownerUserId: "u-kim" })
    const legacyReturn = prepareProcessLine(line({ movementType: "return", fromLocation: "대치학원" }), ctx({ lotTracked: null, origin: "customer" }))
    expect(legacyReturn.input.returnOfMovementId).toBeUndefined()
  })

  it("사무실·샘플 풀·수리 이동은 예전 흐름(유형·물류번호 선택 없음)", () => {
    const internal = prepareProcessLine(line({ toLocation: "사무실", status: "사무실 배정" }), ctx({ destination: "office" }))
    expect(internal.strictLot).toBe(false)
    expect(internal.input.status).toBe("사무실 배정")
  })
})

describe("회수", () => {
  const original: ReturnOriginal = {
    id: "out-1",
    item_id: "item-t1",
    product_name: "T1",
    movement_type: "outbound",
    quantity: 3,
    status: "설치 완료",
    voided_at: null,
    to_location: "대치학원",
    lotKey: "C1",
    customer_id: "c-1",
    outboundType: "sample",
    returnedQuantities: [1],
  }
  const ret = (overrides: Partial<ProcessLineInput> = {}) =>
    line({ movementType: "return", returnOfMovementId: "out-1", quantity: 2, ...overrides })

  it("원 출고에서 품목·물류번호·고객·유형을 채우고 상태는 회수", () => {
    const result = prepareProcessLine(ret({ productName: "아무 이름" }), ctx({ origin: "customer", returnOriginal: original }))
    expect(result.input).toMatchObject({
      itemId: "item-t1",
      productName: "T1",
      lotNo: "C1",
      customerId: "c-1",
      outboundType: "sample",
      fromLocation: "대치학원",
      toLocation: "창고",
      status: "회수",
    })
  })

  it("남은 수량까지만, 취소·예정 출고는 막는다", () => {
    expect(ruleError(() => prepareProcessLine(ret({ quantity: 3 }), ctx({ returnOriginal: original }))).message).toContain("2대")
    expect(ruleError(() => prepareProcessLine(ret(), ctx({ returnOriginal: { ...original, voided_at: "2026-10-01" } }))).status).toBe(422)
    expect(ruleError(() => prepareProcessLine(ret(), ctx({ returnOriginal: { ...original, status: "배송 예정" } }))).status).toBe(422)
    expect(ruleError(() => prepareProcessLine(ret(), ctx({ returnOriginal: null }))).status).toBe(404)
  })

  it("고객사에서 오는 회수는 원 출고가 필요하고, 샘플 풀 반납은 예전 흐름", () => {
    expect(() => prepareProcessLine(line({ movementType: "return", fromLocation: "대치학원" }), ctx({ origin: "customer" }))).toThrow("원 출고")
    const pool = prepareProcessLine(line({ movementType: "return", fromLocation: "샘플", toLocation: "사무실" }), ctx({ origin: "sample" }))
    expect(pool.input.returnOfMovementId).toBeUndefined()
  })
})

describe("시스템 경로", () => {
  it("요청자가 없으면 검사 없이 그대로 싣는다(오더 승인 배송 예정)", () => {
    const input = line({ status: "배송 예정", outboundType: "sales", customerId: "c-1", lotNo: null, occurredAt: null })
    const result = prepareProcessLine(input, ctx({ actor: null }))
    expect(result).toEqual({ input, strictLot: false, newLotNo: null })
  })
})
