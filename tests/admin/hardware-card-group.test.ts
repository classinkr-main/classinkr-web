import { describe, expect, it } from "vitest"

import {
  elapsedDaysSince,
  hardwareCardGroup,
  isCoreIfpProduct,
  isPromotedProduct,
  periodKey,
} from "@/components/admin/hardware/inventory/shared"

// 카테고리 카드 단일 분류 회귀 — 서술 명칭 매칭 시절의 오계상(브라켓→카메라, STDM1→스탠드)이
// 되살아나지 않게 실데이터 품목명 그대로 고정한다.
describe("hardwareCardGroup", () => {
  it("classifies core IFP boards including promoted variants", () => {
    expect(hardwareCardGroup('86" IFP')).toBe("ifp86")
    expect(hardwareCardGroup('86" IFP (promoted)')).toBe("ifp86")
    expect(hardwareCardGroup('75" IFP')).toBe("ifp75")
  })

  it("classifies camera devices by product code, not by descriptive names", () => {
    expect(hardwareCardGroup("T1")).toBe("camera")
    expect(hardwareCardGroup("T1(promoted)")).toBe("camera")
    expect(hardwareCardGroup("S1")).toBe("camera")
    // "카메라 브라켓"은 액세서리 — 카메라 대수로 계상되면 카드가 위치맵과 어긋난다.
    expect(hardwareCardGroup("카메라 브라켓")).toBe("etc")
    // DT1은 T1이 아니다(단어 경계).
    expect(hardwareCardGroup("DT1")).toBe("etc")
  })

  it("classifies STD1 stands and keeps STDM1(110\") out of the stand card", () => {
    expect(hardwareCardGroup("STD1")).toBe("stand")
    expect(hardwareCardGroup("STD1(promoted)")).toBe("stand")
    expect(hardwareCardGroup('STDM1(110")')).toBe("etc")
  })

  it("collects accessories, touch pens, and non-core boards into etc", () => {
    for (const product of ["A1", "B1", "D2", "D2T", "OPS", "POE", "전원 케이블(1m)", "전원 케이블(3m)", '110" IFP', '65" IFP']) {
      expect(hardwareCardGroup(product)).toBe("etc")
    }
  })
})

describe("isPromotedProduct / isCoreIfpProduct", () => {
  it("detects promoted variants with flexible spacing", () => {
    expect(isPromotedProduct("STD1(promoted)")).toBe(true)
    expect(isPromotedProduct("T1 ( promoted )")).toBe(true)
    expect(isPromotedProduct("STD1")).toBe(false)
  })

  it("anchors core IFP matching to the product prefix", () => {
    expect(isCoreIfpProduct('86" IFP', "86")).toBe(true)
    expect(isCoreIfpProduct('책상용 86" IFP 거치대', "86")).toBe(false)
  })
})

// 분기·연간 모두 회계연도(4월 시작) 귀속 — 연간만 달력연도라 분기 합 ≠ 연간이던 혼합 회귀 방지.
describe("periodKey", () => {
  it("assigns fiscal-year keys so April starts the year and Q1-Q3 belong to it", () => {
    expect(periodKey("2026-08-10", "year")).toEqual({ key: "FY2026", label: "26-27 회계연도" })
    expect(periodKey("2026-04-01", "year")).toEqual({ key: "FY2026", label: "26-27 회계연도" })
  })

  it("attributes January-March to the previous fiscal year for both quarter and year", () => {
    expect(periodKey("2026-02-10", "year")).toEqual({ key: "FY2025", label: "25-26 회계연도" })
    expect(periodKey("2026-02-10", "quarter")).toEqual({ key: "2025Q4", label: "25-26 회계연도 4분기" })
  })

  it("keeps month buckets on calendar months", () => {
    expect(periodKey("2026-08-10", "month")).toEqual({ key: "2026-08", label: "2026년 8월" })
  })
})

describe("elapsedDaysSince", () => {
  it("returns null for missing or invalid dates", () => {
    expect(elapsedDaysSince(null)).toBeNull()
    expect(elapsedDaysSince("not-a-date")).toBeNull()
  })

  it("counts whole days from a past date key", () => {
    const past = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10)
    expect(elapsedDaysSince(past)).toBe(40)
  })
})
