// '2. REV' 실제 머리 모양(FY26-27 Sales Ledger)으로 월 블록 해석(resolveRevMonthBlocks)과 금액 읽기(F-28),
// 월 칸 ≠ 주차 합 표시(F-15), 예정 칸 기록(F-08), 파싱 진단, refFy 기본값(F-26)을 고정한다.
import { describe, expect, it } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import {
  parseRev,
  parseRevWithStats,
  resolveRevMonthBlocks,
  revParseWarning,
  type RevPendingCell,
} from "@/lib/branch/parsers/rev"

const RED = { red: 1, green: 0, blue: 0 }
const BLUE = { red: 0, green: 0, blue: 1 }
const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const red = (value: string | number, numberValue?: number): FormattedCell => ({ value, bg: null, fg: RED, ...(numberValue == null ? {} : { numberValue }) })
const blue = (value: number): FormattedCell => ({ value, bg: null, fg: BLUE })

const META = ["Account", "Branch", "Manager", "Location", "Scale", "Importance", "Team", "Status", "Type", "Product", "First Payment", "Remark", "Sum"]
const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
function weekHeaders(month: number): string[] {
  if (month === 2) return ["w1", "w2", "w3", "w4"]
  if (month === 7) return ["w1", "w2", "w3", "w4", "5w"]
  return ["w1", "w2", "w3", "w4", "w5"]
}
const HEADER_TEXT = [...META, ...MONTHS.flatMap((month) => [String(month), ...weekHeaders(month)]), "Row ID"]
const HEADER = HEADER_TEXT.map(plain)
const col = (label: string, month: number) => {
  const start = HEADER_TEXT.indexOf(String(month), META.length)
  return label === "total" ? start : start + Number(label.replace(/\D/g, ""))
}

function row(cells: Record<number, FormattedCell>, customer = "예시학원1"): FormattedCell[] {
  const out = HEADER_TEXT.map(() => plain(null))
  out[0] = plain(customer)
  out[2] = plain("예시A")
  out[6] = plain("BD")
  out[7] = plain("New")
  for (const [index, cell] of Object.entries(cells)) out[Number(index)] = cell
  return out
}
const grid = (...rows: FormattedCell[][]): FormattedCell[][] => [[plain("REV")], HEADER, ...rows]

describe("resolveRevMonthBlocks — 실제 머리 모양", () => {
  it("열두 달 블록, 7월 '5w' 는 다섯째 주, 2월은 네 주", () => {
    const blocks = resolveRevMonthBlocks(HEADER, 2026)
    expect(blocks.map((block) => block.ym)).toEqual([
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ])
    expect(blocks[0]).toEqual({ ym: "2026-04", totalIdx: 13, weekIdxs: [14, 15, 16, 17, 18] })
    const july = blocks.find((block) => block.ym === "2026-07")!
    expect(july.weekIdxs).toHaveLength(5)
    expect(HEADER_TEXT[july.weekIdxs[4]]).toBe("5w")
    expect(blocks.find((block) => block.ym === "2027-02")!.weekIdxs).toHaveLength(4)
    // "Row ID" 는 월·주차 머리가 아니라 마지막 3월 블록에 섞이지 않는다.
    expect(blocks.at(-1)!.weekIdxs).toHaveLength(5)
  })

  it("refFy 가 해를 정한다 — '4'~'12' 는 refFy, '1'~'3' 은 refFy+1", () => {
    const blocks = resolveRevMonthBlocks(HEADER, 2027)
    expect(blocks[0].ym).toBe("2027-04")
    expect(blocks.at(-1)!.ym).toBe("2028-03")
  })

  it("parseRev 는 같은 블록으로 읽는다(리팩터 전후 동일) — 7월 5w 금액이 7월로 간다", () => {
    const [deal] = parseRev(grid(row({ [col("total", 7)]: plain(500), [col("w5", 7)]: red(500) })), { refFy: 2026, today: "2026-11-25" })
    expect(deal.monthly_payments["2026-07"]).toBe(500)
    expect(deal.weekly_payments["2026-07"]).toEqual([0, 0, 0, 0, 500])
    expect(deal.monthly_confirmed["2026-07"]).toBe(500)
    expect(deal.manager).toBe("예시A")
    expect(deal.contract_target).toBeNull() // Sum 열은 계약 목표가 아니다
  })
})

