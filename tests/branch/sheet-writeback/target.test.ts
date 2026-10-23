import { describe, expect, it } from "vitest"

import { ledgerCellStart } from "@/lib/branch/parsers/rev"
import type { WeekColor } from "@/lib/branch/sheet-writeback/colors"
import { SHEET_WRITE_MESSAGES } from "@/lib/branch/sheet-writeback/messages"
import {
  currentWeekStart,
  planWeekWrites,
  sheetWriteHint,
  weekStartOf,
  type PlanWeekWritesInput,
} from "@/lib/branch/sheet-writeback/target"

type W = { value: number; color: WeekColor }
const k = (value = 0): W => ({ value, color: "k" })
const r = (value: number): W => ({ value, color: "r" })
const b = (value: number): W => ({ value, color: "b" })

function input(partial: Partial<PlanWeekWritesInput>): PlanWeekWritesInput {
  return {
    month: "2026-11",
    baselineWeeks: [k(), k(), k(), k(), k()],
    draftAmount: 100,
    draftWeekly: null,
    draftConfidence: "expected",
    draftWeeklyConfidence: null,
    confidenceTouched: false,
    firstPayment: null,
    today: "2026-10-23",
    ...partial,
  }
}

describe("주차 시작일", () => {
  it("currentWeekStart: 오늘이 든 칸의 시작일(1·8·15·22·29)", () => {
    expect(currentWeekStart("2026-10-01")).toBe("2026-10-01")
    expect(currentWeekStart("2026-10-07")).toBe("2026-10-01")
    expect(currentWeekStart("2026-10-08")).toBe("2026-10-08")
    expect(currentWeekStart("2026-10-21")).toBe("2026-10-15")
    expect(currentWeekStart("2026-10-22")).toBe("2026-10-22")
    expect(currentWeekStart("2026-10-28")).toBe("2026-10-22")
    expect(currentWeekStart("2026-10-29")).toBe("2026-10-29")
    expect(currentWeekStart("2026-10-31")).toBe("2026-10-29")
  })

  it("weekStartOf 는 parsers/rev.ts ledgerCellStart 와 같은 규칙(0-based ↔ 1-based)", () => {
    for (let index = 0; index < 5; index += 1) {
      expect(weekStartOf("2026-10", index)).toBe(ledgerCellStart("2026-10", index + 1))
    }
  })
})

describe("planWeekWrites — 월 칸(weekly 없음)", () => {
  it("값 있는 주차 1칸 → 그 칸에 금액, 확도 안 고르면 색 그대로", () => {
    const result = planWeekWrites(input({ baselineWeeks: [k(), r(300), k(), k(), k()], draftAmount: 500 }))
    expect(result).toEqual({ ok: true, writes: [{ weekIndex: 1, value: 500, color: null }], note: "시트 W2에 씁니다" })
  })

  it("값 있는 주차 1칸 + 확도 고름 → 금액과 그 색", () => {
    const result = planWeekWrites(input({ baselineWeeks: [k(), r(300), k(), k(), k()], draftAmount: 500, draftConfidence: "high-confidence", confidenceTouched: true }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 1, value: 500, color: "b" }] })
  })

  it("빈 달 → 첫 결제일이 그 달이면 그 주차, 색은 늘 명시", () => {
    const result = planWeekWrites(input({ firstPayment: "2026-11-17", draftConfidence: "confirmed" }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 2, value: 100, color: "r" }] })
  })

  it("빈 달 → 첫 결제일이 다른 달이고 그 달이 이번 달이면 오늘 주차", () => {
    const result = planWeekWrites(input({ month: "2026-10", firstPayment: "2026-03-02" }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 3, value: 100, color: "k" }] })
  })

  it("빈 달 → 그 밖에는 w1", () => {
    expect(planWeekWrites(input({ month: "2026-12" }))).toMatchObject({ ok: true, writes: [{ weekIndex: 0 }] })
  })

  it("빈 달 4칸(2월) → 29일·w5 는 마지막 칸(w4)으로 자른다", () => {
    const feb = { month: "2027-02", baselineWeeks: [k(), k(), k(), k()] }
    expect(planWeekWrites(input({ ...feb, firstPayment: "2027-02-29" }))).toMatchObject({ ok: true, writes: [{ weekIndex: 3 }] })
    // 윤년 2월 29일이 "오늘"이어도 w4(22일 시작) 는 이번 주차 칸이다.
    const leap = planWeekWrites(input({ month: "2028-02", baselineWeeks: [k(), k(), k(), k()], today: "2028-02-29" }))
    expect(leap).toMatchObject({ ok: true, writes: [{ weekIndex: 3 }] })
  })

  it("값 있는 주차 2칸 이상 + 금액 변경 → week_ambiguous", () => {
    expect(planWeekWrites(input({ baselineWeeks: [k(), r(100), b(200), k(), k()], draftAmount: 500 }))).toEqual({ ok: false, refusal: "week_ambiguous" })
  })

  it("금액 그대로 + 확도 고름 → 값 있는 칸 전부 색만(이미 그 색인 칸은 건너뜀)", () => {
    const result = planWeekWrites(input({ baselineWeeks: [k(), r(100), b(200), k(), r(50)], draftAmount: 350, draftConfidence: "confirmed", confidenceTouched: true }))
    expect(result).toEqual({ ok: true, writes: [{ weekIndex: 2, value: null, color: "r" }], note: "값 있는 주차 1칸의 색을 바꿉니다" })
  })

  it("금액 그대로 + 확도 안 고름 → 할 일 없음(ok, writes [])", () => {
    expect(planWeekWrites(input({ baselineWeeks: [k(), r(100), k(), k(), k()], draftAmount: 100 }))).toMatchObject({ ok: true, writes: [] })
  })

  it.each([0, -5, 10.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])("금액 %s → amount_invalid(달 삭제·소수 불가)", (amount) => {
    expect(planWeekWrites(input({ baselineWeeks: [k(), r(100), k(), k(), k()], draftAmount: amount }))).toEqual({ ok: false, refusal: "amount_invalid" })
  })

  it("baseline 칸이 없으면 month_not_in_sheet", () => {
    expect(planWeekWrites(input({ baselineWeeks: [] }))).toEqual({ ok: false, refusal: "month_not_in_sheet" })
  })
})

