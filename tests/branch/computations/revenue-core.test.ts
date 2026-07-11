import { describe, it, expect } from "vitest"
import {
  ledgerMonthConfirmed,
  ledgerMonthSplit,
  ledgerRowHasColor,
  toRevConfidenceSource,
  type LedgerConfidenceSource,
} from "@/lib/branch/computations/revenue-core"
import {
  confirmedMonthAmountWithColor,
  dealHasColorData,
  splitMonthConfidence,
} from "@/lib/branch/computations/rev-confirmed"

// revenue-core는 클라이언트 행(camelCase)의 확정/확도 계산을 rev-confirmed 캐논에
// 위임하는 어댑터다(마스터플랜 C2). 여기서는 (1) 시트행 = 캐논과 바이트 동일,
// (2) 초안행 = 무색상 폴백 차단(예정 입력 인플레 방지), (3) 오버라이드 파생 행의
// confidenceColorHint 보존 — 세 규약을 회귀 고정한다.

const TODAY = "2026-07"

function sheetRow(partial: Partial<LedgerConfidenceSource> = {}): LedgerConfidenceSource {
  return { ledgerOrigin: "sheet", ...partial }
}

function draftRow(partial: Partial<LedgerConfidenceSource> = {}): LedgerConfidenceSource {
  return { ledgerOrigin: "draft", ...partial }
}

describe("ledgerMonthConfirmed — 시트행 캐논 패리티", () => {
  const cases: Array<{ name: string; row: LedgerConfidenceSource; month: string; total: number }> = [
    {
      name: "확정 맵 클램프",
      row: sheetRow({ monthlyConfirmed: { "2026-05": 300 } }),
      month: "2026-05",
      total: 1000,
    },
    {
      name: "red 전액 확정",
      row: sheetRow({ monthlyRed: { "2026-05": true } }),
      month: "2026-05",
      total: 1000,
    },
    {
      name: "색 있는 행의 무표시 월",
      row: sheetRow({ monthlyConfirmed: { "2026-05": 300 } }),
      month: "2026-06",
      total: 1000,
    },
    { name: "무색상 과거 월", row: sheetRow(), month: "2026-06", total: 1000 },
    { name: "무색상 당월", row: sheetRow(), month: TODAY, total: 1000 },
    { name: "무색상 미래 월", row: sheetRow(), month: "2026-09", total: 1000 },
  ]

  for (const { name, row, month, total } of cases) {
    it(`${name}: 캐논 confirmedMonthAmountWithColor와 동일`, () => {
      const source = toRevConfidenceSource(row)
      expect(ledgerMonthConfirmed(row, month, total, TODAY)).toBe(
        confirmedMonthAmountWithColor(source, month, total, dealHasColorData(source), TODAY),
      )
    })
  }

  it("무색상 시트행: 과거~당월 전액 확정, 미래 월 0 (직접 맵 합산의 과소집계 방지)", () => {
    const row = sheetRow()
    expect(ledgerMonthConfirmed(row, "2026-06", 1000, TODAY)).toBe(1000)
    expect(ledgerMonthConfirmed(row, TODAY, 1000, TODAY)).toBe(1000)
    expect(ledgerMonthConfirmed(row, "2026-08", 1000, TODAY)).toBe(0)
  })

  it("total===0만 단락, 음수 월(환불/차감)은 캐논에 위임한다 — 서버 파이프라인과 합계 일치", () => {
    expect(ledgerMonthConfirmed(sheetRow({ monthlyRed: { "2026-05": true } }), "2026-05", 0, TODAY)).toBe(0)
    // red 음수 월: 캐논은 전액(음수)을 확정으로 돌려준다 — pipeline.ts의 confirmed_revenue와 동일.
    expect(ledgerMonthConfirmed(sheetRow({ monthlyRed: { "2026-05": true } }), "2026-05", -500, TODAY)).toBe(
      confirmedMonthAmountWithColor({ monthly_red: { "2026-05": true } }, "2026-05", -500, true, TODAY),
    )
    // 무색상 과거 월 음수도 캐논 폴백 그대로.
    expect(ledgerMonthConfirmed(sheetRow(), "2026-05", -500, TODAY)).toBe(
      confirmedMonthAmountWithColor({}, "2026-05", -500, false, TODAY),
    )
  })
})

