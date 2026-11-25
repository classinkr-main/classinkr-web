import { describe, expect, it } from "vitest"
import {
  defaultExpandedRevMonths,
  isLedgerBusinessDate,
  isUntouchedDraftForm,
  ledgerBusinessDate,
  ledgerFiscalMonthOptions,
  ledgerPipelineUrl,
  ledgerViewFiscalYear,
  nextLedgerBusinessDate,
  rolledDraftForm,
  rolledExpandedRevMonths,
  rolledSelectedMonth,
  sheetAnchorCorrection,
  shiftYm,
} from "@/components/admin/branch/ledger/ledger-business-day"
import { clampSheetAnchor } from "@/components/admin/branch/ledger/ledger-sheet-logic"

// 장부 화면의 '오늘'(KST 영업일)과 회계연도 · 날짜 바뀜 규칙(F-10 · F-11 · F-27 · F-45). 시각은 모두 UTC 로 주고,
// 화면은 KST 날짜(UTC+9)로 읽어야 한다 — 매월 1일 00:00~08:59 KST 가 UTC 로는 아직 지난달이다.

const FY26 = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
]

describe("ledgerBusinessDate · nextLedgerBusinessDate — 오늘은 KST 영업일", () => {
  it.each([
    ["2026-11-30T15:05:00Z", "2026-12-01"], // 12/1 잠금일 00:05 KST — UTC 로는 11/30
    ["2026-12-31T15:05:00Z", "2027-01-01"], // 1/1 00:05 KST
    ["2027-03-31T15:05:00Z", "2027-04-01"], // 4/1 00:05 KST — 회계연도가 넘어간다
    ["2026-11-30T14:59:00Z", "2026-11-30"], // 11/30 23:59 KST
  ])("%s → %s", (iso, expected) => {
    expect(ledgerBusinessDate(undefined, new Date(iso))).toBe(expected)
  })

  it("서버가 넘긴 날(initialBusinessDate)이 맞는 모양이면 브라우저 시계보다 그 값을 쓴다(F-45)", () => {
    // 서버는 11/30 23:59:59 KST 에 그렸고, 브라우저는 이미 12/1 이다 — 첫 렌더는 서버와 같은 11/30 이어야 하이드레이션이 맞다.
    expect(ledgerBusinessDate("2026-11-30", new Date("2026-11-30T15:00:01Z"))).toBe("2026-11-30")
  })

  it("모양이 틀린 값은 버리고 지금의 KST 영업일", () => {
    expect(isLedgerBusinessDate("2026-13-01")).toBe(false)
    expect(isLedgerBusinessDate("2026-11")).toBe(false)
    expect(ledgerBusinessDate("2026-11", new Date("2026-11-30T15:05:00Z"))).toBe("2026-12-01")
    expect(ledgerBusinessDate(null, new Date("2026-11-30T15:05:00Z"))).toBe("2026-12-01")
  })

  it("틱 — 같은 날이면 지금 값 그대로, 자정(KST)을 넘기면 새 날", () => {
    expect(nextLedgerBusinessDate("2026-11-30", new Date("2026-11-30T14:59:00Z"))).toBe("2026-11-30")
    expect(nextLedgerBusinessDate("2026-11-30", new Date("2026-11-30T15:00:00Z"))).toBe("2026-12-01")
  })
})

