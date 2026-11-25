// 확도는 읽는 시점(KST 영업일)에 판정한다(F-08·F-09 결정, 2026-11-25). 12/1 에 시트를 얼리고 REV 동기화를 멈춰도
//  ① 빨간 금액의 주가 시작되면 그날부터 확정이고(다시 파싱하지 않아도),
//  ② 색 없는 행은 이번 KST 영업월 이전 달만 확정이다(UTC 9시가 아니라 KST 자정에 바뀐다).
// 월 칸 ≠ 주차 합으로 표시된 달은 확정·고확도를 월 합계 안으로 자른다(F-15).
import { afterEach, describe, expect, it, vi } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { parseRev } from "@/lib/branch/parsers/rev"
import {
  confirmedMonthAmountWithColor,
  dealHasColorData,
  resolveRevReadDate,
  revReadTimeFields,
  splitMonthConfidence,
  type RevConfidenceSource,
} from "@/lib/branch/computations/rev-confirmed"
import { ledgerMonthSplit, toRevConfidenceSource } from "@/lib/branch/computations/revenue-core"

const RED = { red: 1, green: 0, blue: 0 }
const BLUE = { red: 0, green: 0, blue: 1 }
const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const red = (value: number): FormattedCell => ({ value, bg: null, fg: RED })
const blue = (value: number): FormattedCell => ({ value, bg: null, fg: BLUE })

// 메타 13열 + 11월(13)·w1~w5(14~18) + 12월(19)·w1~w5(20~24)
const HEADER = [
  ...["Account", "Branch", "Manager", "Location", "Scale", "Importance", "Team", "Status", "Type", "Product", "First Payment", "Remark", "Sum"].map(plain),
  plain("11"), plain("w1"), plain("w2"), plain("w3"), plain("w4"), plain("w5"),
  plain("12"), plain("w1"), plain("w2"), plain("w3"), plain("w4"), plain("w5"),
]
function sheetRow(customer: string, nov: FormattedCell[], dec: FormattedCell[], novTotal = plain(null), decTotal = plain(null)): FormattedCell[] {
  const meta = [customer, null, "예시A", null, null, null, "BD", "New", null, null, null, null, null].map(plain)
  const pad = (cells: FormattedCell[]) => [...cells, ...Array.from({ length: 5 - cells.length }, () => plain(null))]
  return [...meta, novTotal, ...pad(nov), decTotal, ...pad(dec)]
}
// 예시학원1: 12월 빨간 w1 100 · w2 200 · w3 400(12/1·12/8·12/15 시작) / 예시학원2: 색 없음 11월 50 · 12월 60
const GRID: FormattedCell[][] = [
  [plain("REV")],
  HEADER,
  sheetRow("예시학원1", [], [red(100), red(200), red(400)]),
  sheetRow("예시학원2", [plain(50)], [plain(60)]),
]
const parsedOn = (today: string) => parseRev(GRID, { refFy: 2026, today })
const split = (deal: RevConfidenceSource & { monthly_payments: Record<string, number> }, month: string, today?: string) =>
  splitMonthConfidence(deal, month, deal.monthly_payments[month] ?? 0, dealHasColorData(deal), today)

afterEach(() => {
  vi.useRealTimers()
})

