// 위치 정규화(lib/hardware/locations.ts) — 서버 원장과 화면 출고 기간 집계가 같은 규칙을 쓴다.
import { describe, expect, it } from "vitest"

import { classifyDestination, isInternalLocation, normalizeLocationName } from "@/lib/hardware/locations"

describe("위치 정규화", () => {
  it("창고·인천 더조은(FPL)·사무실·샘플·수리를 내부 위치로 본다", () => {
    expect(normalizeLocationName("오산 창고")).toBe("창고")
    expect(normalizeLocationName("인천 더조은")).toBe("창고")
    expect(classifyDestination("클래스인 본사")).toBe("office")
    expect(classifyDestination("샘플/대여")).toBe("sample")
    expect(classifyDestination("A/S 센터")).toBe("repair")
    expect(isInternalLocation("사무실")).toBe(true)
  })

  it("고객사 이름 속 수리·as 는 고객사다 — 화면 집계가 '대치수리학원'을 빼던 것", () => {
    expect(classifyDestination("대치수리학원")).toBe("other")
    expect(classifyDestination("OO수리과학학원")).toBe("other")
    expect(classifyDestination("ClassIn Master")).toBe("office")
    expect(isInternalLocation("대치수리학원")).toBe(false)
    expect(classifyDestination("고객사 직송")).toBe("customer")
  })
})
