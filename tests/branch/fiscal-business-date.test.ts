// 'now → 달·회계연도·분기'는 KST 영업일 기준(F-10). 매월 1일 00:00~08:59 KST 는 UTC 로는 아직 지난달이라
// UTC 게터로 판정하면 12/1 잠금일·1/1·4/1 아침에 화면이 한 달(한 회계연도) 늦게 열린다.
import { describe, expect, it } from "vitest"
import {
  businessDateAsUtc,
  businessFy,
  businessQuarter,
  businessYm,
  currentFyPeriod,
  dateFromYmMonth,
  fiscalYearMonths,
  fiscalYearOfYm,
  fyOf,
  fyStart,
  resolvePeriodDate,
  ymKey,
} from "@/lib/branch/fiscal"
import { getBusinessCalendarParts, getBusinessDateParts } from "@/lib/business-time"

describe("KST 영업일 기준 달·회계연도·분기", () => {
  it.each([
    // [UTC 시각, KST 영업월, 회계연도, 분기]
    ["2026-11-30T15:05:00Z", "2026-12", 2026, 3], // 12/1 00:05 KST — 잠금일 아침
    ["2026-12-31T15:05:00Z", "2027-01", 2026, 4], // 1/1 00:05 KST
    ["2027-03-31T15:05:00Z", "2027-04", 2027, 1], // 4/1 00:05 KST — 회계연도가 바뀐다
    ["2026-11-30T14:59:59Z", "2026-11", 2026, 3], // 11/30 23:59 KST — 아직 11월
  ] as const)("%s → %s · FY%s · Q%s", (iso, ym, fy, quarter) => {
    const now = new Date(iso)
    expect(businessYm(now)).toBe(ym)
    expect(businessFy(now)).toBe(fy)
    expect(businessQuarter(now)).toBe(quarter)
    expect(ymKey(now)).toBe(ym)
    expect(fyOf(now)).toBe(fy)
    expect(currentFyPeriod(now)).toEqual({ fy, quarter, month: ym })
  })

  it("UTC 자정으로 만든 달 시작(YYYY-MM 산술)은 시간대와 무관하게 그 달이다", () => {
    for (const ym of ["2026-04", "2026-12", "2027-01", "2027-03"]) {
      expect(ymKey(dateFromYmMonth(ym))).toBe(ym)
      expect(fyOf(dateFromYmMonth(ym))).toBe(fiscalYearOfYm(ym))
    }
    expect(fyStart(new Date("2027-03-31T15:05:00Z")).toISOString().slice(0, 10)).toBe("2027-04-01")
    expect(fyStart(new Date("2027-03-31T14:59:00Z")).toISOString().slice(0, 10)).toBe("2026-04-01")
  })

  it("fiscalYearMonths(fy) = fy-04 … fy+1-03 열두 달", () => {
    expect(fiscalYearMonths(2026)).toEqual([
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ])
    expect(fiscalYearMonths(2027)[0]).toBe("2027-04")
    expect(fiscalYearMonths(2027)[11]).toBe("2028-03")
  })

  it("fiscalYearOfYm 은 순수 산술(시간대 없음)", () => {
    expect(fiscalYearOfYm("2027-03")).toBe(2026)
    expect(fiscalYearOfYm("2027-04")).toBe(2027)
    expect(fiscalYearOfYm("2026-12-31")).toBe(2026)
  })
})

describe("resolvePeriodDate — 기준일은 KST 영업일(UTC 자정)", () => {
  it("분기·연·월 미지정은 지금의 KST 영업일 — 1일 이른 아침에도 이번 달로 읽힌다", () => {
    const at = new Date("2026-11-30T15:05:00Z")
    for (const scope of ["Q", "Y"] as const) {
      const date = resolvePeriodDate(scope, null, at)!
      expect(date.toISOString()).toBe("2026-12-01T00:00:00.000Z")
      expect(date.getUTCMonth() + 1).toBe(12)
    }
    expect(resolvePeriodDate("M", null, at)!.toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(resolvePeriodDate("Q", null, new Date("2027-03-31T15:05:00Z"))!.toISOString()).toBe("2027-04-01T00:00:00.000Z")
  })

  it("같은 KST 영업일 안의 요청은 같은 기준일을 만든다(밀리초가 키를 가르지 않는다, F-50)", () => {
    const a = resolvePeriodDate("Q", null, new Date("2026-11-25T01:02:03.456Z"))!
    const b = resolvePeriodDate("Q", null, new Date("2026-11-25T14:59:59.999Z"))!
    expect(a.toISOString()).toBe(b.toISOString())
    expect(businessDateAsUtc(new Date("2026-11-25T15:00:00Z")).toISOString()).toBe("2026-11-26T00:00:00.000Z")
  })

  it("월 지정은 그 달 1일, 형식이 틀리면 null(기존 계약)", () => {
    expect(resolvePeriodDate("M", "2026-04", new Date("2026-11-30T15:05:00Z"))!.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(resolvePeriodDate("M", "bad", new Date())).toBeNull()
  })
})

describe("getBusinessCalendarParts — getBusinessDateParts 와 같은 KST 날짜(고정 +09:00)", () => {
  it("한 해 동안 매 시간 같은 날짜를 낸다", () => {
    const start = Date.UTC(2026, 10, 25, 0, 30)
    for (let hour = 0; hour < 24 * 400; hour += 7) {
      const at = new Date(start + hour * 3600 * 1000)
      const { year, month, day } = getBusinessCalendarParts(at)
      const text = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      expect(text).toBe(getBusinessDateParts(at).date)
    }
  })
})