describe("① 빨간 예정 칸은 시작일(KST)부터 확정 — 다시 파싱하지 않아도", () => {
  it("11/30 에 파싱한 스냅샷을 12/8 에 읽으면 12월 w1·w2 는 확정, w3 은 예정", () => {
    const [red] = parsedOn("2026-11-30")
    expect(split(red, "2026-12", "2026-11-30")).toEqual({ confirmed: 0, highConfidence: 0, expected: 700 })
    expect(split(red, "2026-12", "2026-12-08")).toEqual({ confirmed: 300, highConfidence: 0, expected: 400 })
    expect(split(red, "2026-12", "2026-12-15")).toEqual({ confirmed: 700, highConfidence: 0, expected: 0 })
  })

  it("파싱 날짜와 무관하다 — 12/8 에 다시 파싱해 12/8 에 읽어도 같은 값", () => {
    const [early] = parsedOn("2026-11-30")
    const [late] = parsedOn("2026-12-08")
    for (const at of ["2026-12-08", "2026-12-14", "2026-12-15", "2027-01-05"]) {
      expect(split(early, "2026-12", at)).toEqual(split(late, "2026-12", at))
    }
  })

  it("2026-11-30T15:00Z(12/1 00:00 KST) 경계 — 기본값(지금)도 KST 영업일이다", () => {
    const [red] = parsedOn("2026-11-30")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-30T14:59:59Z"))
    expect(split(red, "2026-12").confirmed).toBe(0)
    vi.setSystemTime(new Date("2026-11-30T15:00:00Z"))
    expect(split(red, "2026-12").confirmed).toBe(100)
  })

  it("확정 맵에서 그 달 키가 지워진 행(장부 정정이 달을 갈아 끼운 행)의 예정 칸은 올리지 않는다", () => {
    const [red] = parsedOn("2026-11-30")
    const corrected = { ...red, monthly_confirmed: {}, monthly_payments: { "2026-12": 0 } }
    expect(confirmedMonthAmountWithColor(corrected, "2026-12", 0, true, "2026-12-20")).toBe(0)
  })

  it("raw 가 없는 경로(옛 행·raw 를 안 읽은 미러)는 예전 규칙 그대로 — 예정으로 남는다", () => {
    const [red] = parsedOn("2026-11-30")
    const withoutRaw = { ...red, raw: undefined }
    expect(split(withoutRaw, "2026-12", "2026-12-20")).toEqual({ confirmed: 0, highConfidence: 0, expected: 700 })
  })
})

