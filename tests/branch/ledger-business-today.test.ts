// 장부 화면의 '지금 → 달 · 회계연도 · 분기'는 KST 영업일이다(F-10). 매월 1일 00:00~08:59 KST(UTC 로는 아직 전날)에도
// 이번 달·이번 회계연도로 읽혀야 한다 — 12/1 잠금일 아침, 1/1, 4/1(회계연도 바뀜).
// 'YYYY-MM-DD' 문자열(탭이 들고 있는 오늘, F-11)도 받는다.
import { describe, expect, it } from "vitest"

import {
  buildFiscalMonthOptions,
  buildPeriodMonths,
  businessMonthKey,
  fiscalYearLabel,
  fiscalYearOf,
  ymKeyUtc,
} from "@/components/admin/branch/ledger/workbench-shared"
import { fiscalYearMonths } from "@/lib/branch/fiscal"

// 2026-12-01 00:05 KST = 2026-11-30T15:05Z
const DEC_1_KST_EARLY = new Date("2026-11-30T15:05:00Z")
// 2027-01-01 00:05 KST
const JAN_1_KST_EARLY = new Date("2026-12-31T15:05:00Z")
// 2027-04-01 00:05 KST — 회계연도 FY2027 시작
const APR_1_KST_EARLY = new Date("2027-03-31T15:05:00Z")

describe("businessMonthKey · fiscalYearOf · fiscalYearLabel", () => {
  it("12/1 00:05 KST 는 12월(UTC 로는 아직 11월)", () => {
    expect(ymKeyUtc(DEC_1_KST_EARLY)).toBe("2026-11")
    expect(businessMonthKey(DEC_1_KST_EARLY)).toBe("2026-12")
  })

  it("1/1 00:05 KST 는 1월, 회계연도는 그대로 FY26-27", () => {
    expect(businessMonthKey(JAN_1_KST_EARLY)).toBe("2027-01")
    expect(fiscalYearOf(JAN_1_KST_EARLY)).toBe(2026)
    expect(fiscalYearLabel(JAN_1_KST_EARLY)).toBe("FY26-27")
  })

  it("4/1 00:05 KST 는 새 회계연도 FY27-28", () => {
    expect(fiscalYearOf(APR_1_KST_EARLY)).toBe(2027)
    expect(fiscalYearLabel(APR_1_KST_EARLY)).toBe("FY27-28")
  })

  it("문자열 오늘('YYYY-MM-DD' · 'YYYY-MM')을 그대로 받는다", () => {
    expect(businessMonthKey("2026-12-01")).toBe("2026-12")
    expect(fiscalYearOf("2027-03-31")).toBe(2026)
    expect(fiscalYearOf("2027-04")).toBe(2027)
    expect(fiscalYearLabel("2027-04-01")).toBe("FY27-28")
  })
})

describe("buildFiscalMonthOptions — 이번 회계연도 열두 달 · 이번 달 표시", () => {
  it("12/1 00:05 KST 에 '이번 달'은 12월이다(예전에는 11월)", () => {
    const options = buildFiscalMonthOptions(DEC_1_KST_EARLY)
    expect(options.map((option) => option.value)).toEqual(fiscalYearMonths(2026))
    expect(options.find((option) => option.current)?.value).toBe("2026-12")
  })

  it("4/1 00:05 KST 에는 FY2027 열두 달을 낸다(예전에는 9시간 동안 FY2026)", () => {
    const options = buildFiscalMonthOptions(APR_1_KST_EARLY)
    expect(options[0]).toEqual({ value: "2027-04", label: "4월", current: true })
    expect(options[11].value).toBe("2028-03")
  })

  it("오늘 문자열로도 같다", () => {
    expect(buildFiscalMonthOptions("2026-12-01").find((option) => option.current)?.value).toBe("2026-12")
  })
})

describe("buildPeriodMonths — Q 는 오늘(KST)의 회계 분기", () => {
  const MONTHS = fiscalYearMonths(2026)

  it("1/1 00:05 KST 는 4분기(1~3월) — UTC 로는 아직 3분기(12월)였다", () => {
    expect(buildPeriodMonths("Q", "2026-11", MONTHS, JAN_1_KST_EARLY)).toEqual(["2027-01", "2027-02", "2027-03"])
  })

  it("10/1 00:05 KST 는 3분기(10~12월)", () => {
    expect(buildPeriodMonths("Q", "2026-08", MONTHS, new Date("2026-09-30T15:05:00Z"))).toEqual(["2026-10", "2026-11", "2026-12"])
  })

  it("오늘 문자열을 받는다 · M 은 선택월, Y 는 열두 달 그대로", () => {
    expect(buildPeriodMonths("Q", "2026-05", MONTHS, "2026-07-01")).toEqual(["2026-07", "2026-08", "2026-09"])
    expect(buildPeriodMonths("M", "2026-05", MONTHS, "2026-07-01")).toEqual(["2026-05"])
    expect(buildPeriodMonths("Y", "2026-05", MONTHS, "2026-07-01")).toEqual(MONTHS)
  })
})