describe("ledgerViewFiscalYear · ledgerFiscalMonthOptions — 화면 회계연도", () => {
  it("기본(선택 달 = 오늘의 달)은 KST 영업일의 회계연도 — 4/1 00:05 KST 에 이미 새 회계연도", () => {
    const today = ledgerBusinessDate(undefined, new Date("2027-03-31T15:05:00Z"))
    expect(ledgerViewFiscalYear(today.slice(0, 7), today)).toBe(2027)
    const dec1 = ledgerBusinessDate(undefined, new Date("2026-11-30T15:05:00Z"))
    expect(ledgerViewFiscalYear(dec1.slice(0, 7), dec1)).toBe(2026)
  })

  it("주소의 ?month= 가 다른 회계연도면 그 회계연도를 연다(F-27) — 3월은 앞 회계연도", () => {
    expect(ledgerViewFiscalYear("2027-03", "2027-04-02")).toBe(2026)
    expect(ledgerViewFiscalYear("2025-12", "2026-11-25")).toBe(2025)
    expect(ledgerViewFiscalYear("2027-04", "2026-11-25")).toBe(2027)
  })

  it("선택 달이 'YYYY-MM' 이 아니면 오늘의 회계연도", () => {
    expect(ledgerViewFiscalYear("", "2027-04-01")).toBe(2027)
    expect(ledgerViewFiscalYear("2026-13", "2026-11-25")).toBe(2026)
  })

  it("월 선택지는 그 회계연도 열두 달(4월 → 3월)이고 이번 달 표시는 오늘(KST)의 달에만", () => {
    const options = ledgerFiscalMonthOptions(2026, "2026-12")
    expect(options.map((option) => option.value)).toEqual(FY26)
    expect(options[0]).toEqual({ value: "2026-04", label: "4월", current: false })
    expect(options.filter((option) => option.current).map((option) => option.value)).toEqual(["2026-12"])
    // 다른 회계연도를 보고 있으면 이번 달 표시가 없다.
    expect(ledgerFiscalMonthOptions(2025, "2026-12").some((option) => option.current)).toBe(false)
  })

  it("선택 달이 늘 화면 회계연도 안이라 시트 기준 달 되돌려 쓰기는 할 일이 없다 — 밖이면 맞춘 달을 돌려준다", () => {
    for (const month of ["2026-04", "2026-11", "2027-03"]) {
      const months = ledgerFiscalMonthOptions(ledgerViewFiscalYear(month, "2026-11-25"), "2026-11").map((option) => option.value)
      expect(sheetAnchorCorrection(month, clampSheetAnchor(months, month))).toBeNull()
    }
    expect(sheetAnchorCorrection("2027-04", clampSheetAnchor(FY26, "2027-04"))).toBe("2027-03")
    expect(sheetAnchorCorrection("2026-03", clampSheetAnchor(FY26, "2026-03"))).toBe("2026-04")
  })
})

describe("rolledSelectedMonth — 자정을 넘겨 열어 둔 탭(F-11)", () => {
  const base = { previousDefault: "2026-11", nextDefault: "2026-12" }

  it("기본 달(어제까지의 이번 달)을 보고 있었고 주소에 ?month 가 없으면 새 이번 달로", () => {
    expect(rolledSelectedMonth({ ...base, selectedMonth: "2026-11", urlHasMonth: false })).toBe("2026-12")
  })

  it("다른 달을 골라 보고 있었으면 그대로", () => {
    expect(rolledSelectedMonth({ ...base, selectedMonth: "2026-09", urlHasMonth: true })).toBe("2026-09")
    expect(rolledSelectedMonth({ ...base, selectedMonth: "2026-09", urlHasMonth: false })).toBe("2026-09")
  })

  it("주소가 ?month 로 달을 박아 두었으면 그대로", () => {
    expect(rolledSelectedMonth({ ...base, selectedMonth: "2026-11", urlHasMonth: true })).toBe("2026-11")
  })

  it("이번 달이 그대로면(같은 달 안에서 날만 바뀜) 아무것도 바꾸지 않는다", () => {
    expect(rolledSelectedMonth({ previousDefault: "2026-11", nextDefault: "2026-11", selectedMonth: "2026-11", urlHasMonth: false })).toBe("2026-11")
  })

  it("3/31 → 4/1 에는 새 회계연도의 4월로 — 화면 회계연도도 따라 넘어간다", () => {
    const next = rolledSelectedMonth({ previousDefault: "2027-03", nextDefault: "2027-04", selectedMonth: "2027-03", urlHasMonth: false })
    expect(next).toBe("2027-04")
    expect(ledgerViewFiscalYear(next, "2027-04-01")).toBe(2027)
  })
})

