import { describe, expect, it } from "vitest"
import { buildPeriodMonths, periodShortLabel } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(웨이브 5 — 장부 기간 UX 확장, 항목 1): REV 매트릭스 헤더/열 하이라이트와 카드
// 캡션이 소비하는 "선택 기간" 계산을 렌더 없이 직접 구동한다. 매트릭스 자체(그리드 열 구성)는
// 이 값과 무관하게 항상 FY 12개월 그대로다 — buildPeriodMonths/periodShortLabel은 보조 UI
// (헤더 하이라이트 대상, 카드 라벨)에만 쓰인다.

// FY26-27(4월 시작) 12개월 — SalesLedgerWorkbench.buildFiscalMonthOptions와 동일 순서.
const MATRIX_MONTHS = [
  "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12",
  "2027-01", "2027-02", "2027-03",
]

describe("buildPeriodMonths — M/Q/Y 회계월 목록", () => {
  it("M은 항상 [selectedMonth] 단일 원소 — 기존 selectedMonth 단일월 집계와 동일 모집단", () => {
    expect(buildPeriodMonths("M", "2026-08", MATRIX_MONTHS)).toEqual(["2026-08"])
  })

  it("Q는 selectedMonth가 아니라 now(오늘) 기준 회계분기 3개월을 돌려준다", () => {
    // now=2026-07-17(Q2: 7~9월) — selectedMonth를 다른 달(12월)로 둬도 Q는 now를 따른다.
    const now = new Date("2026-07-17T00:00:00Z")
    expect(buildPeriodMonths("Q", "2026-12", MATRIX_MONTHS, now)).toEqual(["2026-07", "2026-08", "2026-09"])
  })

  it("Q1(4~6월)일 때도 정확히 3개월을 돌려준다", () => {
    const now = new Date("2026-05-01T00:00:00Z")
    expect(buildPeriodMonths("Q", "2026-05", MATRIX_MONTHS, now)).toEqual(["2026-04", "2026-05", "2026-06"])
  })

  it("Y는 matrixMonths(FY 12개월) 전체 그대로 — 본표와 동일 모집단", () => {
    expect(buildPeriodMonths("Y", "2026-08", MATRIX_MONTHS)).toEqual(MATRIX_MONTHS)
  })
})

describe("periodShortLabel — 매트릭스 헤더/카드 라벨(웨이브 5, 항목 1)", () => {
  it('M은 "N월"', () => {
    expect(periodShortLabel("M", "2026-07", ["2026-07"], "FY26-27")).toBe("7월")
  })

  it('Q는 "Q{n}(시작-끝월)"', () => {
    expect(periodShortLabel("Q", "2026-12", ["2026-07", "2026-08", "2026-09"], "FY26-27")).toBe("Q2(7-9월)")
  })

  it("Y는 fyLabel 그대로", () => {
    expect(periodShortLabel("Y", "2026-07", MATRIX_MONTHS, "FY26-27")).toBe("FY26-27")
  })
})