describe("② 색 없는 행 — 이번 KST 영업월 이전 달만 확정(읽는 시점)", () => {
  it("11/30 23:59 KST 에는 11월도 예정, 12/1 00:00 KST(15:00Z)부터 11월 확정 · 12월 예정", () => {
    const [, plainRow] = parsedOn("2026-11-30")
    expect(dealHasColorData(plainRow)).toBe(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-30T14:59:59Z"))
    expect(split(plainRow, "2026-11").confirmed).toBe(0)
    vi.setSystemTime(new Date("2026-11-30T15:00:00Z"))
    expect(split(plainRow, "2026-11").confirmed).toBe(50)
    expect(split(plainRow, "2026-12").confirmed).toBe(0)
  })

  it("12월 캡처를 1월에 읽으면 12월이 확정이다(캡처한 달이 굳지 않는다)", () => {
    const [, plainRow] = parsedOn("2026-12-20")
    expect(split(plainRow, "2026-12", "2026-12-20")).toEqual({ confirmed: 0, highConfidence: 0, expected: 60 })
    expect(split(plainRow, "2026-12", "2027-01-05")).toEqual({ confirmed: 60, highConfidence: 0, expected: 0 })
  })
})

describe("월 칸 ≠ 주차 합(F-15) — 확정·고확도를 월 합계 안으로", () => {
  const mismatch = (month: number, weeks: number) => ({ monthWeekMismatch: { "2026-10": { month, weeks } } })

  it("월 칸 0 · 주차 빨강 500 → 확정 0 · 예정 0(음수 예정 없음)", () => {
    const deal = { monthly_confirmed: { "2026-10": 500 }, monthly_red: { "2026-10": true }, raw: mismatch(0, 500) }
    expect(splitMonthConfidence(deal, "2026-10", 0, true, "2026-11-25")).toEqual({ confirmed: 0, highConfidence: 0, expected: 0 })
  })

  it("월 칸 300 · 주차 빨강 400 · 파랑 100 → 확정 300 · 고확도 0 · 예정 0", () => {
    const deal = { monthly_confirmed: { "2026-10": 400 }, monthly_high_conf: { "2026-10": 100 }, raw: mismatch(300, 500) }
    expect(splitMonthConfidence(deal, "2026-10", 300, true, "2026-11-25")).toEqual({ confirmed: 300, highConfidence: 0, expected: 0 })
  })

  it("월 칸 1000 · 주차 빨강 400 · 파랑 100 → 그대로(자를 것 없음) · 예정 500", () => {
    const deal = { monthly_confirmed: { "2026-10": 400 }, monthly_high_conf: { "2026-10": 100 }, raw: mismatch(1000, 500) }
    expect(splitMonthConfidence(deal, "2026-10", 1000, true, "2026-11-25")).toEqual({ confirmed: 400, highConfidence: 100, expected: 500 })
  })

  it("음수 월 칸 −100 · 주차 빨강 +50 → 확정 0 · 예정 −100(부호는 월 합계를 따른다)", () => {
    const deal = { monthly_confirmed: { "2026-10": 50 }, raw: mismatch(-100, 50) }
    expect(splitMonthConfidence(deal, "2026-10", -100, true, "2026-11-25")).toEqual({ confirmed: 0, highConfidence: 0, expected: -100 })
  })

  it("표시가 없으면 진짜 상계의 부호 보존은 그대로(기존 ±offset 의미)", () => {
    const deal = { monthly_confirmed: { "2026-10": 100 } }
    expect(splitMonthConfidence(deal, "2026-10", 0, true, "2026-11-25")).toEqual({ confirmed: 100, highConfidence: 0, expected: -100 })
  })

  it("파서가 표시한 실제 행: 월 칸 0 · 주차 빨강 500 → 확정이 월 합계를 넘지 않는다", () => {
    const grid: FormattedCell[][] = [[plain("REV")], HEADER, sheetRow("예시학원3", [red(500), blue(50)], [], plain(0))]
    const [deal] = parseRev(grid, { refFy: 2026, today: "2026-12-05" })
    expect(split(deal, "2026-11", "2026-12-05")).toEqual({ confirmed: 0, highConfidence: 0, expected: 0 })
  })
})

describe("읽는 날 해석(resolveRevReadDate)", () => {
  it("YYYY-MM-DD 는 그날, 형식이 틀리면 지금의 KST 영업일", () => {
    expect(resolveRevReadDate("2026-12-08")).toEqual({ ym: "2026-12", date: "2026-12-08" })
    const now = new Date("2026-11-30T15:05:00Z")
    expect(resolveRevReadDate(undefined, now)).toEqual({ ym: "2026-12", date: "2026-12-01" })
    expect(resolveRevReadDate("garbage", now)).toEqual({ ym: "2026-12", date: "2026-12-01" })
  })

  it("YYYY-MM 은 이번 영업월이면 오늘, 아니면 그 달 1일(미래를 확정으로 올리지 않는다)", () => {
    const now = new Date("2026-12-10T03:00:00Z")
    expect(resolveRevReadDate("2026-12", now)).toEqual({ ym: "2026-12", date: "2026-12-10" })
    expect(resolveRevReadDate("2026-11", now)).toEqual({ ym: "2026-11", date: "2026-11-01" })
    expect(resolveRevReadDate("2027-01", now)).toEqual({ ym: "2027-01", date: "2027-01-01" })
  })
})

describe("클라이언트 행(camelCase)도 같은 재료로 같은 함수", () => {
  it("파이프라인 행의 pendingCells 를 캐논에 넘긴다 — 서버 deal 과 같은 값", () => {
    const [deal] = parsedOn("2026-11-30")
    const row = {
      ledgerOrigin: "sheet" as const,
      monthlyConfirmed: deal.monthly_confirmed,
      monthlyHighConfidence: deal.monthly_high_conf,
      monthlyRed: deal.monthly_red,
      ...revReadTimeFields(deal.raw),
    }
    expect(row.pendingCells?.["2026-12"]).toHaveLength(3)
    for (const at of ["2026-11-30", "2026-12-08", "2026-12-15"]) {
      expect(ledgerMonthSplit(row, "2026-12", 700, at)).toEqual(split(deal, "2026-12", at))
    }
  })

  it("초안 행은 시트 재료를 싣지 않는다(확도 맵이 정본)", () => {
    const [deal] = parsedOn("2026-11-30")
    const source = toRevConfidenceSource({ ledgerOrigin: "draft", ...revReadTimeFields(deal.raw) })
    expect(source.raw).toBeUndefined()
  })

  it("revReadTimeFields 는 형식이 틀린 칸을 버리고, 없으면 키를 싣지 않는다", () => {
    expect(revReadTimeFields(null)).toEqual({})
    expect(revReadTimeFields({ pendingCells: { "2026-12": [{ week: 1, start: "12/1", amount: 5 }] } })).toEqual({})
    expect(revReadTimeFields({ pendingCells: { "2026-12": [{ week: 1, start: "2026-12-01", amount: 5 }, "x"] } })).toEqual({
      pendingCells: { "2026-12": [{ week: 1, start: "2026-12-01", amount: 5 }] },
    })
    expect(revReadTimeFields({ monthWeekMismatch: { "2026-10": { month: 0, weeks: 5 }, bad: { month: 1, weeks: 2 } } })).toEqual({
      monthWeekMismatch: { "2026-10": { month: 0, weeks: 5 } },
    })
  })
})
