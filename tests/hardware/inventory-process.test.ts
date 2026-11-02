// 재고관리 프로세스 정의서 규칙(lib/hardware/inventory-process.ts) — 서버·화면·대시보드·알림이 같이 쓰는 정본.
import { describe, expect, it } from "vitest"

import {
  assertLotSelectable,
  canActOnMovement,
  inferOutboundTypeFromText,
  isOwnMovement,
  LotRuleError,
  nextLotNo,
  plannedAgeDays,
  resolveOutboundType,
  returnableQuantity,
} from "@/lib/hardware/inventory-process"

describe("resolveOutboundType", () => {
  it("칸이 있으면 그 값을 쓴다", () => {
    expect(resolveOutboundType({ movement_type: "outbound", outbound_type: "promotion", memo: "샘플" })).toBe("promotion")
  })

  it("시트 행은 유형 열 → 메모 → 상태 → 도착지 순서로 추정한다", () => {
    const raw = { values: Array.from({ length: 13 }, (_, index) => (index === 11 ? "A/S" : null)) }
    expect(resolveOutboundType({ movement_type: "outbound", raw, memo: "세일즈" })).toBe("as")
    expect(resolveOutboundType({ movement_type: "outbound", memo: "프로모션 · 학원 증정" })).toBe("promotion")
    expect(resolveOutboundType({ movement_type: "outbound", status: "샘플/대여" })).toBe("sample")
    expect(resolveOutboundType({ movement_type: "outbound", memo: "대치수리학원 설치" })).toBeNull()
  })

  it("출고·회수가 아니면 null", () => {
    expect(resolveOutboundType({ movement_type: "inbound", outbound_type: "sales" })).toBeNull()
  })

  it("단어 속 as(ClassIn·Master)는 A/S 로 보지 않는다", () => {
    expect(inferOutboundTypeFromText("ClassIn Master 납품")).toBe("sales")
  })
})

describe("isOwnMovement · canActOnMovement", () => {
  const me = { userId: "u-me", name: "김매니저", isInventoryManager: false }
  const manager = { userId: "u-boss", name: "이왕찬", isInventoryManager: true }

  it("계정 id 가 있으면 id 로만 판정한다", () => {
    expect(isOwnMovement({ source: "admin_manual", owner_user_id: "u-me", owner: "다른 이름" }, me)).toBe(true)
    expect(isOwnMovement({ source: "admin_manual", owner_user_id: "u-other", owner: "김매니저" }, me)).toBe(false)
  })

  it("이전 어드민 행은 담당자·작성자 이름으로 판정한다(공백 무시)", () => {
    expect(isOwnMovement({ source: "admin_manual", owner: "김 매니저" }, me)).toBe(true)
    expect(isOwnMovement({ source: "admin_manual", created_by: "김매니저" }, me)).toBe(true)
  })

  it("시트 행은 누구의 건도 아니다", () => {
    expect(isOwnMovement({ source: "sheet_import", owner: "김매니저" }, me)).toBe(false)
  })

  it("배송 예정은 본인, 실현 기록은 입고관리 권한자만", () => {
    const mine = { source: "admin_manual", owner_user_id: "u-me" }
    expect(canActOnMovement("confirm", mine, me)).toBe(true)
    expect(canActOnMovement("edit_actual", mine, me)).toBe(false)
    expect(canActOnMovement("void_actual", { source: "admin_manual" }, manager)).toBe(true)
    expect(canActOnMovement("edit_planned", { source: "admin_manual", owner_user_id: "u-other" }, me)).toBe(false)
  })
})

describe("물류번호", () => {
  it("다음 신규 번호는 가장 큰 C 번호 + 1", () => {
    expect(nextLotNo(["H8", "C1", "c2", null, "FY24-25"])).toBe("C3")
    expect(nextLotNo([])).toBe("C1")
  })

  it("물류번호 관리 품목은 번호가 필수이고 잔여를 넘으면 막는다", () => {
    const lots = [{ lotNo: "C1", remaining: 2 }]
    expect(assertLotSelectable({ productName: "T1", lotTracked: true, lotNo: " C1 ", quantity: 2, lots })).toBe("C1")
    expect(() => assertLotSelectable({ productName: "T1", lotTracked: true, lotNo: null, quantity: 1, lots })).toThrow(LotRuleError)
    expect(() => assertLotSelectable({ productName: "T1", lotTracked: true, lotNo: "C1", quantity: 3, lots })).toThrow(/잔여는 2대/)
  })

  it("수량만 관리하는 품목은 검사하지 않는다", () => {
    expect(assertLotSelectable({ productName: "OPS", lotTracked: false, lotNo: "", quantity: 9, lots: [] })).toBeNull()
  })
})

describe("회수·알림 기준", () => {
  it("남은 회수 가능 수량", () => {
    expect(returnableQuantity({ quantity: 3 }, [1, 1])).toBe(1)
    expect(returnableQuantity({ quantity: 1 }, [2])).toBe(0)
  })

  it("배송 예정 경과일은 예정일, 없으면 등록일 기준", () => {
    const now = new Date("2026-10-28T00:00:00Z")
    expect(plannedAgeDays({ occurred_at: "2026-09-27", created_at: "2026-10-01T00:00:00Z" }, now)).toBe(31)
    expect(plannedAgeDays({ occurred_at: null, created_at: "2026-09-28T00:00:00Z" }, now)).toBe(30)
    expect(plannedAgeDays({ occurred_at: "2026-11-30", created_at: "2026-10-01T00:00:00Z" }, now)).toBe(0)
  })
})