describe("금액 읽기 — 실제 숫자 먼저, 회계 괄호·U+2212·통화 접두(F-28)", () => {
  it("numberValue 가 있으면 표시가 '(1,750)' 이어도 −1750 — 환불 주가 그 달을 지우지 않는다", () => {
    const [deal] = parseRev(grid(row({
      [col("total", 10)]: { value: "(1,250)", bg: null, numberValue: -1250 },
      [col("w1", 10)]: red("500", 500),
      [col("w2", 10)]: red("(1,750)", -1750),
    })), { refFy: 2026, today: "2026-11-25" })
    expect(deal.monthly_payments["2026-10"]).toBe(-1250)
    expect(deal.weekly_payments["2026-10"]).toEqual([500, -1750, 0, 0, 0])
    expect(deal.monthly_confirmed["2026-10"]).toBe(-1250)
    expect(deal.raw.monthWeekMismatch).toBeUndefined()
  })

  it("숫자가 없을 때 표시 글자의 괄호·U+2212·￥·CN¥·RMB 를 읽는다", () => {
    const [deal] = parseRev(grid(row({
      [col("w1", 9)]: red("¥(1,750)"),
      [col("w2", 9)]: red("−250"),
      [col("w3", 9)]: red("￥1,000"),
      [col("w4", 9)]: red("CN¥2,000"),
      [col("w5", 9)]: red("RMB 1,000"),
    })), { refFy: 2026, today: "2026-11-25" })
    expect(deal.weekly_payments["2026-09"]).toEqual([-1750, -250, 1000, 2000, 1000])
    expect(deal.monthly_payments["2026-09"]).toBe(2000)
  })

  it("못 읽은 금액 칸을 센다 — 빈 칸·'-' 는 세지 않는다", () => {
    const { deals, stats } = parseRevWithStats(grid(
      row({ [col("w1", 11)]: plain("#REF!"), [col("w2", 11)]: plain("-"), [col("total", 12)]: plain("확인 필요") }),
      row({ [col("w1", 4)]: plain("100") }, "예시학원2"),
      row({ [col("w1", 5)]: plain("??") }, ""), // 고객명 빈 행은 읽지 않으므로 세지 않는다
    ), { refFy: 2026, today: "2026-11-25" })
    expect(deals).toHaveLength(2)
    expect(stats.unparsedAmountCells).toBe(2)
    expect(stats.unparsedSamples.map((sample) => sample.text)).toEqual(["#REF!", "확인 필요"])
    expect(stats.unparsedSamples[0].row).toBe(3)
    expect(revParseWarning(stats)).toBe("REV 금액으로 못 읽은 칸 2개(3행 '#REF!', 3행 '확인 필요')")
    expect(revParseWarning({ unparsedAmountCells: 0, unparsedSamples: [], monthWeekMismatches: 0 })).toBeUndefined()
  })
})

