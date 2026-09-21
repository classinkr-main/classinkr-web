import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import {
  buildMatrixPastePlan,
  buildPasteNewRowInputs,
  type MatrixPastePlan,
} from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 라운드 4 P1-5(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4) — 붙여넣기 이름
// 매칭 + 미매칭 이름 "새 행으로 생성" 프리뷰 회귀. buildMatrixPastePlan·buildPasteNewRowInputs는
// 순수 함수라 직접 구동한다. RevMatrixPasteDialog(JSX)는 이 저장소에 React 렌더 하네스가 없어
// (vitest.config.ts environment: "node") 다른 tests/branch/*.test.ts와 같은 소스 스캔 관례로 확인한다.

const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`)

function makeRow(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "row-x",
    customer: "테스트 고객",
    manager: "매니저",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: {},
    ...overrides,
  }
}

// plan은 "붙여넣을 값 없음"일 때만 null이라 각 테스트에서 널 케이스를 반복 처리하지 않도록 좁혀준다
// (non-null 단언 금지 — `!` 대신 이 헬퍼로 통과시킨다).
function assertPlan(plan: MatrixPastePlan | null): MatrixPastePlan {
  if (!plan) throw new Error("buildMatrixPastePlan returned null")
  return plan
}

// 표기 흔들림 매칭 대상("OO 학원" → "OO학원", customer-suggest.ts와 동일 예시) + 위치 투영 1행.
const rowA = makeRow({ id: "row-a", customer: "OO학원" })
// 순수 이름 매칭 대상(위치 투영에서는 두 번째 행).
const rowB = makeRow({ id: "row-b", customer: "새싹 어학원" })
// 같은 정규화 키를 가진 2행(같은 고객의 상품군별 행 등) — ambiguous 케이스.
const rowC1 = makeRow({ id: "row-c1", customer: "겹치는 고객", productVersion: "SW 라이선스" })
const rowC2 = makeRow({ id: "row-c2", customer: "겹치는 고객", productVersion: "HW 단말" })
const dealRows: LedgerRevenueRow[] = [rowA, rowB, rowC1, rowC2]

describe("buildMatrixPastePlan — 첫 열이 숫자면 기존 위치 투영과 동일(하위호환)", () => {
  it("positional 모드로 분류되고 앵커 행부터 아래로 그대로 투영한다", () => {
    const text = ["120000\t130000", "140000\t150000"].join("\n")
    const plan = assertPlan(buildMatrixPastePlan(text, { rowId: "row-a", month: "2026-01" }, dealRows, MONTHS, new Map()))
    expect(plan.mode).toBe("positional")
    expect(plan.matchedRowCount).toBe(0)
    expect(plan.ambiguousNames).toEqual([])
    expect(plan.unmatched).toEqual([])
    expect(plan.cells).toHaveLength(4)
    // r=0 → dealRows[0](row-a, 1·2월), r=1 → dealRows[1](row-b, 1·2월) — 화면(dealRows) 순서 그대로.
    expect(plan.cells[0]).toMatchObject({ rowId: "row-a", month: "2026-01", next: 120000, status: "apply" })
    expect(plan.cells[1]).toMatchObject({ rowId: "row-a", month: "2026-02", next: 130000, status: "apply" })
    expect(plan.cells[2]).toMatchObject({ rowId: "row-b", month: "2026-01", next: 140000, status: "apply" })
    expect(plan.cells[3]).toMatchObject({ rowId: "row-b", month: "2026-02", next: 150000, status: "apply" })
    expect(plan.applyCount).toBe(4)
  })
})

describe("buildMatrixPastePlan — 첫 열이 고객명이면 by-name 모드로 이름 매칭", () => {
  // 화면(dealRows) 순서와 다르게 배치 + 표기 흔들림("OO 학원") + 빈 칸 + ambiguous + unmatched(0 제외) 포함.
  const text = [
    "새싹 어학원\t500000\t600000",
    "OO 학원\t100000\t\t300000",
    "겹치는 고객\t999999",
    "신규 고객\t400000\t0\t250000",
  ].join("\n")
  const plan = assertPlan(buildMatrixPastePlan(text, { rowId: "row-a", month: "2026-03" }, dealRows, MONTHS, new Map()))

  it("by-name 모드로 분류된다", () => {
    expect(plan.mode).toBe("by-name")
  })

  it("행 순서가 화면과 달라도 이름으로 정확히 투영하고, 'OO 학원'이 'OO학원' 행에 매칭된다", () => {
    expect(plan.matchedRowCount).toBe(2)
    const ooCells = plan.cells.filter((cell) => cell.rowId === "row-a")
    expect(ooCells).toEqual([
      expect.objectContaining({ month: "2026-03", next: 100000, status: "apply" }),
      expect.objectContaining({ month: "2026-05", next: 300000, status: "apply" }),
    ])
    const saessakCells = plan.cells.filter((cell) => cell.rowId === "row-b")
    expect(saessakCells).toEqual([
      expect.objectContaining({ month: "2026-03", next: 500000, status: "apply" }),
      expect.objectContaining({ month: "2026-04", next: 600000, status: "apply" }),
    ])
    expect(plan.cells).toHaveLength(4)
    expect(plan.applyCount).toBe(4)
  })

  it("같은 정규화 키의 행이 2개면 ambiguousNames로 분류되고 셀을 만들지 않는다", () => {
    expect(plan.ambiguousNames).toEqual(["겹치는 고객"])
    expect(plan.cells.some((cell) => cell.rowId === "row-c1" || cell.rowId === "row-c2")).toBe(false)
  })

  it("매칭되는 행이 없는 이름은 월·금액을 보존한다(빈 칸·0 제외)", () => {
    expect(plan.unmatched).toEqual([
      {
        name: "신규 고객",
        cells: [
          { month: "2026-03", amount: 400000 },
          { month: "2026-05", amount: 250000 },
        ],
      },
    ])
  })
})

describe("buildPasteNewRowInputs — 승인된 미매칭 이름만 new-row 초안으로 뒤집는다", () => {
  const plan = assertPlan(
    buildMatrixPastePlan(
      ["신규 고객\t400000\t0\t250000", "다른 신규\t100000"].join("\n"),
      { rowId: "row-a", month: "2026-03" },
      dealRows,
      MONTHS,
      new Map(),
    ),
  )
  const context = {
    team: "BD",
    manager: "김지사",
    productCategory: "software" as const,
    confidence: "expected" as const,
    lens: "rev",
    period: "2026",
  }

  it("선택된 이름만, 월 1개당 초안 1건, kind:new-row, status 미포함으로 만든다", () => {
    const inputs = buildPasteNewRowInputs(plan, ["신규 고객"], context)
    // "신규 고객"의 보존 칸 2개(0 제외)만 — "다른 신규"는 미선택이라 제외된다.
    expect(inputs).toHaveLength(2)
    for (const input of inputs) {
      expect(input.kind).toBe("new-row")
      expect(input.customer).toBe("신규 고객")
      expect(input.manager).toBe("김지사")
      expect(input.team).toBe("BD")
      expect(input.note).toBe("")
      expect(input.sourceSheetRow).toBeNull()
      // status 생략 — new-row는 레일과 동일하게 3단(초안→체크→적용) 게이트를 유지한다(라운드 4 P0-2 D1(a)).
      expect(Object.prototype.hasOwnProperty.call(input, "status")).toBe(false)
    }
    const byMonth = new Map(inputs.map((input) => [input.month, input.amount]))
    expect(byMonth.get("2026-03")).toBe(400000)
    expect(byMonth.get("2026-05")).toBe(250000)
  })

  it("metadata 키 집합·값이 스펙과 일치한다", () => {
    const [input] = buildPasteNewRowInputs(plan, ["신규 고객"], context)
    expect(Object.keys(input.metadata ?? {}).sort()).toEqual(
      [
        "source",
        "origin",
        "lens",
        "period",
        "team",
        "operation",
        "productCategory",
        "fromMonth",
        "week",
        "weekly",
        "weeklyConfidence",
        "confidence",
        "quantity",
        "sourceDealId",
      ].sort(),
    )
    expect(input.metadata).toMatchObject({
      source: "sales-ledger-workbench",
      origin: "rev-matrix-paste",
      lens: "rev",
      period: "2026",
      team: "BD",
      operation: "forecast-add",
      productCategory: "software",
      fromMonth: input.month,
      week: "month",
      weekly: null,
      weeklyConfidence: null,
      confidence: "expected",
      quantity: null,
      sourceDealId: null,
    })
  })

  it("선택하지 않은 이름은 초안이 되지 않는다", () => {
    expect(buildPasteNewRowInputs(plan, [], context)).toEqual([])
    expect(buildPasteNewRowInputs(plan, ["다른 신규"], context)).toHaveLength(1)
  })
})

describe("buildMatrixPastePlan — 예산 상한(MATRIX_PASTE_MAX_CELLS=600)은 매칭+미매칭 합산", () => {
  it("매칭 셀과 미매칭 보존 셀을 합쳐 600칸에서 자르고 초과분은 범위 밖으로 집계한다", () => {
    const ooLine = ["OO 학원", ...MONTHS.map((_, i) => String(10_000 + i))].join("\t") // 매칭 12칸
    const saessakLine = ["새싹 어학원", ...MONTHS.map((_, i) => String(20_000 + i))].join("\t") // 매칭 12칸
    const fakeLines = Array.from({ length: 590 }, (_, i) => `새 고객 ${i}\t${1000 + i}`) // 미매칭 각 1칸
    const text = [ooLine, saessakLine, ...fakeLines].join("\n")
    const plan = assertPlan(buildMatrixPastePlan(text, { rowId: "row-a", month: "2026-01" }, dealRows, MONTHS, new Map()))
    expect(plan.mode).toBe("by-name")
    expect(plan.nonNumericCount).toBe(0)
    expect(plan.cells).toHaveLength(24) // 매칭 2행 × 12개월
    const preservedUnmatchedCells = plan.unmatched.reduce((sum, row) => sum + row.cells.length, 0)
    // 매칭 24칸 + 미매칭 시도 590칸 중 남은 예산(600-24=576)만 통과 — 합산 상한.
    expect(plan.cells.length + preservedUnmatchedCells).toBe(600)
    expect(preservedUnmatchedCells).toBe(576)
    expect(plan.outOfRangeCount).toBe(14) // 590 시도 - 576 성공
  })
})

describe("RevMatrixPasteDialog 소스 스캔 — 새 행 프리뷰 UI(라운드 4 P1-5, React 렌더 하네스가 없어 소스 스캔 관례)", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/branch/ledger/RevMatrix.tsx"), "utf8")

  it("onConfirm이 새 행 선택(newRowNames)을 실어 보낸다", () => {
    expect(source).toContain("newRowNames")
  })

  it("시트에 없는 고객 섹션을 렌더한다", () => {
    expect(source).toContain("시트에 없는 고객")
  })

  it("전체 선택/해제 토글을 렌더한다", () => {
    expect(source).toContain("모두 선택")
  })
})