describe("planWeekWrites — 주차 칸을 가리킨 초안(metadata.week, weekly 없음)", () => {
  it("빈 달 → 첫 결제일·오늘 주차보다 고른 주차가 먼저(장부와 같은 칸)", () => {
    const picked = planWeekWrites(input({ firstPayment: "2026-11-17", draftWeek: 4, draftConfidence: "confirmed" }))
    expect(picked).toEqual({ ok: true, writes: [{ weekIndex: 4, value: 100, color: "r" }], note: "시트 W5에 씁니다" })
    // 고른 주차가 없으면(월 칸) 지금처럼 첫 결제일 주차.
    expect(planWeekWrites(input({ firstPayment: "2026-11-17", draftWeek: null }))).toMatchObject({ ok: true, writes: [{ weekIndex: 2 }] })
  })

  it("4칸 달(2월)에 w5 를 고르면 마지막 칸(w4)", () => {
    const feb = planWeekWrites(input({ month: "2027-02", baselineWeeks: [k(), k(), k(), k()], draftWeek: 4 }))
    expect(feb).toMatchObject({ ok: true, writes: [{ weekIndex: 3 }] })
  })

  it("값 있는 칸이 같은 주차 1칸이면 그 칸, 다른 주차 1칸이면 clear_not_supported(원래 칸을 비워야 한다)", () => {
    expect(planWeekWrites(input({ baselineWeeks: [k(), r(300), k(), k(), k()], draftAmount: 500, draftWeek: 1 })))
      .toMatchObject({ ok: true, writes: [{ weekIndex: 1, value: 500 }] })
    expect(planWeekWrites(input({ baselineWeeks: [k(), r(300), k(), k(), k()], draftAmount: 500, draftWeek: 3 })))
      .toEqual({ ok: false, refusal: "clear_not_supported" })
  })

  it("고른 주차가 지난 주차면 past_week", () => {
    expect(planWeekWrites(input({ month: "2026-10", draftWeek: 1 }))).toEqual({ ok: false, refusal: "past_week" })
  })

  it.each([5, -1, 1.5, Number.NaN])("주차 %s 는 무시한다(월 칸 규칙)", (draftWeek) => {
    expect(planWeekWrites(input({ month: "2026-12", draftWeek }))).toMatchObject({ ok: true, writes: [{ weekIndex: 0 }] })
  })

  it("weekly 가 있으면 고른 주차는 보지 않는다", () => {
    const result = planWeekWrites(input({ draftWeekly: [0, 0, 100, 0, 0], draftAmount: 100, draftWeek: 4 }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 2, value: 100 }] })
  })
})