describe("월 칸 ≠ 주차 합 표시(F-15)", () => {
  it("월 칸에 0 을 적고 주차에 빨간 금액이 있으면 표시한다", () => {
    const { deals, stats } = parseRevWithStats(grid(row({ [col("total", 10)]: plain(0), [col("w1", 10)]: red(500) })), { refFy: 2026, today: "2026-11-25" })
    const [deal] = deals
    expect(deal.monthly_payments["2026-10"]).toBe(0)
    expect(deal.raw.monthWeekMismatch).toEqual({ "2026-10": { month: 0, weeks: 500 } })
    expect(stats.monthWeekMismatches).toBe(1)
    expect(revParseWarning(stats)).toBe("REV 월 칸과 주차 합이 다른 달 1개")
  })

  it("진짜 상계(+100 빨강 · −100 검정 → 월 0)와 월 칸 없는 행은 표시하지 않는다", () => {
    const [offset] = parseRev(grid(row({ [col("total", 10)]: plain(0), [col("w1", 10)]: red(100), [col("w2", 10)]: plain(-100) })), { refFy: 2026, today: "2026-11-25" })
    expect(offset.raw.monthWeekMismatch).toBeUndefined()
    const [weeksOnly] = parseRev(grid(row({ [col("w1", 10)]: red(100), [col("w2", 10)]: blue(50) })), { refFy: 2026, today: "2026-11-25" })
    expect(weeksOnly.monthly_payments["2026-10"]).toBe(150)
    expect(weeksOnly.raw.monthWeekMismatch).toBeUndefined()
  })
})

describe("예정 칸 기록(F-08) — 읽는 시점 판정 재료", () => {
  it("시작 안 한 빨간 주차를 주차·시작일·금액으로 남긴다(기존 monthlyPending·pendingWeeks 도 그대로)", () => {
    const [deal] = parseRev(grid(row({ [col("w1", 12)]: red(100), [col("w2", 12)]: red(200), [col("w4", 12)]: red(400) })), {
      refFy: 2026,
      today: "2026-11-30",
    })
    const cells = (deal.raw.pendingCells as Record<string, RevPendingCell[]>)["2026-12"]
    expect(cells).toEqual([
      { week: 1, start: "2026-12-01", amount: 100 },
      { week: 2, start: "2026-12-08", amount: 200 },
      { week: 4, start: "2026-12-22", amount: 400 },
    ])
    expect(deal.monthly_confirmed["2026-12"]).toBe(0)
    expect((deal.raw.monthlyPending as Record<string, number>)["2026-12"]).toBe(700)
    expect((deal.raw.pendingWeeks as Record<string, number[]>)["2026-12"]).toEqual([1, 2, 4])
  })

  it("월 칸만 빨간 행은 week 0 · 그 달 1일", () => {
    const [deal] = parseRev(grid(row({ [col("total", 1)]: red(9000) })), { refFy: 2026, today: "2026-11-30" })
    expect((deal.raw.pendingCells as Record<string, RevPendingCell[]>)["2027-01"]).toEqual([{ week: 0, start: "2027-01-01", amount: 9000 }])
  })

  it("예정 칸이 없으면 pendingCells 키를 싣지 않는다", () => {
    const [deal] = parseRev(grid(row({ [col("w1", 4)]: red(100) })), { refFy: 2026, today: "2026-11-30" })
    expect("pendingCells" in deal.raw).toBe(false)
    expect(deal.raw.monthlyPending).toEqual({})
  })
})

describe("refFy 기본값(F-26) — 파싱 기준일(KST)의 회계연도", () => {
  const sheet = grid(row({ [col("total", 3)]: plain(100) }))
  it("today 가 2027-03-31 이면 '3' 은 2027-03, 2027-04-01 이면 2028-03", () => {
    expect(Object.keys(parseRev(sheet, { today: "2027-03-31" })[0].monthly_payments)).toEqual(["2027-03"])
    expect(Object.keys(parseRev(sheet, { today: "2027-04-01" })[0].monthly_payments)).toEqual(["2028-03"])
  })
  it("refFy 를 넘기면 그 값이 이긴다(잠금 스냅샷 다시 읽기)", () => {
    expect(Object.keys(parseRev(sheet, { refFy: 2026, today: "2027-04-02" })[0].monthly_payments)).toEqual(["2027-03"])
  })
  it("1~3월에도 달력 연도로 한 해 밀리지 않는다(예전 기본값 getUTCFullYear 의 결함)", () => {
    expect(Object.keys(parseRev(sheet, { today: "2027-01-15" })[0].monthly_payments)).toEqual(["2027-03"])
  })
})