describe("ledgerMonthConfirmed — 초안행(확도 맵 정본)", () => {
  it("예정 초안(빈 맵)은 과거 월에도 확정 0 — 무색상 폴백 차단(확정·달성률 인플레 방지)", () => {
    const row = draftRow({ monthlyConfirmed: {}, monthlyHighConfidence: {}, monthlyRed: {} })
    expect(ledgerMonthConfirmed(row, "2026-05", 1000, TODAY)).toBe(0)
    expect(ledgerMonthConfirmed(row, TODAY, 1000, TODAY)).toBe(0)
  })

  it("확정 초안은 맵 금액 클램프 / red 전액 — 캐논 1·2순위 규칙 그대로", () => {
    const byMap = draftRow({ monthlyConfirmed: { "2026-05": 1000 }, monthlyRed: { "2026-05": true } })
    expect(ledgerMonthConfirmed(byMap, "2026-05", 800, TODAY)).toBe(800)
    const byRed = draftRow({ monthlyRed: { "2026-05": true } })
    expect(ledgerMonthConfirmed(byRed, "2026-05", 800, TODAY)).toBe(800)
  })

  it("고확도 초안은 확정 0 + 전액 고확도로 분해된다", () => {
    const row = draftRow({ monthlyHighConfidence: { "2026-05": 1000 } })
    expect(ledgerMonthSplit(row, "2026-05", 1000, TODAY)).toEqual({
      confirmed: 0,
      highConfidence: 1000,
      expected: 0,
    })
  })
})

describe("ledgerMonthSplit — 캐논 3분해 패리티", () => {
  it("시트행 분해는 splitMonthConfidence와 동일 (클램프 규칙 포함)", () => {
    const row = sheetRow({
      monthlyConfirmed: { "2026-05": 800 },
      monthlyHighConfidence: { "2026-05": 500 },
    })
    const source = toRevConfidenceSource(row)
    expect(ledgerMonthSplit(row, "2026-05", 1000, TODAY)).toEqual(
      splitMonthConfidence(source, "2026-05", 1000, dealHasColorData(source), TODAY),
    )
  })

  it("confirmed + highConfidence + expected = total 불변식", () => {
    const row = sheetRow({
      monthlyConfirmed: { "2026-05": 300 },
      monthlyHighConfidence: { "2026-05": 500 },
    })
    const split = ledgerMonthSplit(row, "2026-05", 1000, TODAY)
    expect(split.confirmed + split.highConfidence + split.expected).toBe(1000)
  })

  it("total<=0은 zero 분해를 돌려준다", () => {
    expect(ledgerMonthSplit(sheetRow(), "2026-05", 0, TODAY)).toEqual({
      confirmed: 0,
      highConfidence: 0,
      expected: 0,
    })
  })
})

describe("confidenceColorHint — 오버라이드 파생 행의 색 보유 보존", () => {
  it("색 맵을 로컬 삭제한 파생 행도 hint=true면 무색상 폴백이 꺼진다", () => {
    // 원본: 2026-05에만 red — 수정초안이 그 달을 대체하며 색 맵을 지운 파생 행.
    const derived = sheetRow({ monthlyRed: {}, confidenceColorHint: true })
    // hint 없이 재판정하면 무색상 폴백으로 과거 월이 확정 오집계된다.
    expect(ledgerMonthConfirmed(sheetRow({ monthlyRed: {} }), "2026-06", 1000, TODAY)).toBe(1000)
    expect(ledgerMonthConfirmed(derived, "2026-06", 1000, TODAY)).toBe(0)
  })

  it("hint=false는 무색상 원본임을 못박아 폴백을 유지한다", () => {
    const derived = sheetRow({ confidenceColorHint: false })
    expect(ledgerMonthConfirmed(derived, "2026-06", 1000, TODAY)).toBe(1000)
  })
})

describe("ledgerRowHasColor 판정 우선순위", () => {
  it("초안행은 항상 true (hint·맵보다 우선)", () => {
    expect(ledgerRowHasColor(draftRow({ confidenceColorHint: false }))).toBe(true)
    expect(ledgerRowHasColor(draftRow())).toBe(true)
  })

  it("hint가 있으면 hint, 없으면 dealHasColorData 위임", () => {
    expect(ledgerRowHasColor(sheetRow({ confidenceColorHint: true }))).toBe(true)
    const colored = sheetRow({ monthlyConfirmed: { "2026-05": 1 } })
    expect(ledgerRowHasColor(colored)).toBe(dealHasColorData(toRevConfidenceSource(colored)))
    expect(ledgerRowHasColor(sheetRow())).toBe(false)
  })

  it("ledgerOrigin이 없는 행(딜 상세 모달 등)은 시트 의미론을 따른다", () => {
    const bare: LedgerConfidenceSource = { monthlyRed: { "2026-05": false } }
    // red:false 엔트리도 '색 데이터 있음' — 무표시 월은 확정 0 (red-미표시=확정 휴리스틱 금지)
    expect(ledgerRowHasColor(bare)).toBe(true)
    expect(ledgerMonthConfirmed(bare, "2026-05", 1000, TODAY)).toBe(0)
    expect(ledgerMonthConfirmed(bare, "2026-06", 1000, TODAY)).toBe(0)
  })
})
