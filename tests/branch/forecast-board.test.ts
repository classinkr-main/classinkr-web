// 주차 Forecast 보드(렌즈 "board", Board-1b 이식) — 카드 배치·확도 톤·스칼라 회귀.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 순수 빌더 직접 검증 +
// 소스 스캔 관례를 따른다(crm-sync-strip.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import {
  buildForecastBoardModel,
  FORECAST_BOARD_COLUMN_CAP,
  FORECAST_WEEK_RANGE_LABELS,
} from "@/components/admin/branch/ledger/ForecastBoard"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const MONTH = "2026-07"

// confidenceColorHint: true — 무색상 폴백(과거월 전액 확정, 오늘 날짜 의존)을 꺼서 테스트를
// 결정적으로 만든다(revenue-core ledgerRowHasColor 규약).
function sheetRow(overrides: Partial<LedgerRevenueRow> & { id: string; customer: string }): LedgerRevenueRow {
  return {
    manager: "Han",
    team: "BD",
    region: "서울",
    revenue: 0,
    ledgerOrigin: "sheet",
    confidenceColorHint: true,
    ...overrides,
  } as LedgerRevenueRow
}

const ROWS: LedgerRevenueRow[] = [
  // 주차 명시 입력 + 전액 확정 → W1·W3 카드, confirmed 톤.
  sheetRow({
    id: "r-explicit",
    customer: "주차명시학원",
    monthlyPayments: { [MONTH]: 4000 },
    weeklyPayments: { [MONTH]: [1000, 0, 3000, 0, 0] },
    monthlyConfirmed: { [MONTH]: 4000 },
  }),
  // 주차 미입력 + firstPayment 22일 → W4(추정) 카드, expected 톤.
  sheetRow({
    id: "r-inferred",
    customer: "추정배치학원",
    firstPayment: "2026-07-22",
    monthlyPayments: { [MONTH]: 10000 },
  }),
  // 주차·일자 모두 없음 + 고확도 → 월합계만 칼럼, high-confidence 톤.
  sheetRow({
    id: "r-month-only",
    customer: "월합계만학원",
    monthlyPayments: { [MONTH]: 5000 },
    monthlyHighConfidence: { [MONTH]: 5000 },
  }),
  // 적용 초안(장부 입력) 행 — W2 확정 카드 + draft 플래그.
  sheetRow({
    id: "r-draft",
    customer: "초안학원",
    ledgerOrigin: "draft",
    draftMonth: MONTH,
    revenue: 2000,
    monthlyPayments: { [MONTH]: 2000 },
    weeklyPayments: { [MONTH]: [0, 2000, 0, 0, 0] },
    monthlyConfirmed: { [MONTH]: 2000 },
  }),
]

describe("buildForecastBoardModel — 카드 배치·확도 톤", () => {
  const model = buildForecastBoardModel(ROWS, MONTH)
  const byId = Object.fromEntries(model.columns.map((column) => [column.id, column]))

  it("칼럼 구성은 W1~W5 + 월합계만(주차 미배정 분리) 6칸이다", () => {
    expect(model.columns.map((column) => column.id)).toEqual(["w1", "w2", "w3", "w4", "w5", "month-only"])
    expect(FORECAST_WEEK_RANGE_LABELS).toHaveLength(5)
    expect(FORECAST_BOARD_COLUMN_CAP).toBeGreaterThan(0)
  })

  it("주차 명시 행은 금액이 있는 주차에만 카드가 놓인다(확정 톤)", () => {
    expect(byId.w1.cards.map((card) => [card.rowId, card.amount, card.confidence])).toEqual([
      ["r-explicit", 1000, "confirmed"],
    ])
    expect(byId.w3.cards.map((card) => [card.rowId, card.amount])).toEqual([["r-explicit", 3000]])
    expect(byId.w1.total).toBe(1000)
    expect(byId.w3.total).toBe(3000)
  })

  it("firstPayment 22일 행은 W4에 추정 배치되고 예정 톤이다", () => {
    const card = byId.w4.cards.find((item) => item.rowId === "r-inferred")
    expect(card).toMatchObject({ amount: 10000, inferred: true, confidence: "expected" })
  })

  it("주차 정보가 없는 행은 실주차와 섞이지 않고 월합계만 칼럼으로 간다", () => {
    expect(byId["month-only"].cards.map((card) => [card.rowId, card.confidence])).toEqual([
      ["r-month-only", "high-confidence"],
    ])
    expect(byId["month-only"].total).toBe(5000)
  })

  it("적용 초안 행은 draft 플래그를 달고 초안 확도 맵을 정본으로 쓴다", () => {
    const card = byId.w2.cards.find((item) => item.rowId === "r-draft")
    expect(card).toMatchObject({ draft: true, confidence: "confirmed", amount: 2000 })
  })

  it("월 스칼라는 행 합계와 확도 분해를 보존한다", () => {
    expect(model.dealCount).toBe(4)
    expect(model.monthTotal).toBe(21000)
    expect(model.monthConfirmed).toBe(6000)
    expect(model.monthHighConfidence).toBe(5000)
    expect(model.monthOpen).toBe(10000)
  })

  it("칼럼 내 카드는 금액 내림차순 정렬이다", () => {
    const amounts = byId.w4.cards.map((card) => card.amount)
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
  })

  it("선택월에 금액이 없으면 빈 모델을 돌려준다", () => {
    const empty = buildForecastBoardModel(ROWS, "2026-03")
    expect(empty.dealCount).toBe(0)
    expect(empty.monthTotal).toBe(0)
    expect(empty.columns.every((column) => column.cards.length === 0)).toBe(true)
  })
})

describe("SalesLedgerWorkbench — 보드 렌즈 배선 규약(소스 스캔)", () => {
  // 모듈-레벨 상수(LENSES 등)는 ledger/workbench-shared로 물리 이동(2026-08-28 분해) —
  // 계약은 화면 단위로 유지해야 하므로 본체 + 분해 모듈을 합쳐 검사한다.
  const workbenchSource = [
    readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8"),
    readFileSync(join(process.cwd(), "components/admin/branch/ledger/workbench-shared.tsx"), "utf8"),
  ].join("\n")

  it("LENSES에 board 렌즈가 있고 URL ?lens=board 복원을 허용한다", () => {
    expect(workbenchSource).toContain('{ id: "board", label: "보드"')
    expect(workbenchSource).toContain('lensParam === "board"')
  })

  it("board 렌즈 패널은 REV와 같은 filteredRows 모집단으로 ForecastBoard를 렌더한다", () => {
    expect(workbenchSource).toContain('{lens === "board" && (')
    expect(workbenchSource).toMatch(/<ForecastBoard[\s\S]*?rows=\{filteredRows\}/)
  })

  it("상세 레일은 raw not_found 리터럴을 사용자에게 그대로 노출하지 않는다", () => {
    expect(workbenchSource).toContain('message === "not_found"')
  })
})