describe("planWeekWrites — 주차 단위(weekly 있음)", () => {
  it("바뀐 칸만 값을 쓰고, 빈 칸에 새로 쓰면 초안 확도 색", () => {
    const result = planWeekWrites(input({
      baselineWeeks: [r(100), k(), k(), k(), k()],
      draftWeekly: [100, 0, 0, 0, 200],
      draftConfidence: "high-confidence",
    }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 4, value: 200, color: "b" }] })
  })

  it("확도를 고르면 weeklyConfidence 의 그 칸 색", () => {
    const result = planWeekWrites(input({
      baselineWeeks: [r(100), b(50), k(), k(), k()],
      draftWeekly: [100, 80, 0, 0, 0],
      draftWeeklyConfidence: [null, "confirmed", null, null, null],
      confidenceTouched: true,
    }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 1, value: 80, color: "r" }] })
  })

  it("확도 안 고르면 값만 바꾸고 색 그대로", () => {
    const result = planWeekWrites(input({
      baselineWeeks: [r(100), b(50), k(), k(), k()],
      draftWeekly: [100, 80, 0, 0, 0],
      draftWeeklyConfidence: [null, "confirmed", null, null, null],
    }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 1, value: 80, color: null }] })
  })

  it("값 있는 칸을 0으로 → clear_not_supported", () => {
    expect(planWeekWrites(input({ baselineWeeks: [r(100), b(50), k(), k(), k()], draftWeekly: [100, 0, 0, 0, 0] }))).toEqual({ ok: false, refusal: "clear_not_supported" })
  })

  it("주차 값이 음수·소수면 amount_invalid", () => {
    expect(planWeekWrites(input({ draftWeekly: [10.5, 0, 0, 0, 0] }))).toEqual({ ok: false, refusal: "amount_invalid" })
    expect(planWeekWrites(input({ draftWeekly: [-1, 2, 0, 0, 0] }))).toEqual({ ok: false, refusal: "amount_invalid" })
  })

  it("4칸 달에 w5 값이 오면 마지막 칸으로 합친다", () => {
    const result = planWeekWrites(input({ month: "2027-02", baselineWeeks: [k(), k(), k(), r(30)], draftWeekly: [0, 0, 0, 30, 20] }))
    expect(result).toMatchObject({ ok: true, writes: [{ weekIndex: 3, value: 50, color: null }] })
  })
})

describe("planWeekWrites — past_week 경계(오늘 KST 기준)", () => {
  const oct = (index: number, today: string) =>
    planWeekWrites(input({
      month: "2026-10",
      baselineWeeks: [k(), k(), k(), k(), k()],
      draftWeekly: [0, 0, 0, 0, 0].map((_, i) => (i === index ? 100 : 0)),
      today,
    }))

  it("이번 주차 시작일 당일은 그 칸 허용, 그 전 칸은 거절", () => {
    expect(oct(3, "2026-10-22")).toMatchObject({ ok: true })
    expect(oct(2, "2026-10-22")).toEqual({ ok: false, refusal: "past_week" })
  })

  it("이번 주차 시작일 전날(10-21)엔 w3(15일) 이 이번 주차라 허용, w2 는 거절", () => {
    expect(oct(2, "2026-10-21")).toMatchObject({ ok: true })
    expect(oct(1, "2026-10-21")).toEqual({ ok: false, refusal: "past_week" })
  })

  it("미래 주차·다음 달은 허용, 지난 달 전체는 거절", () => {
    expect(oct(4, "2026-10-23")).toMatchObject({ ok: true })
    expect(planWeekWrites(input({ month: "2026-09", baselineWeeks: [k(), k(), k(), k(), k()], draftAmount: 10 }))).toEqual({ ok: false, refusal: "past_week" })
    expect(oct(4, "2026-11-01")).toEqual({ ok: false, refusal: "past_week" })
  })

  it("한 칸이라도 지난 주차면 전부 거절(색만 바꾸는 경우 포함)", () => {
    const result = planWeekWrites(input({
      month: "2026-10",
      baselineWeeks: [b(100), k(), k(), b(50), k()],
      draftAmount: 150,
      draftConfidence: "confirmed",
      confidenceTouched: true,
    }))
    expect(result).toEqual({ ok: false, refusal: "past_week" })
  })
})

describe("sheetWriteHint", () => {
  it("거절이면 block + 고정 문구, 아니면 info + 쓸 칸", () => {
    expect(sheetWriteHint(input({ month: "2026-09", draftAmount: 10 }))).toEqual({ tone: "block", text: SHEET_WRITE_MESSAGES.past_week })
    expect(sheetWriteHint(input({ firstPayment: "2026-11-09" }))).toEqual({ tone: "info", text: "시트 W2에 씁니다" })
    expect(sheetWriteHint(input({ baselineWeeks: [r(100), k(), k(), k(), k()], draftAmount: 100 })).tone).toBe("info")
  })
})