describe("rolledDraftForm — 손대지 않은 레일 폼의 달도 옮긴다(F-11)", () => {
  const blank = { month: "2026-11", fromMonth: "2026-11", customer: "", amount: "", quantity: "", weekly: ["", "", "", "", ""] }

  it("빈 폼이 예전 기본 달이면 새 달로(기간 이동 시작 달도)", () => {
    expect(isUntouchedDraftForm(blank)).toBe(true)
    expect(rolledDraftForm(blank, "2026-11", "2026-12", false)).toEqual({ ...blank, month: "2026-12", fromMonth: "2026-12" })
  })

  it("고객 · 금액 · 주차 칸 중 하나라도 손댔으면 같은 객체 그대로", () => {
    for (const touched of [
      { ...blank, customer: "예시학원" },
      { ...blank, amount: "30000" },
      { ...blank, quantity: "2" },
      { ...blank, weekly: ["", "10000", "", "", ""] },
    ]) {
      expect(isUntouchedDraftForm(touched)).toBe(false)
      expect(rolledDraftForm(touched, "2026-11", "2026-12", false)).toBe(touched)
    }
  })

  it("초안을 고치는 중이면 그대로", () => {
    expect(rolledDraftForm(blank, "2026-11", "2026-12", true)).toBe(blank)
  })

  it("다른 달을 고른 빈 폼은 그대로(바꿀 게 없으면 같은 객체)", () => {
    const other = { ...blank, month: "2026-10", fromMonth: "2026-10" }
    expect(rolledDraftForm(other, "2026-11", "2026-12", false)).toBe(other)
  })
})

describe("주차 검수의 기본 펼침 달", () => {
  it("이번 달 · 다음 달(연도 경계를 넘는다)", () => {
    expect(Array.from(defaultExpandedRevMonths("2026-12"))).toEqual(["2026-12", "2027-01"])
    expect(shiftYm("2027-03", 1)).toBe("2027-04")
    expect(shiftYm("2026-04", -1)).toBe("2026-03")
  })

  it("손대지 않았으면 새 이번 달 · 다음 달로, 손댔으면 같은 Set 그대로", () => {
    const untouched = defaultExpandedRevMonths("2026-11")
    expect(Array.from(rolledExpandedRevMonths(untouched, "2026-11", "2026-12"))).toEqual(["2026-12", "2027-01"])
    const touched = new Set(["2026-11", "2026-12", "2026-10"])
    expect(rolledExpandedRevMonths(touched, "2026-11", "2026-12")).toBe(touched)
    expect(rolledExpandedRevMonths(untouched, "2026-11", "2026-11")).toBe(untouched)
  })
})

describe("ledgerPipelineUrl — 시드 키와 화면 요청이 같은 URL(F-45)", () => {
  it("기본 조합(ALL · Q) + 담당 + 회계연도 — 페이지 시드와 워크벤치 첫 요청이 문자 그대로 같다", () => {
    const seed = ledgerPipelineUrl({ team: "ALL", period: "Q", manager: "예시 담당", fy: 2026 })
    const client = ledgerPipelineUrl({ team: "ALL", period: "Q", month: "2026-11", manager: "예시 담당", fy: 2026 })
    expect(seed).toBe("/api/admin/branch/pipeline?team=ALL&period=Q&manager=%EC%98%88%EC%8B%9C%20%EB%8B%B4%EB%8B%B9&fy=2026")
    expect(client).toBe(seed)
  })

  it("회계연도가 다르면 다른 키 — 4/1 경계에서 지난 회계연도 시드를 받아 쓰지 않는다", () => {
    expect(ledgerPipelineUrl({ team: "ALL", period: "Q", manager: "A", fy: 2026 })).not.toBe(
      ledgerPipelineUrl({ team: "ALL", period: "Q", manager: "A", fy: 2027 }),
    )
  })

  it("월(M) 보기에서만 month 를, 담당 1명일 때만 manager 를 싣는다", () => {
    expect(ledgerPipelineUrl({ team: "BD", period: "M", month: "2026-12", manager: "", fy: 2026 })).toBe(
      "/api/admin/branch/pipeline?team=BD&period=M&month=2026-12&fy=2026",
    )
    expect(ledgerPipelineUrl({ team: "ALL", period: "Y", month: "2026-12", manager: null, fy: 2026 })).toBe(
      "/api/admin/branch/pipeline?team=ALL&period=Y&fy=2026",
    )
  })
})
